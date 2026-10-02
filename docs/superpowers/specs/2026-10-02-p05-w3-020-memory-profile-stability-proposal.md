# P05-W3-020-B Memory profile stability proposal

Status: WRITTEN AMENDMENT ACCEPTED on 2026-10-02 by the user's “确认”. The preceding “批准” authorized detailed design; this later confirmation accepts the high-water/range rule and reporting/validation contract below, permitting implementation planning. It does not approve a concrete reservation, implementation plan, profile installation or publication. The [implementation plan](../plans/2026-10-02-p05-w3-020-memory-profile-stability.md) awaits review; the corrected build remains unadmitted.

## Decision and evidence

The accepted packet B admission policy uses the maximum absolute process RSS from five fresh repetitions of every calibration class, with no guessed headroom. Numeric release approval is exact-build/environment specific. This is a measured admission policy, not a FROZEN architecture decision or OS memory guarantee.

On 2026-10-02 the user approved 212,692,992 bytes plus twice retained SQL UTF-8 bytes for build `86fa33c51ecf63383f3575877bedaf66c47661dee5222ea4e14e8a0dd74e5888`. After installing it, Runtime admission/read/bootstrap tests passed50/50. The required fresh read/seal and transport corpus gate then passed40/41: dense-numeric-sites observed213,086,208 bytes and correctly failed the peak/reservation comparison. This is a real failed gate, not permission to retry until green.

Five subsequent sequential fresh processes, with the same environment and identical payload digest `170f17e5e7b9cd05b85160a84e85182367124c5b15afc304134582e711793d72`, observed211,857,408;245,719,040;211,820,544;245,710,848;212,004,864 bytes. All preserved persistent state and closed transactions. Seal-phase heap/RSS also differed between runs. The allocation/GC cause is not established; neither concurrency nor GC is asserted as the cause. The sample maxima demonstrably vary enough that the first calibrated maximum is not a reliable future gate bound.

Unchanged raw evidence is retained in the existing Fixture directory:

- `fixtures/storage/native-analysis-state/memory-baseline-review-fix-read-seal.json`:65 observations; SHA-256 `4f9150504e36ac0c6b77f8ac3914379e45b6aa2e0f9543dcd79389d628720fed`.
- `fixtures/storage/native-analysis-state/memory-baseline-review-fix-transport.json`:70 observations; SHA-256 `71d3460e6f023c72c818e04fecfc2477a050ea30bf741f1ba73401f9f6db4300`.
- `fixtures/storage/native-analysis-state/memory-review-fix-dense-repeat.json`:five diagnostic observations, not a replacement calibration; SHA-256 `d0a021a3344bac3115f5ce83b28900e4838a949451cced4b60ae8a7632153281`.

Reproduction: run both existing `scripts/bench-native-*-memory.mjs` scripts; for the diagnostic class run `node packages/runtime/test/helpers/native-metadata-worker.mjs dense-numeric-sites` in five separate processes. Run the required corpus command with `CODEATLAS_REQUIRE_NATIVE_MEMORY_PROFILE=1`; no corpus, worker or benchmark is altered by this proposal.

## Alternatives and recommendation

1. Keep the maximum-only policy and request repeated numeric increases. This requires explicit approvals but does not address sampling instability; not recommended.
2. Recommended: first detail and review an evidence-based conservative high-water/variance policy, including calibration conditions, supplemental observations, reservation headroom selection and how new CI exceedances invalidate release readiness. Select no new multiplier, margin, repetition count or threshold until that detail is reviewed. Keep fresh observed-peak checks and fail-closed exact-build admission.
3. Reduce allocations or introduce isolated hard memory enforcement. These require separately reviewed implementation/design and remeasurement; neither is implied by this review repair.

## Compatibility, safety and impact

No wire, Canonical IR, SQLite schema/checksum, Provider capability, AUTO/MANUAL lifecycle, dependency or security authority changes. All existing approved historical profiles remain intact. The insufficient new profile is withdrawn so this revised build refuses admission; it is not released as supported. Unknown environments continue to refuse. Do not force GC, lower fixture density, omit absolute RSS, borrow an older-build reservation, or weaken the fresh gate to obtain a pass.

Affected design: packet B measurement detail/plan, CURRENT_STATUS, Design Authority, Acceptance, Traceability and Evaluation baseline/profile provenance. No new roadmap task or phase is introduced. Packet B completion is delayed by this quality hold; Phase0.5 remains10/14 integrated and its original exits remain open. No PR, push, merge or final completion commit follows while this gate is unresolved.

Rollback: retain the old exact profiles and raw reports; withdraw only the newly installed insufficient entry. Any later admitted reservation must have explicit numeric approval, synchronized evidence and fresh complete gates. Required validation includes same-input fresh-process variance investigation, reviewed reservation selection, over-budget/missing-profile refusal, both required corpus suites, Runtime/bootstrap/root and existing native/Rust/architecture gates. Detailed-design work is now authorized; the written detail below requires review before planning or implementation.

## Accepted detailed amendment

### Intent and boundaries

Make reservation selection reproducible and less sensitive to one unusually low calibration batch without changing actual-path correctness checks. Preserve exact-build refusal, fresh peak gates, all failed observations and explicit numeric release approval. Increased reservation means more conservative request rejection, not permission to allocate more, increase IPC ceilings or consume a larger user budget. No new language, framework, REFRESH, scheduler, hard-RSS isolation or GC tuning is required.

The proposed method is an engineering policy, not a confidence interval, distribution assumption or guarantee of future maxima. A measured fluctuation range is useful evidence for a buffer; it is not proof that the next excursion fits. If exceedances recur after this amendment, stop and revisit measurement/allocation design rather than automatically ratcheting reservations.

### Evidence identity and eligibility

Use an offline evidence manifest in the existing `fixtures/storage/native-analysis-state/` directory. It records the proposed policy revision `p05-native-memory-high-water-range-v1`, report paths and raw SHA-256 hashes, exact Node/V8/platform/arch/Zod/implementation identity, both corpus revisions/digests, workspace, case name, collection purpose, command and outcome. Purpose is calibration, diagnostic or independent verification; an expected negative Fixture outcome is not a collection failure.

Evidence is eligible only when its absolute peak is a positive safe-integer byte count using `resourceUsage.maxRSS`, environment/build identity matches, input/corpus provenance is verified, and its declared correctness/recovery assertions pass. Do not combine older builds, other platforms, different corpora or different workspaces as though they were repeat measurements. Read/seal groups use workspace + case + `corpusPayloadDigest`; transport groups use workspace + case + exact pinned corpus digest. Transport construction is fixed by that corpus, but the current worker does not emit a payload digest: record that limitation rather than fabricate one. Case names shared between read/seal and transport are separate groups.

The current diagnostic file is a raw array without a corpus wrapper. Its manifest must explicitly bind the five observations to the unchanged read/seal worker/corpus and verified payload digest; missing association makes it ineligible. The original65/70 reports remain immutable. The initial failed gate log establishes a real exceedance but lacks a full raw observation: retain it as failure evidence, not an invented complete measurement row. All known valid compatible observations, including diagnostic high peaks, enter the manifest; never select only lower samples.

Manifest entries refer to local generated fixtures, not arbitrary file paths supplied by product requests. Reject paths outside the designated Fixture directory, missing reports, hash mismatches, invalid units/numbers, differing identities and incomplete required class coverage. Audit fields contain only the existing restricted environment tuple and fixture metadata, never unrestricted environment variables or source/secrets.

### Collection and proposed reservation rule

Retain the current complete calibration:13 read/seal classes and14 transport classes, five fresh processes per class. Keep worker/benchmark code, absolute startup-inclusive peak method, input density, caps and expected success/refusal behavior unchanged. Collect the two workspaces sequentially, without concurrently running another heavy verification/calibration command; record the command/runtime and collection conditions. No explicit GC, startup subtraction or claimed elimination of all host variability.

The initial evidence set must also include the existing five dense-site diagnostic observations and a new complete calibration of the eventual implementation identity. If only offline scripts/profile data change, the existing product hash may remain the same; verify it rather than assume it. A change to measured production modules or corpus identity requires fresh matching evidence and cannot inherit older measurements. The five-repetition count is retained from the accepted policy, not claimed to establish statistical sufficiency.

Freeze the eligible set before computing the candidate. For each comparable workspace/case/input group `g`:

```text
high[g] = maximum observed absolute peak in g
low[g]  = minimum observed absolute peak in g
range[g] = high[g] - low[g]

M = maximum high[g] across both workspaces
J = maximum range[g] across comparable groups
R_candidate = max(M + J, highest previously approved reservation for this exact identity)
```

If there is no previous exact-identity approval, omit that floor. Withdrawn approvals remain historical floors, never permission to reactivate withdrawn profiles. Each required calibration group must have its existing five repetitions; no singleton group may substitute for that coverage. Check integer overflow before addition and refuse candidate generation on incomplete/invalid evidence.

Adding one observed range is the **explicit policy choice accepted in written review**. It is not mathematically mandated by the samples and approves no concrete numeric margin without subsequent matching measurements/review. It avoids choosing an unsupported fixed MiB or percentage multiplier while providing a traceable fluctuation buffer. `M`, `J` and the previous-approval floor must be reported independently with the observations that determine them. Do not label the range as statistical variance or infer a confidence level.

The result is a provisional candidate only. No concrete new reservation is selected in this design. The user reviews the formula now and later reviews the exact candidate bytes, evidence identity and limitations. Do not round upward to a convenient value or lower a previous reservation automatically. A future intentional reduction requires a separate evidence-backed review.

Retained SQL charging stays unchanged: admission/read/seal require the installed overall reservation plus twice actual retained SQL UTF-8 bytes according to the existing call path. Do not add the read/seal and transport peaks together, add `external` and its overlapping `arrayBuffers`, subtract startup, or double-count retained strings in the headroom calculation. Observations remain absolute process RSS as before.

### Candidate report and integration

Add one small offline standard-library aggregator, not a Runtime calibration subsystem. It validates the manifest/raw files and emits a versioned candidate report containing policy revision, eligible report hashes, grouped minima/maxima/ranges, `M`, `J`, prior floor, proposed reservation and capture status `PROVISIONAL_REVIEW_REQUIRED`. The candidate report has its own digest and references unchanged raw reports; it is never represented as a raw measurement report.

New profile data records policy revision, candidate-report digest, observed peak and fluctuation allowance in addition to the existing environment/corpus/evidence fields. Existing historical profiles remain byte-for-byte unchanged. Existing `evidenceDigest` and `fullTransportEvidenceDigest` continue to identify raw paired reports; the new candidate digest is a separate field. Profile tests stop equating raw maximum with reservation for this new policy: they verify raw provenance, recomputation of the proposed formula and explicit approval instead. Historical-policy tests keep their original meaning. No product IPC or Canonical schema field is added.

Runtime continues consuming the approved `reservationBytes`; it does not scan evidence, recompute statistics, lower admission or calibrate on startup. Changes limited to offline tools, test provenance and the profile-data module excluded from the implementation hash do not require a new Runtime algorithm. If implementation unexpectedly requires Runtime behavior changes, stop, amend the plan and remeasure the changed exact build.

### Independent verification and fresh CI gate

Before numeric installation, run every corpus class once again in a fresh independent process, matching the existing required corpus suites. Capture complete raw observations with manifest/hashes and compare each peak with the frozen provisional candidate. This is offline validation, not a fake installed profile or production-admission bypass. Do not fold those holdout observations into the candidate merely to make their comparison pass. Failure retains all evidence and returns the candidate for review; no retry-until-green loop.

After explicit numeric approval, install the profile and run the actual Runtime/read/bootstrap/root/native/Rust/architecture/format gates plus both required supported-environment memory suites. CI still compares **every fresh observed peak to the installed overall reservation**, not to the old raw maximum, mean, median or a widened tolerance. Equality passes; any excess fails. An absent exact profile fails the required Windows job. Unsupported-environment correctness runs still report unavailable reservation without claiming admission.

Extend the existing offline/test collector to retain full observations and outcomes in an artifact even when a fresh gate fails; artifact persistence must not turn failure into success. Publish the artifact through the existing CI job's failure-inclusive artifact step, with only fixture-safe metadata. Neither CI nor Runtime may rewrite an approved profile automatically. Fresh exceedance holds release/merge readiness; the responsible workflow withdraws the unshipped insufficient entry, preserves prior graph/state and history, and submits evidence for review. It does not mutate already deployed binaries remotely.

Hosted CI on the exact proposed commit is separately required before a later authorized merge; local correctness or local memory success never substitutes for that observation.

### Tasks, acceptance and traceability

This is an amendment inside packet B, not another roadmap item. After written approval, writing-plans will taskify the following sequence; no implementation begins from this document's draft status:

1. Offline manifest/aggregator and pure provenance/formula tests. Independent hand-derived synthetic examples cover grouped range, cross-workspace separation, preservation of earlier high samples, approval floor, exact identity/hash rejection, missing coverage, invalid bytes and arithmetic overflow. No fixture expects a concrete production reservation from this draft.
2. Failure-preserving observation collection and required CI wiring. Test a deliberately over-budget observation yields a failing exit plus a retained raw artifact; test unsupported versus required-profile behavior and equality/one-byte-above boundaries. Existing worker cases/caps remain unchanged.
3. Complete paired calibration, manifest audit, provisional candidate and independent all-class verification. Preserve diagnostics/failed reports; report a cause as unknown where unsupported. Candidate/holdout evidence must agree on the exact identity.
4. Human numeric review and profile installation only after approval. Run production reservation equality/one-byte-below and changed-build/missing-profile refusal, real bootstrap50-case coverage plus complete required root/native/Rust/architecture gates. Update provenance tests for the reviewed policy without weakening their hash/corpus checks. Synchronize authority/acceptance/trace/status; commit the remaining consolidated review correction only after all applicable gates pass.

Task1 precedes2; both precede3 and4. Evidence collection is sequential to avoid contamination. No additional reviewer is automatically dispatched for the already reviewed implementation branch; this written design is reviewed by the user, and the subsequent plan must be reviewed before execution. The approved native execution method may be retained after those review gates.

Packet B acceptance adds provenance/reproducibility of the reviewed reservation computation, independent candidate verification and failure artifact retention; all original correctness, rollback, compatibility, fresh peak and phase exits stay mandatory. Measurement policy changes neither the four-layer Evaluation model nor phase-level numerical thresholds. Detailed task contracts and newly generated evidence remain pending, not implementation-ready merely because this document is written.

### Approval boundary and self-review

Written approval accepts the policy rule and reporting/validation contract, permitting implementation planning. It does not approve a candidate value, product-code changes, profile installation, external publication or phase promotion. Numeric approval is a later separate decision with actual matching reports.

Self-review: the direction approval and written approval are distinct; `M + J` is explicitly proposed rather than inferred or silently normative; exact identities separate incompatible samples; read/seal and transport share a conservative reservation without summing peaks; raw and candidate reports have distinct hashes/status; failed holdouts/CI cannot be erased by reruns. Current request caps, retained-SQL charge and unknown-environment refusal are unchanged. Known limits remain finite sampling, unproven GC causality, missing transport payload digest and lack of OS enforcement. No acceptance claim is based on documentation alone.
