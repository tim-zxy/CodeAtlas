using System;

// One serialized owner of policy/control/debug events. No actual launch entry point.
public sealed class MixedNativeDynamicObserverLoop {
 public enum WriteStatus {Pending,Complete,Failed}
 public interface IWaitLane {
  uint RemainingMilliseconds{get;}bool Cancelled{get;}
  bool TryWait(uint milliseconds,out MixedNativeDebugEventBridge.Event ev);
 }
 public interface IControlPipe {
  bool ReadyToComplete{get;}bool Failed{get;}bool WorkersComplete{get;}
  void Start();void BeginWrite(byte[] bytes);WriteStatus PollWrite();void Stop();bool WaitForWorkers(uint milliseconds);
 }
 public sealed class State {
  public readonly bool complete,cleanupComplete,failed,executionAuthorized=false,productionAdmission=false,measurementEligible=false;
  public readonly long turns;public readonly string status;
  internal State(bool done,bool clean,bool failed,long turns){complete=done;cleanupComplete=clean;this.failed=failed;this.turns=turns;status=done?"OFFLINE_COMPLETE_UNQUALIFIED":clean?"OFFLINE_FAILED_CLEAN":"OFFLINE_FAILED_CLEANUP_UNPROVED";}
 }
 readonly MixedNativeDynamicDebugEventBridge bridge;readonly MixedNativeControlMailbox mailbox;readonly IWaitLane lane;readonly IControlPipe pipe;readonly uint poll;readonly long maximumTurns;
 int runClaimed;bool aborting,failed,pipeStopped,stopFailed,writing,eofSent;long turns;
 static void Need(bool b){if(!b)throw new InvalidOperationException("MIXED_NATIVE_OBSERVER_LOOP_FAILED");}
 public MixedNativeDynamicObserverLoop(MixedNativeDynamicDebugEventBridge bridge,MixedNativeControlMailbox mailbox,IWaitLane lane,IControlPipe pipe,uint pollMilliseconds,long maxTurns){Need(bridge!=null&&mailbox!=null&&lane!=null&&pipe!=null&&pollMilliseconds>0&&pollMilliseconds<uint.MaxValue&&maxTurns>0);this.bridge=bridge;this.mailbox=mailbox;this.lane=lane;this.pipe=pipe;poll=pollMilliseconds;maximumTurns=maxTurns;}
 void StopPipe(){if(pipeStopped)return;pipeStopped=true;try{pipe.Stop();}catch{failed=true;stopFailed=true;}}
 void Abort(){failed=true;if(aborting)return;aborting=true;mailbox.Fail();try{bridge.CloseControlInput(false);}catch{}try{bridge.BeginAbort();}catch{}StopPipe();}
 void Queue(string[] lines){foreach(var line in lines)mailbox.QueueOutput(line);}
 void PumpControl(){
  if(mailbox.Snapshot().failed||pipe.Failed){Abort();return;}
  long available=mailbox.Snapshot().queuedInputFrames;string line;for(long i=0;i<available;i++){if(lane.Cancelled||lane.RemainingMilliseconds==0){Abort();return;}if(!mailbox.TryTakeInput(out line))break;Queue(bridge.ReceiveControl(line));}
  var box=mailbox.Snapshot();if(box.inputClosed&&!eofSent&&box.queuedInputFrames==0){bridge.CloseControlInput(true);eofSent=true;}
  if(writing){var status=pipe.PollWrite();if(status==WriteStatus.Failed){Abort();return;}if(status==WriteStatus.Complete)writing=false;}
  byte[] bytes;if(!writing&&mailbox.TryTakeOutput(out bytes)){writing=true;pipe.BeginWrite(bytes);}
  if(bridge.Snapshot().failed)Abort();
 }
 public State Run(){
  Need(System.Threading.Interlocked.CompareExchange(ref runClaimed,1,0)==0);
  try{
   pipe.Start();
   bool finished=false;for(;turns<maximumTurns;){
    turns++;
    try{
     uint remaining=lane.RemainingMilliseconds;if(remaining==0){Abort();break;}
     if(lane.Cancelled)Abort();
     if(!aborting)PumpControl();
     var state=bridge.Snapshot();var box=mailbox.Snapshot();
     if(!aborting&&state.cleanupComplete&&eofSent&&box.queuedInputFrames==0&&!state.complete){Abort();state=bridge.Snapshot();box=mailbox.Snapshot();}
     bool finishing=aborting?state.cleanupComplete:state.complete&&!writing&&box.queuedOutputFrames==0&&pipe.ReadyToComplete;
     remaining=lane.RemainingMilliseconds;if(remaining==0){Abort();break;}if(lane.Cancelled&&!aborting){Abort();continue;}uint slice=Math.Min(poll,remaining);
     if(finishing){StopPipe();if(lane.Cancelled)Abort();remaining=lane.RemainingMilliseconds;if(remaining==0){Abort();break;}slice=Math.Min(poll,remaining);if(pipe.WaitForWorkers(slice)&&pipe.WorkersComplete){finished=true;break;}continue;}
     if(!aborting&&state.cleanupComplete){pipe.WaitForWorkers(slice);continue;}
     MixedNativeDebugEventBridge.Event ev;if(lane.TryWait(slice,out ev)){Need(ev!=null);var output=bridge.HandleEvent(ev);if(!aborting)Queue(output);}
    }catch{Abort();}
   }
   if(!finished)Abort();
  }catch{Abort();}
  finally{StopPipe();}
  var final=bridge.Snapshot();var pending=mailbox.Snapshot();bool workers=false,pipeFailed=true;try{workers=pipe.WorkersComplete;pipeFailed=pipe.Failed;}catch{failed=true;}
  bool clean=final.cleanupComplete&&workers&&!pipeFailed&&!stopFailed;
  bool complete=!failed&&!aborting&&!pipeFailed&&clean&&final.complete&&eofSent&&!pending.failed&&pending.queuedInputFrames==0&&pending.queuedOutputFrames==0&&!writing;
  return new State(complete,clean,failed||!complete,turns);
 }
}
