# Mixed Native event/owner bridge: offline continuation

Authority: approved D1-D4 and continued offline OS/context integration. No actual
collector/Git/Native/debugger operation, run authority, formula/value or new right.

Success: compile the existing Windows API adapter without invoking it; drive the
same event coordinator through owned fake operations; prove CREATE capture and
policy validation precede Continue, EXIT Continue precedes wait/query/release,
no waiting for Node SPAWNED before CREATE Continue, file-handle settlement on
failure, no double Continue, unknown instance/failed cleanup remains sticky.
Bind real temporary artifact bytes to the existing draft and launch handshake;
no SQLite/history/tool/environment authentication is inferred.

## Event bridge

MixedNativeDebugEventBridge owns one serialized debugger-event lane and policy.
Its fixed Event mirrors the existing DEBUG_EVENT fields. IOperations captures an
owned duplicate and image/creation evidence, closes only the debug image handle,
continues the event, queries/releases known owned handles and terminates a known
owned duplicate during abort. It cannot spawn/attach or choose new access rights.
The Windows implementation is a private partial of the existing collector and
reuses existing P/Invokes, duplicate option2, image-handle hashing, final process
query and close. Existing Run stays the Node-only helper; no mixed launch path.
Driver metadata is not authority. Fake operations test ordering only.

CREATE is captured/stored before policy validation; invalid/unknown creates stay
retained for bounded abort cleanup and mark unknown. The debug image handle is
closed before Continue (including LOAD_DLL). Exceptions default to not-handled
when refused. EXIT is continued before waiting for termination/final query/close.
Known exited handles are never closed twice. A failed Continue is uncertain and
is never retried. Abort terminates only retained owned handles and settles them;
new unknown events cannot be silently dropped. No time/resource defaults: a
caller-supplied remaining-deadline provider is mandatory for the Windows adapter.
Bridge summaries keep all execution/measurement/production flags false; bridge
faults override semantic success, and unknown instance/cleanup cannot be clean.
C# bounded control pipe scheduler and live launch/context remain subsequent work.

## Bound owner

bindMixedNativeOwner(request,incoming,outgoing), exact request fields root,
manifestPath,manifestSha256,artifactLimits,draft,environmentArtifactId,
launchBindings,controlLimits. Snapshot/validate before stream ownership. Load
existing canonical owner context, match draft owner/source/oracle/repository/
workspace binding hashes, HOST/OBSERVER/GIT images and V2/V5 to its single native
artifact. Explicit environmentArtifactId must reference a pinned artifact matching
the draft environment digest; it does not prove actual environment values.
Launch bindings use existing exact fixed-role session schema and image matches.
Create same-context owned exchange plus session only after all binding checks;
clean partial setup on failure. Return only offline session take/status/dispose,
context and plan digests and false authority/authenticity. Never run/open DBs.

## Parallel ownership and integration

Root: new C# bridge/Windows adapter + dedicated pure-unit tests; collector changes
only partial keyword plus private factory, shared package/docs/evidence.
Mixed-oracle agent: only new mixed-native-bound-owner.mjs and its test/evidence.
Reviewer: report only. No worktree change. Join at directed tests and independent
review, reuse unchanged TS/build evidence. Real sampling stays serial and pending.

Event ordinal is supplied by the future successful-Wait event lane; it must be
exactly last+1 and is consumed before any operation. Duplicate/gap/rollback
receipts refuse without a second Continue, including after BeginAbort. This is
ordering consistency, not OS authentication. Every failed CREATE is sticky
unknown; every refused exception defaults to DBG_EXCEPTION_NOT_HANDLED, even
when its process instance cannot be located. The remaining-deadline provider is
mandatory but its live clock/ownership source is not yet integrated or proved.
