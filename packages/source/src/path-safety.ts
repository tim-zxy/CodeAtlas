import { lstat } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { RepositoryRelativePath } from '@codeatlas/ir';

import { SourceScanError } from './errors.js';

export interface AncestorIdentity {
  readonly path: string;
  readonly dev: number;
  readonly ino: number;
}

function sourceChanged(): SourceScanError {
  return new SourceScanError('SOURCE_CHANGED', 'Source ancestor changed during read');
}

export async function safeAncestors(
  absolutePath: string,
  path: RepositoryRelativePath,
): Promise<readonly AncestorIdentity[]> {
  let current = absolutePath;
  const ancestors: string[] = [];
  for (const _segment of path.split('/')) {
    current = dirname(current);
    ancestors.push(current);
  }
  const identities: AncestorIdentity[] = [];
  for (const ancestor of ancestors.reverse()) {
    const info = await lstat(ancestor);
    if (!info.isDirectory() || info.isSymbolicLink()) throw sourceChanged();
    identities.push({ path: ancestor, dev: info.dev, ino: info.ino });
  }
  return identities;
}

export async function assertSameAncestors(
  absolutePath: string,
  path: RepositoryRelativePath,
  before: readonly AncestorIdentity[],
): Promise<void> {
  const after = await safeAncestors(absolutePath, path);
  if (
    after.length !== before.length ||
    after.some(
      (ancestor, index) =>
        ancestor.path !== before[index]?.path ||
        ancestor.dev !== before[index]?.dev ||
        ancestor.ino !== before[index]?.ino,
    )
  ) {
    throw sourceChanged();
  }
}
