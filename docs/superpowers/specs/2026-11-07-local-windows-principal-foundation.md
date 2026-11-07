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
