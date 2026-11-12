import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { lstat, mkdir, open, readdir, realpath } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import path from 'node:path';
import { types } from 'node:util';
import { stringify } from 'yaml';
import { validateOperationPolicyData } from '@codeatlas/application';
import {
  initializeWorkspaceMetadata,
  verifyWorkspaceInitialization,
  initializeRepositoryMetadata,
  verifyRepositoryInitialization,
} from '../../storage/dist/indexing/workspace-initialization.js';
import {
  loadEffectiveConfig,
  type ConfigurationSources,
  type EffectiveConfig,
} from './effective-config.js';

type Effect = 'NOT_COMMITTED' | 'COMMITTED' | 'UNKNOWN';
type Cleanup = 'SETTLED' | 'UNKNOWN';
export class WorkspaceInitError extends Error {
  constructor(
    readonly code: string,
    readonly directoryCreated: boolean | null = false,
    readonly initializationEffect: Effect = 'NOT_COMMITTED',
    readonly cleanupState: Cleanup = 'SETTLED',
  ) {
    super(code);
    this.name = 'WorkspaceInitError';
  }
}
export interface WorkspaceInitRequest {
  workspaceRoot: string;
  repositories: readonly string[];
  configuration: ConfigurationSources;
}
type Repository = { repositoryId: string; repositoryRoot: string; directoryKey: string };
type Marker = {
  schema: 'codeatlas.workspace-init';
  version: 1;
  status: 'COMPLETE';
  workspaceId: string;
  workspaceRoot: string;
  configSha256: string;
  repositories: Repository[];
};
export interface WorkspaceInitResult {
  readonly outcome: 'CREATED' | 'ALREADY_INITIALIZED';
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly workspaceDatabasePath: string;
  readonly repositories: readonly {
    repositoryId: string;
    repositoryRoot: string;
    databasePath: string;
  }[];
  readonly initializationEffect: 'COMMITTED' | 'UNCHANGED';
  readonly cleanupState: 'SETTLED';
  readonly warnings: EffectiveConfig['warnings'];
}
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const same = (a: BigIntStats, b: BigIntStats) =>
  a.dev === b.dev && a.ino === b.ino && a.birthtimeNs === b.birthtimeNs;
const fields = (value: object, keys: string[]) =>
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
/** Explicit P1-19 metadata initialization only. No Source/Git/Native/model path,
 * cross-database rollback, automatic recovery, user permission or profile grant. */
export async function initializeWorkspace(
  value: WorkspaceInitRequest,
  signal?: AbortSignal,
): Promise<WorkspaceInitResult> {
  let created: boolean | null = false,
    effect: Effect = 'NOT_COMMITTED',
    cleanup: Cleanup = 'SETTLED';
  try {
    validateOperationPolicyData(value);
    const input = JSON.parse(JSON.stringify(value)) as WorkspaceInitRequest;
    fields(input, ['workspaceRoot', 'repositories', 'configuration']);
    assert(typeof input.workspaceRoot === 'string' && path.isAbsolute(input.workspaceRoot));
    assert(
      Array.isArray(input.repositories) &&
        input.repositories.every((p) => typeof p === 'string' && path.isAbsolute(p)),
    );
    if (signal) nativeAborted.call(signal);
    const config = loadEffectiveConfig(input.configuration),
      budget = config.indexing.resourceBudget;
    const deadline = Date.now() + budget.maxDurationMs;
    assert(Number.isSafeInteger(deadline));
    let textBytes = 0,
      rows = 0;
    const checkpoint = async () => {
      if (signal && nativeAborted.call(signal))
        throw Object.assign(Error('CANCELLED'), { code: 'CANCELLED' });
      if (Date.now() >= deadline) throw Object.assign(Error('DEADLINE'), { code: 'DEADLINE' });
    };
    const control = {
      checkpoint,
      reserveText(n: number) {
        assert(Number.isSafeInteger(n) && n >= 0);
        textBytes += n;
        assert(
          Number.isSafeInteger(textBytes) && textBytes <= budget.maxInputBytes,
          'INIT_INPUT_LIMIT',
        );
      },
      chargeMetadataRow() {
        assert(++rows <= budget.maxItems, 'INIT_METADATA_LIMIT');
      },
    };
    control.reserveText(Buffer.byteLength(JSON.stringify(input)));
    await checkpoint();
    const root = await realpath(input.workspaceRoot);
    assert.equal(path.resolve(config.runtime.workspaceRoot), root);
    const repoRoots: string[] = [];
    for (const root of input.repositories) {
      await checkpoint();
      repoRoots.push(await realpath(root));
    }
    repoRoots.sort();
    assert.equal(new Set(repoRoots).size, repoRoots.length);
    const pins: { file: string; stat: BigIntStats }[] = [];
    const pin = async (file: string) => {
      const stat = await lstat(file, { bigint: true });
      assert(stat.isDirectory() && !stat.isSymbolicLink());
      pins.push({ file, stat });
    };
    let ancestor = root;
    while (true) {
      await pin(ancestor);
      const parent = path.dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
    for (const repo of repoRoots) await pin(repo);
    const filePins = new Map<string, BigIntStats>();
    const remember = async (file: string, known?: BigIntStats) => {
      const stat = known ?? (await lstat(file, { bigint: true }));
      assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n);
      assert.equal(await realpath(file), file);
      filePins.set(file, stat);
    };
    const guard = async () => {
      await checkpoint();
      for (const { file, stat } of pins) {
        const now = await lstat(file, { bigint: true });
        assert(now.isDirectory() && !now.isSymbolicLink() && same(stat, now));
        assert.equal(await realpath(file), file);
      }
      for (const [file, stat] of filePins) {
        const now = await lstat(file, { bigint: true });
        assert(
          now.isFile() &&
            !now.isSymbolicLink() &&
            now.nlink === 1n &&
            same(stat, now) &&
            stat.size === now.size &&
            stat.mtimeNs === now.mtimeNs &&
            stat.ctimeNs === now.ctimeNs,
        );
        assert.equal(await realpath(file), file);
      }
    };
    const metadata = path.join(root, '.ekp'),
      configPath = path.join(metadata, 'config.yaml'),
      markerPath = path.join(metadata, 'init.json'),
      databasePath = path.join(metadata, 'workspace.sqlite');
    const { warnings, ...persisted } = config;
    void warnings;
    const configText = stringify(persisted);
    assert(Buffer.byteLength(configText) <= budget.maxOutputBytes);
    const configSha256 = sha(configText);
    const read = async (file: string, maximum: number) => {
      await guard();
      const before = await lstat(file, { bigint: true });
      assert(
        before.isFile() &&
          !before.isSymbolicLink() &&
          before.nlink === 1n &&
          before.size <= BigInt(maximum),
      );
      control.reserveText(Number(before.size) + 1);
      const handle = await open(file, 'r');
      let bytes: Buffer;
      try {
        assert(same(before, await handle.stat({ bigint: true })));
        bytes = Buffer.alloc(Number(before.size) + 1);
        let used = 0;
        while (used < bytes.length) {
          await checkpoint();
          const r = await handle.read(bytes, used, bytes.length - used, null);
          if (!r.bytesRead) break;
          used += r.bytesRead;
        }
        assert.equal(BigInt(used), before.size);
        bytes = bytes.subarray(0, used);
        const after = await handle.stat({ bigint: true }),
          named = await lstat(file, { bigint: true });
        assert(
          same(before, after) &&
            same(before, named) &&
            named.isFile() &&
            named.nlink === 1n &&
            before.size === after.size &&
            before.mtimeNs === after.mtimeNs &&
            before.ctimeNs === after.ctimeNs &&
            before.mtimeNs === named.mtimeNs,
        );
      } finally {
        try {
          await handle.close();
          if (handle.fd !== -1) cleanup = 'UNKNOWN';
        } catch {
          cleanup = 'UNKNOWN';
        }
      }
      assert.equal(cleanup, 'SETTLED');
      await remember(file, before);
      await guard();
      return bytes!;
    };
    const write = async (file: string, text: string, completion = false) => {
      await guard();
      control.reserveText(Buffer.byteLength(text));
      if (completion) effect = 'UNKNOWN';
      const handle = await open(file, 'wx');
      let written: BigIntStats | undefined;
      try {
        await handle.writeFile(text, 'utf8');
        await handle.sync();
        const own = await handle.stat({ bigint: true }),
          named = await lstat(file, { bigint: true });
        assert(
          own.isFile() &&
            own.nlink === 1n &&
            named.isFile() &&
            named.nlink === 1n &&
            same(own, named),
        );
        written = own;
      } finally {
        try {
          await handle.close();
          if (handle.fd !== -1) cleanup = 'UNKNOWN';
        } catch {
          cleanup = 'UNKNOWN';
        }
      }
      assert.equal(cleanup, 'SETTLED');
      if (completion) effect = 'COMMITTED';
      assert(written);
      await remember(file, written);
      await guard();
    };
    await guard();
    let marker: Marker;
    try {
      await mkdir(metadata);
      created = true;
    } catch (error) {
      if (
        !types.isProxy(error) &&
        Object.getOwnPropertyDescriptor(Object(error), 'code')?.value === 'EEXIST'
      )
        created = false;
      else {
        created = null;
        throw error;
      }
    }
    await pin(metadata);
    if (created) {
      marker = {
        schema: 'codeatlas.workspace-init',
        version: 1,
        status: 'COMPLETE',
        workspaceId: randomUUID(),
        workspaceRoot: root,
        configSha256,
        repositories: repoRoots.map((repositoryRoot) => ({
          repositoryId: randomUUID(),
          repositoryRoot,
          directoryKey: randomUUID(),
        })),
      };
      await write(configPath, configText);
      await mkdir(path.join(metadata, 'repositories'));
      await pin(path.join(metadata, 'repositories'));
      for (const repository of marker.repositories) {
        const directory = path.join(metadata, 'repositories', repository.directoryKey);
        await guard();
        await mkdir(directory);
        await pin(directory);
        await initializeRepositoryMetadata(
          {
            databasePath: path.join(directory, 'index.sqlite'),
            repositoryId: repository.repositoryId,
            repositoryRoot: repository.repositoryRoot,
          },
          control,
        );
        await guard();
      }
      await initializeWorkspaceMetadata(
        {
          databasePath,
          workspaceId: marker.workspaceId,
          workspaceRoot: root,
          repositories: marker.repositories.map(({ repositoryId, repositoryRoot }) => ({
            repositoryId,
            repositoryRoot,
          })),
        },
        control,
      );
    } else {
      const bytes = await read(markerPath, budget.maxOutputBytes);
      marker = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      fields(marker, [
        'schema',
        'version',
        'status',
        'workspaceId',
        'workspaceRoot',
        'configSha256',
        'repositories',
      ]);
      assert.equal(marker.schema, 'codeatlas.workspace-init');
      assert.equal(marker.version, 1);
      assert.equal(marker.status, 'COMPLETE');
      assert(uuid(marker.workspaceId));
      assert.equal(marker.workspaceRoot, root);
      assert.equal(marker.configSha256, configSha256);
      assert(Array.isArray(marker.repositories) && marker.repositories.length === repoRoots.length);
      const ids = new Set(),
        directories = new Set();
      for (let i = 0; i < marker.repositories.length; i++) {
        const r = marker.repositories[i]!;
        fields(r, ['repositoryId', 'repositoryRoot', 'directoryKey']);
        assert(uuid(r.repositoryId) && uuid(r.directoryKey));
        assert.equal(r.repositoryRoot, repoRoots[i]);
        assert(!ids.has(r.repositoryId) && !directories.has(r.directoryKey));
        ids.add(r.repositoryId);
        directories.add(r.directoryKey);
      }
      assert.equal(sha(await read(configPath, budget.maxInputBytes)), configSha256);
      await pin(path.join(metadata, 'repositories'));
      for (const r of marker.repositories)
        await pin(path.join(metadata, 'repositories', r.directoryKey));
    }
    await remember(databasePath);
    for (const r of marker.repositories)
      await remember(path.join(metadata, 'repositories', r.directoryKey, 'index.sqlite'));
    for (const r of marker.repositories)
      await verifyRepositoryInitialization(
        {
          databasePath: path.join(metadata, 'repositories', r.directoryKey, 'index.sqlite'),
          repositoryId: r.repositoryId,
          repositoryRoot: r.repositoryRoot,
        },
        control,
      );
    await verifyWorkspaceInitialization(
      {
        databasePath,
        workspaceId: marker.workspaceId,
        workspaceRoot: root,
        repositories: marker.repositories.map(({ repositoryId, repositoryRoot }) => ({
          repositoryId,
          repositoryRoot,
        })),
      },
      control,
    );
    const expected = [
      'config.yaml',
      'repositories',
      'workspace.sqlite',
      ...(created ? [] : ['init.json']),
    ].sort();
    assert.deepEqual((await readdir(metadata)).sort(), expected);
    assert.deepEqual(
      (await readdir(path.join(metadata, 'repositories'))).sort(),
      marker.repositories.map((r) => r.directoryKey).sort(),
    );
    for (const r of marker.repositories)
      assert.deepEqual(await readdir(path.join(metadata, 'repositories', r.directoryKey)), [
        'index.sqlite',
      ]);
    await guard();
    const result: WorkspaceInitResult = Object.freeze({
      outcome: created ? 'CREATED' : 'ALREADY_INITIALIZED',
      workspaceId: marker.workspaceId,
      workspaceRoot: root,
      workspaceDatabasePath: databasePath,
      repositories: Object.freeze(
        marker.repositories.map((r) =>
          Object.freeze({
            repositoryId: r.repositoryId,
            repositoryRoot: r.repositoryRoot,
            databasePath: path.join(metadata, 'repositories', r.directoryKey, 'index.sqlite'),
          }),
        ),
      ),
      initializationEffect: created ? 'COMMITTED' : 'UNCHANGED',
      cleanupState: 'SETTLED',
      warnings: config.warnings,
    });
    assert(Buffer.byteLength(JSON.stringify(result)) <= budget.maxOutputBytes);
    if (created) await write(markerPath, JSON.stringify(marker) + '\n', true);
    return result;
  } catch (error) {
    const own: PropertyDescriptorMap =
      error && typeof error === 'object' && !types.isProxy(error)
        ? Object.getOwnPropertyDescriptors(error)
        : {};
    if (own.cleanupState?.value === 'UNKNOWN') cleanup = 'UNKNOWN';
    const code = ['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED', 'RESOURCE_LIMIT_EXCEEDED'].includes(
      own.code?.value,
    )
      ? own.code!.value
      : 'WORKSPACE_INIT_FAILED';
    throw new WorkspaceInitError(code, created, effect, cleanup);
  }
}
