import { performance } from 'node:perf_hooks';
import { setImmediate } from 'node:timers/promises';

import {
  CanonicalEdgeSchema,
  CanonicalFactRefSchema,
  CanonicalIdSchema,
  CanonicalNodeSchema,
  ContentFingerprintSchema,
  EntityIdSchema,
  EvidenceIdSchema,
  ProviderCapabilitySupportSchema,
  ProviderCoverageStatusSchema,
  ProviderSnapshotOutcomeSchema,
  RepositoryRelativePathSchema,
  SchemaEnvelopeSchema,
  SourceRangeSchema,
  UtcInstantSchema,
} from '@codeatlas/ir';
import type {
  CanonicalEdge,
  CanonicalFactRef,
  CanonicalId,
  CanonicalNode,
  CodeEdgeKind,
  ContentFingerprint,
  EntityId,
  Evidence,
  EvidenceId,
  ProviderFactBinding,
  ProviderSnapshot,
  SchemaEnvelope,
  SourceFile,
  SourceRange,
} from '@codeatlas/ir';

export type CodeQueryErrorCode =
  | 'INVALID_QUERY'
  | 'DATABASE_UNAVAILABLE'
  | 'DATABASE_KIND_MISMATCH'
  | 'DATABASE_UPGRADE_REQUIRED'
  | 'DATABASE_TOO_NEW'
  | 'REPOSITORY_NOT_FOUND'
  | 'NOT_INDEXED'
  | 'SYMBOL_NOT_FOUND'
  | 'QUERY_DATA_INVALID'
  | 'QUERY_BUDGET_EXCEEDED'
  | 'QUERY_TIMEOUT'
  | 'QUERY_CANCELLED';

const messages: Record<CodeQueryErrorCode, string> = {
  INVALID_QUERY: 'Supply a valid query with explicit budgets.',
  DATABASE_UNAVAILABLE: 'Select an accessible existing repository database.',
  DATABASE_KIND_MISMATCH: 'Select a repository database, not a workspace database.',
  DATABASE_UPGRADE_REQUIRED: 'Upgrade the database explicitly before querying.',
  DATABASE_TOO_NEW: 'Use a reader compatible with this database version.',
  REPOSITORY_NOT_FOUND: 'Select the repository identity stored in this database.',
  NOT_INDEXED: 'Explicitly index this repository before querying.',
  SYMBOL_NOT_FOUND: 'Select a TYPE or SYMBOL in the active graph.',
  QUERY_DATA_INVALID: 'The selected stored query data is invalid.',
  QUERY_BUDGET_EXCEEDED: 'The query cannot fit its explicit result or metadata budget.',
  QUERY_TIMEOUT: 'The cooperative query deadline has expired.',
  QUERY_CANCELLED: 'The query was cancelled.',
};

export class CodeQueryError extends Error {
  constructor(readonly code: CodeQueryErrorCode) {
    super(messages[code]);
    this.name = 'CodeQueryError';
  }
}

export type QueryBudget = {
  maxNodes: number;
  maxEdges: number;
  maxMetadataRows: number;
  maxResultBytes: number;
  timeoutMs: number;
};
type QueryBase = { repositoryId: EntityId; budget: QueryBudget };
export type CodeQueryRequest = QueryBase &
  (
    | { operation: 'SEARCH'; name: string; match: 'exact' | 'prefix' }
    | { operation: 'CODE_TRACE'; symbolId: CanonicalId; maxDepth: number }
    | { operation: 'GET_SYMBOL'; symbolId: CanonicalId }
    | { operation: 'INCOMING'; symbolId: CanonicalId }
    | { operation: 'OUTGOING'; symbolId: CanonicalId }
    | { operation: 'UNDERSTAND'; symbolId: CanonicalId }
  );
export type QueryOperation = CodeQueryRequest['operation'];
export type QueryFreshness = {
  state: 'CURRENT' | 'STALE' | 'UNKNOWN';
  basis: 'PERSISTED_SOURCE';
  worktreeObservation: 'NOT_OBSERVED';
};
export type CodeQueryContext = {
  repositoryId: EntityId;
  revisionId: EntityId;
  indexedContentFingerprint: ContentFingerprint | null;
  freshness: QueryFreshness;
};
export type SnapshotProvenance = Pick<
  ProviderSnapshot,
  | 'id'
  | 'repositoryId'
  | 'requestedRevisionId'
  | 'requestedRevisionFingerprint'
  | 'startedAt'
  | 'completedAt'
  | 'outcome'
>;
export type CoverageObservation = {
  snapshot: SnapshotProvenance;
  capability: string;
  support: 'SUPPORTED' | 'UNSUPPORTED';
  capabilityCoverage: 'COMPLETE' | 'PARTIAL' | 'NONE' | 'UNKNOWN';
  sourceFileId: EntityId | null;
  rowId: number | null;
  fileCoverage: 'COMPLETE' | 'PARTIAL' | 'NONE' | 'UNKNOWN' | null;
};
export type CodeMetadataRow =
  | { kind: 'SOURCE'; sourceFile: SourceFile }
  | {
      kind: 'SUPPORT';
      fact: CanonicalFactRef;
      evidence: Evidence;
      binding: ProviderFactBinding;
      snapshot: SnapshotProvenance;
    }
  | ({ kind: 'COVERAGE' } & CoverageObservation);
export interface QueryControl {
  checkpoint(): Promise<void>;
  reserveText(bytes: number): void;
  chargeMetadataRow(): void;
}
export interface CodeReadPort {
  readonly context: CodeQueryContext;
  readNode(id: CanonicalId): Promise<CanonicalNode | null>;
  findNodes(name: string, match: 'exact' | 'prefix'): AsyncIterable<CanonicalNode>;
  readEdges(
    id: CanonicalId,
    direction: 'INCOMING' | 'OUTGOING',
    kind: CodeEdgeKind | null,
  ): AsyncIterable<CanonicalEdge>;
  hasOutgoingCall(id: CanonicalId): Promise<boolean>;
  readMetadata(fact: CanonicalFactRef): AsyncIterable<CodeMetadataRow>;
}
export type QuerySourceRef = {
  sourceFileId: EntityId;
  revisionId: EntityId;
  path: string;
  range: SourceRange | null;
};
export type QueryEvidenceRef = {
  fact: CanonicalFactRef;
  evidenceId: EvidenceId;
  providerSnapshotId: EntityId;
};
export type QueryWarning =
  | 'WORKTREE_NOT_OBSERVED'
  | 'REPOSITORY_COVERAGE_UNPROVEN'
  | 'COVERAGE_UNKNOWN'
  | 'COVERAGE_OBSERVATION_OLDER_THAN_ACTIVE'
  | 'PARTIAL_COVERAGE'
  | 'UNSUPPORTED_COVERAGE'
  | 'SOURCE_STALE'
  | 'SOURCE_FRESHNESS_UNKNOWN'
  | 'INCOMPLETE_RESOLUTION';
export type QueryTruncation =
  'NODE_LIMIT' | 'EDGE_LIMIT' | 'DEPTH_LIMIT' | 'INCOMING_LIMIT' | 'OUTGOING_LIMIT';
type QueryResultBase = CodeQueryContext & {
  budget: QueryBudget;
  warnings: QueryWarning[];
  truncation: QueryTruncation[];
  refs: { facts: CanonicalFactRef[]; sources: QuerySourceRef[]; evidence: QueryEvidenceRef[] };
  coverage: { basis: 'SUPPORT_SNAPSHOTS'; observations: CoverageObservation[] };
};
export type CodeQueryPayload = QueryResultBase &
  (
    | { operation: 'SEARCH'; symbols: CanonicalNode[] }
    | { operation: 'GET_SYMBOL'; symbol: CanonicalNode }
    | { operation: 'INCOMING' | 'OUTGOING'; symbol: CanonicalNode; edges: CanonicalEdge[] }
    | {
        operation: 'UNDERSTAND';
        symbol: CanonicalNode;
        incoming: CanonicalEdge[];
        outgoing: CanonicalEdge[];
      }
    | {
        operation: 'CODE_TRACE';
        nodes: { node: CanonicalNode; depth: number }[];
        edges: CanonicalEdge[];
      }
  );

const budgetKeys = ['maxNodes', 'maxEdges', 'maxMetadataRows', 'maxResultBytes', 'timeoutMs'];
const warnings = [
  'WORKTREE_NOT_OBSERVED',
  'REPOSITORY_COVERAGE_UNPROVEN',
  'COVERAGE_UNKNOWN',
  'COVERAGE_OBSERVATION_OLDER_THAN_ACTIVE',
  'PARTIAL_COVERAGE',
  'UNSUPPORTED_COVERAGE',
  'SOURCE_STALE',
  'SOURCE_FRESHNESS_UNKNOWN',
  'INCOMPLETE_RESOLUTION',
];
const truncations = ['NODE_LIMIT', 'EDGE_LIMIT', 'DEPTH_LIMIT', 'INCOMING_LIMIT', 'OUTGOING_LIMIT'];

function fail(code: CodeQueryErrorCode): never {
  throw new CodeQueryError(code);
}
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    fail('QUERY_DATA_INVALID');
  for (const name of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name)!;
    if (typeof name !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
      fail('QUERY_DATA_INVALID');
  }
  return value as Record<string, unknown>;
}
function keys(value: unknown, expected: readonly string[]): Record<string, unknown> {
  const row = record(value);
  const names = Reflect.ownKeys(row);
  if (
    names.length !== expected.length ||
    expected.some((name) => !Object.hasOwn(row, name)) ||
    names.some(
      (name) =>
        typeof name !== 'string' ||
        !expected.includes(name) ||
        !Object.getOwnPropertyDescriptor(row, name)?.enumerable ||
        !Object.hasOwn(Object.getOwnPropertyDescriptor(row, name)!, 'value'),
    )
  )
    fail('QUERY_DATA_INVALID');
  return row;
}
function integer(value: unknown, minimum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    Object.is(value, -0)
  )
    fail('QUERY_DATA_INVALID');
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value)
    fail('QUERY_DATA_INVALID');
  return value;
}
function oneOf(value: unknown, choices: readonly string[]): void {
  if (typeof value !== 'string' || !choices.includes(value)) fail('QUERY_DATA_INVALID');
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || Object.keys(value).length !== value.length)
    fail('QUERY_DATA_INVALID');
  return value;
}
function parseBudget(value: unknown): QueryBudget {
  const row = keys(value, budgetKeys);
  for (const key of budgetKeys) integer(row[key], 1);
  return {
    maxNodes: row.maxNodes as number,
    maxEdges: row.maxEdges as number,
    maxMetadataRows: row.maxMetadataRows as number,
    maxResultBytes: row.maxResultBytes as number,
    timeoutMs: row.timeoutMs as number,
  };
}

export function parseCodeQueryRequest(value: unknown): CodeQueryRequest {
  try {
    const row = record(value);
    const extra =
      row.operation === 'SEARCH'
        ? ['name', 'match']
        : row.operation === 'CODE_TRACE'
          ? ['symbolId', 'maxDepth']
          : ['symbolId'];
    keys(row, ['operation', 'repositoryId', 'budget', ...extra]);
    oneOf(row.operation, [
      'GET_SYMBOL',
      'SEARCH',
      'INCOMING',
      'OUTGOING',
      'UNDERSTAND',
      'CODE_TRACE',
    ]);
    const repositoryId = EntityIdSchema.parse(row.repositoryId);
    const budget = parseBudget(row.budget);
    if (row.operation === 'SEARCH') {
      oneOf(row.match, ['exact', 'prefix']);
      return {
        operation: 'SEARCH',
        repositoryId,
        budget,
        name: text(row.name),
        match: row.match as 'exact' | 'prefix',
      };
    }
    const symbolId = CanonicalIdSchema.parse(row.symbolId);
    if (row.operation === 'CODE_TRACE')
      return {
        operation: 'CODE_TRACE',
        repositoryId,
        symbolId,
        budget,
        maxDepth: integer(row.maxDepth, 0),
      };
    return {
      operation: row.operation as 'GET_SYMBOL' | 'INCOMING' | 'OUTGOING' | 'UNDERSTAND',
      repositoryId,
      symbolId,
      budget,
    };
  } catch {
    return fail('INVALID_QUERY');
  }
}

export function createQueryControl(budgetValue: QueryBudget, signal?: AbortSignal): QueryControl {
  let budget: QueryBudget;
  try {
    budget = parseBudget(budgetValue);
  } catch {
    return fail('INVALID_QUERY');
  }
  const start = performance.now();
  let bytes = 0;
  let rows = 0;
  function check(): void {
    if (signal?.aborted) fail('QUERY_CANCELLED');
    if (performance.now() - start >= budget.timeoutMs) fail('QUERY_TIMEOUT');
  }
  return {
    async checkpoint() {
      check();
      await setImmediate();
      check();
    },
    reserveText(value) {
      check();
      integer(value, 0);
      if (value > budget.maxResultBytes - bytes) fail('QUERY_BUDGET_EXCEEDED');
      bytes += value;
    },
    chargeMetadataRow() {
      check();
      if (rows >= budget.maxMetadataRows) fail('QUERY_BUDGET_EXCEEDED');
      rows++;
    },
  };
}

function codes(value: unknown, choices: readonly string[]): void {
  const values = array(value);
  let previous: string | null = null;
  for (const current of values) {
    oneOf(current, choices);
    if (previous !== null && previous >= (current as string)) fail('QUERY_DATA_INVALID');
    previous = current as string;
  }
}
function snapshot(value: unknown): void {
  const row = keys(value, [
    'id',
    'repositoryId',
    'requestedRevisionId',
    'requestedRevisionFingerprint',
    'startedAt',
    'completedAt',
    'outcome',
  ]);
  EntityIdSchema.parse(row.id);
  EntityIdSchema.parse(row.repositoryId);
  EntityIdSchema.parse(row.requestedRevisionId);
  ContentFingerprintSchema.parse(row.requestedRevisionFingerprint);
  const started = UtcInstantSchema.parse(row.startedAt);
  const completed = UtcInstantSchema.parse(row.completedAt);
  if (started > completed) fail('QUERY_DATA_INVALID');
  ProviderSnapshotOutcomeSchema.parse(row.outcome);
}

export function parseCodeQueryEnvelope(value: unknown): SchemaEnvelope<CodeQueryPayload> {
  try {
    const envelope = SchemaEnvelopeSchema.parse(value);
    if (envelope.schema !== 'code-query-result' || envelope.version !== 1)
      fail('QUERY_DATA_INVALID');
    const payload = record(envelope.payload);
    const fields: Record<string, string[]> = {
      SEARCH: ['symbols'],
      GET_SYMBOL: ['symbol'],
      INCOMING: ['symbol', 'edges'],
      OUTGOING: ['symbol', 'edges'],
      UNDERSTAND: ['symbol', 'incoming', 'outgoing'],
      CODE_TRACE: ['nodes', 'edges'],
    };
    oneOf(payload.operation, Object.keys(fields));
    keys(payload, [
      'operation',
      'repositoryId',
      'revisionId',
      'indexedContentFingerprint',
      'freshness',
      'budget',
      'warnings',
      'truncation',
      'refs',
      'coverage',
      ...fields[payload.operation as string]!,
    ]);
    const repositoryId = EntityIdSchema.parse(payload.repositoryId);
    const revisionId = EntityIdSchema.parse(payload.revisionId);
    if (payload.indexedContentFingerprint !== null)
      ContentFingerprintSchema.parse(payload.indexedContentFingerprint);
    const freshness = keys(payload.freshness, ['state', 'basis', 'worktreeObservation']);
    oneOf(freshness.state, ['CURRENT', 'STALE', 'UNKNOWN']);
    if (freshness.basis !== 'PERSISTED_SOURCE' || freshness.worktreeObservation !== 'NOT_OBSERVED')
      fail('QUERY_DATA_INVALID');
    const budget = parseBudget(payload.budget);
    codes(payload.warnings, warnings);
    codes(payload.truncation, truncations);
    if (
      !array(payload.warnings).includes('WORKTREE_NOT_OBSERVED') ||
      !array(payload.warnings).includes('REPOSITORY_COVERAGE_UNPROVEN')
    )
      fail('QUERY_DATA_INVALID');
    const refs = keys(payload.refs, ['facts', 'sources', 'evidence']);
    for (const fact of array(refs.facts)) CanonicalFactRefSchema.parse(fact);
    for (const item of array(refs.sources)) {
      const row = keys(item, ['sourceFileId', 'revisionId', 'path', 'range']);
      EntityIdSchema.parse(row.sourceFileId);
      RepositoryRelativePathSchema.parse(row.path);
      if (EntityIdSchema.parse(row.revisionId) !== revisionId) fail('QUERY_DATA_INVALID');
      if (
        row.range !== null &&
        SourceRangeSchema.parse(row.range).sourceFileId !== row.sourceFileId
      )
        fail('QUERY_DATA_INVALID');
    }
    for (const item of array(refs.evidence)) {
      const row = keys(item, ['fact', 'evidenceId', 'providerSnapshotId']);
      CanonicalFactRefSchema.parse(row.fact);
      EvidenceIdSchema.parse(row.evidenceId);
      EntityIdSchema.parse(row.providerSnapshotId);
    }
    const coverage = keys(payload.coverage, ['basis', 'observations']);
    if (coverage.basis !== 'SUPPORT_SNAPSHOTS') fail('QUERY_DATA_INVALID');
    for (const item of array(coverage.observations)) {
      const row = keys(item, [
        'snapshot',
        'capability',
        'support',
        'capabilityCoverage',
        'sourceFileId',
        'rowId',
        'fileCoverage',
      ]);
      snapshot(row.snapshot);
      const provenance = record(row.snapshot);
      if (provenance.repositoryId !== repositoryId || provenance.requestedRevisionId !== revisionId)
        fail('QUERY_DATA_INVALID');
      text(row.capability);
      ProviderCapabilitySupportSchema.parse(row.support);
      ProviderCoverageStatusSchema.parse(row.capabilityCoverage);
      if (row.sourceFileId !== null) EntityIdSchema.parse(row.sourceFileId);
      if (row.rowId !== null) integer(row.rowId, 1);
      if (row.fileCoverage !== null) ProviderCoverageStatusSchema.parse(row.fileCoverage);
      if ((row.rowId === null) !== (row.fileCoverage === null)) fail('QUERY_DATA_INVALID');
    }
    const nodes =
      payload.operation === 'SEARCH'
        ? array(payload.symbols)
        : payload.operation === 'CODE_TRACE'
          ? array(payload.nodes).map((item) => {
              const row = keys(item, ['node', 'depth']);
              integer(row.depth, 0);
              return row.node;
            })
          : [payload.symbol];
    for (const nodeValue of nodes) {
      const node = CanonicalNodeSchema.parse(nodeValue);
      if (
        node.repositoryId !== repositoryId ||
        node.revisionId !== revisionId ||
        (payload.operation !== 'CODE_TRACE' && node.kind !== 'TYPE' && node.kind !== 'SYMBOL')
      )
        fail('QUERY_DATA_INVALID');
    }
    const edges =
      payload.operation === 'UNDERSTAND'
        ? [...array(payload.incoming), ...array(payload.outgoing)]
        : 'edges' in payload
          ? array(payload.edges)
          : [];
    for (const edgeValue of edges) {
      const edge = CanonicalEdgeSchema.parse(edgeValue);
      if (
        edge.repositoryId !== repositoryId ||
        edge.revisionId !== revisionId ||
        (payload.operation === 'CODE_TRACE' && edge.kind !== 'CALL')
      )
        fail('QUERY_DATA_INVALID');
    }
    const selected = new Set([
      ...nodes.map((node) => `NODE:${record(node).id as string}`),
      ...edges.map((edge) => `EDGE:${record(edge).id as string}`),
    ]);
    const declared = array(refs.facts).map((fact) => {
      const row = record(fact);
      return `${row.factType as string}:${row.id as string}`;
    });
    if (
      declared.length !== selected.size ||
      new Set(declared).size !== declared.length ||
      declared.some((key) => !selected.has(key))
    )
      fail('QUERY_DATA_INVALID');
    const supported = new Set<string>();
    const supportIds = new Set<string>();
    for (const item of array(refs.evidence)) {
      const row = record(item);
      const fact = record(row.fact);
      const key = `${fact.factType as string}:${fact.id as string}`;
      const support = `${key}:${row.evidenceId as string}`;
      if (!selected.has(key) || supportIds.has(support)) fail('QUERY_DATA_INVALID');
      supported.add(key);
      supportIds.add(support);
    }
    if ([...selected].some((key) => !supported.has(key))) fail('QUERY_DATA_INVALID');
    if (payload.operation === 'CODE_TRACE') {
      const traceNodes = array(payload.nodes);
      if (traceNodes.length === 0 || record(traceNodes[0]).depth !== 0) fail('QUERY_DATA_INVALID');
      const root = CanonicalNodeSchema.parse(record(traceNodes[0]).node);
      if (root.kind !== 'TYPE' && root.kind !== 'SYMBOL') fail('QUERY_DATA_INVALID');
      const ids = new Set(nodes.map((node) => record(node).id));
      if (ids.size !== nodes.length) fail('QUERY_DATA_INVALID');
      for (const value of edges) {
        const edge = CanonicalEdgeSchema.parse(value);
        if (
          !ids.has(edge.source.id) ||
          (edge.target.state === 'RESOLVED' && !ids.has(edge.target.target.id))
        )
          fail('QUERY_DATA_INVALID');
      }
    }
    if (
      nodes.length > budget.maxNodes ||
      new Set(edges.map((edge) => record(edge).id)).size > budget.maxEdges ||
      Buffer.byteLength(JSON.stringify(envelope), 'utf8') > budget.maxResultBytes
    )
      fail('QUERY_BUDGET_EXCEEDED');
    return envelope as SchemaEnvelope<CodeQueryPayload>;
  } catch (error) {
    if (error instanceof CodeQueryError && error.code === 'QUERY_BUDGET_EXCEEDED') throw error;
    return fail('QUERY_DATA_INVALID');
  }
}
