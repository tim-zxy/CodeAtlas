import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as runtime from '../dist/index.js';
import { nativeMetadataEnvironment } from '../dist/native-metadata-admission.js';
import { nativeMetadataProfiles } from '../dist/native-metadata-profiles.js';

// Missing implementation yields an assertion about the required boundary, not an import crash.
const api = await import('../dist/native-refresh-verification.js').catch((e) => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw e;
});

for (const budget of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
  test(`trusted scalar ${String(budget)} refuses before opener`, async () => {
    assert.equal(typeof api.verifyNativeRefreshObservation, 'function');
    let opened = 0;
    await assert.rejects(
      api.verifyNativeRefreshObservation(budget, () => {
        opened++;
        throw Error('must not prepare');
      }),
      (e) => e.code === 'INVALID_CONFIGURATION',
    );
    assert.equal(opened, 0);
  });

async function isolated(t, fullOnly) {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-refresh-preflight-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'packages', 'runtime');
  await mkdir(root, { recursive: true });
  await cp(new URL('../dist', import.meta.url), join(root, 'dist'), { recursive: true });
  await cp(new URL('../package.json', import.meta.url), join(root, 'package.json'));
  for (const name of ['providers', 'storage'])
    await symlink(
      fileURLToPath(new URL(`../../${name}`, import.meta.url)),
      join(directory, 'packages', name),
      'junction',
    );
  // Negative-only isolation: a current-build full profile must NOT authorize verification.
  const profiles = fullOnly
    ? [{ ...nativeMetadataProfiles[0], ...nativeMetadataEnvironment() }]
    : [];
  await writeFile(
    join(root, 'dist', 'native-metadata-profiles.js'),
    `export const nativeMetadataProfiles = Object.freeze(${JSON.stringify(profiles)});\n` +
      'export const nativeRefreshVerificationProfiles = Object.freeze([]);\n',
  );
  return import(pathToFileURL(join(root, 'dist', 'native-refresh-verification.js')).href);
}

for (const fullOnly of [false, true])
  test(
    fullOnly
      ? 'full profile cannot admit verification'
      : 'missing verification profile before preparation',
    async (t) => {
      assert.equal(typeof api.verifyNativeRefreshObservation, 'function');
      const port = await isolated(t, fullOnly);
      const calls = { opened: 0, request: 0, iterator: 0, sink: 0 };
      const input = {
        get requestBytes() {
          calls.request++;
          throw Error('must not decode');
        },
        get lines() {
          calls.iterator++;
          throw Error('must not iterate');
        },
        get sink() {
          calls.sink++;
          throw Error('must not accept');
        },
      };
      await assert.rejects(
        port.verifyNativeRefreshObservation(Number.MAX_SAFE_INTEGER, () => {
          calls.opened++;
          return input;
        }),
        (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
      );
      assert.deepEqual(calls, { opened: 0, request: 0, iterator: 0, sink: 0 });
    },
  );

test('private verification boundary is not a public Runtime SPI', () => {
  assert.equal(runtime.verifyNativeRefreshObservation, undefined);
});

test('approved C verification profile pins frozen evidence and exact-build provenance', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const { nativeRefreshVerificationProfiles } = await import('../dist/native-metadata-profiles.js');
  const root = new URL('../../../fixtures/storage/native-analysis-state/', import.meta.url);
  const raw = await readFile(new URL('memory-refresh-c-verify-candidate.json', root));
  const candidate = JSON.parse(raw);
  const profile = nativeRefreshVerificationProfiles.find(
    (p) => p.implementationDigest === candidate.environment.implementationDigest,
  );
  assert.ok(profile, 'explicitly approved C verification evidence requires its release profile');
  for (const [key, value] of Object.entries(candidate.environment))
    assert.equal(profile[key], value);
  assert.equal(profile.workspace, 'REFRESH_VERIFY');
  assert.equal(profile.verificationCorpusRevision, candidate.corpus.revision);
  assert.equal(profile.verificationCorpusDigest, candidate.corpus.digest);
  assert.equal(
    profile.memoryCandidateEvidenceDigest,
    createHash('sha256').update(raw).digest('hex'),
  );
  assert.equal(
    profile.memoryCandidateEvidenceDigest,
    'e21e3284928866f5e1007aa734d08365b60f2fe4ad4310ea8e39421e5bfd3b26',
  );
  assert.equal(profile.memoryPolicyRevision, candidate.policyRevision);
  const m = Math.max(...candidate.groups.map((g) => g.high));
  const j = Math.max(...candidate.groups.map((g) => g.high - g.low));
  assert.equal(m, 352_083_968);
  assert.equal(j, 70_627_328);
  assert.equal(candidate.priorApprovalFloorBytes, null);
  assert.equal(profile.observedPeakBytes, m);
  assert.equal(profile.fluctuationAllowanceBytes, j);
  assert.equal(profile.reservationBytes, m + j);
  assert.equal(profile.reservationBytes, 422_711_296);
  const report = await readFile(new URL('memory-refresh-c-verify-report.json', root));
  assert.equal(profile.evidenceDigest, createHash('sha256').update(report).digest('hex'));
  assert.equal(profile.evidenceDigest, candidate.reports[0].sha256);
  const { buildVerificationCandidate } =
    await import('../../../scripts/native-refresh-verification-memory.mjs');
  const manifestPath = fileURLToPath(new URL('memory-refresh-c-verify-evidence.json', root));
  if (Object.entries(candidate.environment).every(([k, v]) => nativeMetadataEnvironment()[k] === v))
    assert.deepEqual(
      await buildVerificationCandidate(manifestPath, fileURLToPath(root)),
      candidate,
    );
  else
    await assert.rejects(
      buildVerificationCandidate(manifestPath, fileURLToPath(root)),
      /Build environment mismatch/,
    );
  const holdoutRaw = await readFile(new URL('memory-refresh-c-verify-holdout.json', root));
  assert.equal(
    createHash('sha256').update(holdoutRaw).digest('hex'),
    '3d7e701aeeb6a836b034f2f6b62457b417a9eb08652843c25960ee29c5449d23',
  );
  const holdout = JSON.parse(holdoutRaw);
  assert.equal(holdout.candidateSha256, profile.memoryCandidateEvidenceDigest);
  assert.deepEqual(holdout.failures, []);
  assert.equal(holdout.observations.length, 15);
  assert.ok(holdout.observations.every((row) => row.peakResidentBytes <= profile.reservationBytes));
});

test('actual C reservation equality validates; one byte below refuses before lazy preparation', async () => {
  const { nativeRefreshVerificationProfiles } = await import('../dist/native-metadata-profiles.js');
  const environment = nativeMetadataEnvironment();
  const profile = nativeRefreshVerificationProfiles.find((p) =>
    Object.entries(environment).every(([k, v]) => p[k] === v),
  );
  let opened = 0;
  if (!profile) {
    await assert.rejects(
      api.verifyNativeRefreshObservation(Number.MAX_SAFE_INTEGER, () => {
        opened++;
        throw Error('unadmitted');
      }),
      (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
    );
    assert.equal(opened, 0);
    return;
  }
  const { buildRefreshCase, requestBytes, chunkBytes } =
    await import('../../providers/test/helpers/native-refresh-v3-corpus.mjs');
  const { NATIVE_CLIENT_HARD_LIMITS } = await import('../../providers/dist/index.js');
  const c = buildRefreshCase('zero-target');
  c.request.payload.resourceBudget.maxMemoryBytes = profile.reservationBytes;
  const input = {
    requestBytes: requestBytes(c.request, c.baseline),
    lines: chunkBytes(c.eventBytes),
    sink: { async accept() {} },
    limits: NATIVE_CLIENT_HARD_LIMITS,
  };
  await assert.rejects(
    api.verifyNativeRefreshObservation(profile.reservationBytes - 1, () => {
      opened++;
      return input;
    }),
    (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
  );
  assert.equal(opened, 0);
  const result = await api.verifyNativeRefreshObservation(profile.reservationBytes, () => {
    opened++;
    return input;
  });
  assert.equal(opened, 1);
  assert.equal(result.terminal.type, 'REFRESH_COMPLETED');
  for (const offset of [-1, 1]) {
    c.request.payload.resourceBudget.maxMemoryBytes = profile.reservationBytes + offset;
    let iterated = 0,
      accepted = 0;
    await assert.rejects(
      api.verifyNativeRefreshObservation(profile.reservationBytes, () => ({
        requestBytes: requestBytes(c.request, c.baseline),
        lines: {
          [Symbol.asyncIterator]() {
            iterated++;
            throw Error('must not iterate');
          },
        },
        sink: {
          async accept() {
            accepted++;
          },
        },
        limits: NATIVE_CLIENT_HARD_LIMITS,
      })),
      (e) => e.code === 'INVALID_REQUEST',
    );
    assert.equal(iterated, 0);
    assert.equal(accepted, 0);
  }
});
