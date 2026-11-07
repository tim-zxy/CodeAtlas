# Actual topology in owned fixtures; ACL subjects/access masks are TEST_DOUBLE data.
# Never calls WindowsIdentity/GetCurrent/Query or writes any filesystem ACL.
param([Parameter(Mandatory=$true)][string]$InputFile)
$ErrorActionPreference='Stop'
function Need($v){if(-not $v){throw 'OWNED_PREFLIGHT_TEST_REFUSED'}}
$data=[IO.File]::ReadAllText($InputFile)|ConvertFrom-Json
. ([scriptblock]::Create([string]$data.reader))
. ([scriptblock]::Create([string]$data.guard))
. ([scriptblock]::Create([string]$data.preflight))
$trusted=@('S-1-5-18');$critical=[long]0x500D0156
function Get-Acl {
 param([string]$LiteralPath)
 Need ($LiteralPath.StartsWith('\\?\'))
 $plain=$LiteralPath.Substring(4)
 $script:reads.Add($plain)
 $bad=$null -ne $script:case.denyPath -and $plain.Equals([string]$script:case.denyPath,[StringComparison]::OrdinalIgnoreCase)
 $owner=if($bad -and $script:case.owner){'S-1-5-21-111-222-333-1001'}else{'S-1-5-18'}
 $rights=if($bad){$script:case.rights}else{$null}
 $acl=[pscustomobject]@{OwnerValue=$owner;RightsValue=$rights;InheritValue=($bad -and [bool]$script:case.inherit)}
 $acl|Add-Member ScriptMethod GetOwner {param($kind) return [pscustomobject]@{Value=$this.OwnerValue}}
 $acl|Add-Member ScriptMethod GetAccessRules {
  param($explicit,$inherited,$kind)
  if($null -eq $this.RightsValue){return @()}
  $prop=if($this.InheritValue){[Security.AccessControl.PropagationFlags]::InheritOnly}else{[Security.AccessControl.PropagationFlags]::None}
  return ,([pscustomobject]@{IdentityReference=[pscustomobject]@{Value='S-1-5-21-111-222-333-1001'};FileSystemRights=[long]$this.RightsValue;PropagationFlags=$prop;AccessControlType=[Security.AccessControl.AccessControlType]::Allow})
 }
 return $acl
}
$results=@()
foreach($script:case in $data.cases){
 $programs=[string]$script:case.programs;$root=[string]$script:case.root;$Mode=[string]$script:case.mode;$script:items=0;$script:reads=[Collections.Generic.List[string]]::new()
 $accepted=$true;$errorId=$null
 try{
  if($Mode -ceq 'NEW_VERSION'){Preflight-NewVersion}else{
   $legacy=([string]$data.legacy).Replace('__FIXED_RELEASE_DIGEST__',[string]$script:case.installedDigest)
   . ([scriptblock]::Create($legacy))
  }
 }catch{$accepted=$false;$errorId=$_.FullyQualifiedErrorId}
 $premature=@($script:reads|Where-Object {$script:case.stopAt -and ($_.Equals([string]$script:case.stopAt,[StringComparison]::OrdinalIgnoreCase) -or $_.StartsWith(([string]$script:case.stopAt+'\'),[StringComparison]::OrdinalIgnoreCase))}).Count
 $results+=@{name=$script:case.name;mode=$Mode;accepted=$accepted;expected=[bool]$script:case.expected;pass=($accepted -eq [bool]$script:case.expected -and $premature -eq 0);prematureReads=$premature;errorId=$errorId;items=$script:items}
}
$failures=@($results|Where-Object {-not $_.pass}).Count
[pscustomobject]@{kind='OWNED_COEXISTENCE_PREFLIGHT_ONLY';cases=$results.Count;failures=$failures;results=$results;identityQueries=0;ACLWrites=0}|ConvertTo-Json -Depth 6 -Compress
Need ($failures -eq 0)
