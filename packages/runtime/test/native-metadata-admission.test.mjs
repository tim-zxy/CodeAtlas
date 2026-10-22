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
  assertNativeRefreshTransportAdmission,
  nativeMetadataEnvironment,
} from '../dist/native-metadata-admission.js';
import {
  nativeMetadataProfiles,
  nativeRefreshTransportProfiles,
} from '../dist/native-metadata-profiles.js';
import { preparedEmptyRefresh } from './helpers/native-refresh-d-fixture.mjs';
import './native-r3-approved-profiles.test.mjs';
import './native-r4-approved-profiles.test.mjs';

const reviewedReservation = 280_453_120;
const environment = nativeMetadataEnvironment();
const supported = nativeMetadataProfiles.some((profile) =>
  Object.entries(environment).every(([key, value]) => profile[key] === value),
);
const activeReservation =
  nativeMetadataProfiles.find((profile) =>
    Object.entries(environment).every(([key, value]) => profile[key] === value),
  )?.reservationBytes ?? reviewedReservation;

test('approved R2 exact-layout D reservation admits at equality and refuses one byte below', () => {
  const expectedEnvironment = {
    node: 'v24.15.0',
    v8: '13.6.233.17-node.48',
    platform: 'win32',
    arch: 'x64',
    zodVersion: '4.6.1',
    implementationDigest: '0ea17dfcc71d7c2d3ffb1bc782ab47c63f6c2294041dc50e0a14e1362242711d',
    corpusRevision: 'p05-native-metadata-memory-v1',
  };
  if (Object.entries(expectedEnvironment).every(([key, value]) => environment[key] === value)) {
    assert.equal(assertNativeRefreshTransportAdmission(411_660_288), 411_660_288);
    assert.equal(assertNativeRefreshTransportAdmission(1_000_000_000), 411_660_288);
    assert.throws(
      () => assertNativeRefreshTransportAdmission(411_660_287),
      (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
    );
  }
  assert.deepEqual(
    nativeRefreshTransportProfiles.find(
      (profile) =>
        profile.memoryCandidateEvidenceDigest ===
        'f9e08bade29fd6e28212751b279e86f49df959389db50af58f04958c41ed0844',
    ),
    {
      ...expectedEnvironment,
      workspace: 'REFRESH_TRANSPORT',
      transportCorpusRevision: 'p05-native-refresh-transport-memory-v1',
      transportCorpusDigest: 'b36cb7a45338f641874b4868c4bf6c5b9693de467ce861a0fbb3cccdfd8bee3f',
      reservationBytes: 411_660_288,
      evidenceDigest: 'ad2f319f01ad8f0ce8c1cab9ecef4b44789d9fdcee6cf17fdbdca6108ce4f960',
      memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
      memoryCandidateEvidenceDigest:
        'f9e08bade29fd6e28212751b279e86f49df959389db50af58f04958c41ed0844',
      observedPeakBytes: 364_818_432,
      fluctuationAllowanceBytes: 46_841_856,
      peakMethod: 'resourceUsage.maxRSS',
      peakUnits: 'bytes',
    },
  );
  assert.ok(
    nativeRefreshTransportProfiles.some(
      (profile) =>
        profile.memoryCandidateEvidenceDigest ===
          '91a9e2477f490b93ce76f5d5bb6b5becdc41b976282e511ad73db30ca128aa25' &&
        profile.transportCorpusDigest ===
          '1aa37f7ac114baa2e0262af19205d9b05c2fdb63ed8794432da9b38fa6dedcb2' &&
        profile.reservationBytes === 376_422_400,
    ),
    'Historical v1 exact-layout approval remains bound to its original corpus',
  );
  assert.ok(
    nativeRefreshTransportProfiles.some(
      (profile) =>
        profile.memoryCandidateEvidenceDigest ===
          'f52395c5c5a7a7a61ce8d3cc2910ee0f0b43f72f891987129811e8e97a3a8553' &&
        profile.reservationBytes === 378_400_768,
    ),
    'Historical evidence remains bound to its original profile',
  );
});

for (const [prefix, candidateHash, holdoutHash, peak, allowance, reservation] of [
  [
    'memory-refresh-c',
    '9a19027b465309abf6ca1992c8fbdf07bc2a83f8dc9689b4a78994c025fbfdb0',
    '0c8211ac1d657cecf4e06adf3add5197e55c47c0f1c8ecb82dd0dfff02e3b1fe',
    249_556_992,
    37_203_968,
    286_760_960,
  ],
  [
    'memory-refresh-c-review',
    '571b7ccc760d3a60a89da7156aaded26a2130daf11f8bd6d65517f14d902a986',
    'a93b0ff1ada2bd3f134a9079808f6f76b73d4bd99013707a7bbdb260981c9164',
    247_963_648,
    35_360_768,
    283_324_416,
  ],
])
  test(`approved C paired profile ${prefix} reproduces frozen evidence for both original purposes`, async () => {
    const root = new URL('../../../fixtures/storage/native-analysis-state/', import.meta.url);
    const raw = await readFile(new URL(`${prefix}-candidate.json`, root));
    const candidate = JSON.parse(raw);
    const profile = nativeMetadataProfiles.find(
      (p) => p.implementationDigest === candidate.environment.implementationDigest,
    );
    assert.ok(profile, 'approved paired candidate requires an actual release profile');
    const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha(raw), candidateHash);
    assert.equal(profile.memoryCandidateEvidenceDigest, sha(raw));
    for (const [key, value] of Object.entries(candidate.environment))
      assert.equal(profile[key], value);
    const { loadNativeMemoryCandidate } =
      await import('../../../scripts/native-memory-profile.mjs');
    assert.deepEqual(
      (await loadNativeMemoryCandidate(new URL(`${prefix}-candidate.json`, root))).candidate,
      candidate,
    );
    const m = Math.max(...candidate.groups.map((g) => g.high));
    const j = Math.max(...candidate.groups.map((g) => g.high - g.low));
    assert.equal(m, peak);
    assert.equal(j, allowance);
    assert.equal(candidate.priorApprovalFloorBytes, null);
    assert.equal(profile.observedPeakBytes, m);
    assert.equal(profile.fluctuationAllowanceBytes, j);
    assert.equal(profile.reservationBytes, m + j);
    assert.equal(profile.reservationBytes, reservation);
    assert.equal(profile.memoryPolicyRevision, candidate.policyRevision);
    const read = await readFile(new URL(`${prefix}-read-seal.json`, root));
    const transport = await readFile(new URL(`${prefix}-transport.json`, root));
    assert.equal(profile.evidenceDigest, sha(read));
    assert.equal(profile.fullTransportEvidenceDigest, sha(transport));
    assert.equal(profile.corpusDigest, candidate.corpora.READ_SEAL.digest);
    assert.equal(profile.fullTransportCorpusRevision, candidate.corpora.FULL_TRANSPORT.revision);
    assert.equal(profile.fullTransportCorpusDigest, candidate.corpora.FULL_TRANSPORT.digest);
    assert.equal(
      profile.fullTransportPeakBytes,
      Math.max(...JSON.parse(transport).observations.map((o) => o.peakResidentBytes)),
    );
    assert.equal(JSON.parse(read).observations.length, 65);
    assert.equal(JSON.parse(transport).observations.length, 70);
    const holdoutRaw = await readFile(new URL(`${prefix}-holdout.json`, root));
    assert.equal(sha(holdoutRaw), holdoutHash);
    const holdout = JSON.parse(holdoutRaw);
    assert.deepEqual(holdout.environment, candidate.environment);
    assert.equal(holdout.candidateEvidenceDigest, profile.memoryCandidateEvidenceDigest);
    assert.deepEqual(holdout.failures, []);
    assert.equal(holdout.observations.length, 27);
    assert.ok(
      holdout.observations.every(
        (r) => r.observation.peakResidentBytes <= profile.reservationBytes,
      ),
    );
  });

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
      'export const nativeMetadataProfiles = Object.freeze([]);\nexport const nativeRefreshVerificationProfiles = Object.freeze([]);\nexport const nativeRefreshTransportProfiles = Object.freeze([]);\n',
    );
  if (variant === 'changed')
    await writeFile(join(root, 'dist', 'calibration-change.js'), 'export const changed = true;\n');
  if (variant === 'refresh-reservation') {
    // Synthetic isolated-module component contract only, not calibration or a
    // profile installed into the product. No source/evidence files are replaced.
    const profile = {
      ...nativeMetadataEnvironment(),
      workspace: 'REFRESH_TRANSPORT',
      transportCorpusRevision: 'p05-native-refresh-transport-memory-v1',
      transportCorpusDigest: 'a'.repeat(64),
      evidenceDigest: 'b'.repeat(64),
      memoryCandidateEvidenceDigest: 'c'.repeat(64),
      memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
      peakMethod: 'resourceUsage.maxRSS',
      peakUnits: 'bytes',
      observedPeakBytes: 1,
      fluctuationAllowanceBytes: 0,
      reservationBytes: 1_000_000_000,
    };
    await writeFile(
      join(root, 'dist', 'native-metadata-profiles.js'),
      'export const nativeMetadataProfiles = Object.freeze([]);\n' +
        'export const nativeRefreshVerificationProfiles = Object.freeze([]);\n' +
        'export const nativeRefreshTransportProfiles = Object.freeze([' +
        JSON.stringify(profile) +
        ']);\n',
    );
    return {
      admission: await import(
        pathToFileURL(join(root, 'dist', 'native-metadata-admission.js')).href
      ),
      preparation: await import(
        pathToFileURL(join(root, 'dist', 'native-refresh-preparation.js')).href
      ),
    };
  }
  if (variant === 'read-only-profile') {
    const profile = {
      ...nativeMetadataProfiles.find((profile) => !profile.fullTransportCorpusRevision),
      ...nativeMetadataEnvironment(),
    };
    await writeFile(
      join(root, 'dist', 'native-metadata-profiles.js'),
      'export const nativeRefreshTransportProfiles = Object.freeze([]);\nexport const nativeRefreshVerificationProfiles = Object.freeze([]);\nexport const nativeMetadataProfiles = Object.freeze([' +
        JSON.stringify(profile) +
        ']);\n',
    );
    return import(pathToFileURL(join(root, 'dist', 'native-metadata-admission.js')).href);
  }
  return (
    await import(pathToFileURL(join(root, 'dist', 'native-analysis-validation.js')).href)
  ).createNativeStateValidationPort();
}

test('D5 guarded preparation carries its matched reservation into numeric SQL preflight', async (t) => {
  const f = await preparedEmptyRefresh(t);
  const { admission, preparation } = await isolatedFactory(t, 'refresh-reservation');
  assert.equal(admission.assertNativeRefreshTransportAdmission(f.budget), f.budget);
  const queries = [],
    original = f.db.prepare.bind(f.db);
  f.db.prepare = (sql) => {
    queries.push(sql);
    return original(sql);
  };
  let opened = 0;
  assert.throws(
    () =>
      preparation.prepareNativeRefreshAnalysisV3(
        f.db,
        f.budget,
        () => {
          opened++;
          return f.invocation;
        },
        f.options,
      ),
    (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
  );
  assert.equal(opened, 1);
  assert.ok(queries.some((sql) => /AS BLOB/i.test(sql)));
  assert.equal(
    queries.some((sql) => /^SELECT \* FROM source_files/i.test(sql)),
    false,
  );
  assert.equal(f.db.isTransaction, false);
});

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
    memoryBudgetBytes: activeReservation,
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
        memoryBudgetBytes: activeReservation - 1,
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
    const budget = { ...limits, memoryBudgetBytes: activeReservation + 2 * strings };
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
  assertNativeMetadataAdmission(activeReservation, 'FULL_TRANSPORT');
  assert.throws(
    () => assertNativeMetadataAdmission(activeReservation - 1, 'FULL_TRANSPORT'),
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
