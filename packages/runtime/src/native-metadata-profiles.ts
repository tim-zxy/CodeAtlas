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
  readonly fullTransportCorpusRevision?: string;
  readonly fullTransportCorpusDigest?: string;
  readonly fullTransportEvidenceDigest?: string;
  readonly fullTransportPeakBytes?: number;
}

// User approved the 65-observation actual-path report on 2026-10-01.
// Exact Windows environment only; mismatches remain fail-closed. Raw report
// capture status is preserved; approval is recorded in CURRENT_STATUS.
export const nativeMetadataProfiles: readonly NativeMetadataProfile[] = Object.freeze([
  // Classification-repair paired reports approved on 2026-10-02.
  Object.freeze({
    node: 'v24.15.0',
    v8: '13.6.233.17-node.48',
    platform: 'win32',
    arch: 'x64',
    zodVersion: '4.6.1',
    implementationDigest: '87b74e5e9050757eb30ebae478919fada586ece8299cf98588a79a17b28e7e63',
    corpusRevision: 'p05-native-metadata-memory-v1',
    corpusDigest: '0c599e6626202fe4a0b5d5866e2d89d01a4674e40b0efe0d0b20acf5b4085b29',
    reservationBytes: 247_508_992,
    evidenceDigest: 'd61ff7e1daa04c2cc1a628b3b0c85d195f860d9d65a804724094351b17f59c5f',
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    fullTransportCorpusRevision: 'p05-native-full-v3-memory-v1',
    fullTransportCorpusDigest: '11cc2f5492f3429f3081fa8278852d947635a8d778471d293f3ce103785fd8ef',
    fullTransportEvidenceDigest: 'ef270c2e4dd0962d34d4483cbea686a1d1c963f88ccc72e2e04894a6b747bed4',
    fullTransportPeakBytes: 183_230_464,
  }),
  // Task 6 paired reports approved by the user on 2026-10-02.
  Object.freeze({
    node: 'v24.15.0',
    v8: '13.6.233.17-node.48',
    platform: 'win32',
    arch: 'x64',
    zodVersion: '4.6.1',
    implementationDigest: '0b13710a3ce945d2cd6cad08a99bbf260721705bb3f5b5b827ac441d3b8fae78',
    corpusRevision: 'p05-native-metadata-memory-v1',
    corpusDigest: '0c599e6626202fe4a0b5d5866e2d89d01a4674e40b0efe0d0b20acf5b4085b29',
    reservationBytes: 248_549_376,
    evidenceDigest: '6cccf84431dbc2bab90552130f5d410de3abd9eafa8f60c404b519866961502e',
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    fullTransportCorpusRevision: 'p05-native-full-v3-memory-v1',
    fullTransportCorpusDigest: '11cc2f5492f3429f3081fa8278852d947635a8d778471d293f3ce103785fd8ef',
    fullTransportEvidenceDigest: 'dcc7dcbc3a1c57230d005b5dfd56561f7317619112f236e86519ddf36fb30d73',
    fullTransportPeakBytes: 195_072_000,
  }),
  // Paired 65-observation read/seal and 70-observation transport reports approved.
  Object.freeze({
    node: 'v24.15.0',
    v8: '13.6.233.17-node.48',
    platform: 'win32',
    arch: 'x64',
    zodVersion: '4.6.1',
    implementationDigest: '91931ccddf3b3eae0687e07cae23b9da14901976596811f178cf2f1b7bf8f09c',
    corpusRevision: 'p05-native-metadata-memory-v1',
    corpusDigest: '0c599e6626202fe4a0b5d5866e2d89d01a4674e40b0efe0d0b20acf5b4085b29',
    reservationBytes: 247_132_160,
    evidenceDigest: '9dca28c23dd8fed77d22374505123b0984a782c700b6590838cee4ce4858e262',
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    fullTransportCorpusRevision: 'p05-native-full-v3-memory-v1',
    fullTransportCorpusDigest: '11cc2f5492f3429f3081fa8278852d947635a8d778471d293f3ce103785fd8ef',
    fullTransportEvidenceDigest: 'b7154f67fd8cbcf459eacbcd7405e3788dd9a47ef2bbdf2803390ce778dcda65',
    fullTransportPeakBytes: 196_911_104,
  }),
  Object.freeze({
    node: 'v24.15.0',
    v8: '13.6.233.17-node.48',
    platform: 'win32',
    arch: 'x64',
    zodVersion: '4.6.1',
    implementationDigest: '44471febb9b41c2c73ddd30f065f216ba016d74e7179821d7dadf8c1c09a73ee',
    corpusRevision: 'p05-native-metadata-memory-v1',
    corpusDigest: '0c599e6626202fe4a0b5d5866e2d89d01a4674e40b0efe0d0b20acf5b4085b29',
    reservationBytes: 250_855_424,
    evidenceDigest: 'a9451c810ae270340cb499cac5dbf01d0fe274b755861a6725b4576eb17815b1',
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
  }),
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
