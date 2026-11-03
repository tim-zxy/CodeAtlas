import type { MixedSourceAccount } from './mixed-source-verification.js';
import { execFile, spawn } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { promisify } from 'node:util';

import { CommitIdentitySchema, RepositoryRelativePathSchema } from '@codeatlas/ir';
import type { RepositoryRelativePath } from '@codeatlas/ir';

import { SourceScanError } from './errors.js';
import type { GitContext } from './types.js';

const execFileAsync = promisify(execFile);

function gitEnvironment(): NodeJS.ProcessEnv {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_')),
  );
  return { ...environment, GIT_TERMINAL_PROMPT: '0' };
}

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
      env: gitEnvironment(),
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

async function discoverGitContextCore(
  startingPath: string,
  workspaceRoot: string,
  run: typeof git = git,
): Promise<GitContext> {
  const start = await directoryPath(startingPath);
  const workspace = await directoryPath(workspaceRoot);
  const rootResult = await run(start, ['rev-parse', '--show-toplevel']);
  if (rootResult.exitCode !== 0) {
    throw new SourceScanError('NON_GIT_DIRECTORY', 'Directory is not in a Git repository');
  }
  const rootPath = await directoryPath(rootResult.stdout.trim());
  const branch = await run(rootPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (branch.exitCode !== 0 && branch.exitCode !== 1) {
    throw new SourceScanError('GIT_FAILED', 'Cannot observe Git branch');
  }
  const head = await run(rootPath, ['rev-parse', '--verify', '--quiet', 'HEAD']);
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
      env: gitEnvironment(),
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

async function gitIgnoredPathsCore(
  rootPath: string,
  paths: readonly RepositoryRelativePath[],
  check: typeof checkIgnoreBatch = checkIgnoreBatch,
): Promise<ReadonlySet<string>> {
  const ignored = new Set<string>();
  let batch: RepositoryRelativePath[] = [];
  let batchBytes = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    for (const path of await check(rootPath, batch)) ignored.add(path);
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

export function discoverGitContext(start: string, workspace: string): Promise<GitContext> {
  return discoverGitContextCore(start, workspace);
}
export function gitIgnoredPaths(
  root: string,
  paths: readonly RepositoryRelativePath[],
): Promise<ReadonlySet<string>> {
  return gitIgnoredPathsCore(root, paths);
}

export interface SourceProcessControl {
  readonly signal: AbortSignal;
  readonly deadlineEpochMs: number;
}
function sourceStop(code: 'CANCELLED' | 'DEADLINE_EXCEEDED'): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}
/** Private bounded owner; no collector hook or arbitrary command entry. */
async function controlledGit(
  cwd: string,
  args: readonly string[],
  input: Buffer,
  account: MixedSourceAccount,
  control: SourceProcessControl,
): Promise<GitCommandResult> {
  account.checkpoint();
  if (control.signal.aborted) throw sourceStop('CANCELLED');
  const remaining = control.deadlineEpochMs - Date.now();
  if (remaining <= 0) throw sourceStop('DEADLINE_EXCEEDED');
  account.reserveBuffer(1_000_000);
  const output = Buffer.alloc(1_000_000);
  account.readBytes(input.length);
  return await new Promise((resolve, reject) => {
    let failure: unknown,
      closed = false,
      offset = 0,
      stderrBytes = 0,
      grace: NodeJS.Timeout | undefined;
    const child = spawn('git', ['-C', cwd, ...args], {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: gitEnvironment(),
    });
    const fail = (error: unknown) => {
      if (!failure) failure = error;
      if (!closed) {
        child.kill();
        if (!grace) {
          grace = setTimeout(() => {
            if (!closed) child.kill('SIGKILL');
          }, 250);
          grace.unref();
        }
      }
    };
    const abort = () => {
      failure = sourceStop('CANCELLED');
      fail(failure);
    };
    const timer = setTimeout(() => {
      failure = sourceStop('DEADLINE_EXCEEDED');
      fail(failure);
    }, remaining);
    timer.unref();
    control.signal.addEventListener('abort', abort, { once: true });
    child.on('error', () => fail(new SourceScanError('GIT_FAILED', 'Git command failed')));
    child.stdin.on('error', () => fail(new SourceScanError('GIT_FAILED', 'Git input failed')));
    child.stdout.on('error', () =>
      fail(new SourceScanError('GIT_FAILED', 'Git output pipe failed')),
    );
    child.stderr.on('error', () =>
      fail(new SourceScanError('GIT_FAILED', 'Git error pipe failed')),
    );
    child.stdout.on('data', (chunk: Buffer) => {
      if (failure) return;
      try {
        account.checkpoint();
        if (chunk.length > output.length - offset)
          throw new SourceScanError('GIT_FAILED', 'Git output exceeds limit');
        account.readBytes(chunk.length);
        chunk.copy(output, offset);
        offset += chunk.length;
      } catch (e) {
        fail(e);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (failure) return;
      try {
        account.checkpoint();
        stderrBytes += chunk.length;
        if (stderrBytes > 1_000_000)
          throw new SourceScanError('GIT_FAILED', 'Git error output exceeds limit');
        account.readBytes(chunk.length);
      } catch (e) {
        fail(e);
      }
    });
    child.once('close', (code) => {
      closed = true;
      clearTimeout(timer);
      if (grace) clearTimeout(grace);
      control.signal.removeEventListener('abort', abort);
      if (failure) {
        reject(failure);
        return;
      }
      try {
        account.checkpoint();
        account.reserveBuffer(offset);
        const stdout = new TextDecoder('utf-8', { fatal: true }).decode(output.subarray(0, offset));
        resolve({ stdout, exitCode: code ?? -1 });
      } catch (e) {
        reject(e);
      }
    });
    if (control.signal.aborted) {
      abort();
      return;
    }
    try {
      account.checkpoint();
      child.stdin.end(input);
    } catch (e) {
      fail(e);
    }
  });
}
export function discoverGitContextControlled(
  start: string,
  workspace: string,
  account: MixedSourceAccount,
  control: SourceProcessControl,
): Promise<GitContext> {
  return discoverGitContextCore(start, workspace, (cwd, args) =>
    controlledGit(cwd, args, Buffer.alloc(0), account, control),
  );
}
export function gitIgnoredPathsControlled(
  root: string,
  paths: readonly RepositoryRelativePath[],
  account: MixedSourceAccount,
  control: SourceProcessControl,
): Promise<ReadonlySet<string>> {
  return gitIgnoredPathsCore(root, paths, async (cwd, batch) => {
    const bytes = Buffer.byteLength(batch.join('\0')) + 1;
    account.reserveBuffer(bytes);
    const result = await controlledGit(
      cwd,
      ['check-ignore', '--no-index', '-z', '--stdin'],
      Buffer.from(batch.join('\0') + '\0'),
      account,
      control,
    );
    if (result.exitCode !== 0 && result.exitCode !== 1)
      throw new SourceScanError('GIT_FAILED', 'Git ignore query failed');
    account.reserveBuffer(Buffer.byteLength(result.stdout));
    return decodeGitIgnoredPaths(Buffer.from(result.stdout));
  });
}
