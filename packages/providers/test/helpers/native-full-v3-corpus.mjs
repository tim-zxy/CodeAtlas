// Independent fixture construction: never import production schemas/digest helpers.
import { createHash } from 'node:crypto';
export const sha = (value) => createHash('sha256').update(value).digest('hex');
const order = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
function canonical(value) {
  if (typeof value === 'number') {
    const bits = Buffer.alloc(8);
    bits.writeDoubleBE(value);
    return `{"$nativeNumber":"${bits.toString('hex')}"}`;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort(order)
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function factDigest(fact) {
  const { providerSnapshotId: _snapshot, ...semantic } = fact;
  return sha(canonical(semantic));
}
export function stateDigest(summaries) {
  const sorted = structuredClone(summaries).sort((a, b) =>
    order(a.sourceFile.path, b.sourceFile.path),
  );
  for (const s of sorted) {
    s.symbols.sort((a, b) => order(a.providerFactId, b.providerFactId));
    s.emittedFacts.sort(
      (a, b) => order(a.factType, b.factType) || order(a.providerFactId, b.providerFactId),
    );
    s.coverage.sort((a, b) => order(a.capability, b.capability));
    s.diagnostics.sort((a, b) => order(canonical(a), canonical(b)));
    // This corpus has no relation sites; independent packet A vectors cover site ordering.
  }
  return sha(canonical(sorted));
}
export const context = {
  repositoryId: 'r',
  revisionId: 'rev',
  contentFingerprint: 'base',
  providerId: 'native',
  providerVersion: '0.0.0',
  language: {
    languageId: 'java',
    grammarVersion: '0.23.5',
    analyzerVersion: '0.0.0',
    compatibilityVersion: '1',
  },
  resolverVersion: '1',
  normalizerVersion: '1',
  policyFingerprint: 'policy',
  requestedCapabilities: ['SYMBOL'],
};
const span = { startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 };
const confidence = { score: 1, method: 'parser', reasons: [] };
export function baseCase(mode = 'shared') {
  const summaries = [];
  const nodes = [];
  const sharedId = `java-package-container-v1:${sha('java-package-container-v1\0' + '4:demo')}`;
  for (let i = 0; i < (mode === 'zero-file' ? 0 : mode === 'empty' ? 1 : 2); i++) {
    const file = {
      id: `f-${i}`,
      repositoryId: 'r',
      revisionId: 'rev',
      path: `src/${i}.java`,
      contentFingerprint: `fp-${i}`,
      classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
      languageHint: 'java',
      sensitivity: 'PUBLIC',
    };
    const summary = {
      schemaVersion: 1,
      sourceFile: file,
      symbols: [],
      relationSites: [],
      diagnostics: [],
      emittedFacts: [],
      coverage: [
        {
          capability: 'SYMBOL',
          sourceFileId: file.id,
          support: 'SUPPORTED',
          coverage: 'COMPLETE',
          statistics: {
            eligibleSites: mode === 'empty' ? 0 : 1,
            coveredSites: mode === 'empty' ? 0 : 1,
            unsupportedSites: 0,
            partialSites: 0,
            resolutionCounts: {
              EXACT: 0,
              HEURISTIC: 0,
              AMBIGUOUS: 0,
              UNRESOLVED: 0,
              UNSUPPORTED: 0,
            },
          },
        },
      ],
    };
    if (mode !== 'empty') {
      const node = {
        providerId: 'native',
        providerFactId: `package-${i}`,
        providerSnapshotId: 'snap',
        repositoryId: 'r',
        revisionId: 'rev',
        providerKind: 'java.package',
        name: 'demo',
        qualifiedName: 'demo',
        sourceRange: { sourceFileId: file.id, ...span },
        confidence,
      };
      nodes.push(node);
      summary.symbols.push({
        providerFactId: node.providerFactId,
        providerKind: node.providerKind,
        name: node.name,
        qualifiedName: node.qualifiedName,
        signature: '',
        isStatic: false,
        span,
      });
      summary.emittedFacts.push({
        factType: 'NODE',
        providerFactId: node.providerFactId,
        contentDigest: factDigest(node),
        ownership: 'FILE',
      });
      const unit = {
        ...node,
        providerFactId: `java-compilation-unit-v1:${sha(`java-compilation-unit-v1\0${Buffer.byteLength(file.path)}:${file.path}`)}`,
        providerKind: 'java.compilation_unit',
        name: file.path,
        qualifiedName: null,
        sourceRange: null,
      };
      nodes.push(unit);
      summary.emittedFacts.push({
        factType: 'NODE',
        providerFactId: unit.providerFactId,
        contentDigest: factDigest(unit),
        ownership: 'FILE',
      });
      const shared = {
        ...node,
        providerFactId: sharedId,
        providerKind: 'java.package_container',
        sourceRange: null,
      };
      if (!i) nodes.push(shared);
      summary.emittedFacts.push({
        factType: 'NODE',
        providerFactId: sharedId,
        contentDigest: factDigest(shared),
        ownership: 'SHARED',
      });
    }
    summaries.push(summary);
  }
  const {
    repositoryId: _r,
    revisionId: _v,
    contentFingerprint: _f,
    requestedCapabilities: _c,
    ...analysisStateContext
  } = context;
  const request = {
    protocolVersion: 3,
    requestId: 'req',
    sequence: 0,
    type: 'ANALYZE',
    payload: {
      irSchemaVersion: 1,
      providerSnapshotId: 'snap',
      repository: { id: 'r', rootPath: '/repo' },
      revision: {
        id: 'rev',
        repositoryId: 'r',
        kind: 'WORKTREE',
        contentFingerprint: 'base',
        baseRevisionId: null,
      },
      sourceFiles: summaries.map((s) => structuredClone(s.sourceFile)),
      requestedCapabilities: ['SYMBOL'],
      deadlineEpochMs: null,
      resourceBudget: { maxDurationMs: 1000, maxMemoryBytes: 1_000_000_000, maxEvents: 100 },
      analysisStateContext,
      baselineState: null,
    },
  };
  return structuredClone({
    request,
    bundle: {
      header: {
        schemaVersion: 1,
        ...context,
        sourceFileCount: summaries.length,
        summaryDigest: stateDigest(summaries),
      },
      summaries,
    },
    sources: summaries.map((s) => structuredClone(s.sourceFile)),
    nodes,
    edges: [],
    coverage: summaries.flatMap((s) => structuredClone(s.coverage)),
    diagnostics: [],
  });
}
export function updateDigest(value) {
  value.bundle.header.sourceFileCount = value.bundle.summaries.length;
  value.bundle.header.summaryDigest = stateDigest(value.bundle.summaries);
  return value;
}
export function streamRecords(value, outcome = 'SUCCEEDED') {
  const ctx = {
    providerSnapshotId: 'snap',
    repositoryId: 'r',
    revisionId: 'rev',
    revisionFingerprint: 'base',
  };
  const entries = [{ type: 'ANALYSIS_STARTED', payload: ctx }];
  for (const [type, values] of [
    ['SOURCE_FILE', value.sources],
    ['NODE', value.nodes],
    ['EDGE', value.edges],
    ['COVERAGE', value.coverage],
    ['DIAGNOSTIC', value.diagnostics],
    ['ANALYSIS_SUMMARY', value.bundle.summaries],
  ])
    entries.push(...values.map((payload) => ({ type, payload })));
  const records = entries.map((e, sequence) => ({
    protocolVersion: 3,
    requestId: 'req',
    sequence,
    ...e,
  }));
  records.push({
    protocolVersion: 3,
    requestId: 'req',
    sequence: records.length,
    type: 'ANALYSIS_COMPLETED',
    payload: {
      ...ctx,
      outcome,
      counts: {
        sourceFiles: value.sources.length,
        nodes: value.nodes.length,
        edges: value.edges.length,
        coverage: value.coverage.length,
        diagnostics: value.diagnostics.length,
      },
      capabilities: [],
      contentFingerprint: 'base',
      integrityChecksum: `sha256:${sha(records.map((r) => JSON.stringify(r) + '\n').join(''))}`,
      analysisState: value.bundle.header,
      summaryRecords: value.bundle.summaries.length,
    },
  });
  return records;
}
export function encode(records) {
  return Buffer.from(records.map((r) => JSON.stringify(r) + '\n').join(''));
}
