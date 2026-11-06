using System;
using System.Collections.Generic;
using System.Linq;
public static class MixedNativeDebugBridgeUnit {
 static int passed;static long ordinal;static void Check(bool value,string label){if(!value)throw new Exception("UNIT_ASSERTION_FAILED:"+label);passed++;}
 sealed class Ops:MixedNativeDebugEventBridge.IOperations {
  public readonly List<string> log=new List<string>();public bool failContinue,failClose,failQuery,failRelease,nullCapture,throwCapture,wrongCreation;public string path="D:/fixture/native.exe";public int captures;
  public MixedNativeDebugEventBridge.Capture CaptureCreate(MixedNativeDebugEventBridge.Event e){log.Add("capture:"+e.Pid);captures++;if(throwCapture)throw new Exception("capture failed");if(nullCapture)return null;return new MixedNativeDebugEventBridge.Capture(e.Pid,"created-"+e.Pid,e.Pid==100?"D:/fixture/node.exe":path,e.Pid==100?new string('b',64):new string('c',64),new object());}
  public bool CloseImage(MixedNativeDebugEventBridge.Event e){log.Add("image:"+e.Pid);return !failClose;}
  public bool Continue(MixedNativeDebugEventBridge.Event e,uint status){log.Add("continue:"+e.Pid+":"+status);return !failContinue;}
  public MixedNativeDebugEventBridge.ExitReceipt FinalizeExit(MixedNativeDebugEventBridge.Capture c){log.Add("final:"+c.Pid);return new MixedNativeDebugEventBridge.ExitReceipt(wrongCreation?"unmatched":c.Created,true,!failRelease,failQuery?"FAILED":"RECORDED",failQuery?(long?)null:4096);}
  public bool Terminate(MixedNativeDebugEventBridge.Capture c){log.Add("terminate:"+c.Pid);return true;}
 }
 static MixedNativeDebugEventBridge.Event Ev(uint kind,uint pid){return new MixedNativeDebugEventBridge.Event(kind,pid,1,kind==3||kind==6?7:0,8,0,1,++ordinal);}
 static MixedNativeDebugEventBridge Bridge(Ops ops){ordinal=0;var b=new MixedNativeObserverPolicy.Binding("one","V2",new string('d',64),"D:/fixture/native.exe",new string('c',64));var p=new MixedNativeObserverPolicy(new string('a',64),100,"D:/fixture/node.exe",new string('b',64),new[]{b},1024,65536,100);return new MixedNativeDebugEventBridge(p,100,ops);}
 static string Send(MixedNativeControlCodec s,string type,params string[] fields){return s.Encode(type,fields);}
 static void Refuses(Action a){bool rejected=false;try{a();}catch(InvalidOperationException e){rejected=e.Message=="MIXED_NATIVE_DEBUG_BRIDGE_FAILED";}Check(rejected,"refuses");}
 public static string Run(){
  var ops=new Ops();var b=Bridge(ops);var s=new MixedNativeControlCodec(new string('a',64),1024,65536,100);
  b.HandleEvent(Ev(3,100));Check(ops.log.SequenceEqual(new[]{"capture:100","image:100","continue:100:65538"}),"HOST_CAPTURE_CLOSE_CONTINUE");
  b.ReceiveControl(Send(s,"INTENT","one","V2",new string('d',64)));var frames=b.HandleEvent(Ev(3,200));Check(frames.Length==1&&frames[0].Contains("\tACQUIRED\t"),"CREATE_WITHOUT_WAITING_SPAWNED");
  b.ReceiveControl(Send(s,"SPAWNED","one","200"));b.ReceiveControl(Send(s,"CLOSED","one","200","created-200","0","~"));frames=b.HandleEvent(Ev(5,200));Check(frames.Length==1&&frames[0].Contains("\tRELEASED\t"),"release");Check(ops.log.IndexOf("continue:200:65538",ops.log.IndexOf("image:200")+1)<ops.log.IndexOf("final:200"),"EXIT_CONTINUE_BEFORE_FINAL");b.HandleEvent(Ev(5,100));b.CloseControlInput(true);Check(b.Snapshot().complete&&b.Snapshot().cleanupComplete,"complete");Check(!b.Snapshot().executionAuthorized&&!b.Snapshot().measurementEligible&&!b.Snapshot().productionAdmission,"no authority");
  ops=new Ops();b=Bridge(ops);b.HandleEvent(Ev(3,100));Refuses(()=>b.HandleEvent(Ev(3,200)));Check(ops.log.Last()=="continue:200:65538","rejected create continued once");b.BeginAbort();Check(ops.log.Contains("terminate:200"),"rejected create retained");Refuses(()=>b.HandleEvent(Ev(5,200)));b.HandleEvent(Ev(5,100));Check(!b.Snapshot().cleanupComplete,"unknown sticky");
  ops=new Ops();b=Bridge(ops);ops.failContinue=true;Refuses(()=>b.HandleEvent(Ev(3,100)));Check(ops.log.Count(x=>x.StartsWith("continue:"))==1,"continue no retry");Check(!b.Snapshot().cleanupComplete,"uncertain continue");
  ops=new Ops();b=Bridge(ops);ops.failClose=true;Refuses(()=>b.HandleEvent(Ev(3,100)));Check(ops.log.Last()=="continue:100:65538","close failure still continues");Check(!b.Snapshot().cleanupComplete,"image cleanup unknown");
  ops=new Ops();b=Bridge(ops);b.HandleEvent(Ev(3,100));b.HandleEvent(Ev(6,100));Check(ops.log.Skip(3).SequenceEqual(new[]{"image:100","continue:100:65538"}),"DLL file close");
  ops=new Ops();b=Bridge(ops);b.HandleEvent(Ev(3,100));ops.failQuery=true;b.HandleEvent(Ev(5,100));b.CloseControlInput(true);Check(!b.Snapshot().complete&&b.Snapshot().cleanupComplete,"failed query not semantic success");
  ops=new Ops();b=Bridge(ops);b.HandleEvent(Ev(3,100));ops.failRelease=true;b.HandleEvent(Ev(5,100));b.BeginAbort();Check(!b.Snapshot().cleanupComplete&&ops.log.Count(x=>x=="final:100")==1,"failed release no double close");
  ops=new Ops();b=Bridge(ops);b.HandleEvent(Ev(3,100));Refuses(()=>b.HandleEvent(Ev(5,999)));Check(ops.log.Last()=="continue:999:65538","unknown exit continued");Check(!b.Snapshot().cleanupComplete,"unknown exit");
  ops=new Ops();b=Bridge(ops);b.HandleEvent(Ev(3,100));ops.nullCapture=true;Refuses(()=>b.HandleEvent(Ev(3,200)));ops.nullCapture=false;b.BeginAbort();b.HandleEvent(Ev(5,100));Check(!b.Snapshot().cleanupComplete,"NULL_CREATE_CAPTURE_UNKNOWN");
  ops=new Ops();b=Bridge(ops);b.HandleEvent(Ev(3,100));ops.throwCapture=true;Refuses(()=>b.HandleEvent(Ev(3,200)));Check(ops.log.Last()=="continue:200:65538","throwing capture still continued");
  ops=new Ops();b=Bridge(ops);b.HandleEvent(Ev(3,100));ops.wrongCreation=true;Refuses(()=>b.HandleEvent(Ev(5,100)));Check(!b.Snapshot().cleanupComplete,"wrong exit instance");
  ops=new Ops();b=Bridge(ops);b.HandleEvent(Ev(3,100));Refuses(()=>b.HandleEvent(new MixedNativeDebugEventBridge.Event(1,100,1,0,0,1,1,++ordinal)));Check(ops.log.Last()=="continue:100:2147549185","refused exception not handled");
  ops=new Ops();b=Bridge(ops);ops.failContinue=true;var repeated=Ev(3,100);Refuses(()=>b.HandleEvent(repeated));b.BeginAbort();Refuses(()=>b.HandleEvent(repeated));Check(ops.log.Count(x=>x.StartsWith("continue:"))==1,"UNCERTAIN_CONTINUE_NO_CROSS_CALL_RETRY");
  ops=new Ops();b=Bridge(ops);b.HandleEvent(Ev(3,100));Refuses(()=>b.HandleEvent(new MixedNativeDebugEventBridge.Event(1,999,1,0,0,1,1,++ordinal)));Check(ops.log.Last()=="continue:999:2147549185","UNKNOWN_EXCEPTION_NOT_HANDLED");
  return "{\"kind\":\"PURE_DEBUG_EVENT_BRIDGE_UNIT\",\"passed\":"+passed+",\"actualCollectorRuns\":0,\"actualOsCalls\":0}";
 }
}
