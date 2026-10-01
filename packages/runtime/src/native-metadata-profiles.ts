export interface NativeMetadataProfile {
  readonly node: string;
  readonly v8: string;
  readonly platform: string;
  readonly arch: string;
  readonly implementationDigest: string;
  readonly zodVersion: string;
  readonly corpusRevision: string;
  readonly corpusDigest: string;
  readonly reservationBytes: number;
  readonly evidenceDigest: string;
  readonly peakMethod: 'resourceUsage.maxRSS';
  readonly peakUnits: 'bytes';
}

// User approved the 65-observation actual-path report on 2026-10-01.
// Exact Windows environment only; mismatches remain fail-closed. Raw report
// capture status is preserved; approval is recorded in CURRENT_STATUS.
export const nativeMetadataProfiles: readonly NativeMetadataProfile[] = Object.freeze([
  Object.freeze({
    node: 'v24.15.0',
    v8: '13.6.233.17-node.48',
    platform: 'win32',
    arch: 'x64',
    zodVersion: '4.6.1',
    implementationDigest: 'e9fc7784930fe3346c0d0390731c290755242c159f09656404394d811e5c8298',
    corpusRevision: 'p05-native-metadata-memory-v1',
    corpusDigest: '0c599e6626202fe4a0b5d5866e2d89d01a4674e40b0efe0d0b20acf5b4085b29',
    reservationBytes: 250_183_680,
    evidenceDigest: 'cd69ea2b526a4e70a11f67402924ee1757a0d5eaf26081c3b848ec747c89b386',
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
  }),
]);
