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
