using System;
using System.Collections.Generic;
// Test-only substitute resources. No process, stream, file or operating-system operations.
public sealed class MixedNativeHostProjectionReceiverMemory : MixedNativeHostConsumptionLifetime.IOperations {
 public long opened;
 public readonly List<long> closed=new List<long>();
 readonly Dictionary<long,MixedNativeHostConsumptionLifetime.Entry> owned=new Dictionary<long,MixedNativeHostConsumptionLifetime.Entry>();
 public MixedNativeHostConsumptionLifetime.OpenResult Open(MixedNativeHostConsumptionLifetime.Entry entry){
  long h=++opened;owned.Add(h,entry);
  return new MixedNativeHostConsumptionLifetime.OpenResult(MixedNativeHostConsumptionLifetime.OpenOutcome.KnownOpen,h,true);
 }
 public bool Verify(MixedNativeHostConsumptionLifetime.Entry entry,long handle){
  return owned.ContainsKey(handle)&&Object.ReferenceEquals(owned[handle],entry);
 }
 public bool Reconcile(MixedNativeHostConsumptionLifetime.Entry[] entries,long[] handles){
  if(entries.Length!=owned.Count||entries.Length!=handles.Length)return false;
  for(int i=0;i<entries.Length;i++)if(!Verify(entries[i],handles[i]))return false;
  return true;
 }
 public bool Close(long handle){closed.Add(handle);return owned.Remove(handle);}
}
