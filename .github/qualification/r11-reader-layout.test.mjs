import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { test } from 'node:test';
import { exportReader, materializeReader } from './r11-reader-layout.mjs';
import { inventoryTree } from './r11-staged-pack.mjs';
import { readerContentDigest } from './r11-actual-coordinator.mjs';

async function fixture(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r11-reader-test-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const source = path.join(base, 'source');
  fs.mkdirSync(source);
  fs.mkdirSync(path.join(source, 'package'));
  fs.mkdirSync(path.join(source, 'empty'));
  fs.writeFileSync(
    path.join(source, 'package', 'index.mjs'),
    'throw new Error("MUST_NOT_EXECUTE");\r\n',
  );
  fs.writeFileSync(path.join(source, 'package', 'package.json'), '{"name":"synthetic"}\n');
  fs.symlinkSync(path.join(source, 'package'), path.join(source, 'alias'), 'junction');
  const before = await inventoryTree(source, { allowLinks: true });
  return {
    base,
    source,
    before,
    digest: readerContentDigest(before),
    bundle: path.join(base, 'bundle'),
    output: path.join(base, 'output'),
  };
}

test('closed reader roundtrip preserves raw CRLF, empty directories and internal topology without executing modules', async (t) => {
  const x = await fixture(t);
  await exportReader(x.source, x.bundle, x.digest);
  const receipt = await materializeReader(x.bundle, x.output, x.digest);
  assert.equal(receipt.state, 'READER_MATERIALIZED_NOT_QUALIFIED');
  assert.equal(receipt.readerContentSha256, x.digest);
  const actual = await inventoryTree(path.join(x.output, 'reader'), { allowLinks: true });
  assert.equal(readerContentDigest(actual), x.digest);
  assert.deepEqual(await inventoryTree(x.source, { allowLinks: true }), x.before);
  assert.equal(
    fs.readFileSync(path.join(x.output, 'reader/package/index.mjs'), 'utf8'),
    'throw new Error("MUST_NOT_EXECUTE");\r\n',
  );
});

test('wrong expected identity refuses export before writing', async (t) => {
  const x = await fixture(t);
  await assert.rejects(exportReader(x.source, x.bundle, '0'.repeat(64)));
  assert.equal(fs.existsSync(x.bundle), false);
});

test('tampered or additional bundle contents refuse before creating target', async (t) => {
  for (const mode of ['tamper', 'extra', 'manifest']) {
    const x = await fixture(t);
    await exportReader(x.source, x.bundle, x.digest);
    if (mode === 'tamper')
      fs.writeFileSync(path.join(x.bundle, 'objects', x.before.files[0].sha256), 'changed');
    if (mode === 'extra') fs.writeFileSync(path.join(x.bundle, 'unexpected'), 'extra');
    if (mode === 'manifest') {
      const p = path.join(x.bundle, 'manifest.json');
      const m = JSON.parse(fs.readFileSync(p));
      m.inventory.links[0].target = '../escape';
      fs.writeFileSync(p, JSON.stringify(m));
    }
    await assert.rejects(materializeReader(x.bundle, x.output, x.digest));
    assert.equal(fs.existsSync(x.output), false);
  }
});

test('existing targets and overlapping roots are never adopted or overwritten', async (t) => {
  const x = await fixture(t);
  await exportReader(x.source, x.bundle, x.digest);
  fs.mkdirSync(x.output);
  fs.writeFileSync(path.join(x.output, 'keep'), 'untouched');
  await assert.rejects(materializeReader(x.bundle, x.output, x.digest));
  assert.equal(fs.readFileSync(path.join(x.output, 'keep'), 'utf8'), 'untouched');
  await assert.rejects(exportReader(x.source, path.join(x.source, 'nested'), x.digest));
  await assert.rejects(materializeReader(x.bundle, path.join(x.bundle, 'nested'), x.digest));
});

test('outside source junction is rejected without copying outside content', async (t) => {
  const x = await fixture(t);
  fs.symlinkSync(x.base, path.join(x.source, 'outside'), 'junction');
  await assert.rejects(exportReader(x.source, x.bundle, x.digest));
  assert.equal(fs.existsSync(x.bundle), false);
});

test('operational CLI fixes R11 identity and cannot accept a synthetic digest override', async (t) => {
  const x = await fixture(t);
  const { spawnSync } = await import('node:child_process');
  const { hashFile } = await import('./r11-staged-pack.mjs');
  const entry = path.resolve('.github/qualification/r11-reader-layout.mjs');
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  const result = spawnSync(
    process.execPath,
    [entry, 'export', x.source, x.bundle, hashFile(entry)],
    { env, encoding: 'utf8', windowsHide: true, timeout: 10000 },
  );
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Reader content or topology drift/);
  assert.equal(fs.existsSync(x.bundle), false);
});

test('bundle missing objects or linked object directories never reaches materialization', async (t) => {
  for (const mode of ['missing', 'linked']) {
    const x = await fixture(t);
    await exportReader(x.source, x.bundle, x.digest);
    if (mode === 'missing') fs.unlinkSync(path.join(x.bundle, 'objects', x.before.files[0].sha256));
    else {
      fs.renameSync(path.join(x.bundle, 'objects'), path.join(x.base, 'moved-objects'));
      fs.symlinkSync(
        path.join(x.base, 'moved-objects'),
        path.join(x.bundle, 'objects'),
        'junction',
      );
    }
    await assert.rejects(materializeReader(x.bundle, x.output, x.digest));
    assert.equal(fs.existsSync(x.output), false);
  }
});

test('hard-linked source files refuse without exporting any bytes', async (t) => {
  const x = await fixture(t);
  fs.linkSync(path.join(x.source, 'package/index.mjs'), path.join(x.base, 'hardlink'));
  await assert.rejects(exportReader(x.source, x.bundle, x.digest));
  assert.equal(fs.existsSync(x.bundle), false);
});

test('new destinations cannot alter another protected tree even when not yet created', async (t) => {
  const { assertReaderOutput } = await import('./r11-reader-layout.mjs');
  const x = await fixture(t);
  const protectedRoot = path.join(x.base, 'protected');
  fs.mkdirSync(protectedRoot);
  assert.throws(() => assertReaderOutput(path.join(protectedRoot, 'new'), [protectedRoot]));
  assert.throws(() => assertReaderOutput(x.base, [protectedRoot]));
  assert.throws(() => assertReaderOutput(protectedRoot, [protectedRoot]));
  assert.doesNotThrow(() => assertReaderOutput(x.output, [protectedRoot]));
  for (const target of [
    'C:\\CodeAtlas-P05-D5-R10\\new-reader',
    'C:\\CodeAtlas-P05-D5-R11\\new-reader',
    'D:\\workspace\\CodeAtlas-frozen-1e78a8c-v1\\new-bundle',
    'D:\\CodeAtlas-R11-PACK-v1\\new',
    'D:\\CodeAtlas-R11-PACK-v2\\new',
  ]) {
    assert.throws(() => assertReaderOutput(target));
  }
  assert.equal(fs.existsSync(path.join(protectedRoot, 'new')), false);
});
