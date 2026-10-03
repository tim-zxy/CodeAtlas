import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verificationCases } from '../packages/runtime/test/helpers/native-refresh-verification-corpus.mjs';
import { nativeMetadataEnvironment } from '../packages/runtime/dist/native-metadata-admission.js';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const corpus = { revision: 'p05-native-refresh-verification-memory-v1', digest: 'a'.repeat(64) };
const environment = nativeMetadataEnvironment();
const sizes = {
  inputBytes: 10,
  largestLineBytes: 9,
  outputBytes: 10,
  eventCount: 1,
  summaryBytes: 1,
};
const identity = {
  environment,
  corpus,
  inputs: Object.fromEntries(
    verificationCases.map((name) => [
      name,
      { corpusPayloadDigest: sha(name), expectedOutcome: 'REFRESH_COMPLETED', ...sizes },
    ]),
  ),
};
function row(name, repetition, peak = 100 * 1024) {
  return {
    name,
    repetition,
    environment,
    corpus,
    scope: 'OFFLINE_CALIBRATION_ONLY',
    opened: 1,
    ...identity.inputs[name],
    observedOutcome: 'REFRESH_COMPLETED',
    maximumSinkInFlight: 1,
    maximumPendingBytes: 10,
    samples: [
      {
        phase: 'startup',
        memory: { rss: peak, heapTotal: 10, heapUsed: 5, external: 0, arrayBuffers: 0 },
        peakKiB: peak / 1024,
      },
    ],
    peakResidentBytes: peak,
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
  };
}
function report() {
  return structuredClone({
    schemaVersion: 1,
    workspace: 'REFRESH_VERIFY',
    environment,
    corpus,
    observations: verificationCases.flatMap((name) =>
      Array.from({ length: 5 }, (_, i) => row(name, i)),
    ),
    failures: [],
  });
}
async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-verify-evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const save = async (name, value) => {
    const bytes = JSON.stringify(value);
    await writeFile(path.join(root, name), bytes);
    return { path: name, sha256: sha(bytes) };
  };
  const manifest = {
    schemaVersion: 1,
    workspace: 'REFRESH_VERIFY',
    environment,
    corpus,
    reports: [await save('report.json', report())],
    priorApprovals: [],
  };
  await save('manifest.json', manifest);
  return { root, save, manifest, path: path.join(root, 'manifest.json') };
}
async function api() {
  return import('./native-refresh-verification-memory.mjs');
}

test('REFRESH_VERIFY independent high-water arithmetic retains only a real same-purpose floor', async () => {
  const { calculateNativeMemoryReservation } = await import('./native-memory-profile.mjs');
  const groups = [
    { key: 'a', low: 100, high: 120 },
    { key: 'b', low: 130, high: 150 },
  ];
  assert.deepEqual(calculateNativeMemoryReservation(groups), {
    observedPeakBytes: 150,
    fluctuationAllowanceBytes: 20,
    priorApprovalFloorBytes: null,
    reservationBytes: 170,
  });
  assert.equal(calculateNativeMemoryReservation(groups, 200).reservationBytes, 200);
  assert.equal(typeof (await api()).buildVerificationCandidate, 'function');
});
for (const defect of [
  'missing-class',
  'missing-repetition',
  'unknown-purpose',
  'changed-input',
  'changed-worker',
  'changed-build',
  'unknown-field',
  'nonfinite-sample',
])
  test(`verification evidence refuses ${defect}`, async (t) => {
    const s = await setup(t),
      raw = report();
    if (defect === 'missing-class')
      raw.observations = raw.observations.filter((r) => r.name !== verificationCases[0]);
    if (defect === 'missing-repetition') raw.observations.pop();
    if (defect === 'unknown-purpose') raw.workspace = 'FULL_TRANSPORT';
    if (defect === 'changed-input') raw.observations[0].corpusPayloadDigest = 'b'.repeat(64);
    if (defect === 'changed-worker') raw.corpus.digest = 'b'.repeat(64);
    if (defect === 'changed-build')
      raw.environment = { ...environment, implementationDigest: 'b'.repeat(64) };
    if (defect === 'unknown-field') raw.observations[0].ignored = 1;
    if (defect === 'nonfinite-sample') raw.observations[0].samples[0].memory.rss = null;
    s.manifest.reports = [await s.save('report.json', raw)];
    await s.save('manifest.json', s.manifest);
    await assert.rejects(() =>
      (async () => (await api()).buildVerificationCandidate(s.path, s.root, identity))(),
    );
  });
test('verification evidence refuses forged hash and omitted compatible high history including failed artifacts', async (t) => {
  const s = await setup(t),
    { buildVerificationCandidate } = await api();
  s.manifest.reports[0].sha256 = 'b'.repeat(64);
  await s.save('manifest.json', s.manifest);
  await assert.rejects(buildVerificationCandidate(s.path, s.root, identity), /hash/i);
  s.manifest.reports = [await s.save('report.json', report())];
  await s.save('manifest.json', s.manifest);
  const higher = report();
  higher.observations[0] = row(verificationCases[0], 0, 200 * 1024);
  higher.failures.push({ code: 'PROCESS_FAILED', raw: 'retained' });
  await s.save('high-failed.json', higher);
  await assert.rejects(buildVerificationCandidate(s.path, s.root, identity), /Omitted compatible/);
  s.manifest.reports.push(await s.save('high-failed.json', higher));
  await s.save('manifest.json', s.manifest);
  await assert.rejects(buildVerificationCandidate(s.path, s.root, identity), /failure/i);
});
test('verification prior approval cannot borrow a foreign-purpose floor', async (t) => {
  const s = await setup(t),
    { buildVerificationCandidate } = await api();
  const foreign = { workspace: 'FULL_TRANSPORT', environment, corpus, reservationBytes: 999999 };
  const ref = await s.save('foreign.json', foreign);
  s.manifest.priorApprovals.push({
    reservationBytes: 999999,
    candidatePath: ref.path,
    candidateSha256: ref.sha256,
  });
  await s.save('manifest.json', s.manifest);
  await assert.rejects(buildVerificationCandidate(s.path, s.root, identity));
});
test('frozen holdout retains malformed/failed/excess rows without recomputing candidate', async (t) => {
  const s = await setup(t),
    { buildVerificationCandidate, collectVerificationObservations } = await api();
  const candidate = await buildVerificationCandidate(s.path, s.root, identity);
  const ref = await s.save('candidate.json', candidate),
    candidatePath = path.join(s.root, ref.path);
  let calls = 0;
  const collected = await collectVerificationObservations(
    candidatePath,
    path.join(s.root, 'raw'),
    path.join(s.root, 'holdout.json'),
    async (name) => {
      calls++;
      if (name === verificationCases[0])
        return { status: 1, stdout: 'failed raw', stderr: 'retained stderr' };
      if (name === verificationCases[1]) return { status: 0, stdout: '{malformed', stderr: '' };
      return {
        status: 0,
        stdout: JSON.stringify(
          row(name, 0, name === verificationCases[2] ? 200 * 1024 : 100 * 1024),
        ),
        stderr: '',
      };
    },
    identity,
  );
  assert.equal(calls, 15);
  assert.equal(collected.failures.length, 3);
  assert.equal(collected.observations.length, 13, 'valid peak-excess row is retained');
  assert.equal(collected.candidateSha256, ref.sha256);
  assert.equal(sha(await readFile(candidatePath)), ref.sha256);
  assert.match(
    await readFile(path.join(s.root, 'raw', 'zero-target.json'), 'utf8'),
    /retained stderr/,
  );
});
test('foreign frozen candidate refuses before running workers and saves diagnostic artifact', async (t) => {
  const s = await setup(t),
    { buildVerificationCandidate, collectVerificationObservations } = await api();
  const c = await buildVerificationCandidate(s.path, s.root, identity);
  c.reservationBytes++;
  await s.save('candidate.json', c);
  let calls = 0;
  const out = await collectVerificationObservations(
    path.join(s.root, 'candidate.json'),
    path.join(s.root, 'raw'),
    path.join(s.root, 'holdout.json'),
    async () => {
      calls++;
    },
    identity,
  );
  assert.equal(calls, 0);
  assert.equal(out.failures.length, 1);
  assert.ok((await readFile(path.join(s.root, 'holdout.json'))).length);
});
test('holdout cannot overwrite its candidate and retains a candidate-mutation failure', async (t) => {
  const s = await setup(t),
    { buildVerificationCandidate, collectVerificationObservations } = await api();
  const c = await buildVerificationCandidate(s.path, s.root, identity);
  await s.save('candidate.json', c);
  const candidatePath = path.join(s.root, 'candidate.json');
  await assert.rejects(
    collectVerificationObservations(
      candidatePath,
      path.join(s.root, 'raw'),
      candidatePath,
      async () => {
        throw Error('must not run');
      },
      identity,
    ),
    /overwrite/i,
  );
  const out = await collectVerificationObservations(
    candidatePath,
    path.join(s.root, 'raw'),
    path.join(s.root, 'holdout.json'),
    async (name) => {
      if (name === verificationCases.at(-1))
        await s.save('candidate.json', { ...c, reservationBytes: c.reservationBytes + 1 });
      return { status: 0, stdout: JSON.stringify(row(name, 0)), stderr: '' };
    },
    identity,
  );
  assert.ok(out.failures.some((f) => f.code === 'CANDIDATE_CHANGED'));
  assert.ok(
    JSON.parse(await readFile(path.join(s.root, 'holdout.json'))).failures.some(
      (f) => f.code === 'CANDIDATE_CHANGED',
    ),
  );
});
