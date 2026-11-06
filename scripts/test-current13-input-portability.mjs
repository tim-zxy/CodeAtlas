import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import * as historical from '../fixtures/phase1/syntax-contract/ci-portability/historical-inputs.mjs';
import { readSurfaceCapture } from '../fixtures/phase1/syntax-contract/surface-closure/corpus.mjs';
const expected = [
  {
    path: '.superpowers/sdd/2026-11-05-current13-no-native-entry/manual-expectations.json',
    bytes: 1734,
    sha256: '9aa56ea9ec1bcb5ca2a9453f639646ef61e7dc98b19a872c2ea3ae3ad93b7aa5',
  },
  {
    path: '.superpowers/sdd/2026-11-05-current13-modified-entry/manual-expectations.json',
    bytes: 703,
    sha256: '6be61a280950efa783e06cc4a7814ae4750f4a4adbeebee868e605d7760ec47c',
  },
  {
    path: '.superpowers/sdd/2026-11-05-modified-unit-library-positive/library-output/after.request.jsonl',
    bytes: 1834,
    sha256: '314b12e8b2c038fcd66c347ee5e1b7f96e8883fe7669cea378381cafcfb2c789',
  },
  {
    path: '.superpowers/sdd/2026-11-05-modified-unit-library-positive/library-output/after.output.jsonl',
    bytes: 31459,
    sha256: 'bc586840d4d101f471120125c58d7306d3b749e11d71edf06079a0482932b9f0',
  },
  {
    path: '.superpowers/sdd/2026-11-05-modified-unit-library-positive/rust-verification.json',
    bytes: 6015,
    sha256: 'd283844344c9816e4a3d82e4cc87942866e7841c4795bb42f65ae0c1e229e7a3',
  },
  {
    path: '.superpowers/sdd/2026-11-05-modified-unit-library-positive/node-verification.json',
    bytes: 7643,
    sha256: 'e3a05caf4e6a5b87692486b46fe5cdf428f68bc510cd970c8fa792283f17c1a6',
  },
  {
    path: '.superpowers/sdd/2026-11-05-current13-mixed-entry/manual-expectations.json',
    bytes: 1365,
    sha256: 'a9e15e61090f67ae9a80dfdf2fd2ca2af96d08c47b6247194f3e97f340acc96f',
  },
  {
    path: '.superpowers/sdd/2026-11-05-current13-mixed-entry/mixed-raw-pins.json',
    bytes: 313,
    sha256: '383321ed7a0e101112b6733d7388e95b1d508cc0447fd0bbd55738ebaa0a3499',
  },
  {
    path: '.superpowers/sdd/2026-11-05-current13-mixed-entry/library-output/mixed.request.jsonl',
    bytes: 6701,
    sha256: '8db996ea5ae26fd043d0211b5e98cee11e605e3713293cf6f46a8183aa324e2e',
  },
  {
    path: '.superpowers/sdd/2026-11-05-current13-mixed-entry/library-output/mixed.output.jsonl',
    bytes: 68145,
    sha256: '1099c35d271253284b934efdf7c0c29bf5fee517b025aaa2da9689b4056d8de2',
  },
  {
    path: '.superpowers/sdd/2026-11-05-current13-mixed-entry/prepare-summary.json',
    bytes: 8337,
    sha256: '446189b520759a1d88030865891f17e803b639ca81a13f069714ccb462bdda08',
  },
  {
    path: '.superpowers/sdd/2026-11-05-current13-workspace-entry/prepare-manual-expectations.json',
    bytes: 2884,
    sha256: '8bc8424a99f2d34c582eff9e741ae80db8e28f5203d32e7a70300d92c0d435b2',
  },
  {
    path: '.superpowers/sdd/2026-11-05-current13-workspace-entry/entry-manual-expectations.json',
    bytes: 1324,
    sha256: 'b702ab95b0aff84431a79871f8ab9a96e19c59db085cc2cd633aecda07a75fea',
  },
];
const root = new URL('../fixtures/phase1/syntax-contract/ci-portability/', import.meta.url);
const index = JSON.parse(fs.readFileSync(new URL('index.json', root)));
const hash = (b) => createHash('sha256').update(b).digest('hex');
const ordered = (entries) => entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeatlas-current13-input-portability-'));
  t.after(() => {
    assert.equal(path.dirname(dir), os.tmpdir());
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}
test('thirteen exact historical inputs are archived without changing their bytes', () => {
  for (const pin of expected) {
    assert.deepEqual(index.files[pin.path], { sha256: pin.sha256, bytes: pin.bytes }, pin.path);
    const bytes = historical.readHistoricalInput(pin.path);
    assert.equal(bytes.length, pin.bytes);
    assert.equal(hash(bytes), pin.sha256);
  }
});
test('all679 previous logical records and their original bytes remain preserved', () => {
  const added = new Set(expected.map((p) => p.path));
  const prior = ordered(Object.entries(index.files).filter(([p]) => !added.has(p)));
  assert.equal(prior.length, 679);
  assert.equal(
    hash(JSON.stringify(prior)),
    '310bf3b762fd394a9287c45fd0bd1ab96e596db83ba018527d41a5e636aa317f',
  );
  for (const [logical, pin] of prior) {
    const bytes = historical.readHistoricalInput(logical);
    assert.equal(bytes.length, pin.bytes, logical);
    assert.equal(hash(bytes), pin.sha256, logical);
  }
});
test('two original Java raws already exist exactly in tracked J1 code capture', () => {
  const code = readSurfaceCapture('J1').code;
  assert.equal(
    hash(code.request),
    '4b4dfbf058168ce0469d754c517fd795a7626329ffaaa1c2d9758ff368cae2b6',
  );
  assert.equal(
    hash(code.output),
    '54b0d3d75b76170073f726a251a6ab2c1f8222d07662a77b24f3d159fe193247',
  );
});
test('explicit local root works from isolated cwd; missing inputs do not materialize sdd', (t) => {
  assert.equal(typeof historical.readHistoricalInputOrLocal, 'function');
  const dir = sandbox(t),
    cwd = process.cwd();
  const elsewhere = path.join(dir, 'elsewhere');
  fs.mkdirSync(elsewhere);
  process.chdir(elsewhere);
  try {
    for (const pin of expected)
      assert.equal(
        hash(historical.readHistoricalInputOrLocal(pin.path, undefined, dir)),
        pin.sha256,
      );
    assert.equal(fs.existsSync(path.join(dir, '.superpowers')), false);
    assert.equal(fs.existsSync(path.join(elsewhere, '.superpowers')), false);
    const text = historical.readHistoricalInputOrLocal(expected[0].path, 'utf8', dir);
    assert.equal(hash(text), expected[0].sha256);
  } finally {
    process.chdir(cwd);
  }
});
test('local input keeps priority and leaves original bytes untouched', (t) => {
  const dir = sandbox(t),
    logical = expected[0].path,
    file = path.join(dir, logical);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'independent local fixture\r\n');
  assert.equal(
    historical.readHistoricalInputOrLocal(logical, 'utf8', dir),
    'independent local fixture\r\n',
  );
  assert.equal(fs.readFileSync(file, 'utf8'), 'independent local fixture\r\n');
});
test('a non-ENOENT local read error propagates unchanged rather than falling back', (t) => {
  const dir = sandbox(t),
    logical = expected[0].path,
    target = path.join(dir, logical),
    original = fs.readFileSync;
  const failure = Object.assign(Error('controlled test-only access refusal'), { code: 'EACCES' });
  t.mock.method(fs, 'readFileSync', (p, ...args) => {
    if (p === target) throw failure;
    return original(p, ...args);
  });
  assert.throws(
    () => historical.readHistoricalInputOrLocal(logical, undefined, dir),
    (e) => e === failure,
  );
});
test('unsafe or unlisted logical paths reject before any local filesystem read', (t) => {
  assert.equal(typeof historical.readHistoricalInputOrLocal, 'function');
  const dir = sandbox(t);
  let reads = 0;
  t.mock.method(fs, 'readFileSync', () => {
    reads++;
    throw Error('must not read');
  });
  for (const logical of [
    '../outside',
    '/absolute',
    'C:/outside',
    'C:relative',
    'a/../b',
    'a//b',
    'a\\b',
    'bad\u0000name',
    '.superpowers/unlisted.json',
  ]) {
    assert.throws(
      () => historical.readHistoricalInputOrLocal(logical, undefined, dir),
      undefined,
      logical,
    );
  }
  assert.equal(reads, 0);
});
test('archived prepare/manual inputs parse and strict raw consumers accept original pairs', async (t) => {
  const dir = sandbox(t);
  for (const pin of expected.filter(
    (p) => p.path.endsWith('manual-expectations.json') || p.path.endsWith('prepare-summary.json'),
  )) {
    const value = JSON.parse(historical.readHistoricalInputOrLocal(pin.path, 'utf8', dir));
    assert.equal(typeof value, 'object');
  }
  const { validateFrameworkSurfaceStreamWithBudget } =
    await import('../packages/providers/dist/native-framework-surface-stream.js');
  for (const [request, output] of [
    [
      '.superpowers/sdd/2026-11-05-modified-unit-library-positive/library-output/after.request.jsonl',
      '.superpowers/sdd/2026-11-05-modified-unit-library-positive/library-output/after.output.jsonl',
    ],
    [
      '.superpowers/sdd/2026-11-05-current13-mixed-entry/library-output/mixed.request.jsonl',
      '.superpowers/sdd/2026-11-05-current13-mixed-entry/library-output/mixed.output.jsonl',
    ],
  ]) {
    const ledger = {
      limits: {
        maxSerializedBytes: Number.MAX_SAFE_INTEGER,
        maxItems: Number.MAX_SAFE_INTEGER,
        maxDepth: Number.MAX_SAFE_INTEGER,
      },
      budget: { serializedBytes: 0, items: 0 },
    };
    const result = validateFrameworkSurfaceStreamWithBudget(
      historical.readHistoricalInputOrLocal(request, undefined, dir),
      historical.readHistoricalInputOrLocal(output, undefined, dir),
      ledger,
    );
    assert.equal(result.observation.outcome, 'SUCCEEDED');
  }
  assert.equal(fs.existsSync(path.join(dir, '.superpowers')), false);
});
