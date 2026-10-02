import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm, cp, mkdir, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildNativeMemoryCandidate } from './native-memory-profile.mjs';
import * as gate from './native-memory-gate.mjs';
const api = await import('./native-memory-observations.mjs').catch(() => ({}));
const sha = (value) => createHash('sha256').update(value).digest('hex');
async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-memory-collection-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const reports = [],
    corpora = {},
    requiredCases = {},
    rows = {};
  let environment;
  for (const [workspace, name] of [
    ['READ_SEAL', 'read-seal'],
    ['FULL_TRANSPORT', 'transport'],
  ]) {
    const bytes = await readFile(
      new URL(
        `../fixtures/storage/native-analysis-state/memory-baseline-review-fix-${name}.json`,
        import.meta.url,
      ),
    );
    const report = JSON.parse(bytes);
    environment = report.environment;
    corpora[workspace] = { revision: report.corpusRevision, digest: report.corpusDigest };
    requiredCases[workspace] = report.cases;
    rows[workspace] = Object.fromEntries(
      report.cases.map((name) => [name, report.observations.find((o) => o.name === name)]),
    );
    await writeFile(path.join(directory, name + '.json'), bytes);
    reports.push({
      path: name + '.json',
      sha256: sha(bytes),
      workspace,
      purpose: 'calibration',
      command: 'fixture',
      collectionConditions: 'test',
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
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
  const candidate = await buildNativeMemoryCandidate(
    path.join(directory, 'manifest.json'),
    directory,
  );
  const candidatePath = path.join(directory, 'candidate.json');
  await writeFile(candidatePath, JSON.stringify(candidate));
  const outputDirectory = path.join(directory, 'observations');
  const runWorker = async (workspace, name) => ({
    exitCode: 0,
    stdout: JSON.stringify(rows[workspace][name]),
    stderr: '',
  });
  return { directory, candidate, candidatePath, outputDirectory, runWorker, rows };
}
test('collector preserves complete observations on equality and all required cases', async (t) => {
  const f = await setup(t);
  const result = await api.collectNativeMemoryObservations(
    { mode: 'candidate', candidatePath: f.candidatePath, outputDirectory: f.outputDirectory },
    async (w, n) => {
      const row = structuredClone(f.rows[w][n]);
      row.peakResidentBytes = f.candidate.reservationBytes;
      return { exitCode: 0, stdout: JSON.stringify(row), stderr: '' };
    },
  );
  assert.equal(result?.passed, true);
  assert.equal(result.observations.length, 27);
  const raw = JSON.parse(await readFile(path.join(f.outputDirectory, 'observations.json')));
  assert.equal(raw.purpose, 'verification');
  assert.equal(raw.observations.length, 27);
  assert.equal(raw.failures.length, 0);
});
test('frozen candidate excess retains observation and cannot become success', async (t) => {
  const f = await setup(t);
  const before = await readFile(f.candidatePath);
  const result = await api.collectNativeMemoryObservations(
    { mode: 'candidate', candidatePath: f.candidatePath, outputDirectory: f.outputDirectory },
    async (w, n) => {
      const row = structuredClone(f.rows[w][n]);
      row.peakResidentBytes = f.candidate.reservationBytes + 1;
      return { exitCode: 0, stdout: JSON.stringify(row), stderr: '' };
    },
  );
  assert.equal(result?.passed, false);
  assert.equal(result.failures.length, 27);
  const raw = JSON.parse(await readFile(path.join(f.outputDirectory, 'observations.json')));
  assert.equal(raw.observations[0].observation.peakResidentBytes, f.candidate.reservationBytes + 1);
  assert.deepEqual(await readFile(f.candidatePath), before);
});
test('missing required approved profile fails and retains valid raw rows', async (t) => {
  const f = await setup(t);
  // An empty isolated profile proves refusal independently of future approvals.
  const isolated = path.join(f.directory, 'isolated');
  await cp(new URL('./', import.meta.url), path.join(isolated, 'scripts'), { recursive: true });
  const runtime = path.join(isolated, 'packages', 'runtime');
  await mkdir(runtime, { recursive: true });
  await cp(new URL('../packages/runtime/dist', import.meta.url), path.join(runtime, 'dist'), {
    recursive: true,
  });
  await cp(
    new URL('../packages/runtime/package.json', import.meta.url),
    path.join(runtime, 'package.json'),
  );
  await symlink(
    fileURLToPath(new URL('../packages/runtime/test', import.meta.url)),
    path.join(runtime, 'test'),
    'junction',
  );
  for (const name of ['providers', 'storage'])
    await symlink(
      fileURLToPath(new URL(`../packages/${name}`, import.meta.url)),
      path.join(isolated, 'packages', name),
      'junction',
    );
  await writeFile(
    path.join(runtime, 'dist', 'native-metadata-profiles.js'),
    'export const nativeMetadataProfiles = Object.freeze([]);\n',
  );
  const isolatedApi = await import(
    pathToFileURL(path.join(isolated, 'scripts', 'native-memory-observations.mjs')).href
  );
  const result = await isolatedApi.collectNativeMemoryObservations(
    { mode: 'approved', outputDirectory: f.outputDirectory },
    f.runWorker,
  );
  assert.equal(result?.passed, false);
  assert.equal(result.observations.length, 27);
  assert.ok(result.failures.some((f) => f.code === 'RESERVATION_REFUSED'));
});
for (const [name, child] of [
  ['invalid JSON', { exitCode: 0, stdout: 'not-json SECRET', stderr: 'SECRET' }],
  ['nonzero exit', { exitCode: 1, stdout: 'SECRET', stderr: 'SECRET' }],
])
  test(`collector records ${name} failure without dumping arbitrary child content`, async (t) => {
    const f = await setup(t);
    const result = await api.collectNativeMemoryObservations(
      { mode: 'candidate', candidatePath: f.candidatePath, outputDirectory: f.outputDirectory },
      async () => child,
    );
    assert.equal(result?.passed, false);
    assert.equal(result.failures.length, 27);
    const raw = await readFile(path.join(f.outputDirectory, 'observations.json'), 'utf8');
    assert.equal(raw.includes('SECRET'), false);
  });
test('unknown worker JSON fields cannot leak into artifacts', async (t) => {
  const f = await setup(t);
  const result = await api.collectNativeMemoryObservations(
    { mode: 'candidate', candidatePath: f.candidatePath, outputDirectory: f.outputDirectory },
    async (w, n) => ({
      exitCode: 0,
      stdout: JSON.stringify({ ...f.rows[w][n], secretMarker: 'SECRET' }),
      stderr: '',
    }),
  );
  assert.equal(result.passed, false);
  assert.equal(
    (await readFile(path.join(f.outputDirectory, 'observations.json'), 'utf8')).includes('SECRET'),
    false,
  );
});
test('collector refuses a valid observation for the wrong requested class', async (t) => {
  const f = await setup(t);
  const result = await api.collectNativeMemoryObservations(
    { mode: 'candidate', candidatePath: f.candidatePath, outputDirectory: f.outputDirectory },
    async (workspace) => ({
      exitCode: 0,
      stdout: JSON.stringify(f.rows[workspace]['zero-file']),
      stderr: '',
    }),
  );
  assert.equal(result.passed, false);
  assert.equal(result.observations.length, 2);
  assert.equal(result.failures.length, 25);
});
test('CLI candidate failure exits nonzero while keeping failure artifact', async (t) => {
  const f = await setup(t);
  const child = spawnSync(
    process.execPath,
    [
      'scripts/native-memory-observations.mjs',
      'candidate',
      f.outputDirectory,
      path.join(f.directory, 'missing.json'),
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  assert.equal(child.status, 1);
  assert.equal(
    JSON.parse(await readFile(path.join(f.outputDirectory, 'observations.json'))).failures[0].code,
    'CANDIDATE_INVALID',
  );
});
test('corpus observation is persisted before unchanged gate rejects a peak', async (t) => {
  const f = await setup(t),
    previous = process.env.CODEATLAS_NATIVE_MEMORY_ARTIFACT_DIR;
  process.env.CODEATLAS_NATIVE_MEMORY_ARTIFACT_DIR = f.outputDirectory;
  try {
    gate.recordNativeMemoryObservation('READ_SEAL', f.rows.READ_SEAL['zero-file']);
    assert.throws(() => gate.checkNativeMemoryObservation(f.rows.READ_SEAL['zero-file'], [], true));
    const rows = JSON.parse(
      await readFile(path.join(f.outputDirectory, `READ_SEAL-${process.pid}.json`)),
    );
    assert.equal(rows[0].name, 'zero-file');
  } finally {
    if (previous === undefined) delete process.env.CODEATLAS_NATIVE_MEMORY_ARTIFACT_DIR;
    else process.env.CODEATLAS_NATIVE_MEMORY_ARTIFACT_DIR = previous;
  }
});
