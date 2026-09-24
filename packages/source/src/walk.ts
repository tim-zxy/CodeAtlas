import { lstat, readdir } from 'node:fs/promises';
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
): AsyncIterable<Candidate> {
  const seen = new Set<string>();
  async function* visit(directory: string): AsyncIterable<Candidate> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
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
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(rootPath, absolutePath).split(sep).join('/');
      if (relativePath === '..' || relativePath.startsWith('../') || isAbsolute(relativePath)) {
        throw new SourceScanError('INVALID_INPUT', 'Source path escapes repository');
      }
      const parsed = RepositoryRelativePathSchema.safeParse(relativePath);
      if (!parsed.success) throw new SourceScanError('INVALID_INPUT', 'Invalid source path');
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
      if (observed.isSymbolicLink()) continue;
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
  }
  yield* visit(rootPath);
}
