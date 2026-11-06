import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
let build;
try {
  ({ buildMixedNativeHostProductGraph: build } =
    await import('./mixed-native-host-product-graph.mjs'));
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}
const caps = {
  maxFiles: 100,
  maxFileBytes: 65536,
  maxTotalBytes: 1048576,
  maxEdges: 200,
  maxPlanBytes: 65536,
};
async function fixture(
  t,
  entry = "export { value } from './relative.js'; export const lazy=()=>import('conditional'); import 'node:path';",
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codeatlas-product-graph-'));
  t.after(async () => {
    assert.equal(path.dirname(root), os.tmpdir());
    await fs.rm(root, { recursive: true, force: true });
  });
  const write = async (name, text) => {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), text);
  };
  await write('package.json', '{"type":"module"}');
  await write('entry.mjs', entry);
  await write('relative.js', 'export const value=42;');
  await write(
    'node_modules/conditional/package.json',
    JSON.stringify({
      type: 'module',
      exports: { import: './import.js', require: './require.cjs' },
    }),
  );
  await write(
    'node_modules/conditional/import.js',
    "export * from './leaf.js'; throw Error('PRODUCT_MUST_NEVER_EXECUTE');",
  );
  await write('node_modules/conditional/leaf.js', 'export const leaf=true;');
  await write(
    'node_modules/conditional/require.cjs',
    "throw Error('REQUIRE_BRANCH_MUST_NEVER_LOAD');",
  );
  return {
    root,
    write,
    input: {
      entryPath: path.join(root, 'entry.mjs'),
      authorizedRoots: [root],
      dataPaths: [],
      outputRoot: path.join(root, 'snapshot'),
      caps,
      deadlineEpochMs: Date.now() + 60000,
    },
  };
}
test('complete ESM snapshot follows import conditions, reexports and literal dynamic edges without execution', async (t) => {
  assert.equal(typeof build, 'function');
  const f = await fixture(t),
    result = await build(f.input);
  assert.equal(result.status, 'PROPOSED');
  assert.equal(result.artifacts.length, 4);
  assert.equal(result.hostModuleArtifactIds.length, 4);
  assert.ok(result.edges.some((e) => e.specifier === 'conditional'));
  assert.ok(result.edges.some((e) => e.specifier === './leaf.js'));
  assert.ok(result.edges.some((e) => e.to === 'node:path'));
  assert.equal(result.hostEntryArtifactId, result.hostModuleArtifactIds[0]);
  for (const a of result.artifacts) {
    const p = path.join(f.input.outputRoot, a.path),
      stat = await fs.lstat(p),
      bytes = await fs.readFile(p);
    assert.equal(stat.isFile(), true);
    assert.equal(stat.isSymbolicLink(), false);
    assert.equal(stat.nlink, 1);
    assert.equal(bytes.length, a.sizeBytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), a.sha256);
  }
  for (const k of [
    'executionAuthorized',
    'productionAdmission',
    'measurementEligible',
    'moduleClosureAuthenticated',
  ])
    assert.equal(result[k], false);
});
for (const [name, source] of Object.entries({
  dynamic: "const p='./relative.js'; import(p);",
  template: 'import(`./relative.js`);',
  json: "import './data.json' with { type:'json' };",
  native: "import './addon.node';",
  commonjs: "import './legacy.cjs';",
  require: "const x=require('./relative.js');",
  createRequire: "import {createRequire} from 'node:module';",
  outside: "import '../outside.mjs';",
})) {
  test('rejects ' + name + ' dependency rather than incomplete graph', async (t) => {
    const f = await fixture(t, source);
    await f.write('data.json', '{}');
    await f.write('addon.node', 'no');
    await f.write('legacy.cjs', 'module.exports=1');
    await assert.rejects(build(f.input));
  });
}
test('rejects source escape through bare package target', async (t) => {
  const f = await fixture(t, "import 'conditional';");
  f.input.authorizedRoots = [path.join(f.root, 'entry.mjs')];
  await assert.rejects(build(f.input));
});
test('rejects hardlinked distinct source identities', async (t) => {
  const f = await fixture(t, "import './relative.js'; import './alias.js';");
  await fs.link(path.join(f.root, 'relative.js'), path.join(f.root, 'alias.js'));
  await assert.rejects(build(f.input));
});
test('rejects source drift after snapshot copy', async (t) => {
  const f = await fixture(t, 'export default 1;');
  const original = fs.writeFile;
  fs.writeFile = async function (file, ...args) {
    const result = await original.call(this, file, ...args);
    if (String(file).startsWith(f.input.outputRoot + path.sep))
      await original(path.join(f.root, 'entry.mjs'), 'export default 2;');
    return result;
  };
  try {
    await assert.rejects(build(f.input));
  } finally {
    fs.writeFile = original;
  }
});
for (const key of Object.keys(caps))
  test('enforces explicit ' + key, async (t) => {
    const f = await fixture(t);
    f.input.caps = { ...caps, [key]: 1 };
    await assert.rejects(build(f.input));
  });
test('rejects missing cap and expired deadline', async (t) => {
  const f = await fixture(t);
  delete f.input.caps;
  await assert.rejects(build(f.input));
  f.input.caps = caps;
  f.input.deadlineEpochMs = 1;
  await assert.rejects(build(f.input));
});

test('preserves relative module tree and requires explicit pinned data asset', async (t) => {
  const f = await fixture(t, "export const asset=new URL('./assets/value.txt',import.meta.url);");
  await f.write('assets/value.txt', 'fixed bytes');
  await assert.rejects(
    build(f.input),
    (e) =>
      e.code === 'INVALID_MIXED_NATIVE_HOST_PRODUCT_GRAPH' &&
      e.assetPath === path.join(f.root, 'assets/value.txt'),
  );
  f.input.dataPaths = [path.join(f.root, 'assets/value.txt')];
  const graph = await build(f.input);
  assert.equal(graph.hostModuleArtifactIds.length, 1);
  assert.equal(graph.artifacts.length, 2);
  assert.equal(graph.artifacts.find((a) => a.id === graph.hostEntryArtifactId).path, 'entry.mjs');
  assert.equal(
    graph.artifacts.find((a) => !graph.hostModuleArtifactIds.includes(a.id)).path,
    'assets/value.txt',
  );
  assert.equal(graph.assets[0].path, path.join(f.root, 'assets/value.txt'));
});
test('dataPaths is explicit and cannot duplicate code or escape roots', async (t) => {
  const f = await fixture(t, 'export default 1;');
  delete f.input.dataPaths;
  await assert.rejects(build(f.input));
  f.input.dataPaths = [path.join(f.root, 'entry.mjs')];
  await assert.rejects(build(f.input));
});

test('resolves installed-style package junction to copied ordinary owned files', async (t) => {
  const f = await fixture(t, "export { pinned } from 'linked';");
  await f.write('packages/linked/package.json', '{"type":"module","exports":"./index.js"}');
  await f.write('packages/linked/index.js', 'export const pinned=true;');
  await fs.symlink(
    path.join(f.root, 'packages/linked'),
    path.join(f.root, 'node_modules/linked'),
    'junction',
  );
  const graph = await build(f.input);
  const row = graph.artifacts.find((a) => a.path === 'packages/linked/index.js');
  assert.ok(row);
  assert.equal((await fs.lstat(path.join(f.input.outputRoot, row.path))).isSymbolicLink(), false);
  assert.equal((await fs.lstat(path.join(f.input.outputRoot, row.path))).nlink, 1);
});
test('refuses an existing relative file outside coordinator authorized scope', async (t) => {
  const f = await fixture(t);
  await f.write('scope/entry.mjs', "import '../relative.js';");
  f.input.entryPath = path.join(f.root, 'scope/entry.mjs');
  f.input.authorizedRoots = [path.join(f.root, 'scope')];
  await assert.rejects(build(f.input));
});
test('preserves duplicate specifier uses as one exact loader edge and retains BOM bytes', async (t) => {
  const f = await fixture(t, "\uFEFFimport './relative.js'; export * from './relative.js';");
  const graph = await build(f.input);
  assert.equal(graph.edges.length, 1);
  const bytes = await fs.readFile(path.join(f.input.outputRoot, 'entry.mjs'));
  assert.deepEqual([...bytes.subarray(0, 3)], [239, 187, 191]);
});

test('snapshot artifacts and exact edges are directly accepted by existing owner reader and pure loader', async (t) => {
  const f = await fixture(t),
    graph = await build(f.input);
  const bindings = Object.fromEntries(
    [
      'owner',
      'host',
      'observer',
      'git',
      'native',
      'oracle',
      'repository',
      'workspace',
      'source',
    ].map((k) => [k, graph.hostEntryArtifactId]),
  );
  const manifest = {
    kind: 'MIXED_NATIVE_OFFLINE_OWNER_CONTEXT',
    schemaVersion: 1,
    status: 'PROPOSED',
    artifacts: graph.artifacts,
    bindings,
    liveContext: null,
    executionAuthorized: false,
    productionAdmission: false,
    measurementEligible: false,
  };
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(f.input.outputRoot, 'context.json'), bytes);
  const { loadMixedNativeHostModuleClosure } = await import('./mixed-native-owner-context.mjs');
  const { createMixedNativeHostModuleHooks } =
    await import('./mixed-native-host-module-loader.mjs');
  const closure = await loadMixedNativeHostModuleClosure(
    f.input.outputRoot,
    'context.json',
    createHash('sha256').update(bytes).digest('hex'),
    { maxManifestBytes: 65536, maxArtifactBytes: 65536, maxTotalBytes: 1048576, maxFiles: 100 },
    graph.hostModuleArtifactIds,
  );
  const hooks = createMixedNativeHostModuleHooks(closure, graph.hostEntryArtifactId, graph.edges);
  try {
    const entry = hooks.resolve(hooks.entrySpecifier, {});
    assert.equal(hooks.load(entry.url, {}).format, 'module');
    for (const edge of graph.edges.filter((e) => e.from === graph.hostEntryArtifactId)) {
      const target = hooks.resolve(edge.specifier, { parentURL: entry.url });
      assert.ok(hooks.load(target.url, {}));
    }
  } finally {
    hooks.dispose();
  }
});
