// Independent fixed32-function Source reference and derived boundary failures.
// No product helper,parser or observed-output input.
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
  new URL('../syntax-initial-absence-oracle/calibration/request.json', root),
);
assert.equal(sha(template), '3c611dd26db3abe7659088354a38e98a19d702eaf61cfd5bab56c9f813bd6f47');
for (const [mode, suffix] of [
  ['calibration', 'fixture'],
  ['holdout', 'holdout'],
]) {
  const source = fs.readFileSync(
    new URL('../syntax-observation-corpus/' + mode + '/bounded-output/app.py', root),
  );
  const names = Array.from({ length: 32 }, (_, i) => 'item_' + suffix + '_' + i),
    snippets = names.map((n) => 'def ' + n + '():\n    return None\n');
  assert.equal(source.toString(), snippets.join('\n'));
  assert.equal(source.length, 1269);
  let offset = 0;
  const declarations = names.map((name, i) => {
    const length = snippets[i].length;
    const d = {
      name,
      qualified: 'app.py::' + name,
      nameBytes: [offset + 4, offset + 4 + name.length],
      nameRange: range(i * 3, 4, i * 3, 4 + name.length),
      bytes: [offset, offset + length - 1],
      range: range(i * 3, 0, i * 3 + 1, 15),
    };
    assert.equal(source.subarray(...d.nameBytes).toString(), name);
    assert.equal(source.subarray(...d.bytes).toString(), snippets[i].slice(0, -1));
    offset += length + 1;
    return d;
  });
  assert.equal(offset - 1, source.length);
  fs.mkdirSync(new URL(mode + '/', root), { recursive: true });
  fs.writeFileSync(new URL(mode + '/app.py', root), source);
  const request = JSON.parse(template),
    p = request.payload,
    f = p.sourceFiles[0],
    t = p.targetSource;
  f.contentFingerprint = 'sha256:' + sha(source);
  p.resourceBudget.maxEvents = 1000; // Existing syntax_producer_unit allowance,not a product default.
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
    ref = (id) => ({ factType: 'NODE', providerId: p.providerId, providerFactId: id });
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
    provider(moduleId, 'python.module', 'app.py', 'app.py', range(0, 0, 95, 0)),
    ...declarations.map((d) =>
      provider(
        framed('python-symbol-v1', [d.qualified, ...d.nameBytes]),
        'python.symbol',
        d.name,
        d.qualified,
        d.nameRange,
      ),
    ),
  ];
  const syntax = declarations.map((d, i) => ({
    providerSyntaxId: framed('python-syntax-v1', ['app.py', 'DECLARATION', ...d.bytes]),
    sourceFileId: f.id,
    sourceFingerprint: f.contentFingerprint,
    sourceRange: d.range,
    owner: ref(nodes[i + 1].providerFactId),
    syntaxKind: 'DECLARATION',
    payload: { declaredType: null, parameterNames: [], modifiers: [] },
  }));
  const binding = {
      expectedActivationBasis: null,
      targetSource: t,
      ownerBinding: p.ownerBinding,
      extractorVersion: p.extractorVersion,
    },
    counts = { nodes: 33, edges: 0, syntax: 32, coverage: 1, diagnostics: 0 };
  const rows = [
    ['SYNTAX_STARTED', binding],
    ...nodes.map((n) => ['NODE', n]),
    ...syntax.map((s) => ['SYNTAX_OBSERVATION', s]),
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
    sequence: 67,
    type: 'SYNTAX_COMPLETED',
    payload: { ...binding, outcome: 'SUCCEEDED', counts, checksum: sha(Buffer.from(prefix)) },
  });
  assert.equal(rows.length, 68);
  const full = Buffer.from(rows.map((r) => JSON.stringify(r) + '\n').join(''));
  fs.writeFileSync(new URL(mode + '/events.jsonl', root), full);
  const boundaries = [
    ['events-short', 66, 'RESOURCE_LIMIT_EXCEEDED'],
    ['bytes-short', 67, 'RESOURCE_LIMIT_EXCEEDED'],
    ['changed-source', 1, 'SOURCE_CHANGED'],
  ];
  for (const [name, sequence, code] of boundaries) {
    const failed = [
      ...rows.slice(0, sequence),
      {
        protocolVersion: 4,
        requestId: request.requestId,
        sequence,
        type: 'SYNTAX_FAILED',
        payload: { code, message: 'Syntax observation did not complete', retryable: false },
      },
    ];
    fs.writeFileSync(
      new URL(mode + '/events-' + name + '.jsonl', root),
      failed.map((r) => JSON.stringify(r) + '\n').join(''),
    );
  }
  const keys = [
    framed('node-fact-v1', [t.repositoryId, t.revisionId, 'MODULE', 'app.py']),
    ...declarations.map((d) => {
      const r = d.nameRange;
      return framed('node-fact-v1', [
        t.repositoryId,
        t.revisionId,
        'SYMBOL',
        'FUNCTION',
        d.qualified,
        f.id,
        r.startLine,
        r.startColumn,
        r.endLine,
        r.endColumn,
      ]);
    }),
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
    kind: 'INDEPENDENT_LITERAL_BOUNDED_OUTPUT_REFERENCE',
    sourceSha256: sha(source),
    declarations,
    recordCount: 68,
    rawExpectedBytes: full.length,
    counts,
    outcome: 'SUCCEEDED',
    derivedTestBoundaries: {
      eventsExact: 68,
      eventsOneBelow: 67,
      bytesExact: full.length,
      bytesOneBelow: full.length - 1,
    },
    limitations: [
      'EXISTING_UNIT_MAX_EVENTS_1000_NOT_PROFILE_OR_DEFAULT',
      'SYNTHETIC_UNIT_CONTEXT_AND_OTHER_OLD_CONTROLS',
      'NO_ACTUAL_NATIVE_CLI_PROFILE_OR_STORE',
    ],
  });
}
write('fixture.json', {
  schemaVersion: 1,
  id: 'p1-syntax-bounded-output-oracle-v1',
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
        ['EventShort', 'events-events-short.jsonl'],
        ['ByteShort', 'events-bytes-short.jsonl'],
        ['ChangedSource', 'events-changed-source.jsonl'],
        ['CanonicalCode', 'normalized.json'],
      ].map(([k, f]) => [m + k, m + '/' + f]),
    ),
  ),
  criticalFacts: [],
  qualityGates: {},
});
