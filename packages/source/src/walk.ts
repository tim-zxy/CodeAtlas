import type { MixedSourceAccount } from './mixed-source-verification.js';
import { safeAncestors, assertSameAncestors } from './path-safety.js';
import { lstat, readdir, opendir } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

import { RepositoryRelativePathSchema } from '@codeatlas/ir';
import type { RepositoryRelativePath } from '@codeatlas/ir';

import { SourceScanError } from './errors.js';

export interface Candidate {
  readonly absolutePath: string;
  readonly path: RepositoryRelativePath;
}

function changed(): SourceScanError {
  return new SourceScanError('SOURCE_CHANGED', 'Source entry changed during scan');
}

export async function* walkCandidates(
  rootPath: string,
  mayDescend: (directory: string) => boolean | Promise<boolean>,
  account?: MixedSourceAccount,
  mayVisit?: (path: RepositoryRelativePath, symbolic: boolean) => boolean | Promise<boolean>,
): AsyncIterable<Candidate> {
  const seen = new Set<string>();
  async function* visit(directory: string): AsyncIterable<Candidate> {
    account?.checkpoint();
    const sentinel = RepositoryRelativePathSchema.parse(
      [...relative(rootPath, directory).split(sep).filter(Boolean), '__source_scan__'].join('/'),
    );
    const sentinelAbsolute = join(directory, '__source_scan__');
    const ancestors = account ? await safeAncestors(sentinelAbsolute, sentinel) : null;
    const before = account ? await lstat(directory) : null;
    let entries;
    try {
      entries = account
        ? await opendir(directory)
        : await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        throw changed();
      }
      throw new SourceScanError('FILE_READ_FAILED', 'Cannot read source directory');
    }
    if (Array.isArray(entries))
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for await (const entry of entries) {
      account?.checkpoint();
      account?.visitItem();
      if (ancestors) await assertSameAncestors(sentinelAbsolute, sentinel, ancestors);
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(rootPath, absolutePath).split(sep).join('/');
      if (relativePath === '..' || relativePath.startsWith('../') || isAbsolute(relativePath)) {
        throw new SourceScanError('INVALID_INPUT', 'Source path escapes repository');
      }
      const parsed = RepositoryRelativePathSchema.safeParse(relativePath);
      if (!parsed.success) throw new SourceScanError('INVALID_INPUT', 'Invalid source path');
      if (account && mayVisit && !(await mayVisit(parsed.data, entry.isSymbolicLink()))) continue;
      account?.own(parsed.data);
      let observed;
      try {
        observed = await lstat(absolutePath);
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          throw changed();
        }
        throw new SourceScanError('FILE_READ_FAILED', 'Cannot inspect source entry');
      }
      if (observed.isSymbolicLink()) {
        if (account) throw changed();
        continue;
      }
      if (entry.isDirectory() !== observed.isDirectory() || entry.isFile() !== observed.isFile()) {
        throw changed();
      }
      if (observed.isDirectory()) {
        if (await mayDescend(parsed.data)) yield* visit(absolutePath);
      } else if (observed.isFile()) {
        if (seen.has(parsed.data)) {
          throw new SourceScanError('INVALID_INPUT', 'Source paths collide after normalization');
        }
        seen.add(parsed.data);
        yield { absolutePath, path: parsed.data };
      }
    }
    if (ancestors && before) {
      account?.checkpoint();
      await assertSameAncestors(sentinelAbsolute, sentinel, ancestors);
      const after = await lstat(directory);
      if (after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw changed();
    }
  }
  yield* visit(rootPath);
}
