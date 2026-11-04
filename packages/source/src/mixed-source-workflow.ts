import { compilePathPolicy, selectPath } from './path-policy.js';
import { lstat } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { classifyMixedSample } from './classify.js';
import { fingerprintFileControlled, fingerprintInventory } from './fingerprint.js';
import {
  discoverGitContextControlled,
  gitIgnoredPathsControlled,
  type SourceProcessControl,
} from './git.js';
import { scanWithDependencies } from './scan.js';
import { walkCandidates } from './walk.js';
import { SourceScanError } from './errors.js';
import type { MixedSourceAccount } from './mixed-source-verification.js';
import type { ObservedFile, ObservedWorktree, SourceScanRequest } from './types.js';
import type { RepositoryRelativePath } from '@codeatlas/ir';
export type MixedSourceControl = SourceProcessControl & {
  readonly authorizePath?: (path: RepositoryRelativePath) => void;
};
const policies = new WeakMap<ObservedWorktree, SourceScanRequest['config']>();
function changed(): never {
  throw new SourceScanError('SOURCE_CHANGED', 'Source selection changed');
}
async function observeMixedGitWorktree(
  request: SourceScanRequest,
  account: MixedSourceAccount,
  control: MixedSourceControl,
): Promise<ObservedWorktree> {
  try {
    account.checkpoint();
    account.own(request);
    const config = { include: [...request.config.include], exclude: [...request.config.exclude] };
    const fixed = { ...request, config };
    account.own(fixed);
    const start = await lstat(fixed.startingPath);
    if (!start.isDirectory() || start.isSymbolicLink()) changed();
    const observations = new Map<string, ObservedFile>();
    const policy = compilePathPolicy(config);
    const scan = await scanWithDependencies(
      fixed,
      {
        discoverGitContext: (start, workspace) =>
          discoverGitContextControlled(start, workspace, account, control),
        gitIgnoredPaths: (root, paths) => gitIgnoredPathsControlled(root, paths, account, control),
        walkCandidates: (root, descend) =>
          walkCandidates(root, descend, account, async (p, symbolic) => {
            if (!policy.mayDescend(p)) return false;
            if (!symbolic) return true;
            const ignored = await gitIgnoredPathsControlled(root, [p], account, control);
            return selectPath(p, policy, ignored.has(p));
          }),
        async classifyFile(absolute, p) {
          control.authorizePath?.(p);
          const value = await fingerprintFileControlled(absolute, p, account, classifyMixedSample);
          account.own({ path: p, ...value });
          observations.set(p, { path: p, ...value });
          return value;
        },
      },
      account,
    );
    account.checkpoint();
    const after = await discoverGitContextControlled(
      scan.rootPath,
      fixed.workspaceRoot,
      account,
      control,
    );
    if (
      !isDeepStrictEqual(after, {
        rootPath: scan.rootPath,
        branchName: scan.branchName,
        headCommit: scan.headCommit,
        workspacePosition: scan.workspacePosition,
      })
    )
      changed();
    const files = scan.files.map((f) => observations.get(f.path)!);
    account.own(files);
    const result = Object.freeze({
      ...scan,
      files: Object.freeze(files),
      contentFingerprint: fingerprintInventory(files),
    });
    policies.set(result, config);
    return result;
  } catch (e) {
    account.invalidate();
    throw e;
  }
}
async function verifyMixedSourceSelection(
  request: SourceScanRequest,
  expected: ObservedWorktree,
  account: MixedSourceAccount,
  control: MixedSourceControl,
): Promise<void> {
  try {
    account.checkpoint();
    if (!isDeepStrictEqual(policies.get(expected), request.config)) changed();
    const actual = await observeMixedGitWorktree(request, account, control);
    if (!isDeepStrictEqual(actual, expected)) changed();
  } catch (e) {
    account.invalidate();
    throw e;
  }
}
export default Object.freeze({ observeMixedGitWorktree, verifyMixedSourceSelection });
