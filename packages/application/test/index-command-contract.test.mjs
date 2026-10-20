import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as contracts from '../dist/index.js';

const root = new URL('../../../fixtures/indexing/phase05-index-cli/', import.meta.url);
const vectors = JSON.parse(await readFile(new URL('inputs/requests.json', root), 'utf8'));
const expected = JSON.parse(await readFile(new URL('expected/results.json', root), 'utf8'));
const copy = (value) => structuredClone(value);
function parser(name) {
  assert.equal(typeof contracts[name], 'function', `Missing index contract: ${name}`);
  return contracts[name];
}

test('index contract loads independent request vectors without mutating them', () => {
  const parse = parser('parseIndexRequest');
  const status = copy(vectors.status);
  assert.deepEqual(parse(status), vectors.status);
  const write = { ...copy(vectors.write), configuration: copy(vectors.configuration) };
  assert.deepEqual(parse(write), write);
  const result = parse(write);
  result.configuration.source.include.push('other/**');
  assert.deepEqual(write.configuration, vectors.configuration);
});

for (const [name, change] of [
  [
    'unknown field',
    (value) => {
      value.extra = true;
    },
  ],
  [
    'missing budget',
    (value) => {
      delete value.budget;
    },
  ],
  [
    'unsafe budget',
    (value) => {
      value.budget.maxResultBytes = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    'zero budget',
    (value) => {
      value.budget.timeoutMs = 0;
    },
  ],
  [
    'negative zero',
    (value) => {
      value.budget.maxMetadataRows = -0;
    },
  ],
  [
    'NUL path',
    (value) => {
      value.databasePath += '\0';
    },
  ],
  [
    'blank identity',
    (value) => {
      value.repositoryId = ' ';
    },
  ],
  [
    'padded path',
    (value) => {
      value.databasePath = ' ' + value.databasePath;
    },
  ],
  [
    'future version',
    (value) => {
      value.schemaVersion = 2;
    },
  ],
  [
    'write field on status',
    (value) => {
      value.initialize = true;
    },
  ],
])
  test(`index contract refuses ${name}`, () => {
    const parse = parser('parseIndexRequest');
    const value = copy(vectors.status);
    change(value);
    assert.throws(
      () => parse(value),
      (error) => error.code === 'INVALID_REQUEST',
    );
  });

for (const [name, change] of [
  [
    'unknown config',
    (v) => {
      v.extra = true;
    },
  ],
  [
    'future config',
    (v) => {
      v.configVersion = 2;
    },
  ],
  [
    'missing budget',
    (v) => {
      delete v.resourceBudget;
    },
  ],
  [
    'unknown worker knob',
    (v) => {
      v.indexing.nativeAnalyzer.workers = 1;
    },
  ],
  [
    'zero worker',
    (v) => {
      v.indexing.nativeAnalyzer.parseWorkers = 0;
    },
  ],
  [
    'fraction worker',
    (v) => {
      v.indexing.nativeAnalyzer.parseWorkers = 1.5;
    },
  ],
  [
    'uppercased pattern mode',
    (v) => {
      v.indexing.nativeAnalyzer.parseWorkers = 'auto';
    },
  ],
  [
    'stdin ceiling',
    (v) => {
      v.transportLimits.maxStdinBytes = 1000001;
    },
  ],
  [
    'stdout ceiling',
    (v) => {
      v.transportLimits.maxStdoutBytes = 10000001;
    },
  ],
  [
    'line ceiling',
    (v) => {
      v.transportLimits.maxLineBytes = 1000001;
    },
  ],
  [
    'event ceiling',
    (v) => {
      v.transportLimits.maxEvents = 10001;
    },
  ],
  [
    'stderr ceiling',
    (v) => {
      v.transportLimits.maxStderrBytes = 1000001;
    },
  ],
  [
    'traversal pattern',
    (v) => {
      v.source.include = ['../*'];
    },
  ],
  [
    'sparse pattern',
    (v) => {
      v.source.include = new Array(1);
    },
  ],
  [
    'NUL pattern',
    (v) => {
      v.source.include = ['a\0b'];
    },
  ],
])
  test(`index contract config refuses ${name}`, () => {
    const parse = parser('parseIndexConfiguration');
    const value = copy(vectors.configuration);
    change(value);
    assert.throws(
      () => parse(value),
      (error) => error.code === 'INVALID_CONFIGURATION',
    );
  });

test('index contract accepts explicit worker and lowered caller limits', () => {
  const parse = parser('parseIndexConfiguration');
  const value = copy(vectors.configuration);
  value.indexing.nativeAnalyzer.parseWorkers = 1;
  value.transportLimits.maxLineBytes = 1;
  assert.deepEqual(parse(value), value);
});

test('index contract refuses initialization on incremental', () => {
  const parse = parser('parseIndexRequest');
  const value = {
    ...copy(vectors.write),
    operation: 'INCREMENTAL',
    configuration: copy(vectors.configuration),
  };
  assert.throws(
    () => parse(value),
    (error) => error.code === 'INVALID_REQUEST',
  );
  value.initialize = false;
  assert.deepEqual(parse(value), value);
});

for (const location of ['root', 'budget', 'configuration', 'pattern']) {
  test(`index contract refuses ${location} getter without invoking it`, () => {
    const parse = parser(
      location === 'configuration' || location === 'pattern'
        ? 'parseIndexConfiguration'
        : 'parseIndexRequest',
    );
    const value = copy(
      location === 'configuration' || location === 'pattern'
        ? vectors.configuration
        : vectors.status,
    );
    let calls = 0;
    const object =
      location === 'budget' ? value.budget : location === 'pattern' ? value.source.include : value;
    const key =
      location === 'budget'
        ? 'timeoutMs'
        : location === 'pattern'
          ? '0'
          : location === 'configuration'
            ? 'resourceBudget'
            : 'operation';
    Object.defineProperty(object, key, {
      enumerable: true,
      get() {
        calls++;
        throw new Error('secret');
      },
    });
    assert.throws(() => parse(value));
    assert.equal(calls, 0);
  });
}

test('index contract validates independent unindexed status result', () => {
  assert.deepEqual(parser('parseIndexResult')(expected.unindexed), expected.unindexed);
});

for (const [name, change] of [
  [
    'unknown result',
    (v) => {
      v.extra = true;
    },
  ],
  [
    'worktree observed',
    (v) => {
      v.status.freshness.worktree = 'OBSERVED';
    },
  ],
  [
    'false baseline compatibility',
    (v) => {
      v.status.baseline.state = 'AVAILABLE';
    },
  ],
  [
    'unindexed claimed current',
    (v) => {
      v.status.freshness.state = 'CURRENT';
    },
  ],
  [
    'orphan coverage',
    (v) => {
      v.status.coverage.capabilities = [
        { name: 'CALL', complete: 1, partial: 0, none: 0, unknown: 0 },
      ];
    },
  ],
])
  test(`index contract result refuses ${name}`, () => {
    const parse = parser('parseIndexResult');
    const value = copy(expected.unindexed);
    change(value);
    assert.throws(
      () => parse(value),
      (error) => error.code === 'INDEX_DATA_INVALID',
    );
  });

test('index contract errors retain explicit unknown effects without raw exceptions', () => {
  const ErrorClass = parser('IndexCommandError');
  const error = new ErrorClass('ANALYSIS_FAILED', expected.effects);
  assert.equal(error.code, 'ANALYSIS_FAILED');
  assert.deepEqual(error.effects, expected.effects);
  assert.ok(!error.message.includes('secret'));
});

test('index contract accepts independent committed result and owns its status', () => {
  const input = copy(expected.full);
  const result = parser('parseIndexResult')(input);
  assert.deepEqual(result, input);
  result.status.coverage.capabilities[0].complete++;
  assert.equal(input.status.coverage.capabilities[0].complete, 1);
});

for (const [name, change] of [
  [
    'false commit',
    (v) => {
      v.graphCommitted = false;
    },
  ],
  [
    'unknown operation',
    (v) => {
      v.operation = 'SCAN';
    },
  ],
  [
    'incremental initialization',
    (v) => {
      v.operation = 'INCREMENTAL';
    },
  ],
  [
    'wrong indexed fingerprint',
    (v) => {
      v.status.indexed.contentFingerprint = 'sha256:' + '2'.repeat(64);
    },
  ],
  [
    'unknown indexed state',
    (v) => {
      v.status.indexed.revisionId = null;
    },
  ],
  [
    'unsafe coverage count',
    (v) => {
      v.status.coverage.capabilities[0].complete = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    'duplicate capability',
    (v) => {
      v.status.coverage.capabilities.push(copy(v.status.coverage.capabilities[0]));
    },
  ],
  [
    'invalid worker',
    (v) => {
      v.workers.effectiveCount = 0;
    },
  ],
  [
    'worker override',
    (v) => {
      v.workers.requested = 2;
    },
  ],
  [
    'negative time',
    (v) => {
      v.timings.totalMs = -1;
    },
  ],
  [
    'unavailable without reason',
    (v) => {
      v.timings.scanMs = null;
    },
  ],
])
  test(`index contract committed result refuses ${name}`, () => {
    const value = copy(expected.full);
    change(value);
    assert.throws(
      () => parser('parseIndexResult')(value),
      (error) => error.code === 'INDEX_DATA_INVALID',
    );
  });

test('index contract retains unavailable timing reason instead of zero', () => {
  const value = copy(expected.full);
  value.timings.scanMs = null;
  value.timings.unavailableReasons.scanMs = 'Not observed';
  assert.deepEqual(parser('parseIndexResult')(value), value);
});

test('index contract refuses inherited array methods without invoking them', () => {
  let calls = 0;
  class HostileArray extends Array {
    map() {
      calls++;
      return ['**/*.java'];
    }
  }
  const value = copy(vectors.configuration);
  value.source.include = new HostileArray('**/*.java');
  assert.throws(
    () => parser('parseIndexConfiguration')(value),
    (error) => error.code === 'INVALID_CONFIGURATION',
  );
  assert.equal(calls, 0);
});
