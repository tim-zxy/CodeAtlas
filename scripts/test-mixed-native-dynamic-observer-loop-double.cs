using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
public static class MixedNativeDynamicBoundedLoopUnit {
 static int passed;static long ordinal;static void Check(bool b,string label){if(!b)throw new Exception("UNIT_ASSERTION_FAILED:"+label);passed++;}
 sealed class Ops:MixedNativeDebugEventBridge.IOperations {
  public Action<MixedNativeDebugEventBridge.Event> onContinue;public int imagesClosed;public bool failContinue,throwContinue;public readonly List<string> actions=new List<string>();public int continued,terminated;public MixedNativeDebugEventBridge.Capture CaptureCreate(MixedNativeDebugEventBridge.Event e){actions.Add("capture");return new MixedNativeDebugEventBridge.Capture(e.Pid,"p"+e.Pid,e.Pid==100?"D:/fixture/node.exe":"D:/fixture/native.exe",new string(e.Pid==100?'b':'c',64),new object());}
  public bool CloseImage(MixedNativeDebugEventBridge.Event e){imagesClosed++;return true;}public bool Continue(MixedNativeDebugEventBridge.Event e,uint s){continued++;actions.Add("continue");if(throwContinue)throw new Exception("uncertain Continue");if(onContinue!=null)onContinue(e);return !failContinue;}
  public MixedNativeDebugEventBridge.ExitReceipt FinalizeExit(MixedNativeDebugEventBridge.Capture c){actions.Add("finalize");return new MixedNativeDebugEventBridge.ExitReceipt(c.Created,true,true,"RECORDED",4096);}
  public bool Terminate(MixedNativeDebugEventBridge.Capture c){terminated++;return true;}
 }
 sealed class Lane:MixedNativeDynamicObserverLoop.IWaitLane {
  public readonly Queue<Func<MixedNativeDebugEventBridge.Event>> steps=new Queue<Func<MixedNativeDebugEventBridge.Event>>();public uint left=1000;public bool cancel,rejectEmpty;public int waits;public Func<MixedNativeDebugEventBridge.Event> fallback;
  public uint RemainingMilliseconds{get{return left;}}public bool Cancelled{get{return cancel;}}
  public bool TryWait(uint milliseconds,out MixedNativeDebugEventBridge.Event ev){Check(milliseconds>0&&milliseconds<=left,"wait bounded");waits++;left--;if(rejectEmpty&&steps.Count==0)throw new Exception("no debuggee remains");ev=steps.Count>0?steps.Dequeue()():fallback!=null?fallback():null;return ev!=null;}
 }
 sealed class Pipe:MixedNativeDynamicObserverLoop.IControlPipe {
  public readonly List<string> frames=new List<string>();public bool ready=true;public bool failBegin,blocked,stopped,started,failStop,throwStop;public Action onWrite,onStop,onWaitWorkers;public int writes,waits;bool writing;
  public bool ReadyToComplete{get{return ready;}}public bool Failed{get{return stopped&&failStop;}}public bool WorkersComplete{get{return stopped&&!blocked;}}
  public void Start(){started=true;}public void BeginWrite(byte[] b){writes++;if(failBegin)throw new Exception("uncertain write");writing=true;frames.Add(Encoding.ASCII.GetString(b));if(onWrite!=null)onWrite();}
  public MixedNativeDynamicObserverLoop.WriteStatus PollWrite(){if(!writing)throw new Exception("no write");writing=false;return MixedNativeDynamicObserverLoop.WriteStatus.Complete;}
  public void Stop(){stopped=true;if(onStop!=null)onStop();if(throwStop)throw new Exception("stop uncertain");}public bool WaitForWorkers(uint milliseconds){waits++;if(onWaitWorkers!=null)onWaitWorkers();return WorkersComplete;}
 }
 // Test-only bounded memory transport. No handles, files or process acquisition.
 sealed class PeerInput:MemoryStream {
  readonly object gate=new object();readonly Queue<byte> bytes=new Queue<byte>();readonly Func<int> remaining;bool ended,closed;
  public PeerInput(Func<int> remaining){this.remaining=remaining;}
  public void Publish(string frame){lock(gate){if(ended||closed||bytes.Count+frame.Length>8192)throw new IOException("peer input refused");foreach(byte b in Encoding.ASCII.GetBytes(frame))bytes.Enqueue(b);System.Threading.Monitor.PulseAll(gate);}}
  public void Complete(){lock(gate){ended=true;System.Threading.Monitor.PulseAll(gate);}}
  public override int Read(byte[] buffer,int offset,int count){lock(gate){while(bytes.Count==0&&!ended&&!closed){int left=remaining();if(left<=0)throw new TimeoutException("peer input deadline");System.Threading.Monitor.Wait(gate,left);}if(closed||bytes.Count==0)return 0;int n=Math.Min(count,bytes.Count);for(int i=0;i<n;i++)buffer[offset+i]=bytes.Dequeue();return n;}}
  protected override void Dispose(bool disposing){lock(gate){closed=true;System.Threading.Monitor.PulseAll(gate);}base.Dispose(disposing);}
 }
 sealed class PeerOutput:MemoryStream {
  readonly Action<string> receive;public PeerOutput(Action<string> receive){this.receive=receive;}
  public override void Write(byte[] bytes,int offset,int count){base.Write(bytes,offset,count);receive(Encoding.ASCII.GetString(bytes,offset,count));}
 }
 sealed class WorkerLane:MixedNativeDynamicObserverLoop.IWaitLane {
  readonly object gate=new object();readonly Queue<MixedNativeDebugEventBridge.Event> events=new Queue<MixedNativeDebugEventBridge.Event>();readonly Func<int> remaining;
  public WorkerLane(Func<int> remaining){this.remaining=remaining;}
  public uint RemainingMilliseconds{get{return (uint)Math.Max(0,remaining());}}public bool Cancelled{get{return false;}}
  public void Publish(MixedNativeDebugEventBridge.Event ev){lock(gate){if(events.Count>=16)throw new IOException("peer event cap");events.Enqueue(ev);System.Threading.Monitor.PulseAll(gate);}}
  public bool TryWait(uint milliseconds,out MixedNativeDebugEventBridge.Event ev){lock(gate){if(events.Count==0)System.Threading.Monitor.Wait(gate,(int)Math.Min(milliseconds,RemainingMilliseconds));ev=events.Count==0?null:events.Dequeue();return ev!=null;}}
 }
 static void WorkerPeerChain(){
  ordinal=0;var clock=System.Diagnostics.Stopwatch.StartNew();Func<int> remaining=()=>Math.Max(0,3000-(int)clock.ElapsedMilliseconds);
  var box=Box();var lane=new WorkerLane(remaining);var input=new PeerInput(remaining);var peer=new MixedNativeDynamicControlCodec(H('a'),1024,65536,100);var seen=new List<string>();int stage=0;
  var output=new PeerOutput(line=>{var reply=peer.Decode(line);seen.Add(reply.Type);
   if(reply.Type=="BOUND"){Check(stage==1,"WORKER_PEER_BOUND");stage=2;input.Publish(peer.Encode("INTENT",new[]{"one","V2","ANALYSIS",H('f'),Hash(H('d'))}));}
   else if(reply.Type=="READY"){Check(stage==2,"WORKER_PEER_READY");stage=3;lane.Publish(E(3,200));}
   else if(reply.Type=="ACQUIRED"){Check(stage==3,"WORKER_PEER_ACQUIRED");stage=4;input.Publish(peer.Encode("SPAWNED",new[]{"one","200"})+peer.Encode("CLOSED",new[]{"one","200","p200","0","~"}));lane.Publish(E(5,200));}
   else if(reply.Type=="RELEASED"){Check(stage==4,"WORKER_PEER_RELEASED");stage=5;input.Complete();lane.Publish(E(5,100));}
   else throw new IOException("unexpected peer output");});
  var ops=new Ops();ops.onContinue=ev=>{if(ev.Kind==3&&ev.Pid==100){Check(stage==0,"WORKER_REGISTER_AFTER_HOST_CONTINUE");stage=1;input.Publish(peer.Encode("REGISTER",new[]{"one","V2","ANALYSIS",H('f'),Hash(H('0')),H('d'),Hash(H('d'))}));}};
  var slot=new MixedNativeDynamicObserverPolicy.Slot("one","V2","ANALYSIS",Hash(H('0')),Prefix,"D:/fixture/native.exe",H('c'));
  var policy=new MixedNativeDynamicObserverPolicy(H('a'),H('e'),100,"D:/fixture/node.exe",H('b'),new[]{slot},3001,1024,65536,100);
  var bridge=new MixedNativeDynamicDebugEventBridge(policy,100,ops,()=>1+clock.ElapsedMilliseconds);
  var pipe=new MixedNativeDynamicControlPipe(input,output,box,8);lane.Publish(E(3,100));
  var result=new MixedNativeDynamicObserverLoop(bridge,box,lane,pipe,5,1000).Run();
  Check(result.complete&&result.cleanupComplete&&!result.failed&&result.status=="OFFLINE_COMPLETE_UNQUALIFIED","WORKER_FULL_CHAIN_COMPLETE");
  Check(seen.SequenceEqual(new[]{"BOUND","READY","ACQUIRED","RELEASED"})&&stage==5,"WORKER_FULL_CHAIN_FRAMES");
  Check(ops.continued==4&&ops.imagesClosed==2&&ops.actions.Count(x=>x=="capture")==2&&ops.actions.Count(x=>x=="finalize")==2&&ops.terminated==0,"WORKER_FULL_CHAIN_SETTLEMENT_COUNTS");
  Check(pipe.WorkersComplete&&pipe.ReadyToComplete&&!pipe.Failed&&box.Snapshot().inputClosed&&box.Snapshot().queuedInputFrames==0&&box.Snapshot().queuedOutputFrames==0,"WORKER_FULL_CHAIN_EOF_AND_JOIN");
  Check(!result.executionAuthorized&&!result.productionAdmission&&!result.measurementEligible,"WORKER_FULL_CHAIN_NO_AUTHORITY");
 }
 static MixedNativeDebugEventBridge.Event E(uint kind,uint pid){return new MixedNativeDebugEventBridge.Event(kind,pid,1,kind==3?7:0,8,0,1,++ordinal);}
 static long now=1;static bool clockThrow;static long Clock(){if(clockThrow)throw new Exception("clock unavailable");return now;}
 static string H(char c){return new string(c,64);}
 const string Prefix="fixture-prefix";
 static string Hash(string stdin){using(var h=System.Security.Cryptography.SHA256.Create()){return BitConverter.ToString(h.ComputeHash(Encoding.UTF8.GetBytes("codeatlas-mixed-native-launch-v1\0"+Prefix+stdin+"\"}"))).Replace("-","").ToLowerInvariant();}}
 static MixedNativeDynamicDebugEventBridge Bridge(Ops ops,bool empty=false){ordinal=0;now=1;clockThrow=false;var slot=new MixedNativeDynamicObserverPolicy.Slot("one","V2","ANALYSIS",Hash(H('0')),Prefix,"D:/fixture/native.exe",H('c'));return new MixedNativeDynamicDebugEventBridge(new MixedNativeDynamicObserverPolicy(H('a'),H('e'),100,"D:/fixture/node.exe",H('b'),empty?new MixedNativeDynamicObserverPolicy.Slot[0]:new[]{slot},10000,1024,65536,100),100,ops,Clock);}
 static string Prepare(MixedNativeDynamicControlCodec sender){return sender.Encode("REGISTER",new[]{"one","V2","ANALYSIS",H('f'),Hash(H('0')),H('d'),Hash(H('d'))})+sender.Encode("INTENT",new[]{"one","V2","ANALYSIS",H('f'),Hash(H('d'))});}
 static void Feed(MixedNativeControlMailbox box,string s){var b=Encoding.ASCII.GetBytes(s);box.Feed(b,0,b.Length);}
 static MixedNativeControlMailbox Box(){return new MixedNativeControlMailbox(1024,65536,100,16,8192);}
 public static string Run(){
  var ops=new Ops();var bridge=Bridge(ops);var box=Box();var lane=new Lane();var pipe=new Pipe();var sender=new MixedNativeDynamicControlCodec(new string('a',64),1024,65536,100);
  int peerStage=0;var peer=new MixedNativeDynamicControlCodec(H('a'),1024,65536,100);
  pipe.onWrite=()=>{var reply=peer.Decode(pipe.frames[pipe.frames.Count-1]);if(reply.Type=="BOUND"){Check(peerStage==1,"peer bound order");Feed(box,peer.Encode("INTENT",new[]{"one","V2","ANALYSIS",H('f'),Hash(H('d'))}));peerStage=2;}else if(reply.Type=="READY"){Check(peerStage==2,"peer ready order");peerStage=3;}else if(reply.Type=="ACQUIRED"){Check(peerStage==4,"peer acquired order");Feed(box,peer.Encode("SPAWNED",new[]{"one","200"})+peer.Encode("CLOSED",new[]{"one","200","p200","0","~"}));peerStage=5;}else if(reply.Type=="RELEASED"){Check(peerStage==6,"peer released order");peerStage=7;}else throw new Exception("unexpected reply");};
  lane.steps.Enqueue(()=>E(3,100));lane.steps.Enqueue(()=>{Feed(box,peer.Encode("REGISTER",new[]{"one","V2","ANALYSIS",H('f'),Hash(H('0')),H('d'),Hash(H('d'))}));peerStage=1;return null;});
  lane.fallback=()=>{if(peerStage==3){peerStage=4;return E(3,200);}if(peerStage==5){peerStage=6;return E(5,200);}if(peerStage==7){peerStage=8;box.CloseInput();return E(5,100);}return null;};
  var result=new MixedNativeDynamicObserverLoop(bridge,box,lane,pipe,5,50).Run();Check(result.complete&&result.cleanupComplete&&!result.failed,"NORMAL_COMPLETE");Check(pipe.frames.Count==4&&pipe.frames[0].Contains("\tBOUND\t")&&pipe.frames[1].Contains("\tREADY\t")&&pipe.frames[2].Contains("\tACQUIRED\t")&&pipe.frames[3].Contains("\tRELEASED\t"),"ordered output");Check(ops.continued==4,"one Continue/event");Check(pipe.stopped&&pipe.WorkersComplete,"observed stop");Check(!result.executionAuthorized&&!result.measurementEligible&&!result.productionAdmission,"no authority");
  ops=new Ops();bridge=Bridge(ops);box=Box();lane=new Lane();pipe=new Pipe();lane.steps.Enqueue(()=>{lane.cancel=true;return E(3,100);});lane.steps.Enqueue(()=>E(5,100));result=new MixedNativeDynamicObserverLoop(bridge,box,lane,pipe,5,20).Run();Check(!result.complete&&result.failed&&result.cleanupComplete,"cancel clean failure");Check(ops.terminated==1&&pipe.stopped,"cancel abort once");
  ops=new Ops();bridge=Bridge(ops);box=Box();lane=new Lane();lane.left=0;pipe=new Pipe();result=new MixedNativeDynamicObserverLoop(bridge,box,lane,pipe,5,20).Run();Check(lane.waits==0&&!result.complete&&!result.cleanupComplete,"no deadline extension");
  ops=new Ops();bridge=Bridge(ops);box=Box();lane=new Lane();pipe=new Pipe();lane.steps.Enqueue(()=>E(3,100));result=new MixedNativeDynamicObserverLoop(bridge,box,lane,pipe,5,2).Run();Check(result.failed&&!result.complete&&!result.cleanupComplete&&lane.waits<=2,"turn bound");
  ops=new Ops();bridge=Bridge(ops);box=Box();lane=new Lane();pipe=new Pipe();pipe.failBegin=true;sender=new MixedNativeDynamicControlCodec(new string('a',64),1024,65536,100);lane.steps.Enqueue(()=>E(3,100));lane.steps.Enqueue(()=>{Feed(box,Prepare(sender));return null;});lane.steps.Enqueue(()=>E(5,100));result=new MixedNativeDynamicObserverLoop(bridge,box,lane,pipe,5,20).Run();Check(result.failed&&!result.complete&&pipe.writes==1,"uncertain write no retry");
  ops=new Ops();bridge=Bridge(ops);box=Box();lane=new Lane();pipe=new Pipe();pipe.blocked=true;lane.steps.Enqueue(()=>{lane.cancel=true;return E(3,100);});lane.steps.Enqueue(()=>E(5,100));result=new MixedNativeDynamicObserverLoop(bridge,box,lane,pipe,5,12).Run();Check(!result.cleanupComplete&&pipe.waits>0,"blocked worker not clean");
  ops=new Ops();bridge=Bridge(ops);box=Box();lane=new Lane();pipe=new Pipe();sender=new MixedNativeDynamicControlCodec(new string('a',64),1024,65536,100);pipe.onWrite=()=>{lane.left=0;};lane.steps.Enqueue(()=>E(3,100));lane.steps.Enqueue(()=>{Feed(box,Prepare(sender));return null;});result=new MixedNativeDynamicObserverLoop(bridge,box,lane,pipe,5,20).Run();Check(lane.waits==2&&result.failed,"FRESH_DEADLINE_BEFORE_WAIT");
  ops=new Ops();bridge=Bridge(ops);box=Box();lane=new Lane();pipe=new Pipe();pipe.failStop=true;lane.steps.Enqueue(()=>{lane.cancel=true;return E(3,100);});lane.steps.Enqueue(()=>E(5,100));result=new MixedNativeDynamicObserverLoop(bridge,box,lane,pipe,5,20).Run();Check(!result.cleanupComplete,"CLOSE_FAILURE_NOT_CLEAN");
  ops=new Ops();bridge=Bridge(ops);box=Box();lane=new Lane();pipe=new Pipe();pipe.throwStop=true;lane.steps.Enqueue(()=>{lane.cancel=true;return E(3,100);});lane.steps.Enqueue(()=>E(5,100));result=new MixedNativeDynamicObserverLoop(bridge,box,lane,pipe,5,20).Run();Check(!result.cleanupComplete,"THROWING_STOP_NOT_CLEAN");
  bool infiniteRefused=false;try{new MixedNativeDynamicObserverLoop(Bridge(new Ops()),Box(),new Lane(),new Pipe(),uint.MaxValue,20);}catch(InvalidOperationException){infiniteRefused=true;}Check(infiniteRefused,"INFINITE_POLL_REFUSED");
  ops=new Ops();bridge=Bridge(ops,true);box=Box();lane=new Lane();pipe=new Pipe();pipe.onStop=()=>{lane.left=0;};lane.steps.Enqueue(()=>E(3,100));lane.steps.Enqueue(()=>{box.CloseInput();return E(5,100);});result=new MixedNativeDynamicObserverLoop(bridge,box,lane,pipe,5,20).Run();Check(!result.complete&&pipe.waits==0,"FRESH_DEADLINE_AFTER_STOP");
  ops=new Ops();bridge=Bridge(ops);box=Box();lane=new Lane();lane.rejectEmpty=true;pipe=new Pipe();sender=new MixedNativeDynamicControlCodec(new string('a',64),1024,65536,100);lane.steps.Enqueue(()=>E(3,100));lane.steps.Enqueue(()=>{Feed(box,Prepare(sender));return null;});lane.steps.Enqueue(()=>E(3,200));lane.steps.Enqueue(()=>{Feed(box,sender.Encode("SPAWNED",new[]{"one","200"}));return null;});lane.steps.Enqueue(()=>E(5,200));lane.steps.Enqueue(()=>E(5,100));pipe.onWaitWorkers=()=>{pipe.onWaitWorkers=null;Feed(box,sender.Encode("CLOSED",new[]{"one","200","p200","0","~"}));box.CloseInput();};result=new MixedNativeDynamicObserverLoop(bridge,box,lane,pipe,5,30).Run();Check(result.complete&&lane.waits==6,"LATE_CLOSE_NO_WAIT_AFTER_LAST_EXIT");
  ops=new Ops();bridge=Bridge(ops);box=Box();lane=new Lane();lane.rejectEmpty=true;pipe=new Pipe();sender=new MixedNativeDynamicControlCodec(new string('a',64),1024,65536,100);lane.steps.Enqueue(()=>E(3,100));lane.steps.Enqueue(()=>{Feed(box,Prepare(sender));return null;});lane.steps.Enqueue(()=>E(3,200));lane.steps.Enqueue(()=>{Feed(box,sender.Encode("SPAWNED",new[]{"one","200"}));return null;});lane.steps.Enqueue(()=>E(5,200));lane.steps.Enqueue(()=>{box.CloseInput();return E(5,100);});result=new MixedNativeDynamicObserverLoop(bridge,box,lane,pipe,5,30).Run();Check(!result.complete&&result.failed&&lane.waits==6,"EOF_WITHOUT_CLOSED_REFUSED");
  ops=new Ops();bridge=Bridge(ops,true);box=Box();lane=new Lane();pipe=new Pipe();pipe.ready=false;bool earlyStop=false;pipe.onStop=()=>{earlyStop=!pipe.ready;};pipe.onWaitWorkers=()=>{pipe.ready=true;};lane.steps.Enqueue(()=>E(3,100));lane.steps.Enqueue(()=>{box.CloseInput();return E(5,100);});result=new MixedNativeDynamicObserverLoop(bridge,box,lane,pipe,5,20).Run();Check(result.complete&&!earlyStop,"DIAGNOSTIC_EOF_GATE_BEFORE_STOP");
  ops=new Ops();bridge=Bridge(ops);clockThrow=true;bool refused=false;try{bridge.HandleEvent(E(3,100));}catch{refused=true;}Check(refused&&ops.continued==1&&bridge.Snapshot().failed,"CLOCK_THROW_ONE_CONTINUE");bridge.BeginAbort();Check(ops.terminated==1,"CLOCK_THROW_RETAINED_HANDLE");
  ops=new Ops();bridge=Bridge(ops);bridge.HandleEvent(E(3,100));now=10000;refused=false;try{bridge.HandleEvent(E(1,100));}catch{refused=true;}Check(refused&&ops.continued==2,"EXPIRED_CLOCK_ONE_CONTINUE");
  foreach(var wrong in new[]{"sequence","hash","phase","early"}){ops=new Ops();bridge=Bridge(ops);bridge.HandleEvent(E(3,100));sender=new MixedNativeDynamicControlCodec(H('a'),1024,65536,100);string frame=wrong=="early"?sender.Encode("INTENT",new[]{"one","V2","ANALYSIS",H('f'),Hash(H('d'))}):sender.Encode("REGISTER",new[]{"one","V2","ANALYSIS",H('f'),Hash(H('0')),H('d'),wrong=="hash"?H('0'):Hash(H('d'))});if(wrong=="sequence")frame=frame.Replace("\t1\t","\t2\t");if(wrong=="phase")frame=frame.Replace("\tANALYSIS\t","\tSOURCE\t");refused=false;try{bridge.ReceiveControl(frame);}catch{refused=true;}Check(refused&&bridge.Snapshot().failed,"CONTROL_REFUSAL_"+wrong);}
  ops=new Ops();bridge=Bridge(ops);refused=false;try{bridge.HandleEvent(E(3,999));}catch{refused=true;}Check(refused&&ops.continued==1&&bridge.Snapshot().unknownInstances&&!bridge.Snapshot().cleanupComplete,"UNKNOWN_CHILD");
  foreach(bool throwing in new[]{false,true}){ops=new Ops();bridge=Bridge(ops);ops.failContinue=!throwing;ops.throwContinue=throwing;refused=false;try{bridge.HandleEvent(E(3,100));}catch{refused=true;}bridge.BeginAbort();Check(refused&&ops.continued==1&&bridge.Snapshot().unknownInstances,"UNCERTAIN_CONTINUE_NO_RETRY");Check(ops.actions.SequenceEqual(new[]{"capture","continue"}),"CAPTURE_BEFORE_CONTINUE");}
  ops=new Ops();bridge=Bridge(ops,true);bridge.HandleEvent(E(3,100));bridge.CloseControlInput(true);bridge.HandleEvent(E(5,100));Check(ops.actions.SequenceEqual(new[]{"capture","continue","continue","finalize"}),"EXIT_CONTINUE_BEFORE_FINALIZE");
  ops=new Ops();bridge=Bridge(ops,true);bridge.HandleEvent(E(3,100));clockThrow=true;refused=false;try{bridge.HandleEvent(E(5,100));}catch{refused=true;}Check(refused&&ops.continued==2&&ops.actions.Count(x=>x=="finalize")==1&&!bridge.Snapshot().cleanupComplete,"EXIT_CLOCK_THROW_NO_RETRY_OR_CLEANUP_CLAIM");
  ops=new Ops();bridge=Bridge(ops);bridge.HandleEvent(E(3,100));refused=false;try{bridge.HandleEvent(E(6,999));}catch{refused=true;}Check(refused&&ops.continued==2&&bridge.Snapshot().unknownInstances,"UNKNOWN_NONCREATE_CONTINUED");
  var memoryBox=Box();var inputMemory=new MemoryStream(Encoding.ASCII.GetBytes("frame\n"));var outputMemory=new MemoryStream();MixedNativeDynamicObserverLoop.IControlPipe memoryPipe=new MixedNativeDynamicControlPipe(inputMemory,outputMemory,memoryBox,8);
  memoryPipe.Start();Check(memoryPipe.WaitForWorkers(1000),"ADAPTER_READER_JOIN");string memoryFrame;Check(memoryBox.TryTakeInput(out memoryFrame)&&memoryFrame=="frame\n"&&memoryBox.Snapshot().inputClosed&&memoryPipe.ReadyToComplete,"ADAPTER_FEED_AND_EOF");
  memoryBox.QueueOutput("reply\n");byte[] memoryBytes;Check(memoryBox.TryTakeOutput(out memoryBytes),"ADAPTER_QUEUED_OUTPUT");memoryPipe.BeginWrite(memoryBytes);memoryBytes[0]=(byte)'X';Check(memoryPipe.WaitForWorkers(1000),"ADAPTER_WRITER_JOIN");Check(memoryPipe.PollWrite()==MixedNativeDynamicObserverLoop.WriteStatus.Complete&&Encoding.ASCII.GetString(outputMemory.ToArray())=="reply\n","ADAPTER_WRITE_STATUS_AND_OWNED_BYTES");memoryPipe.Stop();Check(memoryPipe.WaitForWorkers(1000)&&memoryPipe.WorkersComplete&&!memoryPipe.Failed,"ADAPTER_STOP_JOIN");
  memoryBox=Box();outputMemory=new MemoryStream();memoryPipe=new MixedNativeDynamicControlPipe(new MemoryStream(),outputMemory,memoryBox,8);memoryPipe.Start();outputMemory.Dispose();memoryPipe.BeginWrite(Encoding.ASCII.GetBytes("refused\n"));Check(memoryPipe.WaitForWorkers(1000)&&memoryPipe.PollWrite()==MixedNativeDynamicObserverLoop.WriteStatus.Failed&&memoryPipe.Failed,"ADAPTER_FAILED_STATUS");memoryPipe.Stop();Check(memoryPipe.WaitForWorkers(1000)&&memoryPipe.WorkersComplete,"ADAPTER_FAILED_WORKERS_JOIN");
  WorkerPeerChain();
  return "{\"kind\":\"PURE_DYNAMIC_BOUNDED_LOOP_UNIT\",\"passed\":"+passed+",\"actualOsCalls\":0,\"actualCollectorRuns\":0}";
 }
}
