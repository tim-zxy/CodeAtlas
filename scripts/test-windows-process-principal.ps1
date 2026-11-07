# Compile declarations only; never call Query or a Win32 identity API.
$ErrorActionPreference='Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'windows-process-principal.cs')
$challenge='12345678-1234-4234-8234-123456789abc'
[WindowsProcessPrincipal]::ValidateInput(1,$challenge)
$passed=1
foreach($case in @(@(0,$challenge),@(-1,$challenge),@([long]4294967296,$challenge),@(1,$null),@(1,''),@(1,$challenge.ToUpperInvariant()),@(1,('{'+$challenge+'}')),@(1,($challenge+"`n")))){
 $refused=$false
 try{[WindowsProcessPrincipal]::ValidateInput($case[0],$case[1])}catch{$refused=$_.Exception.GetBaseException().Message -eq 'WINDOWS_PROCESS_PRINCIPAL_FAILED'}
 if(-not $refused){throw 'PURE_INPUT_ASSERTION_FAILED'};$passed++
}
$ctor=[WindowsProcessPrincipal+Result].GetConstructors([Reflection.BindingFlags]'NonPublic,Instance')[0]
$dto=$ctor.Invoke(@([uint32]7,'133000000000000001','S-1-5-21-1-2-3-1001',$challenge))
$json=[WindowsProcessPrincipal]::Serialize($dto)
$expected='{"schema":"codeatlas.windows-process-principal","version":1,"pid":7,"creationTimeFileTime":"133000000000000001","sid":"S-1-5-21-1-2-3-1001","challenge":"'+$challenge+'"}'
if($json -cne $expected){throw 'PURE_JSON_BYTES_ASSERTION_FAILED'}
[WindowsProcessPrincipal]::ValidateInput([long]4294967295,$challenge)
$decoded=$json|ConvertFrom-Json
if($decoded.schema-ne'codeatlas.windows-process-principal' -or $decoded.version-ne1 -or $decoded.pid-ne7 -or $decoded.creationTimeFileTime-ne'133000000000000001' -or $decoded.sid-ne'S-1-5-21-1-2-3-1001' -or $decoded.challenge-ne$challenge -or @($decoded.PSObject.Properties).Count-ne6){throw 'PURE_DTO_ASSERTION_FAILED'}
$passed++
foreach($sid in @('S-1-5-0','S-1-281474976710655-4294967295','S-1-0xFFFFFFFFFFFF-0',('S-1-5'+('-1'*15)))){
 $dto=$ctor.Invoke(@([uint32]4294967295,'18446744073709551615',$sid,$challenge))
 $actual=[WindowsProcessPrincipal]::Serialize($dto)
 $want='{"schema":"codeatlas.windows-process-principal","version":1,"pid":4294967295,"creationTimeFileTime":"18446744073709551615","sid":"'+$sid+'","challenge":"'+$challenge+'"}'
 if($actual -cne $want){throw 'PURE_MAX_VECTOR_FAILED'};$passed++
}
foreach($sid in @('S-1-5','S-1-281474976710656-1','S-1-05-1','S-1-5-01','S-1-5-4294967296','S-1-5--1','S-1-0xFFFFFFFFFFFFF-1','S-1-0xGGFFFFFFFFFF-1',('S-1-5'+('-1'*16)),"S-1-5-1`n")){
 $dto=$ctor.Invoke(@([uint32]7,'1',$sid,$challenge));$refused=$false
 try{[WindowsProcessPrincipal]::Serialize($dto)|Out-Null}catch{$refused=$_.Exception.GetBaseException().Message -eq 'WINDOWS_PROCESS_PRINCIPAL_FAILED'}
 if(-not $refused){throw ('PURE_SID_REFUSAL_FAILED:'+ $sid)};$passed++
}
foreach($birth in @('0','01','18446744073709551616','-1')){
 $dto=$ctor.Invoke(@([uint32]7,$birth,'S-1-5-1',$challenge));$refused=$false
 try{[WindowsProcessPrincipal]::Serialize($dto)|Out-Null}catch{$refused=$_.Exception.GetBaseException().Message -eq 'WINDOWS_PROCESS_PRINCIPAL_FAILED'}
 if(-not $refused){throw 'PURE_FILETIME_REFUSAL_FAILED'};$passed++
}
@{kind='OFFLINE_WINDOWS_PROCESS_PRINCIPAL_UNIT';passed=$passed;identityQueries=0;identityApiCalls=0}|ConvertTo-Json -Compress
