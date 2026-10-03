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
import {
  assertNativeMetadataAdmission,
  nativeMetadataEnvironment,
} from '../dist/native-metadata-admission.js';
import { nativeMetadataProfiles } from '../dist/native-metadata-profiles.js';

const reviewedReservation = 280_453_120;
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
  if (variant === 'read-only-profile') {
    const profile = {
      ...nativeMetadataProfiles.find((profile) => !profile.fullTransportCorpusRevision),
      ...nativeMetadataEnvironment(),
    };
    await writeFile(
      join(root, 'dist', 'native-metadata-profiles.js'),
      'export const nativeMetadataProfiles = Object.freeze([' + JSON.stringify(profile) + ']);\n',
    );
    return import(pathToFileURL(join(root, 'dist', 'native-metadata-admission.js')).href);
  }
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
      '86fa33c51ecf63383f3575877bedaf66c47661dee5222ea4e14e8a0dd74e5888'
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

test('a read-seal profile cannot admit unreviewed full transport workspace', async (t) => {
  const module = await isolatedFactory(t, 'read-only-profile');
  module.assertNativeMetadataAdmission(Number.MAX_SAFE_INTEGER);
  assert.throws(
    () => module.assertNativeMetadataAdmission(Number.MAX_SAFE_INTEGER, 'FULL_TRANSPORT'),
    (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
  );
});

test('reviewed full transport admits only at its matching reservation', () => {
  if (!supported) {
    assert.throws(
      () => assertNativeMetadataAdmission(Number.MAX_SAFE_INTEGER, 'FULL_TRANSPORT'),
      (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
    );
    return;
  }
  assertNativeMetadataAdmission(reviewedReservation, 'FULL_TRANSPORT');
  assert.throws(
    () => assertNativeMetadataAdmission(reviewedReservation - 1, 'FULL_TRANSPORT'),
    (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
  );
});

test('reviewed profile is backed by unchanged raw evidence and calibration corpus', async () => {
  const raw = await readFile(
    new URL(
      '../../../fixtures/storage/native-analysis-state/memory-stability-read-seal.json',
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
  assert.equal(Math.max(...report.observations.map((o) => o.peakResidentBytes)), 211_857_408);
  assert.ok(profile.reservationBytes >= report.reservationBytes);
  assert.equal(profile.reservationBytes, reviewedReservation);
  for (const name of report.cases)
    assert.equal(report.observations.filter((o) => o.name === name).length, 5);
});

test('reviewed transport evidence covers every actual workspace class', async () => {
  const raw = await readFile(
    new URL(
      '../../../fixtures/storage/native-analysis-state/memory-stability-transport.json',
      import.meta.url,
    ),
  );
  const report = JSON.parse(raw);
  const profile = nativeMetadataProfiles.find(
    (p) => p.implementationDigest === report.environment.implementationDigest,
  );
  assert.ok(profile, 'reviewed transport evidence requires a matching profile');
  assert.equal(createHash('sha256').update(raw).digest('hex'), profile.fullTransportEvidenceDigest);
  const corpus = createHash('sha256');
  for (const path of [
    '../../../scripts/bench-native-full-v3-memory.mjs',
    '../../providers/test/helpers/native-full-v3-memory-worker.mjs',
    '../../providers/test/helpers/native-full-v3-memory-corpus.mjs',
    '../../providers/test/fixtures/native-full-v3-memory-child.mjs',
    './helpers/native-metadata-corpus.mjs',
  ])
    corpus.update(await readFile(new URL(path, import.meta.url)));
  assert.equal(corpus.digest('hex'), profile.fullTransportCorpusDigest);
  assert.equal(report.corpusRevision, profile.fullTransportCorpusRevision);
  assert.equal(report.observations.length, 70);
  assert.equal(report.repetitions, 5);
  assert.equal(profile.fullTransportPeakBytes, 166_449_152);
  assert.equal(Math.max(...report.observations.map((o) => o.peakResidentBytes)), 166_449_152);
  assert.ok(profile.reservationBytes >= profile.fullTransportPeakBytes);
  for (const name of report.cases)
    assert.equal(report.observations.filter((o) => o.name === name).length, 5);
});

test('approved stability profile reproduces frozen policy and independent holdout', async () => {
  const root = new URL('../../../fixtures/storage/native-analysis-state/', import.meta.url);
  const raw = await readFile(new URL('memory-stability-candidate.json', root));
  const candidate = JSON.parse(raw);
  const profile = nativeMetadataProfiles.find(
    (p) => p.implementationDigest === candidate.environment.implementationDigest,
  );
  assert.ok(profile, 'approved candidate requires an actual release profile');
  assert.equal(profile.memoryPolicyRevision, 'p05-native-memory-high-water-range-v1');
  assert.equal(
    profile.memoryCandidateEvidenceDigest,
    createHash('sha256').update(raw).digest('hex'),
  );
  assert.equal(
    profile.memoryCandidateEvidenceDigest,
    '02071679da6cd7d6ff1ce11dab4eae347e8404f8820052079ce52a49f3ab748d',
  );
  const m = Math.max(...candidate.groups.map((group) => group.high));
  const j = Math.max(...candidate.groups.map((group) => group.high - group.low));
  assert.equal(m, 245_719_040);
  assert.equal(j, 34_734_080);
  assert.equal(profile.observedPeakBytes, m);
  assert.equal(profile.fluctuationAllowanceBytes, j);
  assert.equal(profile.reservationBytes, Math.max(m + j, candidate.priorApprovalFloorBytes));
  assert.equal(profile.reservationBytes, reviewedReservation);
  for (const [key, value] of Object.entries(candidate.environment))
    assert.equal(profile[key], value);
  const { loadNativeMemoryCandidate } = await import('../../../scripts/native-memory-profile.mjs');
  assert.deepEqual(
    (await loadNativeMemoryCandidate(new URL('memory-stability-candidate.json', root))).candidate,
    candidate,
  );
  const holdoutRaw = await readFile(new URL('memory-stability-holdout.json', root));
  assert.equal(
    createHash('sha256').update(holdoutRaw).digest('hex'),
    'b16157cfc64b6323fed57dd5c973c02bb3603d9244f9eb5fe988c849eaedfad7',
  );
  const holdout = JSON.parse(holdoutRaw);
  assert.deepEqual(holdout.environment, candidate.environment);
  assert.equal(holdout.candidateEvidenceDigest, profile.memoryCandidateEvidenceDigest);
  assert.deepEqual(holdout.failures, []);
  assert.equal(holdout.observations.length, 27);
  assert.ok(
    holdout.observations.every(
      (row) => row.observation.peakResidentBytes <= profile.reservationBytes,
    ),
  );
});
