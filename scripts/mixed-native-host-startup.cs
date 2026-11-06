using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Threading.Tasks;

// Fixed private launch metadata, never execution approval or file authentication.
public sealed class MixedNativeHostLaunchPlan {
 public readonly string NodePath,ScriptPath,ManifestPath,ManifestSha256,NodeSha256,ScriptSha256,WorkingDirectory,CommandLine,EnvironmentBlock;
 public readonly bool executionAuthorized=false,productionAdmission=false,measurementEligible=false;
 internal static void Need(bool b){if(!b)throw new InvalidOperationException("INVALID_MIXED_NATIVE_HOST_STARTUP");}
 static bool Sha(string s){return s!=null&&Regex.IsMatch(s,@"\A[a-f0-9]{64}\z");}
 static string Local(string s){Need(!String.IsNullOrEmpty(s)&&s.Length>=3&&Char.IsLetter(s[0])&&s[1]==':'&&(s[2]=='/'||s[2]=='\\')&&s.IndexOf('\0')<0&&s.IndexOf(':',2)<0&&s.IndexOf('"')<0);return Path.GetFullPath(s);}
 static string Quote(string s){Need(!s.EndsWith("\\",StringComparison.Ordinal));return "\""+s+"\"";}
 public MixedNativeHostLaunchPlan(string node,string script,string manifest,string manifestSha,string nodeSha,string scriptSha,string cwd,string[] environment,int maxCharacters){
  Need(maxCharacters>0&&environment!=null&&Sha(manifestSha)&&Sha(nodeSha)&&Sha(scriptSha));
  NodePath=Local(node);ScriptPath=Local(script);ManifestPath=Local(manifest);WorkingDirectory=Local(cwd);Need(NodePath.EndsWith(".exe",StringComparison.OrdinalIgnoreCase)&&ScriptPath.EndsWith(".mjs",StringComparison.OrdinalIgnoreCase)&&ManifestPath.EndsWith(".json",StringComparison.OrdinalIgnoreCase));
  ManifestSha256=manifestSha;NodeSha256=nodeSha;ScriptSha256=scriptSha;
  long total=(long)NodePath.Length+ScriptPath.Length+ManifestPath.Length+WorkingDirectory.Length+manifestSha.Length+nodeSha.Length+scriptSha.Length;var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);var entries=new List<string>();
  foreach(var item in environment){Need(item!=null&&item.IndexOf('\0')<0);int eq=item.IndexOf('=');Need(eq>0&&names.Add(item.Substring(0,eq)));total=checked(total+item.Length+1);Need(total<=maxCharacters);entries.Add(item.Substring(0,eq).ToUpperInvariant()+item.Substring(eq));}
  CommandLine=Quote(NodePath)+" "+Quote(ScriptPath)+" "+Quote(ManifestPath)+" "+Quote(manifestSha);EnvironmentBlock=String.Join("\0",entries.OrderBy(x=>x,StringComparer.Ordinal))+"\0\0";Need(total<=maxCharacters&&(long)CommandLine.Length+EnvironmentBlock.Length+WorkingDirectory.Length<=maxCharacters);
 }
}

// Only locally owned startup handles are closed here. Debugger aliases are distinct.
public sealed class MixedNativeHostHandleLedger {
 public enum Role {RootProcess,RootThread,ToHost,FromHost,Stderr,ChildStdin,ChildStdout,ChildStderr}
 sealed class Handle {public long value;public bool attempted,released,debugger;}
 public sealed class State {public readonly bool allReleased,failed;public readonly int locallyPending,debuggerPending;internal State(bool released,bool failed,int local,int debug){allReleased=released;this.failed=failed;locallyPending=local;debuggerPending=debug;}}
 readonly Dictionary<Role,Handle> handles=new Dictionary<Role,Handle>();readonly Func<long,bool> close;bool failed;long debuggerRoot;
 public MixedNativeHostHandleLedger(Func<long,bool> close){MixedNativeHostLaunchPlan.Need(close!=null);this.close=close;}
 public void Keep(Role role,long value){if(!Enum.IsDefined(typeof(Role),role)||value<=0||handles.ContainsKey(role)||handles.Values.Any(h=>h.value==value)){failed=true;MixedNativeHostLaunchPlan.Need(false);}handles.Add(role,new Handle{value=value});}
 public long Get(Role role){Handle h;return handles.TryGetValue(role,out h)&&!h.attempted&&!h.debugger?h.value:0;}
 public void Close(Role role){Handle h;if(!handles.TryGetValue(role,out h)||h.attempted||h.debugger)return;h.attempted=true;try{h.released=close(h.value);}catch{h.released=false;}if(!h.released)failed=true;}
 void Observe(Role role,long eventHandle){Handle h;if(!handles.TryGetValue(role,out h)||h.attempted)return;if(h.value==eventHandle)h.debugger=true;else Close(role);}
 public void ObserveRootCreate(long process,long thread){if(process>0){debuggerRoot=process;Observe(Role.RootProcess,process);}else failed=true;Observe(Role.RootThread,thread);}
 public long BorrowRootForAbort(){long local=Get(Role.RootProcess);return local!=0?local:debuggerRoot;}
 public void DebuggerExitContinued(){debuggerRoot=0;foreach(var h in handles.Values.Where(x=>x.debugger)){h.released=true;}}
 public void CloseAll(){foreach(var role in handles.Keys.ToArray())Close(role);}
 public State Snapshot(){int local=handles.Values.Count(h=>!h.debugger&&!h.released),debug=handles.Values.Count(h=>h.debugger&&!h.released);if(debuggerRoot!=0&&!handles.Values.Any(h=>h.debugger&&h.value==debuggerRoot&&!h.released))debug++;return new State(!failed&&local==0&&debug==0,failed,local,debug);}
}

// Count/hash bounded stderr without retaining diagnostic content. Empty EOF is success.
public sealed class MixedNativeHostDiagnostics {
 public sealed class State {public readonly bool emptyComplete,failed,workersComplete,eof;public readonly long bytes;public readonly string sha256;internal State(bool complete,bool failed,bool workers,bool eof,long bytes,string sha){emptyComplete=complete;this.failed=failed;workersComplete=workers;this.eof=eof;this.bytes=bytes;sha256=sha;}}
 readonly object gate=new object();readonly Stream input;readonly long maxBytes;readonly int bufferBytes;Task reader,closer;bool started,stopping,failed,eof;long bytes;string digest;
 public MixedNativeHostDiagnostics(Stream input,long maxBytes,int bufferBytes){MixedNativeHostLaunchPlan.Need(input!=null&&input.CanRead&&maxBytes>0&&maxBytes<9007199254740991L&&bufferBytes>0);this.input=input;this.maxBytes=maxBytes;this.bufferBytes=bufferBytes;}
 public void Start(){lock(gate){MixedNativeHostLaunchPlan.Need(!started&&!stopping);started=true;reader=Task.Run(()=>{try{using(var sha=SHA256.Create()){var buffer=new byte[bufferBytes];for(;;){long used;lock(gate){if(stopping)return;used=bytes;}int count=(int)Math.Min(buffer.Length,maxBytes-used+1);int n=input.Read(buffer,0,count);lock(gate){if(stopping)return;bytes+=n;if(bytes>maxBytes){failed=true;return;}if(n==0){sha.TransformFinalBlock(new byte[0],0,0);digest=BitConverter.ToString(sha.Hash).Replace("-","").ToLowerInvariant();eof=true;return;}}sha.TransformBlock(buffer,0,n,buffer,0);}}}catch{lock(gate){if(!stopping)failed=true;}}});}}
 public void Stop(){lock(gate){if(stopping)return;stopping=true;closer=Task.Run(()=>{try{input.Dispose();}catch{lock(gate){failed=true;}}});}}
 Task[] Tasks(){lock(gate){return new[]{reader,closer}.Where(t=>t!=null).ToArray();}}
 public bool Wait(uint milliseconds){MixedNativeHostLaunchPlan.Need(milliseconds<uint.MaxValue);try{return Task.WaitAll(Tasks(),(int)Math.Min(milliseconds,(uint)int.MaxValue));}catch{lock(gate){failed=true;}return false;}}
 public State Snapshot(){lock(gate){bool workers=(reader==null||reader.IsCompleted)&&(closer==null||closer.IsCompleted);return new State(started&&eof&&!failed&&bytes==0,failed,workers,eof,bytes,digest);}}
}
