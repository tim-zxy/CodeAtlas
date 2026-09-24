import { readFile, stat } from 'node:fs/promises';
import process from 'node:process';

import {
  calculateMetrics,
  CanonicalComparatorError,
  compareCanonicalFacts,
  discoverFixtures,
  evaluateQualityGates,
  FixtureRegistryError,
} from '../packages/evaluation/dist/index.js';

class CliInputError extends Error {
  constructor(path, reason) {
    super(`${path}: ${reason}`);
    this.name = 'CliInputError';
  }
}

function safeDiagnostic(value) {
  return String(value)
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .slice(0, 500);
}

async function graphArtifact(fixture, side, name) {
  const path = fixture[side][name];
  const fieldPath = `${side}.${name}`;
  if (path === undefined)
    throw new CliInputError(
      `${fixture.manifestPath}: ${fieldPath}`,
      'required JSON artifact is missing',
    );
  if (!(await stat(path)).isFile())
    throw new CliInputError(`${fixture.manifestPath}: ${fieldPath}`, 'must be a JSON file');
  let source;
  try {
    source = await readFile(path, 'utf8');
    return JSON.parse(source);
  } catch {
    throw new CliInputError(path, 'cannot read a JSON artifact');
  }
}

async function evaluateDirectory(fixtureDirectory, started) {
  const fixtures = await discoverFixtures(fixtureDirectory);
  if (fixtures.length !== 1)
    throw new CliInputError(fixtureDirectory, 'expected exactly one Fixture');
  const fixture = fixtures[0];
  const expected = await graphArtifact(fixture, 'expected', 'canonical');
  const actual = await graphArtifact(fixture, 'inputs', 'actual');
  let comparison;
  try {
    comparison = compareCanonicalFacts({ expected, actual });
  } catch (error) {
    if (!(error instanceof CanonicalComparatorError)) throw error;
    const artifact = error.fieldPath.startsWith('expected')
      ? fixture.expected.canonical
      : fixture.inputs.actual;
    throw new CliInputError(`${artifact}: ${error.fieldPath}`, safeDiagnostic(error.message));
  }
  const scored = calculateMetrics(comparison, fixture.manifest.criticalFacts, fixture.manifestPath);
  const gated = evaluateQualityGates(
    scored.metrics,
    fixture.manifest.qualityGates,
    fixture.manifestPath,
  );
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  return {
    reportVersion: 1,
    fixtureId: fixture.manifest.id,
    fixtureSchemaVersion: fixture.manifest.schemaVersion,
    toolVersion: packageJson.version,
    providerVersion: null,
    runtimeVersion: null,
    counts: scored.counts,
    metrics: scored.metrics,
    criticalFailures: scored.criticalFailures,
    coverageExclusions: scored.coverageExclusions,
    criticalPrecisionScope: 'DECLARED_CRITICAL_SLOTS_ONLY',
    gatesDeclared: gated.gates.length !== 0,
    gates: gated.gates,
    overall: gated.overall,
    durationMs,
    resourceUse: { rssBytes: process.memoryUsage().rss, reason: null },
  };
}

const started = process.hrtime.bigint();
try {
  if (process.argv.length !== 4 || process.argv[2] !== 'eval') {
    throw new CliInputError('usage', 'ekp-dev eval <fixture-directory>');
  }
  const report = await evaluateDirectory(process.argv[3], started);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.overall === 'PASS' ? 0 : 1;
} catch (error) {
  if (error instanceof CliInputError || error instanceof FixtureRegistryError) {
    process.stderr.write(`${safeDiagnostic(error.message)}\n`);
  } else {
    process.stderr.write('evaluation failed\n');
  }
  process.exitCode = 2;
}
