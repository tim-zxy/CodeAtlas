using System;
using System.Linq;
using System.Collections.Generic;

// Literal memory resources only. No OS, real handles, streams or process launch.
public static class MixedNativeHostLaunchInventoryUnit {
 static int passed;
 static void Check(bool value,string label){if(!value)throw new Exception("UNIT_ASSERTION_FAILED:"+label);passed++;}
 static string Hash(char c){return new string(c,64);}
 static MixedNativeHostConsumptionLifetime.Entry E(string id,string file,MixedNativeHostConsumptionLifetime.Kind kind,string parent,string sha){return new MixedNativeHostConsumptionLifetime.Entry(id,file,kind,parent,sha);}
 static MixedNativeHostConsumptionLifetime.Entry[] Inventory(){return new[]{
  E("root","D:/",MixedNativeHostConsumptionLifetime.Kind.Ancestor,null,null),
  E("dir","D:/fixed",MixedNativeHostConsumptionLifetime.Kind.Ancestor,"root",null),
  E("node","D:/fixed/node.exe",MixedNativeHostConsumptionLifetime.Kind.Tool,"dir",Hash('b')),
  E("boot","D:/fixed/mixed-native-host-bootstrap.mjs",MixedNativeHostConsumptionLifetime.Kind.Bootstrap,"dir",Hash('c')),
  E("owner","D:/fixed/mixed-native-owner-context.mjs",MixedNativeHostConsumptionLifetime.Kind.PrehookOwner,"dir",Hash('d')),
  E("loader","D:/fixed/mixed-native-host-module-loader.mjs",MixedNativeHostConsumptionLifetime.Kind.PrehookLoader,"dir",Hash('e')),
  E("manifest","D:/fixed/context.json",MixedNativeHostConsumptionLifetime.Kind.Manifest,"dir",Hash('a')),
  E("descriptor","D:/fixed/operation.json",MixedNativeHostConsumptionLifetime.Kind.Descriptor,"dir",Hash('f')),
  E("sql","D:/fixed/input.sql",MixedNativeHostConsumptionLifetime.Kind.PathData,"dir",Hash('1'))
 };}
 static MixedNativeHostLaunchPlan Plan(string node=null,string script=null,string manifest=null,string nodeSha=null,string scriptSha=null,string manifestSha=null,string cwd=null){return new MixedNativeHostLaunchPlan(node??"D:/fixed/node.exe",script??"D:/fixed/mixed-native-host-bootstrap.mjs",manifest??"D:/fixed/context.json",manifestSha??Hash('a'),nodeSha??Hash('b'),scriptSha??Hash('c'),cwd??"D:/fixed",new string[0],4096);}
 sealed class Ops:MixedNativeHostConsumptionLifetime.IOperations {
  public int opened,callbacks;public bool acquire=true,reconcile=true;public readonly List<long> closed=new List<long>();
  public MixedNativeHostConsumptionLifetime.OpenResult Open(MixedNativeHostConsumptionLifetime.Entry entry){opened++;return acquire?new MixedNativeHostConsumptionLifetime.OpenResult(MixedNativeHostConsumptionLifetime.OpenOutcome.KnownOpen,opened,true):new MixedNativeHostConsumptionLifetime.OpenResult(MixedNativeHostConsumptionLifetime.OpenOutcome.NotOpened,0,false);}
  public bool Verify(MixedNativeHostConsumptionLifetime.Entry entry,long handle){return handle>0;}
  public bool Reconcile(MixedNativeHostConsumptionLifetime.Entry[] entries,long[] handles){return reconcile;}
  public bool Close(long handle){closed.Add(handle);return true;}
 }
 // Test-only ordering at the original composition seam; no new production wire or authority.
 static MixedNativeHostConsumptionOfflineComposition Compose(MixedNativeHostLaunchPlan plan,MixedNativeHostConsumptionLifetime.Entry[] entries,Ops ops,MixedNativeHostHandleLedger ledger){MixedNativeHostLaunchInventory.Validate(plan,entries);return new MixedNativeHostConsumptionOfflineComposition(entries,ops,ledger);}
 static void RejectPlan(MixedNativeHostLaunchPlan plan,string label){var ops=new Ops();bool refused=false;try{var c=Compose(plan,Inventory(),ops,new MixedNativeHostHandleLedger(h=>true));c.StartSubstitute(l=>ops.callbacks++);}catch(InvalidOperationException e){refused=e.Message=="HOST_LAUNCH_INVENTORY_MISMATCH";}Check(refused,label);Check(ops.opened==0&&ops.callbacks==0,label+" before operations");}
 public static string Run(){
  var ops=new Ops();var ledger=new MixedNativeHostHandleLedger(h=>true);var composition=Compose(Plan(),Inventory(),ops,ledger);
  composition.StartSubstitute(l=>{ops.callbacks++;Check(composition.Snapshot().phase=="CONSUMING"&&ops.opened==9,"original acquire and reconcile precede callback");l.Keep(MixedNativeHostHandleLedger.Role.ToHost,101);});
  Check(ops.callbacks==1&&ops.closed.Count==0,"protected ownership retained");
  foreach(MixedNativeHostConsumptionLifetime.Consumer consumer in Enum.GetValues(typeof(MixedNativeHostConsumptionLifetime.Consumer)))composition.SettleSubstitute(consumer);
  bool unsettled=false;try{composition.Release();}catch(InvalidOperationException e){unsettled=e.Message=="HOST_STARTUP_RESOURCES_UNSETTLED";}Check(unsettled&&ops.closed.Count==0,"original startup ledger prevents early release");
  ledger.CloseAll();composition.Release();Check(ops.closed.SequenceEqual(new long[]{9,8,7,6,5,4,3,2,1}),"original reverse release");
  var state=composition.Snapshot();Check(state.phase=="RELEASED"&&!state.executionAuthorized&&!state.productionAdmission&&!state.measurementEligible&&!state.moduleClosureAuthenticated&&state.liveAdmission=="NOT_READY","consistency gives no admission");
  RejectPlan(Plan(node:"D:/other/node.exe"),"Node path mismatch");RejectPlan(Plan(nodeSha:Hash('9')),"Node hash mismatch");
  RejectPlan(Plan(script:"D:/other/mixed-native-host-bootstrap.mjs"),"Bootstrap path mismatch");RejectPlan(Plan(scriptSha:Hash('9')),"Bootstrap hash mismatch");
  RejectPlan(Plan(manifest:"D:/other/context.json"),"Manifest path mismatch");RejectPlan(Plan(manifestSha:Hash('9')),"Manifest hash mismatch");RejectPlan(Plan(cwd:"D:/other"),"cwd ancestor missing");
  var input=Inventory();input[2]=E("node","D:/fixed/node.exe",MixedNativeHostConsumptionLifetime.Kind.PathData,"dir",Hash('b'));bool badKind=false;try{MixedNativeHostLaunchInventory.Validate(Plan(),input);}catch(InvalidOperationException e){badKind=e.Message=="HOST_LAUNCH_INVENTORY_MISMATCH";}Check(badKind,"Node must be Tool");
  ops=new Ops();bool structure=false;try{Compose(Plan(),Inventory().Where(x=>x.id!="owner").ToArray(),ops,new MixedNativeHostHandleLedger(h=>true));}catch(InvalidOperationException e){structure=e.Message=="INVALID_HOST_CONSUMPTION_LIFETIME";}Check(structure&&ops.opened==0,"original constructor retains structure validation");
  foreach(bool acquisition in new[]{true,false}){ops=new Ops{acquire=!acquisition,reconcile=acquisition};composition=Compose(Plan(),Inventory(),ops,new MixedNativeHostHandleLedger(h=>true));bool refused=false;try{composition.StartSubstitute(l=>ops.callbacks++);}catch(InvalidOperationException e){refused=e.Message=="HOST_CONSUMPTION_ACQUISITION_REFUSED";}Check(refused&&ops.callbacks==0,acquisition?"acquire refusal":"reconcile refusal");composition.Release();Check(ops.closed.Count==(acquisition?0:9),"original partial ownership cleanup");}
  MixedNativeHostLaunchInventory.Validate(Plan(node:"d:/FIXED/node.exe",cwd:"d:/FIXED"),Inventory());Check(true,"existing Windows lexical spelling");
  return "{\"kind\":\"PURE_HOST_LAUNCH_INVENTORY_UNIT\",\"passed\":"+passed+",\"actualWindowsCalls\":0,\"actualHostStarts\":0,\"liveAdmission\":\"NOT_READY\"}";
 }
}
