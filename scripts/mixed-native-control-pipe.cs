using System;
using System.IO;
using System.Threading.Tasks;

// Explicitly owned anonymous-root Stream seam. Tests supply only MemoryStream.
// Stop observes workers; it cannot promise to unblock an arbitrary Stream.
public sealed class MixedNativeControlPipe:MixedNativeObserverLoop.IControlPipe {
 readonly object gate=new object();readonly Stream input,output;readonly MixedNativeControlMailbox mailbox;readonly int readBufferBytes;
 Task reader,writer,closer;bool started,stopping,failed;
 const string Error="MIXED_NATIVE_CONTROL_PIPE_FAILED";
 static void Need(bool b){if(!b)throw new InvalidOperationException(Error);}
 public MixedNativeControlPipe(Stream input,Stream output,MixedNativeControlMailbox mailbox,int readBufferBytes){Need(input!=null&&output!=null&&!Object.ReferenceEquals(input,output)&&mailbox!=null&&readBufferBytes>0&&input.CanRead&&output.CanWrite);this.input=input;this.output=output;this.mailbox=mailbox;this.readBufferBytes=readBufferBytes;}
 void Fault(){lock(gate){if(stopping)return;failed=true;}mailbox.Fail();}
 public void Start(){lock(gate){Need(!started&&!stopping);started=true;reader=Task.Run(()=>{
   try{var buffer=new byte[readBufferBytes];for(;;){lock(gate){if(stopping)return;}int n=input.Read(buffer,0,buffer.Length);lock(gate){if(stopping)return;}if(n==0){mailbox.CloseInput();return;}mailbox.Feed(buffer,0,n);}}
   catch{Fault();}
  });}}
 public void BeginWrite(byte[] bytes){Need(bytes!=null&&bytes.Length>0);lock(gate){Need(started&&!stopping&&!failed&&(writer==null||writer.IsCompleted));var owned=(byte[])bytes.Clone();writer=Task.Run(()=>{try{output.Write(owned,0,owned.Length);output.Flush();}catch{Fault();}});}}
 public MixedNativeObserverLoop.WriteStatus PollWrite(){lock(gate){Need(writer!=null);return failed?MixedNativeObserverLoop.WriteStatus.Failed:writer.IsCompleted?MixedNativeObserverLoop.WriteStatus.Complete:MixedNativeObserverLoop.WriteStatus.Pending;}}
 public void Stop(){lock(gate){if(stopping)return;stopping=true;closer=Task.Run(()=>{try{input.Dispose();}catch{lock(gate){failed=true;}}try{output.Dispose();}catch{lock(gate){failed=true;}}});}}
 Task[] Tasks(){lock(gate){var list=new System.Collections.Generic.List<Task>();if(reader!=null)list.Add(reader);if(writer!=null)list.Add(writer);if(closer!=null)list.Add(closer);return list.ToArray();}}
 public bool WaitForWorkers(uint milliseconds){var tasks=Tasks();try{return Task.WaitAll(tasks,(int)Math.Min(milliseconds,(uint)int.MaxValue));}catch{lock(gate){failed=true;}mailbox.Fail();return false;}}
 public bool WorkersComplete{get{foreach(var task in Tasks())if(!task.IsCompleted)return false;return true;}}
 public bool ReadyToComplete{get{return mailbox.Snapshot().inputClosed&&!Failed;}}
 public bool Failed{get{lock(gate){return failed;}}}
}
