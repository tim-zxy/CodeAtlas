using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

// Pure metadata policy. No acquisition, launch, handle, process or file operations.
public sealed class MixedNativeControlCodec {
 const long Safe=9007199254740991L;
 const string Prefix="CA_MIXED_NATIVE_CONTROL_V1";
 readonly string context; readonly long frameLimit,totalLimit,countLimit;
 long rx,tx,rxBytes,txBytes; bool failed;
 public sealed class Frame {
  public readonly string Type; readonly string[] fields;
  internal Frame(string type,string[] values){Type=type;fields=(string[])values.Clone();}
  public string Get(int index){return fields[index];}
 }
 internal static void Need(bool value){if(!value)throw new InvalidOperationException("INVALID_MIXED_NATIVE_OBSERVER");}
 internal static bool Id(string v){return v!=null&&Regex.IsMatch(v,@"\A[A-Za-z0-9_-]+\z");}
 internal static bool Sha(string v){return v!=null&&v.Length==64&&Regex.IsMatch(v,@"\A[a-f0-9]{64}\z");}
 internal static long Number(string value,bool positive){long n;Need(value!=null&&Regex.IsMatch(value,@"\A-?(?:0|[1-9][0-9]*)\z")&&long.TryParse(value,NumberStyles.AllowLeadingSign,CultureInfo.InvariantCulture,out n));n=long.Parse(value,CultureInfo.InvariantCulture);Need(n>=-Safe&&n<=Safe&&n.ToString(CultureInfo.InvariantCulture)==value&&(!positive||n>0));return n;}
 static string[] Schema(string type){switch(type){
  case "INTENT":case "READY":return new[]{"id","role","sha"};
  case "SPAWNED":return new[]{"id","pid"};
  case "ACQUIRED":return new[]{"id","role","pid","sha","id","bool"};
  case "CLOSED":return new[]{"id","pid","id","integer?","signal?"};
  case "RELEASED":return new[]{"id","pid","sha","id","bool","bool","bool","bool","query","positive?"};
  case "ABANDON":return new[]{"id"};case "ABANDONED":return new[]{"id","bool","bool"};
  default:throw new InvalidOperationException("INVALID_MIXED_NATIVE_OBSERVER");}}
 static void Token(string value,string type){
  if(type.EndsWith("?",StringComparison.Ordinal)&&value=="~")return;
  switch(type){
   case "id":Need(Id(value));break;case "sha":Need(Sha(value));break;
   case "role":Need(value=="GIT"||value=="V2"||value=="V5");break;
   case "bool":Need(value=="0"||value=="1");break;
   case "query":Need(value=="RECORDED"||value=="FAILED");break;
   case "pid":Need(Number(value,true)<=uint.MaxValue);break;
   case "integer?":Number(value,false);break;case "positive?":Number(value,true);break;
   case "signal?":Need(value!=null&&Regex.IsMatch(value,@"\ASIG[A-Z0-9]+\z"));break;
   default:Need(false);break;
  }
 }
 static void Body(string type,string[] fields){var schema=Schema(type);Need(fields!=null&&fields.Length==schema.Length);for(int i=0;i<fields.Length;i++)Token(fields[i],schema[i]);if(type=="RELEASED")Need(fields[8]=="RECORDED"?fields[9]!="~":fields[9]=="~");}
 public MixedNativeControlCodec(string contextSha,long maxFrameBytes,long maxTotalBytes,long maxFrames){Need(Sha(contextSha)&&maxFrameBytes>0&&maxFrameBytes<=int.MaxValue&&maxTotalBytes>0&&maxTotalBytes<=Safe&&maxFrames>0&&maxFrames<=Safe);context=contextSha;frameLimit=maxFrameBytes;totalLimit=maxTotalBytes;countLimit=maxFrames;}
 public string Encode(string type,string[] fields){try{Need(!failed&&tx<countLimit);Body(type,fields);long length=Prefix.Length+context.Length+(tx+1).ToString(CultureInfo.InvariantCulture).Length+type.Length+4;foreach(var f in fields)length=checked(length+f.Length+1);Need(length<=frameLimit&&length<=totalLimit-txBytes);var parts=new List<string>{Prefix,context,(tx+1).ToString(CultureInfo.InvariantCulture),type};parts.AddRange(fields);string line=String.Join("\t",parts)+"\n";Need(line.Length==length);tx++;txBytes+=length;return line;}catch{failed=true;throw new InvalidOperationException("INVALID_MIXED_NATIVE_OBSERVER");}}
 public Frame Decode(string line){try{Need(!failed&&line!=null&&line.Length<=frameLimit&&line.Length<=totalLimit-rxBytes&&rx<countLimit&&line.Length>0&&line[line.Length-1]=='\n');for(int i=0;i<line.Length;i++)Need(line[i]=='\t'||line[i]=='\n'&&i==line.Length-1||line[i]>=32&&line[i]<=126);var parts=line.Substring(0,line.Length-1).Split('\t');Need(parts.Length>=4&&parts[0]==Prefix&&parts[1]==context&&parts[2]==(rx+1).ToString(CultureInfo.InvariantCulture));var fields=parts.Skip(4).ToArray();Body(parts[3],fields);rx++;rxBytes+=line.Length;return new Frame(parts[3],fields);}catch{failed=true;throw new InvalidOperationException("INVALID_MIXED_NATIVE_OBSERVER");}}
}

public sealed class MixedNativeObserverPolicy {
 public sealed class Binding {
  public readonly string LaunchId,Role,CommandSha256,ImagePath,ImageSha256;
  public Binding(string id,string role,string commandSha,string imagePath,string imageSha){MixedNativeControlCodec.Need(MixedNativeControlCodec.Id(id)&&(role=="GIT"||role=="V2"||role=="V5")&&MixedNativeControlCodec.Sha(commandSha)&&MixedNativeControlCodec.Sha(imageSha));LaunchId=id;Role=role;CommandSha256=commandSha;ImagePath=FullPath(imagePath);ImageSha256=imageSha;}
 }
 sealed class Entry {public uint pid;public string created,path,sha;public bool exited,released,breakpoint;public string query;public long? peak;}
 sealed class Launch {public Binding binding;public Entry entry;public uint? ownerPid;public bool nodeClosed;public long? code;public string signal;}
 public sealed class State {
  public readonly string status;public readonly bool complete,cleanupComplete,measurementEligible=false,executionAuthorized=false,productionAdmission=false;
  public readonly int knownProcesses,settledLaunches,remainingLaunches;
  internal State(bool done,bool clean,bool failed,int known,int settled,int remaining){complete=done;cleanupComplete=clean;status=failed?"OFFLINE_FAILED":done?"OFFLINE_COMPLETE_UNQUALIFIED":"OFFLINE_PENDING";knownProcesses=known;settledLaunches=settled;remainingLaunches=remaining;}
 }
 readonly MixedNativeControlCodec codec;readonly uint hostPid;readonly string hostPath,hostSha;readonly Binding[] bindings;
 readonly List<Entry> children=new List<Entry>();Entry root;Launch active;int next,settled;bool faulted,untracked,inputClosed;
 static void Need(bool v){MixedNativeControlCodec.Need(v);}
 static string FullPath(string value){Need(!String.IsNullOrEmpty(value)&&value.IndexOf('\0')<0&&((value.Length>=3&&Char.IsLetter(value[0])&&value[1]==':'&&(value[2]=='\\'||value[2]=='/'))||value.StartsWith(@"\\",StringComparison.Ordinal)));return Path.GetFullPath(value);}
 static bool SamePath(string a,string b){return String.Equals(FullPath(a),FullPath(b),StringComparison.OrdinalIgnoreCase);}
 static string Text(long n){return n.ToString(CultureInfo.InvariantCulture);}
 static void Query(string status,long? peak){Need(status=="RECORDED"?peak.HasValue&&peak.Value>0&&peak.Value<=9007199254740991L:status=="FAILED"&&!peak.HasValue);}
 public MixedNativeObserverPolicy(string context,uint expectedHostPid,string expectedHostPath,string expectedHostSha,Binding[] planned,long maxFrameBytes,long maxTotalBytes,long maxFrames){
  Need(expectedHostPid>0&&MixedNativeControlCodec.Sha(expectedHostSha)&&planned!=null);hostPid=expectedHostPid;hostPath=FullPath(expectedHostPath);hostSha=expectedHostSha;
  codec=new MixedNativeControlCodec(context,maxFrameBytes,maxTotalBytes,maxFrames);var ids=new HashSet<string>(StringComparer.Ordinal);bindings=planned.Select(b=>{Need(b!=null&&ids.Add(b.LaunchId));return new Binding(b.LaunchId,b.Role,b.CommandSha256,b.ImagePath,b.ImageSha256);}).ToArray();
 }
 public void CaptureHostBeforeContinue(uint pid,string created,string imagePath,string imageSha,bool capturedBeforeContinue){try{Need(!faulted&&root==null&&capturedBeforeContinue&&pid==hostPid&&MixedNativeControlCodec.Id(created)&&SamePath(imagePath,hostPath)&&imageSha==hostSha);root=new Entry{pid=pid,created=created,path=FullPath(imagePath),sha=imageSha};}catch{faulted=true;untracked=true;throw new InvalidOperationException("INVALID_MIXED_NATIVE_OBSERVER");}}
 public string CaptureChildBeforeContinue(uint pid,string created,string imagePath,string imageSha,bool capturedBeforeContinue){try{
  Need(!faulted&&root!=null&&!root.exited&&capturedBeforeContinue&&active!=null&&active.entry==null&&pid>0&&pid!=hostPid&&MixedNativeControlCodec.Id(created));
  Need(children.All(e=>e.exited&&e.released)&&!children.Any(e=>e.pid==pid&&e.created==created)&&(!active.ownerPid.HasValue||active.ownerPid.Value==pid));
  Need(SamePath(imagePath,active.binding.ImagePath)&&imageSha==active.binding.ImageSha256);
  var entry=new Entry{pid=pid,created=created,path=FullPath(imagePath),sha=imageSha};children.Add(entry);active.entry=entry;
  return codec.Encode("ACQUIRED",new[]{active.binding.LaunchId,active.binding.Role,Text(pid),imageSha,created,"1"});
 }catch{faulted=true;untracked=true;throw new InvalidOperationException("INVALID_MIXED_NATIVE_OBSERVER");}}
 string ReleaseIfReady(){
  if(active==null||active.entry==null||!active.nodeClosed||!active.entry.exited)return null;
  var e=active.entry;bool clean=e.released&&!untracked;var b=active.binding;
  string reply=codec.Encode("RELEASED",new[]{b.LaunchId,Text(e.pid),e.sha,e.created,e.exited?"1":"0",e.released?"1":"0",untracked?"1":"0",clean?"1":"0",e.query,e.peak.HasValue?Text(e.peak.Value):"~"});
  if(!clean||e.query!="RECORDED"||active.signal!="~"||!(active.code==0||b.Role=="GIT"&&active.code==1))faulted=true;
  active=null;settled++;return reply;
 }
 public string[] Receive(string line){try{
  Need(!inputClosed);var f=codec.Decode(line);var output=new List<string>();
  if(f.Type=="INTENT"){
   Need(!faulted&&root!=null&&!root.exited&&active==null&&next<bindings.Length&&children.All(e=>e.exited&&e.released));var b=bindings[next];Need(f.Get(0)==b.LaunchId&&f.Get(1)==b.Role&&f.Get(2)==b.CommandSha256);next++;active=new Launch{binding=b};output.Add(codec.Encode("READY",new[]{b.LaunchId,b.Role,b.CommandSha256}));
  }else if(f.Type=="SPAWNED"){
   Need(active!=null&&f.Get(0)==active.binding.LaunchId&&!active.ownerPid.HasValue);uint pid=(uint)MixedNativeControlCodec.Number(f.Get(1),true);if(active.entry!=null&&active.entry.pid!=pid){untracked=true;Need(false);}active.ownerPid=pid;if(root!=null&&root.exited&&active.entry==null)untracked=true;
  }else if(f.Type=="CLOSED"){
   Need(active!=null&&active.entry!=null&&active.ownerPid.HasValue&&!active.nodeClosed&&f.Get(0)==active.binding.LaunchId&&f.Get(1)==Text(active.entry.pid)&&f.Get(2)==active.entry.created);active.nodeClosed=true;active.code=f.Get(3)=="~"?(long?)null:MixedNativeControlCodec.Number(f.Get(3),false);active.signal=f.Get(4);string reply=ReleaseIfReady();if(reply!=null)output.Add(reply);
  }else if(f.Type=="ABANDON"){
   Need(active!=null&&f.Get(0)==active.binding.LaunchId);if(active.ownerPid.HasValue&&active.entry==null)untracked=true;bool clean=!untracked&&(active.entry==null||active.entry.exited&&active.entry.released);output.Add(codec.Encode("ABANDONED",new[]{active.binding.LaunchId,untracked?"1":"0",clean?"1":"0"}));faulted=true;active=null;
  }else Need(false);
  return output.ToArray();
 }catch{faulted=true;throw new InvalidOperationException("INVALID_MIXED_NATIVE_OBSERVER");}}
 public string RecordChildExitAndRelease(uint pid,string created,bool osExited,bool handleReleased,string query,long? peak){try{
  var entry=children.SingleOrDefault(e=>e.pid==pid&&e.created==created);if(entry==null){untracked=true;Need(false);}Need(!entry.exited);Query(query,peak);entry.exited=osExited;entry.released=handleReleased;entry.query=query;entry.peak=peak;if(!osExited||!handleReleased||query!="RECORDED")faulted=true;return ReleaseIfReady();
 }catch{faulted=true;throw new InvalidOperationException("INVALID_MIXED_NATIVE_OBSERVER");}}
 public void RecordHostExitAndRelease(string created,long exitCode,bool osExited,bool handleReleased,string query,long? peak){try{if(root==null||root.created!=created){untracked=true;Need(false);}Need(!root.exited);if(children.Any(e=>!e.exited))faulted=true;if(active!=null&&active.ownerPid.HasValue&&active.entry==null)untracked=true;Query(query,peak);root.exited=osExited;root.released=handleReleased;root.query=query;root.peak=peak;if(exitCode!=0||!osExited||!handleReleased||query!="RECORDED")faulted=true;}catch{faulted=true;throw new InvalidOperationException("INVALID_MIXED_NATIVE_OBSERVER");}}
 public void RecordException(uint pid,uint exception,uint firstChance){try{var e=root!=null&&root.pid==pid&&!root.exited?root:children.SingleOrDefault(x=>x.pid==pid&&!x.exited);if(e==null){untracked=true;Need(false);}Need(exception==2147483651u&&firstChance==1&&!e.breakpoint);e.breakpoint=true;}catch{faulted=true;throw new InvalidOperationException("INVALID_MIXED_NATIVE_OBSERVER");}}
 public void CloseControlInput(bool completeFrame){inputClosed=true;if(!completeFrame)faulted=true;}
 public State Snapshot(){bool clean=root!=null&&root.exited&&root.released&&!untracked&&children.All(e=>e.exited&&e.released);bool done=clean&&inputClosed&&!faulted&&active==null&&next==bindings.Length&&settled==bindings.Length;return new State(done,clean,faulted,children.Count+(root==null?0:1),settled,bindings.Length-next);}
}
