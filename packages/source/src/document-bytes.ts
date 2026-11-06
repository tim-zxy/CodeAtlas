import { createHash } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { ensurePhase1Data, SourceFileSchema, type SourceFile } from '@codeatlas/ir';
import { SourceScanError } from './errors.js';
import { safeAncestors, assertSameAncestors } from './path-safety.js';
import type { MixedSourceAccount } from './mixed-source-verification.js';

function changed(): never {
  throw new SourceScanError('SOURCE_CHANGED', 'Document source changed during reading');
}
function sameFile(a: Awaited<ReturnType<typeof lstat>>, b: Awaited<ReturnType<typeof lstat>>) {
  return (
    b.isFile() &&
    b.nlink === 1 &&
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.ctimeMs === b.ctimeMs
  );
}
/** Package-private transport only. The trusted caller owns selection and RAW policy.
 * Bytes are exclusively owned by the caller, mutable, unredacted, and not an authority token.
 */
export async function readDocumentSourceBytes(
  input: { rootPath: string; file: SourceFile },
  account: MixedSourceAccount,
  authorize: (file: Readonly<SourceFile>) => void | Promise<void>,
): Promise<{
  bytes: Buffer;
  contentFingerprint: SourceFile['contentFingerprint'];
  sizeBytes: number;
}> {
  try {
    account.checkpoint();
    account.own(input);
    ensurePhase1Data(input);
    if (
      Object.keys(input).length !== 2 ||
      !Object.hasOwn(input, 'rootPath') ||
      !Object.hasOwn(input, 'file') ||
      typeof input.rootPath !== 'string' ||
      !path.isAbsolute(input.rootPath) ||
      input.rootPath.includes('\0') ||
      input.rootPath.trim() !== input.rootPath ||
      typeof authorize !== 'function'
    )
      throw new SourceScanError('INVALID_INPUT', 'Invalid document source input');
    account.own(input.file);
    const file = SourceFileSchema.parse(input.file);
    Object.freeze(file.classification);
    Object.freeze(file);
    if (file.classification.contentKind !== 'TEXT')
      throw new SourceScanError('INVALID_INPUT', 'Document source must be text');
    await authorize(file);
    account.checkpoint();
    const root = path.resolve(input.rootPath);
    const rootIdentity = await lstat(root);
    const checkRoot = async () => {
      account.checkpoint();
      const current = await lstat(root);
      if (
        !current.isDirectory() ||
        current.isSymbolicLink() ||
        current.dev !== rootIdentity.dev ||
        current.ino !== rootIdentity.ino ||
        path.relative(root, await realpath(root)) !== ''
      )
        changed();
    };
    await checkRoot();
    const absolute = path.resolve(root, ...file.path.split('/'));
    const relative = path.relative(root, absolute);
    if (
      !relative ||
      relative === '..' ||
      relative.startsWith('..' + path.sep) ||
      path.isAbsolute(relative)
    )
      changed();
    const ancestors = await safeAncestors(absolute, file.path);
    const before = await lstat(absolute);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      !Number.isSafeInteger(before.size) ||
      before.size < 0
    )
      changed();
    account.reserveBuffer(before.size);
    account.checkpoint();
    const bytes = Buffer.alloc(before.size);
    const handle = await open(absolute, 'r');
    let length = 0;
    const hash = createHash('sha256');
    try {
      await checkRoot();
      await assertSameAncestors(absolute, file.path, ancestors);
      if (!sameFile(before, await handle.stat())) changed();
      while (length < before.size) {
        account.checkpoint();
        const allowance = Math.min(65536, before.size - length);
        account.readBytes(allowance);
        account.checkpoint();
        const { bytesRead } = await handle.read(bytes, length, allowance, length);
        if (!bytesRead) changed();
        hash.update(bytes.subarray(length, length + bytesRead));
        length += bytesRead;
      }
      if (!sameFile(before, await handle.stat())) changed();
      await assertSameAncestors(absolute, file.path, ancestors);
    } finally {
      await handle.close();
    }
    if (!sameFile(before, await lstat(absolute))) changed();
    await assertSameAncestors(absolute, file.path, ancestors);
    await checkRoot();
    const contentFingerprint = 'sha256:' + hash.digest('hex');
    if (contentFingerprint !== file.contentFingerprint) changed();
    await authorize(file);
    account.checkpoint();
    account.own({ contentFingerprint, sizeBytes: length });
    account.checkpoint();
    return { bytes, contentFingerprint: file.contentFingerprint, sizeBytes: length };
  } catch (error) {
    account.invalidate();
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      changed();
    throw error;
  }
}
