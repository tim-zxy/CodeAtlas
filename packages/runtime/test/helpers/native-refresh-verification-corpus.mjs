// Contract-only observations: no Java facts or Runtime admission are inferred.
// Reuse independently authored C1 framing, never product digest/ledger helpers.
import assert from 'node:assert/strict';
import {
  baseCase,
  factDigest,
  stateDigest,
  sha,
} from '../../../providers/test/helpers/native-full-v3-corpus.mjs';
import { requestBytes, finish } from '../../../providers/test/helpers/native-refresh-v3-corpus.mjs';

export const verificationCorpusRevision = 'p05-native-refresh-verification-memory-v1';
export const verificationCases = [
  'zero-target',
  'maximum-short-files',
  'dense-retained-sites',
  'maximum-target-summary',
  'large-patch-ledger',
  'long-ascii',
  'long-bmp',
  'long-astral',
  'repeated-shared-owners',
  'forged-owner',
  'deep-unknown-input',
  'oversized-input',
  'oversized-output',
  'slow-sink',
  'burst-output-buffer',
];
export const verificationFixtureBudget = Number.MAX_SAFE_INTEGER;
const hard = {
  maxStdinBytes: 1_000_000,
  maxLineBytes: 1_000_000,
  maxStdoutBytes: 10_000_000,
  maxEvents: 10_000,
  maxStderrBytes: 1_000_000,
};
const zeros = () => ({ EXACT: 0, HEURISTIC: 0, AMBIGUOUS: 0, UNRESOLVED: 0, UNSUPPORTED: 0 });
const confidence = { score: 1, method: 'parser', reasons: [] };
const id = (i) => String(i).padStart(6, '0');
const sharedId = `java-package-container-v1:${sha('java-package-container-v1\0' + '4:demo')}`;
function file(i) {
  return {
    id: `f-${id(i)}`,
    repositoryId: 'r',
    revisionId: 'rev',
    path: `src/F${id(i)}.java`,
    contentFingerprint: `fp-${i}`,
    classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
    languageHint: 'java',
    sensitivity: 'PUBLIC',
  };
}
function coverage(source, capability, count) {
  return {
    sourceFileId: source.id,
    capability,
    support: 'SUPPORTED',
    coverage: 'COMPLETE',
    statistics: {
      eligibleSites: count,
      coveredSites: count,
      unsupportedSites: 0,
      partialSites: 0,
      resolutionCounts: { ...zeros(), UNRESOLVED: capability === 'SYMBOL' ? 0 : count },
    },
  };
}
function summary(source) {
  return {
    schemaVersion: 1,
    sourceFile: source,
    symbols: [],
    relationSites: [],
    diagnostics: [],
    emittedFacts: [],
    coverage: [coverage(source, 'SYMBOL', 0)],
  };
}
function node(s, index, name = `S${index}`, kind = 'java.class') {
  const span = { startLine: index, startColumn: 0, endLine: index, endColumn: 1 };
  const n = {
    providerId: 'native',
    providerFactId: `n-${s.sourceFile.id}-${id(index)}`,
    providerSnapshotId: 'snap-next',
    repositoryId: 'r',
    revisionId: 'rev',
    providerKind: kind,
    name,
    qualifiedName: name,
    sourceRange: { sourceFileId: s.sourceFile.id, ...span },
    confidence,
  };
  s.symbols.push({
    providerFactId: n.providerFactId,
    providerKind: kind,
    name,
    qualifiedName: name,
    signature: '',
    isStatic: false,
    span,
  });
  s.emittedFacts.push({
    factType: 'NODE',
    providerFactId: n.providerFactId,
    contentDigest: factDigest(n),
    ownership: 'FILE',
  });
  s.coverage[0] = coverage(s.sourceFile, 'SYMBOL', s.symbols.length);
  return n;
}
function edge(s, index, source) {
  const span = { startLine: index, startColumn: 2, endLine: index, endColumn: 3 };
  const e = {
    providerId: 'native',
    providerFactId: `e-${s.sourceFile.id}-${id(index)}`,
    providerSnapshotId: 'snap-next',
    repositoryId: 'r',
    revisionId: 'rev',
    providerKind: 'java.reference',
    source: { factType: 'NODE', providerId: 'native', providerFactId: source.providerFactId },
    target: {
      state: 'UNRESOLVED',
      resolution: 'UNRESOLVED',
      originalHint: `External${index}`,
      candidates: [],
    },
    sourceRange: { sourceFileId: s.sourceFile.id, ...span },
    confidence,
  };
  s.relationSites.push({
    kind: 'REFERENCE',
    variant: 'type',
    sourceFactId: source.providerFactId,
    targetHint: `External${index}`,
    arity: null,
    span,
  });
  s.emittedFacts.push({
    factType: 'EDGE',
    providerFactId: e.providerFactId,
    contentDigest: factDigest(e),
    ownership: 'FILE',
  });
  return e;
}
function shared(s) {
  node(s, 0, 'demo', 'java.package');
  const value = {
    providerId: 'native',
    providerFactId: sharedId,
    providerSnapshotId: 'snap-next',
    repositoryId: 'r',
    revisionId: 'rev',
    providerKind: 'java.package_container',
    name: 'demo',
    qualifiedName: 'demo',
    sourceRange: null,
    confidence,
  };
  s.emittedFacts.push({
    factType: 'NODE',
    providerFactId: sharedId,
    contentDigest: factDigest(value),
    ownership: 'SHARED',
  });
}
function size(c) {
  let largestLineBytes = 0;
  for (const bytes of [c.requestBytes, c.eventBytes]) {
    let start = 0;
    for (let i = 0; i < bytes.length; i++)
      if (bytes[i] === 10) {
        largestLineBytes = Math.max(largestLineBytes, i - start);
        start = i + 1;
      }
    largestLineBytes = Math.max(largestLineBytes, bytes.length - start);
  }
  return {
    inputBytes: c.requestBytes.length,
    largestLineBytes,
    outputBytes: c.eventBytes.length,
    eventCount: c.records.length,
    summaryBytes:
      c.records
        .filter((e) => e.type === 'ANALYSIS_SUMMARY')
        .reduce((n, e) => n + Buffer.byteLength(JSON.stringify(e)), 0) +
      Buffer.byteLength(JSON.stringify(c.records.at(-1).payload.analysisState)),
  };
}
export function exceededVerificationCaps(s) {
  return Object.entries({
    inputBytes: hard.maxStdinBytes,
    largestLineBytes: hard.maxLineBytes,
    outputBytes: hard.maxStdoutBytes,
    eventCount: hard.maxEvents,
    summaryBytes: 1_000_000,
  })
    .filter(([key, cap]) => s[key] > cap)
    .map(([key]) => key);
}
function variant(recipe, count, budget) {
  const template = baseCase('zero-file');
  const baseline = [],
    target = [],
    operations = [];
  let capabilities = ['SYMBOL'];
  if (recipe === 'maximum-short-files' || recipe === 'repeated-shared-owners') {
    for (let i = 0; i < count; i++) {
      const s = summary(file(i));
      if (recipe === 'repeated-shared-owners') shared(s);
      baseline.push(s);
      target.push(structuredClone(s));
    }
  } else if (recipe !== 'zero-target') {
    const before = summary(file(0)),
      after = summary({ ...file(0), contentFingerprint: 'fp-target' });
    baseline.push(before);
    target.push(after);
    if (recipe === 'dense-retained-sites') {
      capabilities = ['SYMBOL', 'REFERENCE'];
      const n = node(before, 0);
      for (let i = 0; i < count; i++) edge(before, i, n);
      before.coverage.push(coverage(before.sourceFile, 'REFERENCE', count));
      target[0] = structuredClone(before);
    } else {
      if (recipe === 'large-patch-ledger') capabilities = ['SYMBOL', 'REFERENCE'];
      for (let i = 0; i < (recipe.startsWith('long-') ? 1 : count); i++) {
        const text = recipe.startsWith('long-')
          ? { 'long-ascii': 'x', 'long-bmp': '界', 'long-astral': '🧭' }[recipe].repeat(count)
          : `S${i}`;
        const n = node(after, i, text);
        operations.push({ type: 'UPSERT_NODE', payload: n });
        if (recipe === 'large-patch-ledger') {
          const old = node(before, i, `Old${i}`);
          // Distinct identities: removing old support and adding new support.
          const oldEntry = before.emittedFacts.at(-1),
            oldSymbol = before.symbols.at(-1);
          old.providerFactId = `old-${old.providerFactId}`;
          oldSymbol.providerFactId = old.providerFactId;
          oldEntry.providerFactId = old.providerFactId;
          oldEntry.contentDigest = factDigest(old);
          const oldEdge = edge(before, i, old);
          const entry = before.emittedFacts.at(-1);
          oldEdge.providerFactId = `old-${oldEdge.providerFactId}`;
          entry.providerFactId = oldEdge.providerFactId;
          entry.contentDigest = factDigest(oldEdge);
          operations.push({ type: 'UPSERT_EDGE', payload: edge(after, i, n) });
          operations.push({
            type: 'REMOVE_NODE',
            payload: { factType: 'NODE', providerId: 'native', providerFactId: old.providerFactId },
          });
          operations.push({
            type: 'REMOVE_EDGE',
            payload: {
              factType: 'EDGE',
              providerId: 'native',
              providerFactId: oldEdge.providerFactId,
            },
          });
        }
      }
      if (recipe === 'large-patch-ledger') {
        before.coverage.push(coverage(before.sourceFile, 'REFERENCE', count));
        after.coverage.push(coverage(after.sourceFile, 'REFERENCE', count));
      }
    }
  }
  const header = (summaries, fingerprint) => ({
    ...template.bundle.header,
    contentFingerprint: fingerprint,
    requestedCapabilities: capabilities,
    sourceFileCount: summaries.length,
    summaryDigest: stateDigest(summaries),
  });
  const unchanged = JSON.stringify(baseline) === JSON.stringify(target);
  const base = { header: header(baseline, 'base'), summaries: baseline };
  const state = header(target, unchanged ? 'base' : 'target');
  const modified = unchanged ? [] : target.map((s) => s.sourceFile);
  const request = {
    protocolVersion: 3,
    requestId: 'refresh-memory',
    sequence: 0,
    type: 'REFRESH',
    payload: {
      irSchemaVersion: 1,
      providerSnapshotId: 'snap-next',
      repository: { id: 'r', rootPath: '/calibration' },
      requestedCapabilities: capabilities,
      deadlineEpochMs: null,
      resourceBudget: { maxDurationMs: 60_000, maxMemoryBytes: budget, maxEvents: hard.maxEvents },
      analysisStateContext: template.request.payload.analysisStateContext,
      baselineState: base.header,
      baseRevisionId: 'rev',
      baseRevisionFingerprint: 'base',
      targetRevision: {
        ...template.request.payload.revision,
        contentFingerprint: state.contentFingerprint,
      },
      changes: { added: [], modified, deleted: [] },
      targetSourceFiles: target.map((s) => s.sourceFile),
    },
  };
  const ctx = {
    providerSnapshotId: 'snap-next',
    repositoryId: 'r',
    revisionId: 'rev',
    revisionFingerprint: state.contentFingerprint,
  };
  const coverages = target.flatMap((s) => s.coverage);
  const records = [
    { type: 'REFRESH_STARTED', payload: ctx },
    ...modified.map((payload) => ({ type: 'SOURCE_FILE', payload })),
    ...operations,
    ...coverages.map((payload) => ({ type: 'COVERAGE', payload })),
    ...target.map((payload) => ({ type: 'ANALYSIS_SUMMARY', payload })),
    {
      type: 'REFRESH_COMPLETED',
      payload: {
        ...ctx,
        outcome: 'SUCCEEDED',
        counts: {
          sourceFiles: modified.length,
          upsertedNodes: operations.filter((e) => e.type === 'UPSERT_NODE').length,
          removedNodes: operations.filter((e) => e.type === 'REMOVE_NODE').length,
          upsertedEdges: operations.filter((e) => e.type === 'UPSERT_EDGE').length,
          removedEdges: operations.filter((e) => e.type === 'REMOVE_EDGE').length,
          coverage: coverages.length,
          diagnostics: 0,
        },
        capabilities: capabilities.map((name) => ({
          name,
          support: 'SUPPORTED',
          coverage: 'COMPLETE',
        })),
        contentFingerprint: state.contentFingerprint,
        integrityChecksum: '',
        analysisState: state,
        summaryRecords: target.length,
      },
    },
  ].map((r, sequence) => ({ protocolVersion: 3, requestId: request.requestId, sequence, ...r }));
  const c = {
    requestBytes: requestBytes(request, base),
    eventBytes: finish(records),
    records,
    limits: { ...hard },
    expectedOutcome: 'REFRESH_COMPLETED',
  };
  c.sizes = size(c);
  return c;
}
function grow(recipe, budget) {
  let low = 1,
    high = 2;
  assert.equal(exceededVerificationCaps(variant(recipe, low, budget).sizes).length, 0);
  while (exceededVerificationCaps(variant(recipe, high, budget).sizes).length === 0) {
    low = high;
    high *= 2;
  }
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (exceededVerificationCaps(variant(recipe, middle, budget).sizes).length) high = middle;
    else low = middle;
  }
  const c = variant(recipe, low, budget);
  const next = variant(recipe, high, budget).sizes;
  c.boundary = { count: low, nextCount: high, next, exceededCaps: exceededVerificationCaps(next) };
  return c;
}
export function buildVerificationCase(name, budget) {
  assert.ok(verificationCases.includes(name), 'Unknown REFRESH_VERIFY class');
  assert.ok(Number.isSafeInteger(budget) && budget > 0, 'Trusted budget required');
  let c;
  if (name === 'zero-target') c = variant(name, 0, budget);
  else if (['oversized-input', 'oversized-output', 'deep-unknown-input'].includes(name)) {
    c = variant('zero-target', 0, budget);
    if (name === 'oversized-input') {
      c.requestBytes = Buffer.alloc(hard.maxStdinBytes + 1, 32);
      c.expectedOutcome = 'OUTPUT_LIMIT_EXCEEDED';
    } else if (name === 'oversized-output') {
      c.eventBytes = Buffer.alloc(hard.maxStdoutBytes + 1, 32);
      c.expectedOutcome = 'OUTPUT_LIMIT_EXCEEDED';
    } else {
      const at = c.requestBytes.indexOf(10);
      const head = c.requestBytes.subarray(0, at).toString();
      const depth = Math.floor((hard.maxStdinBytes - c.requestBytes.length - 20) / 2);
      const expanded =
        head.slice(0, -1) + ',"unknown":' + '['.repeat(depth) + '0' + ']'.repeat(depth) + '}\n';
      const completion = JSON.parse(c.requestBytes.subarray(at + 1).toString());
      completion.payload.integrityChecksum = sha(expanded);
      c.requestBytes = Buffer.concat([
        Buffer.from(expanded),
        Buffer.from(JSON.stringify(completion) + '\n'),
      ]);
      c.expectedOutcome = 'INVALID_REQUEST';
    }
    c.sizes = size(c);
  } else {
    const recipe = ['slow-sink', 'burst-output-buffer'].includes(name)
      ? 'large-patch-ledger'
      : name === 'forged-owner'
        ? 'repeated-shared-owners'
        : name;
    c = grow(recipe, budget);
    if (name === 'forged-owner') {
      const summaries = c.records
        .filter((r) => r.type === 'ANALYSIS_SUMMARY')
        .map((r) => r.payload);
      assert.ok(summaries.length >= 2);
      const first = summaries[0].emittedFacts.find((f) => f.ownership === 'FILE');
      const second = summaries[1].emittedFacts.find((f) => f.ownership === 'FILE');
      Object.assign(first, { ...second });
      // Keep union/digests: replace the second by the original first baseline entry.
      const original = JSON.parse(
        c.requestBytes.toString().split('\n')[1],
      ).payload.emittedFacts.find((f) => f.ownership === 'FILE');
      Object.assign(second, original);
      c.records.at(-1).payload.analysisState.summaryDigest = stateDigest(summaries);
      c.eventBytes = finish(c.records);
      c.sizes = size(c);
      c.expectedOutcome = 'PROTOCOL_VIOLATION';
    }
  }
  c.name = name;
  c.corpusPayloadDigest = sha(
    Buffer.concat([
      Buffer.from(
        JSON.stringify({ name, budget, limits: c.limits, expectedOutcome: c.expectedOutcome }) +
          '\n',
      ),
      c.requestBytes,
      c.eventBytes,
    ]),
  );
  return c;
}
