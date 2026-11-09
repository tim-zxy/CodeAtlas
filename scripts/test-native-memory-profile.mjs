import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const api = await import('./native-memory-profile.mjs').catch(() => ({}));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('preserves high water and one measured range across separate workspace groups', () => {
  assert.equal(typeof api.calculateNativeMemoryReservation, 'function');
  assert.deepEqual(
    api.calculateNativeMemoryReservation([
      { key: 'READ_SEAL:a:x', low: 80, high: 100 },
      { key: 'FULL_TRANSPORT:a:y', low: 130, high: 150 },
    ]),
    {
      observedPeakBytes: 150,
      fluctuationAllowanceBytes: 20,
      priorApprovalFloorBytes: null,
      reservationBytes: 170,
    },
  );
});
test('keeps prior approval floor including a withdrawn approval', () => {
  assert.equal(
    api.calculateNativeMemoryReservation([{ key: 'x', low: 80, high: 100 }], 200).reservationBytes,
    200,
  );
});
for (const groups of [
  [],
  [{ key: 'x', low: 0, high: 1 }],
  [{ key: 'x', low: 2, high: 1 }],
  [{ key: 'x', low: 1, high: 1.5 }],
  [{ key: 'x', low: 1, high: Number.MAX_SAFE_INTEGER }],
])
  test(`rejects invalid or overflowing groups ${JSON.stringify(groups)}`, () =>
    assert.throws(() => api.calculateNativeMemoryReservation(groups)));

async function fixture(t, diagnostic = false) {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-memory-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const reports = [];
  let environment,
    corpora = {},
    requiredCases = {};
  for (const [workspace, name, base, low] of [
    ['READ_SEAL', 'read-seal', 100, 80],
    ['FULL_TRANSPORT', 'transport', 150, 130],
  ]) {
    const r = JSON.parse(
      await readFile(
        new URL(
          `../fixtures/storage/native-analysis-state/memory-baseline-review-fix-${name}.json`,
          import.meta.url,
        ),
      ),
    );
    r.observations.forEach((o, i) => (o.peakResidentBytes = i % 2 ? low : base));
    r.reservationBytes = base;
    environment = r.environment;
    corpora[workspace] = { revision: r.corpusRevision, digest: r.corpusDigest };
    requiredCases[workspace] = r.cases;
    const bytes = JSON.stringify(r) + '\n';
    await writeFile(path.join(root, name + '.json'), bytes);
    reports.push({
      path: name + '.json',
      sha256: sha(bytes),
      workspace,
      purpose: 'calibration',
      command: 'fixture',
      collectionConditions: 'synthetic isolated test',
    });
  }
  if (diagnostic) {
    const rows = JSON.parse(
      await readFile(
        new URL(
          '../fixtures/storage/native-analysis-state/memory-review-fix-dense-repeat.json',
          import.meta.url,
        ),
      ),
    );
    rows.forEach((o) => (o.peakResidentBytes = 200));
    const bytes = JSON.stringify(rows) + '\n';
    await writeFile(path.join(root, 'diagnostic.json'), bytes);
    reports.push({
      path: 'diagnostic.json',
      sha256: sha(bytes),
      workspace: 'READ_SEAL',
      purpose: 'diagnostic',
      command: 'fixture',
      collectionConditions: 'synthetic',
      caseName: 'dense-numeric-sites',
      corpusPayloadDigest: rows[0].corpusPayloadDigest,
      parentCalibrationSha256: reports[0].sha256,
    });
  }
  const manifest = {
    schemaVersion: 1,
    policyRevision: 'p05-native-memory-high-water-range-v1',
    environment,
    corpora,
    requiredCases,
    reports,
    priorApprovals: [],
  };
  const manifestPath = path.join(root, 'manifest.json');
  async function save() {
    await writeFile(manifestPath, JSON.stringify(manifest) + '\n');
  }
  async function changeReport(index, change) {
    const entry = manifest.reports[index];
    const r = JSON.parse(await readFile(path.join(root, entry.path)));
    change(r);
    const bytes = JSON.stringify(r) + '\n';
    await writeFile(path.join(root, entry.path), bytes);
    entry.sha256 = sha(bytes);
    await save();
  }
  await save();
  return { root, manifest, manifestPath, save, changeReport };
}
test('candidate validates complete file provenance and emits reproducible CLI report', async (t) => {
  const f = await fixture(t);
  const r = await api.buildNativeMemoryCandidate(f.manifestPath, f.root);
  assert.equal(r?.reservationBytes, 170);
  assert.equal(r.groups.length, 27);
  assert.equal(r.status, 'PROVISIONAL_REVIEW_REQUIRED');
  assert.deepEqual(await api.buildNativeMemoryCandidate(f.manifestPath, f.root), r);
  const child = spawnSync(
    process.execPath,
    ['scripts/native-memory-profile.mjs', 'candidate', f.manifestPath, f.root],
    { encoding: 'utf8', windowsHide: true },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), r);
});
test('earlier diagnostic high remains in comparable history', async (t) => {
  const f = await fixture(t, true);
  const r = await api.buildNativeMemoryCandidate(f.manifestPath, f.root);
  assert.equal(r?.observedPeakBytes, 200);
  assert.equal(r.fluctuationAllowanceBytes, 120);
  assert.equal(r.reservationBytes, 320);
});
const mutations = {
  'raw hash mismatch': (f) => {
    f.manifest.reports[0].sha256 = '0'.repeat(64);
  },
  'duplicate report': (f) => {
    f.manifest.reports.push(f.manifest.reports[0]);
  },
  'omitted compatible diagnostic high': (f) => {
    f.manifest.reports.pop();
  },
  'unknown manifest field': (f) => {
    f.manifest.unreviewedOverride = true;
  },
  'traversal escape': (f) => {
    f.manifest.reports[0].path = '../outside.json';
  },
  'missing report': (f) => {
    f.manifest.reports[0].path = 'absent.json';
  },
  'omitted required class': (f) => {
    f.manifest.requiredCases.READ_SEAL.pop();
  },
  'missing diagnostic parent': (f) => {
    delete f.manifest.reports[2].parentCalibrationSha256;
  },
  'wrong diagnostic payload': (f) => {
    f.manifest.reports[2].corpusPayloadDigest = '0'.repeat(64);
  },
  'incompatible approval floor': (f) => {
    f.manifest.priorApprovals.push({
      environment: { ...f.manifest.environment, platform: 'other' },
      reservationBytes: 200,
      status: 'approved',
      approvalReference: 'human-reviewed fixture',
    });
  },
};
for (const [name, mutate] of Object.entries(mutations))
  test(`rejects ${name}`, async (t) => {
    const f = await fixture(t, true);
    mutate(f);
    await f.save();
    await assert.rejects(() => api.buildNativeMemoryCandidate(f.manifestPath, f.root));
  });
for (const [name, mutate] of [
  ['wrong environment', (r) => (r.observations[0].environment.platform = 'other')],
  ['invalid units', (r) => (r.observations[0].peakUnits = 'KiB')],
  ['incorrect outcome', (r) => (r.observations[0].readOutcome = 'WRONG')],
  ['missing repetition', (r) => r.observations.pop()],
  [
    'changing input within calibration case',
    (r) => {
      r.observations[0].corpusPayloadDigest = '0'.repeat(64);
    },
  ],
])
  test(`rejects ${name}`, async (t) => {
    const f = await fixture(t);
    await f.changeReport(0, mutate);
    await assert.rejects(() => api.buildNativeMemoryCandidate(f.manifestPath, f.root));
  });
test('symlink report outside fixture root refuses', async (t) => {
  const f = await fixture(t),
    outside = await mkdtemp(path.join(tmpdir(), 'codeatlas-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, 'data.json'), '{}');
  await symlink(outside, path.join(f.root, 'link'), 'junction');
  f.manifest.reports[0].path = 'link/data.json';
  await f.save();
  await assert.rejects(() => api.buildNativeMemoryCandidate(f.manifestPath, f.root));
});
test('omitted history cannot evade identity matching by reordering keys', async (t) => {
  const f = await fixture(t, true);
  const file = path.join(f.root, 'diagnostic.json');
  const rows = JSON.parse(await readFile(file));
  for (const row of rows)
    row.environment = Object.fromEntries(Object.entries(row.environment).reverse());
  await writeFile(file, JSON.stringify(rows));
  f.manifest.reports.pop();
  await f.save();
  await assert.rejects(() => api.buildNativeMemoryCandidate(f.manifestPath, f.root));
});
test('pinned stability candidate and independent holdout retain complete provenance', async () => {
  const root = new URL('../fixtures/storage/native-analysis-state/', import.meta.url);
  const candidatePath = new URL('memory-stability-candidate.json', root);
  const { candidate, digest } = await api.loadNativeMemoryCandidate(candidatePath);
  const holdout = JSON.parse(await readFile(new URL('memory-stability-holdout.json', root)));
  assert.equal(holdout.schemaVersion, 1);
  assert.equal(holdout.purpose, 'verification');
  assert.equal(holdout.mode, 'candidate');
  assert.deepEqual(holdout.environment, candidate.environment);
  assert.deepEqual(holdout.corpora, candidate.corpora);
  assert.equal(holdout.candidateEvidenceDigest, digest);
  assert.deepEqual(holdout.failures, []);
  const expected = Object.entries(api.requiredMemoryCases)
    .flatMap(([workspace, names]) => names.map((name) => `${workspace}:${name}`))
    .sort();
  assert.deepEqual(
    holdout.observations
      .map(({ workspace, observation }) => `${workspace}:${observation.name}`)
      .sort(),
    expected,
  );
  for (const { workspace, observation } of holdout.observations) {
    api.validateNativeMemoryObservation(observation, workspace, candidate.environment);
    assert.ok(observation.peakResidentBytes <= candidate.reservationBytes);
    if (workspace === 'READ_SEAL')
      assert.ok(
        candidate.groups.some(
          (group) =>
            group.workspace === workspace &&
            group.caseName === observation.name &&
            group.inputIdentity === observation.corpusPayloadDigest,
        ),
      );
  }
  const m = Math.max(...candidate.groups.map((group) => group.high));
  const j = Math.max(...candidate.groups.map((group) => group.high - group.low));
  assert.equal(candidate.observedPeakBytes, m);
  assert.equal(candidate.fluctuationAllowanceBytes, j);
  assert.equal(candidate.reservationBytes, Math.max(m + j, candidate.priorApprovalFloorBytes));
});
