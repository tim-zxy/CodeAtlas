import { createHash } from 'node:crypto';
import { lstat, open, opendir, realpath, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { types } from 'node:util';
import type { BigIntStats, Dir } from 'node:fs';

export interface ClosedRuntimePackageLimits {
  maxFileBytes: number;
  maxItems: number;
  maxDepth: number;
  check(): undefined;
}
export class ClosedRuntimePackageError extends Error {
  readonly code = 'CLOSED_RUNTIME_PACKAGE_INVALID';
  constructor(readonly cleanupState: 'SETTLED' | 'UNKNOWN' = 'SETTLED') {
    super('CLOSED_RUNTIME_PACKAGE_INVALID');
    this.name = 'ClosedRuntimePackageError';
  }
}
// A failed close is not a release proof. Keep the actual owned object strongly
// reachable until process exit; this module never retries or relies on GC cleanup.
const uncertainHandles = new Set<FileHandle | Dir>();
async function closeOwned(handle: FileHandle | Dir): Promise<void> {
  try {
    await handle.close();
  } catch {
    uncertainHandles.add(handle);
    throw new ClosedRuntimePackageError('UNKNOWN');
  }
}
function safeError(error: unknown): ClosedRuntimePackageError {
  const unknown =
    error &&
    typeof error === 'object' &&
    !types.isProxy(error) &&
    Object.getOwnPropertyDescriptor(error, 'cleanupState')?.value === 'UNKNOWN';
  return new ClosedRuntimePackageError(unknown ? 'UNKNOWN' : 'SETTLED');
}
const fail = (): never => {
  throw new ClosedRuntimePackageError();
};
function need(value: unknown): asserts value {
  if (!value) fail();
}
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const hashPattern = /^[0-9a-f]{64}$/;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const folded = (value: string) => value.toUpperCase();
function relative(value: unknown): asserts value is string {
  need(typeof value === 'string' && value.length > 0 && value.isWellFormed());
  need(
    !value.includes('\\') &&
      !/[\u0000-\u001f\u007f<>\"|?*]/.test(value) &&
      !value.includes(':') &&
      !path.posix.isAbsolute(value),
  );
  need(
    value
      .split('/')
      .every(
        (part) =>
          part !== '' &&
          part !== '.' &&
          part !== '..' &&
          !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part) &&
          !/[. ]$/.test(part),
      ),
  );
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  need(value && typeof value === 'object' && !Array.isArray(value) && !types.isProxy(value));
  need(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  need(Reflect.ownKeys(descriptors).length === keys.length);
  for (const key of keys)
    need(descriptors[key]?.enumerable && Object.hasOwn(descriptors[key]!, 'value'));
  return value as Record<string, unknown>;
}
function meter(limits: Omit<ClosedRuntimePackageLimits, 'check'>, check?: () => undefined) {
  let items = 0;
  const stop = () => {
    if (!check) return;
    const result: unknown = check();
    if (types.isPromise(result))
      void Promise.prototype.then.call(result, undefined, () => undefined);
    need(result === undefined);
  };
  return {
    stop,
    tick(depth: number) {
      stop();
      need(depth <= limits.maxDepth && ++items <= limits.maxItems);
    },
  };
}
type Meter = ReturnType<typeof meter>;
function canonical(value: unknown, account: Meter, depth = 0): string {
  account.tick(depth);
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    need(value.isWellFormed());
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    need(Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0));
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return '[' + value.map((item) => canonical(item, account, depth + 1)).join(',') + ']';
  need(value && typeof value === 'object');
  return (
    '{' +
    Object.keys(value)
      .sort(compare)
      .map((key) => {
        need(key.isWellFormed());
        return (
          JSON.stringify(key) +
          ':' +
          canonical((value as Record<string, unknown>)[key], account, depth + 1)
        );
      })
      .join(',') +
    '}'
  );
}
function lexicalDepth(text: string, maxDepth: number) {
  let quoted = false,
    escaped = false,
    depth = 0;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{' || character === '[') need(++depth <= maxDepth + 1);
    else if (character === '}' || character === ']') depth--;
  }
}
function identity(stat: BigIntStats) {
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtime: stat.mtimeNs,
    ctime: stat.ctimeNs,
    mode: stat.mode,
  };
}
type Identity = ReturnType<typeof identity>;
const sameIdentity = (a: Identity, b: Identity) =>
  Object.keys(a).every((key) => a[key as keyof Identity] === b[key as keyof Identity]);
interface FileEntry {
  path: string;
  bytes: number;
  sha256: string;
}
interface LinkEntry {
  path: string;
  target: string;
}
interface Catalog {
  files: FileEntry[];
  links: LinkEntry[];
}
async function readOnce(root: string, name: string, max: number, account: Meter) {
  account.stop();
  const full = path.join(root, ...name.split('/'));
  const named = await lstat(full, { bigint: true });
  need(
    named.isFile() && !named.isSymbolicLink() && named.nlink === 1n && named.size <= BigInt(max),
  );
  need((await realpath(full)) === full);
  account.stop();
  const handle = await open(full, 'r');
  try {
    const before = await handle.stat({ bigint: true });
    need(sameIdentity(identity(before), identity(named)));
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let length = 0;
    while (length < bytes.length) {
      account.stop();
      const read = await handle.read(bytes, length, bytes.length - length, length);
      account.stop();
      if (read.bytesRead === 0) break;
      length += read.bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    const finalNamed = await lstat(full, { bigint: true });
    need(
      length === Number(before.size) &&
        sameIdentity(identity(before), identity(after)) &&
        sameIdentity(identity(before), identity(finalNamed)) &&
        !finalNamed.isSymbolicLink() &&
        finalNamed.nlink === 1n,
    );
    need((await realpath(full)) === full);
    return { bytes: bytes.subarray(0, length), identity: identity(before) };
  } finally {
    await closeOwned(handle);
  }
}
function parseCatalog(bytes: Buffer, account: Meter, maxDepth: number): Catalog {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  lexicalDepth(text, maxDepth);
  const parsed: unknown = JSON.parse(text);
  need(canonical(parsed, account) === text);
  const row = object(parsed, [
    'schema',
    'version',
    'sourceRevision',
    'dependencyLockSha256',
    'files',
    'links',
  ]);
  need(row.schema === 'codeatlas.closed-runtime-package' && row.version === 1);
  need(
    typeof row.sourceRevision === 'string' &&
      row.sourceRevision.length > 0 &&
      row.sourceRevision.trim() === row.sourceRevision,
  );
  need(typeof row.dependencyLockSha256 === 'string' && hashPattern.test(row.dependencyLockSha256));
  need(Array.isArray(row.files) && Array.isArray(row.links));
  const seen = new Set<string>();
  function unique(name: string) {
    const key = folded(name);
    need(!seen.has(key) && key !== 'CLOSED-RUNTIME.JSON');
    seen.add(key);
  }
  const files = row.files.map((value) => {
    const file = object(value, ['path', 'bytes', 'sha256']);
    relative(file.path);
    unique(file.path);
    need(typeof file.bytes === 'number' && Number.isSafeInteger(file.bytes) && file.bytes >= 0);
    need(typeof file.sha256 === 'string' && hashPattern.test(file.sha256));
    return file as unknown as FileEntry;
  });
  const links = row.links.map((value) => {
    const link = object(value, ['path', 'target']);
    relative(link.path);
    relative(link.target);
    unique(link.path);
    need(folded(link.path) !== folded(link.target));
    return link as unknown as LinkEntry;
  });
  for (const list of [files, links])
    for (let i = 1; i < list.length; i++) need(compare(list[i - 1]!.path, list[i]!.path) < 0);
  return { files, links };
}
interface TopologyEntry {
  identity: Identity;
  kind: 'FILE' | 'DIRECTORY' | 'ALIAS';
  target?: string;
}
async function topology(root: string, catalog: Catalog, account: Meter) {
  const expected = new Map<string, 'FILE' | 'DIRECTORY' | 'ALIAS'>([
    ['', 'DIRECTORY'],
    ['closed-runtime.json', 'FILE'],
  ]);
  const foldedNames = new Map<string, string>();
  function add(name: string, kind: 'FILE' | 'DIRECTORY' | 'ALIAS') {
    const key = folded(name),
      prior = foldedNames.get(key);
    need(prior === undefined || prior === name);
    foldedNames.set(key, name);
    need(!expected.has(name) || expected.get(name) === kind);
    expected.set(name, kind);
  }
  function parents(name: string) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) add(parts.slice(0, i).join('/'), 'DIRECTORY');
  }
  for (const file of catalog.files) {
    parents(file.path);
    add(file.path, 'FILE');
  }
  for (const link of catalog.links) {
    parents(link.path);
    add(link.path, 'ALIAS');
    parents(link.target);
    add(link.target, 'DIRECTORY');
  }
  const aliases = new Map(catalog.links.map((link) => [link.path, link.target]));
  const result = new Map<string, TopologyEntry>();
  async function visit(name: string, depth: number): Promise<void> {
    account.tick(depth);
    const full = name ? path.join(root, ...name.split('/')) : root;
    const stat = await lstat(full, { bigint: true });
    const kind = expected.get(name);
    need(kind);
    if (kind === 'ALIAS') {
      need(stat.isSymbolicLink());
      const targetName = aliases.get(name)!;
      const target = path.join(root, ...targetName.split('/'));
      const targetStat = await lstat(target, { bigint: true });
      need(targetStat.isDirectory() && !targetStat.isSymbolicLink());
      need((await realpath(target)) === target && (await realpath(full)) === target);
      result.set(name, { identity: identity(stat), kind, target });
      return;
    }
    need(!stat.isSymbolicLink() && (await realpath(full)) === full);
    if (kind === 'FILE') {
      need(stat.isFile() && stat.nlink === 1n);
      result.set(name, { identity: identity(stat), kind });
      return;
    }
    need(stat.isDirectory());
    result.set(name, { identity: identity(stat), kind });
    const entries = await opendir(full);
    try {
      while (true) {
        account.stop();
        const entry = await entries.read();
        account.stop();
        if (entry === null) break;
        await visit(name ? name + '/' + entry.name : entry.name, depth + 1);
      }
    } finally {
      await closeOwned(entries);
    }
  }
  await visit('', 0);
  need(result.size === expected.size);
  return result;
}
/** Bounded data verification only, not KnownFolder/ACL admission, code trust,
 * a principal grant, or proof of all Windows reparse tags. OS admission must also
 * reject unsupported FILE_ATTRIBUTE_REPARSE_POINT tags through its native check. */
export async function readClosedRuntimePackage(
  rootInput: string,
  artifactRelativePath: string,
  expectedArtifactSha256: string,
  limitsInput: ClosedRuntimePackageLimits,
) {
  try {
    const input = object(limitsInput, ['maxFileBytes', 'maxItems', 'maxDepth', 'check']);
    for (const key of ['maxFileBytes', 'maxItems', 'maxDepth'])
      need(
        typeof input[key] === 'number' &&
          Number.isSafeInteger(input[key]) &&
          (input[key] as number) > 0,
      );
    need(
      typeof input.check === 'function' &&
        !types.isProxy(input.check) &&
        !types.isAsyncFunction(input.check),
    );
    const limits = {
      maxFileBytes: input.maxFileBytes as number,
      maxItems: input.maxItems as number,
      maxDepth: input.maxDepth as number,
    };
    const account = meter(limits, input.check as () => undefined);
    need(
      typeof rootInput === 'string' &&
        rootInput.length > 0 &&
        !rootInput.includes('\0') &&
        path.isAbsolute(rootInput),
    );
    const root = path.resolve(rootInput);
    relative(artifactRelativePath);
    need(hashPattern.test(expectedArtifactSha256));
    account.stop();
    const rootStat = await lstat(root, { bigint: true });
    need(rootStat.isDirectory() && !rootStat.isSymbolicLink() && (await realpath(root)) === root);
    const manifest = await readOnce(root, 'closed-runtime.json', limits.maxFileBytes, account);
    const catalog = parseCatalog(manifest.bytes, account, limits.maxDepth);
    const artifact = catalog.files.find((file) => file.path === artifactRelativePath);
    need(artifact && artifact.sha256 === expectedArtifactSha256);
    const initial = await topology(root, catalog, account);
    need(
      sameIdentity(initial.get('')!.identity, identity(rootStat)) &&
        sameIdentity(initial.get('closed-runtime.json')!.identity, manifest.identity),
    );
    let artifactBytes: Buffer | undefined;
    for (const file of catalog.files) {
      account.stop();
      need(file.bytes <= limits.maxFileBytes);
      const read = await readOnce(root, file.path, limits.maxFileBytes, account);
      need(
        read.bytes.length === file.bytes &&
          digest(read.bytes) === file.sha256 &&
          sameIdentity(read.identity, initial.get(file.path)!.identity),
      );
      if (file.path === artifactRelativePath) artifactBytes = read.bytes;
    }
    need(artifactBytes);
    account.stop();
    const final = await topology(root, catalog, account);
    need(final.size === initial.size);
    for (const [name, entry] of final)
      need(
        entry.kind === initial.get(name)!.kind &&
          entry.target === initial.get(name)!.target &&
          sameIdentity(entry.identity, initial.get(name)!.identity),
      );
    return Object.freeze({
      manifestBytes: manifest.bytes,
      artifactBytes,
      contentDigest: digest(manifest.bytes),
      root,
      async recheck(): Promise<void> {
        try {
          const current = await topology(root, catalog, meter(limits));
          need(current.size === initial.size);
          for (const [name, entry] of current)
            need(
              entry.kind === initial.get(name)!.kind &&
                entry.target === initial.get(name)!.target &&
                sameIdentity(entry.identity, initial.get(name)!.identity),
            );
        } catch (error) {
          throw safeError(error);
        }
      },
    });
  } catch (error) {
    throw safeError(error);
  }
}
