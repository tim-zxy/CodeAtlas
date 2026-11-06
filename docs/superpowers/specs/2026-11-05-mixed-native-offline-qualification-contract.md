# Mixed Native qualification: approved offline contract slice

2026-11-05. User approved D1-D4 design and offline implementation. This document
adopts only the exact offline plan/trace reader contract below. It does not
approve real execution, new rights, physical formulas/numbers, installed profiles
or production admission. Existing A5/A6 and ADR-020 remain authoritative.

## Scope and success criteria

Implement scripts/mixed-native-qualification-plan.mjs with two pure readers.
No filesystem/process/OS collector operation, product package export or Runtime
route is introduced. Inputs are untrusted declarative data; a matching digest
is a consistency binding, never authentication, approval or Source authority.
Success: positive synthetic cases and negative binding/role/lifecycle cases
pass, old conformance regression and architecture checks pass, and status/trace
record fresh evidence. Actual Native, full A6 and Phase1 acceptance remain open.

## D1: private first-run plan, not execution authority

readMixedNativeQualificationDraft(value) accepts exact own JSON-data fields:
kind=MIXED_NATIVE_QUALIFICATION_DRAFT, schemaVersion=1,
scope=INSTRUMENTED_ONLY, productionAdmission=false, executionAuthorized=false,
bindings={owner,source,oracle,repository,workspace,environment}, roles, resource,
runSpec=null. Each binding is a lowercase 64-hex SHA256 of a separately owned
artifact. No missing/default/unknown key, token, permission or command is allowed.
Only five role entries {role,imageSha256} exist, exactly once each:
OBSERVER, HOST, GIT, V2, V5. The descriptor does not admit any actual image.
The reader returns a detached deep-frozen normalized plan, its deterministic
planDigest, status=OFFLINE_DRAFT_ONLY, measurementEligible=false,
productionAdmission=false and executionAuthorized=false.

This is the first non-executing entry slice. A real private runner still needs
reviewed Source/application-owned DB initialization, exact executable/argv/env,
instance acquisition, output ownership and approved run packet. It cannot mint
an authorization token or call ordinary profile matching as first-run authority.
Public empty/mismatched-profile rejection stays unchanged.

## D2: versioned resource descriptor, no physical formula

resource has exact fields: contractVersion=1,
metric=PROCESS_PEAK_WORKING_SET_BYTES, hostLogicalMetric=RETAINED_LOGICAL_BYTES,
components=[OBSERVER,HOST,GIT,V2,V5], formula=null, reservationBytes=null,
hostAllowanceBytes=null. This version describes the offline inventory only;
it is not a new accepted production profile/purpose or aggregation formula.
No max/sum, zero unknown overhead, RSS/commit equivalence, logical-to-physical
conversion, calibration count, holdout count or threshold is chosen.

HOST retains Source, capture, SQLite, normalization and Stage/Store values;
Git and sequential v2/v5 can overlap HOST retention and observer lifetime.
Record these lifetimes separately. Observer final-close cost is unresolved.
The live mixed purpose/profile schema, accounting relation and all numbers
remain explicit blockers and require their reserved decision process.

## D3: fixed-role synthetic lifecycle consistency

readMixedNativeQualificationTrace(value,draft) first revalidates draft.
Trace exact fields: kind=MIXED_NATIVE_QUALIFICATION_TRACE, schemaVersion=1,
planDigest, provenance=OFFLINE_UNAUTHENTICATED, outcome, processes.
Outcome is COMPLETE, CANCELLED or FAILED; none grants qualification.
Only controlled HOST/GIT/V2/V5 are process rows. OBSERVER remains an inventory
component, not a fabricated target process; actual observer lifetime is unproved.
There is exactly one HOST root and zero or more fixed child roles. Absence of a
role is not scenario coverage. Counts/allowed actual instances remain unapproved.

Each process exact fields: instanceId, parentInstanceId, pid, creationIdentity,
role, imageSha256, pipeOwnerInstanceId, createOrdinal, acquireOrdinal,
workOrdinal, exitOrdinal, finalQueryOrdinal, releaseOrdinal, pipeCloseOrdinal,
queryStatus, peakWorkingSetBytes. IDs are nonempty ASCII identifiers matching [A-Za-z0-9_-]+; PID and
ordinals positive safe integers. Instance IDs and PID+creationIdentity pairs
are unique; an overlapping reuse of a PID is refused. imageSha256 matches its
role binding. HOST parent and pipe owner/close ordinal are null. Every child has
HOST parent and pipe owner; no generic roles or unknown descendant fallback.

For each instance create < acquire < work < exit < finalQuery < release.
Child pipe close follows child exit and precedes HOST exit; child create follows
HOST work start and child exit precedes HOST exit. All event ordinals are unique.
A final query status RECORDED requires positive safe working-set bytes; FAILED
requires null bytes and a non-COMPLETE outcome. There is no fallback/substitute.
All rows must still prove handle release/close sequence even on failure/cancel.
The reader returns only deeply frozen OFFLINE_TRACE_CONSISTENT, counts and
measurementEligible=false/productionAdmission=false/executionAuthorized=false.

These are ordinal consistency checks on declarative records, not OS provenance.
The actual Git argv-before-stdin case, private v2/v5 coordination, CREATE-event
handle ownership, allowed images/descendants and true final queries are not
implemented by this slice. Node must remain sole owner of protocol pipes in
any later integration. No collector role/rights expansion occurs here.

## D4: instrumented-only applicability

Even matching semantics and complete synthetic lifecycles never establish
non-debug Rust/Git equivalence. Paired real corpus, capture method, lifetimes,
acceptance rule and numerical margin remain unapproved. No profile/baseline
installation or canonical publication is performed.

## Governing synchronization and next work

ADR-020, DESIGN_AUTHORITY, acceptance/WBS and trace link this bounded slice.
Existing schemas/SQL/migrations/goldens remain unchanged. Tests use explicit
synthetic JSON in a dedicated private tool test, not new measured Fixture truth.
The test is added to the ordinary local Node test root; no formal CI is run.
Next work is exact private bridge/acquisition design with no new OS rights,
then offline implementation within that accepted contract. Any required new
permission or unresolved resource formula stops for a concrete decision. Real
run packet and all real runs remain reserved even after offline code passes.

## Next bridge integration design (not implemented by the readers)

The approved fixed-role direction can reuse the collector's existing anonymous
root stdin/stdout/stderr handles. No named pipe, socket, attach, PEB inspection,
extra OS access right or new dependency is selected. Root HOST stdout is a
qualification control stream only; its child Git/v2/v5 streams remain solely
owned by the existing Node protocol decoders. HOST stderr is bounded diagnostics,
never a control fallback. These are new qualification messages, not changes to
product Native wire protocols or producer outputs.

A single pending launch is permitted; A5 already serializes its fixed producers.
The proposed ordered exchange is:

1. A fixed owner computes launchId/role and a command-plan digest from the exact
   frozen executable, argv, environment and input bytes that its spawn site will
   consume. It sends INTENT and awaits READY before spawn. These are correlation
   identifiers, not authority tokens; the reviewed plan and actual caller code
   remain the authority boundary. No arbitrary command is sent for execution.
2. Observer validates the pending fixed role/plan, rejects overlapping intent,
   then sends READY. Node's private spawn owner calls spawn exactly once. Parsing
   or pre-spawn refusal must abandon this intent explicitly; no silent reuse.
3. At CREATE, before ContinueDebugEvent, observer acquires and binds owned
   instance/image/creation evidence to the sole pending role. Unknown descendant,
   image mismatch, missing/duplicate intent or ownership uncertainty fails closed.
   It queues ACQUIRED(launchId,instance identity), then continues the event.
4. Node's post-spawn/pre-input hook matches ACQUIRED to the actual child PID and
   pending launch. It keeps the pipes, bounded decoder, kill and await-close.
   Git argv can begin after debugger Continue, so withholding empty stdin is
   not the acquisition proof: acquisition before Continue is essential.
5. Owner CLOSE and observer OS EXIT/final query/release correlate to the same
   instance. Retain each result independently; unknown/missing cleanup refuses
   completion, including cancellation, control-channel loss and partial spawn.
   The next intent cannot reuse an unfinished slot. No retry or fallback.

Do not wait for the parent's post-spawn PID message before continuing CREATE:
CreateProcess/spawn completion can depend on debugger continuation. That order
can deadlock. Capture/validate in the debugger event first; the Node owner checks
its actual PID against the queued acquisition afterward. A missing acknowledgement
still leads to stop/cleanup, never assumed success.

V2 and V5 may share executable/image SHA, so image identity alone cannot select
the role. The serialized pending launch and code-bound actual request/argv are
also necessary. OS image evidence does not independently prove argv bytes;
no unsupported claim of OS-authenticated command arguments is made.

Implementation prerequisites within the existing direction: identify an explicit
private before-spawn ownership parameter at controlledGit and shared runProcess,
thread it through the trusted qualification-only composition without public
profile flags or ambient/global/AsyncLocalStorage authority, preserve ordinary
callers' exact behavior, and bind Git to the frozen executable rather than PATH.
The current v5 beforeInput hook alone is insufficient for pre-spawn INTENT; v2
and Source likewise need explicit private plumbing. This requires call-path
review and offline refusal/cleanup tests before actual wiring. The existing
collector Run signature and image allowlist are unchanged in this first slice.

No real handshake/CREATE trace was produced. Exact command/environment policy,
complete application-owned Source/database context and physical observer lifetime
remain unresolved integration work. Resource formula and numeric/run approvals
are still reserved; this sequence does not approve unknown values or live runs.

## Second offline slice: private spawn gates and fixed launch handshake

Adopted under the same approved D1-D4 offline direction. No real collector
or Runtime admission routing changes. Existing private Native lifecycle gains
optional beforeSpawn(plan,signal); existing three callbacks remain required.
The shared Native owner uses the optional gate for v2/v5 (and no public options
field). Its invocation timeout includes the gate. Reject/cancel/timeout before
READY causes zero spawn and one dispose; after waiting, cancellation/deadline
are checked again immediately before spawn. Existing no-hook path stays unchanged.

plan is a detached frozen snapshot of exact executablePath, arguments,
environment, cwd and stdinSha256. Those same argv/env/cwd values are passed to
spawn; only the digest of input is exposed to the hook. It confers no authority.
The callback cannot override command arguments or environment. Native stdin,
stdout decoder, stderr reader, kill and await-close remain the existing owner.

Source's non-public SourceProcessControl gains optional qualification config:
{executablePath,environment,createLifecycle(plan)}. Path must be absolute, env
explicit plain string data (no inherited default), and callback/lifecycle must
be plain non-proxy own function fields. createLifecycle returns required
beforeSpawn,beforeInput,afterClose,dispose methods per fixed Git command. No
arbitrary argv entry is added: existing controlledGit constructs its own argv.
No qualification uses PATH fallback. The application source workflow already
passes its explicit private control; bounded runtime preparation now carries
qualification explicitly rather than via ambient/global state. Public Source
exports, public Native options and ordinary Runtime routes remain unchanged.

Git's same existing account/checkpoints/deadline cover beforeSpawn and
beforeInput. Cancellation or timeout cannot produce a late spawn/input; each
created lifecycle is disposed exactly once, and afterClose only after owned
close. Fast argv-only Git may close before the post-spawn acknowledgement;
empty-input close can still settle the acknowledgement and cleanup. Nonempty
input cannot be written after close. Neither empty stdin nor this Node hook
is OS pre-work evidence; that remains the future debugger CREATE obligation.

scripts/mixed-native-launch-handshake.mjs is a private offline protocol adapter
with no I/O/process/OS implementation. A session is constructed from an exact
ordered list of {launchId,role,commandSha256,imageSha256} and a trusted exchange
function. Only GIT/V2/V5 roles are allowed, one active one-shot lifecycle at a
time; any failure poisons the session and forbids later launches. Bindings are
untrusted correlation data, not authorization, and no unknown command is filled.
The adapter hashes normalized exact command fields with an explicit domain.
INTENT->READY precedes spawn. SPAWNED->ACQUIRED verifies launchId/role/PID/image/
creation identity/parentOwned without reading child protocol streams. ACQUIRED
is queued by the future observer before debugger Continue; SPAWNED is never its
precondition. CLOSED->RELEASED requires same instance, actual exit, released
handle, no unknown descendants, cleanup complete and recorded positive working-
set peak. Missing/failure query refuses; no substitute. On failure dispose
attempts ABANDON->ABANDONED, never retries or reuses a launch. Normal dispose
only releases the one-shot session slot. Git exit0/1 is permitted for existing
ignore/branch conventions; Native requires exit0/no signal. All statuses remain
measurementEligible=false/productionAdmission=false/executionAuthorized=false.

This is offline plumbing tested with explicit in-process spawn/observer doubles,
not actual command admission, authenticated IPC, OS collection or full runtime
qualification. No live bindings are minted. Actual caller/observer wiring,
immutable actual inputs/owned databases and resource model remain incomplete.
Any additional OS right, real binary/collector run or numeric choice still
requires the reserved review. All newly qualified async gates, including beforeInput, afterClose and dispose,
race the same existing invocation deadline/cancellation signal. Cleanup is invoked
at most once even if stopped; a nonresponsive callback produces cleanupState=UNKNOWN
and cannot permit continuation. This is a Node async-wait bound, not a new OS hard
realtime guarantee. Legacy Native lifecycles without beforeSpawn retain their
existing behavior. Uncertainty refuses qualification rather than proving cleanup. Do not extend existing A6 Node-helper allowlists by inference.

### Second-slice composition and error details

The existing deep-private runMixedExecution keeps its exact original JSON input.
An independent optional second callback parameter {source,createNativeLifecycle}
is available only to trusted private callers; it is not a public request/profile
flag. Source qualification is threaded separately to its private preparation;
the Storage budget control retains exactly signal/deadlineEpochMs/maxInputBytes.
createNativeLifecycle is invoked only for actual V2/V5 stages. V2 uses a new
private default executeOwnedJavaRequest entry restricted to wire2, sharing the
original public parser, transport, event/checksum validation and frozen result.
V5 shares the same private lifecycle validator. A qualified Native lifecycle
must include beforeSpawn. Public export-star/options/admission and ordinary
one-argument mixed execution are unchanged.

A cleanup timeout/abort/refusal is diagnostically UNKNOWN, not proof of a leak
or proof of cleanup. Preserve cleanupState=UNKNOWN through stderr attachment,
Application Source and Runtime error wrappers without changing the original
error precedence. This diagnostic is separate from SQLite cleanupFailed effects.
Do not promote unresponsive observer/callback metadata into qualified evidence.

For qualified Windows Native launches, build the exact passed environment by
uppercasing host variable names with empty values, then overlaying only the
already validated explicit allowlist. Preserve clearing; do not inherit host
values or case aliases. Bind and pass that same frozen dictionary to spawn.
Windows names such as ProgramFiles(x86) are valid binding names; the offline
hash is not restricted to POSIX variable-name syntax. Explicit Source environment
stays plain string data with no inherited default. Ordinary Native environment
construction remains unchanged. No host environment values are recorded in tests
or evidence. The synthetic builder test uses only literal fake names/values.

The protocol adapter receives bounded stop signals for cleanup instead of null;
its exchange race rejects aborted waits even if the injected exchange ignores
abort. Any failed launch or uncertain cleanup poisons its remaining sequence.
No new actual run bindings, observer C# role dispatch, IPC transport or real
Source/Native/oracle qualification evidence is generated by this implementation.

### Fail-closed composition binding and immutable errors

Selecting the private qualification callback parameter requires a complete valid
Source binding. Runtime validates and freezes it through the existing Application
port and Source's shared deep-private validator before any Source/DB/process
operation. Undefined/null/incomplete Source must not downgrade to legacy PATH.
Capture the Native lifecycle factory at entry as well. Source qualification never
reads host environment values to construct an unused inherited default. Explicit
Source environment case aliases refuse; ordinary Source behavior is unchanged.
No Runtime-to-Source import is introduced, including type-only imports.

A failed session also invalidates any active unstarted lease. After asynchronous
READY/ACQUIRED, recheck faulted/disposed/state, so late replies cannot revive an
abandoned launch. Async cleanup diagnostics use owned error copies rather than
mutating callback-thrown errors: a frozen Native/Source error cannot skip dispose
or replace the primary code with TypeError. Any unknown-cleanup annotation must
survive stderr and higher-layer wrapping.

The private callback parameter is plumbing, not a complete first-run authority.
The A5 composition still exercises normal validated Source/Stage/Store writes in
test-owned evaluation databases. A future exact run owner must authenticate and
bind its isolated Source and owned evaluation databases before invoking it; it
must not touch authoritative user/production repositories or publish evidence as
accepted resource/profile authority. Those live ownership/manifest checks, C#
fixed-role/control framing, observer/host launch and authenticated OS receipts
are not implemented or proved by the pure adapter or fake-process tests.

### Fixed Node24 Windows supplementation

The fixed Node24.15.0 [libuv source](https://raw.githubusercontent.com/nodejs/node/v24.15.0/deps/uv/src/win/process.c)
checks missing required environment keys and reads them from the parent (47-58,
658-710). Both qualified builders therefore seed those eleven keys with empty
values, even if absent when the plan is captured, then overlay explicit allowed
values. The [Node spawn wrapper](https://raw.githubusercontent.com/nodejs/node/v24.15.0/lib/child_process.js)
can propagate NODE_V8_COVERAGE, so that key is explicitly present and empty too.
Source normalizes explicit key names to uppercase and rejects case aliases.
The same frozen complete dictionary is hashed and passed to spawn. These fixed
keys are a runtime compatibility rule, not a new resource value or permission.
No host values are read/copied by the Source qualification builder; Native retains
its existing name-only clearing plus fixed missing-key coverage. Ordinary launch
paths are unchanged. A different Node/runtime or permission mode still requires
exact packet applicability checks; this does not prove OS execution or admission.
