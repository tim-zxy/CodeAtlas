// SHA-pinned independent Source-reference composition; no product/parser/observed output.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url);
const pins = {
  'java/calibration/Endpoint.java':
    'fa9a07e5b149109de9313e541101b3363a014b87e18f469e91643781ed2833c1',
  'java/calibration/request.json':
    '5ee32658acece392e24111b3b8b80d3a4eb3b0a38f1487d1c599d997c6ed1233',
  'java/calibration/events.jsonl':
    '02502a7b76c72c723c7a4578d8099973a453cf7150fabbeb0e37fab668c4d177',
  'java/calibration/symbols.json':
    '1ffdff044834b9e2e8768a26f8d75c64bc191caf943b1bc00af82ad344c5c641',
  'java/calibration/provider-nodes.json':
    'ab0cab1ef3bf969f7663346b15f52587924d4603613264783cdaedb710de7c5e',
  'java/calibration/canonical-nodes.json':
    '42bcb7c024e729f14151268cc8906fe8d1149135803b689302f1fe05c6ba18ac',
  'java/holdout/Endpoint.java': '7a5f8528afb97200aa88f34389b95d1577910a9f7addb7c5548c781e0e5124cb',
  'java/holdout/request.json': '17940b30bdf6c5161b7ef954b68f1f8a379557dfb9fa4e19d04c6480b8da8484',
  'java/holdout/events.jsonl': '4a23c38a1cc2fece499980695e01d558b2ac8730df4135aaa9d9a02d0545539e',
  'java/holdout/symbols.json': '6423488174fb17eebb7c83ceded2c3192eb1e176c7b8a70ee90297d4847fda92',
  'java/holdout/provider-nodes.json':
    '312b7e4dbfa24537c1385e8139c037c381ce81af2b240f22ddecfc0efa4d829b',
  'java/holdout/canonical-nodes.json':
    '9e904302712fec8771d3abb8a86d8c684118fe6b6384a783a038d7087a6f9407',
  'python/calibration/app.py': '9e3012e6aaee68ca614e04a2aad0097292c86ef767f320fc61445527f910e69e',
  'python/calibration/request.json':
    '35b352c6725660c392e6ab767724c17eb8c0e0d371ce5188beb30c11a3b70556',
  'python/calibration/events.jsonl':
    '155a1402aac6725d121598156fd694f113b8ad07f2a345342896777840252ea1',
  'python/calibration/basis.json':
    'a6225613ce512b3569de2518503a147a9b05cc6e812c01fa8ecdd8c2ca379c99',
  'python/calibration/normalized.json':
    '63f1f0face77210618eb80aa9fd76bf1fd02d429445ef28f930b7a91fa175aa0',
  'python/holdout/app.py': '38d4338d71f7b9a6e3b097fc6cf857951170f256ed51cceda181747ca2ee33f8',
  'python/holdout/request.json': '3a7cbe965181bd029cdcf6f370fa3f2cbf20ebe81d877c123692c3a457406c65',
  'python/holdout/events.jsonl': 'c06ff2a0082440f1a3761d050b93d357931257d84645f0cfe55e158bd0f59859',
  'python/holdout/basis.json': 'a6225613ce512b3569de2518503a147a9b05cc6e812c01fa8ecdd8c2ca379c99',
  'python/holdout/normalized.json':
    '5a1a4aa89d4bba918091cc05bd1e12d25d4be1573db3f307bafe0f9c8174f2cd',
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
function bytes(kind, mode, file) {
  const folder = kind === 'java' ? 'syntax-java-owner-oracle' : 'syntax-present-activation-oracle';
  const b = fs.readFileSync(new URL('../' + folder + '/' + mode + '/' + file, root));
  assert.equal(sha(b), pins[kind + '/' + mode + '/' + file]);
  return b;
}
const read = (kind, mode, file) => JSON.parse(bytes(kind, mode, file));
const write = (p, v) => fs.writeFileSync(new URL(p, root), JSON.stringify(v, null, 2) + '\n');
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
function pythonFileId(v) {
  if (Array.isArray(v)) return v.map(pythonFileId);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [
        k,
        k === 'sourceFileId' && x === 'file:one' ? 'file:two' : pythonFileId(x),
      ]),
    );
  return v;
}
function bind(request) {
  const p = request.payload,
    t = p.targetSource,
    a = p.expectedActivationBasis;
  const files = [...p.sourceFiles].sort((a, b) =>
    Buffer.compare(Buffer.from(a.id), Buffer.from(b.id)),
  );
  const owners = [...p.owners].sort(
    (a, b) =>
      Buffer.compare(Buffer.from(a.sourceFileId), Buffer.from(b.sourceFileId)) ||
      Buffer.compare(
        Buffer.from(a.providerNodeRef.providerFactId),
        Buffer.from(b.providerNodeRef.providerFactId),
      ),
  );
  const fields = [
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
    String(files.length),
  ];
  for (const f of files)
    fields.push(
      f.id,
      f.path,
      f.contentFingerprint,
      f.languageHint,
      'SOURCE',
      'AUTHORED',
      'TEXT',
      'INTERNAL',
    );
  fields.push(String(owners.length));
  for (const o of owners)
    fields.push(
      o.sourceFileId,
      o.providerNodeRef.providerId,
      o.providerNodeRef.providerFactId,
      o.canonicalRef.repositoryId,
      'CODE_NODE',
      o.canonicalRef.entity.id,
      o.canonicalRef.entity.revisionId,
    );
  p.ownerBinding.ownerMapDigest = framed('codeatlas-native-syntax-owner-map-v1', fields).split(
    ':',
  )[1];
}
for (const mode of ['calibration', 'holdout']) {
  fs.mkdirSync(new URL(mode + '/', root), { recursive: true });
  for (const [kind, name] of [
    ['java', 'Endpoint.java'],
    ['python', 'app.py'],
  ]) {
    const b = bytes(kind, mode, name);
    assert.deepEqual(
      b,
      fs.readFileSync(
        new URL('../syntax-observation-corpus/' + mode + '/mixed-provisional/' + name, root),
      ),
    );
    fs.writeFileSync(new URL(mode + '/' + name, root), b);
  }
  const request = read('java', mode, 'request.json'),
    py = read('python', mode, 'request.json'),
    p = request.payload;
  for (const field of [
    'expectedActivationBasis',
    'targetSource',
    'providerId',
    'providerSnapshotId',
    'resourceBudget',
  ])
    assert.deepEqual(p[field], py.payload[field]);
  assert.equal(p.ownerBinding.stageDigest, py.payload.ownerBinding.stageDigest);
  const javaFile = p.sourceFiles[0],
    pythonFile = structuredClone(py.payload.sourceFiles[0]);
  pythonFile.id = 'file:two';
  p.sourceFiles = [pythonFile, javaFile];
  p.languages = [py.payload.languages[0], p.languages[0]];
  bind(request);
  write(mode + '/request.json', request);
  fs.writeFileSync(new URL(mode + '/request.jsonl', root), JSON.stringify(request) + '\n');
  write(mode + '/context.json', {
    expectedActivationBasis: p.expectedActivationBasis,
    targetSource: p.targetSource,
    ownerBinding: { kind: 'PROVISIONAL_CODE', stageDigest: p.ownerBinding.stageDigest },
    providerId: p.providerId,
    providerSnapshotId: p.providerSnapshotId,
    sourceFiles: p.sourceFiles,
    owners: p.owners,
  });
  fs.writeFileSync(new URL(mode + '/basis.json', root), bytes('python', mode, 'basis.json'));
  for (const [from, to] of [
    ['symbols.json', 'java-symbols.json'],
    ['provider-nodes.json', 'java-provider-nodes.json'],
    ['canonical-nodes.json', 'java-canonical-nodes.json'],
  ])
    fs.writeFileSync(new URL(mode + '/' + to, root), bytes('java', mode, from));
  const javaRows = bytes('java', mode, 'events.jsonl')
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map(JSON.parse);
  const pythonRows = bytes('python', mode, 'events.jsonl')
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map(JSON.parse);
  const binding = {
    expectedActivationBasis: p.expectedActivationBasis,
    targetSource: p.targetSource,
    ownerBinding: p.ownerBinding,
    extractorVersion: p.extractorVersion,
  };
  const rows = [
    { type: 'SYNTAX_STARTED', payload: binding },
    ...javaRows.slice(1, -1),
    ...pythonFileId(pythonRows.slice(1, -1)),
  ].map((r, sequence) => ({
    protocolVersion: 4,
    requestId: request.requestId,
    sequence,
    type: r.type,
    payload: r.payload,
  }));
  assert.equal(rows.length, 13);
  const prefix = rows.map((r) => JSON.stringify(r) + '\n').join('');
  rows.push({
    protocolVersion: 4,
    requestId: request.requestId,
    sequence: 13,
    type: 'SYNTAX_COMPLETED',
    payload: {
      ...binding,
      outcome: 'PARTIAL',
      counts: { nodes: 2, edges: 1, syntax: 7, coverage: 2, diagnostics: 0 },
      checksum: sha(Buffer.from(prefix)),
    },
  });
  fs.writeFileSync(
    new URL(mode + '/events.jsonl', root),
    rows.map((r) => JSON.stringify(r) + '\n').join(''),
  );
  const failed = [
    ...rows.slice(0, 4),
    {
      protocolVersion: 4,
      requestId: request.requestId,
      sequence: 4,
      type: 'SYNTAX_FAILED',
      payload: {
        code: 'SOURCE_CHANGED',
        message: 'Syntax observation did not complete',
        retryable: false,
      },
    },
  ];
  fs.writeFileSync(
    new URL(mode + '/events-changed-python.jsonl', root),
    failed.map((r) => JSON.stringify(r) + '\n').join(''),
  );
  const old = read('python', mode, 'normalized.json');
  assert.equal(old.nodePairs.length, 2);
  assert.equal(old.edgePairs.length, 1);
  const nodePairs = pythonFileId(old.nodePairs)
    .map((pair) => {
      const n = pair.canonical;
      const fields =
        n.kind === 'MODULE'
          ? [n.repositoryId, n.revisionId, 'MODULE', 'app.py']
          : [
              n.repositoryId,
              n.revisionId,
              'SYMBOL',
              'FUNCTION',
              n.qualifiedName,
              n.sourceRange.sourceFileId,
              n.sourceRange.startLine,
              n.sourceRange.startColumn,
              n.sourceRange.endLine,
              n.sourceRange.endColumn,
            ];
      const factKey = framed('node-fact-v1', fields);
      return { ...pair, canonical: { ...n, id: framed('canonical-node-v1', [factKey]), factKey } };
    })
    .sort((a, b) => (a.canonical.factKey < b.canonical.factKey ? -1 : 1));
  const module = nodePairs.find((p) => p.canonical.kind === 'MODULE').canonical;
  const edgePairs = pythonFileId(old.edgePairs).map((pair) => {
    const e = pair.canonical,
      r = e.sourceRange;
    assert.equal(e.kind, 'IMPORT');
    assert.equal(e.target.state, 'UNRESOLVED');
    assert.equal(e.target.originalHint, 'fastapi.FastAPI');
    const factKey = framed('edge-fact-v1', [
      e.repositoryId,
      e.revisionId,
      'IMPORT',
      module.factKey,
      r.sourceFileId,
      r.startLine,
      r.startColumn,
      r.endLine,
      r.endColumn,
      'UNRESOLVED',
      'fastapi.FastAPI',
    ]);
    return {
      ...pair,
      canonical: {
        ...e,
        id: framed('canonical-edge-v1', [factKey]),
        factKey,
        source: { factType: 'NODE', id: module.id },
      },
    };
  });
  write(mode + '/python-normalized.json', { nodePairs, edgePairs });
  write(mode + '/authoring.json', {
    kind: 'INDEPENDENT_PINNED_MIXED_SOURCE_REFERENCE',
    inputOrder: ['app.py', 'Endpoint.java'],
    outputOrder: ['Endpoint.java', 'app.py'],
    sourceIds: { java: 'file:one', python: 'file:two' },
    counts: { nodes: 2, edges: 1, syntax: 7, coverage: 2, diagnostics: 0 },
    recordCount: 14,
    outcome: 'PARTIAL',
    dependencies: Object.fromEntries(
      Object.entries(pins).filter(([k]) => k.includes('/' + mode + '/')),
    ),
    limitations: [
      'SYNTHETIC_UNIT_CONTEXT_AND_CONTROLS',
      'JAVA_DECLARATION_OWNER_REFERENCE_ONLY',
      'NO_COMPLETE_CODE_GRAPH_OR_ATOMIC_CODE_SYNTAX_STORE',
      'NO_ACTUAL_NATIVE_PROCESS_PROFILE',
    ],
  });
}
write('fixture.json', {
  schemaVersion: 1,
  id: 'p1-syntax-mixed-provisional-oracle-v1',
  category: 'runtime-graph',
  phase: '1',
  languages: [],
  frameworks: [],
  capabilities: ['BOUNDED_LIBRARY_FULL_OUTPUT_ORACLE_ONLY'],
  inputs: Object.fromEntries(
    ['calibration', 'holdout'].flatMap((m) =>
      [
        ['JavaSource', 'Endpoint.java'],
        ['PythonSource', 'app.py'],
        ['Request', 'request.json'],
        ['RequestBytes', 'request.jsonl'],
        ['Context', 'context.json'],
        ['Basis', 'basis.json'],
        ['JavaSymbols', 'java-symbols.json'],
        ['JavaProviderNodes', 'java-provider-nodes.json'],
        ['Authoring', 'authoring.json'],
      ].map(([k, f]) => [m + k, m + '/' + f]),
    ),
  ),
  expected: Object.fromEntries(
    ['calibration', 'holdout'].flatMap((m) =>
      [
        ['Stream', 'events.jsonl'],
        ['SecondFileFailedStream', 'events-changed-python.jsonl'],
        ['PythonCode', 'python-normalized.json'],
        ['JavaOwners', 'java-canonical-nodes.json'],
      ].map(([k, f]) => [m + k, m + '/' + f]),
    ),
  ),
  criticalFacts: [],
  qualityGates: {},
});
