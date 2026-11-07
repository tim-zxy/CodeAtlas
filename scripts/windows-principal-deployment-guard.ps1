param([Parameter(Mandatory=$true)][ValidateSet('PREFLIGHT','INSTALLED','NEW_VERSION')][string]$Mode)
$ErrorActionPreference='Stop'
function Need($v){if(-not $v){throw 'INSTALL_GUARD_REFUSED'}}
$local=[Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
Need ($local -ceq 'C:\Users\Freya\AppData\Local')
$programs=Join-Path $local 'Programs'
$root=Join-Path $programs 'CodeAtlas\releases\release-__FIXED_RELEASE_DIGEST__'
# Own installer context for ACL comparison only; never Principal Query or a grant.
__FIXED_ACL_READER__
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
try{$ownSid=$identity.User.Value}finally{$identity.Dispose()}
$windows=[Environment]::GetFolderPath([Environment+SpecialFolder]::Windows)
Need (-not [string]::IsNullOrEmpty($windows))
$windowsOwner=(Read-PhysicalAcl $windows).GetOwner([Security.Principal.SecurityIdentifier]).Value
$trusted=@($ownSid,'S-1-5-18','S-1-5-32-544',$windowsOwner)
$critical=[long]0x500D0156
$script:items=0
function Guard([string]$full,[bool]$directory,[bool]$ancestor=$false){
 $script:items++;Need ($script:items -le 200000)
 $acl=Read-PhysicalAcl $full
 Need ($trusted -contains $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value)
 foreach($ace in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
  $inheritOnly=($ace.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0
  if($inheritOnly -and ($ancestor -or $ace.IdentityReference.Value -ceq 'S-1-3-0')){continue}
  $mask=[long]$ace.FileSystemRights
  if($directory -and $ancestor){$mask=$mask -band (-bnot [long]4)}
  if($ace.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and (($mask -band $critical) -ne 0) -and $trusted -notcontains $ace.IdentityReference.Value){throw 'INSTALL_GUARD_REFUSED'}
 }
}
function Preflight-NewVersion{
 $codeAtlas=Join-Path $programs 'CodeAtlas'
 $releases=Join-Path $codeAtlas 'releases'
 $leaf=[IO.Path]::GetFileName($root)
 Need ($leaf -cmatch '\Arelease-[a-f0-9]{64}\z')
 $expected=[IO.Path]::GetFullPath((Join-Path $releases $leaf))
 Need ([IO.Path]::GetFullPath($root).Equals($expected,[StringComparison]::OrdinalIgnoreCase))
 # Validate from the volume root down, before following any container junction.
 $chain=[Collections.Generic.List[IO.DirectoryInfo]]::new()
 for($a=[IO.DirectoryInfo]::new($releases);$null -ne $a;$a=$a.Parent){$chain.Add($a);Need ($chain.Count -le 200000)}
 for($i=$chain.Count-1;$i -ge 0;$i--){$a=$chain[$i];Need (-not ($a.Attributes -band [IO.FileAttributes]::ReparsePoint));Need $a.Exists;Guard $a.FullName $true $true}
 # These two containers directly hold the new version; apply the original strict directory policy.
 foreach($container in @($codeAtlas,$releases)){$item=Get-Item -LiteralPath $container -Force;Need ($item -is [IO.DirectoryInfo] -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint));Guard $item.FullName $true}
 # Enumerate entries, not Test-Path: a dangling junction still occupies the exact name.
 foreach($entry in ([IO.DirectoryInfo]::new($releases)).EnumerateFileSystemInfos()){
  $script:items++;Need ($script:items -le 200000)
  Need (-not $entry.Name.Equals($leaf,[StringComparison]::OrdinalIgnoreCase))
  Need (-not ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint))
 }
}
if($Mode -ceq 'NEW_VERSION'){
 Preflight-NewVersion
 [pscustomobject]@{kind='INSTALL_ACL_CHECK_ONLY';mode=$Mode;passed=$true;items=$script:items;principalQueries=0;aclChanges=0}|ConvertTo-Json -Compress
 exit 0
}
$base=if($Mode -ceq 'PREFLIGHT'){$programs}else{$root}
for($a=[IO.DirectoryInfo]::new($base);$null -ne $a;$a=$a.Parent){Need ($a.Exists -and -not ($a.Attributes -band [IO.FileAttributes]::ReparsePoint));Guard $a.FullName $true $true}
if($Mode -ceq 'PREFLIGHT'){Need (-not (Test-Path -LiteralPath (Join-Path $programs 'CodeAtlas')))}else{
 $bytes=[IO.File]::ReadAllBytes((Join-Path $root 'closed-runtime.json'))
 $h=[Security.Cryptography.SHA256]::Create();try{$digest=([BitConverter]::ToString($h.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}
 Need ($digest -ceq '__FIXED_RELEASE_DIGEST__')
 $catalog=([Text.UTF8Encoding]::new($false,$true)).GetString($bytes)|ConvertFrom-Json
 $links=@{};foreach($l in $catalog.links){$links[$l.path]=[string]$l.target}
 function Visit([string]$full,[string]$rel,[int]$depth){
  Need ($depth -le 80);Guard $full $true
  foreach($item in (Get-ChildItem -LiteralPath $full -Force)){
   $child=if($rel -eq ''){$item.Name}else{$rel+'/'+$item.Name}
   if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){
    Need ($item -is [IO.DirectoryInfo] -and $item.LinkType -ceq 'Junction' -and $links.ContainsKey($child))
    $targets=@($item.Target);Need ($targets.Count -eq 1)
    $expected=[IO.Path]::GetFullPath((Join-Path $root $links[$child].Replace('/','\')))
    Need ([IO.Path]::GetFullPath([string]$targets[0]).Equals($expected,[StringComparison]::OrdinalIgnoreCase))
    Guard $item.FullName $true
   }elseif($item -is [IO.DirectoryInfo]){Visit $item.FullName $child ($depth+1)}else{Need ($item -is [IO.FileInfo]);Guard $item.FullName $false}
  }
 }
 Visit $root '' 0
}
[pscustomobject]@{kind='INSTALL_ACL_CHECK_ONLY';mode=$Mode;passed=$true;items=$script:items;principalQueries=0;aclChanges=0}|ConvertTo-Json -Compress
