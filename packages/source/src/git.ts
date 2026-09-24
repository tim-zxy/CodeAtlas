import { execFile } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { promisify } from 'node:util';

import { CommitIdentitySchema, RepositoryRelativePathSchema } from '@codeatlas/ir';

import { SourceScanError } from './errors.js';
import type { GitContext } from './types.js';

const execFileAsync = promisify(execFile);

interface GitCommandResult {
  readonly stdout: string;
  readonly exitCode: number;
}

async function git(cwd: string, args: readonly string[]): Promise<GitCommandResult> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 1_000_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return { stdout, exitCode: 0 };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = error.code;
      if (typeof code === 'number') return { stdout: '', exitCode: code };
    }
    throw new SourceScanError('GIT_FAILED', 'Git command failed');
  }
}

async function directoryPath(value: string): Promise<string> {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SourceScanError('INVALID_INPUT', 'Directory path is required');
  }
  try {
    const resolved = await realpath(value);
    if (!(await stat(resolved)).isDirectory()) {
      throw new SourceScanError('INVALID_INPUT', 'Expected a directory');
    }
    return resolved;
  } catch (error) {
    if (error instanceof SourceScanError) throw error;
    throw new SourceScanError('INVALID_INPUT', 'Directory is unavailable');
  }
}

export async function discoverGitContext(
  startingPath: string,
  workspaceRoot: string,
): Promise<GitContext> {
  const start = await directoryPath(startingPath);
  const workspace = await directoryPath(workspaceRoot);
  const rootResult = await git(start, ['rev-parse', '--show-toplevel']);
  if (rootResult.exitCode !== 0) {
    throw new SourceScanError('NON_GIT_DIRECTORY', 'Directory is not in a Git repository');
  }
  const rootPath = await directoryPath(rootResult.stdout.trim());
  const branch = await git(rootPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (branch.exitCode !== 0 && branch.exitCode !== 1) {
    throw new SourceScanError('GIT_FAILED', 'Cannot observe Git branch');
  }
  const head = await git(rootPath, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  if (head.exitCode !== 0 && head.exitCode !== 1) {
    throw new SourceScanError('GIT_FAILED', 'Cannot observe Git HEAD');
  }
  const locator = relative(workspace, rootPath);
  const workspacePosition: GitContext['workspacePosition'] =
    locator === ''
      ? { kind: 'ROOT' }
      : locator === '..' || locator.startsWith(`..${sep}`) || isAbsolute(locator)
        ? { kind: 'EXTERNAL' }
        : { kind: 'CHILD', path: RepositoryRelativePathSchema.parse(locator.split(sep).join('/')) };
  return {
    rootPath,
    branchName: branch.exitCode === 0 ? branch.stdout.trim() : null,
    headCommit: head.exitCode === 0 ? CommitIdentitySchema.parse(head.stdout.trim()) : null,
    workspacePosition,
  };
}
