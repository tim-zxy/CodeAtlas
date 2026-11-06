import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  nativeMetadataEnvironment,
  assertNativeMetadataAdmission,
  assertNativeRefreshVerificationAdmission,
  assertNativeRefreshTransportAdmission,
} from '../dist/native-metadata-admission.js';
import {
  nativeMetadataProfiles,
  nativeRefreshVerificationProfiles,
  nativeRefreshTransportProfiles,
} from '../dist/native-metadata-profiles.js';

// Independent approved values and raw byte pins; no locally ignored inputs or processes.
const expected = {
  metadata: {
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
    corpusDigest: '0c599e6626202fe4a0b5d5866e2d89d01a4674e40b0efe0d0b20acf5b4085b29',
    reservationBytes: 226656256,
    evidenceDigest: 'd29793756dbefdf563e69aa7054dac7c3aacb35fa2a993acece25cef289f87c9',
    fullTransportCorpusRevision: 'p05-native-full-v3-memory-v1',
    fullTransportCorpusDigest: '11cc2f5492f3429f3081fa8278852d947635a8d778471d293f3ce103785fd8ef',
    fullTransportEvidenceDigest: '28e456adfede6d8d9094495e269af7a22316d278f92b04a253b5118e9fa2e515',
    fullTransportPeakBytes: 167899136,
    memoryCandidateEvidenceDigest:
      'bf55069efc3b459a8b2eac5cb30e51eed60a764326264d66f1179e421522552f',
    observedPeakBytes: 217964544,
    fluctuationAllowanceBytes: 8691712,
  },
  verification: {
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
    workspace: 'REFRESH_VERIFY',
    verificationCorpusRevision: 'p05-native-refresh-verification-memory-v1',
    verificationCorpusDigest: '1969707b181cf5bbd2fd753d489c4ff3a39333f4d8166b43c13a62ec40dad232',
    reservationBytes: 407248896,
    evidenceDigest: '116d839659bea9be80f32d5999cc56cc574a131485187860fdd0824c805741ed',
    memoryCandidateEvidenceDigest:
      '6dd8f8de50d1a683bb087c0eee244788fc5104d4c4082a84578991a03d491aa9',
    observedPeakBytes: 345808896,
    fluctuationAllowanceBytes: 61440000,
  },
  transport: {
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
    transportCorpusDigest: '9e9b7136852eba80d40bfda8b0fb2a4f57f4e21ef34da2fc5bf0e572811c6dde',
    reservationBytes: 399069184,
    evidenceDigest: '2f294b30a3ef0d4fcbf0678a7b26272842b7cd5073677ed82f97d6841928173e',
    memoryCandidateEvidenceDigest:
      '2c3c890d439c45f8a67d5ba864727ae9a995f02039fb312c021931f6f0c020a7',
    observedPeakBytes: 364560384,
    fluctuationAllowanceBytes: 34508800,
  },
};
const pins = {
  paired: {
    'read-seal.json': 'd29793756dbefdf563e69aa7054dac7c3aacb35fa2a993acece25cef289f87c9',
    'full-transport.json': '28e456adfede6d8d9094495e269af7a22316d278f92b04a253b5118e9fa2e515',
    'manifest.json': '7947728668757a7bbefef7cbe98a6847921740e629e69611a84905644201b526',
    'candidate.json': 'bf55069efc3b459a8b2eac5cb30e51eed60a764326264d66f1179e421522552f',
    'holdout.json': 'fa910ba980e5cea5ed8a6d1a9241d13c7ac8e2a2f3fd9c1882349598949affea',
  },
  verification: {
    'raw.json': '116d839659bea9be80f32d5999cc56cc574a131485187860fdd0824c805741ed',
    'manifest.json': '4e50bee01f8f1b51e3cd234d0543bb05e2aa46066ef228827c7ca3e380a6b166',
    'candidate.json': '6dd8f8de50d1a683bb087c0eee244788fc5104d4c4082a84578991a03d491aa9',
    'holdout.json': 'adb033c7372cada25bfeaf4ac3a3b5d664824d0da8d5821f7bca23dd3271cfe8',
  },
  transport: {
    'raw.json': '2f294b30a3ef0d4fcbf0678a7b26272842b7cd5073677ed82f97d6841928173e',
    'evidence-manifest.json': '256f4963c2c8e8e99ed006e36ff6eca8d833ab6037d5dee9bcbd229f6d6ffed9',
    'candidate.json': '2c3c890d439c45f8a67d5ba864727ae9a995f02039fb312c021931f6f0c020a7',
    'holdout.json': '1ad0abe4dd9c67a8712816a092838dd796d6d0266cfa2b7f94f8a1c5b6b0553f',
  },
};
const environment = Object.fromEntries(
  ['node', 'v8', 'platform', 'arch', 'zodVersion', 'implementationDigest', 'corpusRevision'].map(
    (key) => [key, expected.metadata[key]],
  ),
);
const matches = (value) =>
  Object.entries(environment).every(([key, entry]) => value[key] === entry);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const [group, entry, catalog, count] of [
  ['paired', expected.metadata, nativeMetadataProfiles, 27],
  ['verification', expected.verification, nativeRefreshVerificationProfiles, 15],
  ['transport', expected.transport, nativeRefreshTransportProfiles, 22],
])
  test('approved R5 ' + group + ' profile retains exact portable evidence', () => {
    const data = {};
    for (const [name, digest] of Object.entries(pins[group])) {
      const bytes = readFileSync(
        new URL(
          '../../../fixtures/storage/native-analysis-state/phase1-r5/' + group + '/' + name,
          import.meta.url,
        ),
      );
      assert.equal(sha(bytes), digest, group + '/' + name);
      data[name] = JSON.parse(bytes);
    }
    const selected = catalog.filter(
      (profile) =>
        matches(profile) &&
        profile.memoryCandidateEvidenceDigest === entry.memoryCandidateEvidenceDigest,
    );
    assert.equal(selected.length, 1, 'approved R5 entry missing or duplicated');
    assert.deepEqual(selected[0], entry);
    const candidate = data['candidate.json'];
    assert.equal(pins[group]['candidate.json'], entry.memoryCandidateEvidenceDigest);
    assert.equal(
      pins[group][group === 'paired' ? 'read-seal.json' : 'raw.json'],
      entry.evidenceDigest,
    );
    assert.equal(candidate.reservationBytes, entry.reservationBytes);
    assert.equal(
      candidate.observedPeakBytes + candidate.fluctuationAllowanceBytes,
      entry.reservationBytes,
    );
    assert.equal(candidate.priorApprovalFloorBytes, null);
    assert.deepEqual(candidate.environment, environment);
    const holdout = data['holdout.json'];
    assert.equal(
      holdout.candidateSha256 ?? holdout.candidateEvidenceDigest,
      entry.memoryCandidateEvidenceDigest,
    );
    assert.deepEqual(holdout.failures, []);
    assert.equal(holdout.observations.length, count);
    for (const row of holdout.observations)
      assert.ok((row.observation ?? row).peakResidentBytes <= entry.reservationBytes);
    if (group === 'paired') {
      assert.equal(pins[group]['full-transport.json'], entry.fullTransportEvidenceDigest);
      assert.equal(pins[group]['manifest.json'], candidate.manifestDigest);
    } else assert.equal(pins[group][candidate.manifest.path], candidate.manifest.sha256);
  });
for (const [purpose, entry, admit] of [
  ['READ_SEAL', expected.metadata, (n) => assertNativeMetadataAdmission(n, 'READ_SEAL')],
  ['FULL_TRANSPORT', expected.metadata, (n) => assertNativeMetadataAdmission(n, 'FULL_TRANSPORT')],
  ['REFRESH_VERIFY', expected.verification, assertNativeRefreshVerificationAdmission],
  ['REFRESH_TRANSPORT', expected.transport, assertNativeRefreshTransportAdmission],
])
  test(
    purpose === 'REFRESH_TRANSPORT'
      ? 'historical approved R5 transport budgets are refused by its R7 successor'
      : 'approved R5 ' + purpose + ' admits equality and refuses one byte less',
    () => {
      if (matches(nativeMetadataEnvironment())) {
        if (purpose === 'REFRESH_TRANSPORT') {
          assert.throws(
            () => admit(entry.reservationBytes),
            (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
          );
        } else assert.doesNotThrow(() => admit(entry.reservationBytes));
        assert.throws(
          () => admit(entry.reservationBytes - 1),
          (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
        );
      }
    },
  );
