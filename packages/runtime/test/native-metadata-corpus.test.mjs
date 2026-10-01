import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { RepositoryAnalysisStage } from '../../storage/dist/index.js';
import { validateNativeStateCandidate } from '../../providers/dist/index.js';
import {
  buildMemoryCase,
  caseJsonFiles,
  corpusExpected,
  memoryCases,
} from './helpers/native-metadata-corpus.mjs';

test('B1 memory classes are pinned to executable actual-path cases', async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL('../../../fixtures/storage/native-analysis-state/cases.json', import.meta.url),
      'utf8',
    ),
  );
  assert.deepEqual(fixture.memoryCases, memoryCases);
});
for (const name of memoryCases.filter(
  (n) => !n.includes('oversized') && n !== 'deep-unknown-input',
)) {
  test(`metadata correspondence corpus: ${name}`, () => {
    const value = buildMemoryCase(name);
    const files = caseJsonFiles(value);
    const input = {
      headerJson: JSON.stringify(value.header),
      files,
      expected: corpusExpected,
      maxSerializedBytes: 1_000_000,
      memoryBudgetBytes: Number.MAX_SAFE_INTEGER,
      fullStage: {
        readSourceFiles: () => value.summaries.map((s) => s.sourceFile),
        readProviderNodes: () => value.nodes,
        readProviderEdges: () => [],
        readCoverage: () => value.summaries.flatMap((s) => s.coverage),
        readDiagnostics: () => [],
      },
    };
    if (value.outcome === 'INVALID')
      assert.throws(
        () => validateNativeStateCandidate(input),
        (e) => e.nativeStateReason === 'INVALID',
      );
    else {
      assert.equal(validateNativeStateCandidate(input).files.length, value.summaries.length);
      if (value.nodes.length) {
        const wrong = structuredClone(value.nodes);
        wrong[0].name = 'drift';
        assert.throws(
          () =>
            validateNativeStateCandidate({
              ...input,
              fullStage: { ...input.fullStage, readProviderNodes: () => wrong },
            }),
          (e) => e.nativeStateReason === 'INVALID',
        );
      }
    }
  });
}

test('full-stage seal binds actual facts to the completed snapshot before port validation', async () => {
  const value = buildMemoryCase('long-ascii');
  const db = new DatabaseSync(':memory:');
  const limits = { maxSerializedBytes: 1_000_000, memoryBudgetBytes: Number.MAX_SAFE_INTEGER };
  const stage = new RepositoryAnalysisStage(db, limits);
  try {
    await stage.accept({ type: 'SOURCE_FILE', payload: value.summaries[0].sourceFile });
    await stage.accept({
      type: 'NODE',
      payload: { ...value.nodes[0], providerSnapshotId: 'wrong-snapshot' },
    });
    await stage.accept({ type: 'COVERAGE', payload: value.summaries[0].coverage[0] });
    await stage.acceptNativeSummary(value.summaries[0]);
    stage.confirmSucceeded({
      type: 'ANALYSIS_COMPLETED',
      payload: {
        outcome: 'SUCCEEDED',
        repositoryId: 'repo',
        revisionId: 'worktree',
        revisionFingerprint: 'fp',
        providerSnapshotId: 'snapshot',
        capabilities: [],
        counts: { sourceFiles: 1, nodes: 1, edges: 0, coverage: 1, diagnostics: 0 },
      },
    });
    let calls = 0;
    assert.throws(
      () =>
        stage.sealNativeState(
          JSON.stringify(value.header),
          corpusExpected,
          (input) => {
            calls++;
            return validateNativeStateCandidate(input);
          },
          limits,
        ),
      /context|snapshot/i,
    );
    assert.equal(calls, 0);
  } finally {
    stage.close();
    db.close();
  }
});

for (const name of memoryCases)
  test(`actual bounded read and seal paths: ${name}`, () => {
    const worker = fileURLToPath(new URL('./helpers/native-metadata-worker.mjs', import.meta.url));
    const child = spawnSync(process.execPath, [worker, name], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 2_000_000,
    });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    const observation = JSON.parse(child.stdout);
    assert.equal(observation.name, name);
    assert.equal(observation.persistentStateUnchanged, true);
    assert.equal(observation.transactionClosed, true);
    assert.ok(observation.peakResidentBytes > 0);
    assert.equal(observation.retainedReadStringChargeBytes, 2 * observation.retainedReadSqlBytes);
    assert.equal(observation.retainedSealStringChargeBytes, 2 * observation.retainedSealSqlBytes);
  });
