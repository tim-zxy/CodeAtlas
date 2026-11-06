using System;
using System.Collections.Generic;
using System.Linq;
using Event=MixedNativeDebugEventBridge.Event;
using Capture=MixedNativeDebugEventBridge.Capture;
using IOperations=MixedNativeDebugEventBridge.IOperations;

// Serialized event adapter. Operations are owned by the existing private debugger.
// No launch, attach, pipe reading or permission selection occurs in this class.
public sealed class MixedNativeDynamicDebugEventBridge {
 const uint Handled=0x00010002,NotHandled=0x80010001;
 const string Error="MIXED_NATIVE_DEBUG_BRIDGE_FAILED";
 sealed class Instance {public Capture capture;public bool settlementAttempted,exited,released,terminationAttempted;}
 public sealed class State {
  public readonly bool complete,cleanupComplete,executionAuthorized=false,productionAdmission=false,measurementEligible=false;
  public readonly bool failed,unknownInstances;public readonly int ownedInstances;
  internal State(bool done,bool clean,bool fault,bool unknown,int count){complete=done;cleanupComplete=clean;failed=fault;unknownInstances=unknown;ownedInstances=count;}
 }
 readonly MixedNativeDynamicObserverPolicy policy;readonly uint hostPid;readonly IOperations operations;readonly Func<long> nowEpochMs;
 readonly List<Instance> instances=new List<Instance>();long lastOrdinal;bool handling,failed,unknown,stopped,aborting,rootCaptured;
 static void Need(bool v){if(!v)throw new InvalidOperationException(Error);}
 public MixedNativeDynamicDebugEventBridge(MixedNativeDynamicObserverPolicy policy,uint hostPid,IOperations operations,Func<long> nowEpochMs){Need(policy!=null&&hostPid>0&&operations!=null&&nowEpochMs!=null);this.policy=policy;this.hostPid=hostPid;this.operations=operations;this.nowEpochMs=nowEpochMs;}
 public string[] ReceiveControl(string line){try{Need(!handling&&!stopped);return policy.Receive(line,nowEpochMs());}catch{failed=true;stopped=true;throw new InvalidOperationException(Error);}}
 public void CloseControlInput(bool completeFrame){Need(!handling);policy.CloseControlInput(completeFrame,nowEpochMs());if(!completeFrame){failed=true;stopped=true;}}
 public string[] HandleEvent(Event ev){
  Need(!handling&&(!stopped||aborting)&&ev!=null);if(lastOrdinal==long.MaxValue||ev.Ordinal!=lastOrdinal+1){failed=true;stopped=true;unknown=true;throw new InvalidOperationException(Error);}lastOrdinal=ev.Ordinal;handling=true;
  var output=new List<string>();bool bad=false,continued=false;uint continuation=ev.Kind==1?NotHandled:Handled;Instance exiting=null;
  try{
   Need(ev.Pid>0&&ev.Tid>0&&ev.Kind>=1&&ev.Kind<=9);
   var current=instances.LastOrDefault(x=>x.capture.Pid==ev.Pid&&!x.exited);
   if(ev.Kind==3){
    // Keep any acquired duplicate even if subsequent identity/policy checks fail.
    Capture captured=null;try{captured=operations.CaptureCreate(ev);}catch{unknown=true;throw;}
    Need(captured!=null);var owned=new Instance{capture=captured};instances.Add(owned);
    if(current!=null||captured.Pid!=ev.Pid||captured.Owned==null){unknown=true;Need(false);}
    if(aborting){unknown=true;Terminate(owned);}
    else if(!rootCaptured&&ev.Pid==hostPid){try{policy.CaptureHostBeforeContinue(captured.Pid,captured.Created,captured.ImagePath,captured.ImageSha256,true,nowEpochMs());rootCaptured=true;}catch{unknown=true;throw;}}
    else{try{output.Add(policy.CaptureChildBeforeContinue(captured.Pid,captured.Created,captured.ImagePath,captured.ImageSha256,true,nowEpochMs()));}catch{unknown=true;throw;}}
   }else if(ev.Kind==5){
    if(current==null||current.settlementAttempted){unknown=true;Need(false);}exiting=current;
   }else{
    if(current==null){unknown=true;Need(false);}
    if(ev.Kind==1){continuation=NotHandled;policy.RecordException(ev.Pid,ev.Code,ev.FirstChance,nowEpochMs());continuation=Handled;}
    else Need(ev.Kind!=9);
   }
  }catch{bad=true;failed=true;if(ev.Kind==3)unknown=true;}
  finally{
   // Debugger file handles are independent of the retained process duplicate.
   if((ev.Kind==3||ev.Kind==6)&&ev.Image!=0){try{if(!operations.CloseImage(ev)){bad=true;failed=true;unknown=true;}}catch{bad=true;failed=true;unknown=true;}}
   try{continued=operations.Continue(ev,continuation);if(!continued){bad=true;failed=true;unknown=true;}}catch{bad=true;failed=true;unknown=true;}
   if(continued&&exiting!=null){
    exiting.settlementAttempted=true;
    try{
     var receipt=operations.FinalizeExit(exiting.capture);Need(receipt!=null);exiting.exited=receipt.OsExited;exiting.released=receipt.HandleReleased;
     if(receipt.Created!=exiting.capture.Created){unknown=true;Need(false);}
     if(ev.Pid==hostPid)policy.RecordHostExitAndRelease(receipt.Created,ev.Code,receipt.OsExited,receipt.HandleReleased,receipt.QueryStatus,receipt.Peak,nowEpochMs());
     else{var reply=policy.RecordChildExitAndRelease(ev.Pid,receipt.Created,receipt.OsExited,receipt.HandleReleased,receipt.QueryStatus,receipt.Peak,nowEpochMs());if(reply!=null)output.Add(reply);}
    }catch{bad=true;failed=true;unknown=true;}
   }
   if(bad)stopped=true;handling=false;
  }
  if(bad)throw new InvalidOperationException(Error);return output.ToArray();
 }
 void Terminate(Instance instance){if(instance.terminationAttempted||instance.settlementAttempted||instance.exited)return;instance.terminationAttempted=true;try{if(!operations.Terminate(instance.capture))unknown=true;}catch{unknown=true;}}
 // Caller must keep draining debugger events under its existing deadline.
 // This method neither waits for blocked debuggees nor retries uncertain Continue.
 public void BeginAbort(){Need(!handling);failed=true;stopped=true;aborting=true;policy.Cancel();foreach(var instance in instances)Terminate(instance);}
 public State Snapshot(){var p=policy.Snapshot();bool clean=!unknown&&p.cleanupComplete&&instances.All(x=>x.exited&&x.released);return new State(clean&&!failed&&p.complete,clean,failed||p.status=="OFFLINE_FAILED",unknown,instances.Count);}
}
