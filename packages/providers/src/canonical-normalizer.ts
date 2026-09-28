import { isDeepStrictEqual } from 'node:util';

import {
  CanonicalEdgeSchema,
  type CanonicalEdge,
  type CanonicalNode,
  type CanonicalNodeRef,
  type ProviderEdge,
  type ProviderFactId,
  type ProviderFactRef,
  type ProviderNodeRef,
  type SourceFile,
} from '@codeatlas/ir';

import { canonicalFactId, edgeFactKey } from './canonical-fact-identity.js';
import {
  CanonicalNormalizationError,
  normalizeJavaNode,
  type CanonicalNormalizationErrorCode,
} from './java-node-normalizer.js';
import { type ValidatedNativeResult } from './native-client.js';
import { NativeEventStreamSchema } from './native-ipc.js';
import { NativeAnalyzeEventStreamV2Schema } from './native-ipc-v2.js';

export interface NormalizedNodePair {
  readonly provider: ProviderNodeRef;
  readonly canonical: CanonicalNode;
}

export interface NormalizedEdgePair {
  readonly provider: ProviderFactRef;
  readonly canonical: CanonicalEdge;
}

export interface NormalizedCanonicalAnalysis {
  readonly nodes: readonly NormalizedNodePair[];
  readonly edges: readonly NormalizedEdgePair[];
  readonly nodeRefsByProviderFactId: ReadonlyMap<ProviderFactId, CanonicalNodeRef>;
}

function fail(
  code: CanonicalNormalizationErrorCode,
  path: readonly (string | number)[],
  message: string,
): never {
  throw new CanonicalNormalizationError(code, path, message);
}

function edgeKind(providerKind: string): CanonicalEdge['kind'] {
  switch (providerKind) {
    case 'java.import.normal':
    case 'java.import.static':
    case 'java.import.wildcard':
      return 'IMPORT';
    case 'java.call':
      return 'CALL';
    case 'java.inheritance':
      return 'INHERITANCE';
    case 'java.reference':
      return 'REFERENCE';
    default:
      return fail('UNSUPPORTED_KIND', ['providerKind'], 'Provider edge kind is unsupported');
  }
}

function normalizeJavaEdge(
  edge: ProviderEdge,
  nodes: ReadonlyMap<ProviderFactId, CanonicalNode>,
  sourceFiles: ReadonlyMap<string, SourceFile>,
): CanonicalEdge {
  const kind = edgeKind(edge.providerKind);
  const range = edge.sourceRange;
  if (range === null) fail('INVALID_FACT', ['sourceRange'], 'Relation requires a source range');
  const file = sourceFiles.get(range.sourceFileId);
  if (!file) fail('MISSING_REFERENCE', ['sourceRange', 'sourceFileId'], 'Source file is absent');
  if (file.repositoryId !== edge.repositoryId || file.revisionId !== edge.revisionId) {
    fail('INVALID_CONTEXT', ['sourceRange', 'sourceFileId'], 'Source file context differs');
  }

  function lookup(ref: ProviderNodeRef, path: readonly (string | number)[]): CanonicalNode {
    if (ref.providerId !== edge.providerId) {
      fail('INVALID_CONTEXT', path, 'Relation references another Provider');
    }
    const node = nodes.get(ref.providerFactId);
    if (!node) fail('MISSING_REFERENCE', path, 'Referenced Provider node is absent');
    return node;
  }

  const sourceNode = lookup(edge.source, ['source']);
  const source: CanonicalNodeRef = { factType: 'NODE', id: sourceNode.id };
  let target: CanonicalEdge['target'];
  let targetIdentity: string;
  if (edge.target.state === 'RESOLVED') {
    const resolvedNode = lookup(edge.target.target, ['target', 'target']);
    target = {
      state: 'RESOLVED',
      resolution: edge.target.resolution,
      target: { factType: 'NODE', id: resolvedNode.id },
    };
    targetIdentity = resolvedNode.factKey;
  } else {
    const candidates: CanonicalNodeRef[] = [];
    const seen = new Set<string>();
    edge.target.candidates.forEach((candidate, index) => {
      const node = lookup(candidate, ['target', 'candidates', index]);
      if (!seen.has(node.id)) {
        seen.add(node.id);
        candidates.push({ factType: 'NODE', id: node.id });
      }
    });
    if (edge.target.resolution === 'AMBIGUOUS' && candidates.length < 2) {
      fail('INVALID_FACT', ['target', 'candidates'], 'Ambiguity requires two Canonical candidates');
    }
    target = {
      state: 'UNRESOLVED',
      resolution: edge.target.resolution,
      originalHint: edge.target.originalHint,
      candidates,
    };
    targetIdentity = edge.target.originalHint;
  }
  const factKey = edgeFactKey([
    edge.repositoryId,
    edge.revisionId,
    kind,
    sourceNode.factKey,
    range.sourceFileId,
    range.startLine,
    range.startColumn,
    range.endLine,
    range.endColumn,
    edge.target.state,
    targetIdentity,
  ]);
  return CanonicalEdgeSchema.parse({
    id: canonicalFactId('EDGE', factKey),
    factKey,
    repositoryId: edge.repositoryId,
    revisionId: edge.revisionId,
    kind,
    source,
    target,
    sourceRange: range,
    confidence: edge.confidence,
  });
}

function pairOrder<T extends NormalizedNodePair | NormalizedEdgePair>(left: T, right: T): number {
  const a = `${left.canonical.factKey}\0${left.provider.providerId}\0${left.provider.providerFactId}`;
  const b = `${right.canonical.factKey}\0${right.provider.providerId}\0${right.provider.providerFactId}`;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function normalizeNativeAnalysis(
  result: ValidatedNativeResult,
): NormalizedCanonicalAnalysis {
  if (result.request.type !== 'ANALYZE') {
    fail('INVALID_CONTEXT', ['request', 'type'], 'Only ANALYZE results can be normalized');
  }
  const stream =
    result.request.protocolVersion === 2
      ? NativeAnalyzeEventStreamV2Schema.safeParse({
          request: result.request,
          events: result.events,
        })
      : NativeEventStreamSchema.safeParse({ request: result.request, events: result.events });
  if (!stream.success) {
    fail(
      'INVALID_CONTEXT',
      stream.error.issues[0]?.path.map(String) ?? [],
      'Completed Native stream is invalid',
    );
  }
  const { request, events } = stream.data;
  if (request.type !== 'ANALYZE') {
    fail('INVALID_CONTEXT', ['request', 'type'], 'Only ANALYZE results can be normalized');
  }
  const terminal = events.at(-1);
  if (terminal?.type !== 'ANALYSIS_COMPLETED' || !isDeepStrictEqual(result.terminal, terminal)) {
    fail('INVALID_CONTEXT', ['terminal'], 'Native result is not one completed analysis');
  }

  const sourceFiles = new Map<string, SourceFile>(
    request.payload.sourceFiles.map((file) => [file.id, file]),
  );
  const seenFacts = new Set<string>();
  const canonicalByProviderFactId = new Map<ProviderFactId, CanonicalNode>();
  const nodePairs: NormalizedNodePair[] = [];
  const edgeEvents: { index: number; payload: ProviderEdge }[] = [];
  let providerId: string | undefined;

  for (const [index, event] of events.entries()) {
    if (event.type === 'SOURCE_FILE') {
      const declared = sourceFiles.get(event.payload.id);
      if (!declared || !isDeepStrictEqual(declared, event.payload)) {
        fail(
          'INVALID_CONTEXT',
          ['events', index, 'payload'],
          'Emitted source file differs from request',
        );
      }
      continue;
    }
    if (event.type !== 'NODE' && event.type !== 'EDGE') continue;
    if (providerId !== undefined && event.payload.providerId !== providerId) {
      fail(
        'INVALID_CONTEXT',
        ['events', index, 'payload', 'providerId'],
        'Mixed Providers in one result',
      );
    }
    providerId = event.payload.providerId;
    if (seenFacts.has(event.payload.providerFactId)) {
      fail(
        'INVALID_FACT',
        ['events', index, 'payload', 'providerFactId'],
        'Duplicate Provider Fact ID',
      );
    }
    seenFacts.add(event.payload.providerFactId);
    if (event.type === 'EDGE') {
      edgeEvents.push({ index, payload: event.payload });
      continue;
    }
    let canonical: CanonicalNode;
    try {
      canonical = normalizeJavaNode(event.payload, sourceFiles);
    } catch (error) {
      if (error instanceof CanonicalNormalizationError) {
        fail(error.code, ['events', index, 'payload', ...error.path], error.message);
      }
      throw error;
    }
    canonicalByProviderFactId.set(event.payload.providerFactId, canonical);
    nodePairs.push({
      provider: {
        factType: 'NODE',
        providerId: event.payload.providerId,
        providerFactId: event.payload.providerFactId,
      },
      canonical,
    });
  }

  const edgePairs: NormalizedEdgePair[] = [];
  for (const { index, payload } of edgeEvents) {
    let canonical: CanonicalEdge;
    try {
      canonical = normalizeJavaEdge(payload, canonicalByProviderFactId, sourceFiles);
    } catch (error) {
      if (error instanceof CanonicalNormalizationError) {
        fail(error.code, ['events', index, 'payload', ...error.path], error.message);
      }
      throw error;
    }
    edgePairs.push({
      provider: {
        factType: 'EDGE',
        providerId: payload.providerId,
        providerFactId: payload.providerFactId,
      },
      canonical,
    });
  }

  nodePairs.sort(pairOrder);
  edgePairs.sort(pairOrder);
  const nodeRefsByProviderFactId = new Map<ProviderFactId, CanonicalNodeRef>(
    nodePairs.map(({ provider, canonical }) => [
      provider.providerFactId,
      { factType: 'NODE', id: canonical.id },
    ]),
  );
  return { nodes: nodePairs, edges: edgePairs, nodeRefsByProviderFactId };
}
