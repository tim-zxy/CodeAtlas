import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  readFile,
  readdir,
  lstat,
  realpath,
  cp,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { discoverFixtures } from '../dist/index.js';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const fixture = new URL('../../../fixtures/evaluation/phase05-code-intelligence/', import.meta.url);
const read = async (name) => JSON.parse(await readFile(new URL(name, fixture), 'utf8'));
const required = [
  'java-basic-symbol',
  'java-call-basic',
  'java-overload',
  'java-inheritance',
  'java-unresolved-call',
  'p05-native-refresh-producer-v1',
  'canonical-normalization',
  'two-provider-same-call',
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function verifyPins(catalog, repository) {
  assert.equal(catalog.schemaVersion, 1);
  assert.deepEqual(catalog.fixtures.map((pin) => pin.fixtureId).sort(), [...required].sort());
  const registered = await discoverFixtures(path.join(repository, 'fixtures'));
  for (const pin of catalog.fixtures) {
    const found = registered.find((item) => item.manifest.id === pin.fixtureId);
    assert.ok(found, pin.fixtureId);
    const directory = path.join(repository, ...pin.directory.split('/'));
    assert.equal(await realpath(directory), path.resolve(directory));
    assert.equal(directory, found.directory);
    const files = [];
    const walk = async (base, prefix = '') => {
      for (const entry of await readdir(base, { withFileTypes: true })) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        const filename = path.join(base, entry.name);
        const info = await lstat(filename);
        assert.ok(!info.isSymbolicLink(), name);
        if (info.isDirectory()) await walk(filename, name);
        else {
          assert.ok(info.isFile() && info.nlink === 1, name);
          files.push({ path: name, sha256: hash(await readFile(filename)) });
        }
      }
    };
    await walk(directory);
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    assert.equal(files.length, pin.fileCount, pin.fixtureId);
    assert.equal(hash(JSON.stringify(files)), pin.sha256, pin.fixtureId);
  }
}

test('phase05 scenario inventory pins every reused source, manifest and golden byte', async () => {
  await verifyPins(await read('inputs/scenarios.json'), repository);
});

for (const mutation of ['source', 'golden', 'extra-file']) {
  test(`phase05 scenario pins refuse changed physical ${mutation} in owned copies`, async (t) => {
    const copied = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-pins-'));
    t.after(() => rm(copied, { recursive: true, force: true }));
    const catalog = await read('inputs/scenarios.json');
    for (const pin of catalog.fixtures) {
      const destination = path.join(copied, ...pin.directory.split('/'));
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(repository, ...pin.directory.split('/')), destination, {
        recursive: true,
      });
    }
    const relative =
      mutation === 'golden'
        ? 'expected/nodes.json'
        : mutation === 'source'
          ? 'source/src/Basic.java'
          : 'source/src/Extra.java';
    const filename = path.join(copied, 'fixtures/native/java-basic-symbol', relative);
    await writeFile(
      filename,
      mutation === 'extra-file'
        ? 'class Extra {}\n'
        : Buffer.concat([await readFile(filename), Buffer.from('\n')]),
    );
    await assert.rejects(verifyPins(catalog, await realpath(copied)), { code: 'ERR_ASSERTION' });
  });
}

test('phase05 critical declarations retain exact Provider identities and uncertainty coverage', async () => {
  const critical = await read('expected/critical.json');
  const registered = await discoverFixtures(path.join(repository, 'fixtures'));
  assert.deepEqual(
    critical.fixtures.map((item) => item.fixtureId).sort(),
    required.slice(0, 5).sort(),
  );
  for (const scope of critical.fixtures) {
    const found = registered.find((item) => item.manifest.id === scope.fixtureId);
    const nodes = JSON.parse(await readFile(found.expected.nodes, 'utf8'));
    const edges = found.expected.edges
      ? JSON.parse(await readFile(found.expected.edges, 'utf8'))
      : [];
    assert.equal(new Set(scope.symbols).size, scope.symbols.length);
    assert.equal(new Set(scope.directCalls).size, scope.directCalls.length);
    for (const id of scope.symbols) {
      const matched = nodes.filter((node) => node.providerFactId === id);
      assert.equal(matched.length, 1);
      assert.ok(
        ['java.class', 'java.interface', 'java.method', 'java.constructor', 'java.field'].includes(
          matched[0].providerKind,
        ),
      );
    }
    for (const id of scope.directCalls) {
      const matched = edges.filter((edge) => edge.providerFactId === id);
      assert.equal(matched.length, 1);
      assert.equal(matched[0].providerKind, 'java.call');
      assert.equal(matched[0].target.state, 'RESOLVED');
    }
    if (scope.fixtureId === 'java-basic-symbol') {
      assert.deepEqual(
        nodes
          .filter((node) => scope.symbols.includes(node.providerFactId))
          .map((node) => node.qualifiedName)
          .sort(),
        [
          'sample.basic.Basic',
          'sample.basic.Basic.Basic',
          'sample.basic.Basic.greet',
          'sample.basic.Greeter',
        ],
      );
      assert.equal(
        scope.symbols.length,
        found.manifest.criticalFacts.filter(
          (fact) => fact.type === 'NODE' && fact.importance === 'CRITICAL',
        ).length,
      );
    } else assert.deepEqual(scope.symbols, []);
    assert.deepEqual(
      [...scope.directCalls].sort(),
      found.manifest.criticalFacts
        .filter((fact) => fact.type === 'EDGE' && fact.importance === 'CRITICAL')
        .map((fact) => fact.id)
        .sort(),
    );
    assert.deepEqual(
      edges
        .filter((edge) => edge.providerKind === 'java.call' && edge.target.state === 'UNRESOLVED')
        .map((edge) => edge.target.resolution)
        .sort(),
      scope.nonresolvedCalls,
    );
  }
});
