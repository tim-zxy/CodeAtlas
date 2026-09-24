import { createHash } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';
import { join } from 'node:path';

import { ContentFingerprintSchema } from '@codeatlas/ir';
import type { ContentFingerprint, RepositoryRelativePath } from '@codeatlas/ir';

import { classifySample } from './classify.js';
import { SourceScanError } from './errors.js';
import { discoverGitContext } from './git.js';
import { scanGitRepository } from './scan.js';
import type { ObservedFile, ObservedWorktree, ScannedFile, SourceScanRequest } from './types.js';

const readBufferBytes = 65_536;
const sampleBytes = 8_192;

function sourceChanged(): SourceScanError {
  return new SourceScanError('SOURCE_CHANGED', 'Source entry changed during fingerprinting');
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function sameFile(
  before: Awaited<ReturnType<typeof lstat>>,
  after: Awaited<ReturnType<typeof lstat>>,
): boolean {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs &&
    before.ctimeMs === after.ctimeMs &&
    after.isFile()
  );
}

export async function fingerprintFile(
  absolutePath: string,
  path: RepositoryRelativePath,
): Promise<
  Pick<ObservedFile, 'contentFingerprint' | 'sizeBytes' | 'classification' | 'languageHint'>
> {
  try {
    const before = await lstat(absolutePath);
    if (!before.isFile() || before.isSymbolicLink()) throw sourceChanged();
    const handle = await open(absolutePath, 'r');
    let digest: string;
    let sizeBytes = 0;
    const sample = Buffer.alloc(sampleBytes);
    let sampleLength = 0;
    try {
      if (!sameFile(before, await handle.stat())) throw sourceChanged();
      const hash = createHash('sha256');
      const buffer = Buffer.alloc(readBufferBytes);
      for (;;) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, sizeBytes);
        if (bytesRead === 0) break;
        hash.update(buffer.subarray(0, bytesRead));
        const take = Math.min(bytesRead, sampleBytes - sampleLength);
        if (take > 0) {
          buffer.copy(sample, sampleLength, 0, take);
          sampleLength += take;
        }
        sizeBytes += bytesRead;
        if (!Number.isSafeInteger(sizeBytes)) throw sourceChanged();
      }
      if (!sameFile(before, await handle.stat()) || sizeBytes !== before.size)
        throw sourceChanged();
      digest = hash.digest('hex');
    } finally {
      await handle.close();
    }
    if (!sameFile(before, await lstat(absolutePath))) throw sourceChanged();
    return {
      ...classifySample(path, sample.subarray(0, sampleLength), sizeBytes),
      contentFingerprint: ContentFingerprintSchema.parse(`sha256:${digest}`),
      sizeBytes,
    };
  } catch (error) {
    if (error instanceof SourceScanError) throw error;
    if (isMissing(error)) throw sourceChanged();
    throw new SourceScanError('FILE_READ_FAILED', 'Cannot fingerprint source file');
  }
}

function addField(hash: ReturnType<typeof createHash>, value: string | number | null): void {
  if (value === null) {
    hash.update('N');
    return;
  }
  const bytes = Buffer.from(String(value), 'utf8');
  hash.update(`S${bytes.length}:`);
  hash.update(bytes);
}

export function fingerprintInventory(files: readonly ObservedFile[]): ContentFingerprint {
  const hash = createHash('sha256');
  hash.update('codeatlas-worktree-v1\0');
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    addField(hash, file.path);
    addField(hash, file.contentFingerprint);
    addField(hash, file.sizeBytes);
    addField(hash, file.languageHint);
    addField(hash, file.classification.role);
    addField(hash, file.classification.provenance);
    addField(hash, file.classification.contentKind);
  }
  return ContentFingerprintSchema.parse(`sha256:${hash.digest('hex')}`);
}

export interface FingerprintDependencies {
  readonly fingerprintFile: typeof fingerprintFile;
}

async function observeSelectedPaths(
  rootPath: string,
  files: readonly ScannedFile[],
  dependencies: FingerprintDependencies,
): Promise<readonly ObservedFile[]> {
  const observed: ObservedFile[] = [];
  for (const file of files) {
    const current = await dependencies.fingerprintFile(
      join(rootPath, ...file.path.split('/')),
      file.path,
    );
    if (
      current.languageHint !== file.languageHint ||
      current.classification.role !== file.classification.role ||
      current.classification.provenance !== file.classification.provenance ||
      current.classification.contentKind !== file.classification.contentKind
    ) {
      throw sourceChanged();
    }
    observed.push(
      Object.freeze({
        ...file,
        contentFingerprint: current.contentFingerprint,
        sizeBytes: current.sizeBytes,
      }),
    );
  }
  return Object.freeze(observed);
}

export async function observeWithDependencies(
  request: SourceScanRequest,
  dependencies: FingerprintDependencies,
): Promise<ObservedWorktree> {
  const scan = await scanGitRepository(request);
  const files = await observeSelectedPaths(scan.rootPath, scan.files, dependencies);
  const after = await discoverGitContext(request.startingPath, request.workspaceRoot);
  if (
    after.rootPath !== scan.rootPath ||
    after.branchName !== scan.branchName ||
    after.headCommit !== scan.headCommit
  ) {
    throw sourceChanged();
  }
  return Object.freeze({ ...scan, files, contentFingerprint: fingerprintInventory(files) });
}

export const observeGitWorktree = (request: SourceScanRequest): Promise<ObservedWorktree> =>
  observeWithDependencies(request, { fingerprintFile });
