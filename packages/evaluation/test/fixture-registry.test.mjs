import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import { discoverFixtures, FixtureRegistryError } from '../dist/index.js';

const valid = {
  schemaVersion: 1,
  id: 'base',
  category: 'code-intelligence',
  phase: '0',
  languages: [],
  frameworks: [],
  capabilities: [],
  inputs: { source: 'source/' },
  expected: { nodes: 'expected/nodes.json' },
  criticalFacts: [],
  qualityGates: {},
};

async function temporaryFixtureRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'codeatlas-fixture-registry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeFixture(root, folder, manifest) {
  const directory = join(root, folder);
  await mkdir(join(directory, 'source'), { recursive: true });
  await mkdir(join(directory, 'expected'), { recursive: true });
  await writeFile(join(directory, 'expected', 'nodes.json'), '[]', 'utf8');
  await writeFile(join(directory, 'fixture.json'), JSON.stringify(manifest), 'utf8');
  return directory;
}

async function expectError(root, code, manifestPath, fieldPath) {
  await assert.rejects(discoverFixtures(root), (error) => {
    assert.ok(error instanceof FixtureRegistryError);
    assert.equal(error.code, code);
    assert.equal(error.manifestPath, manifestPath);
    assert.equal(error.fieldPath, fieldPath);
    return true;
  });
}

test('discovers nested manifests in stable order and ignores cases.json', async (t) => {
  const root = await temporaryFixtureRoot(t);
  await writeFixture(root, 'z', { ...valid, id: 'z' });
  await writeFixture(root, 'a/nested', { ...valid, id: 'a' });
  await writeFile(join(root, 'a', 'nested', 'cases.json'), '{ bad json', 'utf8');
  const found = await discoverFixtures(root);
  assert.deepEqual(
    found.map((entry) => entry.manifest.id),
    ['a', 'z'],
  );
  assert.deepEqual(
    found.map((entry) => entry.manifestPath),
    ['a/nested/fixture.json', 'z/fixture.json'],
  );
  assert.equal(found[0].directory, resolve(root, 'a/nested'));
  assert.equal(found[0].inputs.source, resolve(root, 'a/nested/source'));
  assert.equal(found[0].expected.nodes, resolve(root, 'a/nested/expected/nodes.json'));
});

test('empty root returns an empty registry', async (t) => {
  const root = await temporaryFixtureRoot(t);
  assert.deepEqual(await discoverFixtures(root), []);
});

test('a root that is absent or not a directory fails explicitly', async (t) => {
  const root = await temporaryFixtureRoot(t);
  await writeFile(join(root, 'file'), '', 'utf8');
  for (const invalidRoot of [join(root, 'missing'), join(root, 'file')]) {
    await assert.rejects(discoverFixtures(invalidRoot), (error) => {
      assert.ok(error instanceof FixtureRegistryError);
      assert.equal(error.code, 'ROOT_INVALID');
      return true;
    });
  }
});

test('malformed JSON after a valid manifest fails atomically', async (t) => {
  const root = await temporaryFixtureRoot(t);
  await writeFixture(root, 'a', { ...valid, id: 'a' });
  const bad = await writeFixture(root, 'z', { ...valid, id: 'z' });
  await writeFile(join(bad, 'fixture.json'), '{ bad json', 'utf8');
  await expectError(root, 'MANIFEST_INVALID', 'z/fixture.json', '');
});

test('duplicate IDs identify both manifests', async (t) => {
  const root = await temporaryFixtureRoot(t);
  await writeFixture(root, 'a', valid);
  await writeFixture(root, 'z', valid);
  await assert.rejects(discoverFixtures(root), (error) => {
    assert.ok(error instanceof FixtureRegistryError);
    assert.equal(error.code, 'DUPLICATE_ID');
    assert.equal(error.manifestPath, 'z/fixture.json');
    assert.equal(error.fieldPath, 'id');
    assert.match(error.message, /a\/fixture\.json/);
    assert.match(error.message, /z\/fixture\.json/);
    return true;
  });
});

test('missing artifact names the manifest and field', async (t) => {
  const root = await temporaryFixtureRoot(t);
  await writeFixture(root, 'a', { ...valid, expected: { nodes: 'expected/missing.json' } });
  await expectError(root, 'ARTIFACT_INVALID', 'a/fixture.json', 'expected.nodes');
});

test('a trailing slash requires a directory artifact', async (t) => {
  const root = await temporaryFixtureRoot(t);
  await writeFixture(root, 'a', { ...valid, expected: { nodes: 'expected/nodes.json/' } });
  await expectError(root, 'ARTIFACT_INVALID', 'a/fixture.json', 'expected.nodes');
});

test('lexical traversal and absolute paths fail before filesystem access', async (t) => {
  const root = await temporaryFixtureRoot(t);
  const directory = await writeFixture(root, 'a', {
    ...valid,
    expected: { nodes: '../outside.json' },
  });
  await expectError(root, 'MANIFEST_INVALID', 'a/fixture.json', 'expected.nodes');
  await writeFile(
    join(directory, 'fixture.json'),
    JSON.stringify({ ...valid, expected: { nodes: resolve(root, 'outside.json') } }),
    'utf8',
  );
  await expectError(root, 'MANIFEST_INVALID', 'a/fixture.json', 'expected.nodes');
});

test('artifact symlink cannot escape its Fixture directory', async (t) => {
  const root = await temporaryFixtureRoot(t);
  const directory = await writeFixture(root, 'a', {
    ...valid,
    expected: { nodes: 'expected/link/nodes.json' },
  });
  const outside = join(root, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'nodes.json'), '[]', 'utf8');
  try {
    await symlink(outside, join(directory, 'expected', 'link'), 'junction');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('symlinks unavailable');
    throw error;
  }
  await expectError(root, 'ARTIFACT_INVALID', 'a/fixture.json', 'expected.nodes');
});

test('directory symlink cycle does not cause recursive discovery', async (t) => {
  const root = await temporaryFixtureRoot(t);
  const directory = await writeFixture(root, 'a', valid);
  try {
    await symlink(directory, join(directory, 'loop'), 'junction');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('symlinks unavailable');
    throw error;
  }
  const found = await discoverFixtures(root);
  assert.deepEqual(
    found.map((entry) => entry.manifestPath),
    ['a/fixture.json'],
  );
});

test('committed registry Fixture is discoverable', async () => {
  const root = resolve('fixtures/evaluation');
  const found = await discoverFixtures(root);
  const fixture = found.find(({ manifest }) => manifest.id === 'p0-fixture-registry-v1');
  assert.ok(fixture);
  assert.equal(fixture.manifestPath, 'registry-v1/fixture.json');
});
