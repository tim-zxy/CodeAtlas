import {
  CanonicalEdgeSchema,
  CanonicalNodeSchema,
  EvidenceSchema,
  ProviderFactBindingSchema,
  SourceFileSchema,
} from '@codeatlas/ir';
import type { CanonicalEdge, CanonicalFactRef, CanonicalId, CanonicalNode } from '@codeatlas/ir';

import {
  CodeQueryError,
  parseCodeQueryEnvelope,
  parseCodeQueryRequest,
} from './code-query-contract.js';
import type {
  CodeQueryPayload,
  CodeQueryRequest,
  CodeReadPort,
  CoverageObservation,
  QueryControl,
  QueryEvidenceRef,
  QuerySourceRef,
  QueryTruncation,
  QueryWarning,
} from './code-query-contract.js';

function invalid(): never {
  throw new CodeQueryError('QUERY_DATA_INVALID');
}
function compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}
function factKey(fact: CanonicalFactRef): string {
  return JSON.stringify([fact.factType, fact.id]);
}

export async function executeCodeQuery(
  requestValue: CodeQueryRequest,
  port: CodeReadPort,
  control: QueryControl,
) {
  const request = parseCodeQueryRequest(requestValue);
  await control.checkpoint();
  const context = port.context;
  if (context.repositoryId !== request.repositoryId) invalid();
  function node(value: unknown): CanonicalNode {
    let parsed;
    try {
      parsed = CanonicalNodeSchema.parse(value);
    } catch {
      return invalid();
    }
    if (parsed.repositoryId !== context.repositoryId || parsed.revisionId !== context.revisionId)
      invalid();
    return parsed;
  }
  async function selected(id: CanonicalId, root = true) {
    const value = await port.readNode(id);
    if (value === null) {
      if (root) throw new CodeQueryError('SYMBOL_NOT_FOUND');
      return invalid();
    }
    const result = node(value);
    if (result.id !== id) invalid();
    if (root && result.kind !== 'TYPE' && result.kind !== 'SYMBOL')
      throw new CodeQueryError('SYMBOL_NOT_FOUND');
    return result;
  }
  async function* relations(id: CanonicalId, direction: 'INCOMING' | 'OUTGOING', calls = false) {
    let previous: string | null = null;
    for await (const value of port.readEdges(id, direction, calls ? 'CALL' : null)) {
      await control.checkpoint();
      let result;
      try {
        result = CanonicalEdgeSchema.parse(value);
      } catch {
        return invalid();
      }
      if (
        result.repositoryId !== context.repositoryId ||
        result.revisionId !== context.revisionId ||
        (calls && result.kind !== 'CALL') ||
        (previous !== null && compare(previous, result.id) >= 0) ||
        (direction === 'OUTGOING'
          ? result.source.id !== id
          : result.target.state !== 'RESOLVED' || result.target.target.id !== id)
      )
        invalid();
      previous = result.id;
      yield result;
    }
  }
  const truncation = new Set<QueryTruncation>();
  const facts = new Map<string, { fact: CanonicalFactRef; value: CanonicalNode | CanonicalEdge }>();
  function include(value: CanonicalNode | CanonicalEdge, factType: 'NODE' | 'EDGE'): void {
    const fact = { factType, id: value.id };
    facts.set(factKey(fact), { fact, value });
  }
  let operationPayload: Pick<CodeQueryPayload, 'operation'> & Record<string, unknown>;
  if (request.operation === 'SEARCH') {
    const symbols: CanonicalNode[] = [];
    for await (const value of port.findNodes(request.name, request.match)) {
      await control.checkpoint();
      const result = node(value);
      if (result.kind !== 'TYPE' && result.kind !== 'SYMBOL') invalid();
      const matches = [result.name, result.qualifiedName].some(
        (name) =>
          name !== null &&
          (request.match === 'exact' ? name === request.name : name.startsWith(request.name)),
      );
      if (!matches) invalid();
      if (symbols.length === request.budget.maxNodes) {
        truncation.add('NODE_LIMIT');
        break;
      }
      symbols.push(result);
      include(result, 'NODE');
    }
    operationPayload = { operation: 'SEARCH', symbols };
  } else {
    const symbol = await selected(request.symbolId);
    include(symbol, 'NODE');
    if (request.operation === 'GET_SYMBOL') operationPayload = { operation: 'GET_SYMBOL', symbol };
    else if (request.operation === 'CODE_TRACE') {
      const nodes = [{ node: symbol, depth: 0 }];
      const byId = new Map<CanonicalId, CanonicalNode>([[symbol.id, symbol]]);
      const edges: CanonicalEdge[] = [];
      const seenEdges = new Set<CanonicalId>();
      let stopped = false;
      for (let index = 0; index < nodes.length && !stopped; index++) {
        const current = nodes[index]!;
        if (current.depth === request.maxDepth) {
          if (await port.hasOutgoingCall(current.node.id)) truncation.add('DEPTH_LIMIT');
          continue;
        }
        for await (const edge of relations(current.node.id, 'OUTGOING', true)) {
          if (seenEdges.has(edge.id)) continue;
          if (edges.length === request.budget.maxEdges) {
            truncation.add('EDGE_LIMIT');
            stopped = true;
            break;
          }
          if (edge.target.state === 'RESOLVED' && !byId.has(edge.target.target.id)) {
            const target = await selected(edge.target.target.id, false);
            if (nodes.length === request.budget.maxNodes) {
              truncation.add('NODE_LIMIT');
              stopped = true;
              break;
            }
            byId.set(target.id, target);
            nodes.push({ node: target, depth: current.depth + 1 });
            include(target, 'NODE');
          }
          seenEdges.add(edge.id);
          edges.push(edge);
          include(edge, 'EDGE');
        }
      }
      operationPayload = { operation: 'CODE_TRACE', nodes, edges };
    } else {
      const seen = new Set<CanonicalId>();
      async function direction(value: 'INCOMING' | 'OUTGOING') {
        const edges: CanonicalEdge[] = [];
        for await (const edge of relations(symbol.id, value)) {
          if (!seen.has(edge.id) && seen.size === request.budget.maxEdges) {
            truncation.add(value === 'INCOMING' ? 'INCOMING_LIMIT' : 'OUTGOING_LIMIT');
            break;
          }
          seen.add(edge.id);
          edges.push(edge);
          include(edge, 'EDGE');
        }
        return edges;
      }
      if (request.operation === 'UNDERSTAND') {
        const incoming = await direction('INCOMING');
        const outgoing = await direction('OUTGOING');
        operationPayload = { operation: 'UNDERSTAND', symbol, incoming, outgoing };
      } else
        operationPayload = {
          operation: request.operation,
          symbol,
          edges: await direction(request.operation),
        };
    }
  }
  const warnings = new Set<QueryWarning>(['REPOSITORY_COVERAGE_UNPROVEN', 'WORKTREE_NOT_OBSERVED']);
  if (context.freshness.state === 'STALE') warnings.add('SOURCE_STALE');
  if (context.freshness.state === 'UNKNOWN') warnings.add('SOURCE_FRESHNESS_UNKNOWN');
  const sources = new Map<string, QuerySourceRef>();
  const evidenceRefs = new Map<string, QueryEvidenceRef>();
  const observations = new Map<string, CoverageObservation>();
  for (const { fact, value } of facts.values()) {
    if ('target' in value && value.target.state === 'UNRESOLVED')
      warnings.add('INCOMPLETE_RESOLUTION');
    let supported = false;
    let located = value.sourceRange === null;
    let covered = false;
    for await (const row of port.readMetadata(fact)) {
      await control.checkpoint();
      if (row.kind === 'SOURCE') {
        let source;
        try {
          source = SourceFileSchema.parse(row.sourceFile);
        } catch {
          return invalid();
        }
        if (
          source.repositoryId !== context.repositoryId ||
          source.revisionId !== context.revisionId ||
          source.id !== value.sourceRange?.sourceFileId
        )
          invalid();
        located = true;
        const ref = {
          sourceFileId: source.id,
          revisionId: source.revisionId,
          path: source.path,
          range: value.sourceRange,
        };
        sources.set(JSON.stringify([ref.sourceFileId, ref.range]), ref);
      } else if (row.kind === 'SUPPORT') {
        let evidence;
        let binding;
        try {
          evidence = EvidenceSchema.parse(row.evidence);
          binding = ProviderFactBindingSchema.parse(row.binding);
        } catch {
          return invalid();
        }
        if (
          evidence.status !== 'ACTIVE' ||
          evidence.repositoryId !== context.repositoryId ||
          evidence.revisionId !== context.revisionId ||
          factKey(row.fact) !== factKey(fact) ||
          factKey(binding.canonicalFact) !== factKey(fact) ||
          binding.evidenceId !== evidence.id ||
          binding.providerSnapshotId !== evidence.providerSnapshotId ||
          JSON.stringify(binding.providerFact) !== JSON.stringify(evidence.providerFact) ||
          row.snapshot.id !== evidence.providerSnapshotId ||
          row.snapshot.repositoryId !== context.repositoryId ||
          row.snapshot.requestedRevisionId !== context.revisionId ||
          row.snapshot.outcome !== 'SUCCEEDED'
        )
          invalid();
        supported = true;
        const ref = {
          fact,
          evidenceId: evidence.id,
          providerSnapshotId: evidence.providerSnapshotId,
        };
        evidenceRefs.set(JSON.stringify([factKey(fact), evidence.id]), ref);
        if (row.snapshot.requestedRevisionFingerprint !== context.indexedContentFingerprint)
          warnings.add('COVERAGE_OBSERVATION_OLDER_THAN_ACTIVE');
      } else if (row.kind === 'COVERAGE') {
        covered = true;
        const { kind: _kind, ...observation } = row;
        observations.set(
          JSON.stringify([
            observation.snapshot.id,
            observation.capability,
            observation.sourceFileId,
            observation.rowId,
          ]),
          observation,
        );
        if (observation.support === 'UNSUPPORTED') warnings.add('UNSUPPORTED_COVERAGE');
        if (
          observation.capabilityCoverage !== 'COMPLETE' ||
          (observation.fileCoverage !== null && observation.fileCoverage !== 'COMPLETE')
        )
          warnings.add('PARTIAL_COVERAGE');
        if (observation.fileCoverage === null) warnings.add('COVERAGE_UNKNOWN');
      } else invalid();
    }
    if (!supported || !located) invalid();
    if (!covered) warnings.add('COVERAGE_UNKNOWN');
  }
  if (observations.size === 0) warnings.add('COVERAGE_UNKNOWN');
  const byJson = <T>(values: Iterable<T>) =>
    [...values].sort((left, right) => compare(JSON.stringify(left), JSON.stringify(right)));
  const payload = {
    ...context,
    ...operationPayload,
    budget: request.budget,
    warnings: [...warnings].sort(),
    truncation: [...truncation].sort(),
    refs: {
      facts: byJson([...facts.values()].map(({ fact }) => fact)),
      sources: byJson(sources.values()),
      evidence: byJson(evidenceRefs.values()),
    },
    coverage: {
      basis: 'SUPPORT_SNAPSHOTS',
      observations: [...observations.values()].sort(
        (left, right) =>
          compare(left.snapshot.id, right.snapshot.id) ||
          compare(left.capability, right.capability) ||
          compare(left.sourceFileId ?? '', right.sourceFileId ?? '') ||
          (left.rowId ?? 0) - (right.rowId ?? 0),
      ),
    },
  };
  await control.checkpoint();
  return parseCodeQueryEnvelope({ schema: 'code-query-result', version: 1, payload });
}

export const getSymbol = (
  request: Extract<CodeQueryRequest, { operation: 'GET_SYMBOL' }>,
  port: CodeReadPort,
  control: QueryControl,
) => executeCodeQuery(request, port, control);
export const findSymbols = (
  request: Extract<CodeQueryRequest, { operation: 'SEARCH' }>,
  port: CodeReadPort,
  control: QueryControl,
) => executeCodeQuery(request, port, control);
export const getIncomingEdges = (
  request: Extract<CodeQueryRequest, { operation: 'INCOMING' }>,
  port: CodeReadPort,
  control: QueryControl,
) => executeCodeQuery(request, port, control);
export const getOutgoingEdges = (
  request: Extract<CodeQueryRequest, { operation: 'OUTGOING' }>,
  port: CodeReadPort,
  control: QueryControl,
) => executeCodeQuery(request, port, control);
export const understandSymbol = (
  request: Extract<CodeQueryRequest, { operation: 'UNDERSTAND' }>,
  port: CodeReadPort,
  control: QueryControl,
) => executeCodeQuery(request, port, control);
export const traceCode = (
  request: Extract<CodeQueryRequest, { operation: 'CODE_TRACE' }>,
  port: CodeReadPort,
  control: QueryControl,
) => executeCodeQuery(request, port, control);
