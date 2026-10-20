import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import * as api from '../dist/index.js';
import { writeFullRequestRecords } from '../dist/native-request-json.js';
import { buildRefreshCase, requestBytes } from './helpers/native-refresh-v3-corpus.mjs';
import { baseCase } from './helpers/native-full-v3-corpus.mjs';

const fixture = JSON.parse(
  await readFile(new URL('../../../fixtures/ipc/refresh-v3/transport-cases.json', import.meta.url)),
);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const environment = Object.fromEntries(
  ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'].flatMap((key) =>
    process.env[key] ? [[key, process.env[key]]] : [],
  ),
);
const helper = fileURLToPath(new URL('./helpers/native-refresh-v3-process.mjs', import.meta.url));
const binary = path.join(
  process.env.CARGO_TARGET_DIR ?? fileURLToPath(new URL('../../../target', import.meta.url)),
  'debug',
  process.platform === 'win32' ? 'codeatlas-native-analyzer.exe' : 'codeatlas-native-analyzer',
);
const options = (mode, overrides = {}) => ({
  executablePath: process.execPath,
  arguments: [helper, mode],
  timeoutMs: 4000,
  allowedEnvironment: environment,
  ...overrides,
});
const code = (expected) => (error) =>
  error instanceof api.NativeClientError && error.code === expected;
function encode(c, limits = api.NATIVE_CLIENT_HARD_LIMITS, budget = c.trustedMemoryBudgetBytes) {
  assert.equal(typeof api.encodeNativeRefreshRequestV3, 'function');
  return api.encodeNativeRefreshRequestV3(c.request, c.baseline, limits, budget);
}
function run(mode, overrides = {}, sink = { async accept() {} }, c = buildRefreshCase()) {
  assert.equal(typeof api.streamNativeRefreshV3, 'function');
  return api.streamNativeRefreshV3(
    c.request,
    c.baseline,
    options(mode, overrides),
    sink,
    c.trustedMemoryBudgetBytes,
  );
}

const cases = {
  owned_baseline_records_and_completion_checksum() {
    const c = buildRefreshCase();
    c.baseline.summaries.reverse();
    const bytes = encode(c);
    const rows = Buffer.from(bytes).toString('utf8').slice(0, -1).split('\n');
    const records = rows.map(JSON.parse);
    assert.deepEqual(
      records.map((r) => r.type),
      ['REFRESH', 'BASELINE_SUMMARY', 'BASELINE_SUMMARY', 'REQUEST_COMPLETED'],
    );
    assert.deepEqual(
      records.map((r) => r.sequence),
      [0, 1, 2, 3],
    );
    assert.deepEqual(
      records.slice(1, -1).map((r) => r.payload.sourceFile.path),
      ['src/0.java', 'src/1.java'],
    );
    assert.equal(
      records.at(-1).payload.integrityChecksum,
      sha(rows.slice(0, -1).join('\n') + '\n'),
    );
    assert.equal(records.at(-1).payload.summaryRecords, 2);
    c.request.payload.repository.rootPath = '/mutated';
    c.baseline.summaries.length = 0;
    const decoded = api.decodeNativeRequestV3(bytes);
    assert.equal(decoded.header.payload.repository.rootPath, '/repo');
    assert.equal(decoded.baseline.summaries.length, 2);
    assert.equal(bytes.at(-1), 10);
    assert.equal(bytes.includes(13), false);
  },
  async real_refresh_matches_independent_transition(t) {
    const root = new URL('../../../fixtures/native/java-refresh-producer/', import.meta.url);
    const transitions = JSON.parse(await readFile(new URL('expected/transitions.json', root)));
    const row = transitions.cases.find((r) => r.id === 'modify-call-target');
    const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-refresh-transport-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    async function snapshot(entries) {
      const files = [];
      for (const [name, artifact] of Object.entries(entries).sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        const bytes = await readFile(new URL('source/' + artifact, root));
        await writeFile(path.join(directory, name), bytes);
        files.push({
          id: name,
          repositoryId: 'r',
          revisionId: 'rev',
          path: name,
          contentFingerprint: 'sha256:' + sha(bytes),
          classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
          languageHint: 'java',
          sensitivity: 'PUBLIC',
        });
      }
      return files;
    }
    function full(files, id) {
      const request = baseCase('zero-file').request;
      request.requestId = id;
      request.payload.providerSnapshotId = id;
      request.payload.repository.rootPath = directory;
      request.payload.sourceFiles = files;
      request.payload.revision.contentFingerprint = sha(JSON.stringify(files));
      request.payload.requestedCapabilities = [
        'SYMBOL',
        'IMPORT',
        'CALL',
        'INHERITANCE',
        'REFERENCE',
      ];
      request.payload.resourceBudget.maxDurationMs = 10000;
      request.payload.resourceBudget.maxEvents = 10000;
      return request;
    }
    const native = {
      executablePath: binary,
      arguments: ['--parse-workers', '1'],
      timeoutMs: 10000,
      allowedEnvironment: environment,
    };
    const before = await snapshot(row.baseline),
      baseRequest = full(before, 'transport-base'),
      baseEvents = [];
    const base = await api.streamNativeFullAnalysisV3(baseRequest, native, {
      async accept(e) {
        baseEvents.push(e);
      },
    });
    const after = await snapshot(row.target),
      targetRequest = full(after, 'transport-target');
    const baseline = {
      header: base.terminal.payload.analysisState,
      summaries: baseEvents.filter((e) => e.type === 'ANALYSIS_SUMMARY').map((e) => e.payload),
    };
    const { revision, sourceFiles, ...payload } = targetRequest.payload;
    const request = {
      protocolVersion: 3,
      requestId: 'transport-refresh',
      sequence: 0,
      type: 'REFRESH',
      payload: {
        ...payload,
        baselineState: baseline.header,
        baseRevisionId: 'rev',
        baseRevisionFingerprint: baseRequest.payload.revision.contentFingerprint,
        targetRevision: revision,
        targetSourceFiles: sourceFiles,
        changes: {
          added: [],
          modified: after.filter((f, i) => f.contentFingerprint !== before[i].contentFingerprint),
          deleted: [],
        },
      },
    };
    const events = [],
      entered = Promise.withResolvers(),
      release = Promise.withResolvers();
    let maximum = 0,
      inFlight = 0,
      resolved = false;
    assert.equal(typeof api.streamNativeRefreshV3, 'function');
    const pending = api
      .streamNativeRefreshV3(
        request,
        baseline,
        native,
        {
          async accept(e) {
            inFlight++;
            maximum = Math.max(maximum, inFlight);
            events.push(e);
            if (events.length === 1) {
              entered.resolve();
              await release.promise;
            }
            inFlight--;
          },
        },
        1_000_000_000,
      )
      .then((result) => {
        resolved = true;
        return result;
      });
    request.payload.targetSourceFiles.length = 0; // Must not change the prepared byte snapshot.
    baseline.summaries.length = 0;
    try {
      await Promise.race([entered.promise, pending]);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(events.length, 1);
      assert.equal(resolved, false);
    } finally {
      release.resolve();
    }
    const result = await pending;
    assert.equal(maximum, 1);
    assert.equal(result.terminal.payload.outcome, 'SUCCEEDED');
    assert.deepEqual(
      events.filter((e) => e.type === 'SOURCE_FILE').map((e) => e.payload.path),
      row.changed,
    );
    const call = events.filter(
      (e) => e.type === 'UPSERT_EDGE' && e.payload.providerKind === 'java.call',
    );
    assert.equal(call.length, 1);
    assert.equal(call[0].payload.target.resolution, 'EXACT');
    const nodes = new Map(
      baseEvents.filter((e) => e.type === 'NODE').map((e) => [e.payload.providerFactId, e.payload]),
    );
    for (const e of events)
      if (e.type === 'UPSERT_NODE') nodes.set(e.payload.providerFactId, e.payload);
    assert.deepEqual(
      [nodes.get(call[0].payload.target.target.providerFactId).qualifiedName],
      row.relations[0].targets,
    );
    assert.equal(result.terminal.payload.summaryRecords, 3);
    assert.equal(Object.isFrozen(result.terminal), true);
    assert.equal('events' in result, false);
  },
  async awaited_sink_has_one_delivery() {
    const entered = Promise.withResolvers(),
      controller = new AbortController();
    let calls = 0;
    const pending = run(
      'slow-stdin',
      { signal: controller.signal },
      {
        async accept() {
          calls++;
          entered.resolve();
          await new Promise(() => {});
        },
      },
    );
    await Promise.race([entered.promise, pending]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    controller.abort();
    await assert.rejects(pending, code('CANCELLED'));
  },
  limits_equal_and_one_byte_over() {
    const c = buildRefreshCase(),
      expected = requestBytes(c.request, c.baseline);
    assert.equal(
      encode(c, { ...api.NATIVE_CLIENT_HARD_LIMITS, maxStdinBytes: expected.length }).length,
      expected.length,
    );
    assert.throws(
      () => encode(c, { ...api.NATIVE_CLIENT_HARD_LIMITS, maxStdinBytes: expected.length - 1 }),
      code('OUTPUT_LIMIT_EXCEEDED'),
    );
    const largest = Math.max(
      ...expected
        .toString('utf8')
        .slice(0, -1)
        .split('\n')
        .map((line) => Buffer.byteLength(line) + 1),
    );
    assert.equal(
      encode(c, { ...api.NATIVE_CLIENT_HARD_LIMITS, maxLineBytes: largest }).length,
      expected.length,
    );
    assert.throws(
      () => encode(c, { ...api.NATIVE_CLIENT_HARD_LIMITS, maxLineBytes: largest - 1 }),
      code('OUTPUT_LIMIT_EXCEEDED'),
    );
    assert.throws(
      () => encode(c, api.NATIVE_CLIENT_HARD_LIMITS, c.trustedMemoryBudgetBytes - 1),
      code('INVALID_REQUEST'),
    );
    for (const [name, max] of Object.entries(api.NATIVE_CLIENT_HARD_LIMITS))
      assert.throws(
        () => encode(c, { ...api.NATIVE_CLIENT_HARD_LIMITS, [name]: max + 1 }),
        code('INVALID_CONFIGURATION'),
      );
    const atHardCap = buildRefreshCase();
    const padding = 1_000_000 - requestBytes(atHardCap.request, atHardCap.baseline).length;
    atHardCap.request.payload.repository.rootPath += 'x'.repeat(padding);
    assert.equal(encode(atHardCap).length, 1_000_000);
    atHardCap.request.payload.repository.rootPath += 'x';
    assert.throws(() => encode(atHardCap), code('OUTPUT_LIMIT_EXCEEDED'));
    let getterReads = 0;
    const accessor = buildRefreshCase();
    Object.defineProperty(accessor.baseline, 'summaries', {
      enumerable: true,
      get() {
        getterReads++;
        throw Error('must not read');
      },
    });
    assert.throws(() => encode(accessor), code('INVALID_REQUEST'));
    assert.equal(getterReads, 0);
    assert.throws(
      () => encode(accessor, api.NATIVE_CLIENT_HARD_LIMITS, 0),
      code('INVALID_CONFIGURATION'),
    );
    assert.equal(getterReads, 0);
  },
  async late_exit_and_post_terminal_refuse() {
    for (const { mode, code: expected } of fixture.faults)
      await assert.rejects(run(mode), code(expected));
    await assert.rejects(
      run('stderr-overflow', { limits: { maxStderrBytes: 128 } }),
      code('OUTPUT_LIMIT_EXCEEDED'),
    );
    for (const limits of [
      { maxStdinBytes: 1 },
      { maxLineBytes: 20 },
      { maxStdoutBytes: 20 },
      { maxEvents: 1 },
      { maxStderrBytes: 1 },
    ])
      await assert.rejects(
        run('late-exit', { limits }),
        code('OUTPUT_LIMIT_EXCEEDED'),
        JSON.stringify(limits),
      );
  },
  async cancel_blocked_sink_and_write_failure() {
    const large = buildRefreshCase();
    large.request.payload.repository.rootPath = '/' + 'x'.repeat(300000);
    const expectedBytes = requestBytes(large.request, large.baseline).length;
    await assert.rejects(
      run('slow-stdin', {}, undefined, large),
      (error) =>
        code('PROCESS_FAILED')(error) && error.stderr === `verified-request:${expectedBytes}\n`,
    );
    await assert.rejects(run('hang', { timeoutMs: 200 }), code('TIMEOUT'));
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(run('late-exit', { signal: cancelled.signal }), code('CANCELLED'));
    await assert.rejects(
      run(
        'slow-stdin',
        { timeoutMs: 500 },
        {
          async accept() {
            await new Promise(() => {});
          },
        },
      ),
      code('TIMEOUT'),
    );
    const received = [],
      controller = new AbortController();
    const stdin = new Writable({
      write(chunk, _encoding, callback) {
        received.push(Buffer.from(chunk));
        controller.abort();
        callback();
      },
    });
    try {
      await assert.rejects(
        writeFullRequestRecords(
          stdin,
          [Buffer.from('header\n'), Buffer.from('baseline\n'), Buffer.from('completion\n')],
          controller.signal,
          'req',
        ),
        code('CANCELLED'),
      );
      assert.equal(Buffer.concat(received).toString(), 'header\n');
      for (const event of ['drain', 'finish', 'error']) assert.equal(stdin.listenerCount(event), 0);
    } finally {
      stdin.destroy();
    }
    const broken = new Writable({
      write(_chunk, _encoding, callback) {
        callback(Object.assign(Error('broken'), { code: 'EPIPE' }));
      },
    });
    try {
      await assert.rejects(
        writeFullRequestRecords(
          broken,
          [Buffer.from('header\n'), Buffer.from('completion\n')],
          new AbortController().signal,
          'req',
        ),
        code('PROCESS_FAILED'),
      );
    } finally {
      broken.destroy();
    }
  },
  async partial_and_truncated_refuse_apply() {
    // The transport returns an observation, never an applicable Store candidate.
    const result = await run('partial', {}, undefined, buildRefreshCase('partial'));
    assert.equal(result.terminal.payload.outcome, 'PARTIAL');
    assert.equal('candidate' in result, false);
    await assert.rejects(run('truncated'), code('PROTOCOL_VIOLATION'));
    const invalid = buildRefreshCase();
    invalid.request.payload.changes.modified = [];
    await assert.rejects(
      run(
        'late-exit',
        { executablePath: path.join(tmpdir(), 'nonexistent-native-executable') },
        undefined,
        invalid,
      ),
      code('INVALID_REQUEST'),
    );
    await assert.rejects(run('late-exit', {}, null), code('INVALID_CONFIGURATION'));
    await assert.rejects(
      run('late-exit', { allowedEnvironment: { SECRET: 'never passed' } }),
      code('INVALID_CONFIGURATION'),
    );
    const expired = buildRefreshCase();
    expired.request.payload.deadlineEpochMs = Date.now() - 1;
    await assert.rejects(
      run(
        'late-exit',
        { executablePath: path.join(tmpdir(), 'nonexistent-native-executable') },
        undefined,
        expired,
      ),
      code('TIMEOUT'),
    );
  },
};
test('D2 every declared transport case executes', () =>
  assert.deepEqual(Object.keys(cases), fixture.cases));
for (const name of fixture.cases) test(`D2 ${name}`, cases[name]);
