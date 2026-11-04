import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as api from './syntax-observation-evidence.mjs';
import { validateSyntaxObservationStream } from '../packages/providers/dist/index.js';
const root = new URL('../fixtures/phase1/syntax-budget-contract/inputs/', import.meta.url);
const cases = {};
for (const name of ['java', 'python', 'java-provisional', 'python-initial']) {
  cases[name] = {
    request: JSON.parse(await readFile(new URL(name + '-request.json', root))),
    bytes: await readFile(new URL(name + '-events.jsonl', root)),
  };
}
const hash = (b) => createHash('sha256').update(b).digest('hex');
const rows = (b) => b.toString('utf8').trimEnd().split('\n').map(JSON.parse);
function encode(records, reorder = false) {
  records.forEach((r, i) => {
    r.sequence = i;
  });
  const stringify = (r) => JSON.stringify(reorder ? reverse(r) : r) + '\n';
  const prefix = records.slice(0, -1).map(stringify).join('');
  records.at(-1).payload.checksum = hash(Buffer.from(prefix));
  return Buffer.from(prefix + stringify(records.at(-1)));
}
function reverse(v) {
  if (Array.isArray(v)) return v.map(reverse);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v)
        .reverse()
        .map(([k, x]) => [k, reverse(x)]),
    );
  return v;
}
function lines(b) {
  return b
    .toString('utf8')
    .split(/(?<=\n)/)
    .filter(Boolean)
    .map((s) => Buffer.from(s));
}
function compare(
  actual = cases.python.bytes,
  oracle = cases.python.bytes,
  request = cases.python.request,
) {
  assert.equal(typeof api.compareSyntaxObservationOutput, 'function');
  return api.compareSyntaxObservationOutput(request, actual, oracle);
}
for (const [name, c] of Object.entries(cases))
  test('full literal contract oracle match ' + name, () => {
    const out = compare(c.bytes, c.bytes, c.request);
    assert.equal(out.kind, 'CONTRACT_ORACLE_MATCH_ONLY');
    assert.equal(out.actualSha256, hash(c.bytes));
    assert.equal(out.oracleSha256, hash(c.bytes));
    assert.deepEqual(out.counts, rows(c.bytes).at(-1).payload.counts);
    assert.ok(Object.isFrozen(out) && Object.isFrozen(out.counts));
  });
test('key order may differ only after each raw checksum independently validates', () => {
  const actual = encode(rows(cases.python.bytes), true);
  assert.notEqual(hash(actual), hash(cases.python.bytes));
  const out = compare(actual);
  assert.notEqual(out.actualSha256, out.oracleSha256);
});
for (const [name, mutate] of [
  [
    'Code name',
    (rs) => {
      rs[1].payload.name = 'different';
    },
  ],
  [
    'literal path',
    (rs) => {
      rs[2].payload.payload.arguments[0].value.value = '/different';
    },
  ],
  [
    'source range',
    (rs) => {
      rs[2].payload.sourceRange.endColumn = 3;
    },
  ],
  [
    'owner',
    (rs) => {
      rs[2].payload.owner = null;
    },
  ],
  [
    'resolution',
    (rs) => {
      rs[2].payload.payload.callee.target = {
        state: 'UNRESOLVED',
        resolution: 'UNRESOLVED',
        originalHint: 'Route',
        candidates: [],
      };
    },
  ],
  [
    'coverage and outcome',
    (rs) => {
      rs[3].payload.status = 'PARTIAL';
      rs[3].payload.limitations = ['UNRESOLVED_OR_UNSUPPORTED_SYNTAX'];
      rs.at(-1).payload.outcome = 'PARTIAL';
    },
  ],
])
  test('valid resealed same-count ' + name + ' drift refuses', () => {
    const rs = rows(cases.python.bytes);
    mutate(rs);
    const actual = encode(rs);
    // Positive control: these are valid streams. Only the independent oracle catches drift.
    assert.doesNotThrow(() => validateSyntaxObservationStream(cases.python.request, lines(actual)));
    assert.throws(
      () => compare(actual),
      (e) => e.code === 'SYNTAX_OUTPUT_MISMATCH',
    );
  });
test('diagnostic payload changes refuse even with correct counts and both checksums', () => {
  const rs = rows(cases.python.bytes);
  rs.splice(-1, 0, {
    protocolVersion: 4,
    requestId: 'syntax:request',
    type: 'DIAGNOSTIC',
    payload: {
      code: 'SYNTAX_ERROR',
      severity: 'WARNING',
      message: 'literal diagnostic',
      sourceRange: null,
    },
  });
  rs.at(-1).payload.counts.diagnostics = 1;
  const oracle = encode(rs);
  rs.at(-2).payload.message = 'different diagnostic';
  const actual = encode(rs);
  assert.doesNotThrow(() => validateSyntaxObservationStream(cases.python.request, lines(actual)));
  assert.throws(
    () => compare(actual, oracle),
    (e) => e.code === 'SYNTAX_OUTPUT_MISMATCH',
  );
});
for (const [name, bytes] of [
  [
    'checksum corruption',
    () => {
      const rs = rows(cases.python.bytes);
      rs.at(-1).payload.checksum = '0'.repeat(64);
      return Buffer.from(rs.map(JSON.stringify).join('\n') + '\n');
    },
  ],
  ['missing LF', () => cases.python.bytes.subarray(0, -1)],
  [
    'truncation',
    () => Buffer.from(rows(cases.python.bytes).slice(0, -1).map(JSON.stringify).join('\n') + '\n'),
  ],
  [
    'unknown event field',
    () => {
      const rs = rows(cases.python.bytes);
      rs[1].secret = 'must-not-echo';
      return encode(rs);
    },
  ],
])
  test('invalid actual ' + name + ' refuses', () => {
    assert.throws(
      () => compare(bytes()),
      (e) => e.code === 'INVALID_SYNTAX_OUTPUT' && !e.message.includes('must-not-echo'),
    );
  });
test('probe-only oracle cannot stand in for a complete valid stream', () => {
  assert.throws(
    () => compare(cases.python.bytes, Buffer.from('{"probes":[{"syntaxKind":"DECORATION"}]}\n')),
    (e) => e.code === 'INVALID_SYNTAX_OUTPUT_ORACLE',
  );
});
test('oracle checksum is validated even when actual bytes are correct', () => {
  const rs = rows(cases.python.bytes);
  rs.at(-1).payload.checksum = '0'.repeat(64);
  assert.throws(
    () => compare(cases.python.bytes, Buffer.from(rs.map(JSON.stringify).join('\n') + '\n')),
    (e) => e.code === 'INVALID_SYNTAX_OUTPUT_ORACLE',
  );
});
test('request byte bound applies to both inputs without guessed defaults', () => {
  const request = structuredClone(cases.python.request);
  request.payload.resourceBudget.maxOutputBytes = cases.python.bytes.length - 1;
  assert.throws(
    () => compare(cases.python.bytes, cases.python.bytes, request),
    (e) => e.code === 'INVALID_SYNTAX_OUTPUT_ORACLE',
  );
  const actual = Buffer.concat([
    cases.python.bytes,
    Buffer.alloc(request.payload.resourceBudget.maxOutputBytes),
  ]);
  assert.throws(
    () => compare(actual),
    (e) => e.code === 'INVALID_SYNTAX_OUTPUT',
  );
});
test('caller objects/accessors are not raw bytes and are never evaluated', () => {
  let reads = 0;
  const value = {
    get length() {
      reads++;
      throw Error('never');
    },
  };
  assert.throws(
    () => compare(value),
    (e) => e.code === 'INVALID_SYNTAX_OUTPUT',
  );
  assert.equal(reads, 0);
});
