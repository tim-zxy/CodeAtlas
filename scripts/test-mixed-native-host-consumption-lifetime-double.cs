using System;using System.Linq;using System.Collections.Generic;
public static class MixedNativeHostConsumptionUnit {
 static int passed;static void Check(bool b,string name){if(!b)throw new Exception("ASSERT:"+name);passed++;}
 static void Reject(Action a){bool refused=false;try{a();}catch(InvalidOperationException){refused=true;}Check(refused,"refusal");}
 static MixedNativeHostConsumptionLifetime.Entry E(string id,string path,MixedNativeHostConsumptionLifetime.Kind kind,string parent){return new MixedNativeHostConsumptionLifetime.Entry(id,path,kind,parent,kind==MixedNativeHostConsumptionLifetime.Kind.Ancestor?null:new string('a',64));}
 static MixedNativeHostConsumptionLifetime.Entry[] Inventory(){return new[]{
 E("root","D:/",MixedNativeHostConsumptionLifetime.Kind.Ancestor,null),
 E("dir","D:/fixed",MixedNativeHostConsumptionLifetime.Kind.Ancestor,"root"),
 E("bootstrap","D:/fixed/mixed-native-host-bootstrap.mjs",MixedNativeHostConsumptionLifetime.Kind.Bootstrap,"dir"),
 E("owner","D:/fixed/mixed-native-owner-context.mjs",MixedNativeHostConsumptionLifetime.Kind.PrehookOwner,"dir"),
 E("loader","D:/fixed/mixed-native-host-module-loader.mjs",MixedNativeHostConsumptionLifetime.Kind.PrehookLoader,"dir"),
 E("manifest","D:/fixed/manifest.json",MixedNativeHostConsumptionLifetime.Kind.Manifest,"dir"),
 E("descriptor","D:/fixed/operation.json",MixedNativeHostConsumptionLifetime.Kind.Descriptor,"dir"),
 E("sql","D:/fixed/migration.sql",MixedNativeHostConsumptionLifetime.Kind.PathData,"dir"),
 E("node","D:/fixed/node.exe",MixedNativeHostConsumptionLifetime.Kind.Tool,"dir")};}
 sealed class Ops:MixedNativeHostConsumptionLifetime.IOperations {
  public readonly List<string> trace=new List<string>();public int opens;public int failAt=-1;public Action onOpen;public bool uncertain,throwOpen,inherit,verify=true,reconcile=true,close=true,throwClose,duplicate;
  public MixedNativeHostConsumptionLifetime.OpenResult Open(MixedNativeHostConsumptionLifetime.Entry e){trace.Add("open:"+e.id);opens++;if(onOpen!=null)onOpen();if(opens==failAt){if(throwOpen)throw new Exception();return new MixedNativeHostConsumptionLifetime.OpenResult(uncertain?MixedNativeHostConsumptionLifetime.OpenOutcome.Unknown:MixedNativeHostConsumptionLifetime.OpenOutcome.NotOpened,0,false);}return new MixedNativeHostConsumptionLifetime.OpenResult(MixedNativeHostConsumptionLifetime.OpenOutcome.KnownOpen,duplicate?1:opens,!inherit);}
  public bool Verify(MixedNativeHostConsumptionLifetime.Entry e,long h){trace.Add("verify:"+e.id);return verify;}
  public bool Reconcile(MixedNativeHostConsumptionLifetime.Entry[] e,long[] h){trace.Add("reconcile");return reconcile;}
  public bool Close(long h){trace.Add("close:"+h);if(throwClose)throw new Exception();return close;}
 }
 static MixedNativeHostConsumptionLifetime L(Ops o){return new MixedNativeHostConsumptionLifetime(Inventory(),o);}
 static void All(MixedNativeHostConsumptionLifetime l){foreach(MixedNativeHostConsumptionLifetime.Consumer c in Enum.GetValues(typeof(MixedNativeHostConsumptionLifetime.Consumer)))l.Settle(c);}
 public static string Run(){
  var ops=new Ops();var l=L(ops);Check(l.Acquire(),"acquire");Check(ops.opens==9&&ops.trace.Last()=="reconcile","complete reconcile");Check(ops.trace.IndexOf("open:root")<ops.trace.IndexOf("open:dir")&&ops.trace.IndexOf("open:dir")<ops.trace.IndexOf("open:sql"),"ancestors first");
  Check(!l.Snapshot().executionAuthorized&&!l.Snapshot().productionAdmission&&!l.Snapshot().measurementEligible&&!l.Snapshot().moduleClosureAuthenticated&&l.Snapshot().liveAdmission=="NOT_READY","no authority");
  Reject(()=>l.Acquire());l.BeginConsumption();Reject(()=>l.Release());Check(!ops.trace.Any(x=>x.StartsWith("close:")),"early release closes nothing");All(l);l.Release();Check(ops.trace.Where(x=>x.StartsWith("close:")).SequenceEqual(Enumerable.Range(1,9).Reverse().Select(x=>"close:"+x)),"reverse release");Check(l.Snapshot().phase=="RELEASED","released");l.Release();Check(ops.trace.Count(x=>x.StartsWith("close:"))==9,"no retry");
  ops=new Ops{failAt=4};l=L(ops);Check(!l.Acquire()&&ops.opens==4,"partial refusal");l.Release();Check(l.Snapshot().phase=="RELEASED"&&ops.trace.Count(x=>x.StartsWith("close:"))==3,"partial known cleanup");
  foreach(bool throws in new[]{false,true}){ops=new Ops{failAt=3,uncertain=true,throwOpen=throws};l=L(ops);Check(!l.Acquire(),"uncertain open");l.Release();Check(l.Snapshot().phase=="UNKNOWN"&&l.Snapshot().uncertain>0&&ops.trace.Count(x=>x.StartsWith("close:"))==2,"unknown not invented");Reject(()=>l.BeginConsumption());}
  ops=new Ops{inherit=true};l=L(ops);Check(!l.Acquire(),"inheritable refused");l.Release();Check(ops.opens==1&&ops.trace.Contains("close:1"),"inheritable known retained");
  ops=new Ops{duplicate=true};l=L(ops);Check(!l.Acquire(),"duplicate refused");l.Release();Check(l.Snapshot().phase=="UNKNOWN"&&ops.trace.Count(x=>x=="close:1")==1,"duplicate not double close");
  ops=new Ops{verify=false};l=L(ops);Check(!l.Acquire()&&ops.opens==9,"all acquired before handle verify");l.Release();Check(ops.trace.Count(x=>x.StartsWith("close:"))==9,"verify cleanup");
  ops=new Ops{reconcile=false};l=L(ops);Check(!l.Acquire(),"reconcile refusal");l.Release();Check(l.Snapshot().phase=="RELEASED","reconcile cleanup");
  foreach(bool throws in new[]{false,true}){ops=new Ops{close=false,throwClose=throws};l=L(ops);l.Acquire();l.Release();l.Release();Check(l.Snapshot().phase=="UNKNOWN"&&l.Snapshot().knownPending==9&&ops.trace.Count(x=>x.StartsWith("close:"))==9,"close failure sticky all attempted once");}
  l=L(new Ops());Reject(()=>l.Settle(MixedNativeHostConsumptionLifetime.Consumer.ControlEof));l.Acquire();l.BeginConsumption();l.Settle(MixedNativeHostConsumptionLifetime.Consumer.ControlEof);Reject(()=>l.Settle(MixedNativeHostConsumptionLifetime.Consumer.ControlEof));Reject(()=>l.Settle((MixedNativeHostConsumptionLifetime.Consumer)99));
  var inv=Inventory();Reject(()=>new MixedNativeHostConsumptionLifetime(inv.Where(x=>x.id!="owner").ToArray(),new Ops()));Reject(()=>new MixedNativeHostConsumptionLifetime(inv.Where(x=>x.id!="dir").ToArray(),new Ops()));Reject(()=>new MixedNativeHostConsumptionLifetime(inv.Concat(new[]{inv[0]}).ToArray(),new Ops()));Reject(()=>E("bad","D:/fixed/../other",MixedNativeHostConsumptionLifetime.Kind.Tool,"dir"));
  // Original startup ledger, not fabricated root-created state; no OS calls.
  ops=new Ops();var ledger=new MixedNativeHostHandleLedger(h=>true);var adapter=new MixedNativeHostConsumptionOfflineComposition(Inventory(),ops,ledger);Reject(()=>adapter.StartSubstitute(x=>{},true));Check(ops.opens==0,"live request refused before acquire");
  bool called=false;adapter.StartSubstitute(x=>{called=true;Check(adapter.Snapshot().phase=="CONSUMING","mark before callback");x.Keep(MixedNativeHostHandleLedger.Role.RootProcess,101);x.Keep(MixedNativeHostHandleLedger.Role.RootThread,102);x.ObserveRootCreate(101,102);});Check(called,"startup called");
  foreach(MixedNativeHostConsumptionLifetime.Consumer c in Enum.GetValues(typeof(MixedNativeHostConsumptionLifetime.Consumer)))adapter.SettleSubstitute(c);
  Reject(()=>adapter.Release());Check(!ops.trace.Any(x=>x.StartsWith("close:")),"original startup aliases still owned");ledger.DebuggerExitContinued();adapter.Release();Check(adapter.Snapshot().phase=="RELEASED","original continued exit join");
  ops=new Ops();adapter=new MixedNativeHostConsumptionOfflineComposition(Inventory(),ops,new MixedNativeHostHandleLedger(h=>true));Reject(()=>adapter.StartSubstitute(x=>{throw new Exception();}));Reject(()=>adapter.Release());foreach(MixedNativeHostConsumptionLifetime.Consumer c in Enum.GetValues(typeof(MixedNativeHostConsumptionLifetime.Consumer)))adapter.SettleSubstitute(c);adapter.Release();Check(adapter.Snapshot().phase=="UNKNOWN","callback uncertainty remains");
  ops=new Ops{reconcile=false};adapter=new MixedNativeHostConsumptionOfflineComposition(Inventory(),ops,new MixedNativeHostHandleLedger(h=>true));called=false;Reject(()=>adapter.StartSubstitute(x=>called=true));Check(!called,"no startup on refusal");adapter.Release();
  ops=new Ops();l=L(ops);ops.onOpen=()=>l.Release();Check(!l.Acquire(),"reentrant release refuses acquisition");Check(l.Snapshot().phase=="UNKNOWN"&&ops.opens==1,"reentrant release cannot leak later handles");l.Release();
  return "{\"kind\":\"PURE_HOST_CONSUMPTION_LIFETIME_UNIT\",\"passed\":"+passed+",\"actualWindowsCalls\":0,\"actualHostRuns\":0,\"liveAdmission\":\"NOT_READY\"}";
 }
}
