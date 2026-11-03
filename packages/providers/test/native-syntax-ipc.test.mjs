import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as api from '../dist/index.js';
const root = new URL('../../../fixtures/phase1/syntax-budget-contract/', import.meta.url);
const read = async (p) => readFile(new URL(p, root));
const json = async (p) => JSON.parse(await read(p));
const requests = {
  java: await json('inputs/java-request.json'),
  python: await json('inputs/python-request.json'),
};
const bytes = {
  java: await read('inputs/java-events.jsonl'),
  python: await read('inputs/python-events.jsonl'),
};
const expected = await json('expected/outcomes.json');
const copy = (x) => structuredClone(x);
const lines = (b) =>
  b
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map((s) => Buffer.from(s + '\n'));
function run(req = requests.java, raw = lines(bytes.java)) {
  assert.equal(typeof api.validateSyntaxObservationStream, 'function');
  return api.validateSyntaxObservationStream(req, raw);
}
function edit(fn, language = 'java', reseal = true) {
  const records = lines(bytes[language]).map((b) => JSON.parse(b));
  fn(records);
  if (reseal && records.at(-1)?.type === 'SYNTAX_COMPLETED') {
    const prefix = records
      .slice(0, -1)
      .map((x) => JSON.stringify(x) + '\n')
      .join('');
    records.at(-1).payload.checksum = createHash('sha256').update(prefix).digest('hex');
  }
  return records.map((x) => Buffer.from(JSON.stringify(x) + '\n'));
}
function refused(fn, code = 'PROTOCOL_CORRUPTION') {
  assert.throws(fn, (e) => e.code === code && !e.message.includes('/items'));
}
for (const language of ['java', 'python'])
  test('shared literal ' + language + ' stream matches independent oracle', () => {
    const x = run(requests[language], lines(bytes[language]));
    assert.equal(x.outcome, expected[language].outcome);
    assert.deepEqual(x.counts, expected[language].counts);
    assert.equal(x.checksum, expected[language].checksum);
    assert.equal(Object.isFrozen(x), true);
  });
test('request positive is preserved', () => {
  assert.equal(typeof api.parseSyntaxObservationRequest, 'function');
  assert.deepEqual(api.parseSyntaxObservationRequest(requests.java), requests.java);
});
test('explicit version and operation have no legacy upgrade', () => {
  for (const name of [
    'NativeRequestEnvelopeSchema',
    'NativeAnalyzeRequestV2Schema',
    'NativeRequestHeaderV3Schema',
  ]) {
    assert.equal(typeof api[name]?.safeParse, 'function');
    assert.equal(api[name].safeParse(requests.java).success, false);
  }
  const r = copy(requests.java);
  r.protocolVersion = 3;
  refused(() => {
    assert.equal(typeof api.parseSyntaxObservationRequest, 'function');
    api.parseSyntaxObservationRequest(r);
  }, 'INCOMPATIBLE_PROTOCOL_VERSION');
});
test('missing terminal refuses partial observations', () =>
  refused(() => run(requests.java, lines(bytes.java).slice(0, -1))));
for (const [name, fn] of [
  ['checksum is mandatory', (r) => delete r.at(-1).payload.checksum],
  ['checksum is verified', (r) => (r.at(-1).payload.checksum = '0'.repeat(64))],
  [
    'context basis is bound',
    (r) => (r[0].payload.expectedActivationBasis.codeActivationDigest = 'f'.repeat(64)),
  ],
  ['terminal counts are exact', (r) => r.at(-1).payload.counts.syntax++],
  ['request identity is bound', (r) => (r[1].requestId = 'other')],
  ['sequence must be contiguous', (r) => (r[1].sequence = 3)],
  ['foreign owner refused', (r) => (r[1].payload.owner.providerFactId = 'missing')],
  ['foreign source refused', (r) => (r[1].payload.sourceFileId = 'missing')],
  ['source fingerprint is bound', (r) => (r[1].payload.sourceFingerprint = 'changed')],
  ['duplicate coverage refused', (r) => r.splice(2, 0, copy(r[2]))],
  ['missing coverage refused', (r) => r.splice(2, 1)],
  ['post terminal refused', (r) => r.push(copy(r.at(-1)))],
  ['unknown event refused', (r) => (r[1].type = 'PUBLISH_KNOWLEDGE')],
  [
    'raw canonical ownership refused',
    (r) => (r[1].payload.owner = { kind: 'CODE_NODE', id: 'code:handler' }),
  ],
])
  test(name, () =>
    refused(() => run(requests.java, edit(fn, 'java', !name.startsWith('checksum')))),
  );
test('raw byte alteration cannot retain checksum', () => {
  const b = lines(bytes.java);
  b[1] = Buffer.from(b[1].toString().replace('/items', '/other'));
  refused(() => run(requests.java, b));
});
for (const [name, change] of [
  ['CRLF', (b) => Buffer.from(b.toString().replaceAll('\n', '\r\n'))],
  ['BOM', (b) => Buffer.concat([Buffer.from([239, 187, 191]), b])],
  ['unterminated', (b) => b.subarray(0, -1)],
  ['malformed UTF8', () => Buffer.from([255, 10])],
  ['multiple records per line', (b) => Buffer.concat([b, b])],
])
  test('strict framing ' + name, () => {
    const b = lines(bytes.java);
    b[0] = change(b[0]);
    refused(() => run(requests.java, b));
  });
for (const [name, change] of [
  ['duplicate file', (r) => r.payload.sourceFiles.push(copy(r.payload.sourceFiles[0]))],
  ['source secret', (r) => (r.payload.sourceFiles[0].sensitivity = 'SECRET')],
  ['language absent', (r) => (r.payload.languages = [])],
  ['owner foreign revision', (r) => (r.payload.owners[0].canonicalRef.entity.revisionId = 'other')],
  [
    'changed and removed overlap',
    (r) =>
      (r.payload.removedSourceFiles = [
        { id: 'file:one', path: 'src/Handler.java', previousContentFingerprint: 'old' },
      ]),
  ],
  ['unapproved protocol field', (r) => (r.payload.databasePath = '/fixture/db')],
  ['zero budget', (r) => (r.payload.resourceBudget.maxDepth = 0)],
])
  test('request rejects ' + name, () => {
    const r = copy(requests.java);
    change(r);
    assert.equal(typeof api.parseSyntaxObservationRequest, 'function');
    refused(() => api.parseSyntaxObservationRequest(r), 'INVALID_REQUEST');
  });
test('caller byte and event budgets are enforced', () => {
  const r = copy(requests.java);
  r.payload.resourceBudget.maxOutputBytes = 1;
  refused(() => run(r), 'RESOURCE_LIMIT_EXCEEDED');
  r.payload.resourceBudget.maxOutputBytes = 65536;
  r.payload.resourceBudget.maxEvents = 1;
  refused(() => run(r), 'RESOURCE_LIMIT_EXCEEDED');
});
test('Python owner must be emitted first and scoped to snapshot', () => {
  refused(() =>
    run(
      requests.python,
      edit((r) => (r[1].payload.providerSnapshotId = 'other'), 'python'),
    ),
  );
  refused(() =>
    run(
      requests.python,
      edit((r) => (r[1].payload.providerKind = 'python.call'), 'python'),
    ),
  );
});
test('unknown expression remains typed UNKNOWN', () => {
  const r = edit((x) => {
    x[1].payload.payload.arguments[0].value = { kind: 'UNKNOWN', reason: 'DYNAMIC' };
  });
  const prefix = Buffer.concat(r.slice(0, -1));
  const terminal = JSON.parse(r.at(-1));
  terminal.payload.checksum = createHash('sha256').update(prefix).digest('hex');
  r[r.length - 1] = Buffer.from(JSON.stringify(terminal) + '\n');
  assert.equal(run(requests.java, r).outcome, 'SUCCEEDED');
});
test('failed terminal returns no applicable batch', () => {
  const r = edit((x) => {
    x[3].type = 'SYNTAX_FAILED';
    x[3].payload = { code: 'CANCELLED', message: 'Cancelled', retryable: false };
  });
  refused(() => run(requests.java, r), 'CANCELLED');
});
test('accessor request is refused without invoking it', () => {
  let seen = false;
  const r = copy(requests.java);
  Object.defineProperty(r, 'payload', {
    enumerable: true,
    get() {
      seen = true;
      throw Error('raw');
    },
  });
  assert.equal(typeof api.parseSyntaxObservationRequest, 'function');
  refused(() => api.parseSyntaxObservationRequest(r), 'INVALID_REQUEST');
  assert.equal(seen, false);
});

test('valid partial coverage remains partial', () => {
  const r = edit((x) => {
    x[2].payload.status = 'PARTIAL';
    x[2].payload.limitations = ['DYNAMIC'];
    x[3].payload.outcome = 'PARTIAL';
  });
  assert.equal(run(requests.java, r).outcome, 'PARTIAL');
});
test('duplicate coverage refuses even with resequenced counts and valid checksum', () => {
  const r = edit((x) => {
    x.splice(2, 0, copy(x[2]));
    x.forEach((e, i) => (e.sequence = i));
    x.at(-1).payload.counts.coverage = 2;
  });
  refused(() => run(requests.java, r));
});
test('duplicate syntax refuses even with correct counts and integrity', () => {
  const r = edit((x) => {
    x.splice(2, 0, copy(x[1]));
    x.forEach((e, i) => (e.sequence = i));
    x.at(-1).payload.counts.syntax = 2;
  });
  refused(() => run(requests.java, r));
});
test('unrequested node from removed file is not applicable', () => {
  const r = copy(requests.python);
  r.payload.sourceFiles = [];
  r.payload.removedSourceFiles = [
    { id: 'file:one', path: 'src/handler.py', previousContentFingerprint: 'source:one' },
  ];
  const q = r.payload;
  const { ownerMapDigest: _, ...ownerBinding } = q.ownerBinding;
  q.ownerBinding.ownerMapDigest = api.computeSyntaxOwnerMapDigest({
    expectedActivationBasis: q.expectedActivationBasis,
    targetSource: q.targetSource,
    ownerBinding,
    providerId: q.providerId,
    providerSnapshotId: q.providerSnapshotId,
    sourceFiles: q.sourceFiles,
    owners: q.owners,
  });
  refused(() => run(r, lines(bytes.python)));
});
test('partial observation is never reported succeeded', () =>
  refused(() =>
    run(
      requests.java,
      edit((x) => {
        x[2].payload.status = 'PARTIAL';
        x[2].payload.limitations = ['DYNAMIC'];
      }),
    ),
  ));
test('nested syntax obeys explicit depth budget', () => {
  const req = copy(requests.java);
  req.payload.resourceBudget.maxDepth = 16;
  const raw = edit((x) => {
    let v = { kind: 'NULL' };
    for (let i = 0; i < 20; i++) v = { kind: 'ARRAY', items: [v] };
    x[1].payload.payload.arguments[0].value = v;
  });
  refused(() => run(req, raw), 'RESOURCE_LIMIT_EXCEEDED');
});

for (const language of ['java', 'python'])
  test('shared raw ' + language + ' request has exact one-record framing', async () => {
    const b = await read('inputs/' + language + '-request.jsonl');
    assert.equal(b.at(-1), 10);
    assert.equal(b.includes(13), false);
    assert.equal([...b].filter((v) => v === 10).length, 1);
    assert.deepEqual(JSON.parse(b), requests[language]);
    assert.deepEqual(api.parseSyntaxObservationRequest(JSON.parse(b)), requests[language]);
  });
