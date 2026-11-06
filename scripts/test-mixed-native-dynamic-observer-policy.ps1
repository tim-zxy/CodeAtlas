param([Parameter(Mandatory=$true)][string]$VectorsBase64)
# Compile metadata classes only; no collector, Windows adapter or process/file API is called.
$ErrorActionPreference='Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'mixed-native-dynamic-observer-policy.cs')
$v=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($VectorsBase64)))
$script:passed=0;$script:failures=New-Object 'System.Collections.Generic.List[string]'
function Assert-Unit([bool]$condition,[string]$label){if($condition){$script:passed++}else{$script:failures.Add($label)}}
function Refuses([scriptblock]$action){$e=$null;try{&$action|Out-Null}catch{$e=$_.Exception.GetBaseException()};Assert-Unit ($null-ne$e -and $e.Message-eq'INVALID_MIXED_NATIVE_DYNAMIC_OBSERVER') 'refusal'}
$context='a'*64;$source='d'*64;$analysis='e'*64;$hostSha='b'*64;$image='c'*64
function New-Slots {
 $list=New-Object 'System.Collections.Generic.List[MixedNativeDynamicObserverPolicy+Slot]'
 foreach($x in $v){$list.Add([MixedNativeDynamicObserverPolicy+Slot]::new($x.id,$x.role,$x.phase,$x.staticSha,$x.prefix,'D:/fixture/native.exe',$image))}
 return ,$list.ToArray()
}
function New-Policy {return [MixedNativeDynamicObserverPolicy]::new($context,$source,[uint32]100,'D:/fixture/node.exe',$hostSha,(New-Slots),10000,4096,65536,100)}
function Sender {return [MixedNativeDynamicControlCodec]::new($context,4096,65536,100)}
function Anchor($p){$p.CaptureHostBeforeContinue([uint32]100,'root','D:/fixture/node.exe',$hostSha,$true,1)}
function Register($p,$s,$x,[string]$digest){return $p.Receive($s.Encode('REGISTER',@($x.id,$x.role,$x.phase,$digest,$x.staticSha,$x.stdinSha,$x.commandSha)),2)}
function Intent($p,$s,$x,[string]$digest){return $p.Receive($s.Encode('INTENT',@($x.id,$x.role,$x.phase,$digest,$x.commandSha)),3)}
$frames=New-Object 'System.Collections.Generic.List[string]'
$p=New-Policy;Anchor $p;$s=Sender
for($i=0;$i-lt$v.Count;$i++){
 $x=$v[$i];$digest=if($i-eq0){$source}else{$analysis}
 $b=@(Register $p $s $x $digest);Assert-Unit ($b.Count-eq1 -and $b[0].Contains("`tBOUND`t")) 'bound';$frames.Add($b[0])
 $ready=@(Intent $p $s $x $digest);Assert-Unit ($ready.Count-eq1 -and $ready[0].Contains("`tREADY`t")) 'ready';$frames.Add($ready[0])
 $queued=@($p.Receive($s.Encode('SPAWNED',@($x.id,'200')),4));Assert-Unit ($queued.Count-eq0) 'queued'
 $a=$p.CaptureChildBeforeContinue([uint32]200,('child-'+$i),'D:/fixture/native.exe',$image,$true,5);$frames.Add($a);Assert-Unit ($a.Contains("`tACQUIRED`t")) 'acquired'
 $wait=$p.RecordChildExitAndRelease([uint32]200,('child-'+$i),$true,$true,'RECORDED',[Nullable[long]]4096,6);Assert-Unit ($null-eq$wait) 'join waits close'
 $done=@($p.Receive($s.Encode('CLOSED',@($x.id,'200',('child-'+$i),'0','~')),7));$frames.Add($done[0]);Assert-Unit ($done.Count-eq1 -and $done[0].Contains("`tRELEASED`t")) 'released'
 Assert-Unit ($p.Snapshot().settledLaunches-eq($i+1)) 'settled'
}
$p.RecordHostExitAndRelease('root',0,$true,$true,'RECORDED',[Nullable[long]]8192,8);$p.CloseControlInput($true,9)
$snapshot=$p.Snapshot();Assert-Unit $snapshot.complete 'complete';Assert-Unit $snapshot.cleanupComplete 'clean';Assert-Unit (-not $snapshot.executionAuthorized -and -not $snapshot.productionAdmission -and -not $snapshot.measurementEligible) 'authority false'
# Independent static-prefix/hash check, and phase/role schema.
Refuses {[MixedNativeDynamicObserverPolicy+Slot]::new('x','V2','ANALYSIS',('f'*64),$v[0].prefix,'D:/fixture/native.exe',$image)}
Refuses {[MixedNativeDynamicObserverPolicy+Slot]::new('x','V5','ANALYSIS',$v[0].staticSha,$v[0].prefix,'D:/fixture/native.exe',$image)}
$slots=New-Slots;Refuses {[MixedNativeDynamicObserverPolicy]::new($context,$source,100,'D:/fixture/node.exe',$hostSha,@($slots[1],$slots[0]),10000,4096,65536,100)}
$bad=New-Policy;$sender=Sender;Refuses {Register $bad $sender $v[0] $source}
$bad=New-Policy;Anchor $bad;$sender=Sender;Refuses {Intent $bad $sender $v[0] $source}
$bad=New-Policy;Anchor $bad;$sender=Sender;Refuses {Register $bad $sender $v[1] $analysis}
$bad=New-Policy;Anchor $bad;$sender=Sender;Refuses {Register $bad $sender $v[0] $analysis}
foreach($field in @('staticSha','stdinSha','commandSha')){
 $bad=New-Policy;Anchor $bad;$sender=Sender;$copy=$v[0]|Select-Object *;$copy.$field='f'*64
 Refuses {Register $bad $sender $copy $source}
 Refuses {Register $bad $sender $v[0] $source}
}
$bad=New-Policy;Anchor $bad;$sender=Sender;$null=Register $bad $sender $v[0] $source;Refuses {Register $bad $sender $v[0] $source}
$bad=New-Policy;Anchor $bad;$sender=Sender;$null=Register $bad $sender $v[0] $source;Refuses {$bad.CaptureChildBeforeContinue(200,'child','D:/fixture/native.exe',$image,$true,3)};Assert-Unit (-not $bad.Snapshot().cleanupComplete) 'premature child unknown'
$bad=New-Policy;Anchor $bad;$sender=Sender;$null=Register $bad $sender $v[0] $source;Refuses {Intent $bad $sender $v[0] $analysis}
$bad=New-Policy;Anchor $bad;$sender=Sender;$null=Register $bad $sender $v[0] $source;$null=Intent $bad $sender $v[0] $source;Refuses {Intent $bad $sender $v[0] $source}
$bad=New-Policy;Anchor $bad;$sender=Sender;$null=Register $bad $sender $v[0] $source;$null=Intent $bad $sender $v[0] $source;Refuses {$bad.CaptureChildBeforeContinue(200,'child','D:/fixture/unknown.exe',$image,$true,4)}
$bad=New-Policy;Anchor $bad;$sender=Sender;$bad.Cancel();Refuses {Register $bad $sender $v[0] $source};$bad.RecordHostExitAndRelease('root',0,$true,$true,'RECORDED',[Nullable[long]]8192,10001);$bad.CloseControlInput($true,10002);Assert-Unit ($bad.Snapshot().cleanupComplete -and -not $bad.Snapshot().complete) 'cancelled cleanup only'
$bad=New-Policy;Anchor $bad;$sender=Sender;$line=$sender.Encode('REGISTER',@($v[0].id,$v[0].role,$v[0].phase,$source,$v[0].staticSha,$v[0].stdinSha,$v[0].commandSha));Refuses {$bad.Receive($line,10000)};Refuses {$bad.Receive($line,2)}
$bad=New-Policy;Anchor $bad;Refuses {$bad.RecordChildExitAndRelease(999,'missing',$true,$true,'RECORDED',[Nullable[long]]4096,2)};Assert-Unit (-not $bad.Snapshot().cleanupComplete) 'unknown exit'
# First ANALYSIS context is established only after SOURCE settles; subsequent context cannot drift.
function Settle-Slot($policy,$sender,$x,[string]$digest,[string]$created){
 $null=Register $policy $sender $x $digest;$null=Intent $policy $sender $x $digest
 $null=$policy.Receive($sender.Encode('SPAWNED',@($x.id,'200')),4)
 $null=$policy.CaptureChildBeforeContinue(200,$created,'D:/fixture/native.exe',$image,$true,5)
 $null=$policy.Receive($sender.Encode('CLOSED',@($x.id,'200',$created,'0','~')),6)
 $null=$policy.RecordChildExitAndRelease(200,$created,$true,$true,'RECORDED',[Nullable[long]]4096,7)
}
$bad=New-Policy;Anchor $bad;$sender=Sender;$null=Register $bad $sender $v[0] $source;$null=Intent $bad $sender $v[0] $source
Refuses {Register $bad $sender $v[1] $analysis}
$bad=New-Policy;Anchor $bad;$sender=Sender;Settle-Slot $bad $sender $v[0] $source 'first';Settle-Slot $bad $sender $v[1] $analysis 'second'
Refuses {Register $bad $sender $v[2] ('f'*64)}
$bad=New-Policy;Anchor $bad;$sender=Sender;$null=Register $bad $sender $v[0] $source;$null=Intent $bad $sender $v[0] $source
$null=$bad.Receive($sender.Encode('SPAWNED',@($v[0].id,'200')),4)
$null=$bad.CaptureChildBeforeContinue(200,'partial','D:/fixture/native.exe',$image,$true,5)
$null=$bad.Receive($sender.Encode('CLOSED',@($v[0].id,'200','partial','0','~')),6)
$null=$bad.RecordChildExitAndRelease(200,'partial',$true,$false,'RECORDED',[Nullable[long]]4096,7)
$bad.RecordHostExitAndRelease('root',0,$true,$true,'RECORDED',[Nullable[long]]8192,8);$bad.CloseControlInput($true,9)
Assert-Unit (-not $bad.Snapshot().cleanupComplete -and -not $bad.Snapshot().complete) 'missing handle release never clean'
$bad=New-Policy;Anchor $bad;$sender=Sender;$null=Register $bad $sender $v[0] $source;$null=Intent $bad $sender $v[0] $source
$null=$bad.CaptureChildBeforeContinue(200,'cancel-child','D:/fixture/native.exe',$image,$true,4);$bad.Cancel()
$null=$bad.RecordChildExitAndRelease(200,'cancel-child',$true,$true,'RECORDED',[Nullable[long]]4096,10001)
$bad.RecordHostExitAndRelease('root',0,$true,$true,'RECORDED',[Nullable[long]]8192,10002);$bad.CloseControlInput($true,10003)
Assert-Unit ($bad.Snapshot().cleanupComplete -and -not $bad.Snapshot().complete) 'known cancelled child cleanup retained'
# Approved B: fixed final ANALYSIS/GIT suffix reuses the established context/full hash.
$final=$v[0]|Select-Object *;$final.id='verify-1';$final.phase='ANALYSIS'
$final2=$v[0]|Select-Object *;$final2.id='verify-2';$final2.phase='ANALYSIS'
$finalSlot=[MixedNativeDynamicObserverPolicy+Slot]::new($final.id,'GIT','ANALYSIS',$final.staticSha,$final.prefix,'D:/fixture/native.exe',$image)
$finalSlot2=[MixedNativeDynamicObserverPolicy+Slot]::new($final2.id,'GIT','ANALYSIS',$final2.staticSha,$final2.prefix,'D:/fixture/native.exe',$image)
$baseSlots=New-Slots
function Suffix-Policy($slots){return [MixedNativeDynamicObserverPolicy]::new($context,$source,100,'D:/fixture/node.exe',$hostSha,$slots,10000,4096,65536,100)}
$fixed=@($baseSlots[0],$baseSlots[1],$baseSlots[2],$finalSlot,$finalSlot2)
$suffix=Suffix-Policy $fixed;Anchor $suffix;$ss=Sender
Settle-Slot $suffix $ss $v[0] $source 'source'
Settle-Slot $suffix $ss $v[1] $analysis 'native'
Settle-Slot $suffix $ss $v[2] $analysis 'surface'
Settle-Slot $suffix $ss $final $analysis 'verify'
Settle-Slot $suffix $ss $final2 $analysis 'verify2'
$suffix.RecordHostExitAndRelease('root',0,$true,$true,'RECORDED',[Nullable[long]]8192,8);$suffix.CloseControlInput($true,9)
Assert-Unit ($suffix.Snapshot().complete -and $suffix.Snapshot().settledLaunches-eq5) 'fixed final Git suffix complete'
Assert-Unit (-not $suffix.Snapshot().measurementEligible -and -not $suffix.Snapshot().executionAuthorized -and -not $suffix.Snapshot().productionAdmission) 'suffix grants no authority'
Refuses {Suffix-Policy @($finalSlot)}
Refuses {Suffix-Policy @($baseSlots[0],$finalSlot)}
Refuses {Suffix-Policy @($baseSlots[1],$finalSlot,$baseSlots[2])}
Refuses {Suffix-Policy @($baseSlots[1],$finalSlot,$baseSlots[0])}
$bad=Suffix-Policy $fixed;Anchor $bad;$sender=Sender
Settle-Slot $bad $sender $v[0] $source 'source';Settle-Slot $bad $sender $v[1] $analysis 'native';Settle-Slot $bad $sender $v[2] $analysis 'surface'
Refuses {Register $bad $sender $final $source}
$bad=Suffix-Policy $fixed;Anchor $bad;$sender=Sender
Settle-Slot $bad $sender $v[0] $source 'source';Settle-Slot $bad $sender $v[1] $analysis 'native';Settle-Slot $bad $sender $v[2] $analysis 'surface'
$wrong=$final|Select-Object *;$wrong.stdinSha='f'*64
Refuses {Register $bad $sender $wrong $analysis}
$bad=Suffix-Policy $fixed;Anchor $bad;$sender=Sender
Settle-Slot $bad $sender $v[0] $source 'source';Settle-Slot $bad $sender $v[1] $analysis 'native'
$null=Register $bad $sender $v[2] $analysis
Refuses {Register $bad $sender $final $analysis}
$literalSender=Sender;$registerLiteral=$literalSender.Encode('REGISTER',@($v[0].id,$v[0].role,$v[0].phase,$source,$v[0].staticSha,$v[0].stdinSha,$v[0].commandSha))
# V1 frames cannot enter V2; strict sequences, output bounds, literal schema.
$decoder=Sender;Refuses {$decoder.Decode($frames[0].Replace('CONTROL_V2','CONTROL_V1'))}
$decoder=Sender;$null=$decoder.Decode($frames[0]);Refuses {$decoder.Decode($frames[0])}
$small=[MixedNativeDynamicControlCodec]::new($context,10,100,2);Refuses {$small.Encode('ABANDON',@('x'))}
$sender=Sender;Refuses {$sender.Encode('INTENT',@('x','V5','ANALYSIS',$analysis,('f'*64)))}
if($script:failures.Count-gt0){throw ('UNIT_ASSERTION_FAILED:'+($script:failures -join ','))}
@{kind='PURE_DYNAMIC_OBSERVER_UNIT';passed=$script:passed;frames=$frames.ToArray();registerLiteral=$registerLiteral;snapshot=$snapshot;actualRuns=0}|ConvertTo-Json -Depth 6 -Compress
