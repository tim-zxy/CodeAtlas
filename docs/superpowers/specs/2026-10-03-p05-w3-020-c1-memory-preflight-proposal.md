# P05-W3-020-C1 Node verification preflight proposal

Status: WRITTEN AMENDMENT ACCEPTED on2026-10-03 by the user's “确认” after documentation commit25e7797. The earlier “是” accepted the direction. This acceptance permits revision of the existing six-task native plan, not implementation or profile installation before revised-plan/numeric review. Task1 remains incomplete; no completion or Phase exit is claimed.

## Decision requiring review

The accepted C spec and Task1 require decoder/input/ordering copies to be accounted before allocation under the request memory budget. The planned decoder receives raw request bytes with that budget embedded in the JSON header. Current implementation calls `decodeNativeRequestV3` before its budget check. That function creates UTF-8 decoded text, line strings, parsed records and schema copies before returning the embedded budget. Later output parsing also allocates schema copies and retained identity/ownership structures which a cumulative wire-byte counter does not account for. Hard byte/event ceilings bound wire data, not V8 heap or RSS.

This is an implementation-readiness gap in the newly accepted C contract, not evidence that the original gate can be removed. Preserve the memory requirement; do not accept the existing small-budget rejection test as proof of pre-allocation admission. Existing v1/v2/full-v3, Canonical IR, summary schema1, SQLite authority and source policy are unchanged. The new C-only decoder is unreleased and not connected to Runtime publication.

## Reproducible evidence

Call path: `native-refresh-output-v3.ts` → `native-ipc-v3-bytes.ts` → `validateNativeRequestRecordsV3`, then `charge(0)`. The check is after decoding by inspection. The diagnostic below is corroborating evidence only, not a new reservation, statistical bound or Quality Gate.

```powershell
node --expose-gc --input-type=module -e "import {decodeNativeRefreshV3,NATIVE_CLIENT_HARD_LIMITS} from './packages/providers/dist/index.js'; import {buildRefreshCase,requestBytes,chunkBytes} from './packages/providers/test/helpers/native-refresh-v3-corpus.mjs'; const c=buildRefreshCase(); c.request.payload.resourceBudget.maxMemoryBytes=1; c.requestBytes=requestBytes(c.request,c.baseline); global.gc(); const before=process.memoryUsage(); let code; try{await decodeNativeRefreshV3(c.requestBytes,chunkBytes(c.eventBytes),{async accept(){}},NATIVE_CLIENT_HARD_LIMITS)}catch(e){code=e.code}; const after=process.memoryUsage(); console.log(JSON.stringify({budget:1,inputBytes:c.requestBytes.length,code,heapUsedBefore:before.heapUsed,heapUsedAfter:after.heapUsed,heapGrowth:after.heapUsed-before.heapUsed,note:'diagnostic only; not a reviewed reservation or quality threshold'}))"
```

Observed on2026-10-03: input6039 bytes; embedded budget1 byte; returned OUTPUT_LIMIT_EXCEEDED only after heapUsed increased from10,782,992 to14,206,000 bytes. GC/runtime effects mean the3,423,008-byte delta is not the allocation cost of this decoder or a proposed margin. Do not select any admission number from it.

Control example: `native-full-bootstrap.ts` calls Runtime-owned `assertNativeMetadataAdmission` on the trusted application budget before Provider request parsing/copying. Its full-only READ_SEAL/FULL_TRANSPORT profiles cannot admit a REFRESH verification path which they did not measure. The current exact implementation889b6fd92b6f3198594b15722948413bd4c0d7a117e6c1e4eecc9da1e54ad11b refuses both existing purposes; no historical profile has been changed. This identity is provisional and changes if product JS changes.

## Recommended direction, subject to written detail/plan approval

Verification state: C1 output tests67/67 and combined old/new IPC contracts131/131 pass, as do Provider build/IR types/architecture17. First registered root run910 total/908 pass/1fail/1skip exposed the stale exact Provider export list; it was synchronized and focused workspace20/20 passed. The subsequent required-profile root run (`CODEATLAS_REQUIRE_NATIVE_MEMORY_PROFILE=1`) is910 total/882 pass/**27fail**/1 existing Windows skip,151660.9834ms. All27 failures report `Required memory gate has no matching reviewed profile`; these are unresolved compatibility gates, not test passes or an admitted production path.

Failed test names, preserved without suppression:

- Prefix `actual full-v3 transport workspace:` — zero-file, empty-file, maximum-short-files, dense-numeric-sites, long-ascii, long-bmp, long-astral, repeated-shared-owners, duplicate-metadata, foreign-metadata, deep-unknown-input, oversized-staged-fact, large-request, slow-sink (14 failures).
- Prefix `actual bounded read and seal paths:` — zero-file, empty-file, maximum-short-files, dense-numeric-sites, long-ascii, long-bmp, long-astral, repeated-shared-owners, duplicate-metadata, foreign-metadata, deep-unknown-input, oversized-sql-column, oversized-staged-fact (13 failures).

Raw logs: `.superpowers/sdd/2026-10-03-p05-w3-020-native-refresh-producer/c1-root.txt`, `c1-workspace-green.txt`, `c1-root-required.txt`, `c1-contract-final.txt` and the diagnostic JSON. No checkpoint is marked complete or committed as acceptance.

Add only a private Runtime-owned **REFRESH verification workspace** preflight boundary for C's pure request/output validation. The workspace owner supplies a trusted application budget before raw request decoding; Provider code must not depend on Runtime or claim a raw wire-byte ledger is RSS admission. Review the exact interface and its enforcement before implementation; the current C decoder signature is not silently redefined here.

Use a dedicated real verification corpus covering retained input, target metadata, ownership/digest maps, ordering keys, Unicode, malformed/deep input, slow sink and simultaneous buffers. Apply the accepted evidence/provenance/high-water/range process, preserving failure samples and requesting separate exact numeric approval. The old full profiles and original required gates remain immutable. Add actual preflight-before-decode/iterator tests and equality/one-byte-below checks for the reviewed reservation; retain all existing strict contract tests. No value or safety multiplier is proposed now.

This is not REFRESH process transport, patch normalization, Store sealing, SQLite activation, an advertised incremental capability or persisted Evaluation. Those remain D/E. Task5 still recalibrates existing READ_SEAL/FULL_TRANSPORT after the final Node build. The revised implementation plan must identify where this distinct verification calibration/approval fits and how it avoids repeated stale-build measurement. Rust changed-file parsing/resource gates remain required and are not replaced by a Node profile.

## Alternatives and rejected shortcuts

- Move `charge` earlier without a trusted budget: the budget is inside untrusted bytes and still requires decoding; does not establish preflight.
- Guess a wire-to-heap multiplier or borrow the280,453,120-byte full profile: unsupported numeric admission and wrong path/build; rejected.
- Say C only has wire caps and postpone all decoder-memory guarantees to D: changes the accepted C obligation. Not recommended; no such weakening is approved.
- Add a generic admission/Provider framework: unnecessary; follow the narrow existing Runtime validation-port pattern after interface review.

## Impact and rollback

Authority class: compatible C implementation-detail amendment under accepted ADR-016; no identified FROZEN model change. A versioned ADR amendment is required if detailed review discovers a FROZEN conflict. Scope is Phase0.5 C only; no Phase0 reopening, extra roadmap task or DEFERRED feature.

Potential code changes after approval: Runtime private validation/admission boundary, C validator interface, dedicated verification worker/corpus/evidence and required runners; no migrations or published schema versions. Keep Provider-independent IR and dependency rules. Synchronize C spec/plan, Design Authority, Native IPC/Runtime Configuration, Acceptance, Traceability and Current Status before implementation; do not check any original exit box.

Rollback: leave the unreleased C validator inaccessible from production and restore full-only routing, retaining all previous active graphs, immutable historical profiles/reports and the current evidence. Never bypass validation or write SQLite from Rust. Existing v1/v2 and full-v3 continue subject to their matching reviewed-build admission.

## Approval requested

Written detail is accepted. Review the revised existing six-task plan before native implementation resumes. Preserve the selected native method; exact-purpose numeric approval remains a separate later decision with matching measurements. No concrete reservation is available for approval now.

## Written detail: authority and exact interfaces

The trusted budget comes from the Runtime/application request context, not a field discovered by parsing the raw header. Only the Runtime owner performs measured admission. A raw Provider validator is a pure contract primitive, not a production resource/publication authority. These proposed interfaces do not exist yet:

```ts
// packages/runtime/src/native-refresh-verification.ts; private module,
// not added to runtime/index.ts or the public Provider SPI.
type NativeRefreshVerificationInput = {
  requestBytes: Uint8Array;
  lines: AsyncIterable<Uint8Array>;
  sink: { accept(event: NativeRefreshEventV3): Promise<void> };
  limits: NativeClientLimits;
};
function verifyNativeRefreshObservation(
  memoryBudgetBytes: number,
  openObservation: () => NativeRefreshVerificationInput,
): Promise<{ terminal: Extract<NativeRefreshTerminalV3, { type: 'REFRESH_COMPLETED' }> }>;

// packages/runtime/src/native-metadata-admission.ts; private sibling export.
function assertNativeRefreshVerificationAdmission(memoryBudgetBytes: number): void;

// packages/providers/src/native-refresh-output-v3.ts; C-only new primitive.
// Proposed mandatory fifth argument, not an existing implemented signature.
function decodeNativeRefreshV3(
  requestBytes: Uint8Array,
  lines: AsyncIterable<Uint8Array>,
  sink: { accept(event: NativeRefreshEventV3): Promise<void> },
  limits: NativeClientLimits,
  expectedMemoryBudgetBytes: number,
): Promise<{ terminal: Extract<NativeRefreshTerminalV3, { type: 'REFRESH_COMPLETED' }> }>;
```

This changes only the unreleased C helper, not wire shapes, schema versions or a published v1/v2/full-v3 API. Type imports reuse the existing C event/terminal and NativeClient limits; no generic admission interface, callback framework or dependency is introduced. The lazy opener is necessary to prove refusal precedes request preparation and iterator/sink acquisition, not a future extension point. It is synchronous and called once. C callers are test/measurement observation adapters only; it must not spawn a Native child, query SQLite or activate a graph. Future D must design its own process/Store composition and transport budget before using this primitive.

After written acceptance, update C's original file/interface list and every helper/test consumer to the fifth argument. Do not keep an optional default which silently recovers the budget from untrusted bytes. Pure Provider tests may call the primitive directly with an independently known Fixture budget, explicitly proving contracts only. Real admitted verification tests use the private Runtime entrypoint. The calibration-only adapter remains offline/test code and cannot publish or install admission.

## Written detail: admission and decoding order

1. Validate the trusted scalar as a positive safe integer before calling the opener. Invalid trusted configuration uses existing `NativeClientError('INVALID_CONFIGURATION')`. Missing/mismatching purpose/build profile or a budget below its reviewed reservation uses existing `NativeStateValidationError('RESOURCE_LIMIT_EXCEEDED')`.
2. Obtain the trusted built environment using `nativeMetadataEnvironment()`, match the dedicated verification profile and compare its reservation to the trusted budget. Do this before opener, request byte access, request parsing/schema copying, output iterator access or sink invocation. Environment hashing/profile lookup is bounded trusted control-plane work; it does not inspect the untrusted request. The measured peak includes startup/control-plane work. This is not a promise of zero JavaScript allocation on rejection or an OS-enforced RSS limit.
3. Invoke the opener once. Validate hard/lowered byte ceilings and input byte length before making the owned request-byte snapshot. Snapshot at most1,000,000 bytes within admitted workspace; account its overlap with the caller's source buffer in the real corpus. Invalid/oversized input fails without acquiring the output iterator. No unbounded stringify or full graph payload cache.
4. Decode/validate the bounded snapshot using the existing v3 request validator. Require REFRESH and **exact equality** between embedded `maxMemoryBytes` and the supplied trusted budget before reading output. A mismatch is `NativeClientError('INVALID_REQUEST')`. The embedded value is a consistency claim, never admission authority. Equality avoids a caller reserving a large budget while presenting a smaller advertised budget as a successful invocation.
5. Validate streamed output under unchanged byte/event/metadata limits, strict context/checksum/inventory/ownership correspondence and awaited sink. Preserve the bounded data-work ledger as an additional early-refusal mechanism; do not label it heap/RSS accounting. Real profile calibration must include parsed records, schema copies, complete target summaries, identity/ownership/reference maps, ordering keys, decoded strings, pending line buffers and concurrent caller buffers.
6. Return the frozen terminal observation only after complete EOF validation. Failed terminal, corrupt/truncated/post-terminal output, rejected sink or resource failure produces no successful result. Provisional sink delivery is not publication authority; the C adapter never writes an active graph. Production child deadline/cancellation/termination remains D's separate transport obligation, not claimed by this pure verifier.

The input budget cannot be learned from an untrusted header before the parser has allocated. The trusted out-of-band scalar and lazy preparation fix that ordering problem; the measured exact-purpose reservation addresses the Node workspace rather than inventing a multiplier for encoded data. C1 completes only after both mechanisms and their gates exist.

## Written detail: separate profile and evidence contract

Purpose is `REFRESH_VERIFY`, explicitly distinct from READ_SEAL, FULL_TRANSPORT and future REFRESH transport. Add a separate static `nativeRefreshVerificationProfiles` array in the existing `packages/runtime/src/native-metadata-profiles.ts`; keep every existing entry byte-for-byte unchanged. This file is already excluded from the implementation hash; do not add another exclusion or change the environment algorithm.

Each new entry carries the current environment tuple (`node`, `v8`, `platform`, `arch`, `zodVersion`, `implementationDigest`, existing environment `corpusRevision`), plus `workspace: 'REFRESH_VERIFY'`, `verificationCorpusRevision`, `verificationCorpusDigest`, `reservationBytes`, `evidenceDigest`, `memoryPolicyRevision`, `memoryCandidateEvidenceDigest`, `observedPeakBytes`, `fluctuationAllowanceBytes`, `peakMethod: 'resourceUsage.maxRSS'` and `peakUnits: 'bytes'`. Proposed verification corpus revision is `p05-native-refresh-verification-memory-v1`. Runtime consumes approved static data only; it never reads reports, recomputes candidates, calibrates at startup or auto-adjusts reservations. A full/read profile or missing verification entry cannot authorize this purpose.

Use dedicated new verification report/manifest/candidate/holdout files under the existing `fixtures/storage/native-analysis-state/` directory, with byte-preserving attributes. Do not regenerate historical files or edit READ_SEAL/FULL_TRANSPORT corpus definitions. A small dedicated offline collector validates REFRESH_VERIFY rows and reuses the already exported `calculateNativeMemoryReservation`; existing report validators retain their two-purpose schemas and behavior. No measurements or product helpers are added by this document.

Freeze final C Node JS and the verification worker/corpus digests before capture. Environment equality alone is insufficient: reports and groups also bind the workspace, case and exact input payload digests. Run all verification classes five times in fresh sequential processes, retaining the accepted repetition policy. Include all compatible same-purpose/exact-identity history and high/failure observations, not only low samples. Compute `M`, `J` and the prior approval floor under the existing high-water/range rule; a prior full-only approval is **not** a verification-purpose floor. Without an actual same-identity REFRESH_VERIFY approval, its floor is absent. No new MiB value, percentage, rounding or statistical confidence claim is allowed.

Raw rows record restricted environment, class/payload digest, expected and observed outcome, input/line/output/event/summary sizes, sink maximum overlap, samples (`rss`, `heapTotal`, `heapUsed`, `external`, `arrayBuffers`, startup-inclusive maxRSS) and final absolute peak with the existing unit conversion. Preserve malformed/failed rows as diagnostic artifacts but never admit them as valid calibration evidence. Every expected refusal remains a measured valid test outcome, not missing coverage. Candidate arithmetic/provenance is tested with independent synthetic numbers, never fabricated production observations.

Avoid a calibration chicken-and-egg bypass: the offline worker measures the **same Provider decoder** plus trusted budget validation, bounded preparation and real environment hashing, without an installed production profile, following packet B's provisional composition convention. Record that this is not the admitted Runtime port. Frozen-candidate verification repeats every class in fresh independent processes before numeric review and does not fold holdout into the candidate to force a pass. After explicit numeric approval, run every class through the actual Runtime port and enforce each fresh peak against the installed reservation. A fresh exceedance retains artifacts and holds release; no retry-until-green or automatic margin increase. Installation requires both the reviewed evidence and subsequent actual-port gates, not the provisional worker alone.

No SQLite strings are owned by this verifier, so do not transplant packet B's twice-retained-SQL surcharge into REFRESH_VERIFY. Existing READ_SEAL/FULL_TRANSPORT SQL charging remains unchanged. Future D must charge any simultaneous baseline/staging/transport work before composing a refresh workflow; this profile alone cannot establish D's budget or applicability.

## Written detail: fixture classes and acceptance

Keep the27 C1 raw byte cases and five payload vectors immutable as behavioral expectations. Additional test helpers/measurement fixtures must be independent of production digest/ledger algorithms; use the established independent C1 digest helper only for framing/hand-authored semantic records. Contract-only synthetic facts do not prove Java parsing/resolution quality.

The verification corpus has these proposed mandatory classes:

- `zero-target`, `maximum-short-files`, `dense-retained-sites`, `maximum-target-summary`, `large-patch-ledger`, `long-ascii`, `long-bmp`, `long-astral`, `repeated-shared-owners`, `forged-owner`, `deep-unknown-input`, `oversized-input`, `oversized-output`, `slow-sink`, `burst-output-buffer`.

Density/size builders stop at the actual unchanged input1,000,000/line1,000,000/output10,000,000/events10,000/metadata1,000,000-byte bounds; the oversized classes exercise the next increment. Derive payloads and expected errors in the revised task plan, not arbitrary smaller “large enough” thresholds. Burst delivery measures concurrent caller chunk/pending-line/schema buffers; slow sink proves one awaited delivery, no next-chunk advance while blocked. Syntax/Java expectations remain in original C2, not invented here.

Required gates map to specific breaks:

| Gate                                            | Evidence required, not yet implemented                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing/foreign full-only verification profile  | REFRESH_VERIFY refuses; lazy opener/request getter/iterator/sink counters remain zero                                                                          |
| Exact reservation equality / one byte below     | Equality reaches real validation; one-below refuses before preparation; values come only from a reviewed installed profile                                     |
| Untrusted lower/higher wire budget              | Exact mismatch returns INVALID_REQUEST with zero output iteration/sink calls                                                                                   |
| Invalid scalar / oversize input                 | Typed failure before preparation or bounded copy respectively; no schema decode/iterator access on oversized input                                             |
| Mutable caller bytes                            | Owned admitted request snapshot gives stable validated input through asynchronous output delivery                                                              |
| Worker/profile/corpus identity changes          | Candidate/holdout/admission refuse without relabeling observations or overwriting prior evidence                                                               |
| Slow/rejecting sink, malformed/deep/EOF/failure | No success result; awaited delivery and strict caps/correspondence remain intact                                                                               |
| Actual fresh memory and failure artifacts       | Every class has real observations; required mode refuses missing profile or peak excess and retains failure artifacts                                          |
| Compatibility                                   | Original required READ_SEAL/FULL_TRANSPORT/root/real-binary/Rust/architecture/format gates remain mandatory;27 current missing-profile failures are not waived |

The numeric equality tests cannot be represented as passing from synthetic profile injection; injection may prove control logic only. Capture/review/install actual values in the later numeric step. A required REFRESH_VERIFY suite on the supported CI environment must fail when its exact reviewed profile is absent; optional unsupported-platform runs clearly state unavailable admission, not production readiness.

## Written detail: sequence, synchronization and non-goals

After written acceptance, revise the **existing** six-task plan, not a parallel parent implementation plan:

1. Extend Task1 with private preflight, the C-only fifth argument, raw-request snapshot and refusal/ordering tests; it remains a checkpoint until actual measured admission gates pass.
2. Keep Tasks2/3 Rust-only retained decoding/shared helpers/real producer scope unchanged. C1's final reviewed event/input interfaces are their dependencies; their Cargo tests can run without Node admission. No parent completion from those tests.
3. Extend Task4 with the new verification corpus/worker/collector and required runner. Its actual Runtime positive tests stay held pending numeric approval; source-based C2/differential evidence remains required.
4. Extend Task5 to capture three separately scoped workspaces sequentially from the **same final Node build**: original paired READ_SEAL/FULL_TRANSPORT using their unchanged tools and a distinct REFRESH_VERIFY candidate/holdout. Preserve separate reservation purposes and provenance; do not pool inapplicable history or sum absolute process peaks. One review may present both exact candidates, but must request explicit approval of each purpose/value.
5. After approval, install separate entries and run actual-port verification plus every original required memory gate. Only then close the corresponding Task1/4 checkpoints and perform Task6's complete regression/one native whole-branch review. A Node JS change after freeze invalidates the affected candidates; remeasure under governance.

This sequencing avoids approving a provisional JS build now and repeating all calibrations after later C changes. It does not pretend Task1 is complete before its memory acceptance, or allow the existing Task5 approval to authorize this newly designed purpose. The amended plan must explicitly ledger the temporarily open checkpoints and preserved task dependencies.

No new ADR is presently required: ADR-010/014/015/016's FROZEN storage/protocol/language boundaries are unchanged. This is a compatible C Design Change Proposal for an unreleased helper and private resource boundary. If review finds a FROZEN conflict, stop and amend the ADR before implementation. Before coding after acceptance, synchronize C spec/plan, Architecture, Design Authority, Native IPC/Runtime Configuration, Evaluation/Traceability, Work Breakdown, Acceptance, Roadmap and Current Status, preserving original checkboxes, immutable baselines and DEFERRED limits. Historical observations remain dated, not overwritten by a new passing claim.

Not in scope: Native process transport/pre-spawn lifecycle, SQLite reads/staging/seal/transactions, D atomic publication/refresh-transport admission, E persisted Evaluation, new worker knobs, adaptive scheduling, other languages/frameworks, knowledge/Wiki/Agent changes, public Provider SPI or a new roadmap milestone. Rollback remains full-only routing and last-good graph preservation. The written proposal adds no product code, profile, Fixture registration or new runtime evidence.

Self-review: trusted budget is independent of raw bytes; lazy preparation is guarded; embedded budget equality cannot grant authority; new profile has distinct purpose/provenance; offline provisional measurement is disclosed and followed by required actual-port gates; Node hash exclusions/old reports/corpora and original phase metrics are unchanged; C/D/E calibration and publication boundaries are explicit. Written review and revised native-plan review remain before implementation, and exact numeric review remains before profile installation.
