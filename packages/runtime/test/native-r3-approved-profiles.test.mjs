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

const approvedEnvironment = {
  node: 'v24.15.0',
  v8: '13.6.233.17-node.48',
  platform: 'win32',
  arch: 'x64',
  zodVersion: '4.6.1',
  implementationDigest: 'd402c9a4b7279fb7c31407a8a2d21f19dfd020dfed783166a17eb0d305a156e1',
  corpusRevision: 'p05-native-metadata-memory-v1',
};
const pairedCandidate = '496e45715e8eb117d22a5c99c5b194e14acff1d6e62d96627a6c0685529aeaf4';
const matches = (profile) =>
  Object.entries(approvedEnvironment).every(([key, value]) => profile[key] === value);

for (const [purpose, entries, admit, reservation, peak, allowance, candidate] of [
  [
    'READ_SEAL',
    nativeMetadataProfiles,
    (n) => assertNativeMetadataAdmission(n, 'READ_SEAL'),
    219095040,
    216506368,
    2588672,
    pairedCandidate,
  ],
  [
    'FULL_TRANSPORT',
    nativeMetadataProfiles,
    (n) => assertNativeMetadataAdmission(n, 'FULL_TRANSPORT'),
    219095040,
    216506368,
    2588672,
    pairedCandidate,
  ],
  [
    'REFRESH_VERIFY',
    nativeRefreshVerificationProfiles,
    assertNativeRefreshVerificationAdmission,
    379609088,
    357806080,
    21803008,
    'd0ff3457a2290fae027fe76a5131d55fb92a8ced8b20283ab5ef9581f2883f61',
  ],
  [
    'REFRESH_TRANSPORT',
    nativeRefreshTransportProfiles,
    assertNativeRefreshTransportAdmission,
    392286208,
    360677376,
    31608832,
    'e2fd1c7818ca2c5062c65da717e1d3f38c44344029aa7af1389a5afb8b09eb85',
  ],
]) {
  const withdrawn = purpose === 'READ_SEAL' || purpose === 'FULL_TRANSPORT';
  test(`${withdrawn ? 'withdrawn' : 'approved'} R3 ${purpose} preserves exact admission status`, () => {
    if (withdrawn) {
      // The first complete root retained a valid 250535936-byte fresh peak.
      // The unshipped shared 219095040-byte entry must not remain admissible.
      assert.equal(entries.filter(matches).length, 0);
      if (matches(nativeMetadataEnvironment())) {
        assert.throws(
          () => admit(1_000_000_000),
          (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
        );
      }
      return;
    }
    if (matches(nativeMetadataEnvironment())) {
      assert.doesNotThrow(() => admit(reservation));
      assert.throws(
        () => admit(reservation - 1),
        (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
      );
    }
    const selected = entries.filter(matches);
    assert.equal(selected.length, 1);
    const p = selected[0];
    assert.equal(p.reservationBytes, reservation);
    assert.equal(p.observedPeakBytes, peak);
    assert.equal(p.fluctuationAllowanceBytes, allowance);
    assert.equal(peak + allowance, reservation);
    assert.equal(p.memoryCandidateEvidenceDigest, candidate);
    assert.equal(p.memoryPolicyRevision, 'p05-native-memory-high-water-range-v1');
    assert.equal(p.peakMethod, 'resourceUsage.maxRSS');
    assert.equal(p.peakUnits, 'bytes');
    if (purpose === 'REFRESH_TRANSPORT') {
      assert.equal(
        p.transportCorpusDigest,
        '6b6bde708e14ebed972066d86cb84828de513f8a368fa957b4d6200b51bb1dde',
      );
      assert.equal(
        p.evidenceDigest,
        '79e22ccfe33c49ec1ba68e761d2ba3cc60b3398ec7c4a77106e9cd3d25524338',
      );
    } else if (purpose === 'REFRESH_VERIFY') {
      assert.equal(
        p.verificationCorpusDigest,
        '1969707b181cf5bbd2fd753d489c4ff3a39333f4d8166b43c13a62ec40dad232',
      );
      assert.equal(
        p.evidenceDigest,
        '044897b641ec31be8da5e84ddbc2896f3b298aaf00eb2c4f5b0df87c683dcab6',
      );
    } else {
      assert.equal(
        p.corpusDigest,
        '0c599e6626202fe4a0b5d5866e2d89d01a4674e40b0efe0d0b20acf5b4085b29',
      );
      assert.equal(
        p.fullTransportCorpusDigest,
        '11cc2f5492f3429f3081fa8278852d947635a8d778471d293f3ce103785fd8ef',
      );
      assert.equal(
        p.evidenceDigest,
        '3d48f41a915cfbadf03ffc3ebff9aefd0ab24e14d2d57212835a60e7156ebaa0',
      );
      assert.equal(
        p.fullTransportEvidenceDigest,
        'd4c4c3490c6b0c701eaa4896744f3aad7464512f4842e9c63bfac678ccec95ba',
      );
      assert.equal(p.fullTransportPeakBytes, 170323968);
    }
  });
}
