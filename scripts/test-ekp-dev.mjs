import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('./ekp-dev.mjs', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const goldenRoot = join(repositoryRoot, 'fixtures', 'evaluation', 'metrics-v1');

function evaluate(fixtureDirectory) {
  return spawnSync(process.execPath, [scriptPath, 'eval', fixtureDirectory], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5000,
  });
}

async function temporaryRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'codeatlas eval '));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function copyGolden(directory) {
  await mkdir(directory, { recursive: true });
  for (const name of ['fixture.json', 'expected.json', 'actual.json'])
    await copyFile(join(goldenRoot, name), join(directory, name));
  return directory;
}

async function updateManifest(directory, change) {
  const path = join(directory, 'fixture.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  change(manifest);
  await writeFile(path, JSON.stringify(manifest), 'utf8');
}

function expectInputError(result, pathFragment) {
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, new RegExp(pathFragment));
  assert.doesNotMatch(result.stderr, /SecretPayload123/);
}

test('golden Fixture emits a complete JSON v1 report and exits zero', () => {
  const result = evaluate(goldenRoot);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.ok(result.stdout.endsWith('\n'));
  const report = JSON.parse(result.stdout);
  assert.equal(report.reportVersion, 1);
  assert.equal(report.fixtureId, 'p0-metric-engine-v1');
  assert.equal(report.fixtureSchemaVersion, 1);
  assert.equal(report.toolVersion, '0.0.0');
  assert.equal(report.providerVersion, null);
  assert.equal(report.runtimeVersion, null);
  assert.deepEqual(report.counts.node, { tp: 1, fp: 2, fn: 2 });
  assert.deepEqual(report.counts.edge, { tp: 0, fp: 2, fn: 1 });
  assert.deepEqual(report.counts.criticalFact, { tp: 1, fp: 2, fn: 2 });
  assert.equal(report.criticalPrecisionScope, 'DECLARED_CRITICAL_SLOTS_ONLY');
  assert.equal(report.gatesDeclared, true);
  assert.equal(report.gates.length, 6);
  assert.ok(report.gates.every((gate) => gate.status === 'PASS'));
  assert.equal(report.overall, 'PASS');
  assert.ok(Number.isFinite(report.durationMs) && report.durationMs >= 0);
  assert.ok(Number.isFinite(report.resourceUse.rssBytes) && report.resourceUse.rssBytes > 0);
});

test('absolute Fixture path containing spaces stays one argument', async (t) => {
  const root = await temporaryRoot(t);
  const fixture = await copyGolden(join(root, 'fixture with spaces'));
  const result = evaluate(fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).fixtureId, 'p0-metric-engine-v1');
});

test('NODE and EDGE critical declarations may share a FactKey', async (t) => {
  const fixture = await copyGolden(join(await temporaryRoot(t), 'fixture'));
  await updateManifest(fixture, (manifest) => {
    manifest.criticalFacts = [
      { id: 'node-unchanged', type: 'NODE', importance: 'CRITICAL' },
      { id: 'node-unchanged', type: 'EDGE', importance: 'CRITICAL' },
    ];
    manifest.qualityGates = {};
  });
  for (const name of ['expected.json', 'actual.json']) {
    const path = join(fixture, name);
    const graph = JSON.parse(await readFile(path, 'utf8'));
    graph.edges[0].factKey = 'node-unchanged';
    await writeFile(path, JSON.stringify(graph), 'utf8');
  }
  const result = evaluate(fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).counts.criticalFact, { tp: 1, fp: 1, fn: 1 });
});

test('failed gate returns complete JSON and exit one', async (t) => {
  const fixture = await copyGolden(join(await temporaryRoot(t), 'fixture'));
  await updateManifest(fixture, (manifest) => {
    manifest.qualityGates.nodePrecision.threshold = 0.5;
  });
  const result = evaluate(fixture);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.equal(report.overall, 'FAIL');
  assert.deepEqual(
    report.gates.find((gate) => gate.name === 'nodePrecision'),
    {
      name: 'nodePrecision',
      value: 1 / 3,
      operator: '>=',
      threshold: 0.5,
      status: 'FAIL',
    },
  );
  assert.deepEqual(report.counts.node, { tp: 1, fp: 2, fn: 2 });
});

test('not-evaluable gate returns complete JSON and exit one', async (t) => {
  const fixture = await copyGolden(join(await temporaryRoot(t), 'fixture'));
  await updateManifest(fixture, (manifest) => {
    manifest.criticalFacts = [];
    manifest.qualityGates = { nodePrecision: { operator: '>=', threshold: 0 } };
  });
  for (const name of ['expected.json', 'actual.json'])
    await writeFile(join(fixture, name), JSON.stringify({ nodes: [], edges: [] }), 'utf8');
  const result = evaluate(fixture);
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.metrics.nodePrecision.value, null);
  assert.equal(report.gates[0].status, 'NOT_EVALUABLE');
  assert.equal(report.overall, 'FAIL');
});

test('no declared gates emits empty gate set without claiming threshold compliance', async (t) => {
  const fixture = await copyGolden(join(await temporaryRoot(t), 'fixture'));
  await updateManifest(fixture, (manifest) => {
    manifest.qualityGates = {};
  });
  const result = evaluate(fixture);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.gatesDeclared, false);
  assert.deepEqual(report.gates, []);
  assert.equal(report.overall, 'PASS');
});

test('zero and multiple discovered Fixtures fail without partial JSON', async (t) => {
  const root = await temporaryRoot(t);
  expectInputError(evaluate(root), 'Fixture');
  await copyGolden(join(root, 'one'));
  await copyGolden(join(root, 'two'));
  await updateManifest(join(root, 'two'), (manifest) => {
    manifest.id = 'another-metric-fixture';
  });
  expectInputError(evaluate(root), 'Fixture');
});

test('missing required artifact key and directory-valued artifact fail', async (t) => {
  const fixture = await copyGolden(join(await temporaryRoot(t), 'fixture'));
  await updateManifest(fixture, (manifest) => {
    manifest.expected = { other: 'expected.json' };
  });
  expectInputError(evaluate(fixture), 'expected.canonical');
  await updateManifest(fixture, (manifest) => {
    manifest.expected = { canonical: 'expected.json' };
    manifest.inputs.actual = 'actual-dir/';
  });
  await mkdir(join(fixture, 'actual-dir'));
  expectInputError(evaluate(fixture), 'inputs.actual');
});

test('malformed JSON and wrong graph shape fail atomically with artifact paths', async (t) => {
  const fixture = await copyGolden(join(await temporaryRoot(t), 'fixture'));
  await writeFile(join(fixture, 'actual.json'), '{ SecretPayload123', 'utf8');
  expectInputError(evaluate(fixture), 'actual.json');
  await writeFile(join(fixture, 'actual.json'), '[]', 'utf8');
  expectInputError(evaluate(fixture), 'actual.json');
});

test('unknown metric gate fails with its manifest field path', async (t) => {
  const fixture = await copyGolden(join(await temporaryRoot(t), 'fixture'));
  await updateManifest(fixture, (manifest) => {
    manifest.qualityGates.callPrecision = { operator: '>=', threshold: 0.9 };
  });
  expectInputError(evaluate(fixture), 'qualityGates.callPrecision');
});

test('unsupported command and missing directory argument fail without JSON', () => {
  expectInputError(
    spawnSync(process.execPath, [scriptPath, 'unknown', goldenRoot], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      timeout: 5000,
    }),
    'usage',
  );
  expectInputError(
    spawnSync(process.execPath, [scriptPath, 'eval'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      timeout: 5000,
    }),
    'usage',
  );
});
