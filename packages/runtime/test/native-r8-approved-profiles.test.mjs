import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
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

// Exact user-approved R8 values and original-byte pins; never execute the evidence.
const expected = {
  metadata: {
    node: 'v24.15.0',
    v8: '13.6.233.17-node.48',
    platform: 'win32',
    arch: 'x64',
    zodVersion: '4.6.1',
    implementationDigest: '1cbaef7ba843af6419a39af6dd3dfe0a7241c92851ff70d6ce77213819714bcf',
    corpusRevision: 'p05-native-metadata-memory-v1',
    memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    corpusDigest: '0c599e6626202fe4a0b5d5866e2d89d01a4674e40b0efe0d0b20acf5b4085b29',
    reservationBytes: 225218560,
    evidenceDigest: '548a17f3e5328079511528abcdcb300798a132e7d04abcf3c67c325da1d60a54',
    fullTransportCorpusRevision: 'p05-native-full-v3-memory-v1',
    fullTransportCorpusDigest: '11cc2f5492f3429f3081fa8278852d947635a8d778471d293f3ce103785fd8ef',
    fullTransportEvidenceDigest: '0dd3dcb842c63ce1dc366e2c439589a6b31014204892f6ab20606caf1e02bf0d',
    fullTransportPeakBytes: 168312832,
    memoryCandidateEvidenceDigest:
      '71dd2af1a942e26f759f942749b8682c9bf001582e7624a2e2c742fd3e6767ed',
    observedPeakBytes: 217829376,
    fluctuationAllowanceBytes: 7389184,
  },
  verification: {
    node: 'v24.15.0',
    v8: '13.6.233.17-node.48',
    platform: 'win32',
    arch: 'x64',
    zodVersion: '4.6.1',
    implementationDigest: '1cbaef7ba843af6419a39af6dd3dfe0a7241c92851ff70d6ce77213819714bcf',
    corpusRevision: 'p05-native-metadata-memory-v1',
    memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    workspace: 'REFRESH_VERIFY',
    verificationCorpusRevision: 'p05-native-refresh-verification-memory-v1',
    verificationCorpusDigest: '1969707b181cf5bbd2fd753d489c4ff3a39333f4d8166b43c13a62ec40dad232',
    reservationBytes: 496156672,
    evidenceDigest: 'c7f2426f1cd3ec18793ad5c64e483951d4737e16f58bfb87fb623d448c938190',
    memoryCandidateEvidenceDigest:
      '6e53b9e0e7e1edc75c4dbffde34ed0c43c9ef018d519c7838b7f7220fff22b3e',
    observedPeakBytes: 364281856,
    fluctuationAllowanceBytes: 131874816,
  },
  transport: {
    node: 'v24.15.0',
    v8: '13.6.233.17-node.48',
    platform: 'win32',
    arch: 'x64',
    zodVersion: '4.6.1',
    implementationDigest: '1cbaef7ba843af6419a39af6dd3dfe0a7241c92851ff70d6ce77213819714bcf',
    corpusRevision: 'p05-native-metadata-memory-v1',
    memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    workspace: 'REFRESH_TRANSPORT',
    transportCorpusRevision: 'p05-native-refresh-transport-memory-v1',
    transportCorpusDigest: '18c24b675d8f3d2ec2fd0d6258d1a5ce05a511c4a773c52ca9c47a38ec9b1905',
    reservationBytes: 403861504,
    evidenceDigest: 'b70fad8498babf8e508c6807072304b92ca5b744973de7dc932f1a2c9ed151c1',
    memoryCandidateEvidenceDigest:
      'fc042b319b7a2d0e4c719f4aa80ecda46eb5b53550eb409e18938260f20a3964',
    observedPeakBytes: 368758784,
    fluctuationAllowanceBytes: 35102720,
  },
};
const pins = {
  paired: {
    'read-calibration.stdout.json':
      '548a17f3e5328079511528abcdcb300798a132e7d04abcf3c67c325da1d60a54',
    'full-calibration.stdout.json':
      '0dd3dcb842c63ce1dc366e2c439589a6b31014204892f6ab20606caf1e02bf0d',
    'calibration-manifest.json': '7739015c14a335d0320d8e788682e9ef2c49ff39332c989837d984805aa7f963',
    'candidate.json': '71dd2af1a942e26f759f942749b8682c9bf001582e7624a2e2c742fd3e6767ed',
    'holdout.json': '10449d396101879f695560e57504820a52e5576d67ac671a75e4d73431de29a5',
  },
  verification: {
    'calibration.json': 'c7f2426f1cd3ec18793ad5c64e483951d4737e16f58bfb87fb623d448c938190',
    'calibration-manifest.json': '394710dab88892b4157949a0a62c33b0b978a8d1b999e767535173d077a2cb42',
    'candidate.json': '6e53b9e0e7e1edc75c4dbffde34ed0c43c9ef018d519c7838b7f7220fff22b3e',
    'holdout.json': '07f6bab318c76f294f6a8a3a702e8a2dc4638b097a95689d1bb1cff5e7374196',
  },
  transport: {
    'raw.json': 'b70fad8498babf8e508c6807072304b92ca5b744973de7dc932f1a2c9ed151c1',
    'evidence-manifest.json': 'd10a0b81bce1c7c6662689f99fbcf80d879a204b526425af7c130bfaa2285fab',
    'candidate.json': 'fc042b319b7a2d0e4c719f4aa80ecda46eb5b53550eb409e18938260f20a3964',
    'holdout.json': '7ffed2718ec97eda8245938dc2e6195338e1c97b1d3b945ec486c2ee4e4dc43c',
  },
};
const environment = {
  node: 'v24.15.0',
  v8: '13.6.233.17-node.48',
  platform: 'win32',
  arch: 'x64',
  zodVersion: '4.6.1',
  implementationDigest: '1cbaef7ba843af6419a39af6dd3dfe0a7241c92851ff70d6ce77213819714bcf',
  corpusRevision: 'p05-native-metadata-memory-v1',
};
const matches = (value) =>
  Object.entries(environment).every(([key, entry]) => value[key] === entry);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const [group, entry, catalog, count, rawName, rawCount, manifestName] of [
  [
    'paired',
    expected.metadata,
    nativeMetadataProfiles,
    27,
    'read-calibration.stdout.json',
    65,
    'calibration-manifest.json',
  ],
  [
    'verification',
    expected.verification,
    nativeRefreshVerificationProfiles,
    15,
    'calibration.json',
    75,
    'calibration-manifest.json',
  ],
  [
    'transport',
    expected.transport,
    nativeRefreshTransportProfiles,
    22,
    'raw.json',
    110,
    'evidence-manifest.json',
  ],
])
  test('approved R8 ' + group + ' retains exact evidence and independent candidate binding', () => {
    const data = {};
    for (const [name, digest] of Object.entries(pins[group])) {
      const bytes = gunzipSync(
        readFileSync(
          new URL(
            '../../../fixtures/storage/native-analysis-state/phase1-r8/' +
              group +
              '/' +
              name +
              '.gz',
            import.meta.url,
          ),
        ),
      );
      assert.equal(sha(bytes), digest, group + '/' + name);
      data[name] = JSON.parse(bytes);
    }
    const selected = catalog.filter(
      (p) => matches(p) && p.memoryCandidateEvidenceDigest === entry.memoryCandidateEvidenceDigest,
    );
    assert.equal(selected.length, 1, 'approved R8 profile missing or duplicated');
    assert.deepEqual(selected[0], entry);
    assert.deepEqual(catalog.find(matches), entry);
    const candidate = data['candidate.json'];
    assert.equal(pins[group]['candidate.json'], entry.memoryCandidateEvidenceDigest);
    assert.equal(pins[group][rawName], entry.evidenceDigest);
    assert.equal(candidate.status, 'PROVISIONAL_REVIEW_REQUIRED');
    assert.equal(candidate.reservationBytes, entry.reservationBytes);
    assert.equal(candidate.observedPeakBytes, entry.observedPeakBytes);
    assert.equal(candidate.fluctuationAllowanceBytes, entry.fluctuationAllowanceBytes);
    assert.equal(
      candidate.observedPeakBytes + candidate.fluctuationAllowanceBytes,
      entry.reservationBytes,
    );
    assert.equal(candidate.priorApprovalFloorBytes, null);
    assert.deepEqual(candidate.environment, environment);
    assert.equal(data[rawName].observations.length, rawCount);
    assert.deepEqual(data[rawName].failures ?? [], []);
    const holdout = data['holdout.json'];
    assert.equal(
      holdout.candidateSha256 ?? holdout.candidateEvidenceDigest,
      entry.memoryCandidateEvidenceDigest,
    );
    assert.deepEqual(holdout.environment, environment);
    assert.deepEqual(holdout.failures, []);
    assert.equal(holdout.observations.length, count);
    for (const row of holdout.observations) {
      assert.ok((row.observation ?? row).peakResidentBytes <= entry.reservationBytes);
      if (group === 'transport') {
        assert.equal(row.observedOutcome, row.expectedOutcome);
        assert.equal(row.persistentStateVerified, true);
        assert.equal(row.tempClosed, true);
        assert.equal(row.transactionClosed, true);
      }
    }
    if (group === 'paired') {
      assert.equal(pins[group][manifestName], candidate.manifestDigest);
      assert.equal(pins[group]['full-calibration.stdout.json'], entry.fullTransportEvidenceDigest);
      assert.equal(data['full-calibration.stdout.json'].observations.length, 70);
      assert.equal(
        Math.max(
          ...data['full-calibration.stdout.json'].observations.map((o) => o.peakResidentBytes),
        ),
        entry.fullTransportPeakBytes,
      );
    } else {
      assert.equal(
        candidate.corpus.digest,
        entry[group === 'verification' ? 'verificationCorpusDigest' : 'transportCorpusDigest'],
      );
      assert.equal(candidate.manifest.path, manifestName);
      assert.equal(candidate.manifest.sha256, pins[group][manifestName]);
      assert.equal(candidate.reports[0].sha256, pins[group][rawName]);
    }
  });
for (const [purpose, entry, admit] of [
  ['READ_SEAL', expected.metadata, (n) => assertNativeMetadataAdmission(n, 'READ_SEAL')],
  ['FULL_TRANSPORT', expected.metadata, (n) => assertNativeMetadataAdmission(n, 'FULL_TRANSPORT')],
  ['REFRESH_VERIFY', expected.verification, assertNativeRefreshVerificationAdmission],
  ['REFRESH_TRANSPORT', expected.transport, assertNativeRefreshTransportAdmission],
])
  test('approved R8 ' + purpose + ' admits equality and refuses one byte less', () => {
    if (!matches(nativeMetadataEnvironment())) {
      assert.throws(
        () => admit(Number.MAX_SAFE_INTEGER),
        (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
      );
      return;
    }
    admit(entry.reservationBytes);
    assert.throws(
      () => admit(entry.reservationBytes - 1),
      (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
    );
  });
