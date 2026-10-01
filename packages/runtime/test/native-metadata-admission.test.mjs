import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { RepositoryAnalysisStage } from '../../storage/dist/index.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as runtime from '../dist/index.js';
import { buildMemoryCase, corpusExpected } from './helpers/native-metadata-corpus.mjs';
import { nativeMetadataEnvironment } from '../dist/native-metadata-admission.js';
import { nativeMetadataProfiles } from '../dist/native-metadata-profiles.js';

const reviewedReservation = 250_855_424;
const environment = nativeMetadataEnvironment();
const supported = nativeMetadataProfiles.some((profile) =>
  Object.entries(environment).every(([key, value]) => profile[key] === value),
);

async function isolatedFactory(t, variant) {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-metadata-admission-'));
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
  if (variant === 'uncalibrated')
    await writeFile(
      join(root, 'dist', 'native-metadata-profiles.js'),
      'export const nativeMetadataProfiles = Object.freeze([]);\n',
    );
  if (variant === 'changed')
    await writeFile(join(root, 'dist', 'calibration-change.js'), 'export const changed = true;\n');
  return (
    await import(pathToFileURL(join(root, 'dist', 'native-analysis-validation.js')).href)
  ).createNativeStateValidationPort();
}

test('uncalibrated Runtime refuses before Provider decoding or iterator access', async (t) => {
  assert.equal(typeof runtime.createNativeStateValidationPort, 'function');
  let calls = 0;
  const input = {
    headerJson: '{',
    expected: {},
    maxSerializedBytes: 1_000_000,
    memoryBudgetBytes: Number.MAX_SAFE_INTEGER,
    files: {
      [Symbol.iterator]() {
        calls++;
        throw Error('must not decode');
      },
    },
  };
  const port = await isolatedFactory(t, 'uncalibrated');
  assert.throws(
    () => port(input),
    (error) =>
      error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED' && /profile/i.test(error.message),
  );
  assert.equal(calls, 0);
});

test('reviewed matching Runtime admits at reservation and still validates strict metadata', () => {
  if (
    environment.node === 'v24.15.0' &&
    environment.v8 === '13.6.233.17-node.48' &&
    environment.platform === 'win32' &&
    environment.arch === 'x64' &&
    environment.zodVersion === '4.6.1' &&
    environment.implementationDigest ===
      '44471febb9b41c2c73ddd30f065f216ba016d74e7179821d7dadf8c1c09a73ee'
  )
    assert.equal(supported, true, 'reviewed current build must exercise production admission');
  const value = buildMemoryCase('zero-file');
  const input = {
    headerJson: JSON.stringify(value.header),
    files: [],
    expected: corpusExpected,
    maxSerializedBytes: 1_000_000,
    memoryBudgetBytes: reviewedReservation,
  };
  const port = runtime.createNativeStateValidationPort();
  if (!supported) {
    assert.throws(
      () => port(input),
      (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
    );
    return;
  }
  assert.equal(
    port(input).summaryDigest,
    '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  );
  assert.throws(
    () => port({ ...input, headerJson: '{' }),
    (e) => e.nativeStateReason === 'INVALID',
  );
});

test('one byte below reviewed reservation refuses before Provider iterator access', () => {
  let calls = 0;
  assert.throws(
    () =>
      runtime.createNativeStateValidationPort()({
        headerJson: '{',
        expected: {},
        maxSerializedBytes: 1_000_000,
        memoryBudgetBytes: reviewedReservation - 1,
        files: {
          [Symbol.iterator]() {
            calls++;
            throw Error('must not decode');
          },
        },
      }),
    (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
  );
  assert.equal(calls, 0);
});

test('production full-stage seal applies reviewed reservation after retained SQL charge', async () => {
  const value = buildMemoryCase('empty-file');
  const headerJson = JSON.stringify(value.header);
  const limits = { maxSerializedBytes: 1_000_000, memoryBudgetBytes: Number.MAX_SAFE_INTEGER };
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryAnalysisStage(db, limits);
  try {
    await stage.accept({ type: 'SOURCE_FILE', payload: value.summaries[0].sourceFile });
    await stage.accept({ type: 'COVERAGE', payload: value.summaries[0].coverage[0] });
    await stage.acceptNativeSummary(value.summaries[0]);
    stage.confirmSucceeded({
      type: 'ANALYSIS_COMPLETED',
      payload: {
        outcome: 'SUCCEEDED',
        repositoryId: 'repo',
        revisionId: 'worktree',
        revisionFingerprint: 'fp',
        providerSnapshotId: 'snapshot',
        capabilities: [],
        counts: { sourceFiles: 1, nodes: 0, edges: 0, coverage: 1, diagnostics: 0 },
      },
    });
    const summary = value.summaries[0];
    const strings = [
      headerJson,
      JSON.stringify(summary),
      summary.sourceFile.id,
      summary.sourceFile.path,
      summary.sourceFile.contentFingerprint,
      JSON.stringify(summary.sourceFile),
      JSON.stringify(summary.coverage[0]),
    ].reduce((n, text) => n + Buffer.byteLength(text), 0);
    const budget = { ...limits, memoryBudgetBytes: reviewedReservation + 2 * strings };
    const port = runtime.createNativeStateValidationPort();
    assert.throws(
      () =>
        stage.sealNativeState(headerJson, corpusExpected, port, {
          ...budget,
          memoryBudgetBytes: budget.memoryBudgetBytes - 1,
        }),
      (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
    );
    if (supported) {
      const sealed = stage.sealNativeState(headerJson, corpusExpected, port, budget);
      assert.equal(sealed.files.length, 1);
      assert.equal(Object.isFrozen(sealed.files[0]), true);
      await assert.rejects(stage.acceptNativeSummary(summary), /sealed/i);
    } else
      assert.throws(
        () => stage.sealNativeState(headerJson, corpusExpected, port, budget),
        (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
      );
    assert.equal(db.isTransaction, false);
  } finally {
    stage.close();
    db.close();
  }
});

test('changed built implementation invalidates reviewed profile before decoding', async (t) => {
  const port = await isolatedFactory(t, 'changed');
  let calls = 0;
  assert.throws(
    () =>
      port({
        headerJson: '{',
        expected: {},
        maxSerializedBytes: 1_000_000,
        memoryBudgetBytes: Number.MAX_SAFE_INTEGER,
        files: {
          [Symbol.iterator]() {
            calls++;
            throw Error('must not decode');
          },
        },
      }),
    (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED' && /profile/i.test(e.message),
  );
  assert.equal(calls, 0);
});

test('metadata implementation identity is deterministic and environment-specific', async () => {
  const module = await import('../dist/native-metadata-admission.js');
  assert.equal(typeof module.nativeMetadataEnvironment, 'function');
  const identity = module.nativeMetadataEnvironment();
  assert.deepEqual(module.nativeMetadataEnvironment(), identity);
  assert.equal(identity.node, process.version);
  assert.equal(identity.v8, process.versions.v8);
  assert.equal(identity.platform, process.platform);
  assert.equal(identity.arch, process.arch);
  assert.match(identity.implementationDigest, /^[a-f0-9]{64}$/);
  assert.match(identity.zodVersion, /^\d+\.\d+\.\d+/);
});

test('reviewed profile is backed by unchanged raw evidence and calibration corpus', async () => {
  const raw = await readFile(
    new URL(
      '../../../fixtures/storage/native-analysis-state/memory-baseline-task3.json',
      import.meta.url,
    ),
  );
  const report = JSON.parse(raw);
  const { nativeMetadataProfiles } = await import('../dist/native-metadata-profiles.js');
  const profile = nativeMetadataProfiles.find(
    (p) => p.implementationDigest === report.environment.implementationDigest,
  );
  assert.ok(profile, 'reviewed evidence must have a corresponding release profile');
  assert.equal(createHash('sha256').update(raw).digest('hex'), profile.evidenceDigest);
  const corpus = createHash('sha256');
  for (const path of [
    './helpers/native-metadata-corpus.mjs',
    './helpers/native-metadata-worker.mjs',
    '../../../scripts/bench-native-metadata-memory.mjs',
  ])
    corpus.update(await readFile(new URL(path, import.meta.url)));
  assert.equal(corpus.digest('hex'), profile.corpusDigest);
  assert.equal(report.observations.length, 65);
  assert.equal(report.repetitions, 5);
  assert.equal(
    Math.max(...report.observations.map((o) => o.peakResidentBytes)),
    profile.reservationBytes,
  );
  assert.equal(profile.reservationBytes, reviewedReservation);
  for (const name of report.cases)
    assert.equal(report.observations.filter((o) => o.name === name).length, 5);
});
