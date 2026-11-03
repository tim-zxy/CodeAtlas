import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as api from '../dist/index.js';

const root = new URL('../../../fixtures/phase1/python-source-normalization/', import.meta.url);
const input = JSON.parse(await readFile(new URL('inputs/observation.json', root), 'utf8'));
const expected = JSON.parse(await readFile(new URL('expected/normalized.json', root), 'utf8'));
const fresh = () => structuredClone(input);
function run(value = fresh()) {
  assert.equal(typeof api.normalizePythonSourceObservation, 'function');
  return api.normalizePythonSourceObservation(value);
}
function legacy(value) {
  const { targetSource, ...rest } = value;
  return api.normalizePythonObservation({
    ...rest,
    basis: { ...targetSource, codeActivationDigest: 'a'.repeat(64) },
  });
}
function errorCode(code, path = [], message = 'Invalid Python observation') {
  return (error) => {
    assert.ok(error instanceof api.CanonicalNormalizationError);
    assert.equal(error.code, code);
    assert.deepEqual(error.path, path);
    assert.equal(error.message, message);
    return true;
  };
}
function frozen(value) {
  if (value !== null && typeof value === 'object') {
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) frozen(child);
  }
}
test('Source-target API is exported', () => {
  assert.equal(typeof api.normalizePythonSourceObservation, 'function');
});
test('Source-target matches independent golden and legacy', () => {
  assert.deepEqual(run(), expected);
  assert.deepEqual(legacy(fresh()), expected);
  assert.equal(api.PYTHON_NORMALIZER_VERSION, '1');
  assert.deepEqual(Object.keys(run()).sort(), ['edgePairs', 'nodePairs']);
});
test('Source declaration is not authentication', () => {
  const x = fresh();
  assert.notEqual(x.targetSource.contentFingerprint, x.sourceFiles[0].contentFingerprint);
  x.targetSource.contentFingerprint = 'another:unverified-source';
  assert.deepEqual(run(x), expected);
});
test('empty observations confer no authority', () => {
  const x = fresh();
  x.nodes = [];
  x.edges = [];
  const out = run(x);
  assert.deepEqual(out, { nodePairs: [], edgePairs: [] });
  frozen(out);
  for (const key of ['outcome', 'ready', 'publish']) assert.equal(Object.hasOwn(out, key), false);
});
for (const key of Object.keys(input)) {
  test('strict shape rejects missing ' + key, () => {
    const x = fresh();
    delete x[key];
    assert.throws(() => run(x), errorCode('INVALID_FACT'));
  });
}
for (const key of [
  'basis',
  'codeActivationDigest',
  'expectedActivationBasis',
  'ownerBinding',
  'capturedHandle',
  'publish',
  'ready',
]) {
  test('strict shape rejects authority ' + key, () => {
    const x = fresh();
    x[key] = key === 'basis' ? { ...x.targetSource, codeActivationDigest: 'a'.repeat(64) } : true;
    assert.throws(() => run(x), errorCode('INVALID_FACT'));
  });
}
for (const [name, change] of [
  [
    'null target',
    (x) => {
      x.targetSource = null;
    },
  ],
  [
    'nested digest',
    (x) => {
      x.targetSource.codeActivationDigest = 'a'.repeat(64);
    },
  ],
  [
    'nested unknown',
    (x) => {
      x.sourceFiles[0].ready = true;
    },
  ],
  [
    'nested fact unknown',
    (x) => {
      x.nodes[0].publish = true;
    },
  ],
  [
    'empty fingerprint',
    (x) => {
      x.targetSource.contentFingerprint = '';
    },
  ],
]) {
  test('strict shape rejects ' + name, () => {
    const x = fresh();
    change(x);
    assert.throws(() => run(x), errorCode('INVALID_FACT'));
  });
}
test('strict shape rejects null observation', () => {
  assert.throws(() => run(null), errorCode('INVALID_FACT'));
});
test('plain-data getter rejection avoids user code', () => {
  const x = fresh();
  let seen = false;
  Object.defineProperty(x, 'nodes', {
    enumerable: true,
    get() {
      seen = true;
      throw Error('raw-sentinel');
    },
  });
  assert.throws(() => run(x), errorCode('INVALID_FACT'));
  assert.equal(seen, false);
});
test('plain-data Proxy rejection avoids traps', () => {
  let traps = 0;
  const handler = {
    get() {
      traps++;
      throw Error('raw-sentinel');
    },
    ownKeys() {
      traps++;
      throw Error('raw-sentinel');
    },
    getPrototypeOf() {
      traps++;
      throw Error('raw-sentinel');
    },
    getOwnPropertyDescriptor() {
      traps++;
      throw Error('raw-sentinel');
    },
  };
  assert.throws(() => run(new Proxy(fresh(), handler)), errorCode('INVALID_FACT'));
  const x = fresh();
  x.nodes[0] = new Proxy(x.nodes[0], handler);
  assert.throws(() => run(x), errorCode('INVALID_FACT'));
  assert.equal(traps, 0);
});
for (const [name, change] of [
  [
    'sparse array',
    (x) => {
      delete x.nodes[0];
    },
  ],
  [
    'symbol key',
    (x) => {
      x[Symbol('key')] = true;
    },
  ],
  [
    'cycle',
    (x) => {
      x.nodes.push(x);
    },
  ],
  [
    'undefined',
    (x) => {
      x.providerId = undefined;
    },
  ],
  [
    'exotic prototype',
    (x) => {
      Object.setPrototypeOf(x, Date.prototype);
    },
  ],
]) {
  test('plain-data refuses ' + name, () => {
    const x = fresh();
    change(x);
    assert.throws(() => run(x), errorCode('INVALID_FACT'));
  });
}
for (const surrogate of ['\ud800', '\udfff']) {
  for (const [name, change] of [
    [
      'fingerprint',
      (x) => {
        x.targetSource.contentFingerprint = surrogate;
      },
    ],
    [
      'snapshot',
      (x) => {
        x.providerSnapshotId = surrogate;
      },
    ],
    [
      'reason',
      (x) => {
        x.nodes[0].confidence.reasons.push(surrogate);
      },
    ],
    [
      'key',
      (x) => {
        x[surrogate] = true;
      },
    ],
  ]) {
    test('new Unicode guard refuses ' + name + ' ' + surrogate.charCodeAt(0), () => {
      const x = fresh();
      change(x);
      assert.throws(() => run(x), errorCode('INVALID_FACT'));
    });
  }
}
test('new Unicode guard preserves legacy opaque fingerprint acceptance', () => {
  for (const surrogate of ['\ud800', '\udfff']) {
    const x = fresh();
    x.targetSource.contentFingerprint = surrogate;
    assert.deepEqual(legacy(x), expected);
    assert.throws(() => run(x), errorCode('INVALID_FACT'));
  }
});
test('legal astral fingerprint and reason preserve golden facts', () => {
  const x = fresh();
  x.targetSource.contentFingerprint = 'source:\u{1f680}';
  x.nodes[0].confidence.reasons = ['observed:\u{1f680}'];
  const out = run(x);
  assert.deepEqual(out, legacy(x));
  const golden = structuredClone(expected);
  golden.nodePairs.find(
    (p) => p.provider.providerFactId === x.nodes[0].providerFactId,
  ).canonical.confidence.reasons = ['observed:\u{1f680}'];
  assert.deepEqual(out, golden);
});
for (const [name, change, code] of [
  ['duplicate nodes', (x) => x.nodes.push(structuredClone(x.nodes[0])), 'INVALID_FACT'],
  ['duplicate edges', (x) => x.edges.push(structuredClone(x.edges[0])), 'INVALID_FACT'],
  [
    'foreign revision',
    (x) => {
      x.nodes[0].revisionId = 'other';
    },
    'INVALID_CONTEXT',
  ],
  [
    'foreign snapshot',
    (x) => {
      x.edges[0].providerSnapshotId = 'other';
    },
    'INVALID_CONTEXT',
  ],
  [
    'foreign provider',
    (x) => {
      x.nodes[0].providerId = 'other';
    },
    'INVALID_CONTEXT',
  ],
  [
    'missing source',
    (x) => {
      x.sourceFiles = [];
    },
    'MISSING_REFERENCE',
  ],
  [
    'non Python source',
    (x) => {
      x.sourceFiles[0].languageHint = 'java';
    },
    'INVALID_CONTEXT',
  ],
  [
    'unknown source role',
    (x) => {
      x.sourceFiles[0].classification.role = 'OTHER';
    },
    'INVALID_CONTEXT',
  ],
  [
    'duplicate source ID',
    (x) => x.sourceFiles.push(structuredClone(x.sourceFiles[0])),
    'INVALID_FACT',
  ],
  [
    'unsupported class',
    (x) => {
      x.nodes[1].providerKind = 'python.class';
    },
    'UNSUPPORTED_KIND',
  ],
  [
    'unsupported call',
    (x) => {
      x.edges[1].providerKind = 'python.call';
    },
    'UNSUPPORTED_KIND',
  ],
  [
    'unqualified module',
    (x) => {
      x.nodes[0].qualifiedName = 'module';
    },
    'INVALID_FACT',
  ],
  [
    'unqualified function',
    (x) => {
      x.nodes[1].qualifiedName = 'endpoint';
    },
    'INVALID_FACT',
  ],
  [
    'missing span',
    (x) => {
      x.nodes[1].sourceRange = null;
    },
    'INVALID_FACT',
  ],
  [
    'dangling source',
    (x) => {
      x.edges[0].source.providerFactId = 'missing';
    },
    'MISSING_REFERENCE',
  ],
  [
    'dangling target',
    (x) => {
      x.edges[1].target.target.providerFactId = 'missing';
    },
    'MISSING_REFERENCE',
  ],
  [
    'foreign target Provider',
    (x) => {
      x.edges[1].target.target.providerId = 'other';
    },
    'INVALID_FACT',
  ],
  [
    'foreign Source repo',
    (x) => {
      x.sourceFiles[0].repositoryId = 'other';
    },
    'INVALID_CONTEXT',
  ],
  [
    'foreign node repo',
    (x) => {
      x.nodes[0].repositoryId = 'other';
    },
    'INVALID_CONTEXT',
  ],
  [
    'foreign edge repo',
    (x) => {
      x.edges[0].repositoryId = 'other';
    },
    'INVALID_CONTEXT',
  ],
  [
    'Source revision mismatch',
    (x) => {
      x.sourceFiles[0].revisionId = 'other';
    },
    'INVALID_CONTEXT',
  ],
  [
    'duplicate path distinct ID',
    (x) => x.sourceFiles.push({ ...x.sourceFiles[0], id: 'another' }),
    'INVALID_FACT',
  ],
  [
    'binary Source',
    (x) => {
      x.sourceFiles[0].classification.contentKind = 'BINARY';
    },
    'INVALID_CONTEXT',
  ],
  [
    'invalid range',
    (x) => {
      x.nodes[1].sourceRange.startLine = -1;
    },
    'INVALID_FACT',
  ],
]) {
  test('context/reference errors match legacy: ' + name, () => {
    const x = fresh();
    change(x);
    const path =
      name === 'dangling source'
        ? ['source']
        : name === 'dangling target'
          ? ['target', 'target']
          : [];
    const message = path.length
      ? 'Referenced Provider node is absent'
      : 'Invalid Python observation';
    assert.throws(() => legacy(x), errorCode(code, path, message));
    assert.throws(() => run(x), errorCode(code, path, message));
  });
}
test('identities ignore Provider names and order', () => {
  const x = fresh();
  x.sourceFiles.reverse();
  x.nodes.reverse();
  x.edges.reverse();
  assert.deepEqual(run(x), expected);
  x.providerId = 'other';
  for (const node of x.nodes) {
    node.providerId = 'other';
    node.providerFactId = 'renamed:' + node.providerFactId;
  }
  for (const edge of x.edges) {
    edge.providerId = 'other';
    edge.providerFactId = 'renamed:' + edge.providerFactId;
    edge.source.providerId = 'other';
    edge.source.providerFactId = 'renamed:' + edge.source.providerFactId;
    if (edge.target.state === 'RESOLVED') {
      edge.target.target.providerId = 'other';
      edge.target.target.providerFactId = 'renamed:' + edge.target.target.providerFactId;
    }
  }
  const out = run(x);
  for (const key of ['nodePairs', 'edgePairs']) {
    assert.deepEqual(
      out[key].map((p) => p.canonical),
      expected[key].map((p) => p.canonical),
    );
    assert.ok(
      out[key].every(
        (p) =>
          p.provider.providerId === 'other' && p.provider.providerFactId.startsWith('renamed:'),
      ),
    );
  }
  assert.deepEqual(out, legacy(x));
});
test('deep freeze without input mutation', () => {
  const x = fresh(),
    before = structuredClone(x),
    out = run(x);
  assert.deepEqual(x, before);
  assert.equal(Object.isFrozen(x), false);
  assert.equal(Object.isFrozen(x.nodes[0].confidence), false);
  frozen(out);
  assert.throws(() => {
    out.nodePairs[0].canonical.name = 'mutated';
  }, TypeError);
  assert.throws(() => {
    out.edgePairs.push({});
  }, TypeError);
  assert.deepEqual(run(x), expected);
});
function atLimit() {
  const x = fresh();
  const file = x.sourceFiles[0],
    module = x.nodes[0];
  x.sourceFiles = [];
  x.nodes = [];
  x.edges = [];
  for (let i = 0; i < api.NATIVE_CLIENT_HARD_LIMITS.maxEvents; i++) {
    const id = 'boundary:file:' + i,
      path = 'boundary/' + i + '.py';
    x.sourceFiles.push({ ...file, id, path });
    x.nodes.push({
      ...module,
      providerFactId: 'boundary:module:' + i,
      name: path,
      qualifiedName: path,
      sourceRange: { ...module.sourceRange, sourceFileId: id },
    });
  }
  return x;
}
test('hard limits remain exact for legal modules', () => {
  const x = atLimit();
  const out = run(x);
  assert.equal(out.nodePairs.length, api.NATIVE_CLIENT_HARD_LIMITS.maxEvents);
  assert.deepEqual(out, legacy(x));
  const node = structuredClone(input.nodes[1]);
  node.providerFactId = 'boundary:extra';
  node.sourceRange.sourceFileId = x.sourceFiles[0].id;
  node.qualifiedName = x.sourceFiles[0].path + '::' + node.name;
  x.nodes.push(node);
  assert.throws(() => legacy(x), errorCode('INVALID_FACT'));
  assert.throws(() => run(x), errorCode('INVALID_FACT'));
  x.nodes.pop();
  const edge = structuredClone(input.edges[0]);
  edge.providerFactId = 'boundary:edge';
  edge.source.providerFactId = x.nodes[0].providerFactId;
  edge.sourceRange.sourceFileId = x.sourceFiles[0].id;
  x.edges.push(edge);
  assert.throws(() => legacy(x), errorCode('INVALID_FACT'));
  assert.throws(() => run(x), errorCode('INVALID_FACT'));
});
test('hard source-file limit remains exact for empty observation', () => {
  const x = atLimit();
  x.nodes = [];
  assert.deepEqual(run(x), { nodePairs: [], edgePairs: [] });
  assert.deepEqual(legacy(x), { nodePairs: [], edgePairs: [] });
  x.sourceFiles.push({ ...x.sourceFiles[0], id: 'extra', path: 'extra.py' });
  assert.throws(() => legacy(x), errorCode('INVALID_FACT'));
  assert.throws(() => run(x), errorCode('INVALID_FACT'));
});

test('new test is registered once', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../../../package.json', import.meta.url), 'utf8'),
  );
  const tokens = manifest.scripts.test.split(/\s+/);
  assert.equal(
    tokens.filter((x) => x === 'packages/providers/test/python-source-normalizer.test.mjs').length,
    1,
  );
});
