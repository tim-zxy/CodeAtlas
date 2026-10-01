# P05-W3-020-B Derived state and full-analysis bootstrap

Status: ACCEPTED. On 2026-10-01 the user approved this written design and subsequently confirmed the [implementation plan](../plans/2026-10-01-p05-w3-020-state-bootstrap.md) for native execution. Tasks 1–3 are locally complete; Task 3 schema/decoder/corpus and reviewed read/seal profile pass local verification; local Task 3 is complete. Remaining tasks and packet acceptance stay open. This subdivision does not add a roadmap task.

## Intent, authority and baseline

Make a successful full Native analysis establish a restart-readable, validated summary baseline in the same transaction as the graph. Preserve the last good graph and summaries on any unsuccessful replacement. This is the agreed next subdivision of P05-W3-020, not a Phase 0 restart or Phase 1 promotion.

Authority: [ADR-016](../../handoff/adr/ADR-016-native-refresh-derived-analysis-state.md), [packet A](2026-09-30-p05-w3-020-v3-contract-design.md), [SQLite Schema](../../handoff/specs/SQLITE_SCHEMA.md), [Native IPC](../../handoff/specs/NATIVE_IPC.md), [Module Boundaries](../../handoff/specs/MODULE_BOUNDARIES.md), [Evaluation](../../handoff/specs/EVALUATION.md), and the accepted same-WORKTREE amendment. This design details the accepted architecture; it changes no FROZEN decision or accuracy threshold. If implementation needs to change packet A, stop and submit the affected contract amendment rather than silently extending its strict schemas.

Design-time baseline: PR #17 merged packet A at `954897e7cf4395f9a338e8098d95abf305e58d6c`. Its [exact merge CI](https://github.com/tim-zxy/CodeAtlas/actions/runs/36790910152) passed TypeScript, Rust and Native Java integration. That manifest ended at R009. Native plan Task 1 adds R010 locally; see CURRENT_STATUS for fresh evidence and integration state. Design-time source inspection confirms:

- `native-analysis-state.ts` already validates headers, summaries, ownership and digests; `native-ipc-v3*.ts` validates input only.
- Rust `language.rs` already retains symbols, signatures/static flags, relation sites and site statistics. `java.rs`, `java_relations.rs` and `analyze.rs` are the extraction/resolution/emission path. Existing relation ANALYZE uses two source-verified passes; this packet need not optimize that algorithm.
- Runtime `full-analysis.ts` composes `streamNativeAnalysis -> normalizeStagedAnalysis -> mergeStagedAnalysis -> applyFullAnalysis -> RepositoryCanonicalFactStore.applyAnalysisBatch`.
- `temp-stage.ts` holds connection-local provisional rows. `canonical-fact-store.ts` owns full and patch `BEGIN IMMEDIATE`/rollback boundaries; it has no summary lifecycle.
- Source reconciliation replaces `source_files` and updates the mutable revision fingerprint before graph Apply. The indexed graph fingerprint can therefore differ from the latest source fingerprint.
- Storage depends on IR only. Native validation remains Provider-owned; no `storage -> providers` import is permitted.

Fresh baseline command on 2026-10-01: `node scripts/check-architecture.mjs` passed 17 projects. `node --test --test-concurrency=1 packages/providers/test/native-analysis-state.test.mjs packages/providers/test/native-ipc-v3.test.mjs packages/storage/test/analysis-temp-stage.test.mjs packages/storage/test/canonical-fact-store.test.mjs packages/storage/test/analysis-patch-store.test.mjs packages/application/test/apply-full-analysis.test.mjs packages/application/test/apply-analysis-patch.test.mjs` passed 44/44. This is predecessor evidence, not implementation evidence for B.

## Scope and alternatives

Include R010 storage/read validation, full ANALYZE v3 output and bounded client/staging, real full-summary production, atomic full bootstrap, and invalidation when an existing successful write has no matching summaries. No separate summary-only commit is allowed.

Exclude real REFRESH generation, v3 patch-summary activation, dependent-set scheduling, full-rebuild differential incremental Evaluation, phase-wide performance baselines, graph queries/CLI, new languages/frameworks, AST/source persistence, Knowledge/Wiki, daemon and adaptive scheduling. Those stay in their existing later packets/phases.

Chosen alternative: two derived tables with strict JSON payloads, Provider validation injected through Runtime, and existing Store activation. A single whole-bundle JSON row is simpler SQL but prevents per-file bounded reads/uniqueness checks. A fully normalized declaration/site schema duplicates Provider contracts and creates unnecessary migrations. Separate cache-file publication is rejected because it cannot share the graph transaction. This choice follows the minimal-change skill: reuse existing schemas, stage, resolver and transaction owner; add no dependency or general cache framework.

## R010 physical schema proposal

Task 1 migration entry: version `10`, name `native_analysis_state`, file `010_native_analysis_state.sql`, `backupRequired: false`; implemented SQL has normalized checksum `sha256:ebf26d1df42a47418bb06173e4783d3fdf3503ca0f6e0a0f8b6893ebbc711fa2`. Released R001-R009 SQL/checksums remain unchanged. R011/R012 remain unpublished Phase 1 reservations. This local migration does not implement summary publication or v3 dispatch.

| Table                   | Columns and constraints                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `native_analysis_state` | `repository_id TEXT NOT NULL`, `provider_id TEXT NOT NULL`, `provider_snapshot_id TEXT NOT NULL`, `revision_id TEXT NOT NULL`, `content_fingerprint TEXT NOT NULL`, `header_json TEXT NOT NULL`; primary key `(repository_id, provider_id)`; FK repository ID to `repository(id)` and snapshot ID to `provider_snapshots(id)`; `CHECK(json_valid(header_json))`                                      |
| `native_analysis_file`  | `repository_id TEXT NOT NULL`, `provider_id TEXT NOT NULL`, `source_file_id TEXT NOT NULL`, `source_path TEXT NOT NULL`, `content_fingerprint TEXT NOT NULL`, `summary_json TEXT NOT NULL`; primary key `(repository_id, provider_id, source_file_id)`; unique `(repository_id, provider_id, source_path)`; composite FK to state header with `ON DELETE CASCADE`; `CHECK(json_valid(summary_json))` |

The primary/unique keys supply the required lookup indexes; add no speculative dependency index or historical cache versions. Persist one currently activated baseline per Provider. Full replacement already retires the old graph: remove all old repository summary headers in that same transaction and insert only the validated Native baseline produced by this full run. This does not invent baselines for other Providers.

The JSON values are exactly packet A `NativeAnalysisStateHeaderV1` and `NativeFileAnalysisSummaryV1`, ordinary JSON numbers, not the digest-only IEEE-754 encoding. Duplicated SQL columns must equal parsed JSON fields. Snapshot provenance is separate from the unchanged strict header; its row must be SUCCEEDED and match repository, Provider/version, requested revision/fingerprint. No arbitrary extension bag or ProviderSnapshot v1 widening.

Do not FK a summary to `source_files` or compare its fingerprint to the mutable `revisions.content_fingerprint` on a baseline read: reconciliation can already have advanced source state. Header revision ID must exist and belong to the repository, checked on activation/read; no SQL FK to the mutable source inventory is introduced. Validate header against `repository_state.indexed_revision_id/indexed_content_fingerprint`, not the newest source fingerprint. Tests must prove reconciliation/delete does not erase the older good baseline.

Migration creates empty tables, never backfills guessed summaries. R009 databases retain graph, Evidence, bindings, candidates, coverage and activation fields exactly. Existing migration runner supplies sequential transactions, checksums, locking and DATABASE_TOO_NEW behavior. Downgrade means disabling v3 use, not deleting a released migration.

## Validation ownership and read contract

Keep strict schemas and digest functions in Providers. Runtime supplies one synchronous validation port to the derived-state stage/read adapter. Storage declares only persistence-oriented structural types and IR context: serialized header/files plus validated repository/Provider/snapshot/revision/fingerprint metadata. It never imports Providers or moves Java/cache schemas into Canonical IR.

The port validates a bounded candidate against expected context and staged Provider facts/coverage/diagnostics, returning serialized validated data or throwing. It receives read-only values/iterators, no DatabaseSync, SQL executor, application callback or publication capability. Require it whenever summaries are present; absence must reject rather than accept opaque JSON. Runtime composes the existing Provider schemas/digest functions into that port. Stage seals validated bytes; after sealing, reject every further accept/update. SQL columns are derived from the validated output, not unverified envelope fields.

Before mutation, and again under the Store write lock, recheck the sealed stage, target source inventory/fingerprints, snapshot identity and expected activation baseline captured before observation. Provider validation is synchronous and cannot yield while the transaction is open. Compare the current indexed ID/fingerprint and current derived header digest/snapshot with that captured baseline; concurrent activation, even at the same source fingerprint, rejects the replacement. This comparison token is internal and not added to Canonical IR or the wire.

Reading uses one SQLite read transaction to observe header/files/provenance/indexed fields consistently. Before JSON.parse, bound the UTF-8 sizes of header and file JSON, with cumulative derived serialized JSON bytes at most the existing 1,000,000-byte stdin ceiling and caller limits only lower. Validate strict schemas, column equality, count/digest, unique paths/IDs, ownership and expected compatibility using the port. Memory accounting includes rows, decoded objects and digest working buffers under the request budget; a byte bound is not an OS RSS proof. Do not accumulate unbounded rows before checking size.

Return a discriminated internal result: `AVAILABLE` with immutable validated bundle and activation token, or `UNAVAILABLE` with one safe reason `MISSING`, `INCOMPATIBLE`, `INVALID`, `RESOURCE_LIMIT_EXCEEDED`, or `NOT_APPLICABLE`. Operational SQLite I/O/lock errors remain errors, not forged MISSING results. Unknown/malformed JSON is INVALID; metadata beyond a budget is RESOURCE_LIMIT_EXCEEDED. No read mutates or deletes persistent data.

Availability is distinct from graph freshness: a STALE graph can have an AVAILABLE baseline for future refresh. Missing header, legacy/no indexed fingerprint or incompatible grammar/analyzer/resolver/normalizer/policy/capability context yields explicit bootstrap-required state. A changed revision ID or immutable target remains NOT_APPLICABLE to REFRESH. No automatic full parse or semantic update is triggered by a read. An AVAILABLE bundle alone does not guarantee that a future larger REFRESH request fits; measure the complete actual request, including framing, target inventory and completion, against the unchanged input ceiling before spawning.

## Execution clarification pending: Node metadata memory admission

Status: ACCEPTED on 2026-10-01. The user selected the measured conservative-admission direction with “继续”, confirmed the written detail with “确认”, approved the amended Task 2 plan with “继续”, and subsequently approved the actual 65-observation Windows report/reservation with “批准”. Native execution continues; this approval does not cover unmeasured platforms or changed implementations.

### Budget semantics and unchanged boundaries

Keep the synchronous Provider validation port, Runtime injection, IR-only Storage and unchanged request/wire/schema contracts. The budget is conservative request admission, not allocator enforcement or an OS hard RSS limit. Do not borrow the Rust worker's 16 MiB reservation. Keep all existing protocol ceilings; calibration cannot raise them. No additional worker setting, automatic calibration during a read, external service, or isolation subsystem is introduced.

Storage must query numeric UTF-8 lengths and row counts inside the same read transaction before fetching strings. Include header/file JSON, duplicated SQL IDs/paths/fingerprints, indexed pointer values and snapshot/token provenance. Bound their aggregate before creating row arrays or decoding JSON. Charge SQL strings at two bytes per UTF-8 byte as a conservative UTF-16 storage upper bound (each UTF-16 code unit requires no more than that input bound); this is a representation bound, not a measured heap multiplier. Row/object/container overhead is covered by the calibrated reservation rather than ignored. JSON's cumulative serialized limit remains 1,000,000 bytes or the caller's lower limit. SQLite lock/I/O errors still propagate.

### Calibration and admission rule

Use one fixed, versioned internal calibration profile for the supported execution environment, keyed by Node/V8, platform/architecture, schema/digest/validation implementation and corpus revision. Profiles are reviewed implementation artifacts backed by reproducible Evaluation reports, not caller-supplied trust or a new user-facing configuration. An unavailable/mismatched profile refuses admission, retains the prior graph and reports the existing safe resource refusal; record the missing-profile cause internally, never claim that measured exhaustion occurred.

For the first implementation, prefer deliberately conservative full-envelope reservation to a fitted JSON multiplier or size buckets. Set `R_profile` to the maximum **absolute process peak resident bytes** observed across the complete calibration cases and repetitions in fresh child processes, including runtime/module baseline. This consciously over-reserves rather than subtracting noisy startup measurements. It is a measured policy reservation, not a proof for every possible input shape. Preserve raw observations, collection method and units; missing peak-memory measurement means no releasable profile. Report observed heap, external and buffer allocations as corroborating measurements; do not add `arrayBuffers` to `external` because those values overlap.

Admit only when `R_profile + B_retained_sql_strings <= memoryBudgetBytes`. The separately charged retained SQL strings intentionally make this conservative even when the calibration already includes them. Within validation, require measured phase coverage for JSON decode, schema copies, sort/ownership structures, canonical encoding, hash buffers and immutable output. Request larger-than-calibrated envelopes or an unmeasured full-stage path must be refused rather than guessed. No runtime GC, heap/RSS sampling used as a retroactive success condition, or “parse first, check later” admission.

The profile must cover the existing serialized ceiling, not just the small probe below. Each case runs five times in fresh processes. Cases include zero-file/empty success; maximum feasible short-file count; dense numeric symbols/sites; long ASCII/BMP/astral strings; repeated shared ownership; duplicate/foreign metadata; invalid deep/unknown input; one oversized SQL field with tiny JSON; and one oversized staged fact. Cases must exercise the actual bounded read and full-stage seal/Provider port, not just the schema. Calibration construction must not hide the work being measured; report startup, input preparation and validation separately, and use the absolute process peak for the admission reservation.

A change to schema, digest/correspondence algorithms, relevant dependencies or the validated environment invalidates the profile until remeasurement/review. Required CI executes the corpus and checks the reservation against fresh observations on its validated platform; neither a Windows probe nor an unobserved hosted run is Linux evidence. Exact release values are chosen only from these reports and synchronized with scalability/Evaluation/Traceability/Current Status. This is not a new phase accuracy or performance threshold.

### Test implications and implementation sequence

The draft tests' 16 MiB helper budget is not an accepted minimum-success gate. Once a profile is measured and reviewed, success tests use a budget that fits its independently recorded reservation and retained-row charge; refusal tests cover one byte below admission and the SQL/JSON bounds without weakening integrity or rollback assertions. Runtime keeps its existing factory signature; calibration selection is internal.

Before releasing Task 2: implement the test-only calibration harness and pinned corpus; test strict preflight/typed refusal and mandatory-port behavior RED; implement the bounded read/validation/seal path; measure that actual path; propose the resulting profile, synchronize its evidence and review before exposing supported admission. Tasks 3–6 must remeasure any added correspondence/client/staging workspace before publication. No summary may activate while the profile/path is unvalidated. Task 7 advertisement still depends on the original real bootstrap and complete gate.

### Approved actual-path baseline

The [unaltered report](../../../fixtures/storage/native-analysis-state/memory-baseline.json), SHA-256 `cd69ea2b526a4e70a11f67402924ee1757a0d5eaf26081c3b848ec747c89b386`, contains thirteen cases with five fresh-process observations each. Its original capture status is retained; the approval above releases one internal profile for Node `v24.15.0`, V8 `13.6.233.17-node.48`, `win32`/`x64`, Zod `4.6.1`, implementation `e9fc7784930fe3346c0d0390731c290755242c159f09656404394d811e5c8298`, corpus revision `p05-native-metadata-memory-v1` and digest `0c599e6626202fe4a0b5d5866e2d89d01a4674e40b0efe0d0b20acf5b4085b29`. Reservation is exactly **250,183,680 bytes**, the maximum absolute `resourceUsage.maxRSS` observation converted to bytes, plus the separate retained SQL charge described above. No guessed margin, Linux profile or hard RSS guarantee is added. Matching production read/seal, one-byte-below refusal, absent/changed profile and evidence-identity tests pass; fresh commands live in CURRENT_STATUS. New measured-path changes still require actual remeasurement and report review.

Task 3 now changes the built identity to `44471febb9b41c2c73ddd30f065f216ba016d74e7179821d7dadf8c1c09a73ee`; the Task 2 profile above remains unchanged and therefore fails closed for this build. A fresh unchanged read/seal run produced 65 observations and a **250,855,424-byte plus twice retained SQL bytes** proposal, pending explicit numeric-report approval. CURRENT_STATUS records the retained unaltered proposal and verification. No new profile is installed. The runner loads the new modules but does not execute the new decoder/process-transport workspace; Task 4 requires actual-path calibration before admission. Historical matching-profile success above applies to Task 2's exact identity, not the current build.

Task 3 numeric approval update (2026-10-01): the user answered the exact reservation question with “继续”. The unaltered report is preserved separately at `fixtures/storage/native-analysis-state/memory-baseline-task3.json`, SHA-256 `a9451c810ae270340cb499cac5dbf01d0fe274b755861a6725b4576eb17815b1`, with capture status unchanged. The current-build Windows read/seal profile now reserves 250,855,424 bytes plus twice retained SQL UTF-8 bytes; Task 2 report/profile is unchanged. Production matching-profile and one-byte-below/refusal checks passed within 83/83 focused tests after explicit RED for the absent current profile. Earlier pending-review/current-build refusal wording is historical and superseded by this approval/install record. Final post-approval root Node regression passes 762 with one existing Windows skip; focused tests pass 83/83, Cargo 88/88, existing real Native tests 25/25, build/type/architecture/fmt/Clippy/format/diff pass. Local Task 3 local Task 3 is complete. Decoder/transport workspace admission is still Task 4 work; no real producer/bootstrap/REFRESH or phase exit is claimed.

### Preliminary evidence, not a calibration profile

Read-only exploratory probes on 2026-10-01 used the existing built Provider schema and digest functions, without changing product code or installing dependencies. Environment: Node 24.15.0, V8 13.6.233.17-node.48, Windows x64. Four independent processes returned matching summary digests.

| Probe                             | Serialized bundle bytes | Maximum observed phase heap-used increment (bytes) |
| --------------------------------- | ----------------------: | -------------------------------------------------: |
| Single empty summary              |                   1,086 |                                            628,136 |
| 1,000 short-file summaries        |                 609,156 |                                         13,873,208 |
| 2,500 symbol records              |                 508,035 |                                         17,581,296 |
| One long astral-Unicode signature |                 801,267 |                                          7,917,504 |

The dense-symbol probe exceeds 16 MiB in observed heap increment alone. Phase samples can miss transient peaks/GC; input generation and digest setup precede the baseline and already allocate data. The probes omit SQLite materialization, full-stage correspondence, saturation of the input ceiling and Linux. They therefore demonstrate why a JSON-size check or the Rust reservation is insufficient, but **cannot select a production reservation, prove an RSS bound or complete a Fixture gate**.

Reproduce each probe in a fresh process with Node arguments `['--expose-gc', '--input-type=module', '-e', source, mode]`, passing the following source as one argument (do not interpolate it into shell quoting). Modes are `empty`, `many-files`, `dense-symbols` and `long-unicode`. The code writes only measurements to stdout. The documented source was replayed directly via `spawnSync` after formatting; the empty probe still produced 1,086 bytes and a matching digest:

```js
import * as api from './packages/providers/dist/index.js';
import { readFileSync } from 'node:fs';
const mode = process.argv[1];
const template = JSON.parse(
  readFileSync('fixtures/ipc/protocol-v3/summary-vectors.json', 'utf8'),
).sourceFile;
const cov = (id) => ({
  capability: 'SYMBOL',
  sourceFileId: id,
  support: 'SUPPORTED',
  coverage: 'COMPLETE',
  statistics: {
    eligibleSites: 0,
    coveredSites: 0,
    unsupportedSites: 0,
    partialSites: 0,
    resolutionCounts: { EXACT: 0, HEURISTIC: 0, AMBIGUOUS: 0, UNRESOLVED: 0, UNSUPPORTED: 0 },
  },
});
const empty = (i) => ({
  schemaVersion: 1,
  sourceFile: { ...template, id: 'f' + i, path: 'src/F' + i + '.java' },
  symbols: [],
  relationSites: [],
  diagnostics: [],
  coverage: [cov('f' + i)],
  emittedFacts: [],
});
let summaries =
  mode === 'many-files' ? Array.from({ length: 1000 }, (_, i) => empty(i)) : [empty(0)];
if (mode === 'dense-symbols')
  summaries[0].symbols = Array.from({ length: 2500 }, (_, i) => ({
    providerFactId: 's' + i,
    providerKind: 'java.method',
    name: 'm' + i,
    qualifiedName: 'A.m' + i,
    signature: 'm(int)',
    isStatic: true,
    span: { startLine: i, startColumn: 0, endLine: i, endColumn: 1 },
  }));
if (mode === 'long-unicode')
  summaries[0].symbols = [
    {
      providerFactId: 's',
      providerKind: 'java.method',
      name: 'm',
      qualifiedName: 'A.m',
      signature: '😀'.repeat(200000),
      isStatic: false,
      span: { startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 },
    },
  ];
const header = {
  schemaVersion: 1,
  repositoryId: 'r',
  revisionId: 'rev',
  contentFingerprint: 'base',
  providerId: 'native',
  providerVersion: '0.0.0',
  language: {
    languageId: 'java',
    grammarVersion: '0.23.5',
    analyzerVersion: '0.0.0',
    compatibilityVersion: '1',
  },
  resolverVersion: '1',
  normalizerVersion: '1',
  policyFingerprint: 'policy',
  requestedCapabilities: ['SYMBOL'],
  sourceFileCount: summaries.length,
  summaryDigest: api.computeNativeSummaryDigest(summaries),
};
const raw = JSON.stringify({ header, summaries });
const rawBytes = Buffer.byteLength(raw);
if (rawBytes > 1000000) throw Error('probe exceeds ceiling');
summaries = null;
global.gc();
const before = process.memoryUsage();
const samples = [before];
const decoded = JSON.parse(raw);
samples.push(process.memoryUsage());
const parsed = api.NativeAnalysisStateBundleV1Schema.parse(decoded);
samples.push(process.memoryUsage());
const digest = api.computeNativeSummaryDigest(parsed.summaries);
samples.push(process.memoryUsage());
console.log(
  JSON.stringify({
    kind: 'preliminary-schema-probe-not-admission-calibration',
    mode,
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    rawBytes,
    baseline: before,
    phaseSamples: samples,
    resource: process.resourceUsage(),
    digestMatches: digest === header.summaryDigest,
  }),
);
```

Alternative isolation-level enforcement remains outside the selected direction and would need a separately reviewed execution/port design. Unaffected accepted sections remain authoritative. Written admission and synchronized Task 2 plan reviews are complete; the actual measured release profile remains a separate gate.

## Full ANALYZE v3 output contract

Keep the accepted two-record full request: ANALYZE header with `baselineState:null`, followed by REQUEST_COMPLETED; no baseline-summary records. Select v3 explicitly. v1 DESCRIBE remains bootstrap. Existing public v1/v2 Provider SPI request contracts remain unchanged; the Native-specific full composition gets a separate validated v3 path.

Response envelope is strictly `{protocolVersion:3, requestId, sequence, type, payload}` with contiguous zero-based sequence, one start and exactly one terminal last. For this packet only ANALYZE response types are legal:

| Type                                        | Payload                                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANALYSIS_STARTED`                          | Existing strict StreamContext                                                                                                                      |
| `SOURCE_FILE`, `NODE`, `EDGE`, `DIAGNOSTIC` | Existing strict SourceFile, ProviderNode, ProviderEdge, ProviderSnapshotDiagnostic respectively                                                    |
| `COVERAGE`                                  | Existing strict NativeCapabilityCoverageV2                                                                                                         |
| `ANALYSIS_SUMMARY`                          | Exactly NativeFileAnalysisSummaryV1                                                                                                                |
| `ANALYSIS_COMPLETED`                        | Existing AnalyzeCompletedPayload fields, plus required `analysisState: NativeAnalysisStateHeaderV1` and `summaryRecords: safe nonnegative integer` |
| `ANALYSIS_FAILED`, `REQUEST_FAILED`         | Existing strict respective failure payloads; no success header/count additions                                                                     |

All existing completed `counts` keys stay exact and count graph/source/coverage/diagnostic events only. `summaryRecords` counts summary events separately. All records, including summaries/start/terminal, consume event and byte budgets. The integrity checksum hashes exact pre-terminal JSONL bytes including summaries and LFs using the existing `sha256:<hex>` response convention; state digests retain packet A bare hex. Never translate one digest into the other by assumption.

One summary is required per requested SOURCE_FILE, even empty/zero-fact files. No extra/missing file or duplicate summary. Summary source objects equal the request/staged source objects in all fields. Header matches request analysisStateContext, repository/revision/fingerprint/capability set, count and computed summaryDigest. `PARTIAL` may have complete diagnostic summaries for observation, but neither graph nor summaries can activate. Failure/truncation/cancel/checksum/count/schema mismatch exposes no applicable candidate.

Validate correspondence, not just independent schemas: union of summary emitted identities/digests equals the staged NODE/EDGE set; recompute each digest from actual emitted facts, excluding only snapshot ID by packet A recipe. FILE ownership matches that fact's source range/file, SHARED ownership is restricted to the existing synthetic Java package-container kind with null sourceRange and equal content across all owners. Each owner must contain a source-grounded package declaration for that container; every contributing file records its ownership even though the shared NODE is emitted once. Compilation-unit nodes are FILE-owned. Reject missing/extra owners, mixed FILE/SHARED claims or mismatched digests. Summary coverage and diagnostics equal the observed per-file records as multisets; source-less diagnostics must have a single deterministic originating file, not be duplicated into every summary. Truly run-global diagnostics remain stream-only. No diagnostic is silently discarded.

Retain resolver inputs from LanguageAnalysis before dropping parse results. SYMBOL-only runs may retain symbols only and empty relationSites; any wider requested set must retain all extracted imports/inheritance needed by its resolver, including inputs for unrequested relation output. Output capabilities still control emitted graph facts and coverage; hidden resolver inputs do not become invented facts. Preserve existing two-pass source re-verification, qualified names, overload signatures/static flags and honest unresolved sites. Use existing resolver/normalizer compatibility identifiers as explicitly versioned internal constants; changes invalidate reuse. Compare native-owned Provider/language/resolver values against the running producer, never merely echo caller claims. The normalizer/policy values are TypeScript-owned context and are checked by composition.

## Bootstrap and atomic lifecycle

Runtime's explicit bootstrap caller supplies a validated semantic policy fingerprint/context. Packet B does not add YAML, policy discovery or another worker knob. Its internal composition input is the same trusted effective source-policy context that selected the complete Java analyzer scope; arbitrary wire-supplied strings are not policy proof. Full bootstrap accepts that complete selected scope, never derives summaries from Canonical representatives. Broader policy-fingerprint derivation for automatic refresh orchestration remains the composition packet and cannot be claimed by B.

Data path: validate full request/context and capture activation token -> bounded native process -> await-backed TEMP staging of facts and summaries -> validate complete stream/summary correspondence -> normalize and merge existing facts -> seal candidate -> Application success/context check -> one Store activation transaction -> close TEMP stage in finally.

Use the existing shell-free, allowlisted, timeout/cancellation client lifecycle. v3 stdin writing must obey backpressure and finish the complete request; source parsing waits for verified REQUEST_COMPLETED. Full stdout remains incremental; await each stage accept before reading onward. Reject oversize individual summary instead of adding chunk formats or side-channel files. Bound metadata and digest working allocations alongside existing worker/index/results, not by silently subtracting a guessed constant. The initial serialized derived-state limit is inherited from stdin, not a new performance threshold; test memory pressure and failure. Keep stdin/line 1,000,000, stdout 10,000,000, events 10,000, stderr 1,000,000 ceilings, plus caller/request lower limits and existing source/worker admission.

Under the full Store `BEGIN IMMEDIATE`, after all candidate/context/token checks: retire old graph support as today; replace graph and R009 support candidates; write snapshot/coverage/diagnostics; replace repository derived headers/files; update indexed ID/fingerprint; COMMIT once. Failure at any point ROLLBACKs all of these, verified after reopening SQLite. Snapshot provenance and summaries must match the same activated full run. No public writeHeader/writeSummary API or separate cache publication transaction.

Successful legacy v1/v2 full Apply clears all repository summary headers inside that same Store transaction, even when fingerprint is unchanged. A successful existing v1 patch likewise clears all headers in its patch transaction; B does not invent retained v3 patch summaries. Failed legacy full/patch Apply preserves previous summaries along with the graph. Source reconciliation never clears them. Future v3 patch-summary replacement belongs to the separately reviewed REFRESH composition packet and must use the same Store transaction, not a second commit.

Do not advertise v3 merely after schema/storage tests. Only after real v3 full producer/client/bootstrap tests pass may DESCRIBE include protocol 3; explicitly reject v3 REFRESH until its later producer is implemented, and do not advertise an incremental capability. Review the exact handshake version-list change with B implementation. Keep v1/v2 golden bytes and strict behavior unchanged. Disabling the v3 path retains v1/v2 full indexing and old valid graphs.

## Fixture and Quality Gate map

All names below are planned, not existing registered/passing artifacts. Register cases before implementation, reuse strict Fixture conventions, and pin LF-sensitive bytes deliberately. Each case records task P05-W3-020-B, this design and its acceptance. No new quantitative accuracy/performance gate is introduced.

| Work item and order             | Planned Fixture/check                                                                                                                                         | Required proof                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 persistence/read boundary    | `fixtures/storage/native-analysis-state/cases.json`, ID `p05-native-analysis-state-store-v1`; `packages/storage/test/native-analysis-state.test.mjs`          | Fresh R010 and R009 upgrade/rerun/rollback/too-new; immutable R001-R009 checksums; empty legacy state; column/JSON/digest/provenance drift, duplicate/missing files, resource refusal; read consistency; source reconciliation/delete preserves old baseline; worker/root independence versus version/policy/capability mismatch                                                                                             |
| B2 output contract and producer | `fixtures/ipc/analysis-v3/cases.json`, ID `p05-native-v3-full-output-v1`; shared TS/Rust validators and real-binary full-output tests                         | Exact valid/zero/partial streams, metadata/fact/ownership correspondence, numeric/Unicode vectors, all framing/order/count/checksum/cap failures; graph equivalence to existing v2 fixtures; worker-order consistency; wrong producer compatibility rejection; no v3 REFRESH success                                                                                                                                         |
| B3 full bootstrap/lifecycle     | `fixtures/storage/native-full-bootstrap/cases.json`, ID `p05-native-full-bootstrap-v1`; Storage/Application/Runtime suites and registered real source Fixture | Real Rust full stream activates graph plus summaries, reopen/read reproduces bundle, zero-fact/zero-file success; stale source or concurrent graph/state activation rejects; failure injections after summary deletion/insertion/support retirement/pointer update preserve exact reopened state; successful legacy full/patch invalidates summaries, failed paths retain them; missing state never triggers automatic parse |
| B4 runner/authority integration | Root/package scripts, Cargo and hosted Native job; existing Java/normalization/full/patch/handshake/client suites                                             | Required runners execute every new corpus/Fixture; TS builds/type tests, architecture 17 projects, Rust fmt/build/Clippy/tests, format/links pass; real full bootstrap tested with normal CI install; no deferred capability or false phase completion                                                                                                                                                                       |

B1 read schema/port work and B2 shared output Fixture authoring can proceed independently after the spec/plan review. SQL activation/invalidation hooks and B3 integration share Store/stage/Runtime files and must be sequential. Do not have two implementers independently edit those owners. B2's real full emitter must exist before claiming B3 end-to-end success; synthetic streams alone are insufficient. Detailed task-sized execution steps are deliberately left to the next reviewed plan, not an implementer's guesses.

Reopen-state comparisons cover canonical nodes/edges/unresolved targets, active and historical Evidence status, FactEvidence, Provider bindings, R009 candidates, snapshots/coverage/diagnostics, summary tables and indexed fields. Use deterministic error injection through existing test seams/triggers, no production failure switch. Existing accuracy gates and old goldens remain untouched. Performance measurements label unavailable Native internals rather than zero and do not claim the cold/1/5/50 or incremental phase baseline from full-bootstrap tests.

## Exit and review decisions

B is complete only with R010 released through the migration runner, real successful v3 full-summary bootstrap, bounded validated reopen reads, exact atomic rollback/invalidation evidence, all declared Fixtures/runners/gates passing, consistent controlling docs and fresh CURRENT_STATUS evidence. Parent P05-W3-020 and Phase 0.5 remain open until real REFRESH, differential Evaluation and the original exits pass; integrated roadmap count stays 10/14 after packet A.

The user should review: two-table storage, injected validation boundary, full-only v3 output contract, whole-repository summary invalidation on successful legacy writes, and the B1-B4 sequence. No new ADR is proposed because these implement accepted ADR-016. Any required conflict with immutable migrations, Canonical IR, source-policy trust or same-WORKTREE boundaries must stop implementation for a governed design change. Approval of this written spec permits writing the implementation plan, not starting code.
