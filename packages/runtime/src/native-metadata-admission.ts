import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeStateValidationError } from '../../providers/dist/index.js';
import { nativeMetadataProfiles } from './native-metadata-profiles.js';

export const nativeMetadataCorpusRevision = 'p05-native-metadata-memory-v1';

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
