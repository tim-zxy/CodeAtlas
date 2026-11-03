import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as api from '../dist/index.js';
const candidate = JSON.parse(
  await readFile(
    new URL(
      '../../../fixtures/phase1/syntax-admission-contract/inputs/candidate.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function seal(p) {
  p.evidence.calibrationOriginDigest = sha(p.evidence.reports);
  p.evidence.derivationDigest = sha({
    policyRevision: p.policyRevision,
    environment: p.environment,
    corpus: p.corpus,
    observations: p.observations,
    components: p.components,
    reservationBytes: p.reservationBytes,
    calibrationOriginDigest: p.evidence.calibrationOriginDigest,
  });
  return p;
}
const fresh = () => seal(structuredClone(candidate));
const parse = (v) => {
  assert.equal(typeof api.parseSyntaxObservationProfile, 'function');
  return api.parseSyntaxObservationProfile(v);
};
const bad = (v) =>
  assert.throws(
    () => parse(seal(v)),
    (e) => e.code === 'INVALID_SYNTAX_PROFILE',
  );
function approved() {
  const p = fresh();
  p.status = 'APPROVED';
  p.evidence.review = { decision: 'APPROVED', ref: 'human:unit-only', digest: '8'.repeat(64) };
  p.evidence.verificationRefs = [{ path: 'raw/verification.json', sha256: '9'.repeat(64) }];
  return p;
}
test('synthetic literal high-water/range components sum to420 without installation', () => {
  const p = parse(fresh());
  assert.equal(p.components.HOST.reservationBytes, 140);
  assert.equal(p.components.NATIVE.reservationBytes, 280);
  assert.equal(p.reservationBytes, 420);
  assert.ok(Object.isFrozen(p.components));
  const input = fresh();
  const owned = parse(input);
  input.reservationBytes = 1;
  assert.equal(owned.reservationBytes, 420);
});
for (const [name, mutate] of [
  ['unknown root', (p) => (p.bypass = true)],
  ['old purpose', (p) => (p.purpose = 'FULL_TRANSPORT')],
  ['unknown environment', (p) => (p.environment.fake = 1)],
  ['wrong grammar', (p) => (p.environment.pythonGrammarVersion = 'other')],
  ['sum mismatch', (p) => (p.reservationBytes = 419)],
  ['component formula', (p) => (p.components.HOST.reservationBytes = 139)],
  ['missing repetition', (p) => p.observations.pop()],
  ['duplicate repetition', (p) => (p.observations[1].repetition = 1)],
  ['foreign case', (p) => (p.observations[0].caseId = 'other')],
  ['incomplete lifetime', (p) => (p.observations[0].completeLifetime = false)],
  ['zero peak', (p) => (p.observations[0].peakBytes = 0)],
  ['peak units', (p) => (p.observations[0].peakUnits = 'KiB')],
  ['native sampled metric', (p) => (p.observations[5].peakMethod = 'WorkingSet64')],
  ['negative duration', (p) => (p.observations[0].finishedEpochMs = 999)],
  ['wrong expected output', (p) => (p.observations[0].expectedMatched = false)],
  ['failed terminal', (p) => (p.observations[0].terminal = 'SYNTAX_FAILED')],
  ['unknown observation key', (p) => (p.observations[0].rawSource = 'secret')],
  ['unsafe reservation', (p) => (p.reservationBytes = Number.MAX_SAFE_INTEGER + 1)],
  ['old floor transplant', (p) => (p.components.HOST.priorApprovalFloorBytes = 280453120)],
  ['traversal report', (p) => (p.evidence.reports[0].path = '../outside')],
  ['missing approval', (p) => (p.status = 'APPROVED')],
  ['candidate with review', (p) => (p.evidence.review.decision = 'APPROVED')],
])
  test('strict profile refuses ' + name, () => {
    const p = fresh();
    mutate(p);
    bad(p);
  });
test('safe component values cannot overflow the combined reservation', () => {
  const p = fresh();
  for (const kind of ['HOST', 'NATIVE']) {
    for (const o of p.observations.filter((o) => o.component === kind))
      o.peakBytes = Number.MAX_SAFE_INTEGER;
    p.components[kind].observedPeakBytes = Number.MAX_SAFE_INTEGER;
    p.components[kind].fluctuationAllowanceBytes = 0;
    p.components[kind].reservationBytes = Number.MAX_SAFE_INTEGER;
  }
  p.reservationBytes = Number.MAX_SAFE_INTEGER;
  bad(p);
});
test('pure matcher needs approved exact identity/corpus and equality budget', () => {
  assert.equal(typeof api.matchSyntaxObservationProfile, 'function');
  const p = approved();
  assert.equal(api.matchSyntaxObservationProfile(p, p.environment, p.corpus, 420), 420);
  for (const [profile, environment, corpus, budget] of [
    [fresh(), p.environment, p.corpus, 420],
    [p, { ...p.environment, nativeBinaryDigest: 'a'.repeat(64) }, p.corpus, 420],
    [p, p.environment, { ...p.corpus, oracleDigest: 'a'.repeat(64) }, 420],
    [p, p.environment, p.corpus, 419],
  ])
    assert.throws(
      () => api.matchSyntaxObservationProfile(profile, environment, corpus, budget),
      (e) => e.code === 'SYNTAX_PROFILE_NOT_ADMISSIBLE',
    );
});
test('plain data guard never invokes accessors or accepts mutable foreign objects', () => {
  let reads = 0;
  const p = fresh();
  Object.defineProperty(p, 'status', {
    get() {
      reads++;
      return 'APPROVED';
    },
    enumerable: true,
  });
  bad(p);
  assert.equal(reads, 0);
  const cyclic = fresh();
  cyclic.self = cyclic;
  bad(cyclic);
});
const limits = { maxInputBytes: 100000, maxReportBytes: 100000, maxReports: 4 };
async function files(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-syntax-profile-unit-'));
  t.after(async () => {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(tmpdir()) + path.sep));
    assert.ok(path.basename(resolved).startsWith('codeatlas-syntax-profile-unit-'));
    await rm(resolved, { recursive: true, force: true });
  });
  await mkdir(path.join(root, 'raw'));
  const p = approved();
  const calibration = {
    schemaVersion: 1,
    purpose: 'SYNTAX_OBSERVATION_CALIBRATION',
    environment: p.environment,
    corpus: p.corpus,
    observations: p.observations,
  };
  const cal = Buffer.from(JSON.stringify(calibration));
  await writeFile(path.join(root, 'raw/calibration.json'), cal);
  p.evidence.reports[0].sha256 = createHash('sha256').update(cal).digest('hex');
  seal(p);
  const verification = {
    schemaVersion: 1,
    purpose: 'SYNTAX_OBSERVATION_VERIFICATION',
    calibrationOriginDigest: p.evidence.calibrationOriginDigest,
    environment: p.environment,
    corpus: p.corpus,
    observations: [
      {
        caseId: 'holdout:static',
        expectedMatched: true,
        terminal: 'SYNTAX_COMPLETED',
        sourceDigest: 'a'.repeat(64),
        oracleDigest: 'b'.repeat(64),
        outputDigest: 'c'.repeat(64),
        peakTranscriptDigest: 'd'.repeat(64),
        components: {
          HOST: {
            peakBytes: 130,
            peakMethod: 'resourceUsage.maxRSS',
            peakUnits: 'bytes',
            completeLifetime: true,
            processId: 301,
            startedEpochMs: 3000,
            finishedEpochMs: 4000,
          },
          NATIVE: {
            peakBytes: 260,
            peakMethod: 'PROCESS_MEMORY_COUNTERS.PeakWorkingSetSize',
            peakUnits: 'bytes',
            completeLifetime: true,
            processId: 302,
            startedEpochMs: 3000,
            finishedEpochMs: 4000,
          },
        },
      },
    ],
  };
  const ver = Buffer.from(JSON.stringify(verification));
  await writeFile(path.join(root, 'raw/verification.json'), ver);
  p.evidence.verificationRefs[0].sha256 = createHash('sha256').update(ver).digest('hex');
  seal(p);
  await writeFile(path.join(root, 'profile.json'), JSON.stringify(p));
  return { root, p };
}
test('bounded file loader verifies raw evidence hashes before returning owned data', async (t) => {
  assert.equal(typeof api.loadSyntaxObservationProfile, 'function');
  const { root } = await files(t);
  const p = await api.loadSyntaxObservationProfile(path.join(root, 'profile.json'), limits);
  assert.equal(p.reservationBytes, 420);
  await writeFile(path.join(root, 'raw/calibration.json'), 'changed');
  await assert.rejects(
    () => api.loadSyntaxObservationProfile(path.join(root, 'profile.json'), limits),
    (e) => e.code === 'INVALID_SYNTAX_PROFILE',
  );
});
test('bounded loader refuses missing evidence, input and raw report byte limits', async (t) => {
  assert.equal(typeof api.loadSyntaxObservationProfile, 'function');
  const { root } = await files(t);
  for (const l of [
    { ...limits, maxInputBytes: 1 },
    { ...limits, maxReportBytes: 1 },
    { ...limits, maxReports: 1 },
  ])
    await assert.rejects(
      () => api.loadSyntaxObservationProfile(path.join(root, 'profile.json'), l),
      (e) => e.code === 'INVALID_SYNTAX_PROFILE',
    );
  await rm(path.join(root, 'raw/verification.json'));
  await assert.rejects(
    () => api.loadSyntaxObservationProfile(path.join(root, 'profile.json'), limits),
    (e) => e.code === 'INVALID_SYNTAX_PROFILE',
  );
});

test('origin and derivation digests cannot be unrelated-looking hex tokens', () => {
  for (const field of ['derivationDigest', 'calibrationOriginDigest']) {
    const p = fresh();
    p.evidence[field] = '0'.repeat(64);
    assert.throws(
      () => parse(p),
      (e) => e.code === 'INVALID_SYNTAX_PROFILE',
    );
  }
});
test('linked raw directory is refused without following the target', async (t) => {
  assert.equal(typeof api.loadSyntaxObservationProfile, 'function');
  const { root } = await files(t);
  const { rename, symlink } = await import('node:fs/promises');
  await rename(path.join(root, 'raw'), path.join(root, 'saved-raw'));
  await symlink(
    path.join(root, 'saved-raw'),
    path.join(root, 'raw'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(
    () => api.loadSyntaxObservationProfile(path.join(root, 'profile.json'), limits),
    (e) => e.code === 'INVALID_SYNTAX_PROFILE',
  );
});

for (const [name, file, mutate] of [
  [
    'foreign calibration environment',
    'calibration.json',
    (r) => (r.environment.nativeBinaryDigest = '0'.repeat(64)),
  ],
  ['raw observations disagree', 'calibration.json', (r) => r.observations.pop()],
  [
    'unrelated verification origin',
    'verification.json',
    (r) => (r.calibrationOriginDigest = '0'.repeat(64)),
  ],
  ['empty verification', 'verification.json', (r) => (r.observations = [])],
  ['failed verification', 'verification.json', (r) => (r.observations[0].expectedMatched = false)],
])
  test('hash-repaired ' + name + ' is refused semantically', async (t) => {
    const { root, p } = await files(t);
    const rawPath = path.join(root, 'raw', file),
      body = JSON.parse(await readFile(rawPath, 'utf8'));
    mutate(body);
    const b = Buffer.from(JSON.stringify(body));
    await writeFile(rawPath, b);
    const refs = file.startsWith('calibration') ? p.evidence.reports : p.evidence.verificationRefs;
    refs[0].sha256 = createHash('sha256').update(b).digest('hex');
    seal(p);
    await writeFile(path.join(root, 'profile.json'), JSON.stringify(p));
    await assert.rejects(
      () => api.loadSyntaxObservationProfile(path.join(root, 'profile.json'), limits),
      (e) => e.code === 'INVALID_SYNTAX_PROFILE',
    );
  });

test('literal candidate JSON is valid without helper repairs', () =>
  assert.equal(parse(candidate).reservationBytes, 420));

test('verification must carry HOST and NATIVE measured peak components', async (t) => {
  const { root, p } = await files(t);
  const file = path.join(root, 'raw/verification.json'),
    r = JSON.parse(await readFile(file, 'utf8'));
  delete r.observations[0].components;
  const b = Buffer.from(JSON.stringify(r));
  await writeFile(file, b);
  p.evidence.verificationRefs[0].sha256 = createHash('sha256').update(b).digest('hex');
  seal(p);
  await writeFile(path.join(root, 'profile.json'), JSON.stringify(p));
  await assert.rejects(
    () => api.loadSyntaxObservationProfile(path.join(root, 'profile.json'), limits),
    (e) => e.code === 'INVALID_SYNTAX_PROFILE',
  );
});

for (const kind of ['HOST', 'NATIVE'])
  test('holdout ' + kind + ' peak cannot exceed its frozen reservation', async (t) => {
    const { root, p } = await files(t);
    const file = path.join(root, 'raw/verification.json'),
      r = JSON.parse(await readFile(file, 'utf8'));
    r.observations[0].components[kind].peakBytes = p.components[kind].reservationBytes + 1;
    const b = Buffer.from(JSON.stringify(r));
    await writeFile(file, b);
    p.evidence.verificationRefs[0].sha256 = createHash('sha256').update(b).digest('hex');
    seal(p);
    await writeFile(path.join(root, 'profile.json'), JSON.stringify(p));
    await assert.rejects(
      () => api.loadSyntaxObservationProfile(path.join(root, 'profile.json'), limits),
      (e) => e.code === 'INVALID_SYNTAX_PROFILE',
    );
  });
