import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
let api = {};
try {
  api = await import('../dist/mixed-source-verification.js');
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const fixture = new URL('../../../fixtures/phase1/mixed-runtime-readiness/', import.meta.url);
const expected = JSON.parse(await fs.readFile(new URL('expected/source.json', fixture)));
const hash = (b) => 'sha256:' + createHash('sha256').update(b).digest('hex');
const code = (v) => (e) => e.code === v;
function account(overrides = {}) {
  const x = { reads: 0, buffers: 0, items: 0, invalid: false, owned: [] };
  const a = {
    checkpoint() {},
    own(v) {
      x.owned.push(v);
    },
    reserveBuffer(n) {
      x.buffers += n;
    },
    readBytes(n) {
      x.reads += n;
    },
    visitItem() {
      x.items++;
    },
    invalidate() {
      x.invalid = true;
    },
    ...overrides,
  };
  return { a, x };
}
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codeatlas-ar-source-'));
  t.after(async () => {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const files = [];
  for (const f of expected.files) {
    const b = await fs.readFile(new URL('inputs/source/' + encodeURIComponent(f.path), fixture));
    assert.equal(hash(b), f.contentFingerprint);
    await fs.writeFile(path.join(root, f.path), b);
    files.push({
      id: f.id,
      repositoryId: 'repo:ar',
      revisionId: 'rev:ar',
      path: f.path,
      contentFingerprint: f.contentFingerprint,
      languageHint: f.languageHint,
      classification: {
        role: f.languageHint ? 'SOURCE' : 'OTHER',
        provenance: 'AUTHORED',
        contentKind: 'TEXT',
      },
      sensitivity: 'INTERNAL',
    });
  }
  return { root, files };
}
test('AR Source private API exists without a public Source export', async () => {
  assert.equal(typeof api.verifyMixedSourceFiles, 'function');
  const pub = await import('../dist/index.js');
  assert.equal(pub.verifyMixedSourceFiles, undefined);
});
test('AR Source verifies every supplied Java Python OTHER and Unicode file', async (t) => {
  const f = await setup(t),
    { a, x } = account();
  await api.verifyMixedSourceFiles({ rootPath: f.root, files: f.files, removedPaths: [] }, a);
  assert.equal(x.reads, expected.totalBytes);
  assert.equal(x.invalid, false);
  assert.ok(x.items >= f.files.length);
  assert.ok(x.buffers > 0);
});
test('AR logical removal does not read or require physical deletion', async (t) => {
  const f = await setup(t);
  await fs.writeFile(path.join(f.root, 'removed.py'), 'still exists');
  const { a, x } = account();
  await api.verifyMixedSourceFiles(
    { rootPath: f.root, files: f.files, removedPaths: ['removed.py', 'missing.py'] },
    a,
  );
  assert.equal(x.reads, expected.totalBytes);
});
test('AR changed bytes invalidate the account', async (t) => {
  const f = await setup(t);
  await fs.writeFile(path.join(f.root, f.files[0].path), 'changed');
  const { a, x } = account();
  await assert.rejects(
    api.verifyMixedSourceFiles({ rootPath: f.root, files: f.files, removedPaths: [] }, a),
    code('SOURCE_CHANGED'),
  );
  assert.equal(x.invalid, true);
});
for (const kind of ['duplicate-id', 'duplicate-path', 'traversal', 'overlap', 'getter', 'proxy']) {
  test('AR rejects ' + kind + ' before file access', async (t) => {
    const f = await setup(t),
      input = { rootPath: f.root, files: f.files, removedPaths: [] };
    if (kind === 'duplicate-id')
      input.files = [...f.files, { ...f.files[0], path: 'different.py' }];
    if (kind === 'duplicate-path') input.files = [...f.files, { ...f.files[0], id: 'other:id' }];
    if (kind === 'traversal') input.files = [{ ...f.files[0], path: '../escape.py' }];
    if (kind === 'overlap') input.removedPaths = [f.files[0].path];
    let invoked = 0;
    if (kind === 'getter')
      Object.defineProperty(input, 'rootPath', {
        enumerable: true,
        get() {
          invoked++;
          return f.root;
        },
      });
    const value =
      kind === 'proxy'
        ? new Proxy(input, {
            get() {
              invoked++;
              throw Error('getter');
            },
          })
        : input;
    const { a, x } = account();
    await assert.rejects(api.verifyMixedSourceFiles(value, a), code('INVALID_SOURCE_INPUT'));
    assert.equal(invoked, 0);
    assert.equal(x.reads, 0);
    assert.equal(x.invalid, true);
  });
}
test('AR hardlink refusal preserves the old fingerprint behavior', async (t) => {
  const f = await setup(t);
  await fs.link(path.join(f.root, f.files[0].path), path.join(f.root, 'second-link'));
  const { a, x } = account();
  await assert.rejects(
    api.verifyMixedSourceFiles({ rootPath: f.root, files: f.files, removedPaths: [] }, a),
    code('SOURCE_CHANGED'),
  );
  assert.equal(x.invalid, true);
  const old = await import('../dist/fingerprint.js');
  const result = await old.fingerprintFile(path.join(f.root, f.files[0].path), f.files[0].path);
  assert.equal(result.contentFingerprint, f.files[0].contentFingerprint);
});
test('AR root junction is refused without following it', async (t) => {
  const f = await setup(t);
  const alias = f.root + '-link';
  try {
    await fs.symlink(f.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (e) {
    if (e.code === 'EPERM') {
      t.todo('OS link creation denied; qualification remains OPEN');
      return;
    }
    throw e;
  }
  t.after(() => fs.unlink(alias));
  const { a, x } = account();
  await assert.rejects(
    api.verifyMixedSourceFiles({ rootPath: alias, files: f.files, removedPaths: [] }, a),
    code('SOURCE_CHANGED'),
  );
  assert.equal(x.reads, 0);
});
test('AR prepayment failure happens before any handle read', async (t) => {
  const f = await setup(t),
    open = fs.open;
  let reads = 0;
  fs.open = async (...args) => {
    const h = await open(...args),
      read = h.read.bind(h);
    h.read = async (...v) => {
      reads++;
      return read(...v);
    };
    return h;
  };
  syncBuiltinESMExports();
  try {
    const { a, x } = account({
      readBytes() {
        throw Object.assign(Error('STAGE_LIMIT_EXCEEDED'), { code: 'STAGE_LIMIT_EXCEEDED' });
      },
    });
    await assert.rejects(
      api.verifyMixedSourceFiles({ rootPath: f.root, files: f.files, removedPaths: [] }, a),
      code('STAGE_LIMIT_EXCEEDED'),
    );
    assert.equal(reads, 0);
    assert.equal(x.invalid, true);
  } finally {
    fs.open = open;
    syncBuiltinESMExports();
  }
});
test('AR abort before input leaves zero bytes charged', async (t) => {
  const f = await setup(t),
    { a, x } = account({
      checkpoint() {
        throw Object.assign(Error('CANCELLED'), { code: 'CANCELLED' });
      },
    });
  await assert.rejects(
    api.verifyMixedSourceFiles({ rootPath: f.root, files: f.files, removedPaths: [] }, a),
    code('CANCELLED'),
  );
  assert.equal(x.reads, 0);
  assert.equal(x.invalid, true);
});
test('AR same-content named replacement during read is refused', async (t) => {
  const f = await setup(t),
    open = fs.open;
  let swapped = false;
  fs.open = async (...args) => {
    const h = await open(...args),
      read = h.read.bind(h);
    h.read = async (...v) => {
      const result = await read(...v);
      if (!swapped && result.bytesRead) {
        swapped = true;
        const name = String(args[0]);
        await fs.rename(name, name + '.old');
        await fs.copyFile(name + '.old', name);
      }
      return result;
    };
    return h;
  };
  syncBuiltinESMExports();
  try {
    const { a } = account();
    await assert.rejects(
      api.verifyMixedSourceFiles({ rootPath: f.root, files: f.files, removedPaths: [] }, a),
      code('SOURCE_CHANGED'),
    );
    assert.equal(swapped, true);
  } finally {
    fs.open = open;
    syncBuiltinESMExports();
  }
});
test('AR legacy raw fingerprint and inventory literal remain stable', async (t) => {
  const f = await setup(t),
    old = await import('../dist/fingerprint.js');
  for (const v of f.files) {
    const result = await old.fingerprintFile(path.join(f.root, v.path), v.path);
    assert.equal(result.contentFingerprint, v.contentFingerprint);
  }
  assert.equal(old.fingerprintInventory([]), expected.emptyInventory);
});

test('AR prepays both validated input and parsed metadata representations', async (t) => {
  const f = await setup(t),
    { a, x } = account();
  await api.verifyMixedSourceFiles({ rootPath: f.root, files: f.files, removedPaths: [] }, a);
  for (const file of f.files) {
    const rows = x.owned.filter((v) => v && typeof v === 'object' && v.id === file.id);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], rows[1]);
  }
});

test('AR ancestor replacement during a read is refused', async (t) => {
  const f = await setup(t),
    dir = path.join(f.root, 'nested');
  await fs.mkdir(dir);
  const file = { ...f.files[1], path: 'nested/app.py' };
  await fs.copyFile(path.join(f.root, 'app.py'), path.join(dir, 'app.py'));
  const open = fs.open;
  let swapped = false;
  fs.open = async (...args) => {
    const h = await open(...args),
      read = h.read.bind(h);
    h.read = async (...v) => {
      const result = await read(...v);
      if (!swapped && result.bytesRead) {
        swapped = true;
        await fs.rename(dir, dir + '.old');
        await fs.mkdir(dir);
        await fs.copyFile(path.join(dir + '.old', 'app.py'), path.join(dir, 'app.py'));
      }
      return result;
    };
    return h;
  };
  syncBuiltinESMExports();
  try {
    const { a, x } = account();
    await assert.rejects(
      api.verifyMixedSourceFiles({ rootPath: f.root, files: [file], removedPaths: [] }, a),
      code('SOURCE_CHANGED'),
    );
    assert.equal(x.invalid, true);
    assert.equal(swapped, true);
  } finally {
    fs.open = open;
    syncBuiltinESMExports();
  }
});
test('AR file symlink is refused when OS creation is available', async (t) => {
  const f = await setup(t),
    name = path.join(f.root, f.files[0].path);
  await fs.unlink(name);
  try {
    await fs.symlink(path.join(f.root, 'notes.jsonl'), name, 'file');
  } catch (e) {
    if (e.code === 'EPERM') {
      t.todo('File symlink unavailable; original C1 gate remains OPEN');
      return;
    }
    throw e;
  }
  const { a, x } = account();
  await assert.rejects(
    api.verifyMixedSourceFiles({ rootPath: f.root, files: f.files, removedPaths: [] }, a),
    code('SOURCE_CHANGED'),
  );
  assert.equal(x.invalid, true);
});
test('AR large input uses exact prepaid chunks without an uncharged EOF read', async (t) => {
  const f = await setup(t),
    bytes = Buffer.alloc(65537, 120),
    file = {
      ...f.files[0],
      path: 'large.jsonl',
      contentFingerprint: hash(bytes),
      languageHint: null,
    };
  await fs.writeFile(path.join(f.root, file.path), bytes);
  const charges = [],
    { a, x } = account({
      readBytes(n) {
        charges.push(n);
      },
    });
  await api.verifyMixedSourceFiles({ rootPath: f.root, files: [file], removedPaths: [] }, a);
  assert.deepEqual(charges, [65536, 1]);
  assert.equal(x.invalid, false);
});
test('AR cancellation after the first actual chunk prevents a second read', async (t) => {
  const f = await setup(t),
    bytes = Buffer.alloc(65537, 120),
    file = {
      ...f.files[0],
      path: 'large.jsonl',
      contentFingerprint: hash(bytes),
      languageHint: null,
    };
  await fs.writeFile(path.join(f.root, file.path), bytes);
  const open = fs.open,
    c = new AbortController();
  let reads = 0;
  fs.open = async (...args) => {
    const h = await open(...args),
      read = h.read.bind(h);
    h.read = async (...v) => {
      const result = await read(...v);
      reads++;
      c.abort();
      return result;
    };
    return h;
  };
  syncBuiltinESMExports();
  try {
    const { a, x } = account({
      checkpoint() {
        if (c.signal.aborted) throw Object.assign(Error('CANCELLED'), { code: 'CANCELLED' });
      },
    });
    await assert.rejects(
      api.verifyMixedSourceFiles({ rootPath: f.root, files: [file], removedPaths: [] }, a),
      code('CANCELLED'),
    );
    assert.equal(reads, 1);
    assert.equal(x.reads, 65536);
    assert.equal(x.invalid, true);
  } finally {
    fs.open = open;
    syncBuiltinESMExports();
  }
});
