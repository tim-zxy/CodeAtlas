# Owned fixture / in-memory policy doubles only. No account lookup or filesystem ACL mutation.
param([Parameter(Mandatory=$true)][string]$InputFile)
$ErrorActionPreference='Stop'
function Need($v){if(-not $v){throw 'OWNED_ACL_TEST_FAILED'}}
function Hash([byte[]]$b){$h=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($h.ComputeHash($b))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function Check-Time {}
$data=[IO.File]::ReadAllText($InputFile)|ConvertFrom-Json
. ([scriptblock]::Create([string]$data.reader))
. ([scriptblock]::Create([string]$data.productionPolicy))
. ([scriptblock]::Create([string]$data.checkerPolicy))
$results=@();$physical=0;$invalid=0;$policyCount=0
function Sddl($acl){return $acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]'Access,Owner,Group')}
$shortAcl=Sddl (Get-Acl -LiteralPath $data.short)
Need ((Sddl (Read-PhysicalAcl $data.short)) -ceq $shortAcl);$physical++
$refused=$false;try{Get-Acl -LiteralPath $data.long|Out-Null}catch{$refused=$_.FullyQualifiedErrorId -ceq 'GetAcl_PathNotFound,Microsoft.PowerShell.Commands.GetAclCommand'}
Need $refused;$physical++
$longAcl=Sddl ([IO.FileInfo]::new('\\?\'+$data.long).GetAccessControl())
Need ((Sddl (Read-PhysicalAcl $data.long)) -ceq $longAcl -and $longAcl -ceq $shortAcl);$physical++
$directoryAcl=Sddl ([IO.DirectoryInfo]::new('\\?\'+$data.directory).GetAccessControl())
Need ((Sddl (Read-PhysicalAcl $data.directory)) -ceq $directoryAcl);$physical++
Need ((Sddl (Read-PhysicalAcl $data.junction)) -ceq (Sddl (Get-Acl -LiteralPath $data.junction)));$physical++
$refused=$false;try{Read-PhysicalAcl ($data.short+'.missing')|Out-Null}catch{$refused=$true};Need $refused;$physical++
# Remaining tests replace only the cmdlet with synthetic in-memory ACL data.
$script:reads=0
function Get-Acl {param([string]$LiteralPath) $script:reads++;Need ($LiteralPath.StartsWith('\\?\'));return $script:fakeAcl}
$bad=@('relative.bin','C:relative','\\server\share\file','\\?\C:\file','\\.\C:\file','C:\a\..\b','C:\a\file:stream','C:\a\name.','C:\a\name ','C:\a\\b')
foreach($p in $bad){$before=$script:reads;$refused=$false;try{Read-PhysicalAcl $p|Out-Null}catch{$refused=$true};Need ($refused -and $script:reads -eq $before);$invalid++}
$trusted=@('S-1-5-18');$critical=[long]0x500D0156;$script:items=0
$unknown='S-1-5-21-111-222-333-1001'
$cases=@(
 @{name='trusted-owner';owner='S-1-5-18';pass=$true},
 @{name='unknown-owner';owner=$unknown;pass=$false},
 @{name='unknown-read';owner='S-1-5-18';subject=$unknown;rights=1179817;pass=$true},
 @{name='write-data';owner='S-1-5-18';subject=$unknown;rights=2;pass=$false},
 @{name='delete';owner='S-1-5-18';subject=$unknown;rights=65536;pass=$false},
 @{name='write-dac';owner='S-1-5-18';subject=$unknown;rights=262144;pass=$false},
 @{name='write-owner';owner='S-1-5-18';subject=$unknown;rights=524288;pass=$false},
 @{name='generic-write';owner='S-1-5-18';subject=$unknown;rights=1073741824;pass=$false},
 @{name='generic-all';owner='S-1-5-18';subject=$unknown;rights=268435456;pass=$false},
 @{name='ancestor-sibling-create';owner='S-1-5-18';subject=$unknown;rights=4;ancestor=$true;pass=$true},
 @{name='inside-child-create';owner='S-1-5-18';subject=$unknown;rights=4;pass=$false},
 @{name='ancestor-inherit-only';owner='S-1-5-18';subject=$unknown;rights=2;inherit=$true;ancestor=$true;pass=$true},
 @{name='inside-inherit-only';owner='S-1-5-18';subject=$unknown;rights=2;inherit=$true;pass=$false},
 @{name='creator-owner-inherit-only';owner='S-1-5-18';subject='S-1-3-0';rights=2;inherit=$true;pass=$true}
)
foreach($c in $cases){
 # In-memory method double models raw access masks, including generic bits that
 # the public FileSystemAccessRule constructor does not accept. No ACL is applied.
 $script:fakeAcl=[pscustomobject]@{OwnerValue=$c.owner;SubjectValue=$c.subject;RightsValue=$c.rights;InheritValue=[bool]$c.inherit}
 $script:fakeAcl|Add-Member ScriptMethod GetOwner {param($kind) return [pscustomobject]@{Value=$this.OwnerValue}}
 $script:fakeAcl|Add-Member ScriptMethod GetAccessRules {
  param($explicit,$inherited,$kind)
  if($null -eq $this.SubjectValue){return @()}
  $prop=if($this.InheritValue){[Security.AccessControl.PropagationFlags]::InheritOnly}else{[Security.AccessControl.PropagationFlags]::None}
  return ,([pscustomobject]@{IdentityReference=[pscustomobject]@{Value=$this.SubjectValue};FileSystemRights=[long]$this.RightsValue;PropagationFlags=$prop;AccessControlType=[Security.AccessControl.AccessControlType]::Allow})
 }
 $script:fakeAcl|Add-Member ScriptMethod GetSecurityDescriptorSddlForm {param($sections) return 'IN_MEMORY_ACL_TEST_DOUBLE'}
 foreach($name in @('Guard-Acl','Guard')){
  $ok=$true;try{& $name $data.short $true ([bool]$c.ancestor)|Out-Null}catch{$ok=$false}
  $results+=@{case=$c.name;policy=$name;pass=($ok -eq $c.pass)};$policyCount++
 }
}
$failures=@($results|Where-Object {-not $_.pass}).Count
[pscustomobject]@{kind='OWNED_LONG_PATH_ACL_ONLY';physicalCases=$physical;invalidPaths=$invalid;policyCases=$policyCount;failures=$failures;results=$results;principalQueries=0;ACLWrites=0}|ConvertTo-Json -Depth 6 -Compress
Need ($failures -eq 0)
