import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from '../../providers/dist/index.js';
import { chunkBytes } from '../../providers/test/helpers/native-refresh-v3-corpus.mjs';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nativeMetadataEnvironment } from '../dist/native-metadata-admission.js';
import { nativeRefreshVerificationProfiles } from '../dist/native-metadata-profiles.js';

test('REFRESH_VERIFY fresh worker distinguishes offline calibration from unopened admission', () => {
  const worker = new URL('./helpers/native-refresh-verification-worker.mjs', import.meta.url);
  assert.ok(existsSync(worker), 'dedicated fresh worker must exist');
  const run = (mode) => {
    const child = spawnSync(process.execPath, [fileURLToPath(worker), mode, 'zero-target', '0'], {
      encoding: 'utf8',
      timeout: 60_000,
      windowsHide: true,
    });
    assert.equal(child.stderr, '');
    return { status: child.status, row: JSON.parse(child.stdout) };
  };
  const offline = run('offline');
  assert.equal(offline.status, 0);
  assert.equal(offline.row.scope, 'OFFLINE_CALIBRATION_ONLY');
  assert.equal(offline.row.observedOutcome, 'REFRESH_COMPLETED');
  assert.equal(offline.row.opened, 1);
  assert.ok(offline.row.peakResidentBytes > 0);
  assert.equal(
    offline.row.peakResidentBytes,
    Math.max(...offline.row.samples.map((s) => s.peakKiB * 1024)),
  );
  const actual = run('actual');
  assert.equal(actual.row.scope, 'ACTUAL_PRIVATE_PORT');
  const installed = nativeRefreshVerificationProfiles.some((p) =>
    Object.entries(nativeMetadataEnvironment()).every(([k, v]) => p[k] === v),
  );
  if (installed) {
    assert.equal(actual.status, 0);
    assert.equal(actual.row.opened, 1);
  } else {
    assert.equal(actual.status, 1);
    assert.equal(actual.row.opened, 0, 'missing static profile refuses before opening corpus');
    assert.equal(actual.row.observedOutcome, 'RESOURCE_LIMIT_EXCEEDED');
  }
});

test('slow-sink does not request another chunk or accept while blocked', async () => {
  const { buildVerificationCase, verificationFixtureBudget } =
    await import('./helpers/native-refresh-verification-corpus.mjs');
  const c = buildVerificationCase('slow-sink', verificationFixtureBudget);
  let reads = 0,
    inFlight = 0,
    maximum = 0,
    release,
    arrived;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const ready = new Promise((resolve) => {
    arrived = resolve;
  });
  const lines = (async function* () {
    for (let i = 0; i < c.eventBytes.length; i += 4096) {
      reads++;
      yield c.eventBytes.subarray(i, i + 4096);
    }
  })();
  let first = true;
  const decoding = api.decodeNativeRefreshV3(
    c.requestBytes,
    lines,
    {
      async accept() {
        inFlight++;
        maximum = Math.max(maximum, inFlight);
        if (first) {
          first = false;
          arrived();
          await blocked;
        }
        inFlight--;
      },
    },
    c.limits,
    verificationFixtureBudget,
  );
  await ready;
  const before = reads;
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(reads, before);
    assert.equal(inFlight, 1);
    assert.equal(maximum, 1);
  } finally {
    release();
  }
  assert.equal((await decoding).terminal.type, 'REFRESH_COMPLETED');
  assert.equal(maximum, 1);
});

test('REFRESH_VERIFY has a dedicated independently framed cap-shaped corpus', async () => {
  const helper = await import('./helpers/native-refresh-verification-corpus.mjs').catch(() => null);
  assert.equal(
    typeof helper?.buildVerificationCase,
    'function',
    'verification recipes must exist before measurement/admission',
  );
});

const cases = [
  ['zero-target', 'REFRESH_COMPLETED'],
  ['maximum-short-files', 'REFRESH_COMPLETED'],
  ['dense-retained-sites', 'REFRESH_COMPLETED'],
  ['maximum-target-summary', 'REFRESH_COMPLETED'],
  ['large-patch-ledger', 'REFRESH_COMPLETED'],
  ['long-ascii', 'REFRESH_COMPLETED'],
  ['long-bmp', 'REFRESH_COMPLETED'],
  ['long-astral', 'REFRESH_COMPLETED'],
  ['repeated-shared-owners', 'REFRESH_COMPLETED'],
  ['forged-owner', 'PROTOCOL_VIOLATION'],
  ['deep-unknown-input', 'INVALID_REQUEST'],
  ['oversized-input', 'OUTPUT_LIMIT_EXCEEDED'],
  ['oversized-output', 'OUTPUT_LIMIT_EXCEEDED'],
  ['slow-sink', 'REFRESH_COMPLETED'],
  ['burst-output-buffer', 'REFRESH_COMPLETED'],
];
for (const [name, outcome] of cases)
  test(`REFRESH_VERIFY contract recipe: ${name}`, async () => {
    const { buildVerificationCase, verificationFixtureBudget, exceededVerificationCaps } =
      await import('./helpers/native-refresh-verification-corpus.mjs');
    const c = buildVerificationCase(name, verificationFixtureBudget);
    assert.equal(c.expectedOutcome, outcome);
    if (c.boundary) {
      assert.equal(exceededVerificationCaps(c.sizes).length, 0, 'complete last admissible variant');
      assert.equal(c.boundary.nextCount, c.boundary.count + 1);
      assert.ok(
        c.boundary.exceededCaps.length > 0,
        'next complete variant crosses an unchanged hard cap',
      );
    }
    const lines = ['burst-output-buffer', 'oversized-output'].includes(name)
      ? (async function* () {
          yield c.eventBytes;
        })()
      : chunkBytes(c.eventBytes);
    const run = () =>
      api.decodeNativeRefreshV3(
        c.requestBytes,
        lines,
        { async accept() {} },
        c.limits,
        verificationFixtureBudget,
      );
    if (outcome === 'REFRESH_COMPLETED') assert.equal((await run()).terminal.type, outcome);
    else
      await assert.rejects(run(), (e) => e.code === outcome, 'independent expected typed refusal');
  });

test('verification index and required runners have no orphan classes', async () => {
  const index = JSON.parse(
    await readFile(
      new URL('../../../fixtures/ipc/refresh-v3/verification-memory-cases.json', import.meta.url),
    ),
  );
  assert.equal(index.workspace, 'REFRESH_VERIFY');
  assert.deepEqual(
    index.classes,
    cases.map(([name]) => name),
  );
  for (const field of ['suite', 'worker', 'spec', 'acceptance'])
    assert.ok(
      existsSync(
        new URL(index[field], new URL('../../../fixtures/ipc/refresh-v3/', import.meta.url)),
      ),
    );
  const root = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url)));
  assert.ok(
    root.scripts.test.includes('packages/runtime/test/native-refresh-verification-memory.test.mjs'),
  );
  assert.ok(root.scripts.test.includes('scripts/test-native-refresh-verification-memory.mjs'));
  const ci = await readFile(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /CODEATLAS_REQUIRE_NATIVE_REFRESH_VERIFICATION_PROFILE: '1'/);
  assert.ok(ci.includes('packages/runtime/test/native-refresh-verification-memory.test.mjs'));
});

let actualIdentity;
for (const [name] of cases)
  test(`REFRESH_VERIFY actual-port admission: ${name}`, async (t) => {
    const { runPinnedVerificationWorker } =
      await import('../../../scripts/native-refresh-verification-memory.mjs');
    const child = runPinnedVerificationWorker(name, 0, 'actual');
    const directory = path.join(
      process.env.CODEATLAS_NATIVE_MEMORY_ARTIFACT_DIR ?? '.superpowers/native-memory',
      'refresh-verify',
    );
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, name + '.json'),
      JSON.stringify({ workspace: 'REFRESH_VERIFY', name, child }, null, 2) + '\n',
    );
    const required = process.env.CODEATLAS_REQUIRE_NATIVE_REFRESH_VERIFICATION_PROFILE === '1';
    const row = JSON.parse(child.stdout);
    if (!required && row.opened === 0 && row.observedOutcome === 'RESOURCE_LIMIT_EXCEEDED') {
      t.diagnostic(
        'UNADMITTED: no reviewed exact-build REFRESH_VERIFY profile; not actual-port success',
      );
      return;
    }
    assert.equal(
      child.status,
      0,
      'Required reviewed profile/absolute peak gate failed; raw artifact retained',
    );
    assert.equal(child.stderr, '');
    assert.equal(row.opened, 1);
    assert.equal(row.name, name);
    assert.equal(row.scope, 'ACTUAL_PRIVATE_PORT');
    const { verificationEvidenceIdentity, validateVerificationObservation } =
      await import('../../../scripts/native-refresh-verification-memory.mjs');
    actualIdentity ??= verificationEvidenceIdentity();
    validateVerificationObservation(row, await actualIdentity, 'ACTUAL_PRIVATE_PORT');
  });
