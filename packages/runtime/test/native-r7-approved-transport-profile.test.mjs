import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import {
  nativeMetadataEnvironment,
  assertNativeRefreshTransportAdmission,
} from '../dist/native-metadata-admission.js';
import { nativeRefreshTransportProfiles } from '../dist/native-metadata-profiles.js';

const approved = {
  node: 'v24.15.0',
  v8: '13.6.233.17-node.48',
  platform: 'win32',
  arch: 'x64',
  zodVersion: '4.6.1',
  implementationDigest: '726ffb9793680e58698fcd3fb3f4d0698228df0fab89217ef04a6846bc6fa013',
  corpusRevision: 'p05-native-metadata-memory-v1',
  memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
  peakMethod: 'resourceUsage.maxRSS',
  peakUnits: 'bytes',
  workspace: 'REFRESH_TRANSPORT',
  transportCorpusRevision: 'p05-native-refresh-transport-memory-v1',
  transportCorpusDigest: '276fcb50d5cf8e123fe758b35b618846d0227f0baaa31f089bcf8e23160f47e0',
  reservationBytes: 410738688,
  evidenceDigest: 'a41b35271e63b1c02b65c159bbd4b1fd50382aa5bf17f48fd93e3548eb14f5bd',
  memoryCandidateEvidenceDigest: 'ee73f0af8073c9000db131d55c8b20fc25c438146f87bdd3bdd12ac646f2c921',
  observedPeakBytes: 366956544,
  fluctuationAllowanceBytes: 43782144,
};
const pins = {
  'raw.json': 'a41b35271e63b1c02b65c159bbd4b1fd50382aa5bf17f48fd93e3548eb14f5bd',
  'evidence-manifest.json': 'a0e4de99a76409ebd2c60f18ecfca84c22b4135125ccf67f512d5bde66635000',
  'candidate.json': 'ee73f0af8073c9000db131d55c8b20fc25c438146f87bdd3bdd12ac646f2c921',
  'holdout.json': '573c0fd3625e6fb2717203ccca32c190614065160cfe62856bc74da2ad5dc192',
};

const environment = Object.fromEntries(
  ['node', 'v8', 'platform', 'arch', 'zodVersion', 'implementationDigest', 'corpusRevision'].map(
    (key) => [key, approved[key]],
  ),
);
const matches = (value) =>
  Object.entries(environment).every(([key, entry]) => value[key] === entry);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('approved R7 transport profile is exact and selected before retained R5 history', () => {
  const selected = nativeRefreshTransportProfiles.filter(
    (profile) => profile.memoryCandidateEvidenceDigest === approved.memoryCandidateEvidenceDigest,
  );
  assert.equal(selected.length, 1);
  assert.deepEqual(selected[0], approved);
  assert.deepEqual(nativeRefreshTransportProfiles.find(matches), approved);
  assert.ok(
    nativeRefreshTransportProfiles.some(
      (profile) =>
        profile.memoryCandidateEvidenceDigest ===
          '2c3c890d439c45f8a67d5ba864727ae9a995f02039fb312c021931f6f0c020a7' &&
        profile.reservationBytes === 399069184,
    ),
  );
});

test('approved R7 transport retains original portable evidence and independent holdout', () => {
  const data = {};
  for (const [name, digest] of Object.entries(pins)) {
    const bytes = gunzipSync(
      readFileSync(
        new URL(
          '../../../fixtures/storage/native-analysis-state/phase1-r7/transport/' + name + '.gz',
          import.meta.url,
        ),
      ),
    );
    assert.equal(sha(bytes), digest);
    data[name] = JSON.parse(bytes);
  }
  const candidate = data['candidate.json'];
  assert.deepEqual(candidate.environment, environment);
  assert.equal(candidate.corpus.digest, approved.transportCorpusDigest);
  assert.equal(candidate.reservationBytes, approved.reservationBytes);
  assert.equal(candidate.observedPeakBytes, approved.observedPeakBytes);
  assert.equal(candidate.fluctuationAllowanceBytes, approved.fluctuationAllowanceBytes);
  assert.equal(
    candidate.observedPeakBytes + candidate.fluctuationAllowanceBytes,
    approved.reservationBytes,
  );
  assert.equal(candidate.manifest.sha256, pins['evidence-manifest.json']);
  assert.equal(candidate.reports[0].sha256, pins['raw.json']);
  assert.equal(pins['candidate.json'], approved.memoryCandidateEvidenceDigest);
  assert.equal(pins['raw.json'], approved.evidenceDigest);
  assert.equal(data['raw.json'].observations.length, 110);
  assert.deepEqual(data['raw.json'].failures, []);
  const holdout = data['holdout.json'];
  assert.equal(holdout.candidateSha256, approved.memoryCandidateEvidenceDigest);
  assert.deepEqual(holdout.failures, []);
  assert.equal(holdout.observations.length, 22);
  for (const row of holdout.observations) {
    assert.ok(row.peakResidentBytes <= approved.reservationBytes);
    assert.equal(row.observedOutcome, row.expectedOutcome);
    assert.equal(row.persistentStateVerified, true);
    assert.equal(row.tempClosed, true);
    assert.equal(row.transactionClosed, true);
  }
});

test('approved R7 transport admits its exact boundary and refuses one byte less and old R5 budget', () => {
  if (!matches(nativeMetadataEnvironment())) return;
  assert.equal(assertNativeRefreshTransportAdmission(410738688), 410738688);
  assert.equal(assertNativeRefreshTransportAdmission(1000000000), 410738688);
  for (const budget of [410738687, 399069184]) {
    assert.throws(
      () => assertNativeRefreshTransportAdmission(budget),
      (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
    );
  }
});
