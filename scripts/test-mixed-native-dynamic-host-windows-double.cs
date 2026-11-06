using System;
using System.Collections.Generic;
// These doubles never invoke a Windows operation, HOST Start or any loop Run.
public static partial class MixedProcessCollector {
 sealed class DynamicFactoryLaneDouble:MixedNativeObserverLoop.IWaitLane {
  internal uint remaining=123;internal bool cancelled;internal int reads,waits;internal uint asked;
  public uint RemainingMilliseconds{get{reads++;return remaining;}}
  public bool Cancelled{get{return cancelled;}}
  public bool TryWait(uint milliseconds,out MixedNativeDebugEventBridge.Event ev){waits++;asked=milliseconds;ev=null;return false;}
 }
 sealed class DynamicFactoryPipeDouble:MixedNativeObserverLoop.IControlPipe {
  internal bool ready,failed,workers,waitResult;internal uint asked;internal int starts,stops,writes;internal byte[] bytes;
  internal MixedNativeObserverLoop.WriteStatus status;
  public bool ReadyToComplete{get{return ready;}}public bool Failed{get{return failed;}}public bool WorkersComplete{get{return workers;}}
  public void Start(){starts++;}public void Stop(){stops++;}public void BeginWrite(byte[] value){writes++;bytes=value;}
  public MixedNativeObserverLoop.WriteStatus PollWrite(){return status;}
  public bool WaitForWorkers(uint milliseconds){asked=milliseconds;return waitResult;}
 }
 public static object DynamicHostFactoryUnit(){
  int passed=0;Action<bool> check=value=>{if(!value)throw new InvalidOperationException("DYNAMIC_HOST_FACTORY_UNIT_FAILED");passed++;};
  var originalLane=new DynamicFactoryLaneDouble();var lane=new QualificationDynamicWaitLane(originalLane);
  check(lane.RemainingMilliseconds==123&&originalLane.reads==1);originalLane.remaining=7;check(lane.RemainingMilliseconds==7&&originalLane.reads==2);
  check(!lane.Cancelled);originalLane.cancelled=true;check(lane.Cancelled);
  MixedNativeDebugEventBridge.Event ev;check(!lane.TryWait(5,out ev)&&ev==null&&originalLane.waits==1&&originalLane.asked==5);
  var originalPipe=new DynamicFactoryPipeDouble();var pipe=new QualificationDynamicHostPipe(originalPipe);
  check(!pipe.ReadyToComplete);originalPipe.ready=true;check(pipe.ReadyToComplete);
  // Not EOF/diagnostics success synthesized by this adapter: it delegates the existing composite gate.
  originalPipe.ready=false;check(!pipe.ReadyToComplete);
  check(!pipe.WorkersComplete);originalPipe.workers=true;check(pipe.WorkersComplete);originalPipe.workers=false;check(!pipe.WorkersComplete);
  check(!pipe.Failed);originalPipe.failed=true;check(pipe.Failed);originalPipe.failed=false;check(!pipe.Failed);
  originalPipe.status=MixedNativeObserverLoop.WriteStatus.Pending;check(pipe.PollWrite()==MixedNativeDynamicObserverLoop.WriteStatus.Pending);
  originalPipe.status=MixedNativeObserverLoop.WriteStatus.Complete;check(pipe.PollWrite()==MixedNativeDynamicObserverLoop.WriteStatus.Complete);
  originalPipe.status=MixedNativeObserverLoop.WriteStatus.Failed;check(pipe.PollWrite()==MixedNativeDynamicObserverLoop.WriteStatus.Failed);
  originalPipe.status=(MixedNativeObserverLoop.WriteStatus)999;bool refused=false;try{pipe.PollWrite();}catch(InvalidOperationException){refused=true;}check(refused);
  originalPipe.waitResult=false;check(!pipe.WaitForWorkers(7)&&originalPipe.asked==7);originalPipe.waitResult=true;check(pipe.WaitForWorkers(2)&&originalPipe.asked==2);
  var bytes=new byte[]{65,10};pipe.BeginWrite(bytes);check(originalPipe.writes==1&&Object.ReferenceEquals(bytes,originalPipe.bytes));pipe.Stop();check(originalPipe.stops==1);
  check(originalPipe.starts==0);check(originalLane.waits==1);
  // An unstarted root is genuinely rejected; no fake created flag/OS handle is minted.
  var plan=new MixedNativeHostLaunchPlan("D:/fixture/node.exe","D:/fixture/host.mjs","D:/fixture/manifest.json",new String('a',64),new String('b',64),new String('c',64),"D:/fixture",new string[0],4096);
  uint remaining=9;bool cancelled=false;
  var root=CreateQualificationHostRoot(plan,()=>remaining,()=>cancelled);
  var rootedLane=new QualificationDynamicWaitLane(new QualificationWaitLane(root.Remaining,()=>root.Cancelled));
  check(rootedLane.RemainingMilliseconds==9&&!rootedLane.Cancelled);
  remaining=3;cancelled=true;check(rootedLane.RemainingMilliseconds==3&&rootedLane.Cancelled);
  remaining=0;check(rootedLane.RemainingMilliseconds==0);
  // A genuine unstarted root plus memory-only streams cannot turn absent stderr EOF into success.
  var memoryControl=new MixedNativeControlPipe(new System.IO.MemoryStream(),new System.IO.MemoryStream(),new MixedNativeControlMailbox(1024,65536,100,10,65536),16);
  var memoryDiagnostics=new MixedNativeHostDiagnostics(new System.IO.MemoryStream(),1024,16);
  var composite=new QualificationDynamicHostPipe(new QualificationHostPipe(root,memoryControl,memoryDiagnostics));
  check(!composite.ReadyToComplete&&!composite.WorkersComplete&&!composite.Failed);
  check(!memoryDiagnostics.Snapshot().emptyComplete&&!memoryDiagnostics.Snapshot().eof);

  refused=false;try{CreateQualificationDynamicHostLoop(root,null,null,16,1,10,1024,16,()=>1);}catch(InvalidOperationException){refused=true;}check(refused);check(!root.created&&root.toHost==null&&root.fromHost==null&&root.diagnostics==null);
  return new {kind="DYNAMIC_HOST_FACTORY_COMPILE_AND_PURE_ADAPTER_UNIT",passed=passed,actualHostStarts=0,actualWindowsCalls=0,loopRuns=0,executionAuthorized=false,factorySuccessPathRuntimeVerified=false,realStderrAndHandleCleanupRuntimeVerified=false};
 }
}
