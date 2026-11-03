// Independent changed-only Source reference;no product/parser/observed output.
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
const write = (p, v) => fs.writeFileSync(new URL(p, root), JSON.stringify(v, null, 2) + '\n'),
  range = (a, b, c, d) => ({
    sourceFileId: 'file:one',
    startLine: a,
    startColumn: b,
    endLine: c,
    endColumn: d,
  }),
  confidence = { score: 1, method: 'parser', reasons: [] };
const template = fs.readFileSync(
  new URL('../syntax-present-activation-oracle/calibration/request.json', root),
);
assert.equal(sha(template), '35b352c6725660c392e6ab767724c17eb8c0e0d371ce5188beb30c11a3b70556');
for (const [mode, suffix] of [
  ['calibration', 'fixture'],
  ['holdout', 'holdout'],
]) {
  const source = fs.readFileSync(
      new URL('../syntax-observation-corpus/' + mode + '/changed-only-restart/app.py', root),
    ),
    name = 'changed_' + suffix;
  assert.equal(source.toString(), 'def ' + name + '():\n    return None\n');
  assert.equal(source.length, 39);
  assert.equal(source.subarray(4, 19).toString(), name);
  assert.equal(source.subarray(0, 38).toString(), 'def ' + name + '():\n    return None');
  fs.mkdirSync(new URL(mode + '/', root), { recursive: true });
  fs.writeFileSync(new URL(mode + '/app.py', root), source);
  const request = JSON.parse(template),
    p = request.payload,
    f = p.sourceFiles[0],
    t = p.targetSource,
    a = p.expectedActivationBasis;
  f.contentFingerprint = 'sha256:' + sha(source);
  p.removedSourceFiles = [
    {
      id: 'file:removed',
      path: 'removed.py',
      previousContentFingerprint: 'content:removed-previous',
    },
  ];
  p.ownerBinding.ownerMapDigest = framed('codeatlas-native-syntax-owner-map-v1', [
    t.repositoryId,
    t.revisionId,
    t.contentFingerprint,
    'ACTIVE',
    a.repositoryId,
    a.revisionId,
    a.contentFingerprint,
    a.codeActivationDigest,
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
    expectedActivationBasis: a,
    targetSource: t,
    ownerBinding: { kind: 'PROVISIONAL_CODE', stageDigest: p.ownerBinding.stageDigest },
    providerId: p.providerId,
    providerSnapshotId: p.providerSnapshotId,
    sourceFiles: p.sourceFiles,
    owners: [],
  });
  write(mode + '/basis.json', { ...t, codeActivationDigest: 'd'.repeat(64) });
  const moduleId = framed('python-module-v1', ['app.py']),
    symbolId = framed('python-symbol-v1', ['app.py::' + name, 4, 19]),
    ref = (id) => ({ factType: 'NODE', providerId: p.providerId, providerFactId: id }),
    provider = (id, kind, name, qualifiedName, sourceRange) => ({
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
    provider(moduleId, 'python.module', 'app.py', 'app.py', range(0, 0, 2, 0)),
    provider(symbolId, 'python.symbol', name, 'app.py::' + name, range(0, 4, 0, 19)),
  ];
  const observation = {
    providerSyntaxId: framed('python-syntax-v1', ['app.py', 'DECLARATION', 0, 38]),
    sourceFileId: f.id,
    sourceFingerprint: f.contentFingerprint,
    sourceRange: range(0, 0, 1, 15),
    owner: ref(symbolId),
    syntaxKind: 'DECLARATION',
    payload: { declaredType: null, parameterNames: [], modifiers: [] },
  };
  const binding = {
      expectedActivationBasis: a,
      targetSource: t,
      ownerBinding: p.ownerBinding,
      extractorVersion: p.extractorVersion,
    },
    counts = { nodes: 2, edges: 0, syntax: 1, coverage: 1, diagnostics: 0 };
  const rows = [
    ['SYNTAX_STARTED', binding],
    ...nodes.map((n) => ['NODE', n]),
    ['SYNTAX_OBSERVATION', observation],
    [
      'COVERAGE',
      {
        sourceFileId: f.id,
        sourceFingerprint: f.contentFingerprint,
        status: 'COMPLETE',
        limitations: [],
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
    sequence: 5,
    type: 'SYNTAX_COMPLETED',
    payload: { ...binding, outcome: 'SUCCEEDED', counts, checksum: sha(Buffer.from(prefix)) },
  });
  assert.equal(rows.length, 6);
  fs.writeFileSync(
    new URL(mode + '/events.jsonl', root),
    rows.map((r) => JSON.stringify(r) + '\n').join(''),
  );
  const failed = [
    rows[0],
    {
      protocolVersion: 4,
      requestId: request.requestId,
      sequence: 1,
      type: 'SYNTAX_FAILED',
      payload: {
        code: 'SOURCE_CHANGED',
        message: 'Syntax observation did not complete',
        retryable: false,
      },
    },
  ];
  fs.writeFileSync(
    new URL(mode + '/events-changed-source.jsonl', root),
    failed.map((r) => JSON.stringify(r) + '\n').join(''),
  );
  const keys = [
    framed('node-fact-v1', [t.repositoryId, t.revisionId, 'MODULE', 'app.py']),
    framed('node-fact-v1', [
      t.repositoryId,
      t.revisionId,
      'SYMBOL',
      'FUNCTION',
      'app.py::' + name,
      f.id,
      0,
      4,
      0,
      19,
    ]),
  ];
  const nodePairs = nodes
    .map((n, i) => ({
      provider: ref(n.providerFactId),
      canonical: {
        id: framed('canonical-node-v1', [keys[i]]),
        factKey: keys[i],
        repositoryId: t.repositoryId,
        revisionId: t.revisionId,
        name: n.name,
        qualifiedName: n.qualifiedName,
        sourceRange: i === 0 ? null : n.sourceRange,
        confidence,
        kind: i === 0 ? 'MODULE' : 'SYMBOL',
        ...(i === 0 ? {} : { symbolKind: 'FUNCTION' }),
      },
    }))
    .sort((a, b) => (a.canonical.factKey < b.canonical.factKey ? -1 : 1));
  write(mode + '/normalized.json', { nodePairs, edgePairs: [] });
  write(mode + '/authoring.json', {
    kind: 'INDEPENDENT_LITERAL_CHANGED_ONLY_REFERENCE',
    sourceSha256: sha(source),
    spans: { functionName: [4, 19], function: [0, 38] },
    recordCount: 6,
    counts,
    outcome: 'SUCCEEDED',
    nonRequestedPaths: ['removed.py', 'retained.py'],
    limitations: [
      'SYNTHETIC_PRESENT_ACTIVE_PROVISIONAL_FINAL_CONTEXT',
      'REMOVED_METADATA_NOT_IN_OWNER_MAP_CONTEXT_OR_DIGEST',
      'NO_STORE_REMOVAL_PUBLICATION_OR_FULL_IO_TRACE',
      'SAME_PROCESS_LIBRARY_RECONSTRUCTION_ONLY_NOT_PROCESS_RESTART',
      'NO_ACTUAL_NATIVE_CLI_PROFILE',
    ],
  });
}
write('fixture.json', {
  schemaVersion: 1,
  id: 'p1-syntax-changed-only-oracle-v1',
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
        ['ChangedSource', 'events-changed-source.jsonl'],
        ['CanonicalCode', 'normalized.json'],
      ].map(([k, f]) => [m + k, m + '/' + f]),
    ),
  ),
  criticalFacts: [],
  qualityGates: {},
});
