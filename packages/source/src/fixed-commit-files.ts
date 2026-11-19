import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { ensurePhase1Data, RepositoryRelativePathSchema } from '@codeatlas/ir';
import { readBoundedRegularFile } from './document-bytes.js';
import { SourceScanError } from './errors.js';
import type { MixedSourceAccount } from './mixed-source-verification.js';

interface FixedSelection {
  repositoryId: string;
  rootPath: string;
  commitOid: string;
  paths: readonly string[];
  maxObjectBytes: number;
}

function requireInput(ok: unknown): asserts ok {
  if (!ok) throw new SourceScanError('INVALID_INPUT', 'Invalid fixed commit selection');
}
function requireObject(ok: unknown): asserts ok {
  if (!ok)
    throw new SourceScanError('SOURCE_CHANGED', 'Fixed Git object unavailable or inconsistent');
}

// Only this hashed-object directory is consulted. Packs, alternates, linked
// worktrees, remotes, config, replacement refs and the checkout are never opened.
export async function readFixedCommitFiles(
  input: FixedSelection,
  account: MixedSourceAccount,
  authorize: (relativePath: string) => void | Promise<void>,
): Promise<{
  repositoryId: string;
  commitOid: string;
  files: { path: string; bytes: Buffer; blobOid: string; contentFingerprint: string }[];
}> {
  try {
    account.checkpoint();
    account.own(input);
    ensurePhase1Data(input);
    const { repositoryId, rootPath, commitOid, maxObjectBytes } = input;
    requireInput(
      typeof repositoryId === 'string' &&
        repositoryId.trim() === repositoryId &&
        repositoryId.length > 0 &&
        typeof rootPath === 'string' &&
        path.isAbsolute(rootPath) &&
        !rootPath.includes('\0') &&
        typeof commitOid === 'string' &&
        /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commitOid) &&
        Array.isArray(input.paths) &&
        input.paths.length > 0 &&
        Number.isSafeInteger(maxObjectBytes) &&
        maxObjectBytes > 0 &&
        maxObjectBytes <= 0x7fffffff,
    );
    const root = path.resolve(rootPath);
    const paths = input.paths.map((value) => {
      const p = RepositoryRelativePathSchema.parse(value);
      requireInput(p.isWellFormed() && !p.split('/').some((s) => s.toLowerCase() === '.git'));
      return p;
    });
    requireInput(new Set(paths).size === paths.length);
    for (const p of paths) {
      await authorize(p);
      account.checkpoint();
    }
    const rootIdentity = await lstat(root);
    const checkRoot = async () => {
      const stat = await lstat(root);
      requireObject(
        stat.isDirectory() &&
          !stat.isSymbolicLink() &&
          stat.dev === rootIdentity.dev &&
          stat.ino === rootIdentity.ino &&
          path.relative(root, await realpath(root)) === '',
      );
    };
    await checkRoot();
    const hash = commitOid.length === 40 ? 'sha1' : 'sha256';
    async function readObject(oid: string, kind: 'commit' | 'tree' | 'blob') {
      account.visitItem();
      const objectPath = RepositoryRelativePathSchema.parse(
        '.git/objects/' + oid.slice(0, 2) + '/' + oid.slice(2),
      );
      const { bytes } = await readBoundedRegularFile(root, objectPath, account, maxObjectBytes);
      account.checkpoint();
      account.reserveBuffer(2 * maxObjectBytes);
      const raw = inflateSync(bytes, { maxOutputLength: maxObjectBytes });
      account.checkpoint();
      requireObject(createHash(hash).update(raw).digest('hex') === oid);
      const nul = raw.indexOf(0);
      requireObject(
        nul > 0 && raw.subarray(0, nul).equals(Buffer.from(kind + ' ' + (raw.length - nul - 1))),
      );
      return raw.subarray(nul + 1);
    }
    const commit = await readObject(commitOid, 'commit');
    const firstLine = commit.subarray(0, 5 + commitOid.length);
    requireObject(
      commit[firstLine.length] === 10 &&
        /^tree (?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(firstLine.toString('latin1')),
    );
    const rootTree = firstLine.subarray(5).toString('latin1');
    const files = [];
    for (const p of paths) {
      let oid = rootTree;
      const parts = p.split('/');
      for (const [index, part] of parts.entries()) {
        const tree = await readObject(oid, 'tree');
        const name = Buffer.from(part);
        let found: string | undefined;
        for (let offset = 0; offset < tree.length;) {
          account.visitItem();
          const space = tree.indexOf(32, offset),
            end = tree.indexOf(0, space + 1);
          const next = end + 1 + commitOid.length / 2;
          requireObject(space > offset && end > space + 1 && next <= tree.length);
          if (tree.subarray(space + 1, end).equals(name)) {
            const mode = tree.subarray(offset, space).toString('latin1');
            requireObject(
              found === undefined &&
                (index === parts.length - 1
                  ? ['100644', '100755'].includes(mode)
                  : mode === '40000'),
            );
            found = tree.subarray(end + 1, next).toString('hex');
          }
          offset = next;
        }
        requireObject(found !== undefined);
        oid = found;
      }
      await authorize(p);
      account.checkpoint();
      const blob = await readObject(oid, 'blob');
      // The transport delivers only file bytes, with no Git header or spare inflate buffer.
      account.reserveBuffer(blob.length);
      const bytes = Buffer.alloc(blob.length);
      blob.copy(bytes);
      files.push({
        path: p,
        blobOid: oid,
        bytes,
        contentFingerprint: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
      });
    }
    await checkRoot();
    for (const p of paths) {
      await authorize(p);
      account.checkpoint();
    }
    return { repositoryId, commitOid, files };
  } catch (error) {
    account.invalidate();
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      throw new SourceScanError('SOURCE_CHANGED', 'Fixed Git object is not available locally');
    throw error;
  }
}
