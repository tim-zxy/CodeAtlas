using System;using System.Linq;using System.Collections.Generic;using System.Text.RegularExpressions;

// OFFLINE ONLY. Operations and settlement observations never authenticate a real path or process.
public sealed class MixedNativeHostConsumptionLifetime {
 public enum Kind {Ancestor,Bootstrap,PrehookOwner,PrehookLoader,Manifest,Descriptor,PathData,Tool,Module}
 public enum Consumer {RootAndDescendants,FinalQueryAndDuplicates,ControlEof,StderrEof,ConsumingWorkers}
 public enum OpenOutcome {KnownOpen,NotOpened,Unknown}
 static void Need(bool b){if(!b)throw new InvalidOperationException("INVALID_HOST_CONSUMPTION_LIFETIME");}
 public sealed class Entry {
  public readonly string id,path,parentId,sha256;public readonly Kind kind;
  public Entry(string id,string path,Kind kind,string parentId,string sha256){
   Need(!String.IsNullOrEmpty(id)&&Enum.IsDefined(typeof(Kind),kind)&&path!=null&&Regex.IsMatch(path,@"\A[A-Z]:/")&&path.IndexOf('\\')<0&&path.IndexOf('\0')<0&&path.IndexOf(':',2)<0);
   string rest=path.Substring(3);Need(rest.Length==0||rest.Split('/').All(x=>x.Length>0&&x!="."&&x!=".."&&x.Trim()==x&&!x.EndsWith(".",StringComparison.Ordinal)&&x.IndexOfAny(new[]{'<','>','"','|','?','*'})<0));
   Need(kind==Kind.Ancestor?sha256==null:sha256!=null&&Regex.IsMatch(sha256,@"\A[a-f0-9]{64}\z"));
   this.id=id;this.path=path;this.kind=kind;this.parentId=parentId;this.sha256=sha256;
  }
 }
 public sealed class OpenResult {
  public readonly OpenOutcome outcome;public readonly long handle;public readonly bool noninheritable;
  public OpenResult(OpenOutcome outcome,long handle,bool noninheritable){Need(Enum.IsDefined(typeof(OpenOutcome),outcome)&&(outcome==OpenOutcome.KnownOpen?handle>0:handle==0));this.outcome=outcome;this.handle=handle;this.noninheritable=noninheritable;}
 }
 public interface IOperations {
  OpenResult Open(Entry entry);bool Verify(Entry entry,long handle);bool Reconcile(Entry[] entries,long[] handles);bool Close(long handle);
 }
 sealed class Owned {internal Entry entry;internal long handle;internal bool attempted,released;}
 public sealed class State {
  public readonly string phase,liveAdmission="NOT_READY";public readonly int knownPending,uncertain;
  public readonly bool executionAuthorized=false,productionAdmission=false,measurementEligible=false,moduleClosureAuthenticated=false;
  internal State(string phase,int pending,int uncertain){this.phase=phase;knownPending=pending;this.uncertain=uncertain;}
 }
 readonly Entry[] entries;readonly IOperations operations;readonly List<Owned> owned=new List<Owned>();readonly HashSet<Consumer> settled=new HashSet<Consumer>();
 readonly int ownerThread=System.Threading.Thread.CurrentThread.ManagedThreadId;bool attempted,ready,consuming,released,acquiring;int uncertain;
 void Owner(){Need(System.Threading.Thread.CurrentThread.ManagedThreadId==ownerThread);}
 public MixedNativeHostConsumptionLifetime(Entry[] entries,IOperations operations){
  Need(entries!=null&&entries.Length>0&&entries.All(x=>x!=null)&&operations!=null);
  Need(entries.Select(x=>x.id).Distinct(StringComparer.Ordinal).Count()==entries.Length&&entries.Select(x=>x.path).Distinct(StringComparer.OrdinalIgnoreCase).Count()==entries.Length);
  var byId=entries.ToDictionary(x=>x.id,StringComparer.Ordinal);
  foreach(var e in entries){
   if(e.path.Length==3){Need(e.kind==Kind.Ancestor&&e.parentId==null);continue;}
   Entry parent;Need(e.parentId!=null&&byId.TryGetValue(e.parentId,out parent));parent=byId[e.parentId];
   string expected=e.path.Substring(0,e.path.LastIndexOf('/'));if(expected.Length==2)expected+="/";
   Need(parent.kind==Kind.Ancestor&&String.Equals(parent.path,expected,StringComparison.OrdinalIgnoreCase));
  }
  foreach(var k in new[]{Kind.Bootstrap,Kind.PrehookOwner,Kind.PrehookLoader,Kind.Manifest,Kind.Descriptor,Kind.PathData,Kind.Tool})Need(entries.Any(e=>e.kind==k));
  foreach(var pair in new[]{Tuple.Create(Kind.Bootstrap,"mixed-native-host-bootstrap.mjs"),Tuple.Create(Kind.PrehookOwner,"mixed-native-owner-context.mjs"),Tuple.Create(Kind.PrehookLoader,"mixed-native-host-module-loader.mjs")})Need(entries.Count(e=>e.kind==pair.Item1)==1&&entries.Any(e=>e.kind==pair.Item1&&e.path.EndsWith("/"+pair.Item2,StringComparison.Ordinal)));
  this.entries=entries.OrderBy(e=>e.path.Count(c=>c=='/')).ThenBy(e=>e.path,StringComparer.OrdinalIgnoreCase).ToArray();this.operations=operations;
 }
 public bool Acquire(){
  Owner();Need(!attempted&&!released);attempted=true;acquiring=true;
  try{return AcquireOnce();}finally{acquiring=false;}
 }
 bool AcquireOnce(){
  foreach(var e in entries){
   OpenResult result;try{result=operations.Open(e);}catch{uncertain++;return false;}
   if(result==null||result.outcome==OpenOutcome.Unknown){uncertain++;return false;}
   if(result.outcome==OpenOutcome.NotOpened)return false;
   if(owned.Any(x=>x.handle==result.handle)){uncertain++;return false;}
   owned.Add(new Owned{entry=e,handle=result.handle});
   if(!result.noninheritable)return false;
  }
  try{
   foreach(var item in owned)if(!operations.Verify(item.entry,item.handle))return false;
   if(!operations.Reconcile((Entry[])entries.Clone(),owned.Select(x=>x.handle).ToArray()))return false;
  }catch{return false;}
  ready=true;return true;
 }
 public void BeginConsumption(){Owner();Need(ready&&!consuming&&!released&&uncertain==0);consuming=true;}
 public void Settle(Consumer consumer){Owner();Need(consuming&&!released&&Enum.IsDefined(typeof(Consumer),consumer)&&settled.Add(consumer));}
 internal void MarkUncertain(){Owner();uncertain++;}
 public void Release(){
  Owner();Need(!acquiring);if(released)return;Need(!consuming||settled.Count==Enum.GetValues(typeof(Consumer)).Length);released=true;
  foreach(var item in owned.AsEnumerable().Reverse()){
   if(item.attempted)continue;item.attempted=true;
   try{item.released=operations.Close(item.handle);}catch{item.released=false;}
   if(!item.released)uncertain++;
  }
 }
 public State Snapshot(){Owner();return new State(uncertain>0?"UNKNOWN":released?"RELEASED":consuming?"CONSUMING":ready?"OFFLINE_OWNERSHIP_READY":attempted?"REFUSED":"FIXED",owned.Count(x=>!x.released),uncertain);}
}

// Deliberately accepts substitute observations only. No QualificationHostRoot.Start binding.
public sealed class MixedNativeHostConsumptionOfflineComposition {
 readonly MixedNativeHostConsumptionLifetime lifetime;readonly MixedNativeHostHandleLedger startup;bool started,consuming;
 public MixedNativeHostConsumptionOfflineComposition(MixedNativeHostConsumptionLifetime.Entry[] inventory,MixedNativeHostConsumptionLifetime.IOperations operations,MixedNativeHostHandleLedger startup){if(startup==null)throw new InvalidOperationException("INVALID_HOST_CONSUMPTION_COMPOSITION");lifetime=new MixedNativeHostConsumptionLifetime(inventory,operations);this.startup=startup;}
 public void StartSubstitute(Action<MixedNativeHostHandleLedger> start,bool requestLive=false){
  if(requestLive||started||start==null)throw new InvalidOperationException("HOST_CONSUMPTION_LIVE_NOT_READY");
  started=true;if(!lifetime.Acquire())throw new InvalidOperationException("HOST_CONSUMPTION_ACQUISITION_REFUSED");
  lifetime.BeginConsumption();consuming=true;
  try{start(startup);}catch{lifetime.MarkUncertain();throw new InvalidOperationException("HOST_CONSUMPTION_SUBSTITUTE_START_UNCERTAIN");}
 }
 public void SettleSubstitute(MixedNativeHostConsumptionLifetime.Consumer consumer){lifetime.Settle(consumer);}
 public void Release(){if(consuming&&!startup.Snapshot().allReleased)throw new InvalidOperationException("HOST_STARTUP_RESOURCES_UNSETTLED");lifetime.Release();}
 public MixedNativeHostConsumptionLifetime.State Snapshot(){return lifetime.Snapshot();}
}
