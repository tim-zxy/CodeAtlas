# P1-04/05 mixed Native compatibility proposal

Status: ACCEPTED 2026-10-22 by explicit user reply approving the recommended revision and continued implementation. No Source classification, Runtime routing, R010/schema/guard relaxation or mixed activation is implemented by this proposal. Python grammar and pure normalization are independent authorized foundations.

## Observed implementation constraints (read-only inspection)

packages/runtime/src/index-command.ts selects Java descriptor metadata and sends state.files to the v3 bootstrap. native-full-bootstrap.ts validates one trusted revision and exact complete source_files count before observing or sealing. crates/native-analyzer/src/analyze.rs::parse_source rejects a non-Java languageHint/path. R010 and Provider state validators are Java-shaped. Enabling.py classification globally or filtering the request files in place therefore cannot constitute a safe mixed implementation: either the Java parser rejects Python, or complete-inventory/correspondence checks cease to match. These are preserved checks, not obsolete tests.

ADR-016 already allows explicitly selected v1/v2 full analysis without compatible summaries, retaining the old graph and reporting summary unavailability. ADR-020 requires co-validating the complete candidate Code basis and syntax rather than activating Python alone. The exact composition joining those mechanisms was not specified in the original P1-04/05 task details and needs a reviewed compatibility amendment before the affected implementation.

## Recommended option: separate explicit mixed candidate composition

1. Capture one authorized immutable complete Source inventory and expected old Code activation token under the normal Application workflow. Derive declared Java/Python projections from that inventory without claiming either projection is a complete repository snapshot. Filtering is a data preparation step here, not a relaxation of the existing v3 guard.
2. For the Java projection use the existing explicitly selected full Provider protocol v1/v2 into a provisional stage, authenticated against that projection and the complete captured basis. Do not invoke v3 full bootstrap with a subset or forge a Java R010 header for Python. Select one request/snapshot identity for the complete Native candidate where required by FactMerger.
3. Normalize Java candidate facts with the proven Java normalizer and build exact Java owner mappings from that provisional candidate. Apply the explicit owner-basis amendment below before using provisional owners; the existing P1-03 request does not already prove such a binding. Observe the Syntax v4 changed Java/Python projection; Python raw Code owners are normalized before syntax binding. Native remains provider-owned, with old strict wire schemas and snapshots intact.
4. Application verifies that union coverage/facts/support belongs to the complete captured Source inventory; no omitted eligible language or missing critical file is silently successful. Re-run FactMerger over retained plus changed supports, compute the candidate Code basis, bind every syntax owner/support against that complete candidate, then re-check current source/old activation before one Code+Syntax Store commit in P1-05. Cross-provider references and snapshots must obey existing lifetime rules; source/provider deletion cannot erase surviving support.
5. The mixed path does not fabricate usable Java-derived summaries. Preserve old records/evidence for diagnosis but report INCOMPATIBLE/NOT_AVAILABLE as the applicable current result, as allowed by ADR-016. Restoring incremental Java summary availability requires explicit compatible bootstrap through a reviewed path; no automatic full reparse or profile reuse. User-visible status must distinguish committed Code/Syntax, runtime freshness and summary compatibility.
6. Only enable the Python classifier/policy context when the explicit mixed composition and capability/profile gates are available. Prove all-Java existing behavior and encoding unchanged; Python-containing inventory fingerprints change honestly. Keep old v3 schemas/count/owner/correspondence guards and all released SQL immutable.

New exact-current memory evidence must cover the actual complete composition, not merely the raw v4 decoder or an old Java purpose. Its review must identify retained stages, Node/native allocations, SQL charges, exact build/environment/corpus/layout and independent holdout. This proposal approves no purpose-entry shape, measurement run, scalar reservation or new threshold. Qualification design, execution authorization and concrete numeric approval remain separate gates. A profile-less actual route refuses before lazy preparation/spawn.

## Accepted owner-basis amendment (implementation tracked separately)

The current v4 request has one RepoBasis but provisional Java owners and final combined Java/Python activation are different states. They must not be labeled as one current Code basis. Refine the as-yet-unpublished v4 contract under an accepted ADR-020 amendment before a real producer/client implementation:

- expectedActivationBasis is the authentic pre-observation active Code basis and Source revision/fingerprint used for concurrency refusal.
- ownerBinding distinguishes ACTIVE_CODE from PROVISIONAL_CODE and binds the exact provided owner map to an authorized frozen stage digest and source fingerprints. No database path, shell or raw stage access goes to Native. Native echoes this binding in start/terminal records; TypeScript authenticates the map and digest, rather than trusting a caller's scalar token.
- finalCandidateCodeBasis is computed only after Java/Python normalization and complete FactMerger validation; it is not guessed before Python facts exist. Canonical SyntaxEvidence support is created against this verified candidate inside the P1-05 validated workflow, retaining the original observation/owner-binding provenance. Store compares expected old activation, verifies the complete candidate and atomically activates both. A scalar re-label or an independently committed Java/Python half is forbidden.

Exact byte encoding and strict ACTIVE_CODE/PROVISIONAL_CODE fields must be pinned in a revised shared Fixture/schema packet before code; P1-03's current corpus remains historical evidence and no published v1/v2/v3 schema changes. Tests must refuse an owner digest from another stage/file/revision, a provisional owner claimed as active, a concurrent old-basis change, and a final candidate differing from the supported observation. Without this amendment, retain the active-Code-only Java owner route and do not execute the recommended mixed bootstrap.

## Alternatives

- Reuse existing Java v3 bootstrap with a filtered inventory: rejected because it contradicts the current complete-inventory/correspondence contract unless a separately versioned projection-state design is added.
- Put Python facts into Java v3 summaries: rejected because it silently changes strict Provider/summary language and compatibility semantics.
- Keep Python classification disabled and ship only Java Syntax initially: safe temporary limitation, but not P1-04 completion or FastAPI readiness. It avoids mixed writes while the recommended composition is reviewed.

## Acceptance and rollback

Retain P1-04 and P1-05 completion gates. Add independent mixed cases: fresh mixed repository; Java-only unchanged case; Python-only update preserving Java supports; Java-only update preserving Python supports; provider removal with surviving other support; failed/cancelled parse/normalization/seal/apply; same WORKTREE ID/fingerprint with changed support; concurrent source change; restart; missing current profile before preparation; explicit summary incompatibility; no partial success or capability advertisement. Both tasks remain open until their actual/joint evidence exists.

Rollback disables the new mixed capability, preserves last-good facts and honest freshness/summary state, and retains all failed evidence. Do not downgrade a database, forge ownership, restore the R4 mutable DB or alter old migration/checksum/profile records. If a concrete Store constraint makes this option impossible, stop that dependency chain and submit its exact governed amendment rather than bypassing validation.

## Decision requested

Accept this direction for the P1-04/05 compatibility detail, or retain Java-only Syntax temporarily while mixed behavior remains unimplemented. This decision does not authorize dependency versions beyond the already approved Python grammar, profile/calibration/numbers, cloud operations or dropping any phase gate. Implementation packet must retain exact projection and combined-candidate oracles; no automatic fallback between these modes.
