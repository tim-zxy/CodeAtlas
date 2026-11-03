import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
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
