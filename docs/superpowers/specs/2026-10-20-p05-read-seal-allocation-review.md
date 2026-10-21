# Phase0.5 READ_SEAL allocation review

Status: accepted2026-10-21 by explicit subsequent “批准” covering the comparator
correction and exclusive R4, in same sequential Tasks7/8. New exact values remain
separate. Pending/proposed wording below is historical review context.
User's earlier “同意” authorized investigation/design review, not this previously
unwritten product correction, new layout or a new reservation. Same closeout
Tasks7/8 only; Phase0.5/PR21/Phase1 remain HOLD.

## Intent and preserved constraints

Explain the admitted R3 pair's fresh memory failure and choose a minimal response
instead of raising reservations automatically. Preserve every raw high sample,
exact-product admission, Unicode ordering/digest bytes, full validation, SQL
numeric-before-TEXT checks/twice-UTF8 charge, rollback, timeouts and all gates.
No forced GC, lower Fixture density, changed peak method, new dependency,
speculative cache or OS-enforced-memory claim.

## Observed evidence, not an assumed cause

The complete root finished1590 tests:1588pass/1fail/1existing skip. The valid
READ_SEAL dense-numeric-sites row reports250535936 bytes versus219095040 approved.
All13 original rows are retained in READ_SEAL-22416.json, SHA256
55cacb8bb321789fa2e8acf34683ac2b0417f588df90b679b0c0d867d74ff450.
Its environment/productd402c9a4…56e1, all2329 dependencies, input digest,
serialized999788/readSQL999906/sealSQL1661479 and correctness/closure agree
with calibration. The original pure peak gate deterministically rejects it.
Seal-phase RSS is244658176; calibration seal RSS is approximately209–210MB.
The unshipped pair was withdrawn under the existing policy. D/VERIFY and every
preexisting profile remain unchanged. Guarded R3 actual22 passed independently;
it does not waive this READ_SEAL failure or prove hosted acceptance.

Two fixed diagnostics, with different questions, are sealed in the same ledger:

1. `task8-r3-allocation-probe`: one original worker with exit-time heap sampling.
   The profile predominantly retains module-loading objects and cannot explain
   short-lived seal allocations. Its215310336-byte diagnostic peak is NOT a
   replacement sample, acceptance pass or proof the high peak disappeared.
2. `task8-r3-phase-allocation`: one original worker with an external scratch-only
   Inspector allocation-sampling hook. Include objects collected by major/minor
   GC, sample interval32768, no explicit GC. The hook wraps only the original
   seal method and records scalar entry/exit memory. Sampled allocation volume
   is1101997616 bytes;714904368 is below `unicodeOrder`,803661816 below
   `canonical`,166960720 below `checkStage`. Categories overlap and MUST NOT be
   added. Seal entry RSS163663872; exit RSS247787520. Profiling changes timing,
   so none of these numbers selects a reservation or reproduces the old process.

Original raw stdout/stderr, full profiles and summaries are retained under
`.superpowers/sdd/2026-10-13-p05-index-evaluation-closeout/`; no product/helper
was instrumented or rebuilt for these probes. The first probe's limitation
justified a different phase-allocation question, not another attempt to get green.
No more probes or favourable-sample retries follow automatically.

## Source-backed call path and interpretation

`native-metadata-worker` keeps its original source/baseline while calling
`RepositoryAnalysisStage.sealNativeState`. Storage first checks actual numeric
SQL size and context, then calls Provider validation with full-stage readers.
`checkStage` recomputes fact-content digests; canonical encoding sorts object keys
with `unicodeOrder`, and summary ordering uses that same comparator. Storage
finally creates its immutable state copy. These validation/ownership steps stay.

In `packages/providers/src/native-analysis-state.ts`, `unicodeOrder` currently
allocates `Array.from(a, codePointAt)` and `Array.from(b, codePointAt)` on EVERY
comparison, including short object-key comparisons. Source and allocation
stacks agree that these temporary arrays are a substantial allocation source.
This establishes an optimization target, not sole causality for the historical
250535936-byte excursion, a leak, GC bug, host fault, or either earlier timeout.

## Alternatives and recommendation

1. **Recommended: allocation-free scalar comparator.** Scan each string using
   numeric UTF-16 indices and `codePointAt`; advance by two code units for an
   astral code point, otherwise one. Return the first code-point difference;
   if one string ends, only its prefix ordering matters. No arrays, cache,
   locale collation, schema shortcuts or caller-visible API. All callers remain
   routed through the same private comparator. Keep canonical encoding unchanged.
2. **Evidence-only larger candidate.** Preserve all compatible original/failed
   data, apply existing policy and independently validate a later proposal.
   This addresses observed high water but does not address repeated temporary
   allocation. Recurrent exceedance forbids making this an automatic ratchet;
   it would still need explicit review/new numerical approval.
3. **Broader streaming/caching redesign.** Potentially changes validation ownership,
   repeated-reader and digest contracts. It is unnecessary before evaluating
   the local comparator and is outside this proposed correction.

## Proposed proof before keeping product code

- Existing Array.from code-point behavior is the reference, not default JS sort
  (UTF-16 order) or localeCompare. Cover empty/prefix/equal, ASCII, BMP versus
  astral, supplementary planes, mixed scripts and malformed-Unicode refusal.
- Verify comparator sign/equivalence, antisymmetry/transitivity and original
  cross-language canonical/fact/summary digest bytes with independent fixed
  vectors. Tests must hit production behavior, not merely a duplicate function.
- First reproduce comparator-array allocation in a focused call-path regression;
  then prove no whole-string code-point arrays are created by that comparator,
  while all validation and digest outcomes stay unchanged. Restore any test-only
  instrumentation before another test; no production switches or counters.
- Run Provider/Storage correspondence, Unicode/digest/safety and original
  registered suites. Do not assert a fixed RSS saving from a profiler result.
- If any existing digest/wire/IR semantics changes, STOP: this proposal does
  not approve a compatibility change. Do not update golden bytes to match code.

## Exact-identity consequences and consolidated authority boundary

The product correction necessarily changes implementationDigest. Previous
R3 candidate/approval/ZIP/actual22 cannot admit it; no old value is transplanted.
The original 22 qualification/320 four-purpose calibration/64 independent
holdouts, clean rebuild and new exact numeric approval remain mandatory.
All old failures/high samples remain associated with their original identities;
they must not be silently recast as new-build observations.

Because R3 is already acquired and immutable, the recommended complete next
batch additionally needs a NEW exclusive literal layout-v4 at
`C:\CodeAtlas-P05-D5-R4`, same existing ownership/confinement/version-routing
rules and generator-v3 discovery. Preserve v1/R2/R3 roots, records and assets;
no existing-root adoption, relocation flag or overwrite. This new layout is
PROPOSED ONLY and has not been created or implemented.

Ask for one consolidated decision covering this comparator-only correction and
the necessary R4 evidence layout, then execute the same Tasks7/8 sequence without
routine per-step confirmation. New concrete numbers remain a later separate
material gate; no promise that repeated empirical sampling is an OS bound.
No profile reactivation, new Release/push/CI/merge or Phase1 coding precedes the
corresponding original gates and authorities.

## Self-review

No new formula, reservation, default, timeout, protocol, migration, task or phase.
No implementation or new layout acquisition occurred in this investigation.
All profiler numbers are diagnostic only; the old failure cause remains only
partially localized. The recommendation is a bounded allocation correction,
not permission to remove schema/SQL/ownership checks or declare the phase done.
