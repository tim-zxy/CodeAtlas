import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import * as replay from './helpers/native-refresh-transport-replay.mjs';

const revision = 'p05-refresh-replay-v4';
async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'codeatlas-topology-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repositoryPath = path.join(root, 'repo');
  const files = {
    'package.json': JSON.stringify({ name: 'root', version: '1' }),
    'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
    'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    'packages/a/package.json': JSON.stringify({
      name: '@fixture/a',
      version: '1',
      dependencies: { p: '1' },
    }),
    'packages/b/package.json': JSON.stringify({
      name: '@fixture/b',
      version: '1',
      dependencies: { p: '2' },
    }),
    'packages/a/dist/index.js': 'export {};\n',
    'packages/b/dist/index.js': 'export {};\n',
    'scripts/tool.mjs': 'export {};\n',
    'fixtures/native/a.txt': 'owned source\n',
    'fixtures/ipc/handshake-v1/a.txt': 'owned wire\n',
    'packages/storage/migrations/a.sql': 'SELECT 1;\n',
  };
  for (const [relative, bytes] of Object.entries(files)) {
    const p = path.join(repositoryPath, relative);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, bytes);
  }
  const external = [];
  for (const [i, version] of ['1.0.0', '2.0.0'].entries()) {
    const p = path.join(repositoryPath, 'installed' + i);
    await mkdir(p);
    await writeFile(path.join(p, 'package.json'), JSON.stringify({ name: 'p', version }));
    await writeFile(path.join(p, 'index.js'), 'export {};\n');
    external.push(p);
  }
  const nativeExecutablePath = path.join(root, 'native', 'analyzer');
  await mkdir(path.dirname(nativeExecutablePath));
  await writeFile(nativeExecutablePath, 'not executable');
  const resolvePackageRoot = async (name, importer) => {
    if (name === '@fixture/b') return path.join(repositoryPath, 'packages/b');
    assert.equal(name, 'p');
    return external[importer === path.join(repositoryPath, 'packages/b') ? 1 : 0];
  };
  const options = {
    repositoryPath,
    nativeExecutablePath,
    resolvePackageRoot,
    generatorRevision: revision,
  };
  return { root, repositoryPath, external, options };
}

test('topology v4 binds two versions and every actual importer without weakening old discovery', async (t) => {
  const f = await fixture(t);
  const c = await replay.discoverRefreshReplayDependenciesAt(f.options);
  assert.equal(c.topology.schemaVersion, 1);
  assert.equal(c.topology.instances.length, 2);
  assert.deepEqual(c.topology.instances.map((x) => x.version).sort(), ['1.0.0', '2.0.0']);
  assert.equal(new Set(c.topology.imports.map((x) => x.from)).size, 2);
  assert.equal(new Set(c.topology.imports.map((x) => x.target)).size, 2);
  assert.ok(Object.isFrozen(c.topology));
  await replay.verifyRefreshReplayDependencyCatalog(c, c.roots, c.dependencies, c.topology);
  await assert.rejects(
    replay.verifyRefreshReplayDependencyCatalog(c, c.roots, c.dependencies),
    /topology/i,
  );
  for (const generatorRevision of ['p05-refresh-replay-v2', 'p05-refresh-replay-v3'])
    await assert.rejects(
      replay.discoverRefreshReplayDependenciesAt({ ...f.options, generatorRevision }),
      /Multiple versions/,
    );
});

test('topology v4 refuses changed resolution even when every package byte and flat inventory is identical', async (t) => {
  const f = await fixture(t);
  const c = await replay.discoverRefreshReplayDependenciesAt(f.options);
  const changed = await replay.discoverRefreshReplayDependenciesAt({
    ...f.options,
    resolvePackageRoot: async (n, importer) =>
      f.external[importer === path.join(f.repositoryPath, 'packages/b') ? 0 : 1],
  });
  assert.deepEqual(changed.dependencies, c.dependencies);
  assert.deepEqual(changed.roots, c.roots);
  await assert.rejects(
    replay.verifyRefreshReplayDependencyCatalog(changed, c.roots, c.dependencies, c.topology),
    /topology/i,
  );
});

test('topology v4 preserves distinct identical installations and refuses instance-byte drift', async (t) => {
  const f = await fixture(t);
  await writeFile(
    path.join(f.external[1], 'package.json'),
    await readFile(path.join(f.external[0], 'package.json')),
  );
  const c = await replay.discoverRefreshReplayDependenciesAt(f.options);
  assert.equal(c.topology.instances.length, 2);
  assert.equal(new Set(c.topology.instances.map((x) => x.id)).size, 2);
  await writeFile(path.join(f.external[1], 'index.js'), 'different');
  const changed = await replay.discoverRefreshReplayDependenciesAt(f.options);
  await assert.rejects(
    replay.verifyRefreshReplayDependencyCatalog(changed, c.roots, c.dependencies, c.topology),
  );
});

test('topology v4 records missing optional but refuses missing required resolution', async (t) => {
  const f = await fixture(t);
  const p = path.join(f.repositoryPath, 'packages/a/package.json');
  await writeFile(
    p,
    JSON.stringify({ name: '@fixture/a', version: '1', optionalDependencies: { p: '1' } }),
  );
  const options = {
    ...f.options,
    resolvePackageRoot: async (name, importer) => {
      if (importer === path.dirname(p))
        throw Object.assign(new Error('missing'), { code: 'MODULE_NOT_FOUND' });
      return f.external[1];
    },
  };
  const c = await replay.discoverRefreshReplayDependenciesAt(options);
  assert.ok(c.topology.imports.some((x) => x.kind === 'OPTIONAL' && x.target === null));
  await writeFile(
    p,
    JSON.stringify({ name: '@fixture/a', version: '1', dependencies: { p: '1' } }),
  );
  await assert.rejects(replay.discoverRefreshReplayDependenciesAt(options), /missing/);
});

test('topology v4 follows peer and cyclic import edges once per physical instance', async (t) => {
  const f = await fixture(t);
  await writeFile(
    path.join(f.external[0], 'package.json'),
    JSON.stringify({ name: 'p', version: '1.0.0', peerDependencies: { p: '1' } }),
  );
  const c = await replay.discoverRefreshReplayDependenciesAt(f.options);
  assert.equal(c.topology.instances.length, 2);
  assert.ok(c.topology.imports.some((x) => x.kind === 'PEER' && x.from === x.target));
});

test('topology record rejects stale digests, dropped edges and disconnected instances', async (t) => {
  const f = await fixture(t);
  const c = await replay.discoverRefreshReplayDependenciesAt(f.options);
  for (const mutate of [
    (x) => x.imports.pop(),
    (x) => (x.instances[0].inventoryDigest = '0'.repeat(64)),
    (x) => (x.imports[0].target = 'package-' + '0'.repeat(64)),
    (x) => (x.extra = true),
  ]) {
    const value = structuredClone(c.topology);
    mutate(value);
    assert.throws(() => replay.validateRefreshReplayTopologyRecord(value, c.dependencies));
  }
});

test('topology layout10 is explicit and cannot enter old pack versions', async () => {
  const layout = await import('../../../scripts/helpers/native-refresh-ci-layout.mjs');
  const pack = await import('../../../scripts/helpers/native-refresh-ci-pack.mjs');
  assert.equal(layout.refreshCiLayoutRevision, 'p05-d5-exact-layout-v8');
  assert.equal(
    layout.refreshCiLayoutRootForRevision('p05-d5-exact-layout-v10'),
    'C:\\CodeAtlas-P05-D5-R10',
  );
  assert.equal(layout.refreshCiReplayGeneratorForRevision('p05-d5-exact-layout-v10'), revision);
  pack.assertRefreshCiReplayFormat('p05-d5-exact-layout-v10', {
    schemaVersion: 3,
    generator: { revision },
  });
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const r = 'p05-d5-exact-layout-v' + n;
    assert.equal(
      layout.refreshCiReplayGeneratorForRevision(r),
      n === 1 ? 'p05-refresh-replay-v2' : 'p05-refresh-replay-v3',
    );
    assert.throws(() =>
      pack.assertRefreshCiReplayFormat(r, { schemaVersion: 3, generator: { revision } }),
    );
    assert.throws(() =>
      pack.assertRefreshCiReplayFormat('p05-d5-exact-layout-v10', {
        schemaVersion: 2,
        generator: { revision: layout.refreshCiReplayGeneratorForRevision(r) },
      }),
    );
  }
  if (process.platform === 'win32')
    assert.throws(
      () => layout.assertRefreshCiOutputOutsideLayouts('C:\\CodeAtlas-P05-D5-R10\\evidence'),
      /overlap/,
    );
});

for (const optional of [false, true])
  test('topology v4 resolves explicit workspace peer ' + optional, async (t) => {
    const f = await fixture(t);
    await writeFile(
      path.join(f.repositoryPath, 'packages/a/package.json'),
      JSON.stringify({
        name: '@fixture/a',
        version: '1',
        peerDependencies: { '@fixture/b': 'workspace:*' },
        ...(optional ? { peerDependenciesMeta: { '@fixture/b': { optional: true } } } : {}),
      }),
    );
    const c = await replay.discoverRefreshReplayDependenciesAt(f.options);
    const target = c.topology.workspaces.find((x) => x.name === '@fixture/b').id;
    assert.ok(
      c.topology.imports.some(
        (x) =>
          x.kind === (optional ? 'OPTIONAL_PEER' : 'PEER') &&
          x.specifier === '@fixture/b' &&
          x.target === target,
      ),
    );
  });

test('topology v4 rejects aliased package identity and external installation escape', async (t) => {
  const f = await fixture(t);
  await writeFile(
    path.join(f.external[0], 'package.json'),
    JSON.stringify({ name: 'aliased', version: '1' }),
  );
  await assert.rejects(replay.discoverRefreshReplayDependenciesAt(f.options), /alias/);
  const out = path.join(f.root, 'outside');
  await mkdir(out);
  await writeFile(path.join(out, 'package.json'), JSON.stringify({ name: 'p', version: '1' }));
  await assert.rejects(
    replay.discoverRefreshReplayDependenciesAt({
      ...f.options,
      resolvePackageRoot: async () => out,
    }),
    /path/i,
  );
});

test('topology explicit prepare10 refuses unsupported host or reaches intercepted build without compiler or Native', async (t) => {
  const f = await fixture(t);
  const output = path.join(f.root, 'preflight');
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';cp.spawnSync=()=>{throw Error('TOPOLOGY_BUILD_INTERCEPT')};syncBuiltinESMExports();const {runRefreshCiAt}=await import('./scripts/native-refresh-ci.mjs');try{await runRefreshCiAt(['prepare',process.argv[1],'p05-d5-exact-layout-v10'],process.cwd());process.exitCode=2;}catch(e){process.stdout.write(e.message)}",
      output,
    ],
    { cwd: process.cwd(), encoding: 'utf8', windowsHide: true },
  );
  assert.equal(result.status, 0, result.stderr);
  if (process.platform === 'win32') assert.equal(result.stdout, 'TOPOLOGY_BUILD_INTERCEPT');
  else assert.match(result.stdout, /win32/);
  const receipt = JSON.parse(await readFile(path.join(output, 'ci-result.json'), 'utf8'));
  assert.equal(receipt.stage, 'BUILD');
});

test('topology instance inventory and identity match independent canonical preimages with nested paths', async (t) => {
  const f = await fixture(t);
  await mkdir(path.join(f.external[0], 'request'));
  await writeFile(path.join(f.external[0], 'request.js'), 'export const request = 1;\n');
  await writeFile(path.join(f.external[0], 'request/constants.js'), 'export const constant = 2;\n');
  const c = await replay.discoverRefreshReplayDependenciesAt(f.options);
  const raw = (x) => createHash('sha256').update(x).digest('hex');
  const entries = [
    { path: 'index.js', sha256: raw('export {};\n') },
    { path: 'package.json', sha256: raw(JSON.stringify({ name: 'p', version: '1.0.0' })) },
    { path: 'request.js', sha256: raw('export const request = 1;\n') },
    { path: 'request/constants.js', sha256: raw('export const constant = 2;\n') },
  ];
  const inventoryDigest = raw('p05-refresh-instance-files-v1\0' + JSON.stringify(entries) + '\n');
  const preimage = { inventoryDigest, name: 'p', path: 'installed0', version: '1.0.0' };
  const instance = c.topology.instances.find((x) => x.path === 'installed0');
  assert.equal(instance.inventoryDigest, inventoryDigest);
  assert.equal(
    instance.id,
    'package-' + raw('p05-refresh-instance-v1\0' + JSON.stringify(preimage) + '\n'),
  );
  const wrong = structuredClone(c.roots);
  wrong.find((x) => x.name === instance.id).path = f.external[1];
  assert.throws(
    () => replay.validateRefreshReplayTopologyRecord(c.topology, c.dependencies, wrong),
    /physical identity/,
  );
});

test('topology workspace targets are independently resolved rather than inferred from manifest names', async (t) => {
  const f = await fixture(t);
  await writeFile(
    path.join(f.repositoryPath, 'packages/a/package.json'),
    JSON.stringify({
      name: '@fixture/a',
      version: '1',
      dependencies: { '@fixture/b': 'workspace:*' },
    }),
  );
  await assert.rejects(
    replay.discoverRefreshReplayDependenciesAt({
      ...f.options,
      resolvePackageRoot: async (name, importer) =>
        name === '@fixture/b'
          ? path.join(f.repositoryPath, 'packages/a')
          : f.options.resolvePackageRoot(name, importer),
    }),
    /Workspace resolution topology/,
  );
});

test('topology explicitly records missing optional workspace resolution', async (t) => {
  const f = await fixture(t);
  await writeFile(
    path.join(f.repositoryPath, 'packages/a/package.json'),
    JSON.stringify({
      name: '@fixture/a',
      version: '1',
      optionalDependencies: { '@fixture/b': 'workspace:*' },
    }),
  );
  const c = await replay.discoverRefreshReplayDependenciesAt({
    ...f.options,
    resolvePackageRoot: async (name, importer) => {
      if (name === '@fixture/b')
        throw Object.assign(Error('missing'), { code: 'MODULE_NOT_FOUND' });
      return f.options.resolvePackageRoot(name, importer);
    },
  });
  assert.ok(
    c.topology.imports.some(
      (x) => x.specifier === '@fixture/b' && x.kind === 'OPTIONAL' && x.target === null,
    ),
  );
});

test('topology R11 replacement requires original version3 and generator4', async () => {
  const pack = await import('../../../scripts/helpers/native-refresh-ci-pack.mjs');
  pack.assertRefreshCiReplayFormat('p05-d5-exact-layout-v11', {
    schemaVersion: 3,
    generator: { revision: 'p05-refresh-replay-v4' },
  });
  for (const [schemaVersion, r] of [
    [2, 'p05-refresh-replay-v3'],
    [2, 'p05-refresh-replay-v4'],
    [3, 'p05-refresh-replay-v3'],
  ])
    assert.throws(() =>
      pack.assertRefreshCiReplayFormat('p05-d5-exact-layout-v11', {
        schemaVersion,
        generator: { revision: r },
      }),
    );
  assert.throws(() =>
    pack.assertRefreshCiReplayFormat('p05-d5-exact-layout-v9', {
      schemaVersion: 3,
      generator: { revision: 'p05-refresh-replay-v4' },
    }),
  );
});
