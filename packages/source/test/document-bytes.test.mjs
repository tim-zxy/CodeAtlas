import test from 'node:test';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, link, rename, mkdir, symlink } from 'node:fs/promises';
import { appendFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const fingerprint = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const api = () => import('../dist/document-bytes.js');
function account(hook = () => {}) {
  return {
    invalid: false,
    reserved: 0,
    read: 0,
    checkpoint() {
      hook(this);
    },
    own() {},
    visitItem() {},
    reserveBuffer(n) {
      this.reserved += n;
    },
    readBytes(n) {
      this.read += n;
    },
    invalidate() {
      this.invalid = true;
    },
  };
}
async function setup(t, bytes = Buffer.from('\ufeff# \u4e2d\u6587 \ud83d\ude00\r\nbody\n')) {
  const rootPath = await mkdtemp(join(tmpdir(), 'codeatlas-document-bytes-'));
  t.after(() => rm(rootPath, { recursive: true, force: true }));
  const filePath = join(rootPath, 'note.md');
  await writeFile(filePath, bytes);
  const file = {
    id: 'file:doc',
    repositoryId: 'repo:one',
    revisionId: 'rev:one',
    path: 'note.md',
    contentFingerprint: fingerprint(bytes),
    languageHint: null,
    classification: { role: 'OTHER', provenance: 'AUTHORED', contentKind: 'TEXT' },
    sensitivity: 'INTERNAL',
  };
  return { input: { rootPath, file }, filePath, bytes };
}
test('authorized bytes retain BOM, CRLF, UTF8 and original fingerprint without a shared cache', async (t) => {
  const { input, bytes } = await setup(t);
  const a = account();
  const authorized = [];
  const out = await (await api()).readDocumentSourceBytes(input, a, (f) => authorized.push(f.path));
  assert.deepEqual(out.bytes, bytes);
  assert.equal(out.contentFingerprint, fingerprint(bytes));
  assert.equal(out.sizeBytes, bytes.length);
  assert.equal(a.read, bytes.length);
  assert.equal(a.reserved, bytes.length);
  assert.equal(a.invalid, false);
  assert.ok(authorized.length >= 2);
  out.bytes.fill(0);
  const again = await (await api()).readDocumentSourceBytes(input, account(), () => {});
  assert.deepEqual(again.bytes, bytes);
});
test('authorization denial precedes opening a nonexistent root', async () => {
  const x = {
    rootPath: join(tmpdir(), 'never-open-document-root'),
    file: {
      id: 'file:doc',
      repositoryId: 'repo:one',
      revisionId: 'rev:one',
      path: 'note.md',
      contentFingerprint: fingerprint('x'),
      languageHint: null,
      classification: { role: 'OTHER', provenance: 'AUTHORED', contentKind: 'TEXT' },
      sensitivity: 'INTERNAL',
    },
  };
  const denied = Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' });
  const a = account();
  await assert.rejects(
    (await api()).readDocumentSourceBytes(x, a, () => {
      throw denied;
    }),
    (e) => e === denied,
  );
  assert.equal(a.invalid, true);
  assert.equal(a.read, 0);
  assert.equal(a.reserved, 0);
});
test('wrong fingerprint, traversal and hardlinks refuse without a result', async (t) => {
  const { input, filePath } = await setup(t);
  const run = (await api()).readDocumentSourceBytes;
  await assert.rejects(
    run(
      { ...input, file: { ...input.file, contentFingerprint: fingerprint('other') } },
      account(),
      () => {},
    ),
    { code: 'SOURCE_CHANGED' },
  );
  await assert.rejects(
    run({ ...input, file: { ...input.file, path: '../note.md' } }, account(), () => {}),
  );
  await link(filePath, join(input.rootPath, 'other.md'));
  const a = account();
  await assert.rejects(
    run(input, a, () => {}),
    { code: 'SOURCE_CHANGED' },
  );
  assert.equal(a.read, 0);
});
test('budget and cancellation refuse before allocation or returning partial bytes', async (t) => {
  const { input } = await setup(t);
  const run = (await api()).readDocumentSourceBytes;
  const stopped = Object.assign(new Error('cancel'), { code: 'CANCELLED' });
  const a = account();
  a.reserveBuffer = () => {
    throw stopped;
  };
  await assert.rejects(
    run(input, a, () => {}),
    (e) => e === stopped,
  );
  assert.equal(a.read, 0);
  assert.equal(a.invalid, true);
  const b = account();
  b.readBytes = () => {
    throw stopped;
  };
  await assert.rejects(
    run(input, b, () => {}),
    (e) => e === stopped,
  );
  assert.equal(b.invalid, true);
});
test('growth during reading and permission revocation refuse and close the handle', async (t) => {
  const { input, filePath } = await setup(t);
  let changed = false;
  const a = account((x) => {
    if (x.read > 0 && !changed) {
      changed = true;
      appendFileSync(filePath, 'changed');
    }
  });
  const run = (await api()).readDocumentSourceBytes;
  await assert.rejects(
    run(input, a, () => {}),
    { code: 'SOURCE_CHANGED' },
  );
  assert.equal(a.invalid, true);
  const { input: second, filePath: secondPath } = await setup(t);
  let calls = 0;
  await assert.rejects(
    run(second, account(), () => {
      if (++calls > 1) throw Object.assign(new Error('revoked'), { code: 'PERMISSION_DENIED' });
    }),
    { code: 'PERMISSION_DENIED' },
  );
  await rename(secondPath, secondPath + '.closed');
});

test('empty and multi-chunk documents keep exact bytes with one prepaid output buffer', async (t) => {
  const run = (await api()).readDocumentSourceBytes;
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(150001, 97)]) {
    const { input } = await setup(t, bytes);
    const a = account();
    const out = await run(input, a, () => {});
    assert.deepEqual(out.bytes, bytes);
    assert.equal(a.read, bytes.length);
    assert.equal(a.reserved, bytes.length);
  }
});
test('a directory junction and an opened-file replacement are refused', async (t) => {
  const { input, bytes } = await setup(t);
  const run = (await api()).readDocumentSourceBytes;
  await mkdir(join(input.rootPath, 'actual'));
  await writeFile(join(input.rootPath, 'actual', 'note.md'), bytes);
  await symlink(join(input.rootPath, 'actual'), join(input.rootPath, 'docs'), 'junction');
  const a = account();
  await assert.rejects(
    run({ ...input, file: { ...input.file, path: 'docs/note.md' } }, a, () => {}),
    { code: 'SOURCE_CHANGED' },
  );
  assert.equal(a.read, 0);
  const { input: second, filePath } = await setup(t);
  let replaced = false;
  const b = account((x) => {
    if (x.read > 0 && !replaced) {
      replaced = true;
      renameSync(filePath, filePath + '.old');
      writeFileSync(filePath, bytes);
    }
  });
  await assert.rejects(
    run(second, b, () => {}),
    { code: 'SOURCE_CHANGED' },
  );
  assert.equal(b.invalid, true);
});
test('real Application RAW policy blocks missing permission and secret paths before read', async (t) => {
  const { authorizeOperation } = await import('../../application/dist/operation-policy.js');
  const { input } = await setup(t);
  const run = (await api()).readDocumentSourceBytes;
  const policy = {
    operation: 'READ_SOURCE',
    phase: 'PRIMARY',
    scope: { workspaceId: 'ws:one', repositoryId: 'repo:one' },
    callerCapabilities: ['READ_SOURCE'],
    permissionContext: {
      workspaceId: 'ws:one',
      repositoryIds: ['repo:one'],
      allowedOperations: ['READ_SOURCE'],
    },
    source: {
      path: 'note.md',
      classification: 'INTERNAL',
      form: 'RAW',
      secretDetected: false,
      policyBlocked: false,
      derivedAccessAllowed: false,
    },
    destination: 'LOCAL',
    settings: {
      localOnly: true,
      remoteLlmEnabled: false,
      remoteEmbeddingEnabled: false,
      allowRemoteFallback: false,
      allowSensitiveRemote: false,
      allowRawSourceRemote: false,
    },
  };
  for (const [file, capabilities, expected] of [
    [input.file, [], 'PERMISSION_DENIED'],
    [{ ...input.file, path: '.env.md' }, ['READ_SOURCE'], 'SECURITY_POLICY_BLOCKED'],
    [{ ...input.file, repositoryId: 'repo:foreign' }, ['READ_SOURCE'], 'PERMISSION_DENIED'],
  ]) {
    const a = account();
    await assert.rejects(
      run({ ...input, file }, a, (f) => {
        const d = authorizeOperation({
          ...policy,
          scope: { ...policy.scope, repositoryId: f.repositoryId },
          callerCapabilities: capabilities,
          source: { ...policy.source, path: f.path, classification: f.sensitivity },
        });
        if (!d.allowed) throw Object.assign(new Error(d.code), { code: d.code });
      }),
      { code: expected },
    );
    assert.equal(a.read, 0);
    assert.equal(a.reserved, 0);
  }
});

test('asynchronous initial and final authorization failures cannot expose bytes', async (t) => {
  const { input } = await setup(t);
  const run = (await api()).readDocumentSourceBytes;
  const failure = Object.assign(new Error('revoked'), { code: 'PERMISSION_DENIED' });
  for (const stopAt of [1, 2]) {
    const a = account();
    let calls = 0;
    await assert.rejects(
      run(input, a, () => {
        if (++calls !== stopAt) return;
        const rejected = Promise.reject(failure);
        rejected.catch(() => {});
        return rejected;
      }),
      (e) => e === failure,
    );
    assert.equal(a.invalid, true);
    if (stopAt === 1) {
      assert.equal(a.read, 0);
      assert.equal(a.reserved, 0);
    }
  }
});

test('document root selector remains bound when asynchronous authorization mutates caller input', async (t) => {
  const { input, bytes } = await setup(t);
  const admittedRoot = input.rootPath;
  const a = account();
  const out = await (
    await api()
  ).readDocumentSourceBytes(input, a, async () => {
    await Promise.resolve();
    input.rootPath = join(admittedRoot, 'missing-root');
  });
  assert.deepEqual(out.bytes, bytes);
  assert.equal(a.invalid, false);
});

test('authorization cannot redirect a missing admitted root to an existing document root', async (t) => {
  const { input } = await setup(t);
  const existingRoot = input.rootPath;
  input.rootPath = join(existingRoot, 'missing-root');
  const a = account();
  await assert.rejects(
    (await api()).readDocumentSourceBytes(input, a, async () => {
      await Promise.resolve();
      input.rootPath = existingRoot;
    }),
    { code: 'SOURCE_CHANGED' },
  );
  assert.equal(a.read, 0);
  assert.equal(a.invalid, true);
});

for (const hasPrimary of [false, true])
  test(`document close failure refuses bytes with UNKNOWN cleanup (primary=${hasPrimary})`, async (t) => {
    const { input } = await setup(t);
    const run = (await api()).readDocumentSourceBytes;
    const open = fs.open;
    let closed = 0;
    fs.open = async (...args) => {
      const handle = await open(...args);
      const close = handle.close.bind(handle);
      handle.close = async () => {
        await close(); // Test releases its real handle before injecting an uncertain close outcome.
        closed++;
        throw Error('synthetic private close detail');
      };
      return handle;
    };
    syncBuiltinESMExports();
    try {
      const primary = hasPrimary
        ? Object.freeze(Object.assign(Error('private primary detail'), { code: 'CANCELLED' }))
        : null;
      {
        const a = account();
        if (primary)
          a.readBytes = () => {
            throw primary;
          };
        await assert.rejects(
          run(input, a, () => {}),
          (error) => {
            assert.equal(error.code, primary ? 'CANCELLED' : 'FILE_READ_FAILED');
            assert.equal(error.cleanupState, 'UNKNOWN');
            assert.equal(String(error).includes('private'), false);
            return true;
          },
        );
        assert.equal(a.invalid, true);
      }
      assert.equal(closed, 1);
    } finally {
      fs.open = open;
      syncBuiltinESMExports();
    }
  });
