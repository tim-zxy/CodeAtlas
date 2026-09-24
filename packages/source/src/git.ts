import { execFile, spawn } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { promisify } from 'node:util';

import { CommitIdentitySchema, RepositoryRelativePathSchema } from '@codeatlas/ir';
import type { RepositoryRelativePath } from '@codeatlas/ir';

import { SourceScanError } from './errors.js';
import type { GitContext } from './types.js';

const execFileAsync = promisify(execFile);

interface GitCommandResult {
  readonly stdout: string;
  readonly exitCode: number;
}

export function decodeGitIgnoredPaths(bytes: Buffer): ReadonlySet<string> {
  if (bytes.length === 0) return new Set();
  if (bytes.at(-1) !== 0) throw new SourceScanError('GIT_FAILED', 'Invalid Git ignore output');
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const paths = decoded.slice(0, -1).split('\0');
    if (paths.some((path) => path.length === 0)) {
      throw new SourceScanError('GIT_FAILED', 'Invalid Git ignore output');
    }
    return new Set(paths);
  } catch {
    throw new SourceScanError('GIT_FAILED', 'Invalid Git ignore output');
  }
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

async function checkIgnoreBatch(
  rootPath: string,
  paths: readonly RepositoryRelativePath[],
): Promise<ReadonlySet<string>> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', rootPath, 'check-ignore', '--no-index', '-z', '--stdin'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    const output: Buffer[] = [];
    let outputBytes = 0;
    let failed = false;
    child.on('error', () => {
      failed = true;
      reject(new SourceScanError('GIT_FAILED', 'Git ignore query failed'));
    });
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 1_000_000) {
        child.kill();
        failed = true;
        reject(new SourceScanError('GIT_FAILED', 'Git ignore output exceeded limit'));
      } else {
        output.push(chunk);
      }
    });
    child.stderr.resume();
    child.on('close', (code) => {
      if (failed) return;
      if (code !== 0 && code !== 1) {
        reject(new SourceScanError('GIT_FAILED', 'Git ignore query failed'));
        return;
      }
      try {
        resolve(decodeGitIgnoredPaths(Buffer.concat(output)));
      } catch {
        reject(new SourceScanError('GIT_FAILED', 'Invalid Git ignore output'));
      }
    });
    child.stdin.on('error', () => {
      failed = true;
      reject(new SourceScanError('GIT_FAILED', 'Git ignore input failed'));
    });
    child.stdin.end(Buffer.from(`${paths.join('\0')}\0`, 'utf8'));
  });
}

export async function gitIgnoredPaths(
  rootPath: string,
  paths: readonly RepositoryRelativePath[],
): Promise<ReadonlySet<string>> {
  const ignored = new Set<string>();
  let batch: RepositoryRelativePath[] = [];
  let batchBytes = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    for (const path of await checkIgnoreBatch(rootPath, batch)) ignored.add(path);
    batch = [];
    batchBytes = 0;
  };
  for (const path of paths) {
    const bytes = Buffer.byteLength(path, 'utf8') + 1;
    if (batch.length >= 128 || batchBytes + bytes > 32_768) await flush();
    batch.push(path);
    batchBytes += bytes;
  }
  await flush();
  return ignored;
}
