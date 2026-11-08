import { createHash } from 'node:crypto';
import { types } from 'node:util';
import * as ir from './index.js';

/** Private structural DTOs only. Nothing returned here authenticates an owner,
 * permission, scan, Source, activation, or publication operation. */
export class CompilationInputContractError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CompilationInputContractError';
  }
}
const fail = (code = 'INVALID_COMPILATION_INPUT'): never => {
  throw new CompilationInputContractError(code);
};
function check(value: unknown, code?: string): asserts value {
  if (!value) fail(code);
}
type Data = null | boolean | number | string | Data[] | { [key: string]: Data };
type RecordData = { [key: string]: Data };
type Meter = ReturnType<typeof meter>;
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
/** Logical traversal/text accounting only; no physical RSS or reservation claim. */
function meter(control: ir.RuntimeRequestControl) {
  let owned: ir.RuntimeRequestControl;
  try {
    check(control && typeof control === 'object' && !types.isProxy(control));
    check(
      Object.getPrototypeOf(control) === Object.prototype ||
        Object.getPrototypeOf(control) === null,
    );
    const descriptors = Object.getOwnPropertyDescriptors(control);
    for (const key of ['maxItems', 'maxDepth', 'deadlineEpochMs', 'signal']) {
      const d = descriptors[key];
      check(d && Object.hasOwn(d, 'value') && d.enumerable);
    }
    owned = {
      maxItems: descriptors.maxItems!.value,
      maxDepth: descriptors.maxDepth!.value,
      deadlineEpochMs: descriptors.deadlineEpochMs!.value,
      signal: descriptors.signal!.value,
    } as ir.RuntimeRequestControl;
    check(owned.signal && !types.isProxy(owned.signal));
    check(typeof nativeAborted.call(owned.signal) === 'boolean');
    ir.assertRuntimeRequestControl(owned);
    check(!Object.is(owned.maxItems, -0) && !Object.is(owned.maxDepth, -0));
    Object.freeze(owned);
  } catch {
    return fail('INVALID_REQUEST_CONTROL');
  }
  const { maxItems, maxDepth, deadlineEpochMs, signal } = owned;
  let items = 0;
  function stop() {
    if (nativeAborted.call(signal)) fail('CANCELLED');
    if (Date.now() >= deadlineEpochMs) fail('DEADLINE');
  }
  return {
    stop,
    remaining: () => maxItems - items,
    charge(units: number) {
      stop();
      items += units;
      if (!Number.isSafeInteger(items) || items > maxItems) fail('BUDGET_EXCEEDED');
    },
    tick(depth = 0) {
      stop();
      if (depth > maxDepth || ++items > maxItems) fail('BUDGET_EXCEEDED');
    },
  };
}
function own(input: unknown, m: Meter, depth = 0, parents = new Set<object>()): Data {
  m.tick(depth);
  if (input === null || typeof input === 'boolean') return input;
  if (typeof input === 'string') {
    m.charge(input.length);
    check(input.isWellFormed());
    return input;
  }
  if (typeof input === 'number') {
    check(Number.isFinite(input) && !Object.is(input, -0));
    return input;
  }
  check(typeof input === 'object' && !types.isProxy(input) && !parents.has(input));
  const array = Array.isArray(input);
  check(
    array
      ? Object.getPrototypeOf(input) === Array.prototype
      : Object.getPrototypeOf(input) === Object.prototype || Object.getPrototypeOf(input) === null,
  );
  const keys = Reflect.ownKeys(input);
  if (keys.length > m.remaining() + (array ? 1 : 0)) fail('BUDGET_EXCEEDED');
  check(keys.every((k) => typeof k === 'string' && k.isWellFormed()));
  const descriptors = Object.getOwnPropertyDescriptors(input);
  parents.add(input);
  let result: Data;
  if (array) {
    check(keys.length === input.length + 1);
    result = [];
    for (let i = 0; i < input.length; i++) {
      const d = descriptors[String(i)];
      check(d && d.enumerable && Object.hasOwn(d, 'value'));
      result.push(own(d.value, m, depth + 1, parents));
    }
  } else {
    const object: RecordData = Object.create(null) as RecordData;
    for (const key of keys as string[]) {
      m.charge(key.length);
      const d = descriptors[key]!;
      check(d.enumerable && Object.hasOwn(d, 'value'));
      Object.defineProperty(object, key, {
        value: own(d.value, m, depth + 1, parents),
        enumerable: true,
      });
    }
    result = object;
  }
  parents.delete(input);
  return result;
}
function object(value: unknown): RecordData {
  check(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as RecordData;
}
function exact(value: unknown, fields: readonly string[]): RecordData {
  const v = object(value),
    keys = Object.keys(v);
  check(keys.length === fields.length && fields.every((k) => Object.hasOwn(v, k)));
  return v;
}
function array(value: unknown): Data[] {
  check(Array.isArray(value));
  return value as Data[];
}
function encode(value: unknown, m: Meter): string {
  m.tick();
  if (Array.isArray(value)) return '[' + value.map((x) => encode(x, m)).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return (
      '{' +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + encode(v[k], m))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value)!;
}
function sorted<T>(values: T[], key: (v: T) => string, m: Meter): T[] {
  const indexed = values.map((value) => {
    m.tick();
    return { value, key: key(value) };
  });
  indexed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (let i = 1; i < indexed.length; i++) check(indexed[i - 1]!.key !== indexed[i]!.key);
  return indexed.map((x) => x.value);
}
function unique(values: readonly string[]) {
  check(new Set(values).size === values.length);
}
function frozen<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const child of Object.values(v)) frozen(child);
    Object.freeze(v);
  }
  return v;
}
function boundary<T>(control: ir.RuntimeRequestControl, run: (m: Meter) => T): T {
  const m = meter(control);
  try {
    const result = run(m);
    m.stop();
    return frozen(result);
  } catch (e) {
    if (e instanceof CompilationInputContractError) throw e;
    return fail();
  }
}
/** No JSON byte decoding: duplicate raw keys must be rejected by the owner decoder. */
export function canonicalCompilationJson(
  input: unknown,
  control: ir.RuntimeRequestControl,
): string {
  return boundary(control, (m) => encode(own(input, m), m));
}
function hash(domain: string, value: unknown, m: Meter): string {
  return createHash('sha256')
    .update(domain + encode(value, m), 'utf8')
    .digest('hex');
}
type SyntaxEnvelope<V extends number, T> = {
  schema: 'codeatlas.syntax-evidence';
  version: V;
  payload: T;
};
function syntax<V extends number, T>(
  version: V,
  schema: { parse(v: unknown): T },
  value: unknown,
): SyntaxEnvelope<V, T> {
  const e = exact(value, ['schema', 'version', 'payload']);
  check(e.schema === 'codeatlas.syntax-evidence' && e.version === version);
  return {
    schema: 'codeatlas.syntax-evidence' as const,
    version,
    payload: schema.parse(e.payload),
  };
}
type DocumentBundle = ReturnType<typeof ir.parseDocumentBundle>['payload'];
/** Named IR types keep the private DTO declaration independent of Zod's parser
 * method signatures. Runtime validation below still uses the exact IR schemas. */
type CaptureValueMap = {
  'SourceFile@1': ir.SourceFile;
  'CanonicalNode@1': ir.CanonicalNode;
  'CanonicalEdge@1': ir.CanonicalEdge;
  'Evidence@1': ir.Evidence;
  'SyntaxEvidence@1': SyntaxEnvelope<1, ir.SyntaxEvidence>;
  'SyntaxEvidence@2': SyntaxEnvelope<2, ir.SyntaxEvidenceV2>;
  'SyntaxEvidence@3': SyntaxEnvelope<3, ir.SyntaxEvidenceV3>;
  'SyntaxEvidence@4': SyntaxEnvelope<4, ir.SyntaxEvidenceV4>;
  'EntryPoint@1': ir.RuntimeFactSet['entryPoints'][number];
  'TaskDefinition@1': ir.RuntimeFactSet['tasks'][number];
  'DataResource@1': ir.RuntimeFactSet['dataResources'][number];
  'DataChangeTrigger@1': ir.RuntimeFactSet['triggers'][number];
  'Contract@1': ir.RuntimeFactSet['contracts'][number];
  'ExecutionContext@1': ir.RuntimeFactSet['contexts'][number];
  'ExecutionNode@1': ir.RuntimeFactSet['nodes'][number];
  'ExecutionEdge@1': ir.RuntimeFactSet['edges'][number];
  'RuntimeFlow@1': ir.RuntimeFlow;
  'FrameworkBinding@1': ir.FrameworkBinding;
  'Service@1': ir.FrozenContractSet['catalog']['services'][number];
  'ServiceIdentity@1': ir.FrozenContractSet['catalog']['entries'][number];
  'ContractMatch@1': ir.ContractMatch;
  'WorkspaceExecutionNode@1': ir.WorkspaceExecution['nodes'][number];
  'WorkspaceExecutionEdge@1': ir.WorkspaceExecution['edges'][number];
  'Document@1': DocumentBundle['document'];
  'DocumentRevision@1': DocumentBundle['revision'];
  'DocumentSection@1': DocumentBundle['sections'][number];
  'DocumentBlock@1': DocumentBundle['blocks'][number];
  'DocumentTable@1': DocumentBundle['tables'][number];
  'DocumentLink@1': DocumentBundle['links'][number];
  'DocumentCodeSnippet@1': DocumentBundle['codeSnippets'][number];
  'DocumentEntityMention@1': DocumentBundle['mentions'][number];
  'DocumentChunk@1': DocumentBundle['chunks'][number];
};
// This is deliberately closed; EntityRef's open kind string is not a registry.
const adapters: {
  [K in keyof CaptureValueMap]: { kind: string; parse(value: unknown): CaptureValueMap[K] };
} = {
  'SourceFile@1': { kind: 'SOURCE_FILE', parse: ir.SourceFileSchema.parse },
  'CanonicalNode@1': { kind: 'CODE_NODE', parse: ir.CanonicalNodeSchema.parse },
  'CanonicalEdge@1': { kind: 'CODE_EDGE', parse: ir.CanonicalEdgeSchema.parse },
  'Evidence@1': { kind: 'EVIDENCE', parse: ir.EvidenceSchema.parse },
  'SyntaxEvidence@1': {
    kind: 'SYNTAX_EVIDENCE',
    parse: (v: unknown) => syntax(1, ir.SyntaxEvidenceSchema, v),
  },
  'SyntaxEvidence@2': {
    kind: 'SYNTAX_EVIDENCE',
    parse: (v: unknown) => syntax(2, ir.SyntaxEvidenceV2Schema, v),
  },
  'SyntaxEvidence@3': {
    kind: 'SYNTAX_EVIDENCE',
    parse: (v: unknown) => syntax(3, ir.SyntaxEvidenceV3Schema, v),
  },
  'SyntaxEvidence@4': {
    kind: 'SYNTAX_EVIDENCE',
    parse: (v: unknown) => syntax(4, ir.SyntaxEvidenceV4Schema, v),
  },
  'EntryPoint@1': { kind: 'ENTRY_POINT', parse: ir.EntryPointSchema.parse },
  'TaskDefinition@1': { kind: 'TASK_DEFINITION', parse: ir.TaskDefinitionSchema.parse },
  'DataResource@1': { kind: 'DATA_RESOURCE', parse: ir.DataResourceSchema.parse },
  'DataChangeTrigger@1': { kind: 'DATA_CHANGE_TRIGGER', parse: ir.DataChangeTriggerSchema.parse },
  'Contract@1': { kind: 'CONTRACT', parse: ir.ContractSchema.parse },
  'ExecutionContext@1': { kind: 'EXECUTION_CONTEXT', parse: ir.ExecutionContextSchema.parse },
  'ExecutionNode@1': { kind: 'EXECUTION_NODE', parse: ir.ExecutionNodeSchema.parse },
  'ExecutionEdge@1': { kind: 'EXECUTION_EDGE', parse: ir.ExecutionEdgeSchema.parse },
  'RuntimeFlow@1': { kind: 'RUNTIME_FLOW', parse: ir.RuntimeFlowSchema.parse },
  'FrameworkBinding@1': { kind: 'FRAMEWORK_BINDING', parse: ir.FrameworkBindingSchema.parse },
  'Service@1': { kind: 'SERVICE', parse: ir.ServiceSchema.parse },
  'ServiceIdentity@1': { kind: 'SERVICE_IDENTITY', parse: ir.ServiceIdentitySchema.parse },
  'ContractMatch@1': { kind: 'CONTRACT_MATCH', parse: ir.ContractMatchSchema.parse },
  'WorkspaceExecutionNode@1': {
    kind: 'WORKSPACE_EXECUTION_NODE',
    parse: ir.WorkspaceExecutionNodeSchema.parse,
  },
  'WorkspaceExecutionEdge@1': {
    kind: 'WORKSPACE_EXECUTION_EDGE',
    parse: ir.WorkspaceExecutionEdgeSchema.parse,
  },
  'Document@1': { kind: 'DOCUMENT', parse: ir.DocumentSchema.parse },
  'DocumentRevision@1': { kind: 'DOCUMENT_REVISION', parse: ir.DocumentRevisionSchema.parse },
  'DocumentSection@1': { kind: 'DOCUMENT_SECTION', parse: ir.DocumentSectionSchema.parse },
  'DocumentBlock@1': { kind: 'DOCUMENT_BLOCK', parse: ir.DocumentBlockSchema.parse },
  'DocumentTable@1': { kind: 'DOCUMENT_TABLE', parse: ir.DocumentTableSchema.parse },
  'DocumentLink@1': { kind: 'DOCUMENT_LINK', parse: ir.DocumentLinkSchema.parse },
  'DocumentCodeSnippet@1': {
    kind: 'DOCUMENT_CODE_SNIPPET',
    parse: ir.DocumentCodeSnippetSchema.parse,
  },
  'DocumentEntityMention@1': {
    kind: 'DOCUMENT_ENTITY_MENTION',
    parse: ir.DocumentEntityMentionSchema.parse,
  },
  'DocumentChunk@1': { kind: 'DOCUMENT_CHUNK', parse: ir.DocumentChunkSchema.parse },
};
export type CaptureValueSchemaRef = keyof CaptureValueMap;
type CapturedValue<K extends CaptureValueSchemaRef> = CaptureValueMap[K];
export type CapturedEntity = {
  [K in CaptureValueSchemaRef]: {
    ref: ir.ScopedRef;
    valueSchemaRef: K;
    value: CapturedValue<K>;
  };
}[CaptureValueSchemaRef];
export type SupportValueSchemaRef = Exclude<
  CaptureValueSchemaRef,
  'Evidence@1' | 'Document@1' | 'DocumentRevision@1'
>;
export type CapturedSupport = {
  [K in SupportValueSchemaRef]: {
    ref: ir.SupportRef;
    valueSchemaRef: K;
    value: CapturedValue<K>;
    capturedValueDigest: string;
  };
}[SupportValueSchemaRef];
export type DocumentSelection = { documentId: string; documentRevisionId: string };
export type CompilationCaptureSelection = {
  repositoryIds: string[];
  selectedEntityRefs: ir.ScopedRef[];
  selectedDocumentRevisions: DocumentSelection[];
};
export type CompilationCaptureRequest = CompilationCaptureSelection & {
  schemaVersion: 1;
  workspaceId: string;
  scope: ir.KnowledgeItem['scope'];
  revisionSetId: string;
  policyVersions: { securityPolicyRef: string; domainPolicyRef: string };
};
type Coverage = ir.RuntimeFlow['coverage'];
type Inventory = { entities: CapturedEntity[]; supports: CapturedSupport[]; coverage: Coverage };
export type RepositoryCapture = Inventory & {
  repoBasis: ir.RepoBasis;
  runtimeActivationDigest: string | null;
};
export type WorkspaceCapture = Inventory & {
  workspaceBasis: ir.FrozenContractSet['workspaceBasis'];
};
export type DocumentCapture = Inventory & {
  documentBasis: Extract<ir.SupportRef['basis'], { documentId: ir.DocumentId }>;
  parserVersion: string;
  policyVersion: string;
};
export type CompilationInputSnapshot = {
  schemaVersion: 1;
  snapshotId: string;
  workspaceId: string;
  scope: CompilationCaptureRequest['scope'];
  revisionSetId: string;
  selection: CompilationCaptureSelection;
  workspaceCapture: WorkspaceCapture | null;
  repositories: RepositoryCapture[];
  documents: DocumentCapture[];
  policyVersions: CompilationCaptureRequest['policyVersions'];
  inputDigest: string;
  captureWindow: { startedAt: string; completedAt: string };
  coverage: Coverage;
};
export type SnapshotInput = Omit<CompilationInputSnapshot, 'inputDigest'>;
function adapter(ref: unknown) {
  check(typeof ref === 'string' && Object.hasOwn(adapters, ref));
  return adapters[ref as CaptureValueSchemaRef];
}
function parsedValue(ref: unknown, value: unknown) {
  return adapter(ref).parse(value);
}
function valueDigest(ref: unknown, value: unknown, m: Meter): string {
  return hash('codeatlas.capture-value.v1\n', { valueSchemaRef: ref, value }, m);
}
export function compilationCaptureValueDigest(
  valueSchemaRef: unknown,
  value: unknown,
  control: ir.RuntimeRequestControl,
): string {
  return boundary(control, (m) => {
    const raw = own({ valueSchemaRef, value }, m),
      v = object(raw);
    return valueDigest(v.valueSchemaRef, parsedValue(v.valueSchemaRef, v.value), m);
  });
}
function selectedDocument(value: unknown): DocumentSelection {
  const v = exact(value, ['documentId', 'documentRevisionId']);
  return {
    documentId: ir.DocumentIdSchema.parse(v.documentId),
    documentRevisionId: ir.DocumentRevisionIdSchema.parse(v.documentRevisionId),
  };
}
function selectedRef(value: unknown): ir.ScopedRef {
  const r = ir.ScopedRefSchema.parse(value);
  check(r.entity.revisionId !== undefined);
  check(Object.values(adapters).some((a) => a.kind === r.entity.kind));
  return r;
}
function selection(value: unknown, m: Meter): CompilationCaptureSelection {
  const v = exact(value, ['repositoryIds', 'selectedEntityRefs', 'selectedDocumentRevisions']);
  const result = {
    repositoryIds: sorted(
      array(v.repositoryIds).map((id) => ir.EntityIdSchema.parse(id)),
      (id) => id,
      m,
    ),
    selectedEntityRefs: sorted(
      array(v.selectedEntityRefs).map(selectedRef),
      (r) => encode(r, m),
      m,
    ),
    selectedDocumentRevisions: sorted(
      array(v.selectedDocumentRevisions).map(selectedDocument),
      (d) => encode([d.documentId, d.documentRevisionId], m),
      m,
    ),
  };
  unique(result.selectedDocumentRevisions.map((d) => d.documentId));
  return result;
}
function scope(value: unknown, m: Meter): CompilationCaptureRequest['scope'] {
  const v = ir.KnowledgeScopeSchema.parse(value);
  if (v.kind === 'CROSS_REPO') v.repositoryIds = sorted(v.repositoryIds, (id) => id, m);
  return v;
}
function policy(value: unknown): CompilationCaptureRequest['policyVersions'] {
  const v = exact(value, ['securityPolicyRef', 'domainPolicyRef']);
  return {
    securityPolicyRef: ir.Phase1ExactStringSchema.parse(v.securityPolicyRef),
    domainPolicyRef: ir.Phase1ExactStringSchema.parse(v.domainPolicyRef),
  };
}
function checkScope(
  v: Pick<
    CompilationCaptureRequest,
    'scope' | 'workspaceId' | 'repositoryIds' | 'selectedEntityRefs'
  >,
) {
  if (v.scope.kind === 'REPOSITORY')
    check(v.repositoryIds.length === 1 && v.repositoryIds[0] === v.scope.repositoryId);
  else {
    check(v.scope.workspaceId === v.workspaceId);
    if (v.scope.kind === 'CROSS_REPO')
      check(JSON.stringify(v.scope.repositoryIds) === JSON.stringify(v.repositoryIds));
  }
  for (const r of v.selectedEntityRefs)
    check(
      r.scope === 'REPOSITORY'
        ? v.repositoryIds.includes(r.repositoryId)
        : r.workspaceId === v.workspaceId,
    );
}
/** Selectors only. Authoritative membership and effective policy checks are external. */
export function parseCompilationCaptureRequest(
  input: unknown,
  control: ir.RuntimeRequestControl,
): CompilationCaptureRequest {
  return boundary(control, (m) => {
    const v = exact(own(input, m), [
      'schemaVersion',
      'workspaceId',
      'scope',
      'revisionSetId',
      'repositoryIds',
      'selectedEntityRefs',
      'selectedDocumentRevisions',
      'policyVersions',
    ]);
    check(v.schemaVersion === 1);
    const result: CompilationCaptureRequest = {
      schemaVersion: 1,
      workspaceId: ir.EntityIdSchema.parse(v.workspaceId),
      revisionSetId: ir.EntityIdSchema.parse(v.revisionSetId),
      scope: scope(v.scope, m),
      ...selection(
        {
          repositoryIds: v.repositoryIds,
          selectedEntityRefs: v.selectedEntityRefs,
          selectedDocumentRevisions: v.selectedDocumentRevisions,
        },
        m,
      ),
      policyVersions: policy(v.policyVersions),
    };
    checkScope(result);
    return result;
  });
}
function coverage(value: unknown, m: Meter): Coverage {
  const v = ir.Phase1CoverageSchema.parse(value);
  return {
    ...v,
    limitations: sorted(v.limitations, (s) => s, m),
    unverifiedRefs: sorted(v.unverifiedRefs.map(selectedRef), (r) => encode(r, m), m),
  };
}
function entity(value: unknown): CapturedEntity {
  const v = exact(value, ['ref', 'valueSchemaRef', 'value']),
    a = adapter(v.valueSchemaRef),
    r = selectedRef(v.ref);
  check(r.entity.kind === a.kind);
  return { ref: r, valueSchemaRef: v.valueSchemaRef, value: a.parse(v.value) } as CapturedEntity;
}
function support(value: unknown, m: Meter, verifyDigest = true): CapturedSupport {
  const v = exact(value, ['ref', 'valueSchemaRef', 'value', 'capturedValueDigest']),
    a = adapter(v.valueSchemaRef);
  check(!['Evidence@1', 'Document@1', 'DocumentRevision@1'].includes(String(v.valueSchemaRef)));
  const r = ir.SupportRefSchema.parse(v.ref),
    parsed = a.parse(v.value);
  check(r.entity.kind === a.kind);
  const digest = ir.Phase1DigestSchema.parse(v.capturedValueDigest);
  if (!verifyDigest)
    return {
      ref: r,
      valueSchemaRef: v.valueSchemaRef,
      value: parsed,
      capturedValueDigest: digest,
    } as CapturedSupport;
  const domain = ['SourceFile@1', 'CanonicalNode@1', 'CanonicalEdge@1'].includes(
    String(v.valueSchemaRef),
  )
    ? 'codeatlas-phase1-support-value-v1\0'
    : String(v.valueSchemaRef).startsWith('SyntaxEvidence@')
      ? 'runtime-syntax-support-v1\0'
      : fail('SUPPORT_RECIPE_UNAVAILABLE');
  check(hash(domain, parsed, m) === r.valueDigest, 'SUPPORT_VALUE_DIGEST_MISMATCH');
  check(valueDigest(v.valueSchemaRef, parsed, m) === digest, 'CAPTURE_VALUE_DIGEST_MISMATCH');
  return {
    ref: r,
    valueSchemaRef: v.valueSchemaRef,
    value: parsed,
    capturedValueDigest: digest,
  } as CapturedSupport;
}
function inventory(v: RecordData, m: Meter): Inventory {
  return {
    entities: sorted(array(v.entities).map(entity), (e) => encode(e.ref, m), m),
    supports: sorted(
      array(v.supports).map((s) => support(s, m, false)),
      (s) => encode([s.ref.basis, s.ref.entity, s.ref.valueDigest], m),
      m,
    ),
    coverage: coverage(v.coverage, m),
  };
}
function repository(value: unknown, m: Meter): RepositoryCapture {
  const v = exact(value, [
    'repoBasis',
    'runtimeActivationDigest',
    'entities',
    'supports',
    'coverage',
  ]);
  return {
    repoBasis: ir.RepoBasisSchema.parse(v.repoBasis),
    runtimeActivationDigest:
      v.runtimeActivationDigest === null
        ? null
        : ir.Phase1DigestSchema.parse(v.runtimeActivationDigest),
    ...inventory(v, m),
  };
}
function workspace(value: unknown, m: Meter): WorkspaceCapture {
  const v = exact(value, ['workspaceBasis', 'entities', 'supports', 'coverage']);
  return { workspaceBasis: ir.WorkspaceBasisSchema.parse(v.workspaceBasis), ...inventory(v, m) };
}
function document(value: unknown, m: Meter): DocumentCapture {
  const v = exact(value, [
    'documentBasis',
    'parserVersion',
    'policyVersion',
    'entities',
    'supports',
    'coverage',
  ]);
  return {
    documentBasis: ir.DocumentBasisSchema.parse(v.documentBasis),
    parserVersion: ir.Phase1ExactStringSchema.parse(v.parserVersion),
    policyVersion: ir.Phase1ExactStringSchema.parse(v.policyVersion),
    ...inventory(v, m),
  };
}
type Item = {
  ref: ir.ScopedRef;
  valueSchemaRef: CaptureValueSchemaRef;
  value: CapturedEntity['value'];
};
const docKinds = new Set<string>(
  Object.values(adapters)
    .map((a) => a.kind)
    .filter((k) => k.startsWith('DOCUMENT')),
);
const runtimeGroups = {
  ENTRY_POINT: 'entryPoints',
  TASK_DEFINITION: 'tasks',
  DATA_RESOURCE: 'dataResources',
  DATA_CHANGE_TRIGGER: 'triggers',
  CONTRACT: 'contracts',
  EXECUTION_CONTEXT: 'contexts',
  EXECUTION_NODE: 'nodes',
  EXECUTION_EDGE: 'edges',
  RUNTIME_FLOW: 'flows',
} as const;
function payload(item: Item): RecordData {
  const v = object(item.value);
  return item.valueSchemaRef.startsWith('SyntaxEvidence@') ? object(v.payload) : v;
}
function closure(s: CompilationInputSnapshot, m: Meter, select: boolean) {
  const items = new Map<string, Item>(),
    dependencies = new Map<string, Set<string>>();
  const supports = new Map<string, CapturedSupport>();
  const supportMembership = new Map<string, string>();
  const docOwners = new Map<string, DocumentCapture>();
  const repoOwners = new Map(s.repositories.map((r) => [r.repoBasis.repositoryId, r]));
  // Structural owner metadata only. Actual registration must be independently read
  // by Application; metadata never becomes a selectable/captured entity.
  const repositoryRefs = s.repositories.map((r) =>
    ir.ScopedRefSchema.parse({
      scope: 'REPOSITORY',
      repositoryId: r.repoBasis.repositoryId,
      entity: {
        kind: 'REPOSITORY',
        id: r.repoBasis.repositoryId,
        revisionId: r.repoBasis.revisionId,
      },
    }),
  );
  const captures: (RepositoryCapture | WorkspaceCapture | DocumentCapture)[] = [
    ...s.repositories,
    ...s.documents,
  ];
  if (s.workspaceCapture) captures.push(s.workspaceCapture);
  checkScope({ ...s, ...s.selection });
  check(
    JSON.stringify(s.repositories.map((r) => r.repoBasis.repositoryId)) ===
      JSON.stringify(s.selection.repositoryIds),
  );
  if (s.workspaceCapture)
    check(
      s.workspaceCapture.workspaceBasis.workspaceId === s.workspaceId &&
        s.workspaceCapture.workspaceBasis.revisionSetId === s.revisionSetId,
    );
  for (const d of s.documents) {
    const key = d.documentBasis.documentRevisionId;
    check(!docOwners.has(key));
    docOwners.set(key, d);
  }
  const ckey = (ref: ir.ScopedRef) => encode(ref, m);
  function add(item: Item) {
    const key = ckey(item.ref),
      old = items.get(key);
    check(
      !old ||
        (old.valueSchemaRef === item.valueSchemaRef &&
          encode(old.value, m) === encode(item.value, m)),
    );
    items.set(key, item);
  }
  function ownRef(ref: ir.ScopedRef, capture: (typeof captures)[number]) {
    const r = ref.entity;
    check(r.revisionId !== undefined);
    if ('repoBasis' in capture)
      check(
        ref.scope === 'REPOSITORY' &&
          ref.repositoryId === capture.repoBasis.repositoryId &&
          r.revisionId === capture.repoBasis.revisionId &&
          !docKinds.has(r.kind),
      );
    else if ('documentBasis' in capture)
      check(
        ref.scope === 'WORKSPACE' &&
          ref.workspaceId === s.workspaceId &&
          r.revisionId === capture.documentBasis.documentRevisionId &&
          docKinds.has(r.kind),
      );
    else
      check(
        ref.scope === 'WORKSPACE' &&
          ref.workspaceId === s.workspaceId &&
          r.revisionId === s.revisionSetId &&
          [
            'SERVICE',
            'SERVICE_IDENTITY',
            'CONTRACT_MATCH',
            'WORKSPACE_EXECUTION_NODE',
            'WORKSPACE_EXECUTION_EDGE',
          ].includes(r.kind),
      );
  }
  for (const capture of captures) {
    m.tick();
    const identity = new Set<string>(),
      factKeys = new Set<string>();
    for (const e of capture.entities) {
      ownRef(e.ref, capture);
      const p = payload(e);
      check(p.id === e.ref.entity.id);
      if ('documentBasis' in capture && p.documentRevisionId !== undefined)
        check(p.documentRevisionId === capture.documentBasis.documentRevisionId);
      const id = String(p.id);
      check(!identity.has(id));
      identity.add(id);
      for (const f of ['factKey', 'syntaxKey'])
        if (p[f] !== undefined) {
          const k = String(p[f]);
          check(!factKeys.has(k));
          factKeys.add(k);
        }
      add(e);
    }
    for (const sup of capture.supports) {
      const b = sup.ref.basis;
      const ref: ir.ScopedRef =
        'repositoryId' in b
          ? { scope: 'REPOSITORY', repositoryId: b.repositoryId, entity: sup.ref.entity }
          : {
              scope: 'WORKSPACE',
              workspaceId:
                'workspaceId' in b ? b.workspaceId : ir.EntityIdSchema.parse(s.workspaceId),
              entity: sup.ref.entity,
            };
      ownRef(ref, capture);
      const expected =
        'repoBasis' in capture
          ? capture.repoBasis
          : 'workspaceBasis' in capture
            ? capture.workspaceBasis
            : capture.documentBasis;
      check(ir.basisKey(b) === ir.basisKey(expected));
      const member = JSON.stringify([ir.basisKey(b), ir.entityRefKey(sup.ref.entity)]),
        key = ir.supportKey(sup.ref);
      check(!supportMembership.has(member));
      supportMembership.set(member, key);
      check(!supports.has(key));
      supports.set(key, sup);
      const item = { ref, valueSchemaRef: sup.valueSchemaRef, value: sup.value } as Item;
      check(payload(item).id === ref.entity.id);
      add(item);
    }
  }
  function available(ref: ir.ScopedRef, from: Set<string>) {
    const key = ckey(ref);
    if (ref.entity.kind === 'REPOSITORY') {
      check(
        repositoryRefs.some((r) => ckey(r) === key),
        'CAPTURE_CLOSURE_MISSING',
      );
      return;
    }
    check(items.has(key), 'CAPTURE_CLOSURE_MISSING');
    from.add(key);
  }
  function basis(value: unknown) {
    const b = ir.Phase1BasisSchema.parse(value);
    if ('repositoryId' in b)
      check(
        repoOwners.has(b.repositoryId) &&
          ir.basisKey(repoOwners.get(b.repositoryId)!.repoBasis) === ir.basisKey(b),
      );
    else if ('documentId' in b)
      check(
        docOwners.has(b.documentRevisionId) &&
          ir.basisKey(docOwners.get(b.documentRevisionId)!.documentBasis) === ir.basisKey(b),
      );
    else
      check(
        s.workspaceCapture && ir.basisKey(s.workspaceCapture.workspaceBasis) === ir.basisKey(b),
      );
  }
  function visit(value: unknown, item: Item, out: Set<string>) {
    m.tick();
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const v of value) visit(v, item, out);
      return;
    }
    const v = object(value),
      p = payload(item);
    if ((v.scope === 'WORKSPACE' || v.scope === 'REPOSITORY') && Object.hasOwn(v, 'entity')) {
      available(ir.ScopedRefSchema.parse(v), out);
      return;
    }
    if (
      Object.hasOwn(v, 'basis') &&
      Object.hasOwn(v, 'entity') &&
      Object.hasOwn(v, 'valueDigest')
    ) {
      const r = ir.SupportRefSchema.parse(v),
        support = supports.get(ir.supportKey(r));
      check(support, 'CAPTURE_CLOSURE_MISSING');
      basis(r.basis);
      const sr: ir.ScopedRef =
        'repositoryId' in r.basis
          ? { scope: 'REPOSITORY', repositoryId: r.basis.repositoryId, entity: r.entity }
          : {
              scope: 'WORKSPACE',
              workspaceId: ir.EntityIdSchema.parse(s.workspaceId),
              entity: r.entity,
            };
      available(sr, out);
      return;
    }
    if ('sourceFileId' in v && 'startLine' in v) {
      check(item.ref.scope === 'REPOSITORY');
      const r = ir.SourceRangeSchema.parse(v);
      available(
        {
          scope: 'REPOSITORY',
          repositoryId: item.ref.repositoryId,
          entity: {
            kind: 'SOURCE_FILE',
            id: r.sourceFileId,
            revisionId: item.ref.entity.revisionId!,
          },
        },
        out,
      );
    }
    if (
      Object.hasOwn(v, 'kind') &&
      Object.hasOwn(v, 'id') &&
      Object.hasOwn(v, 'revisionId') &&
      !Object.hasOwn(v, 'scope') &&
      !Object.hasOwn(v, 'repositoryId')
    ) {
      const r = ir.EntityRefSchema.safeParse(v);
      if (r.success) available({ ...item.ref, entity: r.data }, out);
    }
    if (
      Object.hasOwn(v, 'sourceRange') &&
      v.sourceRange !== null &&
      docKinds.has(item.ref.entity.kind)
    ) {
      const range = object(v.sourceRange);
      check(range.documentRevisionId === item.ref.entity.revisionId);
    }
    if (Object.hasOwn(v, 'sourceBasis')) basis(v.sourceBasis);
    if (Object.hasOwn(v, 'workspaceBasis')) basis(v.workspaceBasis);
    if (Object.hasOwn(v, 'basis') && !Object.hasOwn(v, 'entity')) basis(v.basis);
    if (Object.hasOwn(v, 'basisRefs')) for (const b of array(v.basisRefs)) basis(b);
    if (item.ref.scope === 'REPOSITORY' && v === p) {
      check(
        v.repositoryId === item.ref.repositoryId && v.revisionId === item.ref.entity.revisionId,
      );
      if (item.ref.entity.kind in runtimeGroups || item.ref.entity.kind === 'FRAMEWORK_BINDING')
        check(repoOwners.get(item.ref.repositoryId)!.runtimeActivationDigest !== null);
    }
    for (const child of Object.values(v)) visit(child, item, out);
  }
  for (const [key, item] of items) {
    const out = new Set<string>();
    visit(item.value, item, out);
    if (item.valueSchemaRef === 'CanonicalEdge@1') {
      const e = item.value as ir.CanonicalEdge;
      check(item.ref.scope === 'REPOSITORY');
      const refs = [
        e.source,
        ...(e.target.state === 'RESOLVED' ? [e.target.target] : e.target.candidates),
      ];
      for (const r of refs)
        available(
          {
            ...item.ref,
            entity: {
              kind: 'CODE_NODE',
              id: ir.EntityIdSchema.parse(r.id),
              revisionId: e.revisionId,
            },
          },
          out,
        );
    }
    // DocumentBundle collection checks require the exact whole structural revision.
    if (docKinds.has(item.ref.entity.kind))
      for (const [otherKey, other] of items)
        if (
          docKinds.has(other.ref.entity.kind) &&
          other.ref.entity.revisionId === item.ref.entity.revisionId
        )
          out.add(otherKey);
    if (item.valueSchemaRef.startsWith('SyntaxEvidence@')) {
      const p = payload(item);
      check(item.ref.scope === 'REPOSITORY');
      const file = items.get(
        ckey(
          ir.ScopedRefSchema.parse({
            scope: 'REPOSITORY',
            repositoryId: item.ref.repositoryId,
            entity: {
              kind: 'SOURCE_FILE',
              id: object(p.sourceRange).sourceFileId,
              revisionId: p.revisionId,
            },
          }),
        ),
      );
      check(
        file?.valueSchemaRef === 'SourceFile@1' &&
          payload(file).contentFingerprint === p.sourceFingerprint,
      );
      for (const [otherKey, other] of items) {
        m.tick();
        if (
          other.ref.scope !== item.ref.scope ||
          !other.valueSchemaRef.startsWith('SyntaxEvidence@')
        )
          continue;
        const q = payload(other);
        if (q.repositoryId !== p.repositoryId || q.revisionId !== p.revisionId) continue;
        if (
          q.syntaxKind === 'BINDING_SCOPE' &&
          p.lexicalScope !== null &&
          p.lexicalScope !== undefined &&
          encode(object(q.payload).scopeRef, m) === encode(p.lexicalScope, m)
        )
          out.add(otherKey);
        if (
          (p.syntaxKind === 'DECLARATION' &&
            object(p.payload).declarationForm === 'CALLABLE' &&
            q.syntaxKind === 'PARAMETER_BINDING') ||
          (p.syntaxKind === 'PARAMETER_BINDING' &&
            q.syntaxKind === 'DECLARATION' &&
            object(q.payload).declarationForm === 'CALLABLE')
        ) {
          const callable =
            p.syntaxKind === 'PARAMETER_BINDING' ? object(p.payload).callableRef : p.owner;
          const target =
            q.syntaxKind === 'PARAMETER_BINDING' ? object(q.payload).callableRef : q.owner;
          if (encode(callable, m) === encode(target, m)) out.add(otherKey);
        }
        // Surface links are typed invocation sites, not arbitrary JSON locations.
        for (const f of ['producer', 'consumer', 'body']) {
          const site = object(p.payload)[f];
          if (
            site &&
            typeof site === 'object' &&
            !Array.isArray(site) &&
            object(site).syntaxKind === 'INVOCATION' &&
            q.syntaxKind === 'INVOCATION' &&
            encode(object(site).sourceRange, m) === encode(q.sourceRange, m)
          )
            out.add(otherKey);
        }
        if (
          p.callbackScope &&
          q.syntaxKind === 'CALLBACK_BINDING' &&
          encode(p.callbackScope, m) === encode(q.sourceRange, m)
        )
          out.add(otherKey);
      }
    }
    dependencies.set(key, out);
  }
  for (const r of s.selection.selectedEntityRefs)
    check(items.has(ckey(r)), 'CAPTURE_CLOSURE_MISSING');
  for (const r of s.selection.selectedDocumentRevisions)
    check(
      s.documents.some(
        (d) =>
          d.documentBasis.documentId === r.documentId &&
          d.documentBasis.documentRevisionId === r.documentRevisionId,
      ),
      'CAPTURE_CLOSURE_MISSING',
    );
  for (const c of [s, ...captures])
    for (const r of c.coverage.unverifiedRefs) check(items.has(ckey(r)), 'CAPTURE_CLOSURE_MISSING');
  const reachable = new Set(s.selection.selectedEntityRefs.map(ckey));
  for (const d of s.selection.selectedDocumentRevisions)
    for (const [key, item] of items)
      if (docKinds.has(item.ref.entity.kind) && item.ref.entity.revisionId === d.documentRevisionId)
        reachable.add(key);
  const pending = [...reachable];
  while (pending.length) {
    m.tick();
    for (const key of dependencies.get(pending.pop()!) ?? [])
      if (!reachable.has(key)) {
        reachable.add(key);
        pending.push(key);
      }
  }
  if (select) {
    for (const capture of captures) {
      capture.entities = capture.entities.filter((e) => reachable.has(ckey(e.ref)));
      capture.supports = capture.supports.filter((sup) => {
        const b = sup.ref.basis;
        return reachable.has(
          ckey(
            ir.ScopedRefSchema.parse(
              'repositoryId' in b
                ? { scope: 'REPOSITORY', repositoryId: b.repositoryId, entity: sup.ref.entity }
                : { scope: 'WORKSPACE', workspaceId: s.workspaceId, entity: sup.ref.entity },
            ),
          ),
        );
      });
    }
    s.documents = s.documents.filter((d) => d.entities.length || d.supports.length);
    if (
      s.workspaceCapture &&
      !s.workspaceCapture.entities.length &&
      !s.workspaceCapture.supports.length
    )
      s.workspaceCapture = null;
    for (const key of items.keys()) if (!reachable.has(key)) items.delete(key);
    for (const [key, sup] of supports)
      if (!captures.some((c) => c.supports.includes(sup))) supports.delete(key);
  } else for (const key of items.keys()) check(reachable.has(key), 'UNSELECTED_CAPTURE_VALUE');
  for (const sup of supports.values()) support(sup, m);
  for (const c of [
    s,
    ...s.repositories,
    ...s.documents,
    ...(s.workspaceCapture ? [s.workspaceCapture] : []),
  ])
    for (const r of c.coverage.unverifiedRefs) check(items.has(ckey(r)), 'CAPTURE_CLOSURE_MISSING');
  const context = {
    availableEntities: [...items.values()].map((e) => e.ref).concat(repositoryRefs),
    availableSupports: [...supports.values()].map((v) => v.ref),
  };
  validateCollections(s, [...items.values()], context, m);
}
function validateCollections(
  s: CompilationInputSnapshot,
  items: Item[],
  context: ir.Phase1ReferenceContext,
  m: Meter,
) {
  for (const repo of s.repositories) {
    m.tick();
    const local = items.filter(
      (e) => e.ref.scope === 'REPOSITORY' && e.ref.repositoryId === repo.repoBasis.repositoryId,
    );
    unique(local.map((e) => String(payload(e).id)));
    for (const field of ['factKey', 'syntaxKey'])
      unique(
        local
          .map(payload)
          .filter((p) => p[field] !== undefined)
          .map((p) => String(p[field])),
      );
    unique(
      local.filter((e) => e.valueSchemaRef === 'SourceFile@1').map((e) => String(payload(e).path)),
    );
    const values = (tag: CaptureValueSchemaRef) =>
      local.filter((e) => e.valueSchemaRef === tag).map((e) => e.value);
    const input = {
      basis: repo.repoBasis,
      externalRefs: local
        .filter((e) => !(e.ref.entity.kind in runtimeGroups))
        .map((e) => e.ref)
        .concat(
          context.availableEntities.filter(
            (r) =>
              r.scope === 'WORKSPACE' ||
              (r.entity.kind === 'REPOSITORY' &&
                r.scope === 'REPOSITORY' &&
                r.repositoryId === repo.repoBasis.repositoryId),
          ),
        ),
      supportInventory: repo.supports.map((x) => x.ref),
      entryPoints: values('EntryPoint@1'),
      tasks: values('TaskDefinition@1'),
      dataResources: values('DataResource@1'),
      triggers: values('DataChangeTrigger@1'),
      contracts: values('Contract@1'),
      contexts: values('ExecutionContext@1'),
      nodes: values('ExecutionNode@1'),
      edges: values('ExecutionEdge@1'),
      flows: values('RuntimeFlow@1'),
    };
    const facts = ir.parseRuntimeFactSet({
      schema: 'codeatlas.runtime-fact-set',
      version: 1,
      payload: input,
    });
    if (values('FrameworkBinding@1').length)
      ir.parseFrameworkBindingSet(
        {
          schema: 'codeatlas.framework-binding-set',
          version: 1,
          payload: {
            basis: repo.repoBasis,
            externalRefs: input.externalRefs,
            supportInventory: input.supportInventory,
            bindings: values('FrameworkBinding@1'),
          },
        },
        facts,
      );
    const syntaxContext = {
      references: context,
      codeNodes: values('CanonicalNode@1'),
      codeEdges: values('CanonicalEdge@1'),
      sourceFiles: values('SourceFile@1'),
    };
    for (const e of local) {
      m.tick();
      if (e.valueSchemaRef === 'SyntaxEvidence@1') ir.parseSyntaxEvidence(e.value, context);
      if (e.valueSchemaRef === 'SyntaxEvidence@2') {
        const { codeEdges: _, ...c } = syntaxContext;
        ir.parseSyntaxEvidenceV2(e.value, c);
      }
      if (e.valueSchemaRef === 'SyntaxEvidence@3') {
        const { codeEdges: _, ...c } = syntaxContext;
        ir.parseSyntaxEvidenceV3(e.value, c);
      }
      if (e.valueSchemaRef === 'SyntaxEvidence@4') ir.parseSyntaxEvidenceV4(e.value, syntaxContext);
    }
    const v3 = local.filter((e) => e.valueSchemaRef === 'SyntaxEvidence@3').map((e) => payload(e));
    if (v3.length) {
      const { codeEdges: _, ...c } = syntaxContext;
      ir.validateSyntaxBindingScopeClosure(v3 as unknown as ir.SyntaxEvidenceV3[], c);
    }
    const v4 = local.filter((e) => e.valueSchemaRef === 'SyntaxEvidence@4').map((e) => payload(e));
    if (v4.length)
      ir.validateSyntaxSurfaceClosure(v4 as unknown as ir.SyntaxEvidenceV4[], syntaxContext);
  }
  unique(
    items
      .filter((e) => e.valueSchemaRef === 'WorkspaceExecutionNode@1')
      .map((e) => encode(payload(e).repositoryRuntimeRef, m)),
  );
  for (const d of s.documents) {
    m.tick();
    const local = items.filter(
      (e) =>
        docKinds.has(e.ref.entity.kind) &&
        e.ref.entity.revisionId === d.documentBasis.documentRevisionId,
    );
    const values = (tag: CaptureValueSchemaRef) =>
      local.filter((e) => e.valueSchemaRef === tag).map((e) => e.value);
    check(values('Document@1').length === 1 && values('DocumentRevision@1').length === 1);
    const root = object(values('Document@1')[0]),
      revision = object(values('DocumentRevision@1')[0]);
    check(
      root.id === d.documentBasis.documentId &&
        root.workspaceId === s.workspaceId &&
        revision.id === d.documentBasis.documentRevisionId &&
        revision.sourceFingerprint === d.documentBasis.contentFingerprint &&
        revision.parserVersion === d.parserVersion &&
        revision.policyVersion === d.policyVersion &&
        revision.completeness === 'COMPLETE',
    );
    if (root.repositoryId !== null)
      check(s.selection.repositoryIds.includes(String(root.repositoryId)));
    ir.parseDocumentBundle({
      schema: 'codeatlas.document-bundle',
      version: 1,
      payload: {
        document: root,
        revision,
        externalRefs: context.availableEntities.filter(
          (r) => !local.some((e) => ir.scopedRefKey(e.ref) === ir.scopedRefKey(r)),
        ),
        supportInventory: context.availableSupports,
        sections: values('DocumentSection@1'),
        blocks: values('DocumentBlock@1'),
        tables: values('DocumentTable@1'),
        links: values('DocumentLink@1'),
        codeSnippets: values('DocumentCodeSnippet@1'),
        mentions: values('DocumentEntityMention@1'),
        chunks: values('DocumentChunk@1'),
        claims: [],
      },
    });
  }
  for (const e of items) {
    m.tick();
    if (e.valueSchemaRef === 'ContractMatch@1')
      ir.parseContractMatch(
        { schema: 'codeatlas.contract-match', version: 1, payload: e.value },
        context,
      );
    if (e.valueSchemaRef === 'ServiceIdentity@1') {
      const v = e.value as CaptureValueMap['ServiceIdentity@1'];
      check(v.supportRefs.some((r) => ir.basisKey(r.basis) === ir.basisKey(v.sourceBasis)));
    }
    if (e.valueSchemaRef === 'WorkspaceExecutionEdge@1') {
      const v = e.value as CaptureValueMap['WorkspaceExecutionEdge@1'];
      for (const r of [v.sourceRef, v.targetRef])
        check(
          r.scope === 'WORKSPACE' &&
            r.workspaceId === s.workspaceId &&
            r.entity.kind === 'WORKSPACE_EXECUTION_NODE' &&
            r.entity.revisionId === s.revisionSetId,
        );
      check(
        v.matchRef.scope === 'WORKSPACE' &&
          v.matchRef.workspaceId === s.workspaceId &&
          v.matchRef.entity.kind === 'CONTRACT_MATCH' &&
          v.matchRef.entity.revisionId === s.revisionSetId,
      );
    }
  }
}
function snapshot(
  input: unknown,
  m: Meter,
  suppliedDigest: boolean,
  select = false,
): CompilationInputSnapshot {
  const fields = [
    'schemaVersion',
    'snapshotId',
    'workspaceId',
    'scope',
    'revisionSetId',
    'selection',
    'workspaceCapture',
    'repositories',
    'documents',
    'policyVersions',
    'captureWindow',
    'coverage',
  ];
  const v = exact(own(input, m), suppliedDigest ? [...fields, 'inputDigest'] : fields);
  check(v.schemaVersion === 1);
  const window = exact(v.captureWindow, ['startedAt', 'completedAt']);
  const startedAt = ir.UtcInstantSchema.parse(window.startedAt),
    completedAt = ir.UtcInstantSchema.parse(window.completedAt);
  check(startedAt <= completedAt);
  const s: CompilationInputSnapshot = {
    schemaVersion: 1,
    snapshotId: ir.EntityIdSchema.parse(v.snapshotId),
    workspaceId: ir.EntityIdSchema.parse(v.workspaceId),
    scope: scope(v.scope, m),
    revisionSetId: ir.EntityIdSchema.parse(v.revisionSetId),
    selection: selection(v.selection, m),
    workspaceCapture: v.workspaceCapture === null ? null : workspace(v.workspaceCapture, m),
    repositories: sorted(
      array(v.repositories).map((r) => repository(r, m)),
      (r) => r.repoBasis.repositoryId,
      m,
    ),
    documents: sorted(
      array(v.documents).map((d) => document(d, m)),
      (d) => encode([d.documentBasis.documentId, d.documentBasis.documentRevisionId], m),
      m,
    ),
    policyVersions: policy(v.policyVersions),
    captureWindow: { startedAt, completedAt },
    coverage: coverage(v.coverage, m),
    inputDigest: '',
  };
  closure(s, m, select);
  const { snapshotId: _, captureWindow: __, inputDigest: ___, ...content } = s;
  s.inputDigest = hash('codeatlas.compilation-input.v1\n', content, m);
  if (suppliedDigest)
    check(ir.Phase1DigestSchema.parse(v.inputDigest) === s.inputDigest, 'INPUT_DIGEST_MISMATCH');
  return s;
}
/** Structural creation only: never use this result as a capture/permission receipt. */
export function createCompilationInputSnapshot(
  input: unknown,
  control: ir.RuntimeRequestControl,
): CompilationInputSnapshot {
  return boundary(control, (m) => snapshot(input, m, false));
}
/** Resolve owners and authorize access independently before consuming persisted DTOs. */
export function parseCompilationInputSnapshot(
  input: unknown,
  control: ir.RuntimeRequestControl,
): CompilationInputSnapshot {
  return boundary(control, (m) => snapshot(input, m, true));
}
/** Select from an already authorized owned dataset. This pure operation does not
 * authorize its input; it retains the explicit selection independently of closure. */
export function selectCompilationCaptureClosure(
  input: unknown,
  control: ir.RuntimeRequestControl,
): CompilationInputSnapshot {
  return boundary(control, (m) => snapshot(input, m, false, true));
}
