import assert from 'node:assert/strict';
import { test } from 'node:test';
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

const environment = {
  node: 'v24.15.0',
  v8: '13.6.233.17-node.48',
  platform: 'win32',
  arch: 'x64',
  zodVersion: '4.6.1',
  implementationDigest: '3d503771a3c0b78982d60d80a17e39f6ec2a426f97e5ffa23ccdbd0b503ac5a0',
  corpusRevision: 'p05-native-metadata-memory-v1',
};
const matches = (profile) =>
  Object.entries(environment).every(([key, value]) => profile[key] === value);
const paired = {
  reservationBytes: 222334976,
  observedPeakBytes: 210853888,
  fluctuationAllowanceBytes: 11481088,
  memoryCandidateEvidenceDigest: 'cb9899c91190140c562776d9ce686166096278759b279421b25f42aae28ddeaf',
  corpusDigest: '0c599e6626202fe4a0b5d5866e2d89d01a4674e40b0efe0d0b20acf5b4085b29',
  evidenceDigest: 'cffa912740466b1af78006a03d62d5f607a979e0d1428d4ac25ee737f5cf84a7',
  fullTransportCorpusRevision: 'p05-native-full-v3-memory-v1',
  fullTransportCorpusDigest: '11cc2f5492f3429f3081fa8278852d947635a8d778471d293f3ce103785fd8ef',
  fullTransportEvidenceDigest: '3bcdfe9150954a0c2c97fdc6327f359bb53fbe2305cbeab9b81c86c1ba70477c',
  fullTransportPeakBytes: 158146560,
};

// Catch missing/misbound approval and an off-by-one admission boundary using real admission.
for (const [purpose, entries, admit, expected] of [
  [
    'READ_SEAL',
    nativeMetadataProfiles,
    (n) => assertNativeMetadataAdmission(n, 'READ_SEAL'),
    paired,
  ],
  [
    'FULL_TRANSPORT',
    nativeMetadataProfiles,
    (n) => assertNativeMetadataAdmission(n, 'FULL_TRANSPORT'),
    paired,
  ],
  [
    'REFRESH_VERIFY',
    nativeRefreshVerificationProfiles,
    assertNativeRefreshVerificationAdmission,
    {
      workspace: 'REFRESH_VERIFY',
      reservationBytes: 354004992,
      observedPeakBytes: 346435584,
      fluctuationAllowanceBytes: 7569408,
      memoryCandidateEvidenceDigest:
        '5a945e995c8de3b3ad80a301dbdc4fc91acd610321e9ff4c87ea212741129d77',
      verificationCorpusRevision: 'p05-native-refresh-verification-memory-v1',
      verificationCorpusDigest: '1969707b181cf5bbd2fd753d489c4ff3a39333f4d8166b43c13a62ec40dad232',
      evidenceDigest: '90b4c3edf0926f799a6caa2059cdd0ab7fa668e914356578828e88966912160a',
    },
  ],
  [
    'REFRESH_TRANSPORT',
    nativeRefreshTransportProfiles,
    assertNativeRefreshTransportAdmission,
    {
      workspace: 'REFRESH_TRANSPORT',
      reservationBytes: 394211328,
      observedPeakBytes: 369008640,
      fluctuationAllowanceBytes: 25202688,
      memoryCandidateEvidenceDigest:
        'b56cf2eea5b33f853cf06e5daca36cc28f07db33a51fc04a733e961b1f26b2cd',
      transportCorpusRevision: 'p05-native-refresh-transport-memory-v1',
      transportCorpusDigest: 'da35e24da66c358dea4bb465b2c2a647f63e1763a060b7a902b6c09ec7fbe9ad',
      evidenceDigest: '95ca91eda0b71309a6aa2a8e71eea3969786b9a3931c6d88a37696d3ec52d3e6',
    },
  ],
]) {
  test(`approved R4 ${purpose} admits exact bytes and rejects one byte less`, () => {
    if (matches(nativeMetadataEnvironment())) {
      assert.doesNotThrow(() => admit(expected.reservationBytes));
      assert.throws(
        () => admit(expected.reservationBytes - 1),
        (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
      );
    }
    const selected = entries.filter(matches);
    assert.equal(selected.length, 1);
    const profile = selected[0];
    for (const [key, value] of Object.entries(expected)) assert.equal(profile[key], value, key);
    assert.equal(
      profile.observedPeakBytes + profile.fluctuationAllowanceBytes,
      profile.reservationBytes,
    );
    assert.equal(profile.memoryPolicyRevision, 'p05-native-memory-high-water-range-v1');
    assert.equal(profile.peakMethod, 'resourceUsage.maxRSS');
    assert.equal(profile.peakUnits, 'bytes');
  });
}
