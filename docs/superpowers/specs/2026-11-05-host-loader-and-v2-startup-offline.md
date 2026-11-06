# HOST loader bytes and V2 startup: offline implementation scope

This batch refines already approved HOST-context/dynamic V2 offline implementation.
No real HOST/Native/Git/observer/Win32, new argv/Node flags/rights, live authentication,
physical formulas/values or installed profile follows. All original acceptance stays.

## Exact implementation

Original loadMixedNativeOwnerContext signature/result stays metadata-only. Additional
loadMixedNativeHostModuleClosure(root, manifestPath, expectedSha, caps, moduleIds)
reuses the same bounded file-handle/ancestry/hash/identity/final reread checks. It
keeps selected .js/.mjs verified strict UTF-8 source (including BOM) in an opaque
WeakMap-branded closure. It does not re-read paths for execution. Existing explicit
caps bound file reads; local serialized hook edge plan uses maxManifestBytes, with
no new default/physical formula. UTF-16/runtime allocation/OS RSS are not qualified.

createMixedNativeHostModuleHooks(closure, entryArtifactId, edges, bootstrapParentURL)
returns Node synchronous resolve/load hook functions, entrySpecifier/dispose/status.
Each fixed coordinator-local edge is exactly {from,specifier,to}; to is a selected
module artifact ID or exact canonical node: builtin. Every module is reachable from
entry. No package resolution fallback, arbitrary filesystem import, query/fragment,
percent alias, data/network URL, JSON/native addon/CommonJS or missing dependency.
A unique per-instance URL namespace avoids earlier ESM cache aliases. Initial entry
claim is once and matches the explicit bootstrap parent URL (undefined only for pure
hook invocation tests). Later imports require an exact parent/specifier edge. Hooks
return already verified source strings. Error is sticky; dispose closes the hooks.
Node hook registration ownership/deregistration is the fixed bootstrap's job; tests
register only for temporary synthetic arithmetic modules, never product/HOST code.

This is a loading consistency mechanism, not an fs/eval/vm/process security sandbox.
The bootstrap itself executes before hooks. Self-hash, URL or digest does not prove
its launch origin. moduleClosureAuthenticated/execution/production/measurement/live
flags stay false. A complete real product dependency graph is not auto-generated or
silently trusted; actual omitted edges/files refuse.

Separate dynamic HOST Windows partial factory composes the existing event operations,
root clock/budget/cancellation, wait lane, HOST pipe (including stderr and handle
ledger) with V2 bridge/loop. Old root gains only a read-only internal Cancelled accessor
using its existing owner-thread check. Start/CreateProcess/pipe inheritance/abort/
cleanup are unchanged. New adapter tests jointly compile actual declarations and
exercise pure enum/delegation/error conditions; successful real root factory/OS pipe
identity and cleanup are NOT runtime verified. No fake created/handle state is used.

## Remaining complete-operation prerequisites

The fixed CLI bootstrap data plumbing described below is now implemented. A pinned
actual current13 operation export and its complete product dependency artifact/edge
graph still need integration; do not substitute the synthetic entry's return for
Source/capture/Application publication evidence. Application/Storage opaque captures
must originate inside that operation, never be deserialized from the descriptor.
Bootstrap's own static helper provenance and actual OS-channel admission remain open.
No automatic graph expansion, default cap, new launch flags or authentication claim
is permitted to hide an unresolved dependency.

## Fixed bootstrap data plumbing implemented in the same offline batch

The additional fixed entry is scripts/mixed-native-host-bootstrap.mjs. It keeps the
same two argv values (absolute manifest.json and expected SHA). It uses only explicit
CODEATLAS_HOST_MAX_MANIFEST_BYTES, CODEATLAS_HOST_MAX_ARTIFACT_BYTES,
CODEATLAS_HOST_MAX_TOTAL_BYTES, CODEATLAS_HOST_MAX_FILES and
CODEATLAS_HOST_DEADLINE_EPOCH_MS in the existing fixed environment block; missing,
unknown prefix fields, noncanonical/nonpositive numbers, NODE_OPTIONS/NODE_PATH and
expired deadline refuse. No default numbers or launch flags are added. These are
coordinator-fixed transport data, never independent authorization.

Fixed artifact ID bootstrap is an ordinary manifest artifact, with a .json path and
canonical JSON bytes. Inventory manifest schema/bindings/hash domain stay unchanged.
Descriptor exact schema: kind MIXED_NATIVE_HOST_BOOTSTRAP_DESCRIPTOR, schemaVersion1,
artifactLimits, deadlineEpochMs, hostEntryArtifactId, hostModuleArtifactIds, workspaceId,
repositoryId, slots, controlLimits and edges. Cap/deadline must match the explicit
initial envelope. Root/manifest path/hash are derived from fixed argv, so descriptor
has no self-referential manifest digest. No approval flags or opaque capture handle.
The existing bounded reader snapshots descriptor and selected module bytes in the
SAME full verified read sequence; it does not reread/reparse the manifest as an extra
independent context. Original metadata and standalone closure paths stay unchanged.

prepareFixedMixedNativeHostBootstrap(argv,environment) returns fixed ownerInput and
hooks whose initial parent is this bootstrap module's own import.meta.url (not a
caller override). runFixedMixedNativeHostBootstrap(argv,environment,channels) registers
hooks, imports only entrySpecifier and calls the pinned entry's fixed export
runMixedNativeHostOperation with fixed ownerInput and channels. Hooks remain installed
through its full awaited operation, including dynamic imports, and finally deregister
on success/import/export/entry error; closed hook errors never fall back. Return value
is data with all execution/production/measurement/module/context/live authority flags
false. CLI alone fixes channels to process.stdin/stdout and writes no diagnostic data
to control stdout. Unit tests call exported functions with temporary synthetic modules
and streams; the CLI/main is not invoked and no HOST/business workflow is executed.

This completes bootstrap plumbing, not an actual current13 operation entry or live
admission. The separately pinned business module must still perform actual Source,
capture and Application binding in-process. Its complete exact product dependency graph
and fixed operation descriptor are not replaced by the synthetic function's return.
Bootstrap and its static helpers execute before hooks; their immutable live loading
and original OS pipe instance provenance are still independent prerequisite evidence.
Only a change to existing startup/trust/rights/numeric policy requires a new decision;
ordinary explicit descriptor and fixed operation wiring may continue under approval.

## Bounded offline continuation - 2026-11-06

See [N1 exact allSOURCE orchestration](2026-11-06-current13-no-native-offline.md) and
[HOST protected-consumption ownership](2026-11-06-host-consumption-lifetime-offline.md).
These private offline refinements preserve prior Native/suffix guards, operation
authority and live NOT_READY; no OS guarantee, actual launch, new right or resource
number follows. Historical outcomes below/above remain scoped to their tested bytes.
