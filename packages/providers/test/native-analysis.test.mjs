import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { discoverFixtures } from '../../evaluation/dist/index.js';
import { executeNativeRequest } from '../dist/index.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const fixtureRoot = path.join(repositoryRoot, 'fixtures/native');

function nativeBinaryPath() {
  const target = process.env.CARGO_TARGET_DIR;
  const root = target ? path.resolve(repositoryRoot, target) : path.join(repositoryRoot, 'target');
  return path.join(
    root,
    'debug',
    process.platform === 'win32' ? 'codeatlas-native-analyzer.exe' : 'codeatlas-native-analyzer',
  );
}

async function fixtureRequest(fixture) {
  const sourceRoot = fixture.inputs.source;
  const files = (await readdir(path.join(sourceRoot, 'src'))).filter((name) =>
    name.endsWith('.java'),
  );
  assert.equal(files.length, 1, fixture.manifest.id);
  const relativePath = `src/${files[0]}`;
  const source = await readFile(path.join(sourceRoot, relativePath));
  const expectedCoverage = JSON.parse(await readFile(fixture.expected.coverage, 'utf8'));
  const sourceFileId = expectedCoverage[0].sourceFileId;
  return {
    source,
    relativePath,
    request: {
      protocolVersion: 1,
      requestId: `analyze-${fixture.manifest.id}`,
      type: 'ANALYZE',
      payload: {
        irSchemaVersion: 1,
        providerSnapshotId: 'snapshot-fixture',
        repository: { id: 'repo-fixture', rootPath: sourceRoot },
        requestedCapabilities: ['SYMBOL'],
        deadlineEpochMs: null,
        resourceBudget: { maxDurationMs: 10_000, maxMemoryBytes: 64 * 1024 * 1024, maxEvents: 100 },
        revision: {
          id: 'rev-fixture',
          repositoryId: 'repo-fixture',
          contentFingerprint: 'sha256:revision-fixture',
          kind: 'WORKTREE',
          baseRevisionId: null,
        },
        sourceFiles: [
          {
            id: sourceFileId,
            repositoryId: 'repo-fixture',
            revisionId: 'rev-fixture',
            path: relativePath,
            contentFingerprint: `sha256:${createHash('sha256').update(source).digest('hex')}`,
            classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
            languageHint: 'java',
            sensitivity: 'PUBLIC',
          },
        ],
      },
    },
  };
}

function signatureAtNode(source, node) {
  if (node.providerKind !== 'java.method' && node.providerKind !== 'java.constructor') return '';
  const line = source.toString('utf8').split(/\r?\n/)[node.sourceRange.startLine];
  const suffix = line.slice(
    line.indexOf(node.name, node.sourceRange.startColumn) + node.name.length,
  );
  const parameterText = suffix.match(/^\s*\(([^)]*)\)/)?.[1];
  assert.notEqual(parameterText, undefined, node.qualifiedName);
  const types =
    parameterText.trim() === ''
      ? []
      : parameterText.split(',').map((parameter) => {
          const parts = parameter.trim().split(/\s+/);
          assert.ok(parts.length >= 2, parameter);
          return parts.slice(0, -1).join(' ');
        });
  return `(${types.join(',')})`;
}

function criticalMatched(fixture, nodes, relativePath, source) {
  const observed = new Set(
    nodes
      .map((node) => {
        const base = `${relativePath}|${node.providerKind}|${node.qualifiedName}`;
        return [base, `${base}|${signatureAtNode(source, node)}`];
      })
      .flat(),
  );
  return fixture.manifest.criticalFacts.filter(
    (fact) => fact.type === 'NODE' && observed.has(fact.id),
  ).length;
}

async function fixtureCases() {
  const fixtures = (await discoverFixtures(fixtureRoot)).filter((fixture) =>
    ['java-basic-symbol', 'java-nested-types'].includes(fixture.manifest.id),
  );
  assert.deepEqual(
    fixtures.map((fixture) => fixture.manifest.id),
    ['java-basic-symbol', 'java-nested-types'],
  );
  return fixtures;
}

test('real Native binary matches both Java symbol Fixtures and critical recall gate', async () => {
  for (const fixture of await fixtureCases()) {
    const { request, relativePath, source } = await fixtureRequest(fixture);
    const result = await executeNativeRequest(request, {
      executablePath: nativeBinaryPath(),
      arguments: ['--parse-workers', '1'],
      timeoutMs: request.payload.resourceBudget.maxDurationMs,
    });
    const events = result.events;
    assert.equal(result.terminal.type, 'ANALYSIS_COMPLETED');
    assert.equal(result.terminal.payload.outcome, 'SUCCEEDED');
    const nodes = events.filter((event) => event.type === 'NODE').map((event) => event.payload);
    const coverage = events
      .filter((event) => event.type === 'COVERAGE')
      .map((event) => event.payload);
    const diagnostics = events
      .filter((event) => event.type === 'DIAGNOSTIC')
      .map((event) => event.payload);
    assert.deepEqual(nodes, JSON.parse(await readFile(fixture.expected.nodes, 'utf8')));
    assert.deepEqual(coverage, JSON.parse(await readFile(fixture.expected.coverage, 'utf8')));
    assert.deepEqual(diagnostics, JSON.parse(await readFile(fixture.expected.diagnostics, 'utf8')));
    const critical = fixture.manifest.criticalFacts.filter((fact) => fact.type === 'NODE');
    assert.ok(critical.length > 0);
    const matched = criticalMatched(fixture, nodes, relativePath, source);
    assert.ok(
      matched / critical.length >= 0.95,
      `${fixture.manifest.id}: ${matched}/${critical.length} critical facts matched`,
    );
  }
});

test('stale source and corrupt or incomplete streams expose no applicable result', async () => {
  const [fixture] = await fixtureCases();
  const { request } = await fixtureRequest(fixture);
  const options = {
    executablePath: nativeBinaryPath(),
    arguments: ['--parse-workers', '1'],
    timeoutMs: 10_000,
  };
  const stale = structuredClone(request);
  stale.payload.sourceFiles[0].contentFingerprint = `sha256:${'0'.repeat(64)}`;
  await assert.rejects(executeNativeRequest(stale, options), { code: 'ANALYZER_FAILED' });

  const valid = await executeNativeRequest(request, options);
  const platformEnvironment = Object.fromEntries(
    ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]]),
  );
  for (const mode of ['wrong-checksum', 'wrong-count', 'truncated']) {
    const events = structuredClone(valid.events);
    if (mode === 'wrong-checksum')
      events.at(-1).payload.integrityChecksum = `sha256:${'0'.repeat(64)}`;
    if (mode === 'wrong-count') events.at(-1).payload.counts.nodes += 1;
    const output = (mode === 'truncated' ? events.slice(0, -1) : events)
      .map((event) => `${JSON.stringify(event)}\n`)
      .join('');
    const childCode =
      'process.stdin.resume();process.stdin.on("end",()=>process.stdout.write(Buffer.from(process.argv[1],"base64")))';
    await assert.rejects(
      executeNativeRequest(request, {
        executablePath: process.execPath,
        arguments: ['-e', childCode, Buffer.from(output).toString('base64')],
        timeoutMs: 10_000,
        allowedEnvironment: platformEnvironment,
      }),
      (error) => {
        assert.equal(
          error.code,
          mode === 'wrong-checksum' ? 'CHECKSUM_MISMATCH' : 'PROTOCOL_VIOLATION',
          `${JSON.stringify(error.toJSON?.())} stderr=${error.stderr}`,
        );
        return true;
      },
    );
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(executeNativeRequest(request, { ...options, signal: controller.signal }), {
    code: 'CANCELLED',
  });
  await assert.rejects(
    executeNativeRequest(request, {
      executablePath: process.execPath,
      arguments: ['-e', 'process.stdin.resume();setTimeout(()=>{},10_000)'],
      timeoutMs: 25,
      allowedEnvironment: platformEnvironment,
    }),
    { code: 'TIMEOUT' },
  );
});
