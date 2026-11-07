import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
const url = new URL('../dist/closed-runtime-package.js', import.meta.url);
const api = await import(url.href).catch(() => ({}));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) =>
  value && typeof value === 'object'
    ? Array.isArray(value)
      ? '[' + value.map(canonical).join(',') + ']'
      : '{' +
        Object.keys(value)
          .sort()
          .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
          .join(',') +
        '}'
    : JSON.stringify(value);
const limits = { maxFileBytes: 100000, maxItems: 10000, maxDepth: 30, check: () => undefined };
async function fixture(t, aliases = false) {
  const temporaryRoot = resolve(tmpdir()),
    directory = await fs.mkdtemp(join(temporaryRoot, 'closed-runtime-'));
  const root = join(directory, 'package');
  await fs.mkdir(join(root, 'packages', 'runtime', 'dist'), { recursive: true });
  const artifactPath = 'packages/runtime/dist/helper.dll',
    artifact = Buffer.from('owned artifact bytes');
  const data = Buffer.from('export const value=1;');
  await fs.writeFile(join(root, ...artifactPath.split('/')), artifact);
  await fs.writeFile(join(root, 'packages', 'runtime', 'dist', 'index.js'), data);
  const manifest = {
    schema: 'codeatlas.closed-runtime-package',
    version: 1,
    sourceRevision: 'test-owned-no-git',
    dependencyLockSha256: '0'.repeat(64),
    files: [
      { path: artifactPath, bytes: artifact.length, sha256: hash(artifact) },
      { path: 'packages/runtime/dist/index.js', bytes: data.length, sha256: hash(data) },
    ],
    links: [],
  };
  if (aliases) {
    await fs.mkdir(join(root, 'node_modules', '@codeatlas'), { recursive: true });
    await fs.symlink(
      join(root, 'packages', 'runtime'),
      join(root, 'node_modules', '@codeatlas', 'runtime'),
      'junction',
    );
    manifest.links.push({ path: 'node_modules/@codeatlas/runtime', target: 'packages/runtime' });
  }
  const write = () => fs.writeFile(join(root, 'closed-runtime.json'), canonical(manifest));
  await write();
  t.after(async () => {
    assert.equal(resolve(dirname(directory)), temporaryRoot);
    assert.ok(basename(directory).startsWith('closed-runtime-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { root, directory, manifest, write, artifactPath, artifact, pin: hash(artifact) };
}
const read = (f, controls = limits) =>
  api.readClosedRuntimePackage(f.root, f.artifactPath, f.pin, controls);
test('closed package reader exists as a private data-only API', () => {
  assert.ok(existsSync(url));
  assert.equal(typeof api.readClosedRuntimePackage, 'function');
});
test('bounded manifest, exact artifact and catalog-declared internal directory alias validate', async (t) => {
  const f = await fixture(t, true),
    result = await read(f);
  assert.equal(result.contentDigest, hash(await fs.readFile(join(f.root, 'closed-runtime.json'))));
  assert.equal(result.root, f.root);
  assert.deepEqual(result.artifactBytes, f.artifact);
  assert.deepEqual(result.manifestBytes, await fs.readFile(join(f.root, 'closed-runtime.json')));
  await result.recheck();
  assert.equal('trusted' in result || 'principal' in result || 'permission' in result, false);
});
test('recheck performs no payload open and never invokes the initial liveness callback', async (t) => {
  const f = await fixture(t, true);
  let callbacks = 0,
    closed = false;
  const result = await read(f, {
    ...limits,
    check: () => {
      assert.equal(closed, false);
      callbacks++;
      return undefined;
    },
  });
  closed = true;
  const count = callbacks,
    originalOpen = fs.open;
  fs.open = () => {
    throw Error('recheck must not open payloads');
  };
  const { syncBuiltinESMExports } = await import('node:module');
  syncBuiltinESMExports();
  try {
    await result.recheck();
    assert.equal(callbacks, count);
  } finally {
    fs.open = originalOpen;
    syncBuiltinESMExports();
  }
});
for (const mutation of [
  'unknown-file',
  'unknown-directory',
  'changed-content',
  'replaced-file',
  'manifest-change',
  'alias-retarget',
])
  test('stat/topology recheck refuses ' + mutation, async (t) => {
    const f = await fixture(t, true),
      result = await read(f);
    const artifact = join(f.root, ...f.artifactPath.split('/'));
    if (mutation === 'unknown-file') await fs.writeFile(join(f.root, 'extra.txt'), 'extra');
    if (mutation === 'unknown-directory') await fs.mkdir(join(f.root, 'extra'));
    if (mutation === 'changed-content')
      await fs.writeFile(artifact, Buffer.alloc(f.artifact.length, 1));
    if (mutation === 'replaced-file') {
      await fs.unlink(artifact);
      await fs.writeFile(artifact, f.artifact);
    }
    if (mutation === 'manifest-change')
      await fs.appendFile(join(f.root, 'closed-runtime.json'), '\n');
    if (mutation === 'alias-retarget') {
      await fs.unlink(join(f.root, 'node_modules', '@codeatlas', 'runtime'));
      await fs.symlink(
        join(f.root, 'packages', 'runtime', 'dist'),
        join(f.root, 'node_modules', '@codeatlas', 'runtime'),
        'junction',
      );
    }
    await assert.rejects(result.recheck(), /CLOSED_RUNTIME_PACKAGE_INVALID/);
  });
for (const mutation of [
  'bad-hash',
  'bad-size',
  'wrong-pin',
  'unknown-field',
  'duplicate-case',
  'unsorted',
  'traversal',
  'noncanonical',
  'duplicate-key',
  'unknown-file',
  'unknown-alias',
  'escape-alias',
  'alias-loop',
  'hardlink',
])
  test('initial package refuses ' + mutation, async (t) => {
    const f = await fixture(t, true);
    if (mutation === 'bad-hash') f.manifest.files[0].sha256 = 'f'.repeat(64);
    if (mutation === 'bad-size') f.manifest.files[0].bytes++;
    if (mutation === 'wrong-pin') f.pin = 'f'.repeat(64);
    if (mutation === 'unknown-field') f.manifest.permission = true;
    if (mutation === 'duplicate-case')
      f.manifest.files.push({ ...f.manifest.files[0], path: f.artifactPath.toUpperCase() });
    if (mutation === 'unsorted') f.manifest.files.reverse();
    if (mutation === 'traversal') f.manifest.files[0].path = '../outside';
    if (mutation === 'unknown-file') await fs.writeFile(join(f.root, 'extra'), 'x');
    if (mutation === 'unknown-alias')
      await fs.symlink(join(f.root, 'packages'), join(f.root, 'unknown'), 'junction');
    if (mutation === 'escape-alias') {
      const outside = join(f.directory, 'outside');
      await fs.mkdir(outside);
      await fs.unlink(join(f.root, 'node_modules', '@codeatlas', 'runtime'));
      await fs.symlink(outside, join(f.root, 'node_modules', '@codeatlas', 'runtime'), 'junction');
    }
    if (mutation === 'alias-loop') {
      f.manifest.links[0].target = 'node_modules/@codeatlas/runtime';
    }
    if (mutation === 'hardlink')
      await fs.link(join(f.root, ...f.artifactPath.split('/')), join(f.directory, 'second-link'));
    await f.write();
    if (mutation === 'noncanonical') await fs.appendFile(join(f.root, 'closed-runtime.json'), '\n');
    if (mutation === 'duplicate-key') {
      const filename = join(f.root, 'closed-runtime.json'),
        raw = await fs.readFile(filename, 'utf8');
      await fs.writeFile(filename, raw.replace('"version":1', '"version":1,"version":1'));
    }
    await assert.rejects(read(f), /CLOSED_RUNTIME_PACKAGE_INVALID/);
  });
test('explicit borrowed initial controls refuse budget/depth and unsafe callback values', async (t) => {
  const f = await fixture(t);
  for (const controls of [
    { ...limits, maxFileBytes: 1 },
    { ...limits, maxItems: 1 },
    { ...limits, maxDepth: 1 },
    { ...limits, check: async () => undefined },
    { ...limits, check: () => true },
    { ...limits, check: () => Promise.reject(Error('private')) },
    { ...limits, check: new Proxy(() => undefined, {}) },
  ])
    await assert.rejects(read(f, controls), /CLOSED_RUNTIME_PACKAGE_INVALID/);
  await new Promise((resolve) => setImmediate(resolve));
});

for (const invalid of [
  'CON',
  'aux.txt',
  'sub/NUL.dll',
  'COM1',
  'lpt9.log',
  'bad?.dll',
  'bad*.dll',
  'bad<.dll',
  'bad>.dll',
  'bad|.dll',
  'bad".dll',
  'bad\u0001.dll',
  'closed-runtime.json',
  'CLOSED-RUNTIME.JSON',
])
  test('canonical catalog rejects Windows-special path ' + JSON.stringify(invalid), async (t) => {
    const f = await fixture(t);
    f.manifest.files[0].path = invalid;
    f.manifest.files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    await f.write();
    await assert.rejects(read(f), /CLOSED_RUNTIME_PACKAGE_INVALID/);
  });
test('raw canonical manifest refuses a leading UTF8 BOM', async (t) => {
  const f = await fixture(t),
    filename = join(f.root, 'closed-runtime.json');
  await fs.writeFile(
    filename,
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), await fs.readFile(filename)]),
  );
  await assert.rejects(read(f), /CLOSED_RUNTIME_PACKAGE_INVALID/);
});
for (const resource of ['file', 'directory'])
  test(
    'real owned ' + resource + ' close-before-call failure retains UNKNOWN and an open handle',
    async (t) => {
      const f = await fixture(t);
      const originalOpen = fs.open,
        originalOpendir = fs.opendir;
      const { Dir } = await import('node:fs');
      const { syncBuiltinESMExports } = await import('node:module');
      const originalDirClose = Dir.prototype.close;
      const captured = resource === 'directory' ? await read(f) : null;
      let held,
        actualFileClose,
        closeCalls = 0;
      if (resource === 'file')
        fs.open = async (...args) => {
          const handle = await originalOpen(...args);
          if (!held) {
            held = handle;
            actualFileClose = handle.close.bind(handle);
            handle.close = async () => {
              closeCalls++;
              throw Error('close-before-call');
            };
          }
          return handle;
        };
      else {
        Dir.prototype.close = function (callback) {
          if (this === held) {
            closeCalls++;
            throw Error('close-before-call');
          }
          return originalDirClose.call(this, callback);
        };
        fs.opendir = async (...args) => {
          const handle = await originalOpendir(...args);
          if (!held) held = handle;
          return handle;
        };
      }
      syncBuiltinESMExports();
      try {
        await assert.rejects(resource === 'file' ? read(f) : captured.recheck(), (error) => {
          assert.equal(error.code, 'CLOSED_RUNTIME_PACKAGE_INVALID');
          assert.equal(Object.getOwnPropertyDescriptor(error, 'cleanupState')?.value, 'UNKNOWN');
          return true;
        });
        assert.ok(held);
        assert.equal(closeCalls, 1);
        if (resource === 'file') assert.ok((await held.stat()).size > 0);
        else assert.equal(await held.read(), null); // A closed Dir would throw ERR_DIR_CLOSED.
      } finally {
        fs.open = originalOpen;
        fs.opendir = originalOpendir;
        Dir.prototype.close = originalDirClose;
        syncBuiltinESMExports();
        // The test owns the genuine handles and the saved real close; product never retries.
        if (held) {
          if (resource === 'file') await actualFileClose();
          else
            await new Promise((resolve, reject) =>
              originalDirClose.call(held, (error) => (error ? reject(error) : resolve())),
            );
        }
      }
    },
  );

test('initial callback failure with successful real close remains SETTLED', async (t) => {
  const f = await fixture(t),
    originalOpen = fs.open;
  const { syncBuiltinESMExports } = await import('node:module');
  let held,
    opened = false,
    realClose,
    closeCalls = 0;
  fs.open = async (...args) => {
    const handle = await originalOpen(...args);
    if (!held) {
      held = handle;
      realClose = handle.close.bind(handle);
      handle.close = async () => {
        closeCalls++;
        return realClose();
      };
      opened = true;
    }
    return handle;
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(
      read(f, {
        ...limits,
        check: () => {
          if (opened) throw Error('private callback');
          return undefined;
        },
      }),
      (error) =>
        error.code === 'CLOSED_RUNTIME_PACKAGE_INVALID' && error.cleanupState === 'SETTLED',
    );
    assert.equal(closeCalls, 1);
    assert.equal(held.fd, -1);
    await assert.rejects(held.stat());
  } finally {
    fs.open = originalOpen;
    syncBuiltinESMExports();
    if (held && held.fd !== -1) await realClose();
  }
});
test('borrowed initial control UNKNOWN is preserved without evaluating diagnostic getters', async (t) => {
  const f = await fixture(t),
    error = Object.assign(Error('private'), { cleanupState: 'UNKNOWN' });
  Object.defineProperty(error, 'message', {
    get() {
      throw Error('diagnostic getter must not run');
    },
  });
  await assert.rejects(
    read(f, {
      ...limits,
      check: () => {
        throw error;
      },
    }),
    (failure) =>
      failure.code === 'CLOSED_RUNTIME_PACKAGE_INVALID' && failure.cleanupState === 'UNKNOWN',
  );
});
for (const shape of ['direct-proxy', 'proxy-prototype'])
  test('unsafe thrown ' + shape + ' normalizes without invoking prototype traps', async (t) => {
    const f = await fixture(t);
    let traps = 0;
    const proxy = new Proxy(
      {},
      {
        getPrototypeOf() {
          traps++;
          throw Error('private secret diagnostic');
        },
        getOwnPropertyDescriptor() {
          traps++;
          throw Error('private secret diagnostic');
        },
      },
    );
    const thrown = shape === 'direct-proxy' ? proxy : Object.create(proxy);
    let failure;
    try {
      await read(f, {
        ...limits,
        check: () => {
          throw thrown;
        },
      });
    } catch (error) {
      failure = error;
    }
    assert.equal(traps, 0);
    assert.ok(failure);
    assert.equal(failure.code, 'CLOSED_RUNTIME_PACKAGE_INVALID');
    assert.equal(failure.message, 'CLOSED_RUNTIME_PACKAGE_INVALID');
    assert.equal(failure.cleanupState, 'SETTLED');
  });
