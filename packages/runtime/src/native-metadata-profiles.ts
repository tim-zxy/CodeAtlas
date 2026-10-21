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
  readonly memoryPolicyRevision?: string;
  readonly memoryCandidateEvidenceDigest?: string;
  readonly observedPeakBytes?: number;
  readonly fluctuationAllowanceBytes?: number;
}

export interface NativeRefreshVerificationProfile extends Pick<
  NativeMetadataProfile,
  'node' | 'v8' | 'platform' | 'arch' | 'implementationDigest' | 'zodVersion' | 'corpusRevision'
> {
  readonly workspace: 'REFRESH_VERIFY';
  readonly verificationCorpusRevision: string;
  readonly verificationCorpusDigest: string;
  readonly reservationBytes: number;
  readonly evidenceDigest: string;
  readonly memoryPolicyRevision: string;
  readonly memoryCandidateEvidenceDigest: string;
  readonly observedPeakBytes: number;
  readonly fluctuationAllowanceBytes: number;
  readonly peakMethod: 'resourceUsage.maxRSS';
  readonly peakUnits: 'bytes';
}

export interface NativeRefreshTransportProfile extends Omit<
  NativeRefreshVerificationProfile,
  'workspace' | 'verificationCorpusRevision' | 'verificationCorpusDigest'
> {
  readonly workspace: 'REFRESH_TRANSPORT';
  readonly transportCorpusRevision: string;
  readonly transportCorpusDigest: string;
}

// Exact D5 candidates, most recently approved environment first; retain history.
export const nativeRefreshTransportProfiles: readonly NativeRefreshTransportProfile[] =
  Object.freeze([
    // R3 exact candidate separately approved by the user on 2026-10-20.
    Object.freeze({
      node: 'v24.15.0',
      v8: '13.6.233.17-node.48',
      platform: 'win32',
      arch: 'x64',
      zodVersion: '4.6.1',
      implementationDigest: 'd402c9a4b7279fb7c31407a8a2d21f19dfd020dfed783166a17eb0d305a156e1',
      corpusRevision: 'p05-native-metadata-memory-v1',
      workspace: 'REFRESH_TRANSPORT',
      transportCorpusRevision: 'p05-native-refresh-transport-memory-v1',
      transportCorpusDigest: '6b6bde708e14ebed972066d86cb84828de513f8a368fa957b4d6200b51bb1dde',
      reservationBytes: 392_286_208,
      evidenceDigest: '79e22ccfe33c49ec1ba68e761d2ba3cc60b3398ec7c4a77106e9cd3d25524338',
      memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
      memoryCandidateEvidenceDigest:
        'e2fd1c7818ca2c5062c65da717e1d3f38c44344029aa7af1389a5afb8b09eb85',
      observedPeakBytes: 360_677_376,
      fluctuationAllowanceBytes: 31_608_832,
      peakMethod: 'resourceUsage.maxRSS',
      peakUnits: 'bytes',
    }),
    // R2 physical corpus separately approved by the user on 2026-10-19.
    Object.freeze({
      node: 'v24.15.0',
      v8: '13.6.233.17-node.48',
      platform: 'win32',
      arch: 'x64',
      zodVersion: '4.6.1',
      implementationDigest: '0ea17dfcc71d7c2d3ffb1bc782ab47c63f6c2294041dc50e0a14e1362242711d',
      corpusRevision: 'p05-native-metadata-memory-v1',
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
    }),
    // Fixed-layout candidate separately approved by the user on 2026-10-19.
    Object.freeze({
      node: 'v24.15.0',
      v8: '13.6.233.17-node.48',
      platform: 'win32',
      arch: 'x64',
      zodVersion: '4.6.1',
      implementationDigest: '0ea17dfcc71d7c2d3ffb1bc782ab47c63f6c2294041dc50e0a14e1362242711d',
      corpusRevision: 'p05-native-metadata-memory-v1',
      workspace: 'REFRESH_TRANSPORT',
      transportCorpusRevision: 'p05-native-refresh-transport-memory-v1',
      transportCorpusDigest: '1aa37f7ac114baa2e0262af19205d9b05c2fdb63ed8794432da9b38fa6dedcb2',
      reservationBytes: 376_422_400,
      evidenceDigest: '7c4d9b65d95453c6cc455a8d3770315de7f586c1f2cc6f23659f0153714262ec',
      memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
      memoryCandidateEvidenceDigest:
        '91a9e2477f490b93ce76f5d5bb6b5becdc41b976282e511ad73db30ca128aa25',
      observedPeakBytes: 364_318_720,
      fluctuationAllowanceBytes: 12_103_680,
      peakMethod: 'resourceUsage.maxRSS',
      peakUnits: 'bytes',
    }),
    // Original physical corpus approved on 2026-10-17.
    Object.freeze({
      node: 'v24.15.0',
      v8: '13.6.233.17-node.48',
      platform: 'win32',
      arch: 'x64',
      zodVersion: '4.6.1',
      implementationDigest: '0ea17dfcc71d7c2d3ffb1bc782ab47c63f6c2294041dc50e0a14e1362242711d',
      corpusRevision: 'p05-native-metadata-memory-v1',
      workspace: 'REFRESH_TRANSPORT',
      transportCorpusRevision: 'p05-native-refresh-transport-memory-v1',
      transportCorpusDigest: '7cba2555d81ab5cc775886378c32078cd4c9444a5496a0b7f37c7fda2464e6f8',
      reservationBytes: 378_400_768,
      evidenceDigest: 'b523727d279d240126629584a12b162363392bf02433103c286f412ba0c7e919',
      memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
      memoryCandidateEvidenceDigest:
        'f52395c5c5a7a7a61ce8d3cc2910ee0f0b43f72f891987129811e8e97a3a8553',
      observedPeakBytes: 347_574_272,
      fluctuationAllowanceBytes: 30_826_496,
      peakMethod: 'resourceUsage.maxRSS',
      peakUnits: 'bytes',
    }),
  ]);

// Exact verification candidate approved on 2026-10-03; never borrow full/read evidence.
export const nativeRefreshVerificationProfiles: readonly NativeRefreshVerificationProfile[] =
  Object.freeze([
    // New product's exact verification candidate approved on 2026-10-20.
    Object.freeze({
      node: 'v24.15.0',
      v8: '13.6.233.17-node.48',
      platform: 'win32',
      arch: 'x64',
      zodVersion: '4.6.1',
      implementationDigest: 'd402c9a4b7279fb7c31407a8a2d21f19dfd020dfed783166a17eb0d305a156e1',
      corpusRevision: 'p05-native-metadata-memory-v1',
      workspace: 'REFRESH_VERIFY',
      verificationCorpusRevision: 'p05-native-refresh-verification-memory-v1',
      verificationCorpusDigest: '1969707b181cf5bbd2fd753d489c4ff3a39333f4d8166b43c13a62ec40dad232',
      reservationBytes: 379_609_088,
      evidenceDigest: '044897b641ec31be8da5e84ddbc2896f3b298aaf00eb2c4f5b0df87c683dcab6',
      memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
      memoryCandidateEvidenceDigest:
        'd0ff3457a2290fae027fe76a5131d55fb92a8ced8b20283ab5ef9581f2883f61',
      observedPeakBytes: 357_806_080,
      fluctuationAllowanceBytes: 21_803_008,
      peakMethod: 'resourceUsage.maxRSS',
      peakUnits: 'bytes',
    }),
    // Final-build verification candidate separately approved on 2026-10-17.
    Object.freeze({
      node: 'v24.15.0',
      v8: '13.6.233.17-node.48',
      platform: 'win32',
      arch: 'x64',
      zodVersion: '4.6.1',
      implementationDigest: '0ea17dfcc71d7c2d3ffb1bc782ab47c63f6c2294041dc50e0a14e1362242711d',
      corpusRevision: 'p05-native-metadata-memory-v1',
      workspace: 'REFRESH_VERIFY',
      verificationCorpusRevision: 'p05-native-refresh-verification-memory-v1',
      verificationCorpusDigest: '1969707b181cf5bbd2fd753d489c4ff3a39333f4d8166b43c13a62ec40dad232',
      reservationBytes: 362_946_560,
      evidenceDigest: 'aa8d9d76a8ae5c5502954a92b414cead2f635123ce7b5f5054171ce8268108ea',
      memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
      memoryCandidateEvidenceDigest:
        'b6ea5577e80d042f12362f6564fed204696531811ed7a5b23b6381c14b2dcdf3',
      observedPeakBytes: 353_718_272,
      fluctuationAllowanceBytes: 9_228_288,
      peakMethod: 'resourceUsage.maxRSS',
      peakUnits: 'bytes',
    }),
    // Corrected-build verification candidate separately approved on 2026-10-04.
    Object.freeze({
      node: 'v24.15.0',
      v8: '13.6.233.17-node.48',
      platform: 'win32',
      arch: 'x64',
      zodVersion: '4.6.1',
      implementationDigest: '453a41edf654df5e1ded7ea6983637544cc7681d6e9ca64290acaca8de095d8a',
      corpusRevision: 'p05-native-metadata-memory-v1',
      workspace: 'REFRESH_VERIFY',
      verificationCorpusRevision: 'p05-native-refresh-verification-memory-v1',
      verificationCorpusDigest: '1969707b181cf5bbd2fd753d489c4ff3a39333f4d8166b43c13a62ec40dad232',
      reservationBytes: 422_879_232,
      evidenceDigest: 'd2b140fd87ecf321d05148f3f7535310339fc79b435e07f6961f07c6be214358',
      memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
      memoryCandidateEvidenceDigest:
        '4758ab67e7388c789f21372edbe292b74002d932ad48f6ef7ffe882b36fd50a6',
      observedPeakBytes: 351_821_824,
      fluctuationAllowanceBytes: 71_057_408,
      peakMethod: 'resourceUsage.maxRSS',
      peakUnits: 'bytes',
    }),
    Object.freeze({
      node: 'v24.15.0',
      v8: '13.6.233.17-node.48',
      platform: 'win32',
      arch: 'x64',
      zodVersion: '4.6.1',
      implementationDigest: 'f51a239ca3f95c8d44a4dd858e569f614bd5767c491916789d8fc9731dac74f5',
      corpusRevision: 'p05-native-metadata-memory-v1',
      workspace: 'REFRESH_VERIFY',
      verificationCorpusRevision: 'p05-native-refresh-verification-memory-v1',
      verificationCorpusDigest: '1969707b181cf5bbd2fd753d489c4ff3a39333f4d8166b43c13a62ec40dad232',
      reservationBytes: 422_711_296,
      evidenceDigest: '5820b1246488a2550f0a03a8bc9cc8806a137e2a97a59ee3064dc207f1d44352',
      memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
      memoryCandidateEvidenceDigest:
        'e21e3284928866f5e1007aa734d08365b60f2fe4ad4310ea8e39421e5bfd3b26',
      observedPeakBytes: 352_083_968,
      fluctuationAllowanceBytes: 70_627_328,
      peakMethod: 'resourceUsage.maxRSS',
      peakUnits: 'bytes',
    }),
  ]);

// User approved the 65-observation actual-path report on 2026-10-01.
// Exact Windows environment only; mismatches remain fail-closed. Raw report
// capture status is preserved; approval is recorded in CURRENT_STATUS.
export const nativeMetadataProfiles: readonly NativeMetadataProfile[] = Object.freeze([
  // The unshipped d402c9a4 paired 219095040-byte approval was withdrawn:
  // a retained fresh dense-site peak of 250535936 bytes failed the gate.
  // Preserve all historical entries; no larger value is installed automatically.
  // Final-build joint READ_SEAL/FULL_TRANSPORT candidate approved on 2026-10-17.
  Object.freeze({
    node: 'v24.15.0',
    v8: '13.6.233.17-node.48',
    platform: 'win32',
    arch: 'x64',
    zodVersion: '4.6.1',
    implementationDigest: '0ea17dfcc71d7c2d3ffb1bc782ab47c63f6c2294041dc50e0a14e1362242711d',
    corpusRevision: 'p05-native-metadata-memory-v1',
    corpusDigest: '0c599e6626202fe4a0b5d5866e2d89d01a4674e40b0efe0d0b20acf5b4085b29',
    reservationBytes: 287_555_584,
    evidenceDigest: '52879df274672e2c3e2096e71961ab5d1ba999b2ab51c81052f759de9467162b',
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    fullTransportCorpusRevision: 'p05-native-full-v3-memory-v1',
    fullTransportCorpusDigest: '11cc2f5492f3429f3081fa8278852d947635a8d778471d293f3ce103785fd8ef',
    fullTransportEvidenceDigest: '0826493f6afccdc99059ad66a19d1286b8cbfa45d1c4febe89468678b2855b2c',
    fullTransportPeakBytes: 195_641_344,
    memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
    memoryCandidateEvidenceDigest:
      '81c3999ba9349dd6f740b5ec0e4744385b4c05fcaa90496be6db157b819c5283',
    observedPeakBytes: 250_277_888,
    fluctuationAllowanceBytes: 37_277_696,
  }),
  // Corrected-build READ_SEAL and FULL_TRANSPORT separately approved on 2026-10-04.
  Object.freeze({
    node: 'v24.15.0',
    v8: '13.6.233.17-node.48',
    platform: 'win32',
    arch: 'x64',
    zodVersion: '4.6.1',
    implementationDigest: '453a41edf654df5e1ded7ea6983637544cc7681d6e9ca64290acaca8de095d8a',
    corpusRevision: 'p05-native-metadata-memory-v1',
    corpusDigest: '0c599e6626202fe4a0b5d5866e2d89d01a4674e40b0efe0d0b20acf5b4085b29',
    reservationBytes: 283_324_416,
    evidenceDigest: '6126281a77c0f29aebfeaff2eca5db0ccdf791e715c8fb651b7fe057bcf93d0b',
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    fullTransportCorpusRevision: 'p05-native-full-v3-memory-v1',
    fullTransportCorpusDigest: '11cc2f5492f3429f3081fa8278852d947635a8d778471d293f3ce103785fd8ef',
    fullTransportEvidenceDigest: '517463fe7768ff823b427308734bf04e34ee71b6d6b7fb0d7cec08d715723db7',
    fullTransportPeakBytes: 192_991_232,
    memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
    memoryCandidateEvidenceDigest:
      '571b7ccc760d3a60a89da7156aaded26a2130daf11f8bd6d65517f14d902a986',
    observedPeakBytes: 247_963_648,
    fluctuationAllowanceBytes: 35_360_768,
  }),
  // READ_SEAL and FULL_TRANSPORT separately approved on 2026-10-03.
  Object.freeze({
    node: 'v24.15.0',
    v8: '13.6.233.17-node.48',
    platform: 'win32',
    arch: 'x64',
    zodVersion: '4.6.1',
    implementationDigest: 'f51a239ca3f95c8d44a4dd858e569f614bd5767c491916789d8fc9731dac74f5',
    corpusRevision: 'p05-native-metadata-memory-v1',
    corpusDigest: '0c599e6626202fe4a0b5d5866e2d89d01a4674e40b0efe0d0b20acf5b4085b29',
    reservationBytes: 286_760_960,
    evidenceDigest: '12516a229fea27f2488c2b3dc07cf291ab553af095ef0fd40b9860cbf03dc9d3',
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    fullTransportCorpusRevision: 'p05-native-full-v3-memory-v1',
    fullTransportCorpusDigest: '11cc2f5492f3429f3081fa8278852d947635a8d778471d293f3ce103785fd8ef',
    fullTransportEvidenceDigest: '37e9493b205c996eab6b0c0d3fbdb0f58d9df482115ab2f9b2288fc18051a98e',
    fullTransportPeakBytes: 183_955_456,
    memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
    memoryCandidateEvidenceDigest:
      '9a19027b465309abf6ca1992c8fbdf07bc2a83f8dc9689b4a78994c025fbfdb0',
    observedPeakBytes: 249_556_992,
    fluctuationAllowanceBytes: 37_203_968,
  }),
  // Exact candidate and independent holdout approved by the user on 2026-10-02.
  Object.freeze({
    node: 'v24.15.0',
    v8: '13.6.233.17-node.48',
    platform: 'win32',
    arch: 'x64',
    zodVersion: '4.6.1',
    implementationDigest: '86fa33c51ecf63383f3575877bedaf66c47661dee5222ea4e14e8a0dd74e5888',
    corpusRevision: 'p05-native-metadata-memory-v1',
    corpusDigest: '0c599e6626202fe4a0b5d5866e2d89d01a4674e40b0efe0d0b20acf5b4085b29',
    reservationBytes: 280_453_120,
    evidenceDigest: '0928e20705954cb72a852a11af8d45cdb50ed9cb70f8ccd1e342f1accead8717',
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    fullTransportCorpusRevision: 'p05-native-full-v3-memory-v1',
    fullTransportCorpusDigest: '11cc2f5492f3429f3081fa8278852d947635a8d778471d293f3ce103785fd8ef',
    fullTransportEvidenceDigest: '7188bb6dcf9f2a5ef076b3c462b754356cece808792953b43ac81d7b1feea297',
    fullTransportPeakBytes: 166_449_152,
    memoryPolicyRevision: 'p05-native-memory-high-water-range-v1',
    memoryCandidateEvidenceDigest:
      '02071679da6cd7d6ff1ce11dab4eae347e8404f8820052079ce52a49f3ab748d',
    observedPeakBytes: 245_719_040,
    fluctuationAllowanceBytes: 34_734_080,
  }),
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
