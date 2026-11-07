# Principal bootstrap: precompiled helper decision candidate

Status: PROPOSED; read-only review only. No DLL was compiled, installed or loaded.
The historical real probe remains failed/UNKNOWN; its retained directory is untouched.

## Recommended minimal contract

Use a single .NET Framework x64 managed DLL containing the existing
WindowsProcessPrincipal Query/Serialize class, with the existing pinned Windows
PowerShell host. Read bounded DLL bytes once from a fixed installed artifact URL,
check the accepted artifact SHA256, then pass those exact copied bytes to the fixed
program and Assembly.Load(byte[]). Do not hash a path and load that path later.
No request may supply the artifact, digest, host path, assembly name or resolver.
Reject any preexisting matching type; require exact loaded assembly/type/methods.
DLL load/metadata success never grants a Principal. Existing actual Node PID, private
nonce, TokenUser/birth, same-account comparison, strict six-field reply, byte caps,
normal exit, EOF, cancellation and opaque handle ownership remain mandatory.

The installed artifact belongs to the already trusted Runtime deployment domain;
its exact location and integrity/lifecycle must be fixed before enabling it. File
hash alone does not prove protection of directories or provenance of the manifest.
The artifact is build output, not a new external package or public grant format.
No default search path, plugin directory, downloads, AssemblyResolve handler,
self-contained .NET or NativeAOT is introduced. Enumerate actual AssemblyRef and
P/Invoke imports after the proposed offline build; mscorlib/System and protected
CLR/kernel32/advapi32 are the intended closure, not a proven full Native DLL chain.
Refuse unexpected dependencies rather than silently expanding that closure.

## Concrete build preparation (not executed)

Existing source: scripts/windows-process-principal.cs, retained reviewed LF SHA256
1cfe23cd44422131131e29fe3eecf7f1c95c3b4281e4d3f06a0a03a4cfa11f25
(CRLF source has separate retained hash). Freeze one exact byte variant per build.
Read-only machine observations, not an accepted portable compiler profile:

- C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe,
  SHA256 46809206887326d2d24db1eff1f3064de972c3451abe766b49111450a5e08e00
- same directory/mscorlib.dll,
  SHA256 11ac114c43ecf6996bef58ba3c99fba3693a4560a84eeadde54d193060dc626c
- same directory/System.dll,
  SHA256 2b3c17c6208a0b4b6beb94e1a066f99ba06cdb2ea919479e99d47e8c6d96dc71

Candidate direct compiler invocation, after a reviewed fixed owned build directory
and all input identities are validated (argument list, no shell or response file):

```
C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe
/nologo /noconfig /nostdlib+ /target:library /platform:x64 /optimize+ /debug- /unsafe-
/reference:C:/Windows/Microsoft.NET/Framework64/v4.0.30319/mscorlib.dll
/reference:C:/Windows/Microsoft.NET/Framework64/v4.0.30319/System.dll
/out:<fixed-owned-build-dir>/windows-process-principal.dll
<fixed-source-copy>/windows-process-principal.cs
```

This command is a proposal, not tested/approved execution. Validate supported compiler
options, exact references and process/environment/temp outputs in an offline build.
Record compiler/source/reference hashes, arguments, actual output hash/size and PE /
assembly identity. Do not claim deterministic/reproducible bytes without measuring;
the installed accepted artifact hash is authoritative. Output SHA256 is currently
UNKNOWN because no build occurred. Pure ValidateInput/Serialize and metadata tests
must not call Query. Packaging must preserve exact artifact/manifest identity.

## KnownFolder and lifecycle change needing decision

Remove runtime Add-Type compilation, mkdtemp, process TEMP/TMP redirection and its
KnownFolder compile-directory admission/recursive cleanup for THIS bootstrap path.
This is an explicit replacement of the old contract, not a retry through a different
Temp location. Keep the original path closed/available for rollback only; it remains
unready on this machine. The DLL path, binding and exact loaded bytes become the new
bootstrap proof. Fixed host image pre/post checks and original join/EOF remain.
Do not claim Framework itself never uses temporary files or process-tree isolation.
Historical codeatlas-principal-VU96KA stays UNKNOWN and is not cleaned by this change.

No ACL, Windows group membership, security policy, service, persistent access, scan,
model, remote or publication permission is needed or granted. Any protected-directory
installation or security-setting change would require normal operation-time platform
approval. No such action is proposed for automatic execution. The current CodexSandboxUsers
Temp rights must not be removed or bypassed. It is also unresolved whether a future
actual host token is the user-account token accepted by the product; do not infer it
from directory owner, environment username, account names or manifest claims.

Required decisions: accept the exact compiled-artifact provenance/installed loading
contract and replacement of KnownFolder runtime compilation; later approve a precisely
bounded actual validation independently. Neither is implemented by diagnostics.

## Alternatives, risk and rollback

An independent .NET Framework exe removes PowerShell but adds bounded stdin parsing,
entry point, same-account comparison and a new launch identity; larger change now.
An existing protected compilation directory still needs full ancestry proof plus a
KnownFolder contract change, and can conflict with sandbox isolation. Do not create
it by silently changing ACL. Conservative alternative: leave actual admission blocked.

Principal risk is accepting an untrusted build/artifact or unresolved CLR/load closure.
Mitigate with frozen inputs, exact copied bytes, explicit dependencies and negative
artifact/ordering/lifecycle tests before any real query. Rollback disables the new
path and leaves acquisition unavailable, without granting access or deleting evidence.
Offline substitutes cannot prove actual OS success or A6 qualification.
