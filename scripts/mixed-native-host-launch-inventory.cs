using System;
using System.Linq;

// Pure offline correlation only. Never file protection, inventory completeness or launch authority.
public static class MixedNativeHostLaunchInventory {
 static void Need(bool value){if(!value)throw new InvalidOperationException("HOST_LAUNCH_INVENTORY_MISMATCH");}
 static bool SamePath(string entryPath,string planPath){return String.Equals(entryPath,planPath.Replace('\\','/'),StringComparison.OrdinalIgnoreCase);}
 static void Match(MixedNativeHostConsumptionLifetime.Entry[] entries,MixedNativeHostConsumptionLifetime.Kind kind,string path,string sha){
  Need(entries.Count(entry=>entry.kind==kind&&SamePath(entry.path,path)&&String.Equals(entry.sha256,sha,StringComparison.Ordinal))==1);
 }
 // The original Lifetime constructor remains responsible for the full inventory structure.
 // This void check does not retain inputs, acquire resources or produce an admission token.
 public static void Validate(MixedNativeHostLaunchPlan plan,MixedNativeHostConsumptionLifetime.Entry[] entries){
  Need(plan!=null&&entries!=null&&entries.All(entry=>entry!=null));
  Match(entries,MixedNativeHostConsumptionLifetime.Kind.Tool,plan.NodePath,plan.NodeSha256);
  Match(entries,MixedNativeHostConsumptionLifetime.Kind.Bootstrap,plan.ScriptPath,plan.ScriptSha256);
  Match(entries,MixedNativeHostConsumptionLifetime.Kind.Manifest,plan.ManifestPath,plan.ManifestSha256);
  Need(entries.Count(entry=>entry.kind==MixedNativeHostConsumptionLifetime.Kind.Ancestor&&SamePath(entry.path,plan.WorkingDirectory))==1);
 }
}
