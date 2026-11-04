import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { types } from 'node:util';
import {
  SourceFileSchema,
  RepositoryRelativePathSchema,
  type SourceFile,
  type RepositoryRelativePath,
} from '@codeatlas/ir';
import { fingerprintFileControlled } from './fingerprint.js';

export interface MixedSourceAccount {
  checkpoint(): void;
  own(value: unknown): void;
  reserveBuffer(bytes: number): void;
  readBytes(bytes: number): void;
  visitItem(): void;
  invalidate(): void;
}
export interface MixedSourceVerificationInput {
  rootPath: string;
  files: readonly SourceFile[];
  removedPaths: readonly RepositoryRelativePath[];
}
export class MixedSourceVerificationError extends Error {
  constructor(readonly code: 'INVALID_SOURCE_INPUT' | 'SOURCE_CHANGED') {
    super(code);
    this.name = 'MixedSourceVerificationError';
  }
}
function check(
  v: unknown,
  code: 'INVALID_SOURCE_INPUT' | 'SOURCE_CHANGED' = 'INVALID_SOURCE_INPUT',
): asserts v {
  if (!v) throw new MixedSourceVerificationError(code);
}
function data(v: unknown, keys: readonly string[]): Record<string, unknown> {
  check(v !== null && typeof v === 'object' && !types.isProxy(v));
  check(Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
  const own = Reflect.ownKeys(v);
  check(own.length === keys.length);
  for (const k of own) {
    check(typeof k === 'string' && keys.includes(k));
    const d = Object.getOwnPropertyDescriptor(v, k)!;
    check(d.enumerable && Object.hasOwn(d, 'value'));
  }
  return v as Record<string, unknown>;
}
function values(v: unknown, account: MixedSourceAccount): unknown[] {
  check(Array.isArray(v) && !types.isProxy(v) && Object.getPrototypeOf(v) === Array.prototype);
  const result: unknown[] = [];
  for (let i = 0; i < v.length; i++) {
    account.checkpoint();
    account.visitItem();
    const d = Object.getOwnPropertyDescriptor(v, String(i));
    check(d?.enumerable && Object.hasOwn(d, 'value'));
    result.push(d.value);
  }
  check(Reflect.ownKeys(v).length === v.length + 1);
  return result;
}
/** Checks supplied bytes only; inventory completeness, policy and publication remain caller-owned. */
export async function verifyMixedSourceFiles(
  input: MixedSourceVerificationInput,
  account: MixedSourceAccount,
): Promise<void> {
  try {
    account.checkpoint();
    const r = data(input, ['rootPath', 'files', 'removedPaths']);
    check(
      typeof r.rootPath === 'string' &&
        r.rootPath.trim() === r.rootPath &&
        path.isAbsolute(r.rootPath) &&
        !r.rootPath.includes('\0'),
    );
    account.own(r.rootPath);
    const files: SourceFile[] = [],
      ids = new Set<string>(),
      paths = new Set<string>();
    for (const value of values(r.files, account)) {
      const f = data(value, [
        'id',
        'repositoryId',
        'revisionId',
        'path',
        'contentFingerprint',
        'classification',
        'languageHint',
        'sensitivity',
      ]);
      data(f.classification, ['role', 'provenance', 'contentKind']);
      account.own(f);
      // Prepay the parsed copy from the same validated data before Zod allocates it.
      account.own(f);
      const parsed = SourceFileSchema.safeParse(f);
      check(parsed.success);
      check(!ids.has(parsed.data.id) && !paths.has(parsed.data.path));
      ids.add(parsed.data.id);
      paths.add(parsed.data.path);
      files.push(parsed.data);
    }
    const removed = new Set<string>();
    for (const value of values(r.removedPaths, account)) {
      check(typeof value === 'string');
      account.own(value);
      const parsed = RepositoryRelativePathSchema.safeParse(value);
      check(parsed.success);
      check(!removed.has(parsed.data) && !paths.has(parsed.data));
      removed.add(parsed.data);
    }
    account.checkpoint();
    const root = path.resolve(r.rootPath),
      before = await lstat(root);
    check(before.isDirectory() && !before.isSymbolicLink(), 'SOURCE_CHANGED');
    check(path.relative(root, await realpath(root)) === '', 'SOURCE_CHANGED');
    const checkRoot = async () => {
      account.checkpoint();
      const now = await lstat(root);
      check(
        now.isDirectory() &&
          !now.isSymbolicLink() &&
          now.dev === before.dev &&
          now.ino === before.ino,
        'SOURCE_CHANGED',
      );
      check(path.relative(root, await realpath(root)) === '', 'SOURCE_CHANGED');
    };
    for (const file of files) {
      await checkRoot();
      const absolute = path.resolve(root, ...file.path.split('/')),
        relative = path.relative(root, absolute);
      check(
        relative !== '' &&
          relative !== '..' &&
          !relative.startsWith('..' + path.sep) &&
          !path.isAbsolute(relative),
      );
      const observed = await fingerprintFileControlled(absolute, file.path, account);
      check(observed.contentFingerprint === file.contentFingerprint, 'SOURCE_CHANGED');
      await checkRoot();
    }
    await checkRoot();
  } catch (error) {
    account.invalidate();
    if (error instanceof MixedSourceVerificationError) throw error;
    const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : null;
    if (
      [
        'STAGE_LIMIT_EXCEEDED',
        'HISTORY_LIMIT_EXCEEDED',
        'STAGE_RELEASED',
        'INVALID_STAGE',
        'CANCELLED',
        'DEADLINE_EXCEEDED',
      ].includes(String(code))
    )
      throw error;
    throw new MixedSourceVerificationError('SOURCE_CHANGED');
  }
}
