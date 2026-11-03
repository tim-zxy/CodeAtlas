import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SourceFileSchema } from './source-file.js';
import { FrozenContractSetSchema, parseFrozenContractSet } from './contract-ir.js';
import { canonicalRuntimeJson, workspaceServiceCatalogDigest } from './runtime-identity.js';
import {
  SupportRefSchema,
  Phase1ExactStringSchema,
  phase1Assert,
  ensurePhase1Data,
  supportKey,
  scopedRefKey,
  basisKey,
  type SupportRef,
  type ScopedRef,
  type Phase1ReferenceContext,
} from './phase1-support.js';
export const DeclaredHttpResponseSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ABSENT') }),
  z.strictObject({ kind: z.literal('JSON_STRING'), mediaType: z.literal('application/json') }),
]);
const absent = z.strictObject({ kind: z.literal('ABSENT') });
export const DeclaredHttpSchemaDocumentSchema = z.strictObject({
  schema: z.literal('codeatlas.declared-http-schema'),
  version: z.literal(1),
  bindings: z
    .array(
      z.strictObject({
        contractFactKey: Phase1ExactStringSchema,
        query: absent,
        request: absent,
        response: DeclaredHttpResponseSchema,
      }),
    )
    .min(1),
});
export const SourceSchemaDocumentSchema = z.strictObject({
  sourceFile: SourceFileSchema,
  sourceSupport: SupportRefSchema,
  contentUtf8: z
    .string()
    .min(1)
    .refine((s) => s.isWellFormed()),
});
export type SourceSchemaDocument = z.infer<typeof SourceSchemaDocumentSchema>;
export const FrozenContractSetV2Schema = FrozenContractSetSchema.extend({
  matchingPolicyVersion: z.literal('declared-http-schema-v1'),
  schemaDocuments: z.array(SourceSchemaDocumentSchema),
});
export type FrozenContractSetV2 = z.infer<typeof FrozenContractSetV2Schema>;
export type DeclaredSchemaLimits = { maxInputBytes: number; maxItems: number; maxDepth: number };
export type DerivedHttpSchemaDeclaration = {
  contractRef: ScopedRef;
  query: { kind: 'ABSENT' };
  request: { kind: 'ABSENT' };
  response: z.infer<typeof DeclaredHttpResponseSchema>;
  sourceSupport: SupportRef;
};
const hash = (domain: string, tuple: unknown[]) =>
  createHash('sha256')
    .update(domain + '\0' + JSON.stringify(tuple))
    .digest('hex');
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function workspaceRuntimeInputDigestV2(set: FrozenContractSetV2): string {
  return hash('workspace-runtime-input-v2', [
    set.workspaceBasis.workspaceId,
    set.workspaceBasis.revisionSetId,
    [...set.repositoryBindings].sort((a, b) =>
      cmp(a.repoBasis.repositoryId, b.repoBasis.repositoryId),
    ),
    workspaceServiceCatalogDigest(set),
    set.matchingPolicyVersion,
    [...set.schemaDocuments]
      .sort((a, b) => cmp(supportKey(a.sourceSupport), supportKey(b.sourceSupport)))
      .map(canonicalRuntimeJson),
  ]);
}
function counter(limits: DeclaredSchemaLimits) {
  phase1Assert(
    Number.isSafeInteger(limits.maxInputBytes) &&
      limits.maxInputBytes > 0 &&
      Number.isSafeInteger(limits.maxItems) &&
      limits.maxItems > 0 &&
      Number.isSafeInteger(limits.maxDepth) &&
      limits.maxDepth >= 0,
  );
  let items = 0,
    inputBytes = 0;
  const item = (v: unknown, depth = 0): void => {
    phase1Assert(depth <= limits.maxDepth && ++items <= limits.maxItems);
    if (v !== null && typeof v === 'object')
      for (const child of Object.values(v)) item(child, depth + 1);
  };
  return {
    item,
    bytes(n: number) {
      phase1Assert(n <= limits.maxInputBytes - inputBytes);
      inputBytes += n;
    },
    receipt: () => ({ items, inputBytes }),
  };
}
export function decodeDeclaredHttpSchemaDocuments(
  documents: readonly SourceSchemaDocument[],
  contracts: FrozenContractSetV2['contractRefs'],
  context: Phase1ReferenceContext,
  limits: DeclaredSchemaLimits,
) {
  ensurePhase1Data(documents);
  const meter = counter(limits),
    declarations: DerivedHttpSchemaDeclaration[] = [],
    sources = new Set<string>(),
    attached = new Set<string>();
  const checked = documents.map((d) => SourceSchemaDocumentSchema.parse(d));
  for (const d of checked) meter.bytes(Buffer.byteLength(d.contentUtf8));
  const available = new Map(context.availableSupports.map((s) => [supportKey(s), s]));
  meter.item(context.availableSupports);
  const byKey = new Map<string, typeof contracts>();
  for (const c of contracts) {
    meter.item(c.ref);
    const key = JSON.stringify([c.contract.repositoryId, c.contract.factKey]);
    const found = byKey.get(key) ?? [];
    found.push(c);
    byKey.set(key, found);
  }
  for (const d of checked) {
    const f = d.sourceFile,
      s = d.sourceSupport;
    meter.item(d);
    const key = JSON.stringify([basisKey(s.basis), s.entity.kind, s.entity.id]);
    phase1Assert(!sources.has(key));
    sources.add(key);
    phase1Assert(
      'repositoryId' in s.basis &&
        f.repositoryId === s.basis.repositoryId &&
        f.revisionId === s.basis.revisionId &&
        s.entity.kind === 'SOURCE_FILE' &&
        s.entity.id === f.id &&
        s.entity.revisionId === f.revisionId &&
        available.has(supportKey(s)),
    );
    phase1Assert(
      f.classification.role === 'OTHER' &&
        f.classification.provenance === 'AUTHORED' &&
        f.classification.contentKind === 'TEXT' &&
        f.languageHint === null,
    );
    phase1Assert(
      f.contentFingerprint ===
        'sha256:' + createHash('sha256').update(d.contentUtf8).digest('hex') &&
        s.valueDigest ===
          createHash('sha256')
            .update('codeatlas-phase1-support-value-v1\0' + canonicalRuntimeJson(f))
            .digest('hex'),
    );
    const parsed = JSON.parse(d.contentUtf8) as unknown;
    meter.item(parsed);
    const doc = DeclaredHttpSchemaDocumentSchema.parse(parsed);
    for (const b of doc.bindings) {
      const matches = byKey.get(JSON.stringify([f.repositoryId, b.contractFactKey])) ?? [];
      phase1Assert(matches.length === 1);
      const row = matches[0]!,
        sig = row.contract.signature;
      phase1Assert(
        sig.kind === 'HTTP' &&
          sig.querySchemaRef === null &&
          sig.requestSchemaRef === null &&
          sig.responseSchemaRef === null,
      );
      const k = scopedRefKey(row.ref);
      phase1Assert(!attached.has(k));
      attached.add(k);
      const declaration = {
        contractRef: row.ref,
        query: b.query,
        request: b.request,
        response: b.response,
        sourceSupport: s,
      };
      meter.item(declaration);
      declarations.push(declaration);
    }
  }
  declarations.sort((a, b) => cmp(scopedRefKey(a.contractRef), scopedRefKey(b.contractRef)));
  return { declarations, consumed: meter.receipt() };
}
export function parseFrozenContractSetV2(
  input: unknown,
  context: Phase1ReferenceContext,
  limits: DeclaredSchemaLimits,
) {
  ensurePhase1Data(input);
  const set = FrozenContractSetV2Schema.parse(input);
  const { matchingPolicyVersion: _policy, schemaDocuments: _documents, ...base } = set;
  parseFrozenContractSet(base, context);
  for (const d of set.schemaDocuments) {
    const b = set.repositoryBindings.find(
      (b) => b.repoBasis.repositoryId === d.sourceFile.repositoryId,
    );
    phase1Assert(b && basisKey(b.repoBasis) === basisKey(d.sourceSupport.basis));
  }
  const decoded = decodeDeclaredHttpSchemaDocuments(
    set.schemaDocuments,
    set.contractRefs,
    context,
    limits,
  );
  phase1Assert(workspaceRuntimeInputDigestV2(set) === set.workspaceBasis.workspaceActivationDigest);
  return { set, ...decoded };
}
