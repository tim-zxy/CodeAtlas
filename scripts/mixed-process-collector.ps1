param(
 [Parameter(Mandatory=$true)][ValidateSet('Prepare','Collect')][string]$Action,
 [Parameter(Mandatory=$true)][string]$OutputRoot,
 [string]$NodeExecutable,
 [ValidateSet('SHORT_DESCENDANT','CANCEL_DESCENDANT','FINAL_QUERY_FAILURE')][string]$Mode,
 [string]$Freeze,
 [ValidateSet('Original','IdentityDiagnostic')][string]$Batch='Original'
)
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runRoot=[IO.Path]::GetFullPath((Join-Path $workspace '.superpowers/sdd/2026-10-29-phase1-process-acquisition-conformance/run'))
if($Batch -eq 'IdentityDiagnostic'){
 $runRoot=[IO.Path]::GetFullPath((Join-Path $workspace '.superpowers/sdd/2026-10-29-phase1-process-acquisition-identity-diagnostic/run'))
 if($Action -eq 'Collect' -and $Mode -ne 'SHORT_DESCENDANT'){throw 'INVALID_DIAGNOSTIC_MODE'}
}
$destination=[IO.Path]::GetFullPath($OutputRoot)
$assembly=Join-Path $runRoot 'collector.dll'
function Assert-PlainPath([string]$name) {
 $current=$name
 while($current) {
  if(Test-Path -LiteralPath $current) {
   $item=Get-Item -LiteralPath $current -Force
   if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'INVALID_OWNED_PATH'}
  }
  $parent=[IO.Path]::GetDirectoryName($current)
  if($parent -eq $current){break};$current=$parent
 }
}
function Save-New([string]$name,[string]$value) {
 $stream=[IO.File]::Open($name,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$bytes=[Text.Encoding]::UTF8.GetBytes($value);$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
}
Assert-PlainPath $destination
if($Action -eq 'Prepare'){
 if($destination -ne $runRoot -or $NodeExecutable -or $Mode -or $Freeze){throw 'INVALID_PREPARE'}
 [IO.Directory]::CreateDirectory($runRoot)|Out-Null
 Save-New (Join-Path $runRoot 'prepare-start.json') (@{action='Prepare';started=[DateTime]::UtcNow.ToString('o');compilationCalls=1}|ConvertTo-Json -Compress)
 if(Test-Path -LiteralPath $assembly){throw 'ASSEMBLY_ALREADY_EXISTS'}
 Add-Type -Path (Join-Path $PSScriptRoot 'mixed-process-collector.cs') -OutputAssembly $assembly -OutputType Library
 $loaded=[Reflection.Assembly]::LoadFile($assembly)
 $collectorType=$loaded.GetType('MixedProcessCollector',$true)
 $layoutExpected=@{Security=24;Startup=104;StartupEx=112;ProcessInfo=24;DebugEvent=176;Counters=72}
 $layouts=@{}
 foreach($name in $layoutExpected.Keys){
  $layout=$collectorType.GetNestedType($name,[Reflection.BindingFlags]::NonPublic)
  $size=[Runtime.InteropServices.Marshal]::SizeOf([type]$layout)
  if($size -ne $layoutExpected[$name]){throw 'ABI_LAYOUT_MISMATCH'}
  $layouts[$name]=$size
 }
 @{action='Prepare';layouts=$layouts;assembly=$assembly;sha256=(Get-FileHash -LiteralPath $assembly -Algorithm SHA256).Hash.ToLowerInvariant()}|ConvertTo-Json -Compress
 exit 0
}
$caseId=@{SHORT_DESCENDANT='G01';CANCEL_DESCENDANT='G02';FINAL_QUERY_FAILURE='G03'}[$Mode]
if($Batch -eq 'IdentityDiagnostic'){$caseId='D01'}
if(-not $caseId -or $destination -ne (Join-Path $runRoot $caseId) -or [IO.Path]::GetFullPath($Freeze) -ne (Join-Path $runRoot 'pre-execution-freeze.json')){throw 'INVALID_COLLECT'}
if($NodeExecutable -ne 'D:/Program Files/nodejs/node.exe'){throw 'INVALID_NODE'}
Assert-PlainPath $Freeze
$freezeData=Get-Content -LiteralPath $Freeze -Raw|ConvertFrom-Json
if($freezeData.kind -ne 'A6_FIXED_HELPER_FREEZE' -or $freezeData.helperTimeoutMs -ne 10000 -or $freezeData.maxOutputBytes -ne 1000000){throw 'INVALID_FREEZE'}
$expectedFiles=@(
 (Join-Path $PSScriptRoot 'mixed-process-collector.cs'),
 (Join-Path $PSScriptRoot 'mixed-process-collector.ps1'),
 (Join-Path $PSScriptRoot 'mixed-process-conformance-child.mjs'),
 (Join-Path $PSScriptRoot 'mixed-process-conformance.mjs'),
 (Join-Path $PSScriptRoot 'test-mixed-process-conformance.mjs'),
 (Join-Path $workspace 'fixtures/phase1/mixed-runtime-readiness/process-acquisition/cases.json'),
 (Join-Path $workspace 'fixtures/phase1/mixed-runtime-readiness/process-acquisition/expected.json'),
 $assembly,
 [IO.Path]::GetFullPath($NodeExecutable),
 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
)
if($freezeData.files.Count -ne $expectedFiles.Count){throw 'INVALID_FREEZE_FILES'}
foreach($name in $expectedFiles){
 Assert-PlainPath $name
 $entries=@($freezeData.files|Where-Object {$_.path -eq [IO.Path]::GetFullPath($name)})
 if($entries.Count -ne 1 -or $entries[0].sha256 -ne (Get-FileHash -LiteralPath $name -Algorithm SHA256).Hash.ToLowerInvariant()){throw 'FROZEN_FILE_CHANGED'}
}
$allowed=@('SYSTEMROOT','WINDIR','TEMP','TMP','LANG','LC_ALL','NO_COLOR')
$environment=@()
foreach($property in $freezeData.environment.PSObject.Properties){
 if($allowed -notcontains $property.Name.ToUpperInvariant() -or $property.Value -isnot [string] -or $property.Value.Contains([char]0)){throw 'INVALID_ENVIRONMENT'}
 $environment+=($property.Name+'='+$property.Value)
}
$environment=@($environment|Sort-Object)
[IO.Directory]::CreateDirectory($destination)|Out-Null
Save-New (Join-Path $destination 'attempt-start.json') (@{caseId=$caseId;mode=$Mode;started=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress)
[Reflection.Assembly]::LoadFile($assembly)|Out-Null
$nodeEntry=@($freezeData.files|Where-Object {$_.path -eq [IO.Path]::GetFullPath($NodeExecutable)})[0]
$native=[MixedProcessCollector]::Run($NodeExecutable,(Join-Path $PSScriptRoot 'mixed-process-conformance-child.mjs'),$Mode,$nodeEntry.sha256,[string[]]$environment)
$helperReport=$null
try{
 $helperReport=$native.rootOutput|ConvertFrom-Json
}catch{}
if($null -eq $helperReport){
 if(-not $native.error){$native.error='PIPE_FAILED'}
 $rootPid=if($native.processes.Count -gt 0){$native.processes[0].pid}else{0}
 $helperReport=[pscustomobject]@{pid=$rootPid;childPid=$null;childExitCode=$null;childSignal=$null;childClosed=$false;outcome='FAILED';childStdout=''}
}
$report=[ordered]@{
 kind='MIXED_PROCESS_ACQUISITION_CONFORMANCE';schemaVersion=1;mode=$Mode;measurementEligible=$false
 status=if($null -eq $native.error -and $Mode -eq 'SHORT_DESCENDANT'){'COMPLETE'}else{'INELIGIBLE'}
 completeCleanup=$native.completeCleanup;error=$native.error
 collector=@{pid=$PID;peakAtReportBytes=$native.collectorPeak;lifetimeComplete=$false}
 host=$helperReport;processes=@($native.processes.ToArray())
}
$report|ConvertTo-Json -Depth 12 -Compress
