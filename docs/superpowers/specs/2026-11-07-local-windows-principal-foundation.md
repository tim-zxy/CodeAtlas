# Process-local Windows principal foundation

Status: local same-account trust boundary accepted; identity-query foundation only.
No issuer, grant, persistent access or actual OS query is activated by this batch.

The user accepts same-SID Agents as the local account, not proof of human consent.
All future operation handles are current-process/specified-operation only; restart
invalidates them. No remote/model/scan clearance/publication/user migration follows.

The minimal platform helper queries TOKEN_QUERY and PROCESS_QUERY_LIMITED_INFORMATION
only, over the actual internally selected Node PID. GetProcessTimes supplies exact
creation FILETIME; TokenUser supplies SID. It closes process/token/buffer resources.
The expected PID and a private random challenge will come from Runtime, never JSON.
Fixed helper and host identity/lifetime validation is still required before any
reply can authenticate an account. Existing A6 collectors do not supply authority.

The offline wire data is one canonical JSON line in this exact order:
{schema,version,pid,creationTimeFileTime,sid,challenge}. Schema is
codeatlas.windows-process-principal, version1; PID is positive UInt32, creation time
is a positive UInt64 decimal string, SID is platform SID text, challenge a lowercase
Guid D string. A single trailing LF/CRLF is accepted; BOM/duplicate keys/extra stdout
or fields refuse. Byte limit is explicit existing request output allowance, no new
default. Parser output is frozen DATA, not a principal/operation handle or grant.

C# source and Runtime decoder are independently developed/offline tested. This
avoids introducing a new dependency or pretending username/env/PATH/config is OS
authority. A helper result alone is not trusted before real host/helper binding and
join/cleanup are implemented and reviewed. Unknown identity or cleanup refuses.

Next composition must use existing QUERY plus READ_SOURCE for capture, with actual
scope/policy ownership and original Application authorizeOperation checks. INDEX
for Source preparation is separate; model/update/publication are not silently
added. The actual issuer, policy/revocation owner and operation lifecycle remain
the next integration task. No user-DB migration or R9 is part of this foundation.


Implementation note: raw typed-array conversion hooks are not part of the trusted
wire. The decoder obtains buffer/offset/length intrinsically, refuses shared input,
and decodes a fresh intrinsic view without invoking source valueOf/length/iterator.
No await or source callback occurs between that view and decode. The output is
independent frozen scalar data; this still supplies no authenticated principal.
The helper attempts buffer/token/process cleanup even if an earlier release fails;
failed handle release refuses a Query result. Actual OS behavior remains untested.

## Private owner implementation and actual admission result

The foundation-only statements above describe the retained initial batch. The next
batch implements private windows-principal-owner and local-capture-operation modules;
neither is publicly exported or a user-facing grant endpoint. Reply DTOs remain data.

The only host profile is C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe,
SHA256 60c9b29843624dd8af6b6a7b26147753be6aeef65098b9a503cc50850afe410f.
Helper LF SHA256 1cfe23cd44422131131e29fe3eecf7f1c95c3b4281e4d3f06a0a03a4cfa11f25
and CRLF fd4cad83224e64fdb584444f0e1138ae00353b48a854a73e147b49c0e4b390d6
bind the installed source; no caller hash/path is accepted. The protected Windows
platform/.NET compiler and installed Runtime code are part of the trust base. Host
updates or other installations refuse; this is not a portable qualification profile.
The fixed program uses no ExecutionPolicy bypass, user profile, PATH resolution,
impersonation or ACL change. Temporary compilation requires the actual known-folder
Temp ancestry to have trusted owners/no reparse/no untrusted critical writers.
Trusted subjects are the actual current account, SYSTEM, Administrators and protected
Windows-directory owner. This requirement has not been relaxed to admit this machine.

Principal mint requires bounded exact bytes, real spawn, stdin finish, both EOFs,
normal close, post-host identity, exact owned cleanup and original live controls.
Cancellation/unknown exit invalidates previous principals; unresolved cleanup refuses
new lookup. No process-tree hard isolation is claimed. Pre-spawn failure does not
recursively delete a directory before the fixed program has checked its ancestry.
Handles are frozen opaque WeakMap keys bound to module incarnation/current PID and
actual process birth/SID; copies/restart/other modules do not reconstruct authority.

CAPTURE owns only QUERY/READ_SOURCE, genuine current ContractStore selection and a
single existing HistoryReadBudget. Security config can restrict, not create grants.
Scope/version/policy checks occur at acquisition/read/finalization; memory checkpoints
avoid duplicate per-entity SQL. Failure latches cannot revive when state/budgets are
restored; finalization closes even on failure. Authentic repeated close is idempotent.
No INDEX/model/remote/scan/publication grant or database migration is introduced.

Offline tests use isolated platform/identity doubles, actual test-owned SQLite and
original policy. An explicit one-shot real current-process probe was attempted and
refused at Principal acquisition with UNKNOWN cleanup. No handle escaped; memory
scope was not reached. Empty Temp/codeatlas-principal-VU96KA is retained. Read-only
ACL inspection found two untrusted Modify rules on Temp, violating the fixed guard;
stderr was not retained, so exact exit cause remains unproved. No retry/deletion/ACL
change occurred. Actual successful owner integration and Application bootstrap remain
open. A protected compilation location or precompiled helper must be reviewed as a
concrete lifecycle/security decision before a new actual attempt, never a guard bypass.
See ../reviews/2026-11-07-local-principal-operation.json for reproducible evidence.

## Private redacted failure diagnostics

WindowsPrincipalOwnerError retains the original refusal code/cleanup state and adds
an immutable diagnostic snapshot: fixed phase/helperPhase, stderrObserved,
stderrTruncated, spawnObserved, nullable bounded signed-32-bit childExitCode and
childSignalObserved. No SID, path, input, arbitrary exception or stderr text is exposed.
At most96 stderr bytes are copied transiently; excess discards the whole diagnostic
text. Only exact CODEATLAS_PRINCIPAL_FAILURE:<fixed-helper-phase> plus one LF/CRLF
becomes helperPhase; arbitrary/extra/invalid bytes yield UNAVAILABLE. Fixed program
catch emits this stage only. Any stderr still rejects, including marker with exit0.
A snapshot describes observation, not a unique cause, cleanup settlement or grant.
No real retry or KnownFolder/loading contract change accompanies this addition.
