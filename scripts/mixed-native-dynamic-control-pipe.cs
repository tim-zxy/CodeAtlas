using System.IO;

// Adapts the existing owned stream workers to the separate V2 loop contract.
// Construction acquires no streams or operating-system resources.
public sealed class MixedNativeDynamicControlPipe : MixedNativeDynamicObserverLoop.IControlPipe {
 readonly MixedNativeControlPipe pipe;
 public MixedNativeDynamicControlPipe(Stream input,Stream output,MixedNativeControlMailbox mailbox,int readBufferBytes){pipe=new MixedNativeControlPipe(input,output,mailbox,readBufferBytes);}
 public bool ReadyToComplete{get{return pipe.ReadyToComplete;}}
 public bool Failed{get{return pipe.Failed;}}
 public bool WorkersComplete{get{return pipe.WorkersComplete;}}
 public void Start(){pipe.Start();}
 public void BeginWrite(byte[] bytes){pipe.BeginWrite(bytes);}
 public void Stop(){pipe.Stop();}
 public bool WaitForWorkers(uint milliseconds){return pipe.WaitForWorkers(milliseconds);}
 public MixedNativeDynamicObserverLoop.WriteStatus PollWrite(){
  switch(pipe.PollWrite()){
   case MixedNativeObserverLoop.WriteStatus.Pending:return MixedNativeDynamicObserverLoop.WriteStatus.Pending;
   case MixedNativeObserverLoop.WriteStatus.Complete:return MixedNativeDynamicObserverLoop.WriteStatus.Complete;
   case MixedNativeObserverLoop.WriteStatus.Failed:return MixedNativeDynamicObserverLoop.WriteStatus.Failed;
   default:throw new System.InvalidOperationException("MIXED_NATIVE_DYNAMIC_CONTROL_PIPE_FAILED");
  }
 }
}
