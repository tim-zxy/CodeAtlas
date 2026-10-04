import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeClientError, NativeStateValidationError } from '../../providers/dist/index.js';
import {
  nativeMetadataProfiles,
  nativeRefreshVerificationProfiles,
  nativeRefreshTransportProfiles,
} from './native-metadata-profiles.js';

export const nativeMetadataCorpusRevision = 'p05-native-metadata-memory-v1';
export const nativeRefreshVerificationCorpusRevision = 'p05-native-refresh-verification-memory-v1';
export const nativeRefreshTransportCorpusRevision = 'p05-native-refresh-transport-memory-v1';

/** D-purpose admission, before any caller-controlled lazy preparation. */
export function assertNativeRefreshTransportAdmission(memoryBudgetBytes: number): void {
  if (!Number.isSafeInteger(memoryBudgetBytes) || memoryBudgetBytes <= 0)
    throw new NativeClientError(
      'INVALID_CONFIGURATION',
      'Native refresh trusted budget must be positive and safe',
    );
  const environment = nativeMetadataEnvironment();
  const profile = nativeRefreshTransportProfiles.find(
    (candidate) =>
      candidate.workspace === 'REFRESH_TRANSPORT' &&
      Object.entries(environment).every(
        ([key, value]) => candidate[key as keyof typeof candidate] === value,
      ),
  );
  if (
    !profile ||
    profile.transportCorpusRevision !== nativeRefreshTransportCorpusRevision ||
    !/^[a-f0-9]{64}$/.test(profile.transportCorpusDigest) ||
    !/^[a-f0-9]{64}$/.test(profile.evidenceDigest) ||
    !/^[a-f0-9]{64}$/.test(profile.memoryCandidateEvidenceDigest) ||
    profile.memoryPolicyRevision !== 'p05-native-memory-high-water-range-v1' ||
    profile.peakMethod !== 'resourceUsage.maxRSS' ||
    profile.peakUnits !== 'bytes' ||
    !Number.isSafeInteger(profile.reservationBytes) ||
    profile.reservationBytes <= 0 ||
    !Number.isSafeInteger(profile.observedPeakBytes) ||
    profile.observedPeakBytes <= 0 ||
    !Number.isSafeInteger(profile.fluctuationAllowanceBytes) ||
    profile.fluctuationAllowanceBytes < 0 ||
    !Number.isSafeInteger(profile.observedPeakBytes + profile.fluctuationAllowanceBytes) ||
    profile.observedPeakBytes + profile.fluctuationAllowanceBytes > profile.reservationBytes ||
    memoryBudgetBytes < profile.reservationBytes
  )
    throw new NativeStateValidationError(
      'RESOURCE_LIMIT_EXCEEDED',
      'No admissible reviewed native refresh transport profile',
    );
}

export function nativeMetadataEnvironment() {
  const hash = createHash('sha256');
  const providerEntry = fileURLToPath(import.meta.resolve('../../providers/dist/index.js'));
  const require = createRequire(providerEntry);
  for (const name of ['ir', 'storage', 'providers', 'runtime']) {
    // Resolve the actual built modules using the same installed layout as
    // Runtime composition; never hash checkout src/ files or test helpers.
    const entry =
      name === 'ir'
        ? require.resolve('@codeatlas/ir')
        : fileURLToPath(
            import.meta.resolve(name === 'runtime' ? './index.js' : `../../${name}/dist/index.js`),
          );
    const root = dirname(entry);
    const paths: string[] = [];
    function collect(directory: string): void {
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, item.name);
        if (item.isDirectory()) collect(path);
        else if (
          item.isFile() &&
          item.name.endsWith('.js') &&
          !(name === 'runtime' && item.name === 'native-metadata-profiles.js')
        )
          paths.push(path);
      }
    }
    collect(root);
    for (const path of paths.sort()) {
      const label = `${name}/${relative(root, path).replaceAll('\\', '/')}`;
      const source = readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
      hash.update(`${label}\0${Buffer.byteLength(source)}\0`).update(source);
    }
  }
  const zodVersion: string = JSON.parse(
    readFileSync(require.resolve('zod/package.json'), 'utf8'),
  ).version;
  hash.update(`zod\0${zodVersion}`);
  return Object.freeze({
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    zodVersion,
    implementationDigest: hash.digest('hex'),
    corpusRevision: nativeMetadataCorpusRevision,
  });
}

export function assertNativeMetadataAdmission(
  memoryBudgetBytes: number,
  workspace: 'READ_SEAL' | 'FULL_TRANSPORT' = 'READ_SEAL',
): void {
  const environment = nativeMetadataEnvironment();
  const profile = nativeMetadataProfiles.find((candidate) =>
    Object.entries(environment).every(
      ([key, value]) => candidate[key as keyof typeof candidate] === value,
    ),
  );
  if (!profile)
    throw new NativeStateValidationError(
      'RESOURCE_LIMIT_EXCEEDED',
      'No reviewed native metadata profile for this implementation/environment',
    );
  if (
    workspace !== 'READ_SEAL' &&
    (workspace !== 'FULL_TRANSPORT' ||
      profile.fullTransportCorpusRevision !== 'p05-native-full-v3-memory-v1' ||
      !/^[a-f0-9]{64}$/.test(profile.fullTransportCorpusDigest ?? '') ||
      !/^[a-f0-9]{64}$/.test(profile.fullTransportEvidenceDigest ?? '') ||
      !Number.isSafeInteger(profile.fullTransportPeakBytes) ||
      (profile.fullTransportPeakBytes ?? 0) <= 0 ||
      (profile.fullTransportPeakBytes ?? Number.MAX_SAFE_INTEGER) > profile.reservationBytes)
  )
    throw new NativeStateValidationError(
      'RESOURCE_LIMIT_EXCEEDED',
      'No reviewed full transport workspace for this metadata profile',
    );
  if (!Number.isSafeInteger(memoryBudgetBytes) || memoryBudgetBytes < profile.reservationBytes)
    throw new NativeStateValidationError(
      'RESOURCE_LIMIT_EXCEEDED',
      'Native metadata reservation exceeds remaining request budget',
    );
}

/** Private C-only admission. No request bytes, report scanning or automatic calibration. */
export function assertNativeRefreshVerificationAdmission(memoryBudgetBytes: number): void {
  if (!Number.isSafeInteger(memoryBudgetBytes) || memoryBudgetBytes <= 0)
    throw new NativeClientError(
      'INVALID_CONFIGURATION',
      'Native refresh trusted budget must be positive and safe',
    );
  const environment = nativeMetadataEnvironment();
  const profile = nativeRefreshVerificationProfiles.find(
    (candidate) =>
      candidate.workspace === 'REFRESH_VERIFY' &&
      Object.entries(environment).every(
        ([key, value]) => candidate[key as keyof typeof candidate] === value,
      ),
  );
  if (
    !profile ||
    profile.verificationCorpusRevision !== nativeRefreshVerificationCorpusRevision ||
    !/^[a-f0-9]{64}$/.test(profile.verificationCorpusDigest) ||
    !/^[a-f0-9]{64}$/.test(profile.evidenceDigest) ||
    !/^[a-f0-9]{64}$/.test(profile.memoryCandidateEvidenceDigest) ||
    profile.memoryPolicyRevision !== 'p05-native-memory-high-water-range-v1' ||
    profile.peakMethod !== 'resourceUsage.maxRSS' ||
    profile.peakUnits !== 'bytes' ||
    !Number.isSafeInteger(profile.reservationBytes) ||
    profile.reservationBytes <= 0 ||
    !Number.isSafeInteger(profile.observedPeakBytes) ||
    profile.observedPeakBytes <= 0 ||
    !Number.isSafeInteger(profile.fluctuationAllowanceBytes) ||
    profile.fluctuationAllowanceBytes < 0 ||
    !Number.isSafeInteger(profile.observedPeakBytes + profile.fluctuationAllowanceBytes) ||
    profile.observedPeakBytes + profile.fluctuationAllowanceBytes > profile.reservationBytes ||
    memoryBudgetBytes < profile.reservationBytes
  )
    throw new NativeStateValidationError(
      'RESOURCE_LIMIT_EXCEEDED',
      'No admissible reviewed native refresh verification profile',
    );
}
