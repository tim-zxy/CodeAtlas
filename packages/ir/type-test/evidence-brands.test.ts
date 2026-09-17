import {
  CanonicalFactRefSchema,
  CanonicalIdSchema,
  EntityIdSchema,
  EvidenceIdSchema,
  FactEvidenceSchema,
  ProviderFactBindingSchema,
  ProviderFactIdSchema,
  ProviderFactRefSchema,
  ProviderIdSchema,
  type CanonicalFactRef,
  type CanonicalId,
  type EntityId,
  type EvidenceId,
  type FactEvidence,
  type ProviderFactBinding,
  type ProviderFactId,
  type ProviderFactRef,
} from '../src/index.js';

const evidenceId: EvidenceId = EvidenceIdSchema.parse('evidence:one');
const entityId: EntityId = EntityIdSchema.parse('entity:one');
const providerSnapshotId: EntityId = EntityIdSchema.parse('entity:snapshot-one');
const providerFactId: ProviderFactId = ProviderFactIdSchema.parse('provider-fact:one');
const canonicalId: CanonicalId = CanonicalIdSchema.parse('canonical:one');
ProviderIdSchema.parse('provider:one');
const providerFactRef: ProviderFactRef = ProviderFactRefSchema.parse({
  factType: 'NODE',
  providerId: 'provider:one',
  providerFactId: 'provider-fact:one',
});
const canonicalFactRef: CanonicalFactRef = CanonicalFactRefSchema.parse({
  factType: 'NODE',
  id: 'canonical:one',
});
const factEvidence: FactEvidence = FactEvidenceSchema.parse({
  fact: canonicalFactRef,
  evidenceId,
});
const providerFactBinding: ProviderFactBinding = ProviderFactBindingSchema.parse({
  providerFact: providerFactRef,
  providerSnapshotId,
  canonicalFact: canonicalFactRef,
  evidenceId,
});

// @ts-expect-error EvidenceId is not EntityId
const mistakenEntity: EntityId = evidenceId;
// @ts-expect-error EntityId is not EvidenceId
const mistakenEvidence: EvidenceId = entityId;
// @ts-expect-error ProviderFactId is not EvidenceId
const mistakenProviderEvidence: EvidenceId = providerFactId;
// @ts-expect-error CanonicalId is not EvidenceId
const mistakenCanonicalEvidence: EvidenceId = canonicalId;
const factEvidenceInputWithProvider = { fact: providerFactRef, evidenceId };
const bindingInputWithCanonicalProvider = {
  providerFact: canonicalFactRef,
  providerSnapshotId,
  canonicalFact: canonicalFactRef,
  evidenceId,
};
const bindingInputWithProviderCanonical = {
  providerFact: providerFactRef,
  providerSnapshotId,
  canonicalFact: providerFactRef,
  evidenceId,
};
// @ts-expect-error ProviderFactRef cannot populate FactEvidence.fact
const factEvidenceWithProvider: FactEvidence = factEvidenceInputWithProvider;
// @ts-expect-error CanonicalFactRef cannot populate ProviderFactBinding.providerFact
const bindingWithCanonicalProvider: ProviderFactBinding = bindingInputWithCanonicalProvider;
// @ts-expect-error ProviderFactRef cannot populate ProviderFactBinding.canonicalFact
const bindingWithProviderCanonical: ProviderFactBinding = bindingInputWithProviderCanonical;

void [
  factEvidence,
  providerFactBinding,
  mistakenEntity,
  mistakenEvidence,
  mistakenProviderEvidence,
  mistakenCanonicalEvidence,
  factEvidenceWithProvider,
  bindingWithCanonicalProvider,
  bindingWithProviderCanonical,
];
