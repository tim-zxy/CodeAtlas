using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Diagnostics;
using Microsoft.Win32.SafeHandles;

// Closed private startup seam. Tests compile it; no test calls Start or a Windows API.
public static partial class MixedProcessCollector {
 internal sealed class QualificationHostRoot {
  readonly MixedNativeHostLaunchPlan plan;readonly Func<uint> remaining;readonly Func<bool> cancelled;readonly int ownerThread=System.Threading.Thread.CurrentThread.ManagedThreadId;
  internal readonly MixedNativeHostHandleLedger ledger=new MixedNativeHostHandleLedger(h=>CloseHandle(new IntPtr(h)));
  bool attempted,abortRequested,rootDuplicateAcquired;internal bool created;internal uint pid;internal string error;internal Stream toHost,fromHost,diagnostics;
  internal QualificationHostRoot(MixedNativeHostLaunchPlan plan,Func<uint> remaining,Func<bool> cancelled){MixedNativeHostLaunchPlan.Need(plan!=null&&remaining!=null&&cancelled!=null);this.plan=plan;this.remaining=remaining;this.cancelled=cancelled;}
  void Owner(){MixedNativeHostLaunchPlan.Need(System.Threading.Thread.CurrentThread.ManagedThreadId==ownerThread);}
  internal bool Cancelled{get{Owner();return cancelled();}}
  internal uint Remaining(){Owner();uint left=remaining();MixedNativeHostLaunchPlan.Need(left<uint.MaxValue);return left;}
  void Keep(MixedNativeHostHandleLedger.Role role,IntPtr handle){ledger.Keep(role,handle.ToInt64());}
  IntPtr Handle(MixedNativeHostHandleLedger.Role role){return new IntPtr(ledger.Get(role));}
  Stream Borrow(MixedNativeHostHandleLedger.Role role,FileAccess access){return new FileStream(new SafeFileHandle(Handle(role),false),access);}
  internal void Start(){
   Owner();MixedNativeHostLaunchPlan.Need(!attempted);attempted=true;
   var sa=new Security();sa.size=Marshal.SizeOf(typeof(Security));sa.inherit=true;var si=new StartupEx();si.info.cb=Marshal.SizeOf(typeof(StartupEx));si.info.flags=0x100;
   IntPtr attributesSize=IntPtr.Zero,list=IntPtr.Zero,env=IntPtr.Zero;bool attributesReady=false;var info=new ProcessInfo();
   try{
    if(cancelled()||Remaining()==0)throw new InvalidOperationException();
    IntPtr read,write;Require(CreatePipe(out read,out write,ref sa,0));Keep(MixedNativeHostHandleLedger.Role.ChildStdin,read);Keep(MixedNativeHostHandleLedger.Role.ToHost,write);Require(SetHandleInformation(write,1,0));
    Require(CreatePipe(out read,out write,ref sa,0));Keep(MixedNativeHostHandleLedger.Role.FromHost,read);Keep(MixedNativeHostHandleLedger.Role.ChildStdout,write);Require(SetHandleInformation(read,1,0));
    Require(CreatePipe(out read,out write,ref sa,0));Keep(MixedNativeHostHandleLedger.Role.Stderr,read);Keep(MixedNativeHostHandleLedger.Role.ChildStderr,write);Require(SetHandleInformation(read,1,0));
    InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref attributesSize);MixedNativeHostLaunchPlan.Need(attributesSize!=IntPtr.Zero);si.attributes=Marshal.AllocHGlobal(attributesSize);Require(InitializeProcThreadAttributeList(si.attributes,1,0,ref attributesSize));attributesReady=true;
    list=Marshal.AllocHGlobal(IntPtr.Size*3);Marshal.Copy(new[]{Handle(MixedNativeHostHandleLedger.Role.ChildStdin),Handle(MixedNativeHostHandleLedger.Role.ChildStdout),Handle(MixedNativeHostHandleLedger.Role.ChildStderr)},0,list,3);Require(UpdateProcThreadAttribute(si.attributes,0,new IntPtr(0x20002),list,new IntPtr(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero));
    si.info.input=Handle(MixedNativeHostHandleLedger.Role.ChildStdin);si.info.output=Handle(MixedNativeHostHandleLedger.Role.ChildStdout);si.info.error=Handle(MixedNativeHostHandleLedger.Role.ChildStderr);env=Marshal.StringToHGlobalUni(plan.EnvironmentBlock);
    if(cancelled()||Remaining()==0)throw new InvalidOperationException();
    Require(CreateProcessW(plan.NodePath,new StringBuilder(plan.CommandLine),IntPtr.Zero,IntPtr.Zero,true,RootCreationFlags,env,plan.WorkingDirectory,ref si,out info));created=true;pid=info.pid;
    Keep(MixedNativeHostHandleLedger.Role.RootProcess,info.process);Keep(MixedNativeHostHandleLedger.Role.RootThread,info.thread);Require(DebugSetProcessKillOnExit(true));
    foreach(var role in new[]{MixedNativeHostHandleLedger.Role.ChildStdin,MixedNativeHostHandleLedger.Role.ChildStdout,MixedNativeHostHandleLedger.Role.ChildStderr})ledger.Close(role);
    toHost=Borrow(MixedNativeHostHandleLedger.Role.ToHost,FileAccess.Write);fromHost=Borrow(MixedNativeHostHandleLedger.Role.FromHost,FileAccess.Read);diagnostics=Borrow(MixedNativeHostHandleLedger.Role.Stderr,FileAccess.Read);
   }catch{error="HOST_STARTUP_FAILED";if(!created)ledger.CloseAll();}
   finally{if(attributesReady)DeleteProcThreadAttributeList(si.attributes);if(si.attributes!=IntPtr.Zero)Marshal.FreeHGlobal(si.attributes);if(list!=IntPtr.Zero)Marshal.FreeHGlobal(list);if(env!=IntPtr.Zero)Marshal.FreeHGlobal(env);}
  }
  internal void Captured(MixedNativeDebugEventBridge.Event ev){Owner();if(ev.Pid==pid)ledger.ObserveRootCreate(ev.Process,ev.InitialThread);}
  internal void Acquired(MixedNativeDebugEventBridge.Event ev){Owner();if(ev.Pid==pid)rootDuplicateAcquired=true;}
  internal void Continued(MixedNativeDebugEventBridge.Event ev){Owner();if(ev.Pid==pid&&ev.Kind==5)ledger.DebuggerExitContinued();}
  internal void RequestAbort(){Owner();if(abortRequested)return;abortRequested=true;var process=rootDuplicateAcquired?IntPtr.Zero:new IntPtr(ledger.BorrowRootForAbort());if(process!=IntPtr.Zero&&!TerminateProcess(process,1))error="HOST_ABORT_UNPROVED";}
  internal void CloseTransport(){Owner();foreach(var role in new[]{MixedNativeHostHandleLedger.Role.ToHost,MixedNativeHostHandleLedger.Role.FromHost,MixedNativeHostHandleLedger.Role.Stderr,MixedNativeHostHandleLedger.Role.ChildStdin,MixedNativeHostHandleLedger.Role.ChildStdout,MixedNativeHostHandleLedger.Role.ChildStderr})ledger.Close(role);}
  // Caller retains partial resources on failure and must drain debug events before
  // treating any aliased handles/process exit as settled. Local closure is not cleanup.
  internal void CloseRemainingResources(){Owner();ledger.CloseAll();}
  internal MixedNativeObserverLoop BuildLoop(MixedNativeObserverPolicy policy,MixedNativeControlMailbox mailbox,int readBufferBytes,uint pollMilliseconds,long maxTurns,long stderrBytes,int stderrBufferBytes){
   Owner();MixedNativeHostLaunchPlan.Need(created&&toHost!=null&&fromHost!=null&&diagnostics!=null);
   var bridge=new MixedNativeDebugEventBridge(policy,pid,new QualificationEventOperations(Remaining,Captured,Continued,Acquired));var lane=new QualificationWaitLane(Remaining,cancelled);var control=new MixedNativeControlPipe(fromHost,toHost,mailbox,readBufferBytes);var diagnostic=new MixedNativeHostDiagnostics(diagnostics,stderrBytes,stderrBufferBytes);
   return new MixedNativeObserverLoop(bridge,mailbox,lane,new QualificationHostPipe(this,control,diagnostic),pollMilliseconds,maxTurns);
  }
 }
 sealed class QualificationHostPipe:MixedNativeObserverLoop.IControlPipe {
  readonly QualificationHostRoot root;readonly MixedNativeControlPipe control;readonly MixedNativeHostDiagnostics diagnostics;bool stopped;
  internal QualificationHostPipe(QualificationHostRoot root,MixedNativeControlPipe control,MixedNativeHostDiagnostics diagnostics){this.root=root;this.control=control;this.diagnostics=diagnostics;}
  public void Start(){diagnostics.Start();control.Start();}public void BeginWrite(byte[] bytes){control.BeginWrite(bytes);}public MixedNativeObserverLoop.WriteStatus PollWrite(){return control.PollWrite();}
  public bool ReadyToComplete{get{return control.ReadyToComplete&&diagnostics.Snapshot().emptyComplete;}}
  public bool Failed{get{var d=diagnostics.Snapshot();return root.error!=null||root.ledger.Snapshot().failed||control.Failed||d.failed||d.bytes>0;}}
  public bool WorkersComplete{get{return stopped&&control.WorkersComplete&&diagnostics.Snapshot().workersComplete&&root.ledger.Snapshot().allReleased;}}
  public void Stop(){if(stopped)return;stopped=true;root.RequestAbort();control.Stop();diagnostics.Stop();root.CloseTransport();}
  public bool WaitForWorkers(uint milliseconds){uint budget=Math.Min(milliseconds,root.Remaining());var clock=Stopwatch.StartNew();if(!control.WaitForWorkers(budget))return false;uint left=(uint)Math.Max(0,(long)budget-clock.ElapsedMilliseconds);left=Math.Min(left,root.Remaining());if(left>0&&!diagnostics.Wait(left))return false;return WorkersComplete;}
 }
 internal static QualificationHostRoot CreateQualificationHostRoot(MixedNativeHostLaunchPlan plan,Func<uint> remaining,Func<bool> cancelled){return new QualificationHostRoot(plan,remaining,cancelled);}
}
