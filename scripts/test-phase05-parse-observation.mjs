import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as helper from './helpers/phase05-evaluation-fixture.mjs';
import * as runner from './evaluate-phase05.mjs';

const vectors = JSON.parse(
  await readFile(
    new URL('../fixtures/evaluation/native-parse-observation/inputs/vectors.json', import.meta.url),
  ),
);
const expected = JSON.parse(
  await readFile(
    new URL(
      '../fixtures/evaluation/native-parse-observation/expected/results.json',
      import.meta.url,
    ),
  ),
);
const controls = {
  transportLimits: {
    maxLineBytes: 1000000,
    maxStderrBytes: 1000000,
    maxStdoutBytes: 10000000,
    maxEvents: 10000,
  },
  resourceBudget: { maxMemoryBytes: 67108864, maxEvents: 10000 },
};
function capture(records, options = controls) {
  assert.equal(
    typeof helper.createPhase05ParseCapture,
    'function',
    'bounded consumed stderr collector missing',
  );
  const reader = helper.createPhase05ParseCapture(options);
  const child = {};
  for (const record of records) reader.accept(Buffer.from(JSON.stringify(record) + '\n'), child);
  return reader.finish();
}
function parsed() {
  const base = vectors.emptyRefresh[0];
  return [
    { ...base, operation: 'ANALYZE' },
    {
      diagnosticSchema: 1,
      kind: base.kind,
      requestRefSha256: base.requestRefSha256,
      ordinal: 1,
      event: 'PARSE_STARTED',
      sourceRefSha256: expected.sourceRefSha256,
      slot: 0,
    },
    {
      diagnosticSchema: 1,
      kind: base.kind,
      requestRefSha256: base.requestRefSha256,
      ordinal: 2,
      event: 'PARSE_FINISHED',
      sourceRefSha256: expected.sourceRefSha256,
      slot: 0,
      outcome: 'SUCCEEDED',
    },
    { ...vectors.emptyRefresh[1], ordinal: 3, started: 1, finished: 1 },
  ];
}
test('parse capture retains literal empty and actual entry/settlement evidence', () => {
  assert.equal(capture(vectors.emptyRefresh).complete, true);
  const result = capture(parsed());
  assert.equal(result.scope, 'CONSUMED_NATIVE_PARSE_DIAGNOSTICS_ONLY');
  assert.equal(result.complete, true);
  assert.deepEqual(result.invocations, [
    {
      sourceRefSha256: expected.sourceRefSha256,
      slot: 0,
      startOrdinal: 1,
      finishOrdinal: 2,
      outcome: 'SUCCEEDED',
    },
  ]);
  assert.deepEqual(result.completionOrder, [expected.sourceRefSha256]);
});
test('parse capture refuses malformed, foreign, duplicate, unpaired and lost evidence', () => {
  for (const mutate of [
    (rows) => (rows[0].extra = true),
    (rows) => (rows[1].requestRefSha256 = '0'.repeat(64)),
    (rows) => (rows[1].slot = 2),
    (rows) => (rows[1].sourceRefSha256 = 'bad'),
    (rows) => (rows[1].ordinal = 3),
    (rows) => (rows[2].sourceRefSha256 = '0'.repeat(64)),
    (rows) => (rows[2].outcome = 'UNKNOWN'),
    (rows) => (rows[3].started = 2),
    (rows) => (rows[3].complete = false),
    (rows) => (rows[3].reason = 'LIMIT_REACHED'),
    (rows) => rows.pop(),
    (rows) => rows.push({ ...rows[3], ordinal: 4 }),
  ]) {
    const rows = parsed();
    mutate(rows);
    assert.equal(capture(rows).complete, false);
  }
});
test('parse capture rejects incomplete UTF8/framing, extra child and lower caller ceilings', () => {
  assert.equal(typeof helper.createPhase05ParseCapture, 'function');
  for (const bytes of [
    Buffer.from([0xc3, 10]),
    Buffer.from('{"kind":"NATIVE_PARSE_OBSERVATION"\n'),
    Buffer.from(JSON.stringify(vectors.emptyRefresh[0])),
  ]) {
    const reader = helper.createPhase05ParseCapture(controls);
    reader.accept(bytes, {});
    assert.notEqual(reader.finish()?.complete, true);
  }
  const reader = helper.createPhase05ParseCapture(controls);
  reader.accept(Buffer.from(JSON.stringify(vectors.emptyRefresh[0]) + '\n'), {});
  reader.accept(Buffer.from(JSON.stringify(vectors.emptyRefresh[1]) + '\n'), {});
  assert.equal(reader.finish().complete, false);
  assert.notEqual(
    capture(parsed(), {
      ...controls,
      transportLimits: { ...controls.transportLimits, maxStderrBytes: 10 },
    })?.complete,
    true,
  );
});

test('parse capture binds the original child before any split record is complete', () => {
  const reader = helper.createPhase05ParseCapture(controls);
  const first = {},
    second = {};
  const bytes = Buffer.from(vectors.emptyRefresh.map((row) => JSON.stringify(row) + '\n').join(''));
  reader.accept(bytes.subarray(0, 17), first);
  reader.accept(bytes.subarray(17), second);
  assert.equal(reader.finish().complete, false);
});

test('parse capture finalization is idempotent and cannot throw from a late callback', () => {
  const reader = helper.createPhase05ParseCapture(controls),
    child = {};
  reader.accept(
    Buffer.from(vectors.emptyRefresh.map((r) => JSON.stringify(r) + '\n').join('')),
    child,
  );
  const result = reader.finish();
  assert.strictEqual(reader.finish(), result);
  assert.doesNotThrow(() => reader.accept(Buffer.from('late'), child));
});

test('parse capture charges its line buffer and retained summary against one caller memory ceiling', (t) => {
  const allocations = [],
    original = Buffer.alloc;
  t.mock.method(Buffer, 'alloc', (size, ...args) => {
    allocations.push(size);
    return original(size, ...args);
  });
  for (const maxMemoryBytes of [1, 1024]) {
    allocations.length = 0;
    const reader = helper.createPhase05ParseCapture({
      ...controls,
      resourceBudget: { ...controls.resourceBudget, maxMemoryBytes },
    });
    reader.accept(
      Buffer.from(vectors.emptyRefresh.map((row) => JSON.stringify(row) + '\n').join('')),
      {},
    );
    const summary = reader.finish();
    const retained = summary === null ? 0 : Buffer.byteLength(JSON.stringify(summary));
    assert.ok(
      allocations.reduce((sum, n) => sum + n, 0) + retained <= maxMemoryBytes,
      `line and retained evidence exceed ${maxMemoryBytes}-byte caller ceiling`,
    );
    if (maxMemoryBytes === 1024) assert.equal(summary.complete, true);
    else assert.notEqual(summary?.complete, true);
  }
});

test('independent literal diagnostic streams cannot qualify missing, foreign or damaged evidence', () => {
  assert.ok(Array.isArray(vectors.invalidStreams), 'literal negative Fixture streams missing');
  assert.equal(vectors.invalidStreams.length, 9);
  for (const vector of vectors.invalidStreams) {
    const reader = helper.createPhase05ParseCapture(controls),
      child = {};
    const bytes =
      vector.hex === undefined
        ? Buffer.from(vector.stderr, 'utf8')
        : Buffer.from(vector.hex, 'hex');
    // Fragment every literal stream independently of the record boundaries.
    for (let offset = 0; offset < bytes.length; offset += 7)
      reader.accept(bytes.subarray(offset, offset + 7), child);
    assert.equal(reader.finish()?.complete === true, false, vector.id);
    assert.equal(expected.rejectedStreams[vector.id], true, vector.id);
  }
});

// Pure agreement vectors only, not actual Native/SQLite or owned pair evidence.
function workerPair() {
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const source = {
    revision: {
      id: 'rev',
      repositoryId: 'repo',
      kind: 'WORKTREE',
      contentFingerprint: 'base',
      baseRevisionId: null,
    },
    files: Array.from({ length: 50 }, (_, index) => ({
      id: `source-${index}`,
      repositoryId: 'repo',
      revisionId: 'rev',
      path: `src/Unit${String(index).padStart(2, '0')}.java`,
      contentFingerprint: 'sha256:' + 'a'.repeat(64),
      classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
      languageHint: 'java',
      sensitivity: 'PUBLIC',
    })),
  };
  const capabilities = ['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'];
  const members = [1, 2].map((count) => {
    const invocations = [];
    let ordinal = 1;
    for (let pass = 0; pass < 2; pass++)
      for (let index = 0; index < 50; index += count) {
        const batch = source.files.slice(index, index + count).map((file, slot) => ({
          sourceRefSha256: hash(`codeatlas-parse-source-v1\0${file.id}`),
          slot,
          startOrdinal: ordinal++,
          finishOrdinal: null,
          outcome: 'SUCCEEDED',
        }));
        for (const invocation of [...batch].reverse()) invocation.finishOrdinal = ordinal++;
        invocations.push(...batch);
      }
    const requestId = `worker-${count}`;
    return {
      runKey: {
        fixtureId: 'p05-code-intelligence-evaluation-v1',
        scenario: 'WORKER_CONSISTENCY',
        repetition: 1,
        requestedWorkers: count,
        expectedEffectiveWorkers: count,
        completionOrderId: `REQUIRED_WORKER_ORDER_${count}`,
        executionKind: 'NATIVE_INDEX',
        expectedOutcome: 'PUBLISHED',
      },
      sourceSeedSha256: 'a'.repeat(64),
      sourceDigest: 'b'.repeat(64),
      receiptSha256: String(count).repeat(64),
      configuration: {
        configVersion: 1,
        source: { include: ['**/*.java'], exclude: [] },
        indexing: { nativeAnalyzer: { parseWorkers: count } },
        resourceBudget: { maxDurationMs: 10000, maxMemoryBytes: 67108864, maxEvents: 10000 },
        transportLimits: { ...controls.transportLimits, maxStdinBytes: 1000000 },
      },
      record: {
        operation: 'FULL',
        outcome: 'SUCCEEDED',
        result: { workers: { requested: count, effectiveCount: count } },
        nativeObservation: {
          scope: 'OBSERVED_CHILD_AND_CONSUMED_WIRE_ONLY',
          childClosed: true,
          children: [{ executableMatches: true, exitCode: 0, signal: null }],
          nativeStream: {
            captureFailed: false,
            terminalCount: 1,
            terminal: {
              protocolVersion: 3,
              requestId,
              type: 'ANALYSIS_COMPLETED',
              payload: {
                outcome: 'SUCCEEDED',
                repositoryId: 'repo',
                revisionId: 'rev',
                revisionFingerprint: 'base',
              },
            },
          },
          parseObservation: {
            scope: 'CONSUMED_NATIVE_PARSE_DIAGNOSTICS_ONLY',
            requestRefSha256: hash(`codeatlas-parse-request-v1\x003\0${requestId}`),
            operation: 'ANALYZE',
            workerLimit: count,
            started: 100,
            finished: 100,
            complete: true,
            captureFailed: false,
            invocations,
            completionOrder: [...invocations]
              .sort((a, b) => a.finishOrdinal - b.finishOrdinal)
              .map((i) => i.sourceRefSha256),
            maximumActiveSlots: count,
          },
        },
      },
    };
  });
  return {
    members,
    source,
    capabilities,
    comparison: {
      graphEqual: true,
      nativeStateEqual: true,
      supportEqual: true,
      coverageEqual: true,
      staleBindings: 0,
    },
  };
}

test('worker pair requires distinct actual counts, common seed, overlap and different completion vectors', () => {
  assert.equal(
    typeof runner.verifyPhase05WorkerPair,
    'function',
    'actual worker pair predicate missing',
  );
  assert.equal(runner.verifyPhase05WorkerPair(workerPair()), true);
  for (const mutate of [
    (x) => x.members.pop(),
    (x) => (x.members[1].sourceSeedSha256 = 'c'.repeat(64)),
    (x) => (x.members[1].sourceDigest = 'c'.repeat(64)),
    (x) => x.members[1].runKey.repetition++,
    (x) => (x.members[1].runKey.completionOrderId = 'REQUIRED_WORKER_ORDER_1'),
    (x) => (x.members[1].record.result.workers.effectiveCount = 1),
    (x) => (x.members[1].record.outcome = 'FAILED'),
    (x) => {
      const proof = x.members[1].record.nativeObservation.parseObservation;
      for (let i = 0; i < proof.invocations.length; i += 2) {
        const a = proof.invocations[i],
          b = proof.invocations[i + 1];
        [a.finishOrdinal, b.finishOrdinal] = [b.finishOrdinal, a.finishOrdinal];
      }
      proof.completionOrder = [...proof.invocations]
        .sort((a, b) => a.finishOrdinal - b.finishOrdinal)
        .map((i) => i.sourceRefSha256);
      assert.equal(
        runner.verifyPhase05ParseObservation({
          record: x.members[1].record,
          source: x.source,
          capabilities: x.capabilities,
        }),
        true,
      );
    },
    (x) => {
      const proof = x.members[1].record.nativeObservation.parseObservation;
      [...proof.invocations]
        .sort((a, b) => a.finishOrdinal - b.finishOrdinal)
        .forEach((i, n) => {
          i.startOrdinal = n * 2 + 1;
          i.finishOrdinal = n * 2 + 2;
        });
      assert.equal(
        runner.verifyPhase05ParseObservation({
          record: x.members[1].record,
          source: x.source,
          capabilities: x.capabilities,
        }),
        true,
      );
    },
    (x) =>
      x.members[1].record.nativeObservation.parseObservation.invocations.forEach(
        (i) => (i.slot = 0),
      ),
    (x) => (x.comparison.graphEqual = false),
    (x) => (x.comparison.nativeStateEqual = false),
    (x) => (x.comparison.supportEqual = false),
    (x) => (x.comparison.coverageEqual = false),
    (x) => (x.comparison.staleBindings = 1),
  ]) {
    const input = workerPair();
    mutate(input);
    assert.equal(runner.verifyPhase05WorkerPair(input), false);
  }
});
