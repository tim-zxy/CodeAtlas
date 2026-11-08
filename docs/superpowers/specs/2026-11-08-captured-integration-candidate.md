# Captured contract bindings and deterministic Integration candidates

Status: user-approved bounded offline implementation, 2026-11-08.

Existing knowledge-and-consumption section4 requires deterministic Integration
candidates from contracts/boundaries. The approved capture amendment preserves
actual FrozenServiceCatalog contractBindings rather than inferring ownership
from repository membership or nullable Contract.serviceRef.

WorkspaceCapture gains optional contractBindings: {schemaVersion:1,bindings},
where each binding is the existing exact {contractRef,serviceRef,supportRefs}.
Absent remains absent in legacy serialization and hashes. Present must be strictly
validated, sorted by exact contract reference, unique, within the captured basis
and complete entity/support closure. The extension participates in inputDigest.
Selection retains required contracts, services and supports; missing or conflicting
inputs refuse. Runtime copies the actual frozen registrations from its owned
workspace view; no self-reported mapping or new binding ID is introduced.

The private Application generator consumes a validated snapshot and an explicit
matched boundary. It requires unambiguous consumer/provider registrations and
distinct SERVICE participants, preserves exact revisions and support references,
and returns only a schema-validated CANDIDATE with honest coverage/limitations.
Candidate labels are not stable Knowledge IDs. No model, identity inheritance,
permission/scan clearance, database mutation or publication. Legacy snapshots
remain readable but cannot generate this candidate without the binding evidence.
Unknown/nonmatched/conflicting/missing refs and exhausted or cancelled control
refuse; no successful prefix or repaired inputs are returned.

No public API, production migration, W011 or qualification/profile change.
Rollback disables the private generator/new producer extension; preserve old
inputs and history. Old binaries may reject extended strict inputs, so keep
producer/consumer versions together rather than downgrade or strip evidence.

## Captured candidate to conservative reconciliation

Existing approved P1-13 expects {candidateEnvelope,referenceContext,stateBinding}.
The private generator exposes the exact validated candidate and already-derived
reference context in that shape; it never accepts a caller-replacement context.
StateBinding remains null: the capture registry has no Claim state records, and
MATCHED is contract resolution, not CURRENT semantic state. The unchanged Knowledge
planner must yield REVIEW_REQUIRED/STATE_EVIDENCE_MISSING, no allocated ID or
new revision intent. This connects the actual snapshot-generated candidate to
the existing review plan, not publication, state issuance or identity acceptance.
The existing authorization/quality/publication limitations remain attached.

## Approved same-invocation TEST_DOUBLE state composition

User approved a private offline composition using only self-owned data. Own the
snapshot/options/control before awaits; derive one fixed CLAIM_EXTRACTION request
and run the actual existing TEST_DOUBLE boundary once. Never accept a supplied
Claim envelope/result as proof that this invocation completed. Bind Integration
capturedInputDigest to the request snapshot digest, completed inputDigest to the
canonical authorized-context digest, and outputDigest to actual validated output.
These digests have different meanings. Same snapshot ID is insufficient.

Return the same validated candidate/referenceContext and existing stateBinding
with the actual generated Claim. Keep TEST_DOUBLE/NOT_VERIFIED/NOT_EVALUABLE,
NOT_ESTABLISHED and NOT_ATTEMPTED. Existing Reconciliation alone determines
missing/conflicting/unrelated-state review; malformed/incorrect-digest output
refuses and UNKNOWN cleanup never becomes SETTLED. No automatic retry or second
model call. This may produce a NEW planning intent, never an allocated stable ID,
verified fact or publication. Existing null-state entry remains available.

No Claim input-registry extension, production producer/authority/selection rule,
user data, real model or publication. Rollback disables only this private entry,
retaining original snapshots/history and the previous missing-state review path.
