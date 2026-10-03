import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { discoverFixtures } from '../../evaluation/dist/index.js';
import * as api from '../dist/index.js';
import { requestBytes, chunkBytes } from './helpers/native-refresh-v3-corpus.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const fixtures = await discoverFixtures(path.join(root, 'fixtures/native'));
const fixture = fixtures.find(({ manifest }) => manifest.id === 'p05-native-refresh-producer-v1');

test('C2 source transitions are registered and required by native root/package runners', async () => {
  assert.ok(fixture, 'registered source-grounded C2 Fixture');
  const index = JSON.parse(
    await readFile(path.join(root, 'fixtures/ipc/refresh-v3/cases.json'), 'utf8'),
  );
  assert.equal(
    path.resolve(root, 'fixtures/ipc/refresh-v3', index.binarySuite),
    fileURLToPath(import.meta.url),
  );
  assert.equal(index.binaryFixture, fixture.manifest.id);
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.ok(
    manifest.scripts['test:native-analysis']
      .split(' ')
      .includes('packages/providers/test/native-refresh-v3-binary.test.mjs'),
  );
  const provider = JSON.parse(
    await readFile(path.join(root, 'packages/providers/package.json'), 'utf8'),
  );
  assert.ok(
    provider.scripts['test:native-refresh-v3']
      .split(' ')
      .includes('test/native-refresh-v3-binary.test.mjs'),
  );
});

const transitions = fixture
  ? JSON.parse(await readFile(fixture.expected.transitions, 'utf8'))
  : { cases: [] };
const binary = path.join(
  process.env.CARGO_TARGET_DIR
    ? path.resolve(root, process.env.CARGO_TARGET_DIR)
    : path.join(root, 'target'),
  'debug',
  process.platform === 'win32' ? 'codeatlas-native-analyzer.exe' : 'codeatlas-native-analyzer',
);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const nativeEnvironment = Object.fromEntries(
  ['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].flatMap((key) =>
    process.env[key] ? [[key, process.env[key]]] : [],
  ),
);
const byId = (a, b) => a.providerFactId.localeCompare(b.providerFactId);
const facts = (events, type) =>
  events
    .filter((e) => e.type === type)
    .map((e) => e.payload)
    .sort(byId);
const metadata = (events, type) => events.filter((e) => e.type === type).map((e) => e.payload);
// Only snapshot identity is history-dependent; source, resolution and uncertainty remain.
function semantic(fact) {
  const { providerSnapshotId: _snapshot, ...rest } = fact;
  return rest;
}
function replayRefreshFacts(baselineNodes, baselineEdges, events) {
  const nodes = new Map(baselineNodes.map((f) => [f.providerFactId, f]));
  const edges = new Map(baselineEdges.map((f) => [f.providerFactId, f]));
  for (const { type, payload } of events) {
    if (type === 'UPSERT_NODE') nodes.set(payload.providerFactId, payload);
    if (type === 'UPSERT_EDGE') edges.set(payload.providerFactId, payload);
    if (type === 'REMOVE_NODE') assert.ok(nodes.delete(payload.providerFactId));
    if (type === 'REMOVE_EDGE') assert.ok(edges.delete(payload.providerFactId));
  }
  return { nodes: [...nodes.values()].sort(byId), edges: [...edges.values()].sort(byId) };
}
function toNormalizationResult(full, nodes, edges, coverage, diagnostics, terminal) {
  assert.equal(
    terminal.payload.outcome,
    'SUCCEEDED',
    'PARTIAL observation cannot enter an activation-shaped comparison',
  );
  const { analysisStateContext: _context, baselineState: _baseline, ...payload } = full.payload;
  const request = { protocolVersion: 2, requestId: full.requestId, type: 'ANALYZE', payload };
  const context = {
    providerSnapshotId: payload.providerSnapshotId,
    repositoryId: payload.repository.id,
    revisionId: payload.revision.id,
    revisionFingerprint: payload.revision.contentFingerprint,
  };
  const retag = (f) => ({ ...structuredClone(f), providerSnapshotId: context.providerSnapshotId });
  const rows = [
    ['ANALYSIS_STARTED', context],
    ...payload.sourceFiles.map((f) => ['SOURCE_FILE', f]),
    ...nodes.map((f) => ['NODE', retag(f)]),
    ...edges.map((f) => ['EDGE', retag(f)]),
    ...coverage.map((c) => ['COVERAGE', c]),
    ...diagnostics.map((d) => ['DIAGNOSTIC', d]),
  ];
  const events = rows.map(([type, payload], sequence) => ({
    protocolVersion: 2,
    requestId: full.requestId,
    sequence,
    type,
    payload,
  }));
  const completed = {
    protocolVersion: 2,
    requestId: full.requestId,
    sequence: events.length,
    type: 'ANALYSIS_COMPLETED',
    payload: {
      ...context,
      outcome: 'SUCCEEDED',
      counts: {
        sourceFiles: payload.sourceFiles.length,
        nodes: nodes.length,
        edges: edges.length,
        coverage: coverage.length,
        diagnostics: diagnostics.length,
      },
      capabilities: terminal.payload.capabilities,
      contentFingerprint: terminal.payload.contentFingerprint,
      integrityChecksum: `sha256:${sha(events.map((e) => JSON.stringify(e) + '\n').join(''))}`,
    },
  };
  events.push(completed);
  api.NativeAnalyzeEventStreamV2Schema.parse({ request, events });
  return { request, events, terminal: completed, stderr: '' };
}
function run(bytes, workers) {
  const child = spawnSync(binary, ['--parse-workers', String(workers)], {
    input: bytes,
    timeout: 10_000,
    maxBuffer: api.NATIVE_CLIENT_HARD_LIMITS.maxStdoutBytes,
    shell: false,
    windowsHide: true,
    env: nativeEnvironment,
  });
  assert.ifError(child.error);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0);
  assert.equal(child.stderr.length, 0, 'valid protocol produces no diagnostic log');
  return child.stdout;
}
async function observe(full, workers) {
  const bytes = requestBytes(full, { summaries: [] });
  api.decodeNativeRequestV3(bytes);
  const output = run(bytes, workers);
  const events = [];
  const result = await api.decodeNativeFullAnalysisV3(
    full,
    chunkBytes(output),
    {
      async accept(e) {
        events.push(e);
      },
    },
    api.NATIVE_CLIENT_HARD_LIMITS,
  );
  assert.equal(result.terminal.type, 'ANALYSIS_COMPLETED');
  return { ...result, events };
}
async function snapshot(directory, entries, classificationChange) {
  const files = [];
  for (const [name, artifact] of Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) {
    const source = await readFile(path.join(fixture.inputs.source, artifact));
    await writeFile(path.join(directory, name), source);
    files.push({
      id: name,
      repositoryId: 'repo-fixture',
      revisionId: 'rev-fixture',
      path: name,
      contentFingerprint: `sha256:${sha(source)}`,
      classification: {
        role: classificationChange ?? 'SOURCE',
        provenance: 'AUTHORED',
        contentKind: 'TEXT',
      },
      languageHint: 'java',
      sensitivity: 'PUBLIC',
    });
  }
  return files;
}
function fullRequest(directory, files, id) {
  return {
    protocolVersion: 3,
    requestId: id,
    sequence: 0,
    type: 'ANALYZE',
    payload: {
      irSchemaVersion: 1,
      providerSnapshotId: `snapshot-${id}`,
      repository: { id: 'repo-fixture', rootPath: directory },
      requestedCapabilities: fixture.manifest.capabilities,
      deadlineEpochMs: null,
      resourceBudget: {
        maxDurationMs: 10_000,
        maxMemoryBytes: 256 * 1024 * 1024,
        maxEvents: 10_000,
      },
      revision: {
        id: 'rev-fixture',
        repositoryId: 'repo-fixture',
        kind: 'WORKTREE',
        baseRevisionId: null,
        contentFingerprint: `sha256:${sha(JSON.stringify(files))}`,
      },
      sourceFiles: files,
      analysisStateContext: {
        providerId: 'native',
        providerVersion: '0.0.0',
        language: {
          languageId: 'java',
          grammarVersion: '0.23.5',
          analyzerVersion: '0.0.0',
          compatibilityVersion: '1',
        },
        resolverVersion: '1',
        normalizerVersion: '1',
        policyFingerprint: 'fixture-policy',
      },
      baselineState: null,
    },
  };
}
function refreshRequest(baseFull, base, targetFull, id) {
  const prior = new Map(baseFull.payload.sourceFiles.map((f) => [f.id, f]));
  const target = new Map(targetFull.payload.sourceFiles.map((f) => [f.id, f]));
  const { revision, sourceFiles, ...payload } = targetFull.payload;
  return {
    protocolVersion: 3,
    requestId: id,
    sequence: 0,
    type: 'REFRESH',
    payload: {
      ...payload,
      providerSnapshotId: `snapshot-${id}`,
      baseRevisionId: baseFull.payload.revision.id,
      baseRevisionFingerprint: baseFull.payload.revision.contentFingerprint,
      targetRevision: revision,
      targetSourceFiles: sourceFiles,
      baselineState: base.terminal.payload.analysisState,
      changes: {
        added: sourceFiles.filter((f) => !prior.has(f.id)),
        modified: sourceFiles.filter(
          (f) => prior.has(f.id) && JSON.stringify(f) !== JSON.stringify(prior.get(f.id)),
        ),
        deleted: [...prior.values()]
          .filter((f) => !target.has(f.id))
          .map((f) => ({
            id: f.id,
            path: f.path,
            previousContentFingerprint: f.contentFingerprint,
          })),
      },
    },
  };
}
async function refresh(request, baseline, workers) {
  const bytes = requestBytes(request, { summaries: metadata(baseline.events, 'ANALYSIS_SUMMARY') });
  api.decodeNativeRequestV3(bytes);
  const output = run(bytes, workers);
  const events = [];
  const result = await api.decodeNativeRefreshV3(
    bytes,
    chunkBytes(output),
    {
      async accept(e) {
        events.push(e);
      },
    },
    api.NATIVE_CLIENT_HARD_LIMITS,
    request.payload.resourceBudget.maxMemoryBytes,
  );
  return { ...result, events };
}
function assertRelations(row, graph) {
  const nodes = new Map(graph.nodes.map((n) => [n.providerFactId, n]));
  for (const expected of row.relations) {
    const edges = graph.edges.filter(
      (e) => e.providerKind === expected.kind && e.sourceRange.sourceFileId === expected.file,
    );
    assert.equal(
      edges.length,
      expected.count,
      `${row.id}: source-derived ${expected.kind} site count`,
    );
    for (const edge of edges) {
      assert.equal(edge.target.resolution, expected.resolution, `${row.id}: explicit resolution`);
      const refs = edge.target.state === 'RESOLVED' ? [edge.target.target] : edge.target.candidates;
      assert.deepEqual(
        refs.map((r) => nodes.get(r.providerFactId)?.qualifiedName).sort(),
        [...expected.targets].sort(),
        `${row.id}: source-derived target names`,
      );
      if (expected.hint) assert.equal(edge.target.originalHint, expected.hint);
      if (expected.resolution === 'AMBIGUOUS')
        assert.equal(new Set(refs.map((r) => r.providerFactId)).size, expected.targets.length);
    }
  }
}
for (const row of transitions.cases) {
  test(`C2 ${row.id}: new-process refresh matches full Provider/Canonical target and restart`, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-refresh-c2-'));
    try {
      const before = await snapshot(directory, row.baseline);
      const baseFull = fullRequest(directory, before, `${row.id}-base`);
      const base = await observe(baseFull, 1);
      if (row.baselineRelations)
        assertRelations(
          { ...row, relations: row.baselineRelations },
          { nodes: facts(base.events, 'NODE'), edges: facts(base.events, 'EDGE') },
        );
      for (const f of before)
        if (!Object.hasOwn(row.target, f.path)) await rm(path.join(directory, f.path));
      const after = await snapshot(directory, row.target, row.classificationChange);
      const targetFull = fullRequest(directory, after, `${row.id}-full`);
      const full = await observe(targetFull, 2);
      assert.equal(full.terminal.payload.outcome, row.outcome);
      const fullGraph = { nodes: facts(full.events, 'NODE'), edges: facts(full.events, 'EDGE') };
      assertRelations(row, fullGraph);
      const request = refreshRequest(baseFull, base, targetFull, `${row.id}-refresh`);
      const expectedChanges = [
        ...request.payload.changes.added,
        ...request.payload.changes.modified,
      ]
        .map((f) => f.path)
        .sort();
      assert.deepEqual(expectedChanges, row.changed, 'hand-authored exact changed-source set');
      let first;
      for (const workers of [1, 2]) {
        const result = await refresh(request, base, workers);
        assert.equal(result.terminal.payload.outcome, row.outcome);
        assert.deepEqual(
          metadata(result.events, 'SOURCE_FILE')
            .map((f) => f.path)
            .sort(),
          row.changed,
        );
        const replay = replayRefreshFacts(
          facts(base.events, 'NODE'),
          facts(base.events, 'EDGE'),
          result.events,
        );
        assertRelations(row, replay);
        assert.deepEqual(replay.nodes.map(semantic), fullGraph.nodes.map(semantic));
        assert.deepEqual(replay.edges.map(semantic), fullGraph.edges.map(semantic));
        for (const type of ['COVERAGE', 'DIAGNOSTIC', 'ANALYSIS_SUMMARY'])
          assert.deepEqual(metadata(result.events, type), metadata(full.events, type), type);
        if (row.unsupported) {
          const c = metadata(result.events, 'COVERAGE').find(
            (c) =>
              c.sourceFileId === row.unsupported.file &&
              c.capability === row.unsupported.capability,
          );
          assert.ok(c);
          for (const key of ['eligibleSites', 'unsupportedSites', 'coveredSites'])
            assert.equal(c.statistics[key], row.unsupported[key]);
        }
        if (row.shared) {
          const owners = facts(base.events, 'NODE').filter(
            (n) => n.providerKind === 'java.package_container' && n.name === row.shared.name,
          );
          assert.equal(owners.length, 1);
          assert.equal(
            replay.nodes.filter(
              (n) => n.providerKind === 'java.package_container' && n.name === row.shared.name,
            ).length,
            row.shared.count,
          );
          assert.equal(
            result.events.filter(
              (e) =>
                ['UPSERT_NODE', 'REMOVE_NODE'].includes(e.type) &&
                e.payload.providerFactId === owners[0].providerFactId,
            ).length,
            row.shared.operations,
          );
        }
        if (row.outcome === 'SUCCEEDED') {
          const actual = api.normalizeNativeAnalysis(
            toNormalizationResult(
              targetFull,
              replay.nodes,
              replay.edges,
              metadata(result.events, 'COVERAGE'),
              metadata(result.events, 'DIAGNOSTIC'),
              result.terminal,
            ),
          );
          const expected = api.normalizeNativeAnalysis(
            toNormalizationResult(
              targetFull,
              fullGraph.nodes,
              fullGraph.edges,
              metadata(full.events, 'COVERAGE'),
              metadata(full.events, 'DIAGNOSTIC'),
              full.terminal,
            ),
          );
          assert.deepEqual(actual, expected);
        } else {
          assert.throws(
            () =>
              toNormalizationResult(
                targetFull,
                replay.nodes,
                replay.edges,
                metadata(result.events, 'COVERAGE'),
                metadata(result.events, 'DIAGNOSTIC'),
                result.terminal,
              ),
            /PARTIAL/,
          );
        }
        if (first)
          assert.deepEqual(
            result,
            first,
            'worker count cannot select truth or change target metadata',
          );
        first = result;
      }
      // A third process consumes only the previous refresh summaries, not full rebuild state.
      const restarted = await refresh(
        refreshRequest(targetFull, first, targetFull, `${row.id}-restart`),
        first,
        1,
      );
      assert.equal(restarted.terminal.payload.outcome, row.outcome);
      assert.equal(
        restarted.events.filter((e) => /^(UPSERT|REMOVE)_/.test(e.type) || e.type === 'SOURCE_FILE')
          .length,
        0,
      );
      for (const type of ['COVERAGE', 'DIAGNOSTIC', 'ANALYSIS_SUMMARY'])
        assert.deepEqual(metadata(restarted.events, type), metadata(first.events, type));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

for (const [mode, code] of [
  ['changed-byte-drift', 'SOURCE_CHANGED'],
  ['missing-changed-source', 'SOURCE_CHANGED'],
  ['unsupported-language', 'UNSUPPORTED_LANGUAGE'],
  ['expired-deadline', 'BUDGET_EXCEEDED'],
  ['insufficient-memory', 'RESOURCE_LIMIT_EXCEEDED'],
  ['event-limit', 'RESOURCE_LIMIT_EXCEEDED'],
]) {
  test(`C2 ${mode}: real failure bytes never produce a validated successful observation`, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-refresh-failure-'));
    try {
      const row = transitions.cases.find((r) => r.id === 'add-class-method-unknown-to-resolved');
      const baseline = fullRequest(
        directory,
        await snapshot(directory, row.baseline),
        'failure-base',
      );
      const base = await observe(baseline, 1);
      const target = fullRequest(
        directory,
        await snapshot(directory, row.target),
        'failure-target',
      );
      const request = refreshRequest(baseline, base, target, `failure-${mode}`);
      if (mode === 'changed-byte-drift')
        await writeFile(path.join(directory, 'Target.java'), 'class Different {}');
      if (mode === 'missing-changed-source') await rm(path.join(directory, 'Target.java'));
      if (mode === 'unsupported-language') {
        request.payload.targetSourceFiles.find((f) => f.id === 'Target.java').languageHint =
          'python';
      }
      if (mode === 'expired-deadline') request.payload.deadlineEpochMs = 1;
      if (mode === 'insufficient-memory') request.payload.resourceBudget.maxMemoryBytes = 1;
      if (mode === 'event-limit') request.payload.resourceBudget.maxEvents = 3;
      const bytes = requestBytes(request, { summaries: metadata(base.events, 'ANALYSIS_SUMMARY') });
      api.decodeNativeRequestV3(bytes);
      const output = run(bytes, 1);
      const events = output
        .toString('utf8')
        .trimEnd()
        .split('\n')
        .map((line) => api.NativeRefreshEventV3Schema.parse(JSON.parse(line)));
      assert.ok(['REQUEST_FAILED', 'REFRESH_FAILED'].includes(events.at(-1).type));
      assert.equal(events.at(-1).payload.error.code, code);
      assert.equal(
        events.filter((e) => ['REQUEST_FAILED', 'REFRESH_FAILED'].includes(e.type)).length,
        1,
      );
      assert.ok(!events.some((e) => e.type === 'REFRESH_COMPLETED'));
      await assert.rejects(
        api.decodeNativeRefreshV3(
          bytes,
          chunkBytes(output),
          { async accept() {} },
          api.NATIVE_CLIENT_HARD_LIMITS,
          request.payload.resourceBudget.maxMemoryBytes,
        ),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('C2 cancelled incomplete Native input exposes no completed observation', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-refresh-cancel-'));
  try {
    const full = fullRequest(directory, [], 'cancel-base');
    const base = await observe(full, 1);
    const request = refreshRequest(full, base, full, 'cancel-refresh');
    const bytes = requestBytes(request, { summaries: [] });
    const child = spawn(binary, [], {
      shell: false,
      windowsHide: true,
      env: nativeEnvironment,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [],
      stderr = [];
    let outputBytes = 0,
      errorBytes = 0,
      overflow = false;
    child.stdout.on('data', (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > api.NATIVE_CLIENT_HARD_LIMITS.maxStdoutBytes) {
        overflow = true;
        child.kill();
      } else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      errorBytes += chunk.length;
      if (errorBytes > api.NATIVE_CLIENT_HARD_LIMITS.maxStderrBytes) {
        overflow = true;
        child.kill();
      } else stderr.push(chunk);
    });
    const closed = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    const timeout = setTimeout(() => child.kill(), 10_000);
    try {
      // Completion/EOF is withheld. Rust cannot start source observation.
      await new Promise((resolve, reject) =>
        child.stdin.write(bytes.subarray(0, bytes.indexOf(10) + 1), (e) =>
          e ? reject(e) : resolve(),
        ),
      );
      child.kill();
      await closed;
    } finally {
      clearTimeout(timeout);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await closed;
      }
    }
    const output = Buffer.concat(stdout);
    assert.equal(overflow, false);
    assert.equal(output.length, 0);
    assert.ok(Buffer.concat(stderr).length <= api.NATIVE_CLIENT_HARD_LIMITS.maxStderrBytes);
    await assert.rejects(
      api.decodeNativeRefreshV3(
        bytes,
        chunkBytes(output),
        { async accept() {} },
        api.NATIVE_CLIENT_HARD_LIMITS,
        request.payload.resourceBudget.maxMemoryBytes,
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
