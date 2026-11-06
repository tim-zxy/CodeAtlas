# Pure policy unit only. Never load/call MixedProcessCollector or a Win32 API.
$ErrorActionPreference='Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'mixed-native-observer-policy.cs')
$script:passed=0;$script:failures=New-Object 'System.Collections.Generic.List[string]'
function Assert-Unit([bool]$condition,[string]$label){if(-not $condition){$script:failures.Add($label)}else{$script:passed++}}
function Refuses([scriptblock]$action){$failure=$null;try{&$action|Out-Null}catch{$failure=$_.Exception.GetBaseException()};Assert-Unit ($null-ne$failure -and $failure.Message -eq 'INVALID_MIXED_NATIVE_OBSERVER') 'refusal'}
$context='a'*64;$hostSha='b'*64;$nativeSha='c'*64;$commandSha='d'*64
function New-Policy([string[]]$roles=@('V2')){
 $bindings=New-Object 'System.Collections.Generic.List[MixedNativeObserverPolicy+Binding]'
 for($i=0;$i-lt$roles.Length;$i++){$bindings.Add([MixedNativeObserverPolicy+Binding]::new(('launch-'+($i+1)),$roles[$i],$commandSha,'D:/fixture/native.exe',$nativeSha))}
 return [MixedNativeObserverPolicy]::new($context,[uint32]100,'D:/fixture/node.exe',$hostSha,$bindings.ToArray(),1024,65536,100)
}
function New-Sender {return [MixedNativeControlCodec]::new($context,1024,65536,100)}
function Anchor($policy){$policy.CaptureHostBeforeContinue([uint32]100,'host-created','D:/fixture/node.exe',$hostSha,$true)}
function Complete-Child($policy,$sender,[string]$id,[string]$role,[uint32]$fixturePid,[string]$created){
 $ready=@($policy.Receive($sender.Encode('INTENT',@($id,$role,$commandSha))));Assert-Unit ($ready.Count-eq1) 'ready'
 $early=@($policy.Receive($sender.Encode('SPAWNED',@($id,[string]$fixturePid))));Assert-Unit ($early.Count-eq0) 'early spawned queued'
 $acquired=$policy.CaptureChildBeforeContinue($fixturePid,$created,'D:/fixture/native.exe',$nativeSha,$true);Assert-Unit ($acquired.Contains("`tACQUIRED`t")) 'acquire'
 $none=$policy.RecordChildExitAndRelease($fixturePid,$created,$true,$true,'RECORDED',[Nullable[long]]4096);Assert-Unit ($null-eq$none) 'wait node close'
 $released=@($policy.Receive($sender.Encode('CLOSED',@($id,[string]$fixturePid,$created,'0','~'))));Assert-Unit ($released.Count-eq1) 'released'
 return @($ready[0],$acquired,$released[0])
}
$policy=New-Policy;Anchor $policy;$sender=New-Sender
$frames=Complete-Child $policy $sender 'launch-1' 'V2' 200 'child-created'
$policy.RecordHostExitAndRelease('host-created',0,$true,$true,'RECORDED',[Nullable[long]]8192)
$policy.CloseControlInput($true)
$snapshot=$policy.Snapshot();Assert-Unit $snapshot.complete 'complete';Assert-Unit $snapshot.cleanupComplete 'clean';Assert-Unit (-not $snapshot.measurementEligible -and -not $snapshot.executionAuthorized -and -not $snapshot.productionAdmission) 'no authority'
$receiver=New-Sender
foreach($line in $frames){$decoded=$receiver.Decode($line);Assert-Unit ($decoded.Type.Length-gt0) 'decode'}
$literal='CA_MIXED_NATIVE_CONTROL_V1'+"`t"+$context+"`t1`tREADY`tlaunch-1`tV2`t"+$commandSha+"`n"
Assert-Unit ($frames[0]-eq$literal) 'literal wire'
$policy2=New-Policy -roles @('V2','V5');Anchor $policy2;$sender2=New-Sender
$null=Complete-Child $policy2 $sender2 'launch-1' 'V2' 200 'first'
$null=Complete-Child $policy2 $sender2 'launch-2' 'V5' 200 'second'
Assert-Unit ($policy2.Snapshot().settledLaunches-eq2) 'same-image roles and released pid reuse'
$bad=New-Policy;Anchor $bad;$s=New-Sender;Refuses {$bad.Receive($s.Encode('INTENT',@('launch-1','V5',$commandSha)))}
$bad=New-Policy;Refuses {$bad.CaptureHostBeforeContinue([uint32]101,'root','D:/fixture/node.exe',$hostSha,$true)}
$bad=New-Policy;Anchor $bad;Refuses {$bad.CaptureChildBeforeContinue([uint32]200,'c','D:/fixture/native.exe',$nativeSha,$true)};Assert-Unit (-not $bad.Snapshot().cleanupComplete) 'unknown create stays unknown'
$bad=New-Policy;Anchor $bad;$s=New-Sender;$null=$bad.Receive($s.Encode('INTENT',@('launch-1','V2',$commandSha)));Refuses {$bad.CaptureChildBeforeContinue([uint32]200,'c','D:/fixture/conhost.exe',$nativeSha,$true)}
$bad=New-Policy;Anchor $bad;$s=New-Sender;$null=$bad.Receive($s.Encode('INTENT',@('launch-1','V2',$commandSha)));Refuses {$bad.CaptureChildBeforeContinue([uint32]200,'c','D:/fixture/native.exe',$nativeSha,$false)}
$bad=New-Policy;Anchor $bad;$s=New-Sender;$frame=$s.Encode('INTENT',@('launch-1','V2',$commandSha));$null=$bad.Receive($frame);Refuses {$bad.Receive($frame)}
$bad=New-Policy;Anchor $bad;$s=New-Sender;$null=$bad.Receive($s.Encode('INTENT',@('launch-1','V2',$commandSha)));$null=$bad.CaptureChildBeforeContinue([uint32]200,'c','D:/fixture/native.exe',$nativeSha,$true);Refuses {$bad.Receive($s.Encode('SPAWNED',@('launch-1','201')))}
$bad=New-Policy;Anchor $bad;Refuses {$bad.RecordException([uint32]100,1,1)}
$bad=New-Policy;Anchor $bad;$bad.RecordException([uint32]100,2147483651,1);Refuses {$bad.RecordException([uint32]100,2147483651,1)}
$bad=New-Policy;Anchor $bad;$bad.RecordHostExitAndRelease('host-created',0,$true,$true,'RECORDED',[Nullable[long]]8192);$bad.CloseControlInput($false);Assert-Unit (-not $bad.Snapshot().complete) 'truncated control cannot complete'
$bad=New-Policy;Anchor $bad;$s=New-Sender;$null=$bad.Receive($s.Encode('INTENT',@('launch-1','V2',$commandSha)));$null=$bad.Receive($s.Encode('SPAWNED',@('launch-1','200')));$abandoned=@($bad.Receive($s.Encode('ABANDON',@('launch-1'))));$decoder=New-Sender;$null=$decoder.Decode('CA_MIXED_NATIVE_CONTROL_V1'+"`t"+$context+"`t1`tREADY`tlaunch-1`tV2`t"+$commandSha+"`n");$a=$decoder.Decode($abandoned[0]);Assert-Unit ($a.Get(1)-eq'1' -and $a.Get(2)-eq'0') 'MISSING_CREATE_CANNOT_BE_CLEAN';$bad.RecordHostExitAndRelease('host-created',0,$true,$true,'RECORDED',[Nullable[long]]8192);$bad.CloseControlInput($true);Assert-Unit (-not $bad.Snapshot().cleanupComplete) 'MISSING_CREATE_STAYS_UNKNOWN'
$bad=New-Policy;Anchor $bad;$s=New-Sender;$null=$bad.Receive($s.Encode('INTENT',@('launch-1','V2',$commandSha)));$null=$bad.Receive($s.Encode('SPAWNED',@('launch-1','200')));$null=$bad.CaptureChildBeforeContinue([uint32]200,'child','D:/fixture/native.exe',$nativeSha,$true);$bad.RecordHostExitAndRelease('host-created',0,$true,$true,'RECORDED',[Nullable[long]]8192);$null=$bad.RecordChildExitAndRelease([uint32]200,'child',$true,$true,'RECORDED',[Nullable[long]]4096);$null=$bad.Receive($s.Encode('CLOSED',@('launch-1','200','child','0','~')));$bad.CloseControlInput($true);Assert-Unit (-not $bad.Snapshot().complete -and $bad.Snapshot().cleanupComplete) 'LIVE_CHILD_AFTER_HOST_NOT_COMPLETE'
$late=New-Policy;Anchor $late;$s=New-Sender;$null=$late.Receive($s.Encode('INTENT',@('launch-1','V2',$commandSha)));$null=$late.Receive($s.Encode('SPAWNED',@('launch-1','200')));$null=$late.CaptureChildBeforeContinue([uint32]200,'child','D:/fixture/native.exe',$nativeSha,$true);$null=$late.RecordChildExitAndRelease([uint32]200,'child',$true,$true,'RECORDED',[Nullable[long]]4096);$late.RecordHostExitAndRelease('host-created',0,$true,$true,'RECORDED',[Nullable[long]]8192);$null=$late.Receive($s.Encode('CLOSED',@('launch-1','200','child','0','~')));$late.CloseControlInput($true);Assert-Unit $late.Snapshot().complete 'QUEUED_CLOSE_AFTER_HOST_ALLOWED'
$bad=New-Policy;Anchor $bad;$s=New-Sender;$null=$bad.Receive($s.Encode('INTENT',@('launch-1','V2',$commandSha)));$bad.RecordHostExitAndRelease('host-created',0,$true,$true,'RECORDED',[Nullable[long]]8192);$null=$bad.Receive($s.Encode('SPAWNED',@('launch-1','200')));$bad.CloseControlInput($true);Assert-Unit (-not $bad.Snapshot().cleanupComplete) 'LATE_SPAWN_WITHOUT_CREATE_UNKNOWN'
$bad=New-Policy;Anchor $bad;Refuses {$bad.RecordChildExitAndRelease([uint32]999,'missing',$true,$true,'RECORDED',[Nullable[long]]4096)};$bad.RecordHostExitAndRelease('host-created',0,$true,$true,'RECORDED',[Nullable[long]]8192);Assert-Unit (-not $bad.Snapshot().cleanupComplete) 'UNKNOWN_EXIT_STAYS_UNKNOWN'
$bad=New-Policy;Anchor $bad;Refuses {$bad.RecordException([uint32]999,2147483651,1)};$bad.RecordHostExitAndRelease('host-created',0,$true,$true,'RECORDED',[Nullable[long]]8192);Assert-Unit (-not $bad.Snapshot().cleanupComplete) 'UNKNOWN_EXCEPTION_STAYS_UNKNOWN'
$bad=New-Policy;Anchor $bad;Refuses {$bad.RecordHostExitAndRelease('unmatched-created',0,$true,$true,'RECORDED',[Nullable[long]]8192)};$bad.RecordHostExitAndRelease('host-created',0,$true,$true,'RECORDED',[Nullable[long]]8192);Assert-Unit (-not $bad.Snapshot().cleanupComplete) 'UNKNOWN_HOST_INSTANCE_STAYS_UNKNOWN'
if($script:failures.Count-gt0){throw ('UNIT_ASSERTION_FAILED:'+($script:failures -join ','))}
@{kind='PURE_OBSERVER_POLICY_UNIT';passed=$script:passed;frames=$frames;snapshot=$snapshot;actualCollectorRuns=0;actualNativeRuns=0}|ConvertTo-Json -Depth 6 -Compress
