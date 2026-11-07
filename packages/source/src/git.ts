import type { MixedSourceAccount } from './mixed-source-verification.js';
import { execFile, spawn } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { promisify, types } from 'node:util';
import { createHash } from 'node:crypto';

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

interface GitLaunchPlan {
  readonly executablePath: string;
  readonly arguments: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly stdinSha256: string;
}
// Identity witness for the current private launch-preparation window only.
const ownedGitLaunchPlans = new WeakMap<
  object,
  { readonly proof: Readonly<{ role: 'GIT'; plan: GitLaunchPlan }>; readonly active: () => boolean }
>();
function readOwnedGitLaunchPlan(plan: unknown): Readonly<{ role: 'GIT'; plan: GitLaunchPlan }> {
  const owned =
    typeof plan === 'object' && plan !== null ? ownedGitLaunchPlans.get(plan) : undefined;
  if (!owned || !owned.active()) throw gitFailure();
  return owned.proof;
}
const claimedGitLaunchPlans = new WeakSet<object>();
function claimOwnedGitLaunchPlan(plan: unknown): Readonly<{ role: 'GIT'; plan: GitLaunchPlan }> {
  const owned = readOwnedGitLaunchPlan(plan);
  if (claimedGitLaunchPlans.has(owned.plan)) throw gitFailure();
  claimedGitLaunchPlans.add(owned.plan);
  return owned;
}
export default Object.freeze({ readOwnedGitLaunchPlan, claimOwnedGitLaunchPlan });

interface GitLifecycle {
  beforeSpawn(plan: Readonly<GitLaunchPlan>, signal: AbortSignal): Promise<void>;
  beforeInput(
    child: Readonly<{
      pid: number;
      executablePath: string;
      spawnStartedEpochMs: number;
      spawnedEpochMs: number;
    }>,
    signal: AbortSignal,
  ): Promise<void>;
  afterClose(
    result: Readonly<{ exitCode: number | null; signal: NodeJS.Signals | null }>,
    signal?: AbortSignal,
  ): Promise<void>;
  dispose(signal?: AbortSignal): Promise<void>;
}
interface GitQualification {
  readonly executablePath: string;
  readonly environment: Readonly<Record<string, string>>;
  createLifecycle(plan: Readonly<GitLaunchPlan>): GitLifecycle;
}
export interface SourceProcessControl {
  readonly qualification?: GitQualification;
  readonly signal: AbortSignal;
  readonly deadlineEpochMs: number;
}
function sourceStop(code: 'CANCELLED' | 'DEADLINE_EXCEEDED'): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}
function gitFailure(): SourceScanError {
  return new SourceScanError('GIT_FAILED', 'Git qualification failed');
}
function unknownGitCleanup(error: unknown): Error {
  let copy: Error;
  if (error instanceof SourceScanError) copy = new SourceScanError(error.code, error.message);
  else if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    [
      'CANCELLED',
      'DEADLINE_EXCEEDED',
      'STAGE_LIMIT_EXCEEDED',
      'HISTORY_LIMIT_EXCEEDED',
      'STAGE_RELEASED',
      'INVALID_STAGE',
    ].includes(String(error.code))
  )
    copy = Object.assign(new Error(String(error.code)), { code: error.code });
  else copy = gitFailure();
  return Object.assign(copy, { cleanupState: 'UNKNOWN' });
}
function privateData(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw gitFailure();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).some((k) => typeof k !== 'string' || (keys && !keys.includes(k)))
  )
    throw gitFailure();
  for (const d of Object.values(descriptors))
    if (!d.enumerable || !Object.hasOwn(d, 'value')) throw gitFailure();
  if (keys && keys.some((k) => !Object.hasOwn(descriptors, k))) throw gitFailure();
  return value as Record<string, unknown>;
}
/** Deep-private validation only; does not inspect or authorize an executable. */
export function validateGitQualification(value: unknown): GitQualification {
  const q = privateData(value, ['executablePath', 'environment', 'createLifecycle']);
  if (
    typeof q.executablePath !== 'string' ||
    !isAbsolute(q.executablePath) ||
    q.executablePath.includes('\0') ||
    typeof q.createLifecycle !== 'function' ||
    types.isProxy(q.createLifecycle)
  )
    throw gitFailure();
  const env = privateData(q.environment),
    names = new Set<string>();
  for (const [key, value] of Object.entries(env)) {
    if (
      !key ||
      key.includes('=') ||
      key.includes('\0') ||
      typeof value !== 'string' ||
      value.includes('\0') ||
      names.has(key.toUpperCase())
    )
      throw gitFailure();
    names.add(key.toUpperCase());
  }
  const fixed: Record<string, string> = Object.create(null);
  // Block fixed Node/libuv host supplementation without reading host values.
  for (const name of [
    'HOMEDRIVE',
    'HOMEPATH',
    'LOGONSERVER',
    'PATH',
    'SYSTEMDRIVE',
    'SYSTEMROOT',
    'TEMP',
    'USERDOMAIN',
    'USERNAME',
    'USERPROFILE',
    'WINDIR',
    'NODE_V8_COVERAGE',
  ])
    fixed[name] = '';
  for (const [name, value] of Object.entries(env)) fixed[name.toUpperCase()] = value as string;
  return Object.freeze({
    executablePath: q.executablePath,
    environment: Object.freeze({ ...fixed }),
    createLifecycle: (q.createLifecycle as GitQualification['createLifecycle']).bind(value),
  });
}
async function gitGate(
  action: (signal: AbortSignal) => Promise<void>,
  control: SourceProcessControl,
  other?: AbortSignal,
  cleanup = false,
): Promise<void> {
  const stop = new AbortController();
  let rejectStop!: (error: Error) => void;
  const stopped = new Promise<never>((_resolve, reject) => {
    rejectStop = reject;
  });
  const fail = (deadlineExpired = false) => {
    const error = control.signal.aborted
      ? sourceStop('CANCELLED')
      : deadlineExpired || Date.now() >= control.deadlineEpochMs
        ? sourceStop('DEADLINE_EXCEEDED')
        : gitFailure();
    stop.abort(error);
    rejectStop(error);
  };
  const abort = () => fail();
  const timer = setTimeout(() => fail(true), Math.max(0, control.deadlineEpochMs - Date.now()));
  control.signal.addEventListener('abort', abort, { once: true });
  other?.addEventListener('abort', abort, { once: true });
  try {
    if (control.signal.aborted || other?.aborted || Date.now() >= control.deadlineEpochMs) fail();
    await Promise.race([
      Promise.resolve().then(() => {
        if (stop.signal.aborted && !cleanup) throw stop.signal.reason;
        return action(stop.signal);
      }),
      stopped,
    ]);
    if (control.signal.aborted) throw sourceStop('CANCELLED');
    if (Date.now() >= control.deadlineEpochMs) throw sourceStop('DEADLINE_EXCEEDED');
  } finally {
    clearTimeout(timer);
    control.signal.removeEventListener('abort', abort);
    other?.removeEventListener('abort', abort);
  }
}
/** Private bounded owner; optional qualification hooks never enter public Source exports. */
async function controlledGit(
  cwd: string,
  args: readonly string[],
  input: Buffer,
  account: MixedSourceAccount,
  control: SourceProcessControl,
): Promise<GitCommandResult> {
  account.checkpoint();
  if (control.signal.aborted) throw sourceStop('CANCELLED');
  if (control.deadlineEpochMs - Date.now() <= 0) throw sourceStop('DEADLINE_EXCEEDED');
  let lifecycle: GitLifecycle | undefined, primary: unknown;
  try {
    let executablePath = 'git',
      environment: Readonly<NodeJS.ProcessEnv> =
        control.qualification === undefined ? gitEnvironment() : Object.freeze({}),
      launchCwd: string | undefined;
    const launchArguments = Object.freeze(['-C', cwd, ...args]);
    if (control.qualification !== undefined) {
      const q = validateGitQualification(control.qualification);
      executablePath = q.executablePath;
      environment = q.environment;
      launchCwd = process.cwd();
      const plan = Object.freeze({
        executablePath,
        arguments: launchArguments,
        environment: environment as Readonly<Record<string, string>>,
        cwd: launchCwd,
        stdinSha256: createHash('sha256').update(input).digest('hex'),
      });
      account.own(plan);
      const parentSignal = control.signal,
        deadlineEpochMs = control.deadlineEpochMs;
      let gateSignal: AbortSignal | undefined;
      ownedGitLaunchPlans.set(plan, {
        proof: Object.freeze({ role: 'GIT', plan }),
        active: () => !parentSignal.aborted && !gateSignal?.aborted && Date.now() < deadlineEpochMs,
      });
      try {
        const candidate = privateData(q.createLifecycle(plan), [
          'beforeSpawn',
          'beforeInput',
          'afterClose',
          'dispose',
        ]);
        if (Object.values(candidate).some((v) => typeof v !== 'function' || types.isProxy(v)))
          throw gitFailure();
        lifecycle = Object.freeze({
          beforeSpawn: (candidate.beforeSpawn as GitLifecycle['beforeSpawn']).bind(candidate),
          beforeInput: (candidate.beforeInput as GitLifecycle['beforeInput']).bind(candidate),
          afterClose: (candidate.afterClose as GitLifecycle['afterClose']).bind(candidate),
          dispose: (candidate.dispose as GitLifecycle['dispose']).bind(candidate),
        });
        await gitGate((signal) => {
          gateSignal = signal;
          return lifecycle!.beforeSpawn(plan, signal);
        }, control);
      } finally {
        ownedGitLaunchPlans.delete(plan);
      }
    }
    account.checkpoint();
    if (control.signal.aborted) throw sourceStop('CANCELLED');
    const remaining = control.deadlineEpochMs - Date.now();
    if (remaining <= 0) throw sourceStop('DEADLINE_EXCEEDED');
    account.reserveBuffer(1_000_000);
    const output = Buffer.alloc(1_000_000);
    account.readBytes(input.length);
    return await new Promise<GitCommandResult>((resolve, reject) => {
      let failure: unknown,
        closed = false,
        offset = 0,
        stderrBytes = 0,
        grace: NodeJS.Timeout | undefined;
      const spawnStartedEpochMs = Date.now(),
        stop = new AbortController();
      const child = spawn(executablePath, [...launchArguments], {
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: environment,
        ...(launchCwd === undefined ? {} : { cwd: launchCwd }),
      });
      const fail = (error: unknown) => {
        if (!failure) failure = error;
        stop.abort(error);
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
      let writing: Promise<void> = Promise.resolve();
      child.once('close', (code, signal) => {
        closed = true;
        void (async () => {
          try {
            await writing;
            if (lifecycle) {
              try {
                await gitGate(
                  (stopSignal) =>
                    lifecycle!.afterClose(Object.freeze({ exitCode: code, signal }), stopSignal),
                  control,
                  undefined,
                  true,
                );
              } catch (error) {
                if (!failure) failure = error;
                failure = unknownGitCleanup(failure);
              }
            }
            if (failure) throw failure;
            account.checkpoint();
            account.reserveBuffer(offset);
            const stdout = new TextDecoder('utf-8', { fatal: true }).decode(
              output.subarray(0, offset),
            );
            resolve({ stdout, exitCode: code ?? -1 });
          } catch (e) {
            reject(e);
          } finally {
            clearTimeout(timer);
            if (grace) clearTimeout(grace);
            control.signal.removeEventListener('abort', abort);
          }
        })();
      });
      if (lifecycle) {
        writing = (async () => {
          const spawnedEpochMs = await new Promise<number>((resolve, reject) => {
            const cleanup = () => {
              child.removeListener('spawn', ready);
              child.removeListener('error', failed);
              child.removeListener('close', failed);
            };
            const ready = () => {
              cleanup();
              resolve(Date.now());
            };
            const failed = () => {
              cleanup();
              reject(gitFailure());
            };
            child.once('spawn', ready);
            child.once('error', failed);
            child.once('close', failed);
          });
          if (!Number.isSafeInteger(child.pid) || child.pid! <= 0) throw gitFailure();
          await gitGate(
            (signal) =>
              lifecycle!.beforeInput(
                Object.freeze({
                  pid: child.pid!,
                  executablePath,
                  spawnStartedEpochMs,
                  spawnedEpochMs,
                }),
                signal,
              ),
            control,
            stop.signal,
          );
          if (closed) {
            if (input.length !== 0) throw gitFailure();
            return;
          }
          account.checkpoint();
          if (control.signal.aborted) throw sourceStop('CANCELLED');
          child.stdin.end(input);
        })().catch((e) => {
          fail(e);
        });
      } else {
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
      }
    });
  } catch (error) {
    if (control.qualification === undefined) {
      primary = error;
      throw error;
    }
    let mapped: unknown = error;
    if (control.signal.aborted) mapped = sourceStop('CANCELLED');
    else if (Date.now() >= control.deadlineEpochMs) mapped = sourceStop('DEADLINE_EXCEEDED');
    else if (
      !(error instanceof SourceScanError) &&
      !(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        [
          'CANCELLED',
          'DEADLINE_EXCEEDED',
          'STAGE_LIMIT_EXCEEDED',
          'HISTORY_LIMIT_EXCEEDED',
          'STAGE_RELEASED',
          'INVALID_STAGE',
        ].includes(String(error.code))
      )
    )
      mapped = gitFailure();
    if (
      error &&
      typeof error === 'object' &&
      Object.getOwnPropertyDescriptor(error, 'cleanupState')?.value === 'UNKNOWN'
    )
      mapped = unknownGitCleanup(mapped);
    primary = mapped;
    throw mapped;
  } finally {
    if (lifecycle) {
      try {
        await gitGate((signal) => lifecycle!.dispose(signal), control, undefined, true);
      } catch (error) {
        throw unknownGitCleanup(primary ?? error);
      }
    }
  }
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
