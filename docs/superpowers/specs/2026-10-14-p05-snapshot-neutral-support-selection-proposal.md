# Phase0.5 snapshot-neutral support selection proposal

Status: ACCEPTED by the user's subsequent “批准” on 2026-10-14. Implementation
and actual acceptance are separate; exact memory values and remote integration
are not approved. This is a bounded amendment inside
the accepted index/Evaluation closeout packet, not a new phase or architecture.
No profile or existing golden is changed by design acceptance.

## Intent and authority

Keep the original exact FULL/incremental graph comparison, real-support selection,
all Evidence/bindings/history and minimum-score confidence aggregation. Opaque
snapshot labels must not determine which source-backed package position appears
when the eligible Provider facts are otherwise equivalent.

The accepted 2026-09-28 P05-W4-002 design explicitly orders equal-ranked supports
by `(providerId, providerSnapshotId, providerFactId)`. P05-W1-011 reuses that
selector for active candidates retained across old and new snapshots. The current
implementation follows those documents; this is a design compatibility issue,
not permission to patch an implementation away from its authority.

DESIGN_AUTHORITY classifies FactMerger policy as EVOLVABLE with Fixture/Evaluation
evidence. No change to a FROZEN IR, IPC, Evidence identity, schema, publication,
Provider independence or phase decision is proposed. Explicit review is requested
because this changes an accepted normative tuple and cached-output compatibility.

## Reproducible evidence and limitation

The pre-amendment run is retained in snapshot-selection-diagnostic.log. The
current diagnostic checks the accepted invariant rather than preserving the
obsolete expected failure. Run, from the repository root:

```powershell
node .superpowers/sdd/2026-10-13-p05-index-evaluation-closeout/snapshot-selection-diagnostic.mjs
```

The script uses independent registered `canonical-normalization` pkg-a/pkg-b
pair goldens, validates each support through collectMergeSupports, selects with
the unchanged selectMergedFacts and compares using the unchanged Canonical
comparator. The private Runtime refresh workspace and patch composition pass
this same selector to Storage reselection.

One FULL observation selects file-A.java. Equivalent active supports split into
retained A and new B select A when the retained snapshot sorts first, but B when
the new snapshot sorts first. The only comparison difference is
`sourceRange.sourceFileId`. Both supports remain valid, source-backed and have
the same Canonical identity; aggregated confidence is unchanged.

Evidence scope is SYNTHETIC_VALID_SUPPORT_SELECTION. It demonstrates the actual
selector's failure of snapshot-label invariance, not admitted Native/SQLite
publication, a completed original corpus or Phase acceptance. Actual positive
Native integration remains blocked by final matched-profile admission.

## Recommendation and alternatives

Recommended: after existing source/resolution ranking, order by
`(providerId, providerFactId, providerSnapshotId)`. Keep Provider priority exactly
as before; retain snapshot ID as the last deterministic discriminator. Select an
existing support, never fabricate or union a range/candidate. Keep confidence,
identity conflict checks, explanations, Evidence IDs and output ordering unchanged.

Retaining the old tuple is possible only while the affected exact comparisons
remain unaccepted; it does not satisfy the newly demonstrated invariant.
Ignoring package source ranges or rewriting the expected graph to match the
result is rejected: it weakens the approved unchanged-comparator contract.

## Compatibility and rollback

Implementation checkpoint2026-10-14: the selected tuple and existing version2
constant are implemented, with regression evidence retained in the closeout plan
workspace. Store validation returns `INCOMPATIBLE`; existing preparation maps that
to `FULL_ANALYSIS_REQUIRED`. Tests preserve old header/indexed pointers and accept
a synthetic current-version baseline. These are offline compatibility tests,
not proof of an admitted Native FULL rebuild. Related serial regression187/187
and focused compatibility70/70 pass. Root, actual publication, full runner and
final resource admission remain separate requirements. Original diagnostic log
records the old rule; snapshot-selection-amended.log records the now-equal result.

Use the existing compatibility mechanism rather than a new field or migration:
advance JAVA_NORMALIZER_VERSION from the actual current string `1` to `2`
to identify the changed Java Canonical selection pipeline. FactKey/Canonical ID
encoding stays v1: no identity algorithm changes. Protocol v1/v2/v3 and derived
header/summary schema versions stay unchanged.

Old derived baselines must return FULL_ANALYSIS_REQUIRED through existing version
validation, without implicit FULL fallback or deletion of the last valid graph.
An explicit full index rebuilds a current baseline through the existing
Application/Store transaction. No automatic background reselection or rewriting
of historical snapshots/Evidence is permitted.

Rollback means restore the previous selector/version together and rebuild under
that version explicitly; never make cross-policy baselines appear compatible.
Existing graph readers/status remain persisted-state views, not proof of header
or policy compatibility.

The exact Node implementation identity changes. Old profiles cannot be reused;
the already planned final four-purpose freeze/calibration/holdouts and separate
exact numeric approval remain mandatory. No memory values/defaults/thresholds
are selected here.

## Implementation and acceptance after approval

Implement within existing Tasks4–6, preserving Native/inline execution and one
whole-product review. No extra helper-by-helper approval or parallel Handoff.

1. Add independent source-backed package support vectors covering both snapshot
   role orders, FULL versus retained/new partition, input order and unchanged
   confidence/identity/Evidence relations. Observe current-rule failures first.
2. Change only the tie tuple and compatibility version plus necessary tests/docs.
   Test old-version FULL_ANALYSIS_REQUIRED/retained graph and explicit new FULL;
   keep unavailable admission as a visible hold, not a synthetic positive claim.
3. Run original FactMerger/normalization/patch/recovery and all affected
   Source/Storage/Evaluation/Runtime suites, build/type/architecture checks and
   required full root. Check two-provider lifetime goldens rather than changing
   them merely to pass. Original 95/95/90/100/0 gates remain unchanged.
4. Synchronize accepted merge and patch/closeout designs, Provider SPI, Native
   baseline compatibility, Evaluation, Design Authority, Traceability,
   Acceptance, Current Status and affected fixture/baseline records. No roadmap
   milestone or DEFERRED scope is added. Continue the approved remaining sequence.

Security/storage impact: no new process, environment, remote service, raw-source
cache, database mutation path, schema or dependency. All Canonical writes remain
validated application workflows; last-good state and transaction rollback stay.

## Decision requested

The user approved the tuple refinement plus compatible version invalidation as
one bounded change. Continue the existing packet without a new helper review.
This is not numerical profile approval or authority to stage/commit/push/merge.
