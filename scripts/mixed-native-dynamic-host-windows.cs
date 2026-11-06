using System;

// Additional construction-only V2 lane. Existing startup, handles and Windows calls stay unchanged.
public static partial class MixedProcessCollector {
 internal sealed class QualificationDynamicWaitLane : MixedNativeDynamicObserverLoop.IWaitLane {
  readonly MixedNativeObserverLoop.IWaitLane lane;
  internal QualificationDynamicWaitLane(MixedNativeObserverLoop.IWaitLane lane){MixedNativeHostLaunchPlan.Need(lane!=null);this.lane=lane;}
  public uint RemainingMilliseconds{get{return lane.RemainingMilliseconds;}}
  public bool Cancelled{get{return lane.Cancelled;}}
  public bool TryWait(uint milliseconds,out MixedNativeDebugEventBridge.Event ev){return lane.TryWait(milliseconds,out ev);}
 }
 internal sealed class QualificationDynamicHostPipe : MixedNativeDynamicObserverLoop.IControlPipe {
  readonly MixedNativeObserverLoop.IControlPipe pipe;
  internal QualificationDynamicHostPipe(MixedNativeObserverLoop.IControlPipe pipe){MixedNativeHostLaunchPlan.Need(pipe!=null);this.pipe=pipe;}
  public bool ReadyToComplete{get{return pipe.ReadyToComplete;}}
  public bool Failed{get{return pipe.Failed;}}
  public bool WorkersComplete{get{return pipe.WorkersComplete;}}
  public void Start(){pipe.Start();}
  public void BeginWrite(byte[] bytes){pipe.BeginWrite(bytes);}
  public MixedNativeDynamicObserverLoop.WriteStatus PollWrite(){
   switch(pipe.PollWrite()){
    case MixedNativeObserverLoop.WriteStatus.Pending:return MixedNativeDynamicObserverLoop.WriteStatus.Pending;
    case MixedNativeObserverLoop.WriteStatus.Complete:return MixedNativeDynamicObserverLoop.WriteStatus.Complete;
    case MixedNativeObserverLoop.WriteStatus.Failed:return MixedNativeDynamicObserverLoop.WriteStatus.Failed;
    default:throw new InvalidOperationException("MIXED_NATIVE_DYNAMIC_HOST_PIPE_FAILED");
   }
  }
  public void Stop(){pipe.Stop();}
  public bool WaitForWorkers(uint milliseconds){return pipe.WaitForWorkers(milliseconds);}
 }
 // The existing root must already own its streams. This method never starts it or a worker.
 // Hash/plan metadata is not authentication; construction is not execution approval.
 internal static MixedNativeDynamicObserverLoop CreateQualificationDynamicHostLoop(
  QualificationHostRoot root,MixedNativeDynamicObserverPolicy policy,MixedNativeControlMailbox mailbox,
  int readBufferBytes,uint pollMilliseconds,long maxTurns,long stderrBytes,int stderrBufferBytes,Func<long> nowEpochMs){
  MixedNativeHostLaunchPlan.Need(root!=null&&root.created&&root.toHost!=null&&root.fromHost!=null&&root.diagnostics!=null);
  var bridge=new MixedNativeDynamicDebugEventBridge(policy,root.pid,
   new QualificationEventOperations(root.Remaining,root.Captured,root.Continued,root.Acquired),nowEpochMs);
  var lane=new QualificationDynamicWaitLane(new QualificationWaitLane(root.Remaining,()=>root.Cancelled));
  var control=new MixedNativeControlPipe(root.fromHost,root.toHost,mailbox,readBufferBytes);
  var diagnostics=new MixedNativeHostDiagnostics(root.diagnostics,stderrBytes,stderrBufferBytes);
  var pipe=new QualificationDynamicHostPipe(new QualificationHostPipe(root,control,diagnostics));
  return new MixedNativeDynamicObserverLoop(bridge,mailbox,lane,pipe,pollMilliseconds,maxTurns);
 }
}
