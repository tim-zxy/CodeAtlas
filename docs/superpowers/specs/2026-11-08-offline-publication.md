# Approved bounded publication experiment

Status: user approved detailed publication-set, opaque-ID, idempotency and recovery rules only for self-owned temporary SQLite implementation/verification. Not W011 installation, production publication, quality admission or user-database access. Existing knowledge-consumption sections3/5/7 and conservative Reconciliation remain controlling.

## Preparation and complete set

Private Application OfflinePublicationPreparer fixes lookup/readState adapters and an issuer whose mint closure remains private. It owns inputs/control, computes stable logical input identity and queries the original attempt BEFORE head reads, Reconciliation, review or ID allocation. Existing COMMITTED/COMMIT_OUTCOME_UNKNOWN/NOT_COMMITTED results are inspection-only; only ABSENT permits new preparation. Absence here means no visible registered attempt, never proof that an old writer cannot commit. Storage repeats uniqueness checks under its write lock.

prepareOfflinePublication revalidates complete actual current-head records/state digest. It runs existing reconcileKnowledge against that complete comparison set. Every Evaluation candidate has exactly one subject and one NEW/UPDATE entry. Missing/extra/duplicate candidates, unchanged/no-op, MERGE/SPLIT/conflict/deprecation and intra-set reference rewriting are refused in this first slice. No new identity-inheritance algorithm.

NEW and UPDATE still require review. Explicit TEST_REVIEW_NOT_AUTHORITY.review receives the frozen actual plan and digest; only APPROVED for that digest continues this experiment. This is a test decision, not real human approval or production authority. Existing identity policy/fingerprintKnowledgeComparison supplies retained IDs, previous revisions and both fingerprints. Synthetic state Claims are fixture evidence, not Source or actual-model truth. IR restricts their reference context and Claims to the actual snapshot closure.

Application creates random opaque UUID item+revision IDs for NEW; UPDATE keeps the exact reconciled item and old head and allocates only a new revision ID. Current experimental Item/Revision envelopes use existing strict IR schemas. Nonfresh AFFECTED metadata and CURRENT workflow metadata are experimental values, not live Source/production readiness proof. No production knowledge ID or canonical record is created.

## Fixed command and origin

Closed types are in packages/ir/src/offline-publication-contract.ts. Request fields are workspaceId/runId, subject{issuerNamespace,subjectId}, requestKey, complete snapshot/candidates/Evaluation/subjects, priorStateDigest, planDigest and fixed reviewKind. Subject strings correlate requests; they grant no access. Entries bind candidateId, NEW/UPDATE, expectedHead and full existing Item/Revision/reference/state/fingerprint-policy record. Header/payload membership, provenance refs and snapshot/candidate Evaluation binding are revalidated.

Digests use SHA256(domain + NUL + canonicalCompilationJson(value)). State domain codeatlas.offline-publication.state.v1 binds workspace plus all sorted current-head records. Plan domain codeatlas.offline-publication.plan.v1 binds the actual existing Reconciliation plan. Logical request domain codeatlas.offline-publication.request.v1 excludes priorStateDigest/planDigest and generated IDs/time, but includes canonical sorted candidates/subjects, full snapshot and Evaluation. Changed state evidence is changed input. Command domain codeatlas.offline-publication.command.v1 binds the entire request plus allocated entries.

Shared IR opaque continuations bind the complete copied/frozen command to the fixed Application issuer identity. Store holds that identity in a true private field and accepts only its issued handle, never a caller-rewritten naked command or another issuer's handle. Identity binds origin only, not permission or quality. Mint capability is not exposed by the Preparer. No persisted or restart-restored handle is accepted.

## SQLite experiment and recovery

A separate explicitly initialized owned DB contains offline_attempts, offline_revisions, offline_receipts and offline_heads. These are not W009/W010/W011 production tables or a production layout decision. Exact budgeted schema recognition and FK=ON are mandatory; unknown/nonempty initialization targets and caller transactions refuse. No production manifest or public export changes. Full revision payload retains content/support relations; production relation projection, real Evaluation FKs and FTS remain unimplemented.

A first BEGIN IMMEDIATE registers immutable attempt command/ID mapping, unique by workspace + subject + request key. The acknowledged attempt has a process-local opaque execution owner. Existing identical committed request returns original receipt/IDs; changed logical input refuses. Existing pending attempts cannot be resurrected by a new Store.

Publication takes a second BEGIN IMMEDIATE, rechecks exact schema and full old-state digest, validates NEW absence/UPDATE exact previous head and stable type/scope. It inserts ALL revisions and a complete-set receipt, then performs all final head inserts/CAS updates in that same transaction. Receipt/provenance references are retained through the immutable attempt. Head guards require the receipt. Nothing is externally visible until whole commit. No partial success or per-item publication.

Known receipt reports kind OWNED_TEST_PUBLICATION, original attempt/workspace/request/command digests and complete heads, quality NOT_EVALUABLE and productionPublication NOT_AUTHORIZED. PUBLISHED in experimental Item/Revision envelopes denotes only this mechanical test; it never enters production query/Wiki or satisfies quality gates.

COMMIT acknowledgement loss returns COMMIT_OUTCOME_UNKNOWN with independent cleanupState and blocks later execution. Actual acknowledged publication stays COMMITTED even if subsequent connection settlement is UNKNOWN; preserve receipt and block writes. Inspect can prove COMMITTED only after full original command, receipt and revision-set comparison. NOT_COMMITTED requires the original known owner to have failed and settled rollback, plus absence of the publication receipt. New owner or visible absence alone remains UNKNOWN. No automatic replan, rewrite, resume or retry-to-green.

Compatibility/rollback: preserve original manifests, schemas, snapshots, records and failure evidence; disable the private experiment to stop new work. No history deletion, schema downgrade or automatic backup restore. Production authorization/scan/Source/model quality, W011/provenance/FTS, user migrations and Native/R9 remain separate.
