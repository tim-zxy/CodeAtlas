# Test-only Entry[][] stdin batch. One compiler/testhost; no launch or consumption settlement.
$ErrorActionPreference='Stop'
Add-Type -Path @((Join-Path $PSScriptRoot 'mixed-native-host-startup.cs'),(Join-Path $PSScriptRoot 'mixed-native-host-consumption-lifetime.cs'),(Join-Path $PSScriptRoot 'test-mixed-native-host-protected-inventory-receiver-double.cs'))
$entryTypes=[Type[]]@([string],[string],[MixedNativeHostConsumptionLifetime+Kind],[string],[string])
$entryConstructor=[MixedNativeHostConsumptionLifetime+Entry].GetConstructor($entryTypes)
$batches=ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd())
$results=New-Object 'System.Collections.Generic.List[object]'
foreach($batch in $batches){
 $ops=New-Object MixedNativeHostProjectionReceiverMemory
 $lifetime=$null
 $stage='ENTRY_CONSTRUCTION'
 try{
  $rows=New-Object 'System.Collections.Generic.List[MixedNativeHostConsumptionLifetime+Entry]'
  foreach($e in $batch){
   $kind=[Enum]::Parse([MixedNativeHostConsumptionLifetime+Kind],[string]$e.kind,$false)
   if([Enum]::GetName([MixedNativeHostConsumptionLifetime+Kind],$kind) -cne [string]$e.kind){throw 'RECEIVER_ENUM_NAME_REQUIRED'}
   $parent=$null;if($null -ne $e.parentId){$parent=[string]$e.parentId}
   $digest=$null;if($null -ne $e.sha256){$digest=[string]$e.sha256}
   # Reflection invokes the original constructor while preserving JSON null as CLR null.
   $rows.Add($entryConstructor.Invoke([object[]]@([string]$e.id,[string]$e.path,$kind,$parent,$digest)))
  }
  $entries=$rows.ToArray()
  $stage='LIFETIME_CONSTRUCTION'
  $lifetime=[MixedNativeHostConsumptionLifetime]::new($entries,$ops)
  $stage='ACQUIRE'
  if(-not $lifetime.Acquire()){throw 'RECEIVER_ACQUISITION_REFUSED'}
  $before=$lifetime.Snapshot()
  $lifetime.Release()
  $after=$lifetime.Snapshot()
  $received=@($entries|ForEach-Object {[ordered]@{id=$_.id;path=$_.path;kind=$_.kind.ToString();parentId=$_.parentId;sha256=$_.sha256}})
  $results.Add([ordered]@{accepted=$true;entries=$received;opened=$ops.opened;closed=@($ops.closed.ToArray());beforeRelease=$before.phase;afterRelease=$after.phase;executionAuthorized=$after.executionAuthorized;productionAdmission=$after.productionAdmission;measurementEligible=$after.measurementEligible;liveAdmission=$after.liveAdmission;actualWindowsCalls=0;actualHostStarts=0})
 }catch{
  $message=$_.Exception.GetBaseException().Message
  if($null -ne $lifetime){$lifetime.Release()}
  $results.Add([ordered]@{accepted=$false;opened=$ops.opened;closed=@($ops.closed.ToArray());error=$message;errorType=$_.Exception.GetBaseException().GetType().FullName;stage=$stage;liveAdmission='NOT_READY';actualWindowsCalls=0;actualHostStarts=0})
 }
}
ConvertTo-Json -InputObject $results.ToArray() -Depth 20 -Compress
