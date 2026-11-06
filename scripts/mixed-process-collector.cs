using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

// Qualification-only. No arbitrary command, attach, memory inspection or profile.
public static partial class MixedProcessCollector {
 // Debugger-owned fixed chain; no console, new console or job breakaway.
 const uint RootCreationFlags=0x00080409;
 [StructLayout(LayoutKind.Sequential)] struct Security {public int size;public IntPtr descriptor;[MarshalAs(UnmanagedType.Bool)] public bool inherit;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup {
  public int cb;public IntPtr reserved,desktop,title;
  public uint x,y,xSize,ySize,xChars,yChars,fill,flags;
  public ushort show,reservedSize;public IntPtr reservedPtr,input,output,error;
 }
 [StructLayout(LayoutKind.Sequential)] struct StartupEx {public Startup info;public IntPtr attributes;}
 [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {public IntPtr process,thread;public uint pid,tid;}
 [StructLayout(LayoutKind.Explicit,Size=176)] struct DebugEvent {
  [FieldOffset(0)] public uint kind;[FieldOffset(4)] public uint pid;[FieldOffset(8)] public uint tid;
  [FieldOffset(16)] public IntPtr fileOrThread;
  [FieldOffset(24)] public IntPtr process;
  [FieldOffset(32)] public IntPtr initialThread;
  [FieldOffset(16)] public uint exitOrException;
  [FieldOffset(168)] public uint firstChance;
 }
 [StructLayout(LayoutKind.Sequential)] struct Counters {
  public uint cb,faults;public UIntPtr peak,working,peakPaged,paged,peakNonPaged,nonPaged,pagefile,peakPagefile;
 }
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref Security sa,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref IntPtr size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
 [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
 static extern bool CreateProcessW(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref StartupEx si,out ProcessInfo pi);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool WaitForDebugEvent(out DebugEvent ev,uint milliseconds);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool ContinueDebugEvent(uint pid,uint tid,uint status);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool DebugSetProcessKillOnExit(bool kill);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool DuplicateHandle(IntPtr sourceProcess,IntPtr source,IntPtr targetProcess,out IntPtr target,uint access,bool inherit,uint options);
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint exitCode);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr process,uint milliseconds);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr process,out long creation,out long exit,out long kernel,out long user);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(IntPtr file,StringBuilder name,uint size,uint flags);
 [DllImport("psapi.dll",SetLastError=true)] static extern bool GetProcessMemoryInfo(IntPtr process,ref Counters c,uint size);
 public sealed class Entry {
  public int instance;public long pid;public string creationFileTime,imagePath,imageSha256;
  public long createSequence;public long? exitSequence;
  public bool osExited,handleReleased,initialBreakpoint,unexpectedException;
  public string queryStatus="MISSING",peakUnits="bytes";public long? finalPeakBytes;
  internal IntPtr owned;
 }
 public sealed class Result {
  public List<Entry> processes=new List<Entry>();public bool completeCleanup;
  public string error,rootOutput;public long collectorPeak;
 }
 sealed class PipeBudget {public long bytes;}
 static void Require(bool v){if(!v)throw new Win32Exception(Marshal.GetLastWin32Error());}
 static void Close(ref IntPtr p){if(p!=IntPtr.Zero){Require(CloseHandle(p));p=IntPtr.Zero;}}
 static long Peak(IntPtr p){var c=new Counters();c.cb=(uint)Marshal.SizeOf(typeof(Counters));Require(GetProcessMemoryInfo(p,ref c,c.cb));long n=checked((long)c.peak.ToUInt64());if(n<=0)throw new InvalidOperationException("MISSING_PEAK");return n;}
 static string Hash(Stream stream){using(var hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}
 static string ImageHash(IntPtr file,string expected,Entry entry){
  if(file==IntPtr.Zero)throw new InvalidOperationException("MISSING_IMAGE");
  var name=new StringBuilder(32768);uint n=GetFinalPathNameByHandleW(file,name,(uint)name.Capacity,0);Require(n>0&&n<name.Capacity);
  string actual=name.ToString();if(actual.StartsWith(@"\\?\",StringComparison.Ordinal))actual=actual.Substring(4);
  entry.imagePath=Path.GetFullPath(actual);
  bool expectedImage=String.Equals(entry.imagePath,Path.GetFullPath(expected),StringComparison.OrdinalIgnoreCase);
  try{using(var borrowed=new SafeFileHandle(file,false))using(var stream=new FileStream(borrowed,FileAccess.Read)){stream.Position=0;entry.imageSha256=Hash(stream);}}
  catch{if(!expectedImage)throw new InvalidOperationException("UNEXPECTED_PROCESS");throw;}
  if(!expectedImage)throw new InvalidOperationException("UNEXPECTED_PROCESS");
  return entry.imageSha256;
 }
 static string ReadPipe(Stream stream,PipeBudget budget){
  using(stream)using(var output=new MemoryStream()){
   byte[] buffer=new byte[4096];int n;
   while((n=stream.Read(buffer,0,buffer.Length))>0){if(Interlocked.Add(ref budget.bytes,n)>1000000)throw new InvalidOperationException("PIPE_FAILED");output.Write(buffer,0,n);}
   return new UTF8Encoding(false,true).GetString(output.ToArray());
  }
 }
 static bool CleanupComplete(List<Entry> processes,bool rootAnchored,bool untrackedCreateObserved){return rootAnchored&&!untrackedCreateObserved&&processes.Count>0&&processes.All(p=>p.osExited&&p.handleReleased);}
 static uint Left(Stopwatch clock){return (uint)Math.Max(0,10000-clock.ElapsedMilliseconds);}
 public static Result Run(string node,string helper,string mode,string expectedNodeHash,string[] environment){
  if(IntPtr.Size!=8||!new[]{"SHORT_DESCENDANT","CANCEL_DESCENDANT","FINAL_QUERY_FAILURE"}.Contains(mode))throw new InvalidOperationException("INVALID_CONFIGURATION");
  var result=new Result();var clock=new Stopwatch();
  var si=new StartupEx();si.info.cb=Marshal.SizeOf(typeof(StartupEx));si.info.flags=0x100;si.info.show=0;
  var sa=new Security();sa.size=Marshal.SizeOf(typeof(Security));sa.inherit=true;
  IntPtr inputRead=IntPtr.Zero,inputWrite=IntPtr.Zero,outputRead=IntPtr.Zero,outputWrite=IntPtr.Zero,errorRead=IntPtr.Zero,errorWrite=IntPtr.Zero;
  IntPtr attributeSize=IntPtr.Zero,handleList=IntPtr.Zero,env=IntPtr.Zero;
  var pi=new ProcessInfo();bool launched=false,pending=false,attributesReady=false,rootAnchored=false,untrackedCreateObserved=false;
  DebugEvent current=new DebugEvent();long sequence=0;
  StreamWriter writer=null;Task<string> stdout=null,stderr=null;
  try{
   Require(CreatePipe(out inputRead,out inputWrite,ref sa,0));Require(SetHandleInformation(inputWrite,1,0));
   Require(CreatePipe(out outputRead,out outputWrite,ref sa,0));Require(SetHandleInformation(outputRead,1,0));
   Require(CreatePipe(out errorRead,out errorWrite,ref sa,0));Require(SetHandleInformation(errorRead,1,0));
   InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref attributeSize);
   if(attributeSize==IntPtr.Zero)throw new InvalidOperationException("ATTRIBUTE_SIZE");
   si.attributes=Marshal.AllocHGlobal(attributeSize);Require(InitializeProcThreadAttributeList(si.attributes,1,0,ref attributeSize));attributesReady=true;
   handleList=Marshal.AllocHGlobal(IntPtr.Size*3);Marshal.Copy(new[]{inputRead,outputWrite,errorWrite},0,handleList,3);
   Require(UpdateProcThreadAttribute(si.attributes,0,new IntPtr(0x20002),handleList,new IntPtr(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero));
   si.info.input=inputRead;si.info.output=outputWrite;si.info.error=errorWrite;
   string block=String.Join("\0",environment)+"\0\0";env=Marshal.StringToHGlobalUni(block);
   if(node.Contains("\"")||helper.Contains("\""))throw new InvalidOperationException("INVALID_PATH");
   var command=new StringBuilder("\""+node+"\" \""+helper+"\" "+mode);
   clock.Start();Require(CreateProcessW(node,command,IntPtr.Zero,IntPtr.Zero,true,RootCreationFlags,env,Path.GetDirectoryName(helper),ref si,out pi));launched=true;
   Require(DebugSetProcessKillOnExit(true));
   Close(ref inputRead);Close(ref outputWrite);Close(ref errorWrite);
   writer=new StreamWriter(new FileStream(new SafeFileHandle(inputWrite,true),FileAccess.Write),new UTF8Encoding(false));inputWrite=IntPtr.Zero;writer.AutoFlush=true;
   var outputStream=new FileStream(new SafeFileHandle(outputRead,true),FileAccess.Read);outputRead=IntPtr.Zero;
   var errorStream=new FileStream(new SafeFileHandle(errorRead,true),FileAccess.Read);errorRead=IntPtr.Zero;
   var pipeBudget=new PipeBudget();stdout=Task.Run(()=>ReadPipe(outputStream,pipeBudget));stderr=Task.Run(()=>ReadPipe(errorStream,pipeBudget));
   while(true){
    if(Left(clock)==0)throw new TimeoutException();
    if(!WaitForDebugEvent(out current,Left(clock))){if(Marshal.GetLastWin32Error()==121)throw new TimeoutException();throw new Win32Exception(Marshal.GetLastWin32Error());}
    pending=true;sequence++;uint continuation=0x00010002;Entry entry=result.processes.FirstOrDefault(p=>p.pid==current.pid&&!p.osExited);
    if(current.kind==3){
     int maximum=mode=="FINAL_QUERY_FAILURE"?1:2;if(result.processes.Count>=maximum){untrackedCreateObserved=true;throw new InvalidOperationException("UNEXPECTED_PROCESS");}
     entry=new Entry();entry.instance=result.processes.Count+1;entry.pid=current.pid;entry.createSequence=sequence;result.processes.Add(entry);
     Require(DuplicateHandle(GetCurrentProcess(),current.process,GetCurrentProcess(),out entry.owned,0,false,2));
     long created,exited,kernel,user;Require(GetProcessTimes(entry.owned,out created,out exited,out kernel,out user));entry.creationFileTime=created.ToString(System.Globalization.CultureInfo.InvariantCulture);
     try{entry.imageSha256=ImageHash(current.fileOrThread,node,entry);}finally{if(current.fileOrThread!=IntPtr.Zero){Require(CloseHandle(current.fileOrThread));current.fileOrThread=IntPtr.Zero;}}
     if(entry.imageSha256!=expectedNodeHash)throw new InvalidOperationException("UNEXPECTED_PROCESS");
     if(entry.instance==1){
      if(current.pid!=pi.pid)throw new InvalidOperationException("UNEXPECTED_PROCESS");
      rootAnchored=true;
      if(pi.process==current.process)pi.process=IntPtr.Zero;else Close(ref pi.process);
      if(pi.thread==current.initialThread)pi.thread=IntPtr.Zero;else Close(ref pi.thread);
     }
    }else if(current.kind==1){
     if(entry==null)throw new InvalidOperationException("UNEXPECTED_PROCESS");
     if(current.exitOrException==0x80000003&&current.firstChance==1&&!entry.initialBreakpoint){
      entry.initialBreakpoint=true;
      if(mode=="CANCEL_DESCENDANT"&&entry.instance==2)writer.Write("cancel\n");
     }else{entry.unexpectedException=true;continuation=0x80010001;result.error="UNEXPECTED_EXCEPTION";}
    }else if(current.kind==6){
     if(current.fileOrThread!=IntPtr.Zero){Require(CloseHandle(current.fileOrThread));current.fileOrThread=IntPtr.Zero;}
    }else if(current.kind==5){
     if(entry==null)throw new InvalidOperationException("UNEXPECTED_PROCESS");
     entry.exitSequence=sequence;
    }
    Require(ContinueDebugEvent(current.pid,current.tid,continuation));pending=false;
    if(current.kind==5){
     Require(WaitForSingleObject(entry.owned,Left(clock))==0);entry.osExited=true;
     long created,exited,kernel,user;Require(GetProcessTimes(entry.owned,out created,out exited,out kernel,out user));
     if(entry.creationFileTime!=created.ToString(System.Globalization.CultureInfo.InvariantCulture))throw new InvalidOperationException("UNEXPECTED_PROCESS");
     if(mode=="FINAL_QUERY_FAILURE"){entry.queryStatus="INJECTED";result.error="INJECTED_FINAL_QUERY_FAILURE";}
     else{entry.finalPeakBytes=Peak(entry.owned);entry.queryStatus="FINAL";}
    }
    if(result.error!=null&&result.error!="INJECTED_FINAL_QUERY_FAILURE")throw new InvalidOperationException(result.error);
    if(result.processes.Count>0&&result.processes.All(p=>p.osExited))break;
   }
   writer.Dispose();writer=null;
   if(!Task.WaitAll(new Task[]{stdout,stderr},(int)Left(clock)))throw new TimeoutException();
   result.rootOutput=stdout.Result;if(stderr.Result!="")throw new InvalidOperationException("PIPE_FAILED");
  }catch(Exception ex){
   var win=ex as Win32Exception;
   result.error=win!=null?"PLATFORM_FAILED_"+win.NativeErrorCode:(ex is TimeoutException?"DEADLINE_EXCEEDED":
    ex.Message=="UNEXPECTED_PROCESS"?"UNEXPECTED_PROCESS":ex.Message=="UNEXPECTED_EXCEPTION"?"UNEXPECTED_EXCEPTION":ex.Message=="PIPE_FAILED"?"PIPE_FAILED":"COLLECTOR_FAILED");
  }finally{
   if(result.processes.Any(p=>!p.osExited)||launched&&result.processes.Count==0){
    foreach(var p in result.processes.Where(p=>!p.osExited&&p.owned!=IntPtr.Zero))TerminateProcess(p.owned,1);
    if(pi.process!=IntPtr.Zero)TerminateProcess(pi.process,1);
    if(pending&&current.kind==3&&current.process!=IntPtr.Zero)TerminateProcess(current.process,1);
    if(pending){if((current.kind==3||current.kind==6)&&current.fileOrThread!=IntPtr.Zero)CloseHandle(current.fileOrThread);ContinueDebugEvent(current.pid,current.tid,0x80010001);pending=false;}
    while(Left(clock)>0&&result.processes.Any(p=>!p.osExited)){
     DebugEvent ev;if(!WaitForDebugEvent(out ev,Left(clock)))break;sequence++;
     var p=result.processes.FirstOrDefault(x=>x.pid==ev.pid&&!x.osExited);
     if((ev.kind==3||ev.kind==6)&&ev.fileOrThread!=IntPtr.Zero)CloseHandle(ev.fileOrThread);
     if(ev.kind==3){untrackedCreateObserved=true;if(ev.process!=IntPtr.Zero)TerminateProcess(ev.process,1);}
     ContinueDebugEvent(ev.pid,ev.tid,ev.kind==1?0x80010001u:0x00010002u);
     if(ev.kind==5&&p!=null){p.exitSequence=sequence;p.osExited=WaitForSingleObject(p.owned,Left(clock))==0;}
    }
   }
   foreach(var p in result.processes){if(p.owned!=IntPtr.Zero){p.handleReleased=CloseHandle(p.owned);p.owned=IntPtr.Zero;}}
   result.completeCleanup=CleanupComplete(result.processes,rootAnchored,untrackedCreateObserved);
   if(writer!=null)try{writer.Dispose();}catch{result.completeCleanup=false;}
   if(stdout!=null&&stderr!=null)try{if(!Task.WaitAll(new Task[]{stdout,stderr},(int)Left(clock)))result.completeCleanup=false;}catch{result.completeCleanup=false;}
   foreach(var h in new[]{inputRead,inputWrite,outputRead,outputWrite,errorRead,errorWrite,pi.process,pi.thread})if(h!=IntPtr.Zero&&!CloseHandle(h))result.completeCleanup=false;
   if(attributesReady)DeleteProcThreadAttributeList(si.attributes);
   if(si.attributes!=IntPtr.Zero)Marshal.FreeHGlobal(si.attributes);if(handleList!=IntPtr.Zero)Marshal.FreeHGlobal(handleList);if(env!=IntPtr.Zero)Marshal.FreeHGlobal(env);
   try{result.collectorPeak=Peak(GetCurrentProcess());}catch{result.collectorPeak=0;}
  }
  return result;
 }
}
