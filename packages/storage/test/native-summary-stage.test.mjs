import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { RepositoryAnalysisStage } from '../dist/index.js';

const limits = { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 16 * 1024 * 1024 };
const expected = {
  repositoryId: 'repo',
  providerId: 'native',
  providerVersion: '1',
  revisionId: 'worktree',
  contentFingerprint: 'fp',
  language: {
    languageId: 'java',
    grammarVersion: '1',
    analyzerVersion: '1',
    compatibilityVersion: '1',
  },
  resolverVersion: '1',
  normalizerVersion: '1',
  policyFingerprint: 'policy',
  requestedCapabilities: ['SYMBOL'],
};
const summary = {
  sourceFile: { id: 'file', path: 'A.java', contentFingerprint: 'file-fp' },
  extra: '😀\n"',
};

function setup(t, budget = limits) {
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryAnalysisStage(db, budget);
  t.after(() => {
    stage.close();
    db.close();
  });
  return { db, stage };
}
function complete(stage) {
  stage.confirmSucceeded({
    type: 'ANALYSIS_COMPLETED',
    payload: {
      outcome: 'SUCCEEDED',
      repositoryId: 'repo',
      revisionId: 'worktree',
      revisionFingerprint: 'fp',
      providerSnapshotId: 'snapshot',
      capabilities: [],
      counts: { sourceFiles: 0, nodes: 0, edges: 0, coverage: 0, diagnostics: 0 },
    },
  });
}
// This is a mechanical Storage port stub, not Provider semantic acceptance or
// Runtime admission evidence. Production must supply the Runtime adapter.
function mechanicalPort(input) {
  assert.deepEqual(Object.keys(input.fullStage).sort(), [
    'readCoverage',
    'readDiagnostics',
    'readProviderEdges',
    'readProviderNodes',
    'readSourceFiles',
  ]);
  assert.deepEqual([...input.fullStage.readSourceFiles()], []);
  return {
    expected: input.expected,
    headerJson: input.headerJson,
    summaryDigest: 'a'.repeat(64),
    files: [...input.files],
  };
}

test('native summary retention requires declared limits; legacy stage remains usable', async (t) => {
  const { stage } = setup(t, undefined);
  // Explicitly construct the legacy shape (setup's default is otherwise limits).
  const db = new DatabaseSync(':memory:');
  const legacy = new RepositoryAnalysisStage(db);
  t.after(() => {
    legacy.close();
    db.close();
  });
  await assert.rejects(legacy.acceptNativeSummary(summary), /limits/i);
  complete(legacy);
  assert.throws(() => legacy.sealNativeState('{}', expected, undefined, limits), /port/i);
  legacy.sealNativeState('{}', expected, mechanicalPort, limits);
  assert.equal(legacy.readSealedNativeState().files.length, 0);
  assert.throws(() => stage.readSealedNativeState(), /sealed/i);
});

test('native metadata is cumulatively UTF-8 bounded before retention including seal header', async (t) => {
  const bytes = Buffer.byteLength(JSON.stringify(summary));
  const { stage, db } = setup(t, { ...limits, maxSerializedBytes: bytes });
  await stage.acceptNativeSummary(summary);
  assert.equal(
    db.prepare('SELECT summary_json FROM temp.analysis_native_summary').get().summary_json,
    JSON.stringify(summary),
  );
  await assert.rejects(
    stage.acceptNativeSummary({ ...summary, sourceFile: { ...summary.sourceFile, id: 'other' } }),
    /resource/i,
  );
  complete(stage);
  let calls = 0;
  assert.throws(
    () =>
      stage.sealNativeState(
        '{}',
        expected,
        () => {
          calls++;
        },
        limits,
      ),
    /resource/i,
  );
  assert.equal(calls, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM temp.analysis_native_summary').get().n, 1);
});

test('non-JSON, cyclic and oversized unknown metadata is refused without invoking accessors', async (t) => {
  const { stage, db } = setup(t, { ...limits, maxSerializedBytes: 150 });
  let calls = 0;
  const accessor = {
    get sourceFile() {
      calls++;
      throw Error('getter must not run');
    },
  };
  const cyclic = {};
  cyclic.self = cyclic;
  for (const value of [
    accessor,
    cyclic,
    { x: undefined },
    { x: NaN },
    { x: 1n },
    new Date(),
    {
      toJSON() {
        calls++;
      },
    },
  ])
    await assert.rejects(stage.acceptNativeSummary(value), /JSON/i);
  await assert.rejects(stage.acceptNativeSummary({ unknown: 'x'.repeat(1_000_001) }), /resource/i);
  assert.equal(calls, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM temp.analysis_native_summary').get().n, 0);
});

test('retained duplicated summary strings consume memory before insert', async (t) => {
  const bytes = Buffer.byteLength(JSON.stringify(summary));
  const { stage, db } = setup(t, { ...limits, memoryBudgetBytes: 2 * bytes });
  await assert.rejects(stage.acceptNativeSummary(summary), /resource/i);
  assert.equal(db.prepare('SELECT count(*) AS n FROM temp.analysis_native_summary').get().n, 0);
});

test('failed seal is retryable; successful seal detaches and freezes values and blocks all writers', async (t) => {
  const { stage } = setup(t);
  await stage.acceptNativeSummary(summary);
  assert.throws(() => stage.sealNativeState('{}', expected, mechanicalPort, limits), /complete/i);
  complete(stage);
  assert.throws(
    () =>
      stage.sealNativeState(
        '{}',
        expected,
        () => {
          throw Error('port failure');
        },
        limits,
      ),
    /port failure/,
  );
  const sealed = stage.sealNativeState('{}', expected, mechanicalPort, limits);
  assert.notEqual(sealed.expected, expected);
  assert.equal(Object.isFrozen(expected), false);
  assert.equal(Object.isFrozen(sealed.expected.language), true);
  assert.equal(Object.isFrozen(sealed.files[0]), true);
  assert.equal(Object.isFrozen(sealed.files), true);
  assert.deepEqual(sealed.files[0], {
    sourceFileId: 'file',
    sourcePath: 'A.java',
    contentFingerprint: 'file-fp',
    summaryJson: JSON.stringify(summary),
  });
  assert.equal(stage.readSealedNativeState(), sealed);
  await assert.rejects(stage.accept(undefined), /sealed/i);
  await assert.rejects(stage.acceptNativeSummary(undefined), /sealed/i);
  for (const writer of [
    'putNormalizedNode',
    'putNormalizedEdge',
    'appendMergedRow',
    'appendSupport',
    'confirmSucceeded',
  ])
    assert.throws(() => stage[writer](undefined), /sealed/i);
  assert.throws(() => stage.sealNativeState('{}', expected, mechanicalPort, limits), /sealed/i);
  assert.deepEqual([...stage.readSourceFiles()], []);
});

test('native staging checks limits before creating TEMP tables', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const bad of [0, -1, NaN, Infinity, 1.5, 1_000_001])
      assert.throws(() => new RepositoryAnalysisStage(db, { ...limits, maxSerializedBytes: bad }));
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE type='table'").get().n,
      0,
    );
  } finally {
    db.close();
  }
});
