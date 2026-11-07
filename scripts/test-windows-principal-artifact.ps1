# Explicit preparation tests only. Query and Windows identity APIs are never invoked.
param(
 [Parameter(Mandatory=$true)][string]$ArtifactPath,
 [Parameter(Mandatory=$true)][string]$ExpectedSha256,
 [Parameter(Mandatory=$true)][int]$MaxArtifactBytes
)
$ErrorActionPreference='Stop'
function Need($value){if(-not $value){throw 'ARTIFACT_TEST_FAILED'}}
Need ($MaxArtifactBytes -gt 0 -and $MaxArtifactBytes -le 1048576)
Need ([regex]::IsMatch($ExpectedSha256,'\A[0-9a-f]{64}\z'))
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$full=[IO.Path]::GetFullPath($ArtifactPath)
$base=[IO.Path]::GetFullPath((Join-Path $root '.superpowers'))+[IO.Path]::DirectorySeparatorChar
Need ($full.StartsWith($base,[StringComparison]::OrdinalIgnoreCase))
Need ([IO.Path]::GetFileName($full) -ceq 'windows-process-principal.dll')
for($item=Get-Item -LiteralPath $full;$null -ne $item;$item=$item.Parent){
 Need (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint))
 if($item -is [IO.FileInfo]){$item=$item.Directory;Need (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint))}
}
$script:reads=0;$script:loads=0
function Read-BoundedArtifact([string]$file,[int]$maximum){
 $stream=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 try{
  Need ($stream.Length -gt 0 -and $stream.Length -le $maximum)
  $bytes=New-Object byte[] ([int]$stream.Length)
  $offset=0
  while($offset -lt $bytes.Length){$n=$stream.Read($bytes,$offset,$bytes.Length-$offset);Need ($n -gt 0);$offset+=$n}
  Need ($stream.ReadByte() -eq -1)
  $script:reads++
  return ,$bytes
 }finally{$stream.Dispose()}
}
function Hash-Bytes([byte[]]$bytes){
 $hash=[Security.Cryptography.SHA256]::Create()
 try{return ([BitConverter]::ToString($hash.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
}
function Load-VerifiedBytes([byte[]]$inputBytes,[string]$expected,[int]$maximum){
 if(-not [regex]::IsMatch($expected,'\A[0-9a-f]{64}\z') -or $inputBytes.Length -eq 0 -or $inputBytes.Length -gt $maximum){throw 'ARTIFACT_REFUSED'}
 $owned=[byte[]]$inputBytes.Clone()
 if((Hash-Bytes $owned) -cne $expected){throw 'ARTIFACT_REFUSED'}
 foreach($existing in [AppDomain]::CurrentDomain.GetAssemblies()){
  if($null -ne $existing.GetType('WindowsProcessPrincipal',$false,$false)){throw 'ARTIFACT_REFUSED'}
 }
 $script:loads++
 # Load exactly the copied bytes whose digest was checked; never reopen a path.
 return [Reflection.Assembly]::Load($owned)
}
function Refuses([scriptblock]$action){
 $denied=$false
 try{& $action|Out-Null}catch{$denied=$_.Exception.GetBaseException().Message -ceq 'ARTIFACT_REFUSED'}
 Need $denied
}
$bytes=Read-BoundedArtifact $full $MaxArtifactBytes
Need ((Hash-Bytes $bytes) -ceq $ExpectedSha256)
Refuses {Load-VerifiedBytes $bytes ('0'*64) $MaxArtifactBytes}
$tampered=[byte[]]$bytes.Clone();$tampered[$tampered.Length-1]=$tampered[$tampered.Length-1] -bxor 1
Refuses {Load-VerifiedBytes $tampered $ExpectedSha256 $MaxArtifactBytes}
Refuses {Load-VerifiedBytes $bytes $ExpectedSha256 ($bytes.Length-1)}
Refuses {Load-VerifiedBytes $bytes ($ExpectedSha256+"`n") $MaxArtifactBytes}
Need ($script:loads -eq 0)
$race=Join-Path ([IO.Path]::GetDirectoryName($full)) ('test-read-once-'+[Guid]::NewGuid().ToString('N')+'.dll')
Need (-not [IO.File]::Exists($race))
[IO.File]::WriteAllBytes($race,$bytes)
$copied=Read-BoundedArtifact $race $MaxArtifactBytes
# Replace only this test's new fixture after its one read, preserving the build artifact.
[IO.File]::WriteAllBytes($race,[byte[]]@(0,1,2,3))
$assembly=Load-VerifiedBytes $copied $ExpectedSha256 $MaxArtifactBytes
Need ($script:loads -eq 1 -and $script:reads -eq 2 -and $assembly.Location -ceq '')
Need ((Get-Item -LiteralPath $race).Length -eq 4)
$pe=[Reflection.PortableExecutableKinds]0;$machine=[Reflection.ImageFileMachine]::I386
$assembly.ManifestModule.GetPEKind([ref]$pe,[ref]$machine)
Need ($machine -eq [Reflection.ImageFileMachine]::AMD64)
$refs=@($assembly.GetReferencedAssemblies()|ForEach-Object {$_.FullName}|Sort-Object)
$expectedRefs=@('mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089','System, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089')|Sort-Object
Need (($refs -join '|') -ceq ($expectedRefs -join '|'))
$type=$assembly.GetType('WindowsProcessPrincipal',$true,$false)
$imports=@($type.GetMethods([Reflection.BindingFlags]'NonPublic,Static')|ForEach-Object {
 foreach($attr in $_.GetCustomAttributes([Runtime.InteropServices.DllImportAttribute],$false)){$attr.Value}
}|Sort-Object -Unique)
Need (($imports -join '|') -ceq 'advapi32.dll|kernel32.dll')
Need ($null -ne $type.GetMethod('Query')) # Metadata only: never invoke Query.
$challenge='12345678-1234-4234-8234-123456789abc'
$type.GetMethod('ValidateInput').Invoke($null,@([long]1,$challenge))|Out-Null
$ctor=$assembly.GetType('WindowsProcessPrincipal+Result',$true,$false).GetConstructors([Reflection.BindingFlags]'NonPublic,Instance')[0]
$dto=$ctor.Invoke(@([uint32]7,'133000000000000001','S-1-5-21-1-2-3-1001',$challenge))
$wire=$type.GetMethod('Serialize').Invoke($null,@($dto))
$expected='{"schema":"codeatlas.windows-process-principal","version":1,"pid":7,"creationTimeFileTime":"133000000000000001","sid":"S-1-5-21-1-2-3-1001","challenge":"'+$challenge+'"}'
Need ($wire -ceq $expected)
Refuses {Load-VerifiedBytes $bytes $ExpectedSha256 $MaxArtifactBytes}
Need ($script:loads -eq 1)
@{kind='PRECOMPILED_PRINCIPAL_OFFLINE_TEST';passed=9;identityQueries=0;identityApiCalls=0;
 artifactBytes=$bytes.Length;artifactSha256=$ExpectedSha256;assembly=$assembly.FullName;
 mvid=$assembly.ManifestModule.ModuleVersionId.ToString();machine=[string]$machine;peKind=[string]$pe;
 assemblyReferences=$refs;nativeImports=$imports;artifactReads=1;replacementFixtureReads=1;
 loadCalls=$script:loads;loadedFromMemory=$true;pathReplacedAfterRead=$true;installed=$false}|ConvertTo-Json -Depth 4 -Compress
