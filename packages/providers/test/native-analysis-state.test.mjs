import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as api from '../dist/index.js';

const vectors = JSON.parse(
  await readFile(
    new URL('../../../fixtures/ipc/protocol-v3/summary-vectors.json', import.meta.url),
    'utf8',
  ),
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function emptySummary(file = vectors.sourceFile) {
  return {
    schemaVersion: 1,
    sourceFile: structuredClone(file),
    symbols: [],
    relationSites: [],
    diagnostics: [],
    coverage: [],
    emittedFacts: [],
  };
}
const span = { startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 };
function summary() {
  return {
    ...emptySummary(),
    symbols: [
      {
        providerFactId: 's',
        providerKind: 'java.method',
        name: 'm',
        qualifiedName: 'A.m',
        signature: 'm(int)',
        isStatic: true,
        span: { ...span },
      },
    ],
    relationSites: [
      {
        kind: 'CALL',
        variant: 'direct',
        sourceFactId: 's',
        targetHint: 'missing',
        arity: 1,
        span: { ...span },
      },
    ],
    coverage: [
      {
        capability: 'CALL',
        sourceFileId: 'f-a',
        support: 'SUPPORTED',
        coverage: 'COMPLETE',
        statistics: {
          eligibleSites: 1,
          coveredSites: 1,
          unsupportedSites: 0,
          partialSites: 0,
          resolutionCounts: { EXACT: 0, HEURISTIC: 0, AMBIGUOUS: 0, UNRESOLVED: 1, UNSUPPORTED: 0 },
        },
      },
    ],
    emittedFacts: [
      { factType: 'EDGE', providerFactId: 'e', contentDigest: 'a'.repeat(64), ownership: 'FILE' },
    ],
  };
}
function bundle(summaries = [summary()]) {
  return {
    header: {
      schemaVersion: 1,
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
      requestedCapabilities: ['CALL'],
      sourceFileCount: summaries.length,
      summaryDigest: api.computeNativeSummaryDigest(summaries),
    },
    summaries,
  };
}

test('strict summary retains resolver inputs without AST/source', () => {
  assert.equal(typeof api.NativeFileAnalysisSummaryV1Schema?.parse, 'function');
  assert.deepEqual(api.NativeFileAnalysisSummaryV1Schema.parse(summary()), summary());
  for (const mutate of [
    (s) => {
      s.ast = {};
    },
    (s) => {
      s.source = 'raw';
    },
    (s) => {
      s.relationSites[0].sourceFactId = 'foreign';
    },
    (s) => {
      s.symbols[0].span.startLine = -0;
    },
    (s) => {
      s.symbols[0].span.endColumn = -1;
    },
    (s) => {
      s.relationSites.push(structuredClone(s.relationSites[0]));
    },
    (s) => {
      s.coverage[0].statistics.resolutionCounts.UNRESOLVED = 0;
    },
    (s) => {
      s.symbols[0].name = '\ud800';
    },
  ]) {
    const s = summary();
    mutate(s);
    assert.equal(api.NativeFileAnalysisSummaryV1Schema.safeParse(s).success, false);
  }
});

test('bundle rejects duplicate source ownership and drift', () => {
  assert.equal(typeof api.NativeAnalysisStateBundleV1Schema?.parse, 'function');
  assert.deepEqual(api.NativeAnalysisStateBundleV1Schema.parse(bundle()), bundle());
  for (const mutate of [
    (b) => {
      b.header.sourceFileCount = 2;
    },
    (b) => {
      b.header.summaryDigest = 'b'.repeat(64);
    },
    (b) => {
      b.summaries[0].sourceFile.repositoryId = 'other';
    },
    (b) => {
      b.header.requestedCapabilities = ['SYMBOL'];
    },
    (b) => {
      b.header.language.languageId = 'python';
    },
  ]) {
    const b = bundle();
    mutate(b);
    assert.equal(api.NativeAnalysisStateBundleV1Schema.safeParse(b).success, false);
  }
  assert.equal(
    api.NativeAnalysisStateBundleV1Schema.safeParse(bundle([summary(), summary()])).success,
    false,
  );
});

test('shared fact accepts equal SHARED support only', () => {
  const a = summary(),
    b = summary();
  b.sourceFile.id = 'f-b';
  b.sourceFile.path = 'src/B.java';
  b.symbols[0].providerFactId = 's-b';
  b.relationSites[0].sourceFactId = 's-b';
  b.coverage[0].sourceFileId = 'f-b';
  a.emittedFacts[0].ownership = b.emittedFacts[0].ownership = 'SHARED';
  assert.equal(api.NativeAnalysisStateBundleV1Schema.safeParse(bundle([a, b])).success, true);
  b.emittedFacts[0].contentDigest = 'b'.repeat(64);
  assert.equal(api.NativeAnalysisStateBundleV1Schema.safeParse(bundle([a, b])).success, false);
  b.emittedFacts[0].contentDigest = a.emittedFacts[0].contentDigest;
  b.emittedFacts[0].ownership = 'FILE';
  assert.equal(api.NativeAnalysisStateBundleV1Schema.safeParse(bundle([a, b])).success, false);
});

test('summary digest keeps code-point prefix order without comparator arrays', () => {
  const names = ['A', 'AA', 'A𝒜', 'Z', 'é', '中', '\ue000', '𐀀', '𝒜', '𝒜A', '😀', '􏿿'];
  const values = names.map((name, i) =>
    emptySummary({ ...vectors.sourceFile, id: `f-${i}`, path: name }),
  );
  // Independent reference uses the old complete code-point array semantics.
  const order = (a, b) => {
    const left = Array.from(a, (s) => s.codePointAt(0));
    const right = Array.from(b, (s) => s.codePointAt(0));
    for (let i = 0; i < Math.min(left.length, right.length); i++)
      if (left[i] !== right[i]) return left[i] - right[i];
    return left.length - right.length;
  };
  const expected = values.toSorted((a, b) => order(a.sourceFile.path, b.sourceFile.path));
  const bytes = expected.map((s) =>
    vectors.canonicalEmptyFile
      .slice(1, -1)
      .replace('"f-a"', JSON.stringify(s.sourceFile.id))
      .replace('"src/A.java"', JSON.stringify(s.sourceFile.path)),
  );
  let comparatorArrays = 0;
  // Pairwise digest equality also covers equal strings and both prefix directions.
  for (const a of values)
    for (const b of values) {
      const pair = [a, b].toSorted((x, y) => order(x.sourceFile.path, y.sourceFile.path));
      const reference = pair.map((s) =>
        vectors.canonicalEmptyFile
          .slice(1, -1)
          .replace('"f-a"', JSON.stringify(s.sourceFile.id))
          .replace('"src/A.java"', JSON.stringify(s.sourceFile.path)),
      );
      assert.equal(api.computeNativeSummaryDigest([a, b]), hash(`[${reference.join(',')}]`));
    }
  const from = Array.from;
  Array.from = function (...args) {
    if (typeof args[0] === 'string' && /at unicodeOrder\b/.test(new Error().stack))
      comparatorArrays++;
    return Reflect.apply(from, this, args);
  };
  let actual;
  try {
    actual = api.computeNativeSummaryDigest([...values].reverse());
  } finally {
    Array.from = from;
  }
  assert.equal(actual, hash(`[${bytes.join(',')}]`));
  assert.equal(comparatorArrays, 0, 'Unicode comparisons must not allocate whole-string arrays');
});

test('canonical vectors preserve Unicode and snapshot-independent semantic digest', () => {
  assert.equal(typeof api.computeNativeSummaryDigest, 'function');
  assert.equal(api.computeNativeSummaryDigest([]), vectors.emptyDigest);
  assert.equal(api.computeNativeSummaryDigest([emptySummary()]), hash(vectors.canonicalEmptyFile));
  const a = emptySummary({ ...vectors.sourceFile, id: 'bmp', path: '\ue000.java' });
  const b = emptySummary({ ...vectors.sourceFile, id: 'astral', path: '𝒜.java' });
  const canonicalA = vectors.canonicalEmptyFile
    .slice(1, -1)
    .replace('"f-a"', '"bmp"')
    .replace('src/A.java', '\ue000.java');
  const canonicalB = vectors.canonicalEmptyFile
    .slice(1, -1)
    .replace('"f-a"', '"astral"')
    .replace('src/A.java', '𝒜.java');
  assert.equal(api.computeNativeSummaryDigest([b, a]), hash(`[${canonicalA},${canonicalB}]`));
  const node = {
    providerId: 'native',
    providerFactId: 'n',
    providerSnapshotId: 'first',
    repositoryId: 'r',
    revisionId: 'rev',
    providerKind: 'java.class',
    name: 'A',
    qualifiedName: 'A',
    sourceRange: null,
    confidence: { score: 0.1, method: 'syntax', reasons: [] },
  };
  const canonical =
    '{"confidence":{"method":"syntax","reasons":[],"score":{"$nativeNumber":"3fb999999999999a"}},"name":"A","providerFactId":"n","providerId":"native","providerKind":"java.class","qualifiedName":"A","repositoryId":"r","revisionId":"rev","sourceRange":null}';
  assert.equal(api.computeNativeFactContentDigest(node), hash(canonical));
  assert.equal(
    api.computeNativeFactContentDigest({ ...node, providerSnapshotId: 'second' }),
    hash(canonical),
  );
  assert.notEqual(api.computeNativeFactContentDigest({ ...node, name: 'B' }), hash(canonical));
  for (const [score, bits] of [
    [0, '0000000000000000'],
    [1, '3ff0000000000000'],
    [1e-7, '3e7ad7f29abcaf48'],
  ]) {
    assert.equal(
      api.computeNativeFactContentDigest({ ...node, confidence: { ...node.confidence, score } }),
      hash(canonical.replace('3fb999999999999a', bits)),
    );
  }
  const reordered = Object.fromEntries(Object.entries(node).reverse());
  assert.equal(api.computeNativeFactContentDigest(reordered), hash(canonical));
  const s = summary();
  s.sourceFile.path = '源码/𝒜.java';
  const path = s.sourceFile.path;
  s.relationSites[0].sourceFactId = `java-compilation-unit-v1:${hash(`java-compilation-unit-v1\0${Buffer.byteLength(path)}:${path}`)}`;
  assert.equal(api.NativeFileAnalysisSummaryV1Schema.safeParse(s).success, true);
  s.relationSites[0].sourceFactId = `java-compilation-unit-v1:${hash(`java-compilation-unit-v1\0${path.length}:${path}`)}`;
  assert.equal(api.NativeFileAnalysisSummaryV1Schema.safeParse(s).success, false);
  const ordered = summary();
  ordered.symbols.push({ ...structuredClone(ordered.symbols[0]), providerFactId: 'a' });
  const reversed = structuredClone(ordered);
  reversed.symbols.reverse();
  assert.equal(
    api.computeNativeSummaryDigest([ordered]),
    api.computeNativeSummaryDigest([reversed]),
  );
});
