import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';
import { readClosedRuntimePackage } from './closed-runtime-package.js';

const artifactSha = '4ee3e48cfa2f6c4d883a983a2f7b5739ecf7b01d515c94cecbed9f87e3bb7147';
const artifactPath = `packages/runtime/dist/principal/win32-x64/${artifactSha}/windows-process-principal.dll`;
const unavailable = () => new Error('WINDOWS_PRINCIPAL_DEPLOYMENT_UNAVAILABLE');
function need(value: unknown): asserts value {
  if (!value) throw unavailable();
}

// Fixed source, never executed by offline preparation/tests. All OS trust checks
// occur before Assembly.Load or Query; catalog hashes alone confer no authority.
export const principalAssemblyLoader = String.raw`function Load-VerifiedPrincipal([byte[]]$artifact){
function Need($v){if(-not $v){throw 'PRINCIPAL_UNAVAILABLE'}}
function Hash([byte[]]$b){$h=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($h.ComputeHash($b))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
$artifact=[byte[]]$artifact.Clone()
Need ($artifact.Length -eq 6656 -and (Hash $artifact) -ceq '4ee3e48cfa2f6c4d883a983a2f7b5739ecf7b01d515c94cecbed9f87e3bb7147')
foreach($assembly in [AppDomain]::CurrentDomain.GetAssemblies()){Need ($null -eq $assembly.GetType('WindowsProcessPrincipal',$false,$false))}
# Hash and load exactly this one copied byte array. Never reopen a DLL path.
$assembly=[Reflection.Assembly]::Load($artifact)
$references=@($assembly.GetReferencedAssemblies()|ForEach-Object {$_.FullName}|Sort-Object)
Need (($references -join '|') -ceq 'mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089|System, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089')
$imports=@($assembly.GetTypes()|ForEach-Object {$_.GetMethods([Reflection.BindingFlags]'Public,NonPublic,Instance,Static,DeclaredOnly')}|ForEach-Object {foreach($attr in $_.GetCustomAttributes([Runtime.InteropServices.DllImportAttribute],$false)){$attr.Value.ToLowerInvariant()}}|Sort-Object -Unique)
Need (($imports -join '|') -ceq 'advapi32.dll|kernel32.dll')
return ,$assembly
}`;

const program = String.raw`
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$principalStage='DEPLOYMENT'
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false,$true)
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false,$true)
try {
function Need($v){if(-not $v){throw 'PRINCIPAL_UNAVAILABLE'}}
Need ($ExecutionContext.SessionState.LanguageMode -eq 'FullLanguage')
$inputData=[Console]::In.ReadToEnd()|ConvertFrom-Json
$deadline=[long]$inputData.deadlineEpochMs
$watch=[Diagnostics.Stopwatch]::StartNew()
$duration=$deadline-[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
function Check-Time {Need ($duration -gt 0 -and $watch.ElapsedMilliseconds -lt $duration -and [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -lt $deadline)}
Check-Time
Need ($inputData.maxItems -gt 0 -and $inputData.maxDepth -gt 0 -and $inputData.maxInputBytes -gt 0)
$root=[IO.Path]::GetFullPath([string]$inputData.deploymentRoot)
$leaf=[IO.Path]::GetFileName($root)
Need ([regex]::IsMatch($leaf,'\Arelease-[a-f0-9]{64}\z'))
$local=[Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
Need (-not [string]::IsNullOrEmpty($local))
$expected=[IO.Path]::GetFullPath([IO.Path]::Combine($local,'Programs','CodeAtlas','releases',$leaf))
Need ($root.Equals($expected,[StringComparison]::OrdinalIgnoreCase))
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
try{$ownSid=$identity.User.Value}finally{$identity.Dispose()}
$windows=[Environment]::GetFolderPath([Environment+SpecialFolder]::Windows)
Need (-not [string]::IsNullOrEmpty($windows))
$windowsOwner=(Get-Acl -LiteralPath $windows).GetOwner([Security.Principal.SecurityIdentifier]).Value
$trusted=@($ownSid,'S-1-5-18','S-1-5-32-544',$windowsOwner)
$critical=[long]0x500D0156 # WriteData/Append/EA/Attributes/Delete/WriteDac/WriteOwner plus generic WRITE/ALL
function Guard-Acl([string]$full,[bool]$directory,[bool]$ancestor=$false){
 Check-Time
 $acl=Get-Acl -LiteralPath $full
 Need ($trusted -contains $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value)
 foreach($ace in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
  $inheritOnly=($ace.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0
  if($inheritOnly -and ($ancestor -or $ace.IdentityReference.Value -ceq 'S-1-3-0')){continue}
  $mask=[long]$ace.FileSystemRights
  if($directory -and $ancestor){$mask=$mask -band (-bnot [long]4)} # Creating a sibling directory alone cannot rewrite this fixed entry.
  if($ace.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and (($mask -band $critical) -ne 0) -and $trusted -notcontains $ace.IdentityReference.Value){throw 'PRINCIPAL_UNAVAILABLE'}
 }
 return (Hash ([Text.Encoding]::UTF8.GetBytes($acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]'Access,Owner,Group'))))
}
function Hash([byte[]]$b){$h=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($h.ComputeHash($b))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
$manifestBytes=[Convert]::FromBase64String([string]$inputData.manifestBase64)
Need ($manifestBytes.Length -gt 0 -and $manifestBytes.Length -le $inputData.maxInputBytes)
Need ((Hash $manifestBytes) -ceq $leaf.Substring(8))
$utf8=New-Object System.Text.UTF8Encoding($false,$true)
$manifest=$utf8.GetString($manifestBytes)|ConvertFrom-Json
Need ($manifest.schema -ceq 'codeatlas.closed-runtime-package' -and $manifest.version -eq 1)
$files=@{};$links=@{};$directories=@{''=$true}
function Relative([string]$s){Need (-not [string]::IsNullOrEmpty($s));foreach($part in $s.Split('/')){Need ($part -ne '' -and $part -ne '.' -and $part -ne '..' -and $part -notmatch '[\\:\x00-\x1f<>"|?*]' -and $part -notmatch '[. ]$')};return $s}
function Parents([string]$s){while($s.Contains('/')){$s=$s.Substring(0,$s.LastIndexOf('/'));$directories[$s]=$true}}
foreach($f in $manifest.files){$rel=Relative ([string]$f.path);Need (-not $files.ContainsKey($rel));Need ($f.bytes -ge 0 -and $f.sha256 -cmatch '\A[a-f0-9]{64}\z');$files[$rel]=$f;Parents $rel}
foreach($l in $manifest.links){$rel=Relative ([string]$l.path);$target=Relative ([string]$l.target);Need (-not $links.ContainsKey($rel) -and -not $files.ContainsKey($rel));$links[$rel]=$target;Parents $rel;Parents $target;$directories[$target]=$true}
$files['closed-runtime.json']=@{bytes=$manifestBytes.Length;sha256=$leaf.Substring(8)}
function Full([string]$rel){return [IO.Path]::Combine($root,$rel.Replace('/',[IO.Path]::DirectorySeparatorChar))}
function Guard-Tree {
 $snapshot=@{};$seenFiles=@{};$seenLinks=@{};$seenDirectories=@{};$script:items=0
 # Every physical ancestor is guarded, not just the release leaf.
 for($ancestor=[IO.DirectoryInfo]::new($root);$null -ne $ancestor;$ancestor=$ancestor.Parent){$script:items++;Need ($script:items -le $inputData.maxItems);Need (-not ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint));$aclFingerprint=Guard-Acl $ancestor.FullName $true $true;$snapshot['A:'+ $ancestor.FullName]=([string]$ancestor.Attributes+'|'+$ancestor.CreationTimeUtc.Ticks+'|'+$aclFingerprint)}
 function Visit([string]$rel,[int]$depth){
  Check-Time;Need ($depth -le $inputData.maxDepth)
  $full=if($rel -eq ''){$root}else{Full $rel}
  $dir=Get-Item -LiteralPath $full -Force
  Need ($dir -is [IO.DirectoryInfo] -and -not ($dir.Attributes -band [IO.FileAttributes]::ReparsePoint));$aclFingerprint=Guard-Acl $full $true
  $seenDirectories[$rel]=$true;$snapshot['D:'+ $rel]=([string]$dir.Attributes+'|'+$dir.CreationTimeUtc.Ticks+'|'+$dir.LastWriteTimeUtc.Ticks+'|'+$aclFingerprint)
  foreach($item in (Get-ChildItem -LiteralPath $full -Force)){
   Check-Time;$script:items++;Need ($script:items -le $inputData.maxItems -and $depth+1 -le $inputData.maxDepth)
   $child=if($rel -eq ''){$item.Name}else{$rel+'/'+$item.Name}
   if($links.ContainsKey($child)){
    Need ($item -is [IO.DirectoryInfo] -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -and $item.LinkType -eq 'Junction')
    $targets=@($item.Target);Need ($targets.Count -eq 1)
    $actual=[string]$targets[0];if(-not [IO.Path]::IsPathRooted($actual)){$actual=[IO.Path]::Combine($full,$actual)}
    $expectedTarget=Full $links[$child]
    Need ([IO.Path]::GetFullPath($actual).Equals([IO.Path]::GetFullPath($expectedTarget),[StringComparison]::OrdinalIgnoreCase))
    $target=Get-Item -LiteralPath $expectedTarget -Force
    Need ($target -is [IO.DirectoryInfo] -and -not ($target.Attributes -band [IO.FileAttributes]::ReparsePoint) -and $directories.ContainsKey($links[$child]))
    $aclFingerprint=Guard-Acl $item.FullName $true;$seenLinks[$child]=$true;$snapshot['L:'+ $child]=([string]$item.Attributes+'|'+$actual+'|'+$aclFingerprint);continue
   }
   Need (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint))
   $aclFingerprint=Guard-Acl $item.FullName ($item -is [IO.DirectoryInfo])
   if($item -is [IO.DirectoryInfo]){Need ($directories.ContainsKey($child));Visit $child ($depth+1)}
   else{Need ($item -is [IO.FileInfo] -and $files.ContainsKey($child));Need ($item.Length -eq $files[$child].bytes);$seenFiles[$child]=$true;$snapshot['F:'+ $child]=([string]$item.Attributes+'|'+$item.Length+'|'+$item.CreationTimeUtc.Ticks+'|'+$item.LastWriteTimeUtc.Ticks+'|'+$aclFingerprint)}
  }
 }
 Visit '' 0
 Need ($seenFiles.Count -eq $files.Count -and $seenLinks.Count -eq $links.Count -and $seenDirectories.Count -eq $directories.Count)
 return ,$snapshot
}
$before=Guard-Tree
__FIXED_ASSEMBLY_LOADER__
$principalStage='LOAD'
$artifact=[Convert]::FromBase64String([string]$inputData.artifactBase64)
Check-Time
$assembly=Load-VerifiedPrincipal $artifact
$type=$assembly.GetType('WindowsProcessPrincipal',$true,$false)
$principalStage='QUERY';Check-Time
$result=$type.GetMethod('Query').Invoke($null,@([long]$inputData.pid,[string]$inputData.challenge))
Need ($result.sid -ceq $ownSid)
$principalStage='DEPLOYMENT';$after=Guard-Tree
Need ($before.Count -eq $after.Count);foreach($key in $before.Keys){Need ($after.ContainsKey($key) -and $before[$key] -ceq $after[$key])}
$principalStage='SERIALIZE';Check-Time
$wire=$type.GetMethod('Serialize').Invoke($null,@($result));[Console]::Out.WriteLine([string]$wire)
}catch{[Console]::Error.WriteLine('CODEATLAS_PRINCIPAL_FAILURE:'+$principalStage);exit 1}
`.replace('__FIXED_ASSEMBLY_LOADER__', principalAssemblyLoader);

/** Preparation data only: caller cannot choose a root, artifact, digest or issuer. */
export async function preparePrecompiledPrincipal(options: {
  maxInputBytes: number;
  maxItems: number;
  maxDepth: number;
  deadlineEpochMs: number;
  check: () => void;
}) {
  need(options && !types.isProxy(options) && Object.getPrototypeOf(options) === Object.prototype);
  const ds = Object.getOwnPropertyDescriptors(options);
  const keys = ['maxInputBytes', 'maxItems', 'maxDepth', 'deadlineEpochMs', 'check'];
  need(
    Reflect.ownKeys(ds).length === keys.length &&
      keys.every((k) => ds[k] && Object.hasOwn(ds[k]!, 'value')),
  );
  const values = Object.fromEntries(keys.map((k) => [k, ds[k]!.value]));
  for (const key of keys.slice(0, 4)) need(Number.isSafeInteger(values[key]) && values[key] > 0);
  need(typeof values.check === 'function' && !types.isProxy(values.check));
  const check = (): undefined => {
    const result: unknown = values.check();
    if (types.isPromise(result))
      void Promise.prototype.then.call(result, undefined, () => undefined);
    need(result === undefined && Date.now() < values.deadlineEpochMs);
    return undefined;
  };
  check();
  const root = path.win32.normalize(fileURLToPath(new URL('../../../', import.meta.url)));
  need(/^[A-Za-z]:\\/.test(root) && !root.slice(2).includes(':'));
  const trimmed = root.replace(/\\$/, '');
  need(/\\Programs\\CodeAtlas\\releases\\release-[a-f0-9]{64}$/.test(trimmed));
  const bundle = await readClosedRuntimePackage(trimmed, artifactPath, artifactSha, {
    maxFileBytes: values.maxInputBytes,
    maxItems: values.maxItems,
    maxDepth: values.maxDepth,
    check,
  });
  check();
  need(
    path.win32.basename(trimmed) === `release-${bundle.contentDigest}` &&
      bundle.artifactBytes.length === 6656,
  );
  need(bundle.root.toLowerCase() === trimmed.toLowerCase());
  const payload = Object.freeze({
    deploymentRoot: bundle.root,
    manifestBase64: bundle.manifestBytes.toString('base64'),
    artifactBase64: bundle.artifactBytes.toString('base64'),
    maxItems: values.maxItems as number,
    maxDepth: values.maxDepth as number,
    deadlineEpochMs: values.deadlineEpochMs as number,
    maxInputBytes: values.maxInputBytes as number,
  });
  // The enclosing owner charges/bounds the complete JSON stdin including these copies.
  return Object.freeze({
    program,
    payload,
    recheck: () => bundle.recheck(),
  });
}
