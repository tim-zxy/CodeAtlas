import { z } from 'zod';
import {
  RepoBasisSchema,
  SourceFileSchema,
  EntityIdSchema,
  ScopedRefSchema,
  ProviderNodeRefSchema,
  ProviderIdSchema,
  IrValidationError,
  ensurePhase1Data,
  parseIr,
} from '@codeatlas/ir';
import { digestIdentityTuple } from './identity-tuple.js';
const digest = z.string().regex(/^[0-9a-f]{64}$/);
export const SyntaxTargetSourceSchema = RepoBasisSchema.omit({ codeActivationDigest: true });
export const SyntaxOwnerSchema = z.strictObject({
  sourceFileId: EntityIdSchema,
  providerNodeRef: ProviderNodeRefSchema,
  canonicalRef: ScopedRefSchema,
});
const active = { kind: z.literal('ACTIVE_CODE'), codeActivationDigest: digest };
const provisional = { kind: z.literal('PROVISIONAL_CODE'), stageDigest: digest };
export const SyntaxOwnerBindingIdentitySchema = z.discriminatedUnion('kind', [
  z.strictObject(active),
  z.strictObject(provisional),
]);
export const SyntaxOwnerBindingSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...active, ownerMapDigest: digest }),
  z.strictObject({ ...provisional, ownerMapDigest: digest }),
]);
export const SyntaxOwnerMapInputSchema = z.strictObject({
  expectedActivationBasis: RepoBasisSchema.nullable(),
  targetSource: SyntaxTargetSourceSchema,
  ownerBinding: SyntaxOwnerBindingIdentitySchema,
  providerId: ProviderIdSchema,
  providerSnapshotId: EntityIdSchema,
  sourceFiles: z.array(SourceFileSchema),
  owners: z.array(SyntaxOwnerSchema),
});
export type SyntaxOwnerMapInput = z.infer<typeof SyntaxOwnerMapInputSchema>;
/** Structural digest only. Application must supply an authenticated captured context. */
export function computeSyntaxOwnerMapDigest(value: unknown): string {
  ensurePhase1Data(value);
  const p = parseIr(SyntaxOwnerMapInputSchema, value),
    b = p.expectedActivationBasis,
    t = p.targetSource,
    o = p.ownerBinding;
  const fields: (string | number)[] = [
    t.repositoryId,
    t.revisionId,
    t.contentFingerprint,
    b ? 'ACTIVE' : 'NONE',
  ];
  if (b) fields.push(b.repositoryId, b.revisionId, b.contentFingerprint, b.codeActivationDigest);
  fields.push(
    o.kind,
    o.kind === 'ACTIVE_CODE' ? o.codeActivationDigest : o.stageDigest,
    p.providerId,
    p.providerSnapshotId,
  );
  const compare = (a: string, b: string) =>
    Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  const files = [...p.sourceFiles].sort((a, b) => compare(a.id, b.id));
  fields.push(files.length);
  for (const f of files)
    fields.push(
      f.id,
      f.path,
      f.contentFingerprint,
      f.languageHint ?? '',
      f.classification.role,
      f.classification.provenance,
      f.classification.contentKind,
      f.sensitivity,
    );
  const owners = [...p.owners].sort(
    (a, b) =>
      compare(a.sourceFileId, b.sourceFileId) ||
      compare(a.providerNodeRef.providerId, b.providerNodeRef.providerId) ||
      compare(a.providerNodeRef.providerFactId, b.providerNodeRef.providerFactId),
  );
  fields.push(owners.length);
  for (const x of owners) {
    if (x.canonicalRef.scope !== 'REPOSITORY')
      throw new IrValidationError([{ path: [], message: 'Invalid syntax owner scope' }]);
    fields.push(
      x.sourceFileId,
      x.providerNodeRef.providerId,
      x.providerNodeRef.providerFactId,
      x.canonicalRef.repositoryId,
      x.canonicalRef.entity.kind,
      x.canonicalRef.entity.id,
      x.canonicalRef.entity.revisionId ?? '',
    );
  }
  return digestIdentityTuple('codeatlas-native-syntax-owner-map-v1', fields).split(':')[1]!;
}
