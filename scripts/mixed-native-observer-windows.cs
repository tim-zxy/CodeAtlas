using System;
using System.Globalization;
using System.Text;

// Private event-only seam. No Run/Prepare/Collect, CreateProcess or attach call.
// Uses the collector's existing debugger rights and owned process duplicates.
public static partial class MixedProcessCollector {
 sealed class QualificationEventOperations:MixedNativeDebugEventBridge.IOperations {
  readonly Action<MixedNativeDebugEventBridge.Event> capturedHook,continuedHook,acquiredHook;readonly Func<uint> remaining;readonly int ownerThread=System.Threading.Thread.CurrentThread.ManagedThreadId;
  void Owner(){if(System.Threading.Thread.CurrentThread.ManagedThreadId!=ownerThread)throw new InvalidOperationException("MIXED_NATIVE_DEBUG_BRIDGE_FAILED");}
  internal QualificationEventOperations(Func<uint> remaining,Action<MixedNativeDebugEventBridge.Event> captured=null,Action<MixedNativeDebugEventBridge.Event> continued=null,Action<MixedNativeDebugEventBridge.Event> acquired=null){capturedHook=captured;continuedHook=continued;acquiredHook=acquired;if(remaining==null)throw new ArgumentNullException("remaining");this.remaining=remaining;}
  public MixedNativeDebugEventBridge.Capture CaptureCreate(MixedNativeDebugEventBridge.Event ev){
   Owner();var entry=new Entry();entry.pid=ev.Pid;
   try{
    if(capturedHook!=null)capturedHook(ev);bool duplicated=DuplicateHandle(GetCurrentProcess(),new IntPtr(ev.Process),GetCurrentProcess(),out entry.owned,0,false,2);if(!duplicated){entry.owned=IntPtr.Zero;Require(false);}Require(entry.owned!=IntPtr.Zero);if(acquiredHook!=null)acquiredHook(ev);
    long created,exited,kernel,user;Require(GetProcessTimes(entry.owned,out created,out exited,out kernel,out user));entry.creationFileTime=created.ToString(CultureInfo.InvariantCulture);
    // Capture the event-file identity; the fixed-role policy independently admits it.
    var name=new StringBuilder(32768);uint n=GetFinalPathNameByHandleW(new IntPtr(ev.Image),name,(uint)name.Capacity,0);Require(n>0&&n<name.Capacity);
    string path=name.ToString();if(path.StartsWith(@"\\?\",StringComparison.Ordinal))path=path.Substring(4);
    entry.imageSha256=ImageHash(new IntPtr(ev.Image),path,entry);
   }catch{
    // Return even a partial owned duplicate so rejection cannot lose cleanup ownership.
    // Missing identity will be refused by the coordinator/policy, never filled in.
   }
   return new MixedNativeDebugEventBridge.Capture(ev.Pid,entry.creationFileTime,entry.imagePath,entry.imageSha256,entry);
  }
  public bool CloseImage(MixedNativeDebugEventBridge.Event ev){Owner();return ev.Image==0||CloseHandle(new IntPtr(ev.Image));}
  public bool Continue(MixedNativeDebugEventBridge.Event ev,uint status){Owner();bool result=ContinueDebugEvent(ev.Pid,ev.Tid,status);if(result&&continuedHook!=null)continuedHook(ev);return result;}
  public bool Terminate(MixedNativeDebugEventBridge.Capture captured){Owner();var entry=captured.Owned as Entry;return entry!=null&&entry.owned!=IntPtr.Zero&&TerminateProcess(entry.owned,1);}
  public MixedNativeDebugEventBridge.ExitReceipt FinalizeExit(MixedNativeDebugEventBridge.Capture captured){
   Owner();var entry=captured.Owned as Entry;if(entry==null||entry.owned==IntPtr.Zero)throw new InvalidOperationException("MIXED_NATIVE_DEBUG_BRIDGE_FAILED");
   bool exited=false,released=false;string created=null,query="FAILED";long? peak=null;
   try{
    uint left=remaining();if(left==uint.MaxValue)throw new InvalidOperationException("MIXED_NATIVE_DEBUG_BRIDGE_FAILED");if(left>0)exited=WaitForSingleObject(entry.owned,left)==0;
    if(exited){long birth,exit,kernel,user;if(GetProcessTimes(entry.owned,out birth,out exit,out kernel,out user)){created=birth.ToString(CultureInfo.InvariantCulture);if(created==captured.Created){try{peak=Peak(entry.owned);query="RECORDED";}catch{peak=null;}}}}
   }finally{
    // Exactly one close attempt, including failed final-query/deadline paths.
    // Any unproved exit/release remains UNKNOWN in the bridge, not a retry lease.
    released=CloseHandle(entry.owned);entry.owned=IntPtr.Zero;
   }
   return new MixedNativeDebugEventBridge.ExitReceipt(created,exited,released,query,peak);
  }
 }
 internal static MixedNativeDebugEventBridge CreateQualificationEventBridge(MixedNativeObserverPolicy policy,uint hostPid,Func<uint> remaining){return new MixedNativeDebugEventBridge(policy,hostPid,new QualificationEventOperations(remaining));}
 // Future private bounded event loop calls this seam with its actual DEBUG_EVENT.
 // It is intentionally not wired into the old Node-only helper Run.
 static string[] HandleQualificationDebugEvent(MixedNativeDebugEventBridge bridge,DebugEvent ev,long ordinal){return bridge.HandleEvent(new MixedNativeDebugEventBridge.Event(ev.kind,ev.pid,ev.tid,ev.fileOrThread.ToInt64(),ev.process.ToInt64(),ev.exitOrException,ev.firstChance,ordinal,ev.initialThread.ToInt64()));}
 // Existing debugger wait API only. The actual successful-Wait lane owns ordinals.
 sealed class QualificationWaitLane:MixedNativeObserverLoop.IWaitLane {
  readonly Func<uint> remaining;readonly Func<bool> cancelled;readonly int ownerThread=System.Threading.Thread.CurrentThread.ManagedThreadId;long ordinal;
  void Owner(){if(System.Threading.Thread.CurrentThread.ManagedThreadId!=ownerThread)throw new InvalidOperationException("MIXED_NATIVE_DEBUG_BRIDGE_FAILED");}
  internal QualificationWaitLane(Func<uint> remaining,Func<bool> cancelled){if(remaining==null||cancelled==null)throw new ArgumentNullException();this.remaining=remaining;this.cancelled=cancelled;}
  public uint RemainingMilliseconds{get{Owner();uint left=remaining();if(left==uint.MaxValue)throw new InvalidOperationException("MIXED_NATIVE_DEBUG_BRIDGE_FAILED");return left;}}public bool Cancelled{get{Owner();return cancelled();}}
  public bool TryWait(uint milliseconds,out MixedNativeDebugEventBridge.Event captured){
   Owner();captured=null;if(milliseconds==uint.MaxValue)throw new InvalidOperationException("MIXED_NATIVE_DEBUG_BRIDGE_FAILED");uint bounded=Math.Min(milliseconds,RemainingMilliseconds);if(bounded==0)return false;
   DebugEvent ev;if(!WaitForDebugEvent(out ev,bounded)){int error=System.Runtime.InteropServices.Marshal.GetLastWin32Error();if(error==121)return false;throw new System.ComponentModel.Win32Exception(error);}
   ordinal=checked(ordinal+1);captured=new MixedNativeDebugEventBridge.Event(ev.kind,ev.pid,ev.tid,ev.fileOrThread.ToInt64(),ev.process.ToInt64(),ev.exitOrException,ev.firstChance,ordinal,ev.initialThread.ToInt64());return true;
  }
 }
 internal static MixedNativeObserverLoop.IWaitLane CreateQualificationWaitLane(Func<uint> remaining,Func<bool> cancelled){return new QualificationWaitLane(remaining,cancelled);}

 // One private construction point binds event wait and final queries to the same
 // remaining provider and debugger-owner thread. It does not start workers/Run.
 internal static MixedNativeObserverLoop CreateQualificationLoop(MixedNativeObserverPolicy policy,uint hostPid,MixedNativeControlMailbox mailbox,System.IO.Stream input,System.IO.Stream output,int readBufferBytes,Func<uint> remaining,Func<bool> cancelled,uint pollMilliseconds,long maxTurns){
  var lane=new QualificationWaitLane(remaining,cancelled);
  var bridge=CreateQualificationEventBridge(policy,hostPid,remaining);
  var pipe=new MixedNativeControlPipe(input,output,mailbox,readBufferBytes);
  return new MixedNativeObserverLoop(bridge,mailbox,lane,pipe,pollMilliseconds,maxTurns);
 }

}
