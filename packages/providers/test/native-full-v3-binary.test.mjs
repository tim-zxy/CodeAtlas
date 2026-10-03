import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { discoverFixtures } from '../../evaluation/dist/index.js';
import { RepositoryAnalysisStage } from '../../storage/dist/index.js';
import * as api from '../dist/index.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const caseIndex = JSON.parse(
  await readFile(path.join(root, 'fixtures/ipc/analysis-v3/cases.json'), 'utf8'),
);
assert.equal(
  path.resolve(root, 'fixtures/ipc/analysis-v3', caseIndex.binarySuite),
  fileURLToPath(import.meta.url),
);
const fixtureIds = caseIndex.binaryFixtures;
assert.equal(new Set(fixtureIds).size, 7);
const fixtures = await discoverFixtures(path.join(root, 'fixtures/native'));
const binary = path.join(
  process.env.CARGO_TARGET_DIR
    ? path.resolve(root, process.env.CARGO_TARGET_DIR)
    : path.join(root, 'target'),
  'debug',
  process.platform === 'win32' ? 'codeatlas-native-analyzer.exe' : 'codeatlas-native-analyzer',
);
const options = (workers = 1) => ({
  executablePath: binary,
  arguments: ['--parse-workers', String(workers)],
  timeoutMs: 10_000,
});
function fullRequestBytes(request) {
  const header = Buffer.from(JSON.stringify(request) + '\n');
  const completion = Buffer.from(
    JSON.stringify({
      protocolVersion: 3,
      requestId: request.requestId,
      sequence: 1,
      type: 'REQUEST_COMPLETED',
      payload: {
        summaryRecords: 0,
        integrityChecksum: createHash('sha256').update(header).digest('hex'),
      },
    }) + '\n',
  );
  const bytes = Buffer.concat([header, completion]);
  api.decodeNativeRequestV3(bytes);
  return { header, completion, bytes };
}
function rawRun(bytes) {
  const child = spawnSync(binary, [], {
    input: bytes,
    timeout: 10_000,
    maxBuffer: 10_000_000,
    windowsHide: true,
    shell: false,
  });
  assert.ifError(child.error);
  assert.equal(child.signal, null);
  return {
    status: child.status,
    stdout: child.stdout,
    events: child.stdout.length
      ? child.stdout
          .toString('utf8')
          .trimEnd()
          .split('\n')
          .map((line) => JSON.parse(line))
      : [],
    stderr: child.stderr.toString('utf8'),
  };
}
async function requestFor(id, capabilities) {
  const fixture = fixtures.find((f) => f.manifest.id === id);
  assert.ok(fixture, `registered Fixture ${id}`);
  const names = (await readdir(path.join(fixture.inputs.source, 'src')))
    .filter((name) => name.endsWith('.java'))
    .sort();
  const sourceFiles = await Promise.all(
    names.map(async (name) => ({
      id: `file-${name}`,
      repositoryId: 'repo-fixture',
      revisionId: 'rev-fixture',
      path: `src/${name}`,
      contentFingerprint:
        'sha256:' +
        createHash('sha256')
          .update(await readFile(path.join(fixture.inputs.source, 'src', name)))
          .digest('hex'),
      classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
      languageHint: 'java',
      sensitivity: 'PUBLIC',
    })),
  );
  return {
    protocolVersion: 3,
    requestId: `full-${id}`,
    sequence: 0,
    type: 'ANALYZE',
    payload: {
      irSchemaVersion: 1,
      providerSnapshotId: 'snapshot-fixture',
      repository: { id: 'repo-fixture', rootPath: fixture.inputs.source },
      requestedCapabilities: capabilities ?? fixture.manifest.capabilities,
      deadlineEpochMs: null,
      resourceBudget: {
        maxDurationMs: 10_000,
        maxMemoryBytes: 128 * 1024 * 1024,
        maxEvents: 10_000,
      },
      revision: {
        id: 'rev-fixture',
        repositoryId: 'repo-fixture',
        contentFingerprint: 'sha256:revision-fixture',
        kind: 'WORKTREE',
        baseRevisionId: null,
      },
      sourceFiles,
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
function v2Request(request) {
  const { analysisStateContext: _context, baselineState: _state, ...payload } = request.payload;
  return { protocolVersion: 2, requestId: request.requestId, type: 'ANALYZE', payload };
}
async function observe(request, workers = 1) {
  const events = [];
  const result = await api.streamNativeFullAnalysisV3(request, options(workers), {
    async accept(event) {
      events.push(event);
    },
  });
  return {
    ...result,
    events,
    summaries: events.filter((e) => e.type === 'ANALYSIS_SUMMARY').map((e) => e.payload),
  };
}
const graph = (events) =>
  events
    .filter((e) => ['SOURCE_FILE', 'NODE', 'EDGE', 'COVERAGE', 'DIAGNOSTIC'].includes(e.type))
    .map(({ type, payload }) => ({ type, payload }));

test('full-v3 source and capability input order do not change summary digest or graph', async () => {
  const request = await requestFor('java-call-basic');
  const first = await observe(request);
  request.payload.sourceFiles.reverse();
  request.payload.requestedCapabilities.reverse();
  const second = await observe(request, 2);
  assert.equal(
    first.terminal.payload.analysisState.summaryDigest,
    second.terminal.payload.analysisState.summaryDigest,
  );
  const sortedGraph = (events) =>
    graph(events)
      .map((v) => JSON.stringify(v))
      .sort();
  assert.deepEqual(sortedGraph(second.events), sortedGraph(first.events));
  await seal(request, second);
});

test('full-v3 oversized summary is a typed refusal, not completed state', async () => {
  const request = await requestFor('java-coverage-zero', ['SYMBOL']);
  const temp = await mkdtemp(path.join(tmpdir(), 'codeatlas-full-summary-'));
  try {
    const source =
      'class Large {\n' +
      Array.from({ length: 2500 }, (_, i) => `void method${i}() {}\n`).join('') +
      '}';
    await writeFile(path.join(temp, 'Large.java'), source);
    request.payload.repository.rootPath = temp;
    request.payload.sourceFiles = [
      {
        ...request.payload.sourceFiles[0],
        id: 'large-file',
        path: 'Large.java',
        contentFingerprint: 'sha256:' + createHash('sha256').update(source).digest('hex'),
      },
    ];
    const raw = rawRun(fullRequestBytes(request).bytes);
    assert.equal(raw.status, 0);
    assert.ok(
      raw.events.some((e) => e.type === 'NODE'),
      'parse/facts were reached',
    );
    assert.equal(raw.events.at(-1).type, 'ANALYSIS_FAILED');
    assert.equal(raw.events.at(-1).payload.error.code, 'RESOURCE_LIMIT_EXCEEDED');
    assert.ok(!raw.events.some((e) => e.type === 'ANALYSIS_COMPLETED'));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
async function seal(request, observation) {
  const emitted = new Set(
    observation.events
      .filter((e) => ['NODE', 'EDGE'].includes(e.type))
      .map((e) => `${e.type}\0${e.payload.providerFactId}`),
  );
  for (const summary of observation.summaries)
    for (const fact of summary.emittedFacts)
      assert.ok(
        emitted.has(`${fact.factType}\0${fact.providerFactId}`),
        `unobserved ${fact.factType} ${fact.providerFactId} in ${summary.sourceFile.path}`,
      );
  const db = new DatabaseSync(':memory:');
  const limits = { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 1_000_000_000 };
  const stage = new RepositoryAnalysisStage(db, limits);
  try {
    for (const event of observation.events)
      if (event.type === 'ANALYSIS_SUMMARY') await stage.acceptNativeSummary(event.payload);
      else await stage.accept(event);
    stage.confirmSucceeded(observation.terminal);
    const header = observation.terminal.payload.analysisState;
    const {
      schemaVersion: _schema,
      sourceFileCount: _count,
      summaryDigest: _digest,
      ...expected
    } = header;
    const value = stage.sealNativeState(
      JSON.stringify(header),
      expected,
      api.validateNativeStateCandidate,
      limits,
    );
    assert.equal(value.files.length, request.payload.sourceFiles.length);
  } finally {
    stage.close();
    db.close();
  }
}
for (const id of fixtureIds)
  test(`real full-v3 graph and summaries match registered ${id}`, async () => {
    const request = await requestFor(id);
    const legacy = await api.executeNativeRequest(v2Request(request), options());
    const one = await observe(request, 1);
    const many = await observe(request, 2);
    assert.deepEqual(graph(one.events), graph(legacy.events));
    assert.deepEqual(graph(many.events), graph(one.events));
    assert.deepEqual(many.summaries, one.summaries);
    assert.equal(one.terminal.payload.outcome, legacy.terminal.payload.outcome);
    assert.equal(one.terminal.payload.summaryRecords, request.payload.sourceFiles.length);
    assert.equal(
      one.terminal.payload.analysisState.summaryDigest,
      api.computeNativeSummaryDigest(one.summaries),
    );
    assert.equal(
      many.terminal.payload.analysisState.summaryDigest,
      one.terminal.payload.analysisState.summaryDigest,
    );
    api.NativeAnalysisStateBundleV1Schema.parse({
      header: one.terminal.payload.analysisState,
      summaries: one.summaries,
    });
    for (const event of one.events.filter(
      (e) => e.type === 'NODE' && e.payload.providerKind === 'java.package_container',
    )) {
      const fact = event.payload;
      assert.equal(
        one.events.filter(
          (e) => e.type === 'NODE' && e.payload.providerFactId === fact.providerFactId,
        ).length,
        1,
      );
      const owners = one.summaries.filter((s) =>
        s.emittedFacts.some((f) => f.providerFactId === fact.providerFactId),
      );
      const grounded = one.summaries.filter((s) =>
        s.symbols.some((v) => v.providerKind === 'java.package' && v.name === fact.name),
      );
      assert.deepEqual(
        owners.map((s) => s.sourceFile.id).sort(),
        grounded.map((s) => s.sourceFile.id).sort(),
      );
      for (const owner of owners) {
        const ref = owner.emittedFacts.find((f) => f.providerFactId === fact.providerFactId);
        assert.equal(ref.ownership, 'SHARED');
        assert.equal(ref.contentDigest, api.computeNativeFactContentDigest(fact));
      }
    }
    if (one.terminal.payload.outcome === 'SUCCEEDED') await seal(request, one);
    else assert.equal(one.terminal.payload.outcome, 'PARTIAL');
  });

test('real full-v3 SYMBOL-only and empty scope retain exact summary cardinality', async () => {
  const request = await requestFor('java-call-basic', ['SYMBOL']);
  const symbols = await observe(request);
  assert.ok(symbols.summaries.every((s) => s.relationSites.length === 0));
  await seal(request, symbols);
  request.payload.sourceFiles = [];
  const empty = await observe(request);
  assert.equal(empty.terminal.payload.summaryRecords, 0);
  assert.equal(
    empty.terminal.payload.analysisState.summaryDigest,
    '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  );
  await seal(request, empty);
});

test('real full-v3 CALL retains resolver inputs when IMPORT output is not requested', async () => {
  const request = await requestFor('java-call-basic', ['SYMBOL', 'CALL']);
  const legacy = await api.executeNativeRequest(v2Request(request), options());
  const full = await observe(request);
  assert.deepEqual(graph(full.events), graph(legacy.events));
  assert.ok(full.summaries.some((s) => s.relationSites.some((site) => site.kind === 'IMPORT')));
  assert.ok(
    !full.events.some((e) => e.type === 'EDGE' && e.payload.providerKind === 'java.import'),
  );
  await seal(request, full);
});

for (const key of [
  'providerVersion',
  'resolverVersion',
  'grammarVersion',
  'analyzerVersion',
  'compatibilityVersion',
])
  test(`real full-v3 rejects wrong ${key} before any source observation`, async () => {
    const request = await requestFor('java-call-basic');
    const context = request.payload.analysisStateContext;
    if (key in context) context[key] = 'wrong';
    else context.language[key] = 'wrong';
    request.payload.repository.rootPath = path.join(root, 'does-not-exist');
    const raw = rawRun(fullRequestBytes(request).bytes);
    assert.equal(raw.status, 0);
    assert.equal(raw.events.length, 1);
    assert.equal(raw.events[0].type, 'REQUEST_FAILED');
    assert.equal(raw.events[0].payload.error.code, 'INVALID_REQUEST');
    assert.equal(raw.events[0].sequence, 0);
    api.NativeFullAnalysisEventV3Schema.parse(raw.events[0]);
    const seen = [];
    await assert.rejects(
      api.streamNativeFullAnalysisV3(request, options(), {
        async accept(event) {
          seen.push(event);
        },
      }),
      (e) => e.code === 'ANALYZER_FAILED',
    );
    assert.deepEqual(seen, [], key);
  });

for (const mode of ['stale', 'memory', 'events'])
  test(`real full-v3 ${mode} refusal never returns a candidate`, async () => {
    const request = await requestFor('java-call-basic');
    if (mode === 'stale')
      request.payload.sourceFiles[0].contentFingerprint = 'sha256:' + '0'.repeat(64);
    else if (mode === 'memory') request.payload.resourceBudget.maxMemoryBytes = 1;
    else request.payload.resourceBudget.maxEvents = 2;
    await assert.rejects(observe(request), (e) => e.code === 'ANALYZER_FAILED');
  });

test('real binary advertises full-v3 without incremental capability', async () => {
  const request = await readFile(
    path.join(root, 'fixtures/ipc/handshake-v1/describe-v1/request.jsonl'),
  );
  const result = rawRun(request);
  assert.equal(result.status, 0);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].type, 'DESCRIBE_COMPLETED');
  assert.deepEqual(result.events[0].payload.protocolVersions, [1, 2, 3]);
  assert.ok(!result.events[0].payload.capabilities.includes('incremental-refresh'));
});

test('real binary refuses the schema-only REFRESH worker budget without parsing', async () => {
  const bytes = await readFile(
    path.join(root, 'fixtures/ipc/protocol-v3/valid-empty-refresh.jsonl'),
  );
  const validated = api.decodeNativeRequestV3(bytes);
  assert.equal(validated.header.type, 'REFRESH');
  const result = rawRun(bytes);
  assert.equal(result.status, 0);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].protocolVersion, 3);
  assert.equal(result.events[0].requestId, validated.header.requestId);
  assert.equal(result.events[0].sequence, 0);
  assert.equal(result.events[0].type, 'REQUEST_FAILED');
  assert.equal(result.events[0].payload.error.code, 'RESOURCE_LIMIT_EXCEEDED');
});

test('real empty REFRESH agrees with the strict C decoder and remains outside full-only output', async () => {
  const raw = await readFile(
    path.join(root, 'fixtures/ipc/protocol-v3/valid-empty-refresh.jsonl'),
    'utf8',
  );
  const header = JSON.parse(raw.split('\n')[0]);
  header.payload.repository.rootPath = root;
  header.payload.resourceBudget.maxMemoryBytes = 64 * 1024 * 1024;
  const { bytes } = fullRequestBytes(header);
  const result = rawRun(bytes);
  assert.equal(result.status, 0);
  assert.equal(result.events[0].type, 'REFRESH_STARTED');
  async function* chunks() {
    for (let i = 0; i < result.stdout.length; i += 31) yield result.stdout.subarray(i, i + 31);
  }
  const observation = await api.decodeNativeRefreshV3(
    bytes,
    chunks(),
    { async accept() {} },
    api.NATIVE_CLIENT_HARD_LIMITS,
    header.payload.resourceBudget.maxMemoryBytes,
  );
  assert.equal(observation.terminal.type, 'REFRESH_COMPLETED');
  assert.equal(observation.terminal.payload.summaryRecords, 0);
  assert.equal(api.NativeFullAnalysisEventV3Schema.safeParse(result.events[0]).success, false);
});

test('real added target re-resolves an unchanged caller through strict C bytes', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'codeatlas-refresh-core-'));
  try {
    const caller = 'class Caller { void run() { Added.go(); } }';
    const added = 'class Added { static void go() {} }';
    await writeFile(path.join(temp, 'Caller.java'), caller);
    const full = await requestFor('java-call-basic', [
      'SYMBOL',
      'IMPORT',
      'CALL',
      'INHERITANCE',
      'REFERENCE',
    ]);
    full.payload.repository.rootPath = temp;
    full.payload.resourceBudget.maxMemoryBytes = 256 * 1024 * 1024;
    const file = (name, source) => ({
      ...full.payload.sourceFiles[0],
      id: name,
      path: name,
      contentFingerprint: 'sha256:' + createHash('sha256').update(source).digest('hex'),
    });
    full.payload.sourceFiles = [file('Caller.java', caller)];
    const baseline = rawRun(fullRequestBytes(full).bytes);
    assert.equal(baseline.events.at(-1).type, 'ANALYSIS_COMPLETED');
    await writeFile(path.join(temp, 'Added.java'), added);
    const newFile = file('Added.java', added);
    const { revision, sourceFiles, ...payload } = full.payload;
    const header = {
      protocolVersion: 3,
      requestId: 'refresh-core',
      sequence: 0,
      type: 'REFRESH',
      payload: {
        ...payload,
        providerSnapshotId: 'refresh-core-snapshot',
        baseRevisionId: revision.id,
        baseRevisionFingerprint: revision.contentFingerprint,
        targetRevision: { ...revision, contentFingerprint: 'sha256:target-core' },
        changes: { added: [newFile], modified: [], deleted: [] },
        targetSourceFiles: [...sourceFiles, newFile],
        baselineState: baseline.events.at(-1).payload.analysisState,
      },
    };
    const records = [
      header,
      ...baseline.events
        .filter((e) => e.type === 'ANALYSIS_SUMMARY')
        .map((e, i) => ({
          protocolVersion: 3,
          requestId: header.requestId,
          sequence: i + 1,
          type: 'BASELINE_SUMMARY',
          payload: e.payload,
        })),
    ];
    const prefix = records.map((e) => JSON.stringify(e) + '\n').join('');
    const bytes = Buffer.from(
      prefix +
        JSON.stringify({
          protocolVersion: 3,
          requestId: header.requestId,
          sequence: records.length,
          type: 'REQUEST_COMPLETED',
          payload: {
            summaryRecords: records.length - 1,
            integrityChecksum: createHash('sha256').update(prefix).digest('hex'),
          },
        }) +
        '\n',
    );
    api.decodeNativeRequestV3(bytes);
    const result = rawRun(bytes);
    async function* chunks() {
      for (let i = 0; i < result.stdout.length; i += 31) yield result.stdout.subarray(i, i + 31);
    }
    const decoded = await api.decodeNativeRefreshV3(
      bytes,
      chunks(),
      { async accept() {} },
      api.NATIVE_CLIENT_HARD_LIMITS,
      header.payload.resourceBudget.maxMemoryBytes,
    );
    assert.equal(decoded.terminal.type, 'REFRESH_COMPLETED');
    assert.deepEqual(
      result.events.filter((e) => e.type === 'SOURCE_FILE').map((e) => e.payload.path),
      ['Added.java'],
    );
    assert.ok(
      result.events.some(
        (e) =>
          e.type === 'UPSERT_EDGE' &&
          e.payload.sourceRange.sourceFileId === 'Caller.java' &&
          e.payload.target.state === 'RESOLVED',
      ),
    );
    assert.equal(decoded.terminal.payload.summaryRecords, 2);
    // Independent source-derived identity: Added.java/java.method/Added/go/()/ordinal0.
    assert.ok(
      result.events.some(
        (e) =>
          e.type === 'UPSERT_EDGE' &&
          e.payload.target.target?.providerFactId ===
            'java-symbol-v1:8b7dba6e53f8c3e348437bd513755eca8093bd49d570cdb42fe7152f1a2af1f3',
      ),
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

for (const mode of ['missing', 'truncated', 'checksum', 'post-completion'])
  test(`real full-v3 ${mode} completion is refused before source observation`, async () => {
    const request = await requestFor('java-call-basic');
    request.payload.repository.rootPath = path.join(root, 'does-not-exist');
    const { header, completion, bytes } = fullRequestBytes(request);
    const wrongChecksum = JSON.parse(completion);
    wrongChecksum.payload.integrityChecksum = '0'.repeat(64);
    const variants = {
      missing: header,
      truncated: bytes.subarray(0, bytes.length - 1),
      checksum: Buffer.concat([header, Buffer.from(JSON.stringify(wrongChecksum) + '\n')]),
      'post-completion': Buffer.concat([bytes, completion]),
    };
    const input = variants[mode];
    assert.throws(() => api.decodeNativeRequestV3(input));
    const result = rawRun(input);
    assert.ok(!result.events.some((event) => event.type === 'ANALYSIS_STARTED'));
    assert.equal(result.status, 0);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].protocolVersion, 3);
    assert.equal(result.events[0].requestId, request.requestId);
    assert.equal(result.events[0].sequence, 0);
    assert.equal(result.events[0].type, 'REQUEST_FAILED');
    assert.equal(result.events[0].payload.error.code, 'PROTOCOL_CORRUPTION');
  });

test('real full-v3 cancellation after start never returns a completed observation', async () => {
  const request = await requestFor('java-call-basic');
  const controller = new AbortController();
  const seen = [];
  await assert.rejects(
    api.streamNativeFullAnalysisV3(
      request,
      { ...options(), signal: controller.signal },
      {
        async accept(event) {
          seen.push(event.type);
          controller.abort();
        },
      },
    ),
    (error) => error.code === 'CANCELLED',
  );
  assert.deepEqual(seen, ['ANALYSIS_STARTED']);
});
