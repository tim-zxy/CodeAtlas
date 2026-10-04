// Independent contract observations, not Java parser/resolver expectations.
import { readFile } from 'node:fs/promises';
import { baseCase, factDigest, stateDigest, sha, encode } from './native-full-v3-corpus.mjs';
export { encode };
export async function* chunkBytes(bytes, size = 31) {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size);
}
export function requestBytes(request, baseline) {
  const records = [
    { ...request, sequence: 0 },
    ...baseline.summaries.map((payload, i) => ({
      protocolVersion: 3,
      requestId: request.requestId,
      sequence: i + 1,
      type: 'BASELINE_SUMMARY',
      payload,
    })),
  ];
  records.push({
    protocolVersion: 3,
    requestId: request.requestId,
    sequence: records.length,
    type: 'REQUEST_COMPLETED',
    payload: { summaryRecords: baseline.summaries.length, integrityChecksum: sha(encode(records)) },
  });
  return encode(records);
}
export function finish(records) {
  records.forEach((e, i) => {
    e.sequence = i;
  });
  const terminal = records.at(-1);
  if (terminal.type === 'REFRESH_COMPLETED') {
    terminal.payload.integrityChecksum = `sha256:${sha(encode(records.slice(0, -1)))}`;
  }
  return encode(records);
}
export function buildRefreshCase(mode = 'retained-caller-upsert') {
  const base = baseCase(mode === 'zero-target' ? 'zero-file' : 'shared');
  const capabilities = mode === 'retained-caller-upsert' ? ['SYMBOL', 'CALL'] : ['SYMBOL'];
  const baseline = base.bundle;
  baseline.header.requestedCapabilities = capabilities;
  let oldEdge;
  if (capabilities.includes('CALL')) {
    oldEdge = {
      providerId: 'native',
      providerFactId: 'call-0',
      providerSnapshotId: 'snap',
      repositoryId: 'r',
      revisionId: 'rev',
      providerKind: 'java.call',
      source: { factType: 'NODE', providerId: 'native', providerFactId: 'package-0' },
      target: {
        state: 'UNRESOLVED',
        resolution: 'UNRESOLVED',
        originalHint: 'later',
        candidates: [],
      },
      sourceRange: { sourceFileId: 'f-0', startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 },
      confidence: { score: 1, method: 'parser', reasons: [] },
    };
    baseline.summaries.forEach((s, i) => {
      const c = structuredClone(s.coverage[0]);
      c.capability = 'CALL';
      c.statistics.eligibleSites = c.statistics.coveredSites = i === 0 ? 1 : 0;
      c.statistics.resolutionCounts.UNRESOLVED = i === 0 ? 1 : 0;
      s.coverage.push(c);
    });
    baseline.summaries[0].relationSites.push({
      kind: 'CALL',
      variant: 'direct',
      sourceFactId: 'package-0',
      targetHint: 'later',
      arity: 0,
      span: { startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 },
    });
    baseline.summaries[0].emittedFacts.push({
      factType: 'EDGE',
      providerFactId: 'call-0',
      contentDigest: factDigest(oldEdge),
      ownership: 'FILE',
    });
  }
  baseline.header.summaryDigest = stateDigest(baseline.summaries);
  const target = structuredClone(baseline);
  const modified = [],
    deleted = [],
    operations = [];
  if (mode === 'retained-caller-upsert' || mode === 'partial') {
    target.summaries[1].sourceFile.contentFingerprint = 'fp-1-new';
    modified.push(target.summaries[1].sourceFile);
    target.header.contentFingerprint = 'target';
  }
  if (mode === 'retained-caller-upsert') {
    const edge = structuredClone(oldEdge);
    edge.providerSnapshotId = 'snap-next';
    edge.target = {
      state: 'RESOLVED',
      resolution: 'EXACT',
      target: {
        factType: 'NODE',
        providerId: 'native',
        providerFactId: 'package-1',
      },
    };
    target.summaries[0].emittedFacts.find((f) => f.factType === 'EDGE').contentDigest =
      factDigest(edge);
    const counts = target.summaries[0].coverage[1].statistics.resolutionCounts;
    counts.UNRESOLVED = 0;
    counts.EXACT = 1;
    operations.push({ type: 'UPSERT_EDGE', payload: edge });
  }
  if (mode === 'delete' || mode === 'shared-owner-transfer') {
    const removed = target.summaries.shift();
    deleted.push({
      id: removed.sourceFile.id,
      path: removed.sourceFile.path,
      previousContentFingerprint: removed.sourceFile.contentFingerprint,
    });
    removed.emittedFacts
      .filter((f) => f.ownership === 'FILE')
      .forEach((f) =>
        operations.push({
          type: `REMOVE_${f.factType}`,
          payload: { factType: f.factType, providerId: 'native', providerFactId: f.providerFactId },
        }),
      );
    target.header.contentFingerprint = 'target';
  }
  if (mode === 'partial') target.summaries[1].coverage[0].coverage = 'PARTIAL';
  target.header.sourceFileCount = target.summaries.length;
  target.header.summaryDigest = stateDigest(target.summaries);
  const p = base.request.payload;
  const request = {
    protocolVersion: 3,
    requestId: 'refresh',
    sequence: 0,
    type: 'REFRESH',
    payload: {
      irSchemaVersion: 1,
      providerSnapshotId: 'snap-next',
      repository: p.repository,
      requestedCapabilities: capabilities,
      deadlineEpochMs: null,
      resourceBudget: p.resourceBudget,
      analysisStateContext: p.analysisStateContext,
      baselineState: baseline.header,
      baseRevisionId: 'rev',
      baseRevisionFingerprint: 'base',
      targetRevision: { ...p.revision, contentFingerprint: target.header.contentFingerprint },
      changes: { added: [], modified, deleted },
      targetSourceFiles: target.summaries.map((s) => s.sourceFile),
    },
  };
  const ctx = {
    providerSnapshotId: 'snap-next',
    repositoryId: 'r',
    revisionId: 'rev',
    revisionFingerprint: target.header.contentFingerprint,
  };
  const coverage = target.summaries.flatMap((s) => s.coverage);
  const entries = [
    { type: 'REFRESH_STARTED', payload: ctx },
    ...modified.map((payload) => ({ type: 'SOURCE_FILE', payload })),
    ...operations,
    ...coverage.map((payload) => ({ type: 'COVERAGE', payload })),
    ...target.summaries.map((payload) => ({ type: 'ANALYSIS_SUMMARY', payload })),
    {
      type: 'REFRESH_COMPLETED',
      payload: {
        ...ctx,
        outcome: mode === 'partial' ? 'PARTIAL' : 'SUCCEEDED',
        counts: {
          sourceFiles: modified.length,
          upsertedNodes: 0,
          removedNodes: operations.filter((e) => e.type === 'REMOVE_NODE').length,
          upsertedEdges: operations.filter((e) => e.type === 'UPSERT_EDGE').length,
          removedEdges: 0,
          coverage: coverage.length,
          diagnostics: 0,
        },
        capabilities: [],
        contentFingerprint: target.header.contentFingerprint,
        integrityChecksum: '',
        analysisState: target.header,
        summaryRecords: target.summaries.length,
      },
    },
  ];
  const records = entries.map((e, sequence) => ({
    protocolVersion: 3,
    requestId: 'refresh',
    sequence,
    ...e,
  }));
  return {
    request,
    baseline,
    trustedMemoryBudgetBytes: p.resourceBudget.maxMemoryBytes,
    records,
    requestBytes: requestBytes(request, baseline),
    eventBytes: finish(records),
    targetFileCount: target.summaries.length,
    requestedCapabilityCount: capabilities.length,
  };
}
export async function loadRefreshCase(name) {
  const root = new URL('../../../../fixtures/ipc/refresh-v3/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('cases.json', root), 'utf8'));
  const c = index.cases.find((c) => c.id === name);
  if (!c || !/^[a-z0-9-]+\.jsonl$/.test(c.request) || !/^[a-z0-9-]+\.jsonl$/.test(c.events))
    throw new Error('Invalid corpus path');
  const bytes = await readFile(new URL(c.request, root));
  const { decodeNativeRequestV3 } = await import('../../dist/index.js');
  const { header } = decodeNativeRequestV3(bytes);
  if (header.type !== 'REFRESH') throw new Error('Corpus must contain a REFRESH request');
  return {
    ...c,
    // Independently authored corpus budget; not recovered for admission by parsing wire bytes.
    trustedMemoryBudgetBytes: 1_000_000_000,
    requestBytes: bytes,
    eventBytes: await readFile(new URL(c.events, root)),
    targetFileCount: header.payload.targetSourceFiles.length,
    requestedCapabilityCount: header.payload.requestedCapabilities.length,
  };
}
