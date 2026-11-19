import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SourceRangeSchema } from './references.js';
import { ContentFingerprintSchema, RepositoryRelativePathSchema } from './source-identity.js';
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
// Exact wire representations; an absent key is explicit and never inferred from a Java type.
const kafkaValue = z.strictObject({ type: z.literal('string'), encoding: z.literal('utf-8') });
const kafkaBinding = z.strictObject({
  selector: z.strictObject({
    path: RepositoryRelativePathSchema,
    contentFingerprint: ContentFingerprintSchema,
    range: z.strictObject({
      startLine: SourceRangeSchema.shape.startLine,
      startColumn: SourceRangeSchema.shape.startColumn,
      endLine: SourceRangeSchema.shape.endLine,
      endColumn: SourceRangeSchema.shape.endColumn,
    }),
  }),
  role: z.enum(['PRODUCER', 'CONSUMER']),
  channel: Phase1ExactStringSchema,
  namespace: Phase1ExactStringSchema,
  payload: kafkaValue,
  key: z.union([kafkaValue, absent]),
});
const kafkaDocument = z.strictObject({
  schema: z.literal('codeatlas.declared-kafka-schema'),
  version: z.literal(1),
  bindings: z.array(kafkaBinding).min(1),
});
type KafkaAttachment = z.infer<typeof kafkaBinding> & {
  callSiteSupport: SupportRef;
  contractRef: ScopedRef;
  sourceSupport: SupportRef;
};
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
  matchingPolicyVersion: z.enum(['declared-http-schema-v1', 'declared-kafka-schema-v1']),
  schemaDocuments: z.array(SourceSchemaDocumentSchema),
  kafkaSourceFiles: z
    .array(SourceSchemaDocumentSchema.pick({ sourceFile: true, sourceSupport: true }))
    .optional(),
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
    ...(set.kafkaSourceFiles === undefined
      ? []
      : [
          [...set.kafkaSourceFiles]
            .sort((a, b) => cmp(supportKey(a.sourceSupport), supportKey(b.sourceSupport)))
            .map(canonicalRuntimeJson),
        ]),
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
  const { declarations, consumed } = decodeSchemaDocuments(
    documents,
    contracts,
    context,
    limits,
    'declared-http-schema-v1',
  );
  return { declarations, consumed };
}
function decodeSchemaDocuments(
  documents: readonly SourceSchemaDocument[],
  contracts: FrozenContractSetV2['contractRefs'],
  context: Phase1ReferenceContext,
  limits: DeclaredSchemaLimits,
  policy: FrozenContractSetV2['matchingPolicyVersion'],
  kafkaSourceFiles: NonNullable<FrozenContractSetV2['kafkaSourceFiles']> = [],
) {
  ensurePhase1Data(documents);
  const meter = counter(limits),
    declarations: DerivedHttpSchemaDeclaration[] = [],
    kafkaDeclarations: KafkaAttachment[] = [],
    sources = new Set<string>(),
    attached = new Set<string>();
  const checked = documents.map((d) => SourceSchemaDocumentSchema.parse(d));
  for (const d of checked) meter.bytes(Buffer.byteLength(d.contentUtf8));
  const available = new Map(context.availableSupports.map((s) => [supportKey(s), s]));
  meter.item(context.availableSupports);
  const byKey = new Map<string, typeof contracts>();
  // Coordinates select a product-observed contract only via an authenticated
  // source value in the same repository activation. A fact key may change
  // when only the declaration changes.
  const filesById = new Map<string, (typeof kafkaSourceFiles)[number]>();
  const paths = new Set<string>();
  for (const { sourceFile: f, sourceSupport: s } of kafkaSourceFiles) {
    meter.bytes(Buffer.byteLength(canonicalRuntimeJson({ sourceFile: f, sourceSupport: s })));
    meter.item(f);
    meter.item(s);
    phase1Assert(
      'repositoryId' in s.basis &&
        f.repositoryId === s.basis.repositoryId &&
        f.revisionId === s.basis.revisionId &&
        s.entity.kind === 'SOURCE_FILE' &&
        s.entity.id === f.id &&
        s.entity.revisionId === f.revisionId &&
        available.has(supportKey(s)) &&
        s.valueDigest ===
          createHash('sha256')
            .update('codeatlas-phase1-support-value-v1\0' + canonicalRuntimeJson(f))
            .digest('hex'),
    );
    const id = JSON.stringify([basisKey(s.basis), f.id]);
    const path = JSON.stringify([basisKey(s.basis), f.path]);
    phase1Assert(!filesById.has(id) && !paths.has(path));
    filesById.set(id, { sourceFile: f, sourceSupport: s });
    paths.add(path);
  }
  const bySite = new Map<
    string,
    { row: (typeof contracts)[number]; callSiteSupport: SupportRef }[]
  >();
  function siteKey(
    basis: string,
    path: string,
    fingerprint: string,
    role: string,
    r: { startLine: number; startColumn: number; endLine: number; endColumn: number },
  ) {
    return JSON.stringify([
      basis,
      path,
      fingerprint,
      role,
      r.startLine,
      r.startColumn,
      r.endLine,
      r.endColumn,
    ]);
  }
  for (const c of contracts) {
    if (policy === 'declared-kafka-schema-v1') {
      const { signature: sig, sourceRange: r, basis } = c.contract;
      meter.item(r);
      if (sig.kind === 'MESSAGE' && sig.transport === 'KAFKA' && r) {
        const f = filesById.get(JSON.stringify([basisKey(basis), r.sourceFileId]));
        if (f) {
          const key = siteKey(
            basisKey(basis),
            f.sourceFile.path,
            f.sourceFile.contentFingerprint,
            sig.role,
            r,
          );
          const group = bySite.get(key) ?? [];
          group.push({ row: c, callSiteSupport: f.sourceSupport });
          bySite.set(key, group);
        }
      }
      continue;
    }
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
    if (policy === 'declared-kafka-schema-v1') {
      for (const binding of kafkaDocument.parse(parsed).bindings) {
        const selector = binding.selector;
        const matches =
          bySite.get(
            siteKey(
              basisKey(s.basis),
              selector.path,
              selector.contentFingerprint,
              binding.role,
              selector.range,
            ),
          ) ?? [];
        phase1Assert(matches.length === 1);
        const { row, callSiteSupport } = matches[0]!,
          sig = row.contract.signature;
        phase1Assert(
          row.ref.entity.revisionId === f.revisionId &&
            sig.kind === 'MESSAGE' &&
            sig.transport === 'KAFKA' &&
            sig.role === binding.role &&
            sig.channel === binding.channel &&
            (sig.namespace === null || sig.namespace === binding.namespace) &&
            sig.payloadSchemaRef === null &&
            sig.keySchemaRef === null,
        );
        const id = scopedRefKey(row.ref);
        phase1Assert(!attached.has(id));
        attached.add(id);
        const declaration = { ...binding, contractRef: row.ref, sourceSupport: s, callSiteSupport };
        meter.item(declaration);
        kafkaDeclarations.push(declaration);
      }
      continue;
    }
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
  kafkaDeclarations.sort((a, b) => cmp(scopedRefKey(a.contractRef), scopedRefKey(b.contractRef)));
  return { declarations, kafkaDeclarations, consumed: meter.receipt() };
}
export function parseFrozenContractSetV2(
  input: unknown,
  context: Phase1ReferenceContext,
  limits: DeclaredSchemaLimits,
) {
  ensurePhase1Data(input);
  const set = FrozenContractSetV2Schema.parse(input);
  const {
    matchingPolicyVersion: _policy,
    schemaDocuments: _documents,
    kafkaSourceFiles,
    ...base
  } = set;
  parseFrozenContractSet(base, context);
  phase1Assert(
    set.matchingPolicyVersion === 'declared-kafka-schema-v1' || kafkaSourceFiles === undefined,
  );
  for (const d of [...set.schemaDocuments, ...(kafkaSourceFiles ?? [])]) {
    const b = set.repositoryBindings.find(
      (b) => b.repoBasis.repositoryId === d.sourceFile.repositoryId,
    );
    phase1Assert(b && basisKey(b.repoBasis) === basisKey(d.sourceSupport.basis));
  }
  const decoded = decodeSchemaDocuments(
    set.schemaDocuments,
    set.contractRefs,
    context,
    limits,
    set.matchingPolicyVersion,
    kafkaSourceFiles,
  );
  phase1Assert(workspaceRuntimeInputDigestV2(set) === set.workspaceBasis.workspaceActivationDigest);
  const { declarations, kafkaDeclarations, consumed } = decoded;
  return {
    set,
    declarations,
    consumed,
    ...(set.matchingPolicyVersion === 'declared-kafka-schema-v1' ? { kafkaDeclarations } : {}),
  };
}
