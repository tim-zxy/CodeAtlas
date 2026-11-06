import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, cp, rm, writeFile, link, lstat, open, rename } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
let api;
try {
  api = await import('./syntax-observation-evidence.mjs');
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  api = {};
}
const fresh = () => ({
  schemaVersion: 1,
  component: 'NATIVE',
  processId: 123,
  startedEpochMs: 100,
  finishedEpochMs: 200,
  peakMethod: 'PROCESS_MEMORY_COUNTERS.PeakWorkingSetSize',
  peakUnits: 'bytes',
  completeLifetime: true,
  samples: [
    { processId: 123, epochMs: 100, peakBytes: 100, phase: 'RUNNING' },
    { processId: 123, epochMs: 200, peakBytes: 140, phase: 'FINAL' },
  ],
});
function parse(v) {
  assert.equal(typeof api.validateSyntaxPeakTranscript, 'function');
  return api.validateSyntaxPeakTranscript(v);
}
test('literal OS lifetime peak is final140, not a sum or current sample', () => {
  const out = parse(fresh());
  assert.equal(out.peakBytes, 140);
  assert.ok(Object.isFrozen(out));
});
for (const [name, mutate] of [
  ['foreign process', (p) => (p.samples[1].processId = 999)],
  ['early final', (p) => (p.samples[1].epochMs = 199)],
  ['sample after exit', (p) => (p.samples[0].epochMs = 201)],
  ['incomplete lifetime', (p) => (p.completeLifetime = false)],
  ['zero final peak', (p) => (p.samples[1].peakBytes = 0)],
  ['decreasing peak', (p) => (p.samples[1].peakBytes = 99)],
  ['missing final', (p) => p.samples.pop()],
  ['sampled current working set', (p) => (p.peakMethod = 'WorkingSet64')],
  ['unit substitution', (p) => (p.peakUnits = 'KiB')],
  ['duplicate final', (p) => (p.samples[0].phase = 'FINAL')],
  ['unknown raw field', (p) => (p.rawCommand = 'secret')],
])
  test('collector contract refuses ' + name, () => {
    assert.throws(
      () =>
        parse(
          (() => {
            const p = fresh();
            mutate(p);
            return p;
          })(),
        ),
      (e) => e.code === 'INVALID_SYNTAX_PEAK_TRANSCRIPT',
    );
  });
test('short-lived child requires its own final OS lifetime counter, never a fabricated poll', () => {
  const p = fresh();
  p.startedEpochMs = 200;
  p.samples = [p.samples[1]];
  assert.equal(parse(p).peakBytes, 140);
  p.samples = [];
  assert.throws(
    () => parse(p),
    (e) => e.code === 'INVALID_SYNTAX_PEAK_TRANSCRIPT',
  );
});
const root = 'fixtures/phase1/syntax-observation-corpus',
  limits = { maxCatalogBytes: 100000, maxFileBytes: 100000, maxFiles: 100 };
test('offline catalog freezes eight calibration classes and independent holdout without a parser', async () => {
  assert.equal(typeof api.loadSyntaxObservationCorpus, 'function');
  const out = await api.loadSyntaxObservationCorpus(root, limits);
  const expected = JSON.parse(await readFile(path.join(root, 'expected/classes.json'), 'utf8'));
  assert.deepEqual(
    out.catalog.calibration.map((c) => c.classId),
    expected.classes,
  );
  assert.equal(out.catalog.calibration.length, 8);
  assert.equal(out.catalog.holdout.length, 8);
  assert.equal(out.identity.caseIds.length, 8);
  assert.match(out.identity.inputDigest, /^[0-9a-f]{64}$/);
  assert.ok(Object.isFrozen(out.catalog.calibration));
});
test('changed Source bytes and lowered byte ceilings refuse offline catalog integrity', async (t) => {
  assert.equal(typeof api.loadSyntaxObservationCorpus, 'function');
  const dir = await mkdtemp(path.join(tmpdir(), 'codeatlas-syntax-corpus-unit-'));
  t.after(async () => {
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep));
    assert.ok(path.basename(dir).startsWith('codeatlas-syntax-corpus-unit-'));
    await rm(dir, { recursive: true, force: true });
  });
  await cp(root, dir, { recursive: true });
  await assert.rejects(
    () => api.loadSyntaxObservationCorpus(dir, { ...limits, maxFileBytes: 1 }),
    (e) => e.code === 'INVALID_SYNTAX_CORPUS',
  );
  const catalog = JSON.parse(await readFile(path.join(dir, 'catalog.json'), 'utf8'));
  await writeFile(path.join(dir, catalog.calibration[0].sources[0].path), 'changed');
  await assert.rejects(
    () => api.loadSyntaxObservationCorpus(dir, limits),
    (e) => e.code === 'INVALID_SYNTAX_CORPUS',
  );
});

test('Runtime frozen corpus identity matches current offline bytes', async () => {
  const { nativeSyntaxObservationCorpus } =
    await import('../packages/runtime/dist/syntax-observation-corpus.js');
  const out = await api.loadSyntaxObservationCorpus(root, limits);
  assert.deepEqual(out.identity, nativeSyntaxObservationCorpus);
});

for (const artifact of ['catalog', 'source'])
  test('offline corpus refuses a hardlinked ' + artifact, async (t) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'codeatlas-syntax-corpus-link-'));
    t.after(async () => {
      assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep));
      assert.ok(path.basename(dir).startsWith('codeatlas-syntax-corpus-link-'));
      await rm(dir, { recursive: true, force: true });
    });
    await cp(root, dir, { recursive: true });
    const before = await api.loadSyntaxObservationCorpus(dir, limits);
    const target =
      artifact === 'catalog'
        ? path.join(dir, 'catalog.json')
        : path.join(dir, before.catalog.calibration[0].sources[0].path);
    const originalBytes = await readFile(target);
    await link(target, target + '-alias');
    assert.equal((await lstat(target)).nlink, 2);
    assert.deepEqual(await readFile(target), originalBytes);
    await assert.rejects(
      () => api.loadSyntaxObservationCorpus(dir, limits),
      (error) => error.code === 'INVALID_SYNTAX_CORPUS',
    );
  });

test('offline corpus refuses named-file replacement after a real open', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'codeatlas-syntax-corpus-replacement-'));
  t.after(async () => {
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep));
    assert.ok(path.basename(dir).startsWith('codeatlas-syntax-corpus-replacement-'));
    await rm(dir, { recursive: true, force: true });
  });
  await cp(root, dir, { recursive: true });
  const before = await api.loadSyntaxObservationCorpus(dir, limits);
  const target = path.join(dir, before.catalog.calibration[0].sources[0].path);
  const originalBytes = await readFile(target);
  const handle = await open(target, 'r');
  const targetStat = await handle.stat();
  const prototype = Object.getPrototypeOf(handle);
  const originalStat = prototype.stat;
  await handle.close();
  let replaced = false;
  t.mock.method(prototype, 'stat', async function (...args) {
    const result = await originalStat.apply(this, args);
    if (!replaced && result.ino === targetStat.ino && result.dev === targetStat.dev) {
      await rename(target, target + '-original');
      await writeFile(target, originalBytes);
      const named = await lstat(target);
      assert.notEqual(named.ino, result.ino);
      assert.deepEqual(await readFile(target), originalBytes);
      replaced = true;
    }
    return result;
  });
  await assert.rejects(
    () => api.loadSyntaxObservationCorpus(dir, limits),
    (error) => error.code === 'INVALID_SYNTAX_CORPUS',
  );
  assert.equal(replaced, true, 'replacement must actually complete');
});

for (const kind of ['missing-case', 'foreign-case', 'traversal', 'duplicate-holdout-source'])
  test('offline catalog refuses ' + kind, async (t) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'codeatlas-syntax-corpus-control-'));
    t.after(async () => {
      assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep));
      assert.ok(path.basename(dir).startsWith('codeatlas-syntax-corpus-control-'));
      await rm(dir, { recursive: true, force: true });
    });
    await cp(root, dir, { recursive: true });
    const catalogPath = path.join(dir, 'catalog.json'),
      c = JSON.parse(await readFile(catalogPath, 'utf8'));
    if (kind === 'missing-case') c.calibration.pop();
    if (kind === 'foreign-case') c.calibration[0].classId = 'foreign';
    if (kind === 'traversal') c.calibration[0].sources[0].path = '../outside.py';
    if (kind === 'duplicate-holdout-source') {
      const source = c.calibration[0].sources[0],
        target = c.holdout[0].sources[0];
      await writeFile(path.join(dir, target.path), await readFile(path.join(dir, source.path)));
      target.sha256 = source.sha256;
    }
    await writeFile(catalogPath, JSON.stringify(c));
    await assert.rejects(
      () => api.loadSyntaxObservationCorpus(dir, limits),
      (e) => e.code === 'INVALID_SYNTAX_CORPUS',
    );
  });
