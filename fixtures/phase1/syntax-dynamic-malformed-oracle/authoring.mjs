// Independent literal Source expectations; no product helper,parser or observed output.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url),
  sha = (b) => createHash('sha256').update(b).digest('hex');
function framed(domain, fields) {
  const h = createHash('sha256')
    .update(domain)
    .update(Buffer.from([0]));
  for (const v of fields) {
    const b = Buffer.from(String(v));
    h.update(String(b.length) + ':').update(b);
  }
  return domain + ':' + h.digest('hex');
}
const write = (p, v) => fs.writeFileSync(new URL(p, root), JSON.stringify(v, null, 2) + '\n');
const range = (a, b, c, d) => ({
  sourceFileId: 'file:one',
  startLine: a,
  startColumn: b,
  endLine: c,
  endColumn: d,
});
const confidence = { score: 1, method: 'parser', reasons: [] };
const unresolved = (name) => ({
  state: 'UNRESOLVED',
  resolution: 'UNRESOLVED',
  originalHint: name,
  candidates: [],
});
const template = fs.readFileSync(
  new URL('../syntax-initial-absence-oracle/calibration/request.json', root),
);
assert.equal(sha(template), '3c611dd26db3abe7659088354a38e98a19d702eaf61cfd5bab56c9f813bd6f47');
for (const [mode, suffix] of [
  ['calibration', 'fixture'],
  ['holdout', 'holdout'],
]) {
  const source = fs.readFileSync(
    new URL('../syntax-observation-corpus/' + mode + '/dynamic-malformed/app.py', root),
  );
  const name = 'broken_' + suffix;
  assert.equal(
    source.toString(),
    '@app.get(prefix_' + suffix + ' + "/dynamic")\ndef ' + name + '(:\n    return invoke()\n',
  );
  assert.equal(source.length, 79);
  const spans = {
    decoration: [0, 37],
    argument: [9, 36],
    function: [38, 78],
    functionName: [42, 56],
    invocation: [70, 78],
  };
  for (const [k, text] of [
    ['decoration', '@app.get(prefix_' + suffix + ' + "/dynamic")'],
    ['argument', 'prefix_' + suffix + ' + "/dynamic"'],
    ['functionName', name],
    ['invocation', 'invoke()'],
  ]) {
    const [a, b] = spans[k];
    assert.equal(source.subarray(a, b).toString(), text);
  }
  fs.mkdirSync(new URL(mode + '/', root), { recursive: true });
  fs.writeFileSync(new URL(mode + '/app.py', root), source);
  const request = JSON.parse(template),
    p = request.payload,
    f = p.sourceFiles[0],
    t = p.targetSource;
  f.contentFingerprint = 'sha256:' + sha(source);
  p.ownerBinding.ownerMapDigest = framed('codeatlas-native-syntax-owner-map-v1', [
    t.repositoryId,
    t.revisionId,
    t.contentFingerprint,
    'NONE',
    'PROVISIONAL_CODE',
    p.ownerBinding.stageDigest,
    p.providerId,
    p.providerSnapshotId,
    '1',
    f.id,
    f.path,
    f.contentFingerprint,
    f.languageHint,
    'SOURCE',
    'AUTHORED',
    'TEXT',
    'INTERNAL',
    '0',
  ]).split(':')[1];
  write(mode + '/request.json', request);
  fs.writeFileSync(new URL(mode + '/request.jsonl', root), JSON.stringify(request) + '\n');
  write(mode + '/context.json', {
    expectedActivationBasis: null,
    targetSource: t,
    ownerBinding: { kind: 'PROVISIONAL_CODE', stageDigest: p.ownerBinding.stageDigest },
    providerId: p.providerId,
    providerSnapshotId: p.providerSnapshotId,
    sourceFiles: p.sourceFiles,
    owners: [],
  });
  write(mode + '/basis.json', { ...t, codeActivationDigest: 'd'.repeat(64) });
  const moduleId = framed('python-module-v1', ['app.py']),
    symbolId = framed('python-symbol-v1', ['app.py::' + name, '42', '56']);
  const ref = (id) => ({ factType: 'NODE', providerId: p.providerId, providerFactId: id });
  const provider = (id, kind, name, qualifiedName, sourceRange) => ({
    providerId: p.providerId,
    providerFactId: id,
    providerSnapshotId: p.providerSnapshotId,
    repositoryId: t.repositoryId,
    revisionId: t.revisionId,
    providerKind: kind,
    name,
    qualifiedName,
    sourceRange,
    confidence,
  });
  const nodes = [
    provider(moduleId, 'python.module', 'app.py', 'app.py', range(0, 0, 3, 0)),
    provider(symbolId, 'python.symbol', name, 'app.py::' + name, range(1, 4, 1, 18)),
  ];
  const obs = (kind, span, sourceRange, payload) => ({
    providerSyntaxId: framed('python-syntax-v1', ['app.py', kind, ...span]),
    sourceFileId: f.id,
    sourceFingerprint: f.contentFingerprint,
    sourceRange,
    owner: ref(symbolId),
    syntaxKind: kind,
    payload,
  });
  const syntax = [
    obs('DECORATION', spans.decoration, range(0, 0, 0, 37), {
      callee: { name: 'app.get', target: unresolved('app.get') },
      arguments: [
        {
          name: null,
          value: { kind: 'UNKNOWN', reason: 'DYNAMIC_EXPRESSION' },
          sourceRange: range(0, 9, 0, 36),
        },
      ],
    }),
    obs('DECLARATION', spans.function, range(1, 0, 2, 19), {
      declaredType: null,
      parameterNames: [],
      modifiers: [],
    }),
    obs('INVOCATION', spans.invocation, range(2, 11, 2, 19), {
      callee: { name: 'invoke', target: unresolved('invoke') },
      arguments: [],
      receiver: null,
    }),
  ];
  const binding = {
    expectedActivationBasis: null,
    targetSource: t,
    ownerBinding: p.ownerBinding,
    extractorVersion: p.extractorVersion,
  };
  const counts = { nodes: 2, edges: 0, syntax: 3, coverage: 1, diagnostics: 1 };
  const rows = [
    ['SYNTAX_STARTED', binding],
    ...nodes.map((n) => ['NODE', n]),
    ...syntax.map((o) => ['SYNTAX_OBSERVATION', o]),
    [
      'COVERAGE',
      {
        sourceFileId: f.id,
        sourceFingerprint: f.contentFingerprint,
        status: 'PARTIAL',
        limitations: ['UNRESOLVED_OR_UNSUPPORTED_SYNTAX'],
      },
    ],
    [
      'DIAGNOSTIC',
      {
        code: 'SYNTAX_ERROR',
        severity: 'WARNING',
        message: 'Python source contains syntax errors',
        sourceRange: range(0, 0, 3, 0),
      },
    ],
  ].map(([type, payload], sequence) => ({
    protocolVersion: 4,
    requestId: request.requestId,
    sequence,
    type,
    payload,
  }));
  const prefix = rows.map((r) => JSON.stringify(r) + '\n').join('');
  rows.push({
    protocolVersion: 4,
    requestId: request.requestId,
    sequence: 8,
    type: 'SYNTAX_COMPLETED',
    payload: { ...binding, outcome: 'PARTIAL', counts, checksum: sha(Buffer.from(prefix)) },
  });
  assert.equal(rows.length, 9);
  fs.writeFileSync(
    new URL(mode + '/events.jsonl', root),
    rows.map((r) => JSON.stringify(r) + '\n').join(''),
  );
  const moduleKey = framed('node-fact-v1', [t.repositoryId, t.revisionId, 'MODULE', 'app.py']),
    symbolKey = framed('node-fact-v1', [
      t.repositoryId,
      t.revisionId,
      'SYMBOL',
      'FUNCTION',
      'app.py::' + name,
      f.id,
      1,
      4,
      1,
      18,
    ]);
  const canonical = (n, factKey, kind) => ({
    id: framed('canonical-node-v1', [factKey]),
    factKey,
    repositoryId: t.repositoryId,
    revisionId: t.revisionId,
    name: n.name,
    qualifiedName: n.qualifiedName,
    sourceRange: kind === 'MODULE' ? null : n.sourceRange,
    confidence,
    kind,
    ...(kind === 'SYMBOL' ? { symbolKind: 'FUNCTION' } : {}),
  });
  const nodePairs = [
    { provider: ref(moduleId), canonical: canonical(nodes[0], moduleKey, 'MODULE') },
    { provider: ref(symbolId), canonical: canonical(nodes[1], symbolKey, 'SYMBOL') },
  ].sort((a, b) => (a.canonical.factKey < b.canonical.factKey ? -1 : 1));
  write(mode + '/normalized.json', { nodePairs, edgePairs: [] });
  write(mode + '/authoring.json', {
    kind: 'INDEPENDENT_LITERAL_DYNAMIC_MALFORMED_REFERENCE',
    sourceSha256: sha(source),
    spans,
    recordCount: 9,
    counts,
    outcome: 'PARTIAL',
    parserRecoveryHypothesis: 'MISSING_CLOSE_PAREN_FUNCTION_DEFINITION',
    limitations: [
      'SYNTHETIC_UNIT_CONTEXT_AND_OLD_CONTROLS',
      'RECOVERED_SYNTAX_IS_NOT_VALID_SOURCE',
      'NO_DYNAMIC_VALUE_INFERENCE',
      'NO_ACTUAL_NATIVE_CLI_OR_PROFILE',
      'NO_CANONICAL_SYNTAX_SUPPORT_OR_STORE',
    ],
  });
}
write('fixture.json', {
  schemaVersion: 1,
  id: 'p1-syntax-dynamic-malformed-oracle-v1',
  category: 'runtime-graph',
  phase: '1',
  languages: [],
  frameworks: [],
  capabilities: ['BOUNDED_LIBRARY_FULL_OUTPUT_ORACLE_ONLY'],
  inputs: Object.fromEntries(
    ['calibration', 'holdout'].flatMap((m) =>
      [
        ['Source', 'app.py'],
        ['Request', 'request.json'],
        ['RequestBytes', 'request.jsonl'],
        ['Context', 'context.json'],
        ['Basis', 'basis.json'],
        ['Authoring', 'authoring.json'],
      ].map(([k, f]) => [m + k, m + '/' + f]),
    ),
  ),
  expected: Object.fromEntries(
    ['calibration', 'holdout'].flatMap((m) =>
      [
        ['Stream', 'events.jsonl'],
        ['CanonicalCode', 'normalized.json'],
      ].map(([k, f]) => [m + k, m + '/' + f]),
    ),
  ),
  criticalFacts: [],
  qualityGates: {},
});
