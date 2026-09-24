import { EntityIdSchema, RepositoryRelativePathSchema } from '@codeatlas/ir';

import { classifyFile } from './classify.js';
import { SourceScanError } from './errors.js';
import { discoverGitContext, gitIgnoredPaths } from './git.js';
import { compilePathPolicy, selectPath } from './path-policy.js';
import type { ScannedFile, SourceScanRequest, SourceScanResult } from './types.js';
import { walkCandidates } from './walk.js';
import type { Candidate } from './walk.js';

export interface ScanDependencies {
  readonly discoverGitContext: typeof discoverGitContext;
  readonly gitIgnoredPaths: typeof gitIgnoredPaths;
  readonly walkCandidates: typeof walkCandidates;
  readonly classifyFile: typeof classifyFile;
}

export async function scanWithDependencies(
  request: SourceScanRequest,
  dependencies: ScanDependencies,
): Promise<SourceScanResult> {
  try {
    const parsedId = EntityIdSchema.safeParse(request?.repositoryId);
    if (!parsedId.success) throw new SourceScanError('INVALID_INPUT', 'Invalid repository ID');
    const policy = compilePathPolicy(request.config);
    const context = await dependencies.discoverGitContext(
      request.startingPath,
      request.workspaceRoot,
    );
    const files: ScannedFile[] = [];
    const pending: Candidate[] = [];
    const flush = async (): Promise<void> => {
      const ignored = await dependencies.gitIgnoredPaths(
        context.rootPath,
        pending.map((candidate) => candidate.path),
      );
      for (const candidate of pending) {
        if (!selectPath(candidate.path, policy, ignored.has(candidate.path))) continue;
        const observed = await dependencies.classifyFile(candidate.absolutePath, candidate.path);
        files.push(
          Object.freeze({
            path: candidate.path,
            languageHint: observed.languageHint,
            classification: Object.freeze(observed.classification),
          }),
        );
      }
      pending.length = 0;
    };
    const mayDescend = async (directory: string): Promise<boolean> => {
      if (!policy.mayDescend(directory)) return false;
      if (policy.couldIncludeDescendant(directory)) return true;
      const path = RepositoryRelativePathSchema.safeParse(directory);
      if (!path.success)
        throw new SourceScanError('INVALID_INPUT', 'Invalid source directory path');
      const ignored = await dependencies.gitIgnoredPaths(context.rootPath, [path.data]);
      return !ignored.has(path.data);
    };
    for await (const candidate of dependencies.walkCandidates(context.rootPath, mayDescend)) {
      pending.push(candidate);
      if (pending.length >= 128) await flush();
    }
    if (pending.length > 0) await flush();
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return Object.freeze({
      ...context,
      workspacePosition: Object.freeze(context.workspacePosition),
      repositoryId: parsedId.data,
      files: Object.freeze(files),
    });
  } catch (error) {
    if (error instanceof SourceScanError) throw error;
    throw new SourceScanError('FILE_READ_FAILED', 'Source scan failed');
  }
}

const productionDependencies: ScanDependencies = Object.freeze({
  discoverGitContext,
  gitIgnoredPaths,
  walkCandidates,
  classifyFile,
});

export const scanGitRepository = (request: SourceScanRequest): Promise<SourceScanResult> =>
  scanWithDependencies(request, productionDependencies);
