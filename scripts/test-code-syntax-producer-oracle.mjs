import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs, { readFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join, resolve, dirname, basename } from 'node:path';
import * as api from '../packages/providers/dist/index.js';
import {
  producerJSON,
  instantiateProducerCase,
  loadLegacy,
} from '../packages/providers/test/fixtures/code-syntax-producer-helpers.mjs';
const cases = await producerJSON('cases.json'),
  decisions = await producerJSON('expected/decisions.json');
test('producer fixture has the approved independent18 case families', () => {
  assert.equal(cases.length, 18);
  assert.equal(new Set(cases.map((c) => c.id)).size, 18);
});
for (const { id } of cases)
  test('independent producer oracle: ' + id, async () => {
    const x = await instantiateProducerCase(id, '/fixture/code-syntax-producer');
    const r = api.validateCodeSyntaxObservationStream(x.requestBytes, x.expectedOutputBytes),
      d = decisions[id];
    for (const key of ['codeOutcome', 'syntaxOutcome', 'outcome', 'counts'])
      assert.deepEqual(r[key], d[key]);
    const p = r.request.payload;
    assert.deepEqual(
      api.normalizePythonSourceObservation({
        targetSource: p.targetSource,
        providerId: p.providerId,
        providerSnapshotId: p.providerSnapshotId,
        sourceFiles: p.sourceFiles,
        nodes: r.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
        edges: r.events.filter((e) => e.type === 'EDGE').map((e) => e.payload),
      }),
      x.expectedCanonical,
    );
  });
test('legacy dictionary output is compatible,not promoted to correct complete extraction', async () => {
  const x = await loadLegacy('/fixture/code-syntax-producer'),
    request = api.parseSyntaxObservationRequest(JSON.parse(x.requestBytes));
  const records = x.expectedOutputBytes
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map((x) => Buffer.from(x + '\n'));
  const r = api.validateSyntaxObservationStream(request, records);
  assert.equal(r.outcome, 'PARTIAL');
});

test('new request,reader and offline oracle are each registered once', async () => {
  const p = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const path of [
    'packages/providers/test/native-code-syntax-request.test.mjs',
    'packages/providers/test/native-code-syntax-stream.test.mjs',
    'scripts/test-code-syntax-producer-oracle.mjs',
  ])
    assert.equal(p.scripts.test.split(path).length - 1, 1, path);
});
test('capture manifest rejects forged fields and byte hashes', async () => {
  const { verifyCaptureManifest } = await import('./check-code-syntax-library-output.mjs');
  const bytes = {
    request: Buffer.from('request'),
    events: Buffer.from('events'),
    expected: Buffer.from('expected'),
  };
  const { sha } =
    await import('../packages/providers/test/fixtures/code-syntax-producer-helpers.mjs');
  const m = {
    schemaVersion: 1,
    executionKind: 'RUST_LIBRARY_TEST_ONLY',
    measurementEligible: false,
    caseId: 'unit',
    requestFile: 'request.jsonl',
    eventsFile: 'events.jsonl',
    expectedFile: 'expected.jsonl',
    requestSha256: sha(bytes.request),
    eventsSha256: sha(bytes.events),
    expectedSha256: sha(bytes.expected),
  };
  verifyCaptureManifest(m, 'unit', bytes);
  for (const patch of [
    { measurementEligible: true },
    { requestFile: '../foreign' },
    { eventsSha256: '0'.repeat(64) },
    { ready: true },
  ])
    assert.throws(() => verifyCaptureManifest({ ...m, ...patch }, 'unit', bytes));
});
test('capture checker refuses outside or absent root without generation fallback', async () => {
  const { checkCapturedLibraryOutput } = await import('./check-code-syntax-library-output.mjs');
  await assert.rejects(checkCapturedLibraryOutput(process.cwd()));
  await assert.rejects(
    checkCapturedLibraryOutput(
      fileURLToPath(
        new URL(
          '../.superpowers/sdd/2026-10-24-phase1-code-syntax-producer/not-created-capture',
          import.meta.url,
        ),
      ),
    ),
  );
});

// Synthetic file copies exercise only the offline checker, never a Rust capture.
async function ownedSyntheticCapture(t) {
  const allowed = fileURLToPath(
    new URL(
      '../.superpowers/sdd/2026-10-24-phase1-code-syntax-producer/library-output/',
      import.meta.url,
    ),
  );
  await fs.mkdir(allowed, { recursive: true });
  const root = await fs.mkdtemp(join(allowed, 'unit-bounded-'));
  t.after(async () => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    assert.equal(resolve(root), root);
    assert.equal(dirname(root), resolve(allowed));
    assert.match(basename(root), /^unit-bounded-[A-Za-z0-9]+$/);
    await fs.rm(root, { recursive: true, force: true });
  });
  const { sha } =
    await import('../packages/providers/test/fixtures/code-syntax-producer-helpers.mjs');
  for (const { id } of cases) {
    const x = await instantiateProducerCase(id, '/fixture/code-syntax-producer');
    const dir = join(root, id);
    await fs.mkdir(dir);
    const bytes = {
      request: x.requestBytes,
      events: x.expectedOutputBytes,
      expected: x.expectedOutputBytes,
    };
    const manifest = {
      schemaVersion: 1,
      executionKind: 'RUST_LIBRARY_TEST_ONLY',
      measurementEligible: false,
      caseId: id,
      requestFile: 'request.jsonl',
      eventsFile: 'events.jsonl',
      expectedFile: 'expected.jsonl',
      requestSha256: sha(bytes.request),
      eventsSha256: sha(bytes.events),
      expectedSha256: sha(bytes.expected),
    };
    for (const [name, data] of Object.entries(bytes))
      await fs.writeFile(join(dir, name + '.jsonl'), data, { flag: 'wx' });
    await fs.writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest), { flag: 'wx' });
  }
  return root;
}
test('offline checker accepts all18 synthetic capture vectors without promoting authenticity', async (t) => {
  const { checkCapturedLibraryOutput } = await import('./check-code-syntax-library-output.mjs');
  const root = await ownedSyntheticCapture(t);
  const report = await checkCapturedLibraryOutput(root);
  assert.equal(report.cases.length, 18);
  assert.equal(report.measurementEligible, false);
  assert.equal(report.sourceOrHistoryAuthenticated, false);
});
test('offline capture growth is rejected before an oversized whole-file read', async (t) => {
  const { checkCapturedLibraryOutput } = await import('./check-code-syntax-library-output.mjs');
  const root = await ownedSyntheticCapture(t);
  const target = join(root, cases[0].id, 'request.jsonl');
  const originalStat = fs.lstat,
    originalRead = fs.readFile;
  let grew = false,
    wholeReadBytes = 0;
  t.mock.method(fs, 'lstat', async (name, ...args) => {
    const stat = await originalStat(name, ...args);
    if (name === target && !grew) {
      await fs.truncate(target, api.NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes + 1);
      grew = true;
    }
    return stat;
  });
  t.mock.method(fs, 'readFile', async (name, ...args) => {
    const data = await originalRead(name, ...args);
    if (name === target) wholeReadBytes += data.length;
    return data;
  });
  syncBuiltinESMExports();
  await assert.rejects(checkCapturedLibraryOutput(root));
  assert.equal(grew, true, 'real capture file was grown after its first stat');
  assert.ok(
    wholeReadBytes <= api.NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes,
    'capture checker whole-read more than its existing hard cap before refusal',
  );
});
