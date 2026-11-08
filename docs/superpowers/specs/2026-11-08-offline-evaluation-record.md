# Bounded Evaluation record

Status: user approved minimal record refinement/implementation using self-owned temporary databases. Not W011 installation or production publication authority. This implements the bounded first batch described by the existing W011 decision packet, not its unresolved production quality contract.

Private interfaces: Application evaluateCandidateRecord(input,control), IR deriveOfflineEvaluationRecord/parseOfflineEvaluationRecord, Storage initializeOfflineEvaluationRecords and OfflineEvaluationRecordStore.put/read. No public index export.

Input is exactly evaluationId/runId/snapshot/candidates. Genuine captured snapshot is strictly validated. Nonempty candidate set uses existing KnowledgeCandidate schema plus actual snapshot entity/support context including captured support entities and documents. Duplicate IDs, wrong snapshot reference, differing scope and extra caller PASS fields refuse. This rule validates structural consistency, not semantic truth, completeness or actual model performance.

Record closed shape: schemaVersion=1; evaluationId; workspaceId; runId; snapshotId; revisionSetId; inputDigest; snapshotDigest; candidateDigest; ruleRef=offline-candidate-structure-v1; executionKind=PURE_CONTRACT; structuralResult=VALID; quality=NOT_EVALUABLE; publication=NOT_AUTHORIZED. No thresholds, scores or caller-chosen statuses. Rule version identifies implemented structural checks only, not an approved production quality baseline.

Digest is SHA256(domain + NUL + existing canonicalCompilationJson(value)). Domains are codeatlas.offline-evaluation.snapshot.v1 and codeatlas.offline-evaluation.candidates.v1. Snapshot digest covers full parsed snapshot including identity/window/policy fields; inputDigest keeps its original semantic meaning. Candidate digest covers complete parsed candidates sorted by unique candidate ID. No canonical knowledge IDs are allocated. Parser recomputes the entire expected record and compares exact canonical bytes.

Storage experiment uses a separate explicitly initialized test-owned record DB so original exact W009/W010 snapshot schema/manifest stays unchanged. This is not the proposed production evaluation_runs table, a production layout decision, migration or cross-database atomicity guarantee. put/read require genuine CompilationInputStore and exact original run key, reread its fully validated immutable snapshot, then recompute bindings from actual snapshot and candidates. Labels/DTOs/record rows do not grant permission.

Record DB has one STRICT table and three immutable/duplicate guards. Schema recognition is exact and budgeted. No replacement/upsert/automatic retry. Record identity and workspace/run/snapshot headers match full payload on read. Independent DB snapshots are explicit: record schema/preflight/delivery share one read transaction; write schema checks occur under BEGIN IMMEDIATE. Existing snapshot Store owns its separate read transaction. No user DB or production writer is wired.

Key/candidate/record inputs are copied before callbacks, controls/limits fixed. Failed writes block subsequent writes on that Store. COMMIT acknowledgement loss reports COMMIT_OUTCOME_UNKNOWN with separate cleanup state. Read-only full verification may prove the original row exists; it never resumes a write or makes absence proof of noncommit. No publicationEffect is inferred. Disable this experimental route to roll back functionality and preserve records; no downgrade/deletion/restore.

Verification and remaining limitations: plan and CURRENT_STATUS. Production Evaluation producer/admission, actual model quality, W011/publication, user migrations, real scanning and Native/R9 stay separately gated.
