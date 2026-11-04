## Accepted clarification — 2026-10-25

User approved the recommended exact contract change and corresponding H1 checks. The proposal below is preserved as the reviewed decision record; its PROPOSED wording is historical. H2–H5, new dependencies/numbers and cloud CI remain outside authorization.

# H1 full establishment and transition nullability clarification

Status: PROPOSED; implementation authority unchanged. 2026-10-25.

## Evidence and conflict

The accepted R011 DCP section3.2 says transitions is the existing HistoryTransitionDraft or null, with null only for the first full establishment. Section2.1 invalidates the active pointer after legitimate legacy writes and requires a subsequent full establishment; section7 allows an explicit same-database old activation as parent, including a new revision. Existing Providers history-transition.ts produces a delta draft or NO_OP_DRAFT, with same-revision and foreign revalidation restrictions; it is not a full-establishment constructor. DCP section3.2 also forbids a NO_OP from creating a new history record.

The independent syntax-ancestor component fixture currently has a same-revision parent and transitions=null. Its parent/old original/current projection relations pass storage checks, but that does not settle the first-full-only wording or authenticate a producer. H1 implementation checks present transition nested shape; it does not yet claim conformance on establishment kind, parent/draft linkage or NO_OP persistence. This issue blocks H1 acceptance, not already approved unrelated tests.

## Alternatives

1. Recommended: null explicitly denotes FULL establishment, including first establishment and complete re-establishment after pointer invalidation, with optional exact previously committed parent. Non-null denotes DELTA and must be TRANSITION_DRAFT linked to the exact loaded parent and its basis. NO_OP_DRAFT is never stored as a new activation. Reuse the existing nine-field manifest, SQL, invariants and candidate-only boundary.
2. Keep first-full-only null: separately design a full-establishment receipt/discriminator and synchronize the manifest/Stage/Store contracts before H1 can accept subsequent full records. This is larger and would change the approved format and fixture scope.
3. Forbid a parent on full recovery: loses the expressly accepted audit ancestry and does not explain same-revision re-establishment; not recommended.

## Recommended exact contract change, pending approval

Replace the section3.2 transitions sentence with: transitions=null denotes FULL establishment; a full establishment may have an exact previously committed parent, including a same-revision ancestor after legacy invalidation. A non-null transitions value must be the existing TRANSITION_DRAFT, reference parent.activationId, and have oldBasis equal the loaded parent's state.basis. Its targetSource must match the current state.basis Source triple. NO_OP_DRAFT creates no activation, snapshot or pointer update.

This is a storage declaration, not proof of full observation or authorization. H1 can check shape, exact relations and immutable SQL/current-Code consistency. H4 must enforce all-provider full revalidation, no-op/idempotence, atomic Store and preservation of foreign supports through the validated application workflow. H5 owns authentic observation/run qualification; no caller assertion, qualificationRef or null field grants it. No published knowledge or Runtime route is added.

## Follow-up verification and synchronization

After explicit approval: synchronize the controlling DCP/ADR020/IR-SPI-SQL relevant records, WBS/acceptance/traceability and the H1 plan. Keep the original syntax-ancestor literal as a FULL component-only positive with exact parent; add first-full/re-establishment/valid-delta positives and missing/wrong parent, wrong oldBasis/target and persisted-NO_OP negatives. Independently author declarations and preserve all old raw evidence; no product-generated golden or actual-run claim. Do not introduce new fields, numerical gates, profiles, dependencies, Native executions or cloud CI.

Current T1/T2 local evidence stands as scoped evidence. T3/T4 and LOCAL_R011_HISTORY_STORAGE_CAPTURE acceptance remain OPEN pending this decision and complete fresh verification. H2/H3 mapping/confidence and H4/H5 implementations remain outside this approval.
