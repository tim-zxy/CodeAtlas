import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import * as replay from './helpers/native-refresh-transport-replay.mjs';

// Optional local differential oracle is the untouched frozen helper, never a worker.
const baseline = process.env.CODEATLAS_REPLAY_BASELINE_FILE
  ? await import(pathToFileURL(process.env.CODEATLAS_REPLAY_BASELINE_FILE).href)
  : undefined;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, child]) => [key, canonical(child)]),
        )
      : value;
const hash = (domain, value) => sha(domain + '\0' + JSON.stringify(canonical(value)) + '\n');
const lexical = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

async function fixture() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'catalog-index-test-')));
  const repository = path.join(root, 'repository');
  const native = path.join(root, 'native');
  const dependencies = [],
    roots = [
      { name: 'repository', path: repository },
      { name: 'native', path: native },
    ];
  const workspace = {
    id: 'workspace-' + hash('p05-refresh-workspace-v1', 'packages/main'),
    name: '@fixture/main',
    path: 'packages/main',
  };
  const instances = [],
    imports = [];
  const put = async (directory, name, content, prefix) => {
    await fs.mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await fs.writeFile(path.join(directory, name), content);
    const entry = { path: name, sha256: sha(content) };
    dependencies.push({ ...entry, path: prefix + '/' + name });
    return entry;
  };
  await put(repository, 'package.json', '{}\n', 'repository');
  await put(native, 'synthetic.bin', 'synthetic-not-executable', 'native');
  for (let i = 0; i < 3; i++) {
    const name = 'fixture-' + i;
    const relative = 'node_modules/' + name;
    const directory = path.join(repository, relative);
    const entries = [
      { path: 'index.js', sha256: sha('export {};\n') },
      { path: 'package.json', sha256: sha('{}\n') },
    ];
    const instance = {
      name,
      version: '1.0.0',
      path: relative,
      inventoryDigest: hash('p05-refresh-instance-files-v1', entries),
    };
    instance.id = 'package-' + hash('p05-refresh-instance-v1', instance);
    instances.push(instance);
    roots.push({ name: instance.id, path: directory });
    imports.push({ from: workspace.id, specifier: name, kind: 'DEPENDENCY', target: instance.id });
    for (const [file, content] of [
      ['index.js', 'export {};\n'],
      ['package.json', '{}\n'],
    ])
      await put(directory, file, content, instance.id);
  }
  dependencies.sort((a, b) => lexical(a.path, b.path));
  roots.sort((a, b) => lexical(a.name, b.name));
  instances.sort((a, b) => lexical(a.id, b.id));
  imports.sort((a, b) =>
    lexical(
      a.from + '\0' + a.kind + '\0' + a.specifier,
      b.from + '\0' + b.kind + '\0' + b.specifier,
    ),
  );
  const core = { schemaVersion: 1, workspaces: [workspace], instances, imports };
  const topology = { ...core, digest: hash('p05-refresh-topology-v1', core) };
  return { root, dependencies, roots, topology };
}
async function owned(operation) {
  const f = await fixture();
  try {
    return await operation(f);
  } finally {
    assert.ok(path.basename(f.root).startsWith('catalog-index-test-'));
    await fs.rm(f.root, { recursive: true });
  }
}
const validate = (module, f) =>
  module.validateRefreshReplayTopologyRecord(f.topology, f.dependencies, f.roots);
const errorOf = (operation) => {
  try {
    operation();
  } catch (error) {
    return { name: error.name, code: error.code, message: error.message };
  }
  assert.fail('Expected rejection');
};

test('catalog index preserves complete topology and avoids per-instance membership rescans', () =>
  owned(async (f) => {
    const expected = baseline ? validate(baseline, f) : f.topology;
    const before = JSON.stringify(f);
    const startsWith = String.prototype.startsWith;
    let scans = 0;
    String.prototype.startsWith = function (prefix, ...rest) {
      if (typeof prefix === 'string' && /^package-[a-f0-9]{64}\/$/.test(prefix)) scans++;
      return startsWith.call(this, prefix, ...rest);
    };
    let actual;
    try {
      actual = validate(replay, f);
    } finally {
      String.prototype.startsWith = startsWith;
    }
    assert.deepEqual(actual, expected);
    assert.equal(JSON.stringify(f), before);
    assert.ok(
      scans <= f.dependencies.length,
      'Membership matching must not rescan the catalog per instance',
    );
  }));

test('catalog index retains malformed topology rejection and error precedence', () =>
  owned(async (original) => {
    const defects = [
      [
        (f) => {
          f.topology.instances[0].id = 'bad';
          f.dependencies[0].path = null;
        },
        /Instance identity mismatch/,
      ],
      [
        (f) => {
          f.topology.instances.reverse();
        },
        /order|sorted/i,
      ],
      [
        (f) => {
          f.dependencies[0] = null;
        },
        /./,
      ],
      [
        (f) => {
          f.dependencies[0].path = 7;
        },
        /./,
      ],
      [
        (f) => {
          f.dependencies = f.dependencies.filter(
            (e) => !e.path.startsWith(f.topology.instances[0].id + '/'),
          );
        },
        /Missing instance inventory/,
      ],
      [
        (f) => {
          f.topology.imports[0].target = 'missing';
        },
        /Unknown or aliased topology target/,
      ],
      [
        (f) => {
          f.topology.imports = [];
        },
        /Unreachable topology instance/,
      ],
      [
        (f) => {
          f.topology.digest = 'a'.repeat(64);
        },
        /Dependency topology digest mismatch/,
      ],
    ];
    for (const [mutate, expected] of defects) {
      const f = structuredClone(original);
      mutate(f);
      const actual = errorOf(() => validate(replay, f));
      assert.match(actual.message, expected);
      if (baseline)
        assert.deepEqual(
          actual,
          errorOf(() => validate(baseline, f)),
        );
    }
  }));

test('catalog index preserves file-open order, repeated hashing and late-root refusal', () =>
  owned(async (f) => {
    const opens = [],
      open = fs.open;
    fs.open = async (...args) => {
      opens.push(args[0]);
      return open(...args);
    };
    syncBuiltinESMExports();
    const verify = (module, catalog = f) =>
      module.verifyRefreshReplayDependencyCatalog(
        catalog,
        catalog.roots,
        catalog.dependencies,
        catalog.topology,
      );
    try {
      if (baseline) {
        await verify(baseline);
      }
      const oracle = opens.splice(0);
      await verify(replay);
      const first = opens.splice(0);
      assert.equal(first.length, f.dependencies.length);
      if (baseline) assert.deepEqual(first, oracle);
      await verify(replay);
      assert.deepEqual(opens.splice(0), first);
      const file = first.at(-1);
      const bytes = await fs.readFile(file);
      await fs.writeFile(file, Buffer.concat([bytes, Buffer.from('changed')]));
      await assert.rejects(verify(replay), /Asset hash mismatch/);
      const rejected = opens.splice(0);
      if (baseline) {
        await assert.rejects(verify(baseline), /Asset hash mismatch/);
        assert.deepEqual(opens.splice(0), rejected);
      }
      await fs.writeFile(file, bytes);
      const alias = structuredClone(f);
      alias.dependencies.reverse();
      await assert.rejects(verify(replay, alias), /Unsorted|digest/i);
    } finally {
      fs.open = open;
      syncBuiltinESMExports();
    }
  }));

test('catalog index leaves legacy nested root-prefix behavior unchanged', () =>
  owned(async (f) => {
    const directory = path.join(f.root, 'legacy');
    await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, 'a'), 'a');
    const roots = [{ name: 'legacy/nested', path: directory }],
      dependencies = [{ path: 'legacy/nested/a', sha256: sha('a') }];
    const current = { roots, dependencies };
    await replay.verifyRefreshReplayDependencyCatalog(current, roots, dependencies);
    if (baseline) await baseline.verifyRefreshReplayDependencyCatalog(current, roots, dependencies);
  }));
