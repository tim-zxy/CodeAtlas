import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as api from '../dist/index.js';
import {
  sha,
  line,
  decode,
  json,
  bytes,
  load,
  ownerMap,
  seal,
  rawSeal,
  zeroFacet,
} from './fixtures/code-syntax-contract-helpers.mjs';
function run(x) {
  assert.equal(typeof api.validateCodeSyntaxObservationStream, 'function');
  return api.validateCodeSyntaxObservationStream(x.requestBytes, x.outputBytes);
}
const error = (code) => (e) => {
  assert.ok(e instanceof api.NativeSyntaxContractError);
  assert.equal(e.code, code);
  assert.equal(e.message, 'Native syntax contract: ' + code);
  return true;
};
function frozen(v) {
  if (v !== null && typeof v === 'object') {
    assert.ok(Object.isFrozen(v));
    Object.values(v).forEach(frozen);
  }
}
async function bad(name, change, code = 'PROTOCOL_CORRUPTION', id = 'alias-reference-python') {
  const x = await load(id);
  change(x);
  const y = seal(x.request, x.events);
  assert.throws(() => run(y), error(code), name);
}
test('isolated v5 validator is exported', () =>
  assert.equal(typeof api.validateCodeSyntaxObservationStream, 'function'));
for (const { id } of await json('cases.json')) {
  test('fixture: ' + id + ' independent literal decision and Canonical pairs', async () => {
    const x = await load(id),
      out = run(x),
      expected = (await json('expected/decisions.json'))[id];
    for (const k of Object.keys(expected)) assert.deepEqual(out[k], expected[k], k);
    assert.deepEqual(out.request, x.request);
    assert.deepEqual(out.events, x.events);
    assert.deepEqual(Object.keys(out).sort(), [
      'checksum',
      'codeOutcome',
      'counts',
      'events',
      'outcome',
      'request',
      'requestChecksum',
      'syntaxOutcome',
    ]);
    frozen(out);
    const p = out.request.payload;
    assert.deepEqual(
      api.normalizePythonSourceObservation({
        targetSource: p.targetSource,
        providerId: p.providerId,
        providerSnapshotId: p.providerSnapshotId,
        sourceFiles: p.sourceFiles,
        nodes: out.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
        edges: out.events.filter((e) => e.type === 'EDGE').map((e) => e.payload),
      }),
      (await json('expected/canonical.json'))[id],
    );
  });
}
test('framing: byte snapshots are frozen data without mutating caller views', async () => {
  const x = await load(),
    rb = Buffer.from(x.requestBytes),
    ob = Buffer.from(x.outputBytes),
    out = run(x);
  assert.deepEqual(x.requestBytes, rb);
  assert.deepEqual(x.outputBytes, ob);
  x.requestBytes.fill(32);
  x.outputBytes.fill(32);
  assert.deepEqual(out.request, JSON.parse(rb));
  assert.deepEqual(out.events, decode(ob));
  assert.throws(() => {
    out.events.push({});
  }, TypeError);
});
test('framing: raw whitespace is bound rather than reserialized', async () => {
  const x = await load();
  const requestBytes = Buffer.from(' ' + x.requestBytes);
  assert.throws(() => run({ ...x, requestBytes }), error('PROTOCOL_CORRUPTION'));
  const events = structuredClone(x.events);
  for (const e of [events[0], events.at(-1)]) e.payload.requestChecksum = sha(requestBytes);
  const outputBytes = rawSeal(events.map(line));
  assert.equal(run({ requestBytes, outputBytes }).requestChecksum, sha(requestBytes));
});
for (const version of [1, 2, 3, 4, 6]) {
  test('framing: version ' + version + ' never falls back', async () => {
    const x = await load();
    x.request.protocolVersion = version;
    assert.throws(
      () => run({ requestBytes: Buffer.from(line(x.request)), outputBytes: x.outputBytes }),
      error('INCOMPATIBLE_PROTOCOL_VERSION'),
    );
  });
}
for (const [name, change] of [
  [
    'missing contract',
    (x) => {
      delete x.request.payload.codeContract;
    },
  ],
  [
    'wrong contract',
    (x) => {
      x.request.payload.codeContract = 'OTHER';
    },
  ],
  [
    'authority',
    (x) => {
      x.request.payload.ready = true;
    },
  ],
  [
    'nested authority',
    (x) => {
      x.request.payload.targetSource.publish = true;
    },
  ],
  [
    'foreign repo',
    (x) => {
      x.request.payload.repository.id = 'other';
    },
  ],
  [
    'foreign Source revision',
    (x) => {
      x.request.payload.sourceFiles[0].revisionId = 'other';
    },
  ],
  [
    'duplicate Source',
    (x) => {
      x.request.payload.sourceFiles.push(structuredClone(x.request.payload.sourceFiles[0]));
    },
  ],
  [
    'SECRET',
    (x) => {
      x.request.payload.sourceFiles[0].sensitivity = 'SECRET';
    },
  ],
  [
    'BINARY',
    (x) => {
      x.request.payload.sourceFiles[0].classification.contentKind = 'BINARY';
    },
  ],
  [
    'OTHER role',
    (x) => {
      x.request.payload.sourceFiles[0].classification.role = 'OTHER';
    },
  ],
  [
    'unsupported language',
    (x) => {
      x.request.payload.sourceFiles[0].languageHint = 'ruby';
    },
  ],
  [
    'wrong owner digest',
    (x) => {
      x.request.payload.ownerBinding.ownerMapDigest = '0'.repeat(64);
    },
  ],
  [
    'active without expected basis',
    (x) => {
      x.request.payload.ownerBinding = {
        kind: 'ACTIVE_CODE',
        codeActivationDigest: 'a'.repeat(64),
        ownerMapDigest: '0'.repeat(64),
      };
    },
  ],
  [
    'lone surrogate value',
    (x) => {
      x.request.payload.targetSource.contentFingerprint = '\ud800';
    },
  ],
  [
    'lone surrogate key',
    (x) => {
      x.request.payload['\udfff'] = true;
    },
  ],
]) {
  test('framing: invalid request ' + name, async () => {
    const x = await load();
    change(x);
    if (
      [
        'foreign Source revision',
        'duplicate Source',
        'SECRET',
        'BINARY',
        'OTHER role',
        'unsupported language',
      ].includes(name)
    )
      ownerMap(x.request);
    assert.throws(() => run(seal(x.request, x.events)), error('INVALID_REQUEST'));
  });
}
test('framing: genuine Uint8Array views and safe intrinsic access', async () => {
  const x = await load();
  let seen = 0;
  Object.defineProperty(x.requestBytes, 'byteLength', {
    get() {
      seen++;
      throw Error('raw-sentinel');
    },
  });
  const out = run(x);
  assert.equal(seen, 0);
  assert.equal(out.outcome, 'SUCCEEDED');
  const padded = new Uint8Array(x.outputBytes.length + 4);
  padded.set(x.outputBytes, 2);
  assert.equal(run({ ...x, outputBytes: padded.subarray(2, -2) }).outcome, 'SUCCEEDED');
});
for (const kind of ['proxy', 'object', 'subclass', 'shared']) {
  test('framing: unsafe byte input ' + kind + ' invokes no user code', async () => {
    const x = await load();
    let seen = 0;
    const trap = () => {
      seen++;
      throw Error('raw-sentinel');
    };
    let badBytes;
    if (kind === 'proxy')
      badBytes = new Proxy(x.requestBytes, { get: trap, getPrototypeOf: trap, ownKeys: trap });
    if (kind === 'object')
      badBytes = {
        get byteLength() {
          return trap();
        },
        valueOf: trap,
      };
    if (kind === 'subclass') {
      class Custom extends Uint8Array {}
      badBytes = new Custom(x.requestBytes);
    }
    if (kind === 'shared') {
      badBytes = new Uint8Array(new SharedArrayBuffer(x.requestBytes.length));
      badBytes.set(x.requestBytes);
    }
    assert.throws(() => run({ ...x, requestBytes: badBytes }), error('INVALID_REQUEST'));
    assert.equal(seen, 0);
  });
}
for (const [name, change] of [
  ['no LF', (b) => b.subarray(0, -1)],
  ['CRLF', (b) => Buffer.from(b.toString().replaceAll('\n', '\r\n'))],
  ['BOM', (b) => Buffer.concat([Buffer.from([239, 187, 191]), b])],
  ['invalid UTF8', (b) => Buffer.concat([Buffer.from([255]), b])],
  ['extra line', (b) => Buffer.concat([b, Buffer.from('\n')])],
  ['truncated', (b) => b.subarray(0, 20)],
]) {
  test('framing: request ' + name, async () => {
    const x = await load();
    assert.throws(
      () => run({ ...x, requestBytes: change(x.requestBytes) }),
      error('INVALID_REQUEST'),
    );
  });
  test('framing: output ' + name, async () => {
    const x = await load();
    assert.throws(
      () => run({ ...x, outputBytes: change(x.outputBytes) }),
      error('PROTOCOL_CORRUPTION'),
    );
  });
}
for (const [name, change] of [
  [
    'unknown version',
    (e) => {
      e[1].protocolVersion = 4;
    },
  ],
  [
    'foreign request',
    (e) => {
      e[1].requestId = 'other';
    },
  ],
  [
    'sequence',
    (e) => {
      e[1].sequence = 999;
    },
  ],
  [
    'extra key',
    (e) => {
      e[1].publish = true;
    },
  ],
  [
    'bad binding',
    (e) => {
      e[0].payload.targetSource.contentFingerprint = 'other';
    },
  ],
  [
    'wrong counts',
    (e) => {
      e.at(-1).payload.counts.codeCoverage++;
    },
  ],
  [
    'wrong checksum',
    (e) => {
      e.at(-1).payload.checksum = '0'.repeat(64);
    },
  ],
  [
    'surrogate',
    (e) => {
      e[1].payload.confidence.reasons = ['\ud800'];
    },
  ],
  [
    'surrogate key',
    (e) => {
      e[1].payload['\udfff'] = true;
    },
  ],
  [
    'no terminal',
    (e) => {
      e.pop();
    },
  ],
  [
    'double terminal',
    (e) => {
      e.push(structuredClone(e.at(-1)));
    },
  ],
]) {
  test('framing: output corruption ' + name, async () => {
    const x = await load();
    change(x.events);
    assert.throws(
      () => run({ ...x, outputBytes: Buffer.from(x.events.map(line).join('')) }),
      error('PROTOCOL_CORRUPTION'),
    );
  });
}
test('framing: valid astral strings retain exact raw binding', async () => {
  const x = await load();
  x.request.payload.targetSource.contentFingerprint = 'source:\u{1f680}';
  ownerMap(x.request);
  x.events[1].payload.confidence.reasons = ['observed:\u{1f680}'];
  assert.equal(run(seal(x.request, x.events)).outcome, 'SUCCEEDED');
});
for (const [name, field, component] of [
  ['events', 'maxEvents', 'events'],
  ['output bytes', 'maxOutputBytes', 'output'],
  ['request bytes', 'maxInputBytes', 'request'],
]) {
  test('framing: exact ' + name + ' boundary is enforced', async () => {
    const x = await load();
    const count = x.events.length;
    let current = seal(x.request, x.events);
    // Raw lengths bind the request; iterate metadata length to a fixed point,not a product gate.
    for (let i = 0; i < 8; i++) {
      const size =
        component === 'events'
          ? count
          : component === 'output'
            ? current.outputBytes.length
            : current.requestBytes.length;
      x.request.payload.resourceBudget[field] = size;
      current = seal(x.request, x.events);
    }
    const size =
      component === 'events'
        ? count
        : component === 'output'
          ? current.outputBytes.length
          : current.requestBytes.length;
    assert.equal(x.request.payload.resourceBudget[field], size);
    assert.equal(run(current).outcome, 'SUCCEEDED');
    x.request.payload.resourceBudget[field]--;
    assert.throws(() => run(seal(x.request, x.events)), error('RESOURCE_LIMIT_EXCEEDED'));
    x.request.payload.resourceBudget[field] += 2;
    assert.equal(run(seal(x.request, x.events)).outcome, 'SUCCEEDED');
  });
}
test('framing: observable hard line/request/output/event caps', async () => {
  const x = await load(),
    h = api.NATIVE_CLIENT_HARD_LIMITS;
  assert.throws(
    () => run({ ...x, requestBytes: Buffer.alloc(h.maxStdinBytes + 1, 32) }),
    error('RESOURCE_LIMIT_EXCEEDED'),
  );
  assert.throws(
    () => run({ ...x, outputBytes: Buffer.alloc(h.maxStdoutBytes + 1, 32) }),
    error('RESOURCE_LIMIT_EXCEEDED'),
  );
  const raw = Buffer.concat([Buffer.alloc(h.maxLineBytes + 1, 32), Buffer.from('\n')]);
  assert.throws(() => run({ ...x, outputBytes: raw }), error('RESOURCE_LIMIT_EXCEEDED'));
});
for (const code of ['CANCELLED', 'SOURCE_CHANGED', 'RESOURCE_LIMIT_EXCEEDED']) {
  test('framing: failure terminal is refusal ' + code, async () => {
    const x = await load();
    for (const start of [false, true]) {
      const ev = start ? [x.events[0]] : [];
      ev.push({
        protocolVersion: 5,
        requestId: x.request.requestId,
        sequence: ev.length,
        type: start ? 'OBSERVATION_FAILED' : 'REQUEST_FAILED',
        payload: { code, message: 'raw-sentinel', retryable: false },
      });
      assert.throws(
        () => run({ ...x, outputBytes: Buffer.from(ev.map(line).join('')) }),
        error(code),
      );
    }
  });
}
for (const [name, change] of [
  [
    'missing facet',
    (x) => {
      x.events.splice(
        x.events.findIndex((e) => e.type === 'CODE_COVERAGE'),
        1,
      );
    },
  ],
  [
    'duplicate facet',
    (x) => {
      const i = x.events.findIndex((e) => e.type === 'CODE_COVERAGE');
      x.events.splice(i, 0, structuredClone(x.events[i]));
    },
  ],
  [
    'foreign facet file',
    (x) => {
      x.events.find((e) => e.type === 'CODE_COVERAGE').payload.sourceFileId = 'other';
    },
  ],
  [
    'foreign fingerprint',
    (x) => {
      x.events.find((e) => e.type === 'CODE_COVERAGE').payload.sourceFingerprint = 'other';
    },
  ],
  [
    'foreign fact snapshot',
    (x) => {
      x.events[1].payload.providerSnapshotId = 'other';
    },
  ],
  [
    'foreign fact repo',
    (x) => {
      x.events[1].payload.repositoryId = 'other';
    },
  ],
  [
    'extra edge',
    (x) => {
      const i = x.events.findIndex((e) => e.type === 'EDGE');
      const e = structuredClone(x.events[i]);
      e.payload.providerFactId = 'other';
      x.events.splice(i, 0, e);
    },
  ],
  [
    'unbalanced statistics',
    (x) => {
      x.events.find((e) => e.type === 'CODE_COVERAGE').payload.statistics.eligibleSites++;
    },
  ],
  [
    'declaration resolution',
    (x) => {
      x.events.find((e) => e.type === 'CODE_COVERAGE').payload.statistics.resolutionCounts.EXACT++;
    },
  ],
  [
    'wrong edge resolution',
    (x) => {
      x.events.find(
        (e) => e.type === 'CODE_COVERAGE' && e.payload.facet === 'IMPORT',
      ).payload.statistics.resolutionCounts.UNRESOLVED = 0;
    },
  ],
  [
    'complete with unsupported',
    (x) => {
      const c = x.events.find((e) => e.type === 'CODE_COVERAGE').payload;
      c.statistics.unsupportedSites++;
      c.statistics.eligibleSites++;
    },
  ],
  [
    'missing syntax coverage',
    (x) => {
      x.events = x.events.filter((e) => e.type !== 'SYNTAX_COVERAGE');
    },
  ],
  [
    'complete with limitations',
    (x) => {
      x.events.find((e) => e.type === 'CODE_COVERAGE').payload.limitations = ['UNKNOWN'];
    },
  ],
  [
    'Code outcome lies',
    (x) => {
      x.events.at(-1).payload.codeOutcome = 'NOT_APPLICABLE';
    },
  ],
  [
    'Syntax outcome lies',
    (x) => {
      x.events.at(-1).payload.syntaxOutcome = 'PARTIAL';
    },
  ],
  [
    'wrong event phase',
    (x) => {
      const i = x.events.findIndex((e) => e.type === 'CODE_COVERAGE');
      [x.events[1], x.events[i]] = [x.events[i], x.events[1]];
    },
  ],
  [
    'unmatched reference',
    (x) => {
      x.events.find(
        (e) => e.type === 'SYNTAX_OBSERVATION' && e.payload.payload.targetName === 'x',
      ).payload.payload.value.name = 'other';
    },
  ],
]) {
  test('correspondence: ' + name + ' fails despite repaired checksum', () => bad(name, change));
}
test('correspondence: negative zero is not normalized away', async () => {
  const x = await load(),
    lines = x.outputBytes.toString().match(/[^\n]*\n/g);
  const i = lines.findIndex((l) => l.includes('"CODE_COVERAGE"'));
  lines[i] = lines[i].replace('"partialSites":0', '"partialSites":-0');
  assert.throws(() => run({ ...x, outputBytes: rawSeal(lines) }), error('PROTOCOL_CORRUPTION'));
});
test('correspondence: function declaration encloses distinct name range', async () => {
  const x = await load('async-python'),
    out = run(x);
  const n = out.events.find(
    (e) => e.type === 'NODE' && e.payload.providerKind === 'python.symbol',
  ).payload;
  const s = out.events.find((e) => e.type === 'SYNTAX_OBSERVATION').payload;
  assert.notDeepEqual(n.sourceRange, s.sourceRange);
  await bad(
    'missing owner',
    (y) => {
      y.events.find((e) => e.type === 'SYNTAX_OBSERVATION').payload.owner = null;
    },
    'PROTOCOL_CORRUPTION',
    'async-python',
  );
  await bad(
    'wrong span',
    (y) => {
      y.events.find((e) => e.type === 'SYNTAX_OBSERVATION').payload.sourceRange = {
        ...n.sourceRange,
        startColumn: 11,
        endColumn: 12,
      };
    },
    'PROTOCOL_CORRUPTION',
    'async-python',
  );
});
test('correspondence: zero facts do not prove a Python module', () =>
  bad(
    'missing module',
    (x) => {
      x.events = x.events.filter((e) => e.type !== 'NODE');
      zeroFacet(x.events, 'MODULE');
    },
    'PROTOCOL_CORRUPTION',
    'empty-python',
  ));
test('correspondence: Code partial and Syntax complete remain partial', async () => {
  const x = await load();
  const c = x.events.find(
    (e) => e.type === 'CODE_COVERAGE' && e.payload.facet === 'FUNCTION',
  ).payload;
  c.status = 'PARTIAL';
  c.limitations = ['UNSUPPORTED_CLASS_SCOPE'];
  Object.assign(x.events.at(-1).payload, { codeOutcome: 'PARTIAL', outcome: 'PARTIAL' });
  assert.equal(run(seal(x.request, x.events)).outcome, 'PARTIAL');
  x.events.at(-1).payload.outcome = 'SUCCEEDED';
  assert.throws(() => run(seal(x.request, x.events)), error('PROTOCOL_CORRUPTION'));
});
test('correspondence: Java has no implicit Code proof and companion is independent', async () => {
  const x = await load('java-only'),
    out = run(x);
  assert.equal(out.codeOutcome, 'NOT_APPLICABLE');
  assert.equal(out.counts.nodes, 0);
  const request = JSON.parse(await bytes('requests/java-code-v2.jsonl')),
    events = decode(await bytes('observations/java-code-v2.jsonl'));
  assert.equal(api.NativeAnalyzeEventStreamV2Schema.safeParse({ request, events }).success, true);
  const c = api.normalizeNativeAnalysis({ request, events, terminal: events.at(-1), stderr: '' });
  assert.deepEqual(
    { nodePairs: c.nodes, edgePairs: c.edges },
    (await json('expected/canonical.json')).javaCodeV2,
  );
  const changed = structuredClone(events);
  changed.splice(
    changed.findIndex((e) => e.type === 'NODE'),
    1,
  );
  assert.notDeepEqual(changed, events);
  assert.equal(run(x).outcome, 'SUCCEEDED'); // v5 does not see or authenticate this companion.
});
for (const facet of ['FUNCTION', 'IMPORT', 'REFERENCE']) {
  test(
    'correspondence: resealed omitted ' + facet + ' still fails independent raw oracle',
    async () => {
      const x = await load(facet === 'FUNCTION' ? 'async-python' : 'alias-reference-python');
      const raw = x.outputBytes;
      if (facet === 'FUNCTION')
        x.events = x.events.filter(
          (e) =>
            !(e.type === 'NODE' && e.payload.providerKind === 'python.symbol') &&
            !(e.type === 'SYNTAX_OBSERVATION' && e.payload.syntaxKind === 'DECLARATION'),
        );
      else {
        x.events = x.events.filter(
          (e) =>
            !(
              e.type === 'EDGE' &&
              e.payload.providerKind === (facet === 'IMPORT' ? 'python.import' : 'python.reference')
            ) &&
            !(
              e.type === 'SYNTAX_OBSERVATION' &&
              e.payload.payload.targetName === (facet === 'IMPORT' ? 'p' : 'x')
            ),
        );
      }
      zeroFacet(x.events, facet);
      const y = seal(x.request, x.events);
      assert.equal(run(y).outcome, 'SUCCEEDED');
      assert.notDeepEqual(y.outputBytes, raw); // Independent complete-output oracle still rejects the omission.
    },
  );
}
test('correspondence: omitted function with retained declaration refuses', () =>
  bad(
    'left declaration',
    (x) => {
      x.events = x.events.filter(
        (e) => !(e.type === 'NODE' && e.payload.providerKind === 'python.symbol'),
      );
    },
    'PROTOCOL_CORRUPTION',
    'async-python',
  ));
test('correspondence: removed and budget changes bind beyond old owner map', async () => {
  for (const change of [
    (r) => {
      r.payload.removedSourceFiles = [
        { id: 'removed', path: 'removed.py', previousContentFingerprint: 'old' },
      ];
    },
    (r) => {
      r.payload.resourceBudget.maxItems++;
    },
  ]) {
    const x = await load(),
      digest = x.request.payload.ownerBinding.ownerMapDigest;
    change(x.request);
    assert.equal(x.request.payload.ownerBinding.ownerMapDigest, digest);
    const rb = Buffer.from(line(x.request));
    assert.throws(() => run({ ...x, requestBytes: rb }), error('PROTOCOL_CORRUPTION'));
    const y = seal(x.request, x.events);
    assert.equal(run(y).outcome, 'SUCCEEDED');
    assert.notEqual(sha(rb), sha(x.requestBytes));
  }
});
test('correspondence: nested reference arrays preserve occurrence multiplicity', async () => {
  const x = await load();
  const s = x.events.find(
    (e) => e.type === 'SYNTAX_OBSERVATION' && e.payload.payload.targetName === 'x',
  ).payload;
  const value = structuredClone(s.payload.value);
  s.payload.value = { kind: 'ARRAY', items: [value, structuredClone(value)] };
  const edge = structuredClone(
    x.events.find((e) => e.type === 'EDGE' && e.payload.providerKind === 'python.reference'),
  );
  edge.payload.providerFactId = 'reference:second';
  edge.payload.sourceRange = { ...edge.payload.sourceRange, startColumn: 0, endColumn: 1 };
  const i = x.events.findIndex(
    (e) => e.type === 'EDGE' && e.payload.providerKind === 'python.reference',
  );
  x.events.splice(i, 0, edge);
  const stat = x.events.find((e) => e.type === 'CODE_COVERAGE' && e.payload.facet === 'REFERENCE')
    .payload.statistics;
  stat.eligibleSites = 2;
  stat.coveredSites = 2;
  stat.resolutionCounts.UNRESOLVED = 2;
  assert.equal(run(seal(x.request, x.events)).outcome, 'SUCCEEDED');
  x.events.splice(i, 1);
  stat.eligibleSites = 1;
  stat.coveredSites = 1;
  stat.resolutionCounts.UNRESOLVED = 1;
  assert.throws(() => run(seal(x.request, x.events)), error('PROTOCOL_CORRUPTION'));
});

test('registration: new contract test appears exactly once next to legacy Syntax', async () => {
  const pkg = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
  const token = 'packages/providers/test/native-code-syntax-ipc.test.mjs';
  assert.equal(pkg.scripts.test.split(token).length - 1, 1);
  assert.ok(
    pkg.scripts.test.includes('packages/providers/test/native-syntax-ipc.test.mjs ' + token),
  );
});
const depth = (v) =>
  v !== null && typeof v === 'object' ? 1 + Math.max(-1, ...Object.values(v).map(depth)) : 0;
test('budget: exact maximum observed JSON depth and one below', async () => {
  const x = await load();
  const required = Math.max(depth(x.request), ...x.events.map(depth));
  x.request.payload.resourceBudget.maxDepth = required;
  assert.equal(run(seal(x.request, x.events)).outcome, 'SUCCEEDED');
  x.request.payload.resourceBudget.maxDepth = required - 1;
  assert.throws(() => run(seal(x.request, x.events)), error('RESOURCE_LIMIT_EXCEEDED'));
  x.request.payload.resourceBudget.maxDepth = required + 1;
  assert.equal(run(seal(x.request, x.events)).outcome, 'SUCCEEDED');
});
for (const field of ['maxItems', 'maxDurationMs', 'maxMemoryBytes']) {
  test('budget: ' + field + ' shape and binding do not claim Native measurement', async () => {
    const x = await load();
    x.request.payload.resourceBudget[field] = 1;
    assert.equal(run(seal(x.request, x.events)).outcome, 'SUCCEEDED');
    x.request.payload.resourceBudget[field] = 0;
    assert.throws(() => run(seal(x.request, x.events)), error('INVALID_REQUEST'));
  });
}
const diagnostic = (sourceRange) => ({
  type: 'DIAGNOSTIC',
  payload: { code: 'CONTRACT_ONLY', severity: 'WARNING', message: 'offline', sourceRange },
});
test('ordering: file and global diagnostics remain in their declared positions', async () => {
  const x = await load();
  const span = x.events.find((e) => e.type === 'NODE').payload.sourceRange;
  x.events.splice(-1, 0, diagnostic(span), diagnostic(null));
  assert.equal(run(seal(x.request, x.events)).counts.diagnostics, 2);
  const moved = structuredClone(x.events);
  const global = moved.splice(-2, 1)[0];
  moved.splice(1, 0, global);
  assert.throws(() => run(seal(x.request, moved)), error('PROTOCOL_CORRUPTION'));
  x.events.at(-3).payload.sourceRange.sourceFileId = 'foreign';
  assert.throws(() => run(seal(x.request, x.events)), error('PROTOCOL_CORRUPTION'));
});
test('ordering: mixed files follow UTF8 path order and coverage facet order', async () => {
  const x = await load('mixed');
  const java = x.events.filter(
    (e) =>
      ['SYNTAX_OBSERVATION', 'SYNTAX_COVERAGE'].includes(e.type) &&
      e.payload.sourceFileId === 'java:file',
  );
  const rest = x.events.filter((e) => !java.includes(e));
  rest.splice(-1, 0, ...java);
  assert.throws(() => run(seal(x.request, rest)), error('PROTOCOL_CORRUPTION'));
  const cs = x.events.map((e, i) => (e.type === 'CODE_COVERAGE' ? i : -1)).filter((i) => i >= 0);
  [x.events[cs[0]], x.events[cs[1]]] = [x.events[cs[1]], x.events[cs[0]]];
  assert.throws(() => run(seal(x.request, x.events)), error('PROTOCOL_CORRUPTION'));
});
test('correspondence: nested object references and duplicate keys are distinct controls', async () => {
  const x = await load();
  const s = x.events.find(
    (e) => e.type === 'SYNTAX_OBSERVATION' && e.payload.payload.targetName === 'x',
  ).payload;
  s.payload.value = { kind: 'OBJECT', entries: [{ name: 'key', value: s.payload.value }] };
  assert.equal(run(seal(x.request, x.events)).outcome, 'SUCCEEDED');
  s.payload.value.entries.push({ name: 'key', value: { kind: 'NULL' } });
  assert.throws(() => run(seal(x.request, x.events)), error('PROTOCOL_CORRUPTION'));
});
