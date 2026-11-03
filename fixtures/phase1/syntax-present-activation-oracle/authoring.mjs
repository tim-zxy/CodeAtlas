// Reuse pinned independently Source-authored expectations; no product/parser/observed-output input.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url),
  prior = new URL('../syntax-initial-absence-oracle/', root);
const pins = {
  'calibration/app.py': '9e3012e6aaee68ca614e04a2aad0097292c86ef767f320fc61445527f910e69e',
  'calibration/request.json': '3c611dd26db3abe7659088354a38e98a19d702eaf61cfd5bab56c9f813bd6f47',
  'calibration/context.json': '4a739127044466f4ea6c7ffaa2c0b9492c83083034c03ac67d57f214f55bc8b1',
  'calibration/basis.json': 'a6225613ce512b3569de2518503a147a9b05cc6e812c01fa8ecdd8c2ca379c99',
  'calibration/events.jsonl': '327d37cf1798d6f652fb6745f014be663c74e2065ab09f411e2eae6afc2e0401',
  'calibration/normalized.json': '63f1f0face77210618eb80aa9fd76bf1fd02d429445ef28f930b7a91fa175aa0',
  'calibration/authoring.json': '6ce4539dc12a52326738e8eda9f186015e8df1214d7c1249012caffcf4983b00',
  'holdout/app.py': '38d4338d71f7b9a6e3b097fc6cf857951170f256ed51cceda181747ca2ee33f8',
  'holdout/request.json': '47ba8d41fe395aa7ddc5dec21abbd68effb237182a86c96e585a060c2c3dc593',
  'holdout/context.json': '7f5053231c0d5e22972f718918d82313f7130d199c0bd0284cc5963e6c1b21cf',
  'holdout/basis.json': 'a6225613ce512b3569de2518503a147a9b05cc6e812c01fa8ecdd8c2ca379c99',
  'holdout/events.jsonl': 'fd28dba8c9e163b7b9a25d43e3148e58dee4197060e5dd65600a53d89708703d',
  'holdout/normalized.json': '5a1a4aa89d4bba918091cc05bd1e12d25d4be1573db3f307bafe0f9c8174f2cd',
  'holdout/authoring.json': '6bbfe401936d65f6b674e0af5fa4b0330edf76c2fa9f347a75d21f77646de93c',
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
function bytes(p) {
  const b = fs.readFileSync(new URL(p, prior));
  assert.equal(sha(b), pins[p], p);
  return b;
}
const read = (p) => JSON.parse(bytes(p));
const write = (p, v) => fs.writeFileSync(new URL(p, root), JSON.stringify(v, null, 2) + '\n');
function ownerDigest(fields) {
  const h = createHash('sha256')
    .update('codeatlas-native-syntax-owner-map-v1')
    .update(Buffer.from([0]));
  for (const value of fields) {
    const b = Buffer.from(String(value));
    h.update(String(b.length) + ':').update(b);
  }
  return h.digest('hex');
}
for (const mode of ['calibration', 'holdout']) {
  fs.mkdirSync(new URL(mode + '/', root), { recursive: true });
  const source = bytes(mode + '/app.py');
  assert.deepEqual(
    source,
    fs.readFileSync(
      new URL('../syntax-observation-corpus/' + mode + '/python-static/app.py', root),
    ),
  );
  fs.writeFileSync(new URL(mode + '/app.py', root), source);
  const request = read(mode + '/request.json'),
    p = request.payload;
  const active = {
    repositoryId: 'repo:one',
    revisionId: 'revision:worktree',
    contentFingerprint: 'content:previous',
    codeActivationDigest: 'a'.repeat(64),
  };
  p.expectedActivationBasis = active;
  const t = p.targetSource,
    f = p.sourceFiles[0];
  assert.equal(t.contentFingerprint, 'content:first');
  assert.equal(p.ownerBinding.kind, 'PROVISIONAL_CODE');
  assert.equal(p.ownerBinding.stageDigest, 'c'.repeat(64));
  p.ownerBinding.ownerMapDigest = ownerDigest([
    t.repositoryId,
    t.revisionId,
    t.contentFingerprint,
    'ACTIVE',
    active.repositoryId,
    active.revisionId,
    active.contentFingerprint,
    active.codeActivationDigest,
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
  ]);
  write(mode + '/request.json', request);
  fs.writeFileSync(new URL(mode + '/request.jsonl', root), JSON.stringify(request) + '\n');
  const context = read(mode + '/context.json');
  context.expectedActivationBasis = active;
  write(mode + '/context.json', context);
  fs.writeFileSync(new URL(mode + '/basis.json', root), bytes(mode + '/basis.json'));
  fs.writeFileSync(new URL(mode + '/normalized.json', root), bytes(mode + '/normalized.json'));
  const rows = bytes(mode + '/events.jsonl')
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map(JSON.parse);
  for (const row of [rows[0], rows.at(-1)]) {
    row.payload.expectedActivationBasis = active;
    row.payload.ownerBinding = p.ownerBinding;
  }
  const prefix = rows
    .slice(0, -1)
    .map((r) => JSON.stringify(r) + '\n')
    .join('');
  rows.at(-1).payload.checksum = sha(Buffer.from(prefix));
  fs.writeFileSync(
    new URL(mode + '/events.jsonl', root),
    prefix + JSON.stringify(rows.at(-1)) + '\n',
  );
  const author = read(mode + '/authoring.json');
  write(mode + '/authoring.json', {
    ...author,
    kind: 'INDEPENDENT_SOURCE_LITERAL_REBOUND_LIBRARY_ORACLE',
    caseClass: 'python-static',
    expectedActivation: 'PRESENT',
    dependencyDigests: Object.fromEntries(
      Object.entries(pins).filter(([p]) => p.startsWith(mode + '/')),
    ),
  });
}
write('fixture.json', {
  schemaVersion: 1,
  id: 'p1-syntax-present-activation-oracle-v1',
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
