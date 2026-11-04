// Independent Source-literal oracle authoring. No product imports, parser or observed-output input.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = new URL('./', import.meta.url);
const sha = (b) => createHash('sha256').update(b).digest('hex');
function framed(domain, fields) {
  const h = createHash('sha256')
    .update(domain)
    .update(Buffer.from([0]));
  for (const field of fields) {
    const b = Buffer.from(String(field));
    h.update(String(b.length) + ':').update(b);
  }
  return domain + ':' + h.digest('hex');
}
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
const write = (p, v) => fs.writeFileSync(new URL(p, root), JSON.stringify(v, null, 2) + '\n');
for (const [mode, suffix, pathLiteral] of [
  ['calibration', 'fixture', '/fixture'],
  ['holdout', 'holdout', '/holdout'],
]) {
  const source = fs.readFileSync(
    new URL('../syntax-observation-corpus/' + mode + '/initial-absent/app.py', root),
  );
  const name = 'endpoint_' + suffix;
  assert.equal(
    source.toString('utf8'),
    'from fastapi import FastAPI\napp = FastAPI()\n@app.get("' +
      pathLiteral +
      '")\ndef ' +
      name +
      '():\n    return None\n',
  );
  assert.equal(source.length, 105);
  const spans = {
    module: [0, 105],
    import: [20, 27],
    assignment: [28, 43],
    invocation: [34, 43],
    decoration: [44, 64],
    argument: [53, 63],
    function: [65, 104],
    functionName: [69, 85],
  };
  for (const [key, text] of [
    ['import', 'FastAPI'],
    ['assignment', 'app = FastAPI()'],
    ['invocation', 'FastAPI()'],
    ['decoration', '@app.get("' + pathLiteral + '")'],
    ['argument', '"' + pathLiteral + '"'],
    ['functionName', name],
  ]) {
    const [a, b] = spans[key];
    assert.equal(source.subarray(a, b).toString('utf8'), text);
  }
  fs.mkdirSync(new URL(mode + '/', root), { recursive: true });
  fs.writeFileSync(new URL(mode + '/app.py', root), source);
  const request = JSON.parse(
    fs.readFileSync(new URL('../syntax-budget-contract/inputs/python-initial-request.json', root)),
  );
  const p = request.payload;
  p.languages[0].grammarVersion = '0.25.0';
  p.languages[0].analyzerVersion = '0.0.0';
  p.sourceFiles[0].path = 'app.py';
  p.sourceFiles[0].contentFingerprint = 'sha256:' + sha(source);
  const f = p.sourceFiles[0],
    t = p.targetSource;
  const ownerFields = [
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
  ];
  p.ownerBinding.ownerMapDigest = framed('codeatlas-native-syntax-owner-map-v1', ownerFields).split(
    ':',
  )[1];
  const context = {
    expectedActivationBasis: null,
    targetSource: t,
    ownerBinding: { kind: 'PROVISIONAL_CODE', stageDigest: p.ownerBinding.stageDigest },
    providerId: p.providerId,
    providerSnapshotId: p.providerSnapshotId,
    sourceFiles: p.sourceFiles,
    owners: [],
  };
  write(mode + '/request.json', request);
  fs.writeFileSync(new URL(mode + '/request.jsonl', root), JSON.stringify(request) + '\n');
  write(mode + '/context.json', context);
  const basis = { ...t, codeActivationDigest: 'd'.repeat(64) };
  write(mode + '/basis.json', basis);
  const moduleId = framed('python-module-v1', ['app.py']);
  const symbolId = framed('python-symbol-v1', ['app.py::' + name, '69', '85']);
  const ref = (id) => ({ factType: 'NODE', providerId: 'native', providerFactId: id });
  const provider = (id, kind, name, qualifiedName, sourceRange) => ({
    providerId: 'native',
    providerFactId: id,
    providerSnapshotId: 'snapshot:one',
    repositoryId: t.repositoryId,
    revisionId: t.revisionId,
    providerKind: kind,
    name,
    qualifiedName,
    sourceRange,
    confidence,
  });
  const nodes = [
    provider(moduleId, 'python.module', 'app.py', 'app.py', range(0, 0, 5, 0)),
    provider(symbolId, 'python.symbol', name, 'app.py::' + name, range(3, 4, 3, 20)),
  ];
  const importId = framed('python-edge-v1', [
    'python.import',
    'app.py',
    '20',
    '27',
    'fastapi.FastAPI',
  ]);
  const edge = {
    providerId: 'native',
    providerFactId: importId,
    providerSnapshotId: 'snapshot:one',
    repositoryId: t.repositoryId,
    revisionId: t.revisionId,
    providerKind: 'python.import',
    source: ref(moduleId),
    target: unresolved('fastapi.FastAPI'),
    sourceRange: range(0, 20, 0, 27),
    confidence,
  };
  function observation(kind, bytes, sourceRange, owner, payload) {
    return {
      providerSyntaxId: framed('python-syntax-v1', ['app.py', kind, ...bytes.map(String)]),
      sourceFileId: f.id,
      sourceFingerprint: f.contentFingerprint,
      sourceRange,
      owner: ref(owner),
      syntaxKind: kind,
      payload,
    };
  }
  const syntax = [
    observation('ASSIGNMENT', spans.import, range(0, 20, 0, 27), moduleId, {
      targetName: 'FastAPI',
      value: { kind: 'REFERENCE', name: 'fastapi.FastAPI', target: unresolved('fastapi.FastAPI') },
    }),
    observation('ASSIGNMENT', spans.assignment, range(1, 0, 1, 15), moduleId, {
      targetName: 'app',
      value: { kind: 'UNKNOWN', reason: 'CALL_RESULT' },
    }),
    observation('INVOCATION', spans.invocation, range(1, 6, 1, 15), moduleId, {
      callee: { name: 'FastAPI', target: unresolved('FastAPI') },
      arguments: [],
      receiver: null,
    }),
    observation('DECORATION', spans.decoration, range(2, 0, 2, 20), symbolId, {
      callee: { name: 'app.get', target: unresolved('app.get') },
      arguments: [
        {
          name: null,
          value: { kind: 'STRING', value: pathLiteral },
          sourceRange: range(2, 9, 2, 19),
        },
      ],
    }),
    observation('DECLARATION', spans.function, range(3, 0, 4, 15), symbolId, {
      declaredType: null,
      parameterNames: [],
      modifiers: [],
    }),
  ];
  const binding = {
    expectedActivationBasis: null,
    targetSource: t,
    ownerBinding: p.ownerBinding,
    extractorVersion: 'syntax-v1',
  };
  const rows = [
    ['SYNTAX_STARTED', binding],
    ...nodes.map((n) => ['NODE', n]),
    ['EDGE', edge],
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
  ].map(([type, payload], sequence) => ({
    protocolVersion: 4,
    requestId: 'syntax:request',
    sequence,
    type,
    payload,
  }));
  const prefix = rows.map((r) => JSON.stringify(r) + '\n').join('');
  rows.push({
    protocolVersion: 4,
    requestId: 'syntax:request',
    sequence: 10,
    type: 'SYNTAX_COMPLETED',
    payload: {
      ...binding,
      outcome: 'PARTIAL',
      counts: { nodes: 2, edges: 1, syntax: 5, coverage: 1, diagnostics: 0 },
      checksum: sha(Buffer.from(prefix)),
    },
  });
  fs.writeFileSync(
    new URL(mode + '/events.jsonl', root),
    rows.map((r) => JSON.stringify(r) + '\n').join(''),
  );
  // Canonical expectations: independently encoded documented tuples; no normalizer/helper calls.
  const moduleKey = framed('node-fact-v1', [t.repositoryId, t.revisionId, 'MODULE', 'app.py']);
  const functionKey = framed('node-fact-v1', [
    t.repositoryId,
    t.revisionId,
    'SYMBOL',
    'FUNCTION',
    'app.py::' + name,
    'file:one',
    3,
    4,
    3,
    20,
  ]);
  const canonicalNode = (n, factKey, kind) => ({
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
    { provider: ref(moduleId), canonical: canonicalNode(nodes[0], moduleKey, 'MODULE') },
    { provider: ref(symbolId), canonical: canonicalNode(nodes[1], functionKey, 'SYMBOL') },
  ].sort((a, b) => (a.canonical.factKey < b.canonical.factKey ? -1 : 1));
  const edgeKey = framed('edge-fact-v1', [
    t.repositoryId,
    t.revisionId,
    'IMPORT',
    moduleKey,
    'file:one',
    0,
    20,
    0,
    27,
    'UNRESOLVED',
    'fastapi.FastAPI',
  ]);
  const edgePairs = [
    {
      provider: { factType: 'EDGE', providerId: 'native', providerFactId: importId },
      canonical: {
        id: framed('canonical-edge-v1', [edgeKey]),
        factKey: edgeKey,
        repositoryId: t.repositoryId,
        revisionId: t.revisionId,
        kind: 'IMPORT',
        source: { factType: 'NODE', id: framed('canonical-node-v1', [moduleKey]) },
        target: unresolved('fastapi.FastAPI'),
        sourceRange: range(0, 20, 0, 27),
        confidence,
      },
    },
  ];
  write(mode + '/normalized.json', { nodePairs, edgePairs });
  write(mode + '/authoring.json', {
    kind: 'INDEPENDENT_SOURCE_LITERAL_LIBRARY_ORACLE',
    sourceSha256: sha(source),
    spans,
    counts: { nodes: 2, edges: 1, syntax: 5, coverage: 1, diagnostics: 0 },
    outcome: 'PARTIAL',
    limitations: [
      'SYNTHETIC_UNIT_REPO_AND_STAGE_CONTEXT',
      'EXISTING_UNIT_BUDGETS_ONLY',
      'NO_ACTUAL_NATIVE_CLI_OR_PROFILE_QUALIFICATION',
      'NO_SYNTAX_CANONICAL_SUPPORT_OR_STORE_ACTIVATION',
    ],
  });
}
write('fixture.json', {
  schemaVersion: 1,
  id: 'p1-syntax-initial-absence-oracle-v1',
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
      ].map(([key, file]) => [m + key, m + '/' + file]),
    ),
  ),
  expected: Object.fromEntries(
    ['calibration', 'holdout'].flatMap((m) =>
      [
        ['Stream', 'events.jsonl'],
        ['Code', 'normalized.json'],
      ].map(([key, file]) => [m + key, m + '/' + file]),
    ),
  ),
  criticalFacts: [],
  qualityGates: {},
});
