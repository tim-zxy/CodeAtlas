# Phase 0.5 bounded Native parse observation

2026-10-17 actual public-operation correction: Source Git probes may share the
outer development observation scope with Native requests. Retain closure metadata
for every observed child, requiring all pipes/close settlement and at least one
exact Native executable match. Feed only those exact matches to Native wire,
stderr/parse and Native exit checks; Source owns Git exit interpretation. No
foreign-only operation certifies Native execution, and a failed matched Native
still fails. A real mixed Git/Native regression plus original substitutions/
timeout/parse controls prove this EVOLVABLE attribution fix; see the existing
closeout spec/ledger. Diagnostics remain Evaluation-only, stdout unchanged,
original count rules/gates unchanged, and old D5 generator evidence is not retagged.

2026-10-15 approval update: the user's next “继续”, after the revised-plan/§9
review request, explicitly accepts §9 and the same-plan Task5 supplement for
Native/inline implementation. This supersedes pending-review status below;
original numeric, integration and phase gates remain separate. Implementation
is in progress, not qualified by this approval.

Status: written design accepted2026-10-15; the subsequent user “继续” also accepts
§9 correction and revised same-plan Task5 supplement. Implementation is in progress,
not public/D5/phase acceptance. No resource value or remote integration is approved.
Read with ADR-018 and the same eight-task plan.

## 1. Outcome and boundaries

Prove actual parser invocations and worker completion variation for the existing
Phase0.5 cases. Do not infer either from sorted stdout, delivered SOURCE_FILE
counts, configured worker labels or equal final graphs. Preserve all31 required
cases, all21 incremental cases, D5 R1/R2/full22 and95/95/90/100/0 gates.

Keep stdout Native IPC v1/v2/v3, Canonical IR, ProviderSnapshot, public index
configuration/CLI, SQLite schemas, Source classification and authority unchanged.
No scheduler/delay/order flag, environment escape, new dependency, AST persistence,
framework/language, Knowledge/Wiki/Agent capability or adaptive scheduler.

The diagnostic is development Evaluation evidence only. Production Provider
decoding/admission/publication never parses it or obtains authority from it.
Validated stdout/terminal, child settlement, independently pinned Source and
Application/Store graph/support/coverage/R010 checks remain necessary. Diagnostic
records are neither Provider facts nor canonical Evidence rows.

## 2. Actual existing flow and smallest change

`parse_source_observed` already calls a callback after source verification and
immediately before Java analysis. Refresh `run_with_observers` already observes
returned parse attempts and supports the opposite-order Rust test. Normal entry
currently supplies no-op callbacks. Full analysis has the same underlying parser
boundary. Reuse these boundaries rather than create another analyzer/coordinator.

Add a private request-owned diagnostic sink for v3 ANALYZE/REFRESH only. Bind its
callbacks through the existing worker invocations. Leave DESCRIBE, invalid-input
handling and strict v1/v2 output/diagnostics unchanged. A read/validation refusal
before parser entry is not a parse invocation. A syntax/unsupported-region
analysis that actually ran is a parse and finishes PARTIAL. Parser failure after
entry is FAILED; panic/unsettled work must never yield complete observation.

Important ownership constraint: main currently holds `stderr().lock()` across
`serve_once`. Worker-thread diagnostic writes against that handle can deadlock.
Replace that long-held handle with ordinary `Stderr`; pass the existing explicit
diagnostics writer into the private v3 analysis scope. Use a request-owned
`Mutex` over the borrowed writer and scalar observation state. The private Rust
diagnostics generic must support `Write + Send`; stdout stays main-thread-owned.
Do not write through a separate global stderr handle or bypass test writers.

No writer thread, channel, background queue or per-file transcript is needed.
Each callback emits one fixed-shape bounded record under the same mutex. The
mutex linearization point defines observed callback order, not a CPU timestamp
or a claim about physical allocation. Slow stderr may exert bounded backpressure;
the existing Node process owner drains it concurrently and enforces timeout/
cancellation. Never hold the stdout writer or an analyzer/SQLite lock while
waiting for this diagnostic lock. Join existing parser workers before END and
before returning from the request; do not leave late diagnostic writers.

## 3. Private diagnostic contract

Emit UTF-8 JSON lines on stderr with exact keys per variant. These are explicitly
not Native protocol events. Common keys:

`diagnosticSchema:1`, `kind:'NATIVE_PARSE_OBSERVATION'`,
`requestRefSha256:<lowercase SHA256>`, `ordinal:<nonnegative safe integer>`,
`event:'BEGIN'|'PARSE_STARTED'|'PARSE_FINISHED'|'END'`.

Variant keys in addition to those common keys:

| Event | Additional keys |
| --- | --- |
| BEGIN | `operation:'ANALYZE'|'REFRESH'`, `workerLimit:<positive safe integer>` |
| PARSE_STARTED | `sourceRefSha256:<lowercase SHA256>`, `slot:<nonnegative safe integer>` |
| PARSE_FINISHED | `sourceRefSha256`, `slot`, `outcome:'SUCCEEDED'|'PARTIAL'|'FAILED'` |
| END | `started:<nonnegative safe integer>`, `finished:<nonnegative safe integer>`, `complete:boolean`, `reason:null|'LIMIT_REACHED'|'UNSETTLED'` |

Request reference is SHA256 over UTF-8
`codeatlas-parse-request-v1\0` + decimal protocol version + `\0` + original
requestId. Source reference is SHA256 over UTF-8
`codeatlas-parse-source-v1\0` + original SourceFile.id. Use the validated original
file ID, not a newly invented path identity. No raw path, source, request ID,
environment, prompt or secret occurs in these records. The private collector
independently computes references from its owned inputs/validated stdout context.

BEGIN is ordinal0. Mutex-serialized emission increments ordinal for every
observation; one BEGIN and one final END per actual analysis invocation. Slot is
the real existing coordinator slot within a bounded batch, below workerLimit;
slots may be reused between batches. It is not an OS thread ID or a new scheduler.
workerLimit is the count actually accepted by Rust, not the Node AUTO label.

START occurs only at actual parser entry. FINISHED occurs only after an entered
parse settles; do not emit it for an attempt rejected before START. Preserve every
actual invocation, including repeated invocation of one source; never deduplicate
away evidence of an unintended reparse. END counters count actual callback
entries/settlements. `complete:true` requires every observation emitted and every
entered parse settled. Diagnostic write failure cannot yield a trustworthy END;
missing END makes the collector unavailable.

Use inherited Native line/event/stderr ceilings, not new or raised limits. Bound
the producer's diagnostic byte/count accounting by the existing1,000,000-byte
stderr and10,000-event ceilings. Reserve room for a worst-case END encoding from
the known bounded integer/reference shapes before admitting ordinary records.
Reserve its event slot as well as bytes, including BEGIN in the event accounting.
Safe-integer overflow or inability to encode a bounded footer makes the observation
unavailable; never saturate counters into a seemingly complete trace.
On exhausted observation capacity, continue the original semantic operation,
retain scalar counts, and emit END complete:false/LIMIT_REACHED if writable.
Do not fabricate completeness or an analyzer failure to hide logging loss.
Ordinary stderr errors still count toward the Node caller's existing lowerable
stderr limit; overflow retains the original typed failure/termination behavior.

## 4. Private Node observation and ownership

Keep `NativeClientOptions`, production captureStderr and production protocol
decoders unchanged. Extend the existing test/development consumed-wire probe to
observe chunks delivered through the original stderr async iterator, as it does
for stdout. No second reader/data listener, relay, extra child or production hook.

The Evaluation observer uses one line buffer bounded by the lesser of existing
line/stderr caller limits. Fatal UTF-8, incomplete LF, malformed recognized
records, extra keys, unsafe ordinals, wrong hashes, duplicates or late records
make observation unavailable. Unrelated ordinary diagnostic lines do not become
parse records or authority. A recognized foreign request is a capture failure,
not silently ignored. Require exactly one BEGIN/END, continuous ordinal sequence,
complete:true/null reason and matching actual start/finish counters.

Keep only bounded scalar counters, per-source invocation/settlement state and the
completion-order references needed for the declared Source inventory. Charge
existing Evaluation metadata-row/result-byte limits; cap retained references and
serialized artifacts by caller controls. Do not retain raw stderr or a transcript
in the report. The existing production stderr buffer remains independently
bounded; observer accounting is not a new OS-hard memory claim. Include observer
work in actual Evaluation Node-process peak telemetry and final evidence, with
the same explicit exclusion of Native child RSS. No invented byte reservation.

Bind per-invocation observations to the actual child, executable SHA, request/
terminal context, consumed-wire hashes, independently prepared Source declaration,
immutable runner/build/config/corpus identity and owned operation receipt. A hash
or caller-created object alone is not authenticity. Require settled original
child/pipes and original result/error before qualifying. Logging cannot replace
the original refusal, timeout, checksum or nonzero-exit failure.

## 5. Changed-only parsing acceptance

The accepted §9 correction supersedes the original FULL once-per-input assertion:
SYMBOL-only FULL expects one entry/settlement per input; relation FULL expects two.
Do not change the parser or suppress observations to satisfy the earlier mistake.
For REFRESH, independently derive added/modified
Source IR including metadata changes from the qualified original Source baseline;
expect one entry/settlement for exactly that set and none for unchanged/deleted
files. Empty-delta/deletion-only refresh expects no parser entry. Bind SOURCE_FILE
delivery counts separately; never rename them parser counts.

The original syntax/unsupported-region PARTIAL cases require one actual entered
and settled PARTIAL parse, their original diagnostics/site partition and all
existing nonpublication/retention/closure checks before Evaluation restoration.
Generic failed terminals/admission refusals do not become PARTIAL. Declared
SOURCE->TEST metadata keeps identical bytes/path/ID and must prove its actual
metadata-triggered parse through the separate component route.

Keep original expected-refusal/fault-child D5 obligations distinct. A permitted
synthetic fault child is not real parser evidence; its absent trace cannot be
used as a successful parse/worker sample. Do not add arbitrary applicability masks
or reclassify any of the31 required cases.

## 6. Actual worker pair

Reuse the original pinned50-file COLD input/semantic expectations. Prepare one
owned Git root and one closed Source-only seed per repetition, then fork two
closed databases from that same seed so repository/revision/Source IDs and input
bytes are identical. Do not independently regenerate opaque IDs for the two
rows. Both operations use the public admitted FULL entry and real shipping
Native executable. There is no injected provider or observer executable.

Keep the existing two policy keys REQUIRED_WORKER_ORDER_1/2 and distinct feasible
worker counts. Materialize requested/effective modes before operations using the
existing resolver; no silent coercion. Per-trial derived request/config and hash
must disclose the declared count. A host/budget unable to exercise the second
count leaves the class unavailable/failed, never passed as another single worker.

Require accepted Native workerLimit and real observed slots consistent with the
configured modes; both declared counts must actually be exercised. Require exact
observations of each declared slot and overlapping START/FINISHED intervals for
the multi-worker trial, not merely serial reuse of different slot labels. This
tests the existing worker obligation, not a new performance threshold. Require
the explicitly reviewed FULL multiplicity (§9), identical Source sets and genuinely
different observed completion-order vectors, plus equal complete normalized
graph/support/coverage/R010 and zero stale bindings. No production sleep, order
override or forced scheduling. If this one actual pair happens to have the same
order, retain its failure; do not retry until green or select a favorable run.
The existing controlled opposite-order Rust unit test remains mandatory and
separate; it does not substitute for this public pair.

Keep each row failed/unqualified until the pair is complete. Persist owned
per-operation trace summaries and a pair comparison receipt; hash/reference them
in the existing sorted artifactDigests map. Both original public operation
receipts stay immutable. One missing/failing peer fails the pair and overall
report; no favorable row from another repetition can complete it. Pure v2 report
logic remains non-authenticating; the owned runner performs physical qualification.
Do not derive parse/resolve durations or child peak memory from ordinal counters.

## 7. Fixtures and tests required before implementation completion

Add a reviewed diagnostic Evaluation Fixture using existing Manifest v1 under
`fixtures/evaluation/native-parse-observation/`; do not change the original eight
packs/pins. Literal independent record vectors cover exact schema, hash domains,
ordinals, entry/finish/outcome counts, empty input, duplicate source invocation,
wrong source/request/slot, missing/late END, malformed UTF-8/framing and limit loss.
No new metric name or numerical quality threshold is added to Manifest v1.

Required real checks:

- v1/v2 stdout/diagnostics and v3 stdout/checksum/schema compatibility; DESCRIBE
  has no parse trace; normal error/default serialization remains sanitized.
- Original full/changed-only/metadata/empty/deletion/PARTIAL recipes bind real
  parser calls; wrong/count/foreign/duplicate trace cannot pass a matching graph.
- Real worker pair and the original forced-opposite-order unit test; unavailable
  host, equal observed order and missing peer preserve complete failure reports.
- Slow stderr reader, writer failure/limit, timeout, cancellation and late close:
  bounded retention, no long-held main stderr deadlock, actual process settlement
  and unchanged last valid graph on failed publication. No unbounded thread/queue.
- Existing stdout backpressure, Stage/Store rollback/reopen, full Source/receipt/
  SQL lifetime, architecture, all original root/Native/Rust/Fixture gates remain.

Register new pure/owned controls in the root entry and actual binary checks in
the existing Native entry; preserve mandatory memory switches and failure uploads.
No test skip, deleted fixture or lowered gate may make the phase appear complete.

## 8. Rollout, review and measurements

This completes an existing Task5 proof, not a new roadmap task. Keep the same
Native/inline execution method, Task6 one whole-product review/fix pass, existing
Task7 D5 R1/R2/full22, final corrected freeze/four-purpose calibration/independent
holdouts/separate exact numeric approval, and Task8 actual original acceptance.

Any Native/consumer change invalidates the relevant binary/code/corpus evidence.
Record actual Node identity and Native executable SHA separately; do not invent
a changed Node digest when only Rust changed, and never treat an unchanged Node
digest as permission to reuse old binary/corpus measurements. No resource value
is selected or installed by accepting this spec.

There is no SQLite migration, public API/config flag, new plugin boundary or
Phase1 dependency. Reconcile Native IPC/security/scalability/Evaluation/acceptance/
traceability/status documentation with ADR-018 before implementation. The
diagnostic interpretation must remain Evaluation-only; any review finding that
requires changing a FROZEN boundary stops the affected work for an explicit
amendment. Do not silently make stderr a second authoritative protocol.

Rollback disables diagnostic qualification and leaves missing evidence failed;
it does not rewrite old reports, resurrect old profiles, delete canonical state
or waive worker/phase gates. Written ADR/spec approval precedes revising the
existing implementation plan; that reviewed plan precedes Rust/consumer coding.

## 9. Planning counterexample and proposed count correction

Correction accepted by the subsequent user “继续” with revised-plan review.
The heading is retained to preserve existing anchor links.

Found during plan construction, not after implementation: current `run_parsed`
dispatches any non-SYMBOL capability to `run_relations`. In
`crates/native-analyzer/src/analyze.rs`, its first loop calls `parse_source` to
build the declaration/import/inheritance index; its second loop calls it again
to resolve/emit. Both actually invoke Java/Tree-sitter. `run_full_v3` reuses this
flow. SYMBOL-only FULL has one pass. REFRESH parses its changed set once and
retains unchanged summaries. Code evidence is at the three actual `timed_batch`
call sites and the changed-set scoped jobs in `analyze/refresh.rs`.

Accepted EVOLVABLE correction:
successful SYMBOL-only FULL expects one entry/settlement per selected source;
successful FULL with any supported relation capability expects two per source,
including both passes in original observed order. The fixed original five-
capability50-file worker corpus therefore expects100 entries/settlements per
operation, not50. This is an algorithm-derived count, not a new resource value or
quality threshold. REFRESH still expects exactly one per added/modified source
and zero per unchanged/deleted source. Never collapse repeated references into a
set, hide a pass, exempt an extra parse, or remove a resolver pass to satisfy the
earlier mistaken assumption. Bind counts to the independently declared capability
set, not the observed count. No new diagnostic field is needed.

Alternatives are to keep the once-per-input contract and propose a separately
reviewed, memory-qualified parser-cache/algorithm change, or retain the hold.
The former expands correctness/resource scope and is not recommended here.
All existing accuracy, incremental, worker, lifecycle and D5 gates remain.

Ownership planning also found `timed_batch` uses `'static` worker closures and
returns on timeout before joining its handles. A borrowed request writer cannot
be captured in that API, and detached workers cannot produce a qualified END.
The revised plan must make the existing bounded helper scoped/joined, preserving
batch size, channel bounds, ordered results, cancellation/deadline, panic/error
mapping and unchanged stdout; no scheduler/order flag or second coordinator.
Explicitly test v1/v2 compatibility and timeout/cancellation settlement. If joining
cannot satisfy the existing timeout behavior, stop for a focused lifecycle
decision rather than extend deadlines, detach a logger or add a background queue.

Original written acceptance alone did not approve this correction; the subsequent
explicit continuation after the combined review request did. Implement under the
reviewed same-plan supplement, preserving old reports and separate numeric gates.
