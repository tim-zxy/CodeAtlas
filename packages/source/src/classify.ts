import { open, lstat } from 'node:fs/promises';

import type { RepositoryRelativePath } from '@codeatlas/ir';

import { SourceScanError } from './errors.js';
import type { ScannedFile } from './types.js';

const sampleBytes = 8_192;

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

export function classifySample(
  path: RepositoryRelativePath,
  sample: Buffer,
  sizeBytes: number,
): Pick<ScannedFile, 'languageHint' | 'classification'> {
  const parts = path.split('/');
  const lower = parts.map((part) => part.toLowerCase());
  const basename = parts.at(-1)!;
  const isJava = basename.toLowerCase().endsWith('.java');
  const testRole = lower.some((part) => ['test', 'tests', '__tests__'].includes(part));
  const provenance = lower.includes('vendor')
    ? 'VENDOR'
    : lower.some((part) => ['generated', 'build', 'dist', 'target'].includes(part))
      ? 'GENERATED'
      : 'AUTHORED';
  let contentKind: 'TEXT' | 'BINARY' = 'TEXT';
  if (sample.includes(0)) contentKind = 'BINARY';
  else {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(sample, { stream: sizeBytes > sampleBytes });
    } catch {
      contentKind = 'BINARY';
    }
  }
  return {
    languageHint: isJava ? 'java' : null,
    classification: {
      role: testRole ? 'TEST' : isJava ? 'SOURCE' : 'OTHER',
      provenance,
      contentKind,
    },
  };
}

export async function classifyFile(
  absolutePath: string,
  path: RepositoryRelativePath,
): Promise<Pick<ScannedFile, 'languageHint' | 'classification'>> {
  try {
    const before = await lstat(absolutePath);
    if (!before.isFile() || before.isSymbolicLink()) {
      throw new SourceScanError('SOURCE_CHANGED', 'Source entry changed during classification');
    }
    const handle = await open(absolutePath, 'r');
    let sample: Buffer;
    try {
      const opened = await handle.stat();
      if (!sameFile(before, opened)) {
        throw new SourceScanError('SOURCE_CHANGED', 'Source entry changed during classification');
      }
      const buffer = Buffer.alloc(sampleBytes);
      const { bytesRead } = await handle.read(buffer, 0, sampleBytes, 0);
      sample = buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
    const after = await lstat(absolutePath);
    if (!sameFile(before, after)) {
      throw new SourceScanError('SOURCE_CHANGED', 'Source entry changed during classification');
    }
    return classifySample(path, sample, before.size);
  } catch (error) {
    if (error instanceof SourceScanError) throw error;
    if (isMissing(error)) {
      throw new SourceScanError('SOURCE_CHANGED', 'Source entry disappeared during classification');
    }
    throw new SourceScanError('FILE_READ_FAILED', 'Cannot classify source file');
  }
}
