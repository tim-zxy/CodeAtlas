import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { dynamicOwnerFixture } from './mixed-native-dynamic-owner-fixture.mjs';
import * as context from './mixed-native-owner-context.mjs';
let api = {};
try {
  api = await import('./mixed-native-host-module-loader.mjs');
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function setup(t, builtin = false, asset = false) {
  const f = await dynamicOwnerFixture(t, 'repo:owned');
  const modules = {
    entry: "import answer from './answer.mjs'; export default answer;\n",
    answer: 'export default 42;\n',
  };
  if (builtin)
    modules.entry =
      "import answer from './answer.mjs'; import { basename } from 'node:path'; export default basename('abc') === 'abc' ? answer : 0;\n";
  if (asset)
    modules.entry =
      "import answer from './answer.mjs'; import { readFile } from 'node:fs/promises'; export default (await readFile(new URL('./oracle.txt', import.meta.url), 'utf8')).startsWith('fixed synthetic oracle') ? answer : 0;\n";
  const manifest = JSON.parse(await fs.readFile(path.join(f.root, 'context.json'), 'utf8'));
  for (const [id, source] of Object.entries(modules)) {
    const file = id + '.mjs';
    const bytes = Buffer.from(source);
    await fs.writeFile(path.join(f.root, file), bytes);
    const artifact = { id, path: file, sizeBytes: bytes.length, sha256: hash(bytes) };
    const index = manifest.artifacts.findIndex((a) => a.id === id);
    if (index < 0) manifest.artifacts.push(artifact);
    else manifest.artifacts[index] = artifact;
  }
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(f.root, 'context.json'), bytes);
  f.request.manifestSha256 = hash(bytes);
  return {
    ...f,
    modules,
    load: () =>
      context.loadMixedNativeHostModuleClosure(
        f.root,
        'context.json',
        hash(bytes),
        f.request.artifactLimits,
        ['entry', 'answer'],
      ),
  };
}
const edges = [{ from: 'entry', specifier: './answer.mjs', to: 'answer' }];
test('verified byte snapshots feed closed pure hooks without file re-import', async (t) => {
  const f = await setup(t);
  assert.equal(typeof context.loadMixedNativeHostModuleClosure, 'function');
  const closure = await f.load();
  const hooks = api.createMixedNativeHostModuleHooks(closure, 'entry', edges);
  const entry = hooks.resolve(hooks.entrySpecifier, {});
  const answer = hooks.resolve('./answer.mjs', { parentURL: entry.url });
  await fs.writeFile(path.join(f.root, 'answer.mjs'), 'throw Error("changed after snapshot");');
  assert.equal(hooks.load(answer.url, {}).source, f.modules.answer);
  assert.equal(hooks.load(entry.url, {}).source, f.modules.entry);
  assert.equal(entry.shortCircuit, true);
  assert.equal(hooks.load(answer.url, {}).format, 'module');
  assert.notEqual(
    hooks.entrySpecifier,
    api.createMixedNativeHostModuleHooks(closure, 'entry', edges).entrySpecifier,
  );
  for (const flag of [
    'executionAuthorized',
    'productionAdmission',
    'measurementEligible',
    'moduleClosureAuthenticated',
    'contextAuthenticated',
    'liveTransportConnected',
  ])
    assert.equal(hooks.status()[flag], false);
  await assert.rejects(f.load()); // A new snapshot cannot inherit old byte identity.
});
for (const mode of [
  'omitted',
  'unknown-target',
  'duplicate-edge',
  'query',
  'fragment',
  'external-url',
  'json',
  'forged-closure',
])
  test('closed loader refuses ' + mode, async (t) => {
    const f = await setup(t),
      closure = await f.load();
    let plan = structuredClone(edges);
    if (mode === 'omitted') plan = [];
    if (mode === 'unknown-target') plan[0].to = 'missing';
    if (mode === 'duplicate-edge') plan.push(plan[0]);
    if (mode === 'query') plan[0].specifier += '?alias';
    if (mode === 'fragment') plan[0].specifier += '#alias';
    if (mode === 'external-url') plan[0].specifier = 'https://example.invalid/module.js';
    if (mode === 'json') plan[0].to = 'oracle';
    assert.throws(() =>
      api.createMixedNativeHostModuleHooks(
        mode === 'forged-closure' ? { ...closure } : closure,
        'entry',
        plan,
      ),
    );
  });
test('unexpected importer/specifier/format and closed hooks have no fallback', async (t) => {
  const f = await setup(t),
    closure = await f.load();
  for (const mode of ['importer', 'specifier', 'query', 'format', 'closed']) {
    const hooks = api.createMixedNativeHostModuleHooks(closure, 'entry', edges),
      entry = hooks.resolve(hooks.entrySpecifier, {});
    if (mode === 'closed') hooks.dispose();
    assert.throws(() =>
      mode === 'format'
        ? hooks.load(entry.url, { format: 'commonjs' })
        : hooks.resolve(
            mode === 'query'
              ? './answer.mjs?q'
              : mode === 'specifier'
                ? 'node:child_process'
                : './answer.mjs',
            { parentURL: mode === 'importer' ? 'file:///untrusted.mjs' : entry.url },
          ),
    );
  }
});
test('only fixed canonical builtin edges are accepted', async (t) => {
  const f = await setup(t),
    closure = await f.load(),
    plan = [...edges, { from: 'entry', specifier: 'node:path', to: 'node:path' }];
  const hooks = api.createMixedNativeHostModuleHooks(closure, 'entry', plan),
    entry = hooks.resolve(hooks.entrySpecifier, {});
  assert.equal(hooks.resolve('node:path', { parentURL: entry.url }).url, 'node:path');
  assert.equal(hooks.load('node:path', {}).format, 'builtin');
  assert.throws(() => hooks.resolve('path', { parentURL: entry.url }));
});

test('actual Node hooks execute only verified synthetic module bytes with isolated cache', async (t) => {
  const f = await setup(t, true),
    closure = await f.load(),
    plan = [...edges, { from: 'entry', specifier: 'node:path', to: 'node:path' }];
  await fs.writeFile(path.join(f.root, 'answer.mjs'), 'throw Error("must not reload file");');
  const hooks = api.createMixedNativeHostModuleHooks(closure, 'entry', plan, import.meta.url);
  const registration = registerHooks({ resolve: hooks.resolve, load: hooks.load });
  try {
    const value = await import(hooks.entrySpecifier);
    assert.equal(value.default, 42);
  } finally {
    registration.deregister();
    hooks.dispose();
  }
});

test('issued module URLs preserve relative import.meta data asset semantics', async (t) => {
  const f = await setup(t, false, true),
    closure = await f.load();
  const plan = [...edges, { from: 'entry', specifier: 'node:fs/promises', to: 'node:fs/promises' }];
  const hooks = api.createMixedNativeHostModuleHooks(closure, 'entry', plan, import.meta.url);
  const registration = registerHooks({ resolve: hooks.resolve, load: hooks.load });
  try {
    assert.equal((await import(hooks.entrySpecifier)).default, 42);
  } finally {
    registration.deregister();
    hooks.dispose();
  }
});
