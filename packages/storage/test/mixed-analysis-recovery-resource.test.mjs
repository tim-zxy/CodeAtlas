import { measures } from '../../../fixtures/phase1/mixed-analysis-stage/independent-code-resource-model.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  historyFixture,
  seedLiteral,
  historyLimits,
  referenceCanonical,
} from './helpers/r011-history-fixture.mjs';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import {
  MixedAnalysisStore,
  inspectMixedAnalysisOutcome,
} from '../dist/analysis/mixed-analysis-store.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
import { modelZeroRecovery } from '../../../fixtures/phase1/mixed-analysis-stage/independent-zero-recovery-resource-model.mjs';
const ref = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../fixtures/phase1/mixed-analysis-stage/zero-recovery-resource-reference.json',
        import.meta.url,
      ),
    ),
  ),
  source = JSON.parse(fs.readFileSync(ref.source.path)),
  schema = JSON.parse(fs.readFileSync(ref.schemaSource.path)),
  sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),
  values = (b) => ({
    rows: b.rows,
    serializedBytes: b.serializedBytes,
    items: b.items,
    retainedLogicalBytes: b.retainedLogicalBytes,
  }),
  sortRows = (v) =>
    [...v].sort((a, b) =>
      referenceCanonical(a) < referenceCanonical(b)
        ? -1
        : referenceCanonical(a) > referenceCanonical(b)
          ? 1
          : 0,
    );
for (const c of ref.cases)
  test('independent zero-fact transaction and readonly recovery budget ' + c.id, async (t) => {
    assert.equal(sha(ref.source.path), ref.source.sha256);
    assert.equal(sha(ref.schemaSource.path), ref.schemaSource.sha256);
    for (const p of schema.sources) assert.equal(sha(p.path), p.sha256);
    const x = source.cases.find((v) => v.id === c.caseId);
    assert.deepEqual(
      modelZeroRecovery(x.input, x.expected, schema, ref.databasePath, c.point),
      c.expected,
    );
    const f = await historyFixture(t, 'available', { seed: false });
    seedLiteral(f.db, x.input);
    // Database path is an input known before Stage/Store; no product receipt/usage enters the expected model.
    const expected = modelZeroRecovery(x.input, x.expected, schema, f.databasePath, c.point),
      limits = expected.apply.required,
      h = captureActivationContext(f.db, x.input.repositoryId, historyLimits),
      stage = new MixedAnalysisStage(f.db, h.handle, 'FULL', limits, createMixedAnalysisRules()),
      owner = stage.prepareOwner(null, x.preparation);
    stage.acceptObservation(owner.ownerHandle, {
      metadata: x.raw.metadata,
      requestBytes: Buffer.from(x.raw.requestText),
      outputBytes: Buffer.from(x.raw.outputText),
    });
    const token = stage.freeze(),
      store = new MixedAnalysisStore(f.db),
      add = HistoryReadBudget.prototype.add,
      own = HistoryReadBudget.prototype.own,
      exec = f.db.exec;
    let applyBudget,
      inspectBudget,
      injected = 0;
    HistoryReadBudget.prototype.add = function (...args) {
      if ((new Error().stack.split('\n')[2] ?? '').includes('at acquireMixedAnalysisLease'))
        applyBudget = this;
      return add.apply(this, args);
    };
    f.db.exec = function (sql) {
      if (c.point === 'begin-after-open' && sql === 'BEGIN IMMEDIATE') {
        exec.call(this, sql);
        injected++;
        throw Error('independent-BEGIN-after-open');
      }
      if (c.point === 'commit-before' && sql === 'COMMIT') {
        injected++;
        throw Error('independent-COMMIT-before');
      }
      if (c.point === 'commit-after' && sql === 'COMMIT') {
        exec.call(this, sql);
        injected++;
        throw Error('independent-COMMIT-after');
      }
      if (c.point === 'post-commit-close' && sql === 'DROP TABLE temp.mixed_stage') {
        injected++;
        throw Error('independent-cleanup-failure');
      }
      return exec.call(this, sql);
    };
    try {
      if (expected.expectedError)
        assert.throws(
          () => store.apply(token.lease, limits),
          (e) => e.code === expected.expectedError,
        );
      else
        assert.equal(
          store.apply(token.lease, limits),
          expected.activationId ?? x.expected.activationId,
        );
      assert.equal(injected, c.point === 'success' ? 0 : 1);
      assert.deepEqual(
        values(applyBudget),
        expected.apply.state,
        'complete independent transaction-prefix cost',
      );
    } finally {
      f.db.exec = exec;
      HistoryReadBudget.prototype.add = add;
    }
    try {
      assert.equal(f.db.isTransaction, false);
      assert.throws(
        () => store.apply(token.lease, limits),
        (e) => e.code === 'STAGE_RELEASED',
      );
      const target = Object.fromEntries(
        Object.entries(expected.tables).map(([k, v]) => [k, sortRows(v)]),
      );
      assert.deepEqual(allRows(f.db), target);
      assert.deepEqual(allRows(f.reopen(true)), target);
      HistoryReadBudget.prototype.own = function (...args) {
        if ((new Error().stack.split('\n')[2] ?? '').includes('at inspectMixedAnalysisOutcome'))
          inspectBudget = this;
        return own.apply(this, args);
      };
      const outcome = inspectMixedAnalysisOutcome(store, expected.inspection.required);
      assert.deepEqual(outcome, expected.inspection.result);
      assert.deepEqual(
        values(inspectBudget),
        expected.inspection.state,
        'complete independent fresh readonly recovery cost',
      );
      for (const key of Object.keys(expected.inspection.required))
        assert.throws(
          () =>
            inspectMixedAnalysisOutcome(store, {
              ...expected.inspection.required,
              [key]: expected.inspection.required[key] - 1,
            }),
          (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
          key,
        );
      const receiptShape = measures(expected.receipt);
      for (const [key, value] of [
        ['maxItems', Number(receiptShape.nodes) - 1],
        ['maxDepth', receiptShape.depth - 1],
        ['memoryBudgetBytes', Number(2n * receiptShape.weight) - 1],
      ]) {
        assert.throws(
          () =>
            inspectMixedAnalysisOutcome(store, { ...expected.inspection.required, [key]: value }),
          (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
          'receipt-own ' + key,
        );
        assert.equal(inspectBudget.rows, 0);
        assert.equal(inspectBudget.serializedBytes, 0);
      }
      assert.deepEqual(allRows(f.db), target);
      assert.deepEqual(allRows(f.reopen(true)), target);
      if (c.point === 'post-commit-close')
        assert.equal(
          f.db
            .prepare("SELECT count(*) AS n FROM sqlite_temp_schema WHERE name='mixed_stage'")
            .get().n,
          1,
          'failed first cleanup remains visible; no unbudgeted retry',
        );
      else {
        const spent = values(applyBudget);
        stage.close();
        assert.deepEqual(values(applyBudget), spent, 'first cleanup already reserved');
      }
    } finally {
      HistoryReadBudget.prototype.own = own;
      if (c.point !== 'post-commit-close') stage.close();
    }
  });
