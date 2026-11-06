# Fixed-role observer control and offline owner/context contract

2026-11-05. Adopted within user-approved D1-D4 offline implementation, following
[private launch contract](2026-11-05-mixed-native-offline-qualification-contract.md).
No actual collector/Native/Git run, OS rights, resource formula/value, profile or
baseline is approved. Single source writer; independent review writes reports.

## Verifiable batch scope

Implement a pure C# fixed-role observer policy with no P/Invoke/process/file I/O,
matching Node/C# control frame codecs, Node owned-control-stream exchange, and
bounded read-only owner/context artifact binding. Synthetic kernel events and
in-memory streams prove consistency/refusal only. A unit compile of the pure
policy is not Prepare or a collector DLL build. Existing collector Run and its
Node-only allowlist stay unchanged; actual OS event/IPC integration is next work.

## Wire version1

Each frame is ASCII, exact LF terminated, no CR/escaping/BOM. Fields are tab
separated: CA_MIXED_NATIVE_CONTROL_V1, contextSha256, sequence, type, body fields.
Context is lowercase64hex; each direction independently starts sequence1 and
accepts only the next integer. Hashes/IDs are correlation, not authorization.
Explicit maxFrameBytes/maxTotalBytes/maxFrames are mandatory, no live defaults.
All are positive safe integers; frame limit fits a signed32-bit buffer count.
Decoder handles fragments/coalesced frames, refuses EOF fragments, wrong context,
replay/gap, unknown fields/types, invalid scalars and exceeded declared budgets.
Failure poisons the decoder. No raw data is included in errors.

Body order and exact message keys follow the existing handshake:

| Type | Ordered body fields |
| --- | --- |
| INTENT, READY | launchId, role, commandSha256 |
| SPAWNED | launchId, pid |
| ACQUIRED | launchId, role, pid, imageSha256, creationIdentity, parentOwned |
| CLOSED | launchId, pid, creationIdentity, exitCode, signal |
| RELEASED | launchId, pid, imageSha256, creationIdentity, osExited, handleReleased, unknownDescendants, cleanupComplete, queryStatus, peakWorkingSetBytes |
| ABANDON | launchId |
| ABANDONED | launchId, unknownDescendants, cleanupComplete |

Roles only GIT/V2/V5; IDs match nonempty ASCII alnum/underscore/hyphen. Integers
are canonical decimal, no leading zero/+/-0; PID is positive uint32, sequence
positive JS-safe, exitCode nullable JS-safe signed integer. Null token is ~,
booleans0/1, signal null or SIG[A-Z0-9]+. Query RECORDED requires positive JS-safe
bytes; FAILED requires null, never fallback. Other hashes lowercase64hex.
Only the control streams are used, never child protocol stdout/stderr.

## Pure observer policy

Constructor binds context, expected HOST PID/path/image, ordered fixed launch
bindings including role/command digest/image path+digest, explicit frame limits.
Binding lists are cloned. HOST create must match the launch-owned expected PID
and image before control INTENT is accepted. The driver supplies identity acquired
before debugger Continue; pure metadata does not prove that provenance.

INTENT must match the next binding with only HOST live and no unfinished launch.
READY reserves one slot. Child create before Continue must match pending role
and image and be a new PID/creation instance; unknown create is sticky failure.
Only HOST may be the live ancestor at acquisition, so no new Parent-PID scanning
or access right is introduced. Shared Native images do not select V2/V5 roles;
serialized intent does. ACQUIRED is generated only from create. SPAWNED may arrive before or after
CREATE; queue its PID if early and compare at acquisition. Never wait for
SPAWNED to continue the debugger event.

OS exit/query/handle-release metadata and Node CLOSED may arrive in either order.
RELEASED is emitted once both belong to the same instance. Failure/unknown cleanup
blocks new INTENT but permits current close/abandon settlement. Git exit0/1 is
allowed for existing conventions; Native exit0/no signal. Root exit may precede
queued control bytes, but a still-live known child at HOST exit is sticky failure; drain EOF before final summary. Completion requires root
exit+release, closed control input, all planned slots settled, no unknown create
or fault. Cleanup and semantic completion are separate. Snapshot always states
measurementEligible=false/executionAuthorized=false/productionAdmission=false;
observer lifetime and resource formula remain unmeasured/unset.

## Owned Node stream exchange

The exchange is the only reader/writer for separately supplied control streams;
reject existing data/readable consumers and overlapping exchanges. Frame context
and sequence are checked in both directions. Replies must match current request
(type/launchId), including ACQUIRED queued before SPAWNED. Unsolicited, duplicate,
malformed, late-after-stop, EOF/error or aborted exchange poisons the channel;
no retry or new launch. Backpressure/write errors are observed. Stop does not
claim OS cleanup; the future driver must terminate/drain actual owned processes.
No spawn/attach/console or transport over child pipes is implemented here.

## Offline owner/context loading

Manifest exact fields: kind=MIXED_NATIVE_OFFLINE_OWNER_CONTEXT, schemaVersion1,
status=PROPOSED, artifacts, bindings, liveContext=null, executionAuthorized=false,
productionAdmission=false, measurementEligible=false. artifacts are nonempty
unique {id,path,sizeBytes,sha256}; paths are safe relative plain non-hardlinked
files under an explicitly owned root. bindings exactly owner,host,observer,git,
native,oracle,repository,workspace,source, each referencing an artifact id.
These may be pinned descriptor references, not executable/database authentication.

Explicit maxManifestBytes/maxArtifactBytes/maxTotalBytes/maxFiles are mandatory.
Read at most expected/cap+1, compare named/open/final identity, canonical paths,
size/hash and change timestamps. Parse manifest and compute receipt hash from
the same bytes; final recheck every file and manifest before returning detached
frozen pins/contextSha. Root/ancestor reparse paths, traversal, duplicate physical
identity, changed/deleted files and out-of-budget inputs refuse. This is not an
atomic filesystem snapshot. Do not open or mutate SQLite. Output explicitly
states source/history/database/tool authenticity unverified; no run authority.

## Remaining exact real bridge

OS capture, actual Root/collector launch, C# event-loop connection, bounded pipe
I/O scheduling, isolated real Source/application-owned evaluation state and real
oracles remain unimplemented or unproved by this slice. Production paths, old
Node helper controls, Canonical IR, SQL/goldens and gate numbers are unchanged.
Actual run/compiler/identities/counts/limits require the concrete reserved packet;
new rights/topology and resource formula/values remain separate decisions.

An owner-reported SPAWNED without observer CREATE/owned instance is not an empty
launch: ABANDON must mark unknown and cannot report cleanup complete. It remains
unknown at HOST exit. Known child cleanup can later finish after a HOST-ordering
failure, but semantic completion stays refused. This preserves the existing
child-exited-before-HOST constraint without discarding valid late CLOSED bytes.
Owner manifest JSON uses exact two-space JSON.stringify layout plus LF to refuse
ambiguous duplicate keys/BOM/alternate encodings; it is still only offline data.

Unmatched OS-instance exception/exit metadata, including mismatched HOST creation
identity and owner PID inconsistent with a captured child, leaves sticky unknown
cleanup even if later known instances exit. An already exited child may still
receive its queued CLOSED, but no later receipt erases an unanchored instance.
