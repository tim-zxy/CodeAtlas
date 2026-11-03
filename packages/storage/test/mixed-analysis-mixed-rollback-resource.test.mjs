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
import { modelMixedRollback } from '../../../fixtures/phase1/mixed-analysis-stage/independent-mixed-rollback-resource-model.mjs';
const ref = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../fixtures/phase1/mixed-analysis-stage/mixed-rollback-resource-reference.json',
        import.meta.url,
      ),
    ),
  ),
  sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),
  values = (b) => ({
    rows: b.rows,
    serializedBytes: b.serializedBytes,
    items: b.items,
    retainedLogicalBytes: b.retainedLogicalBytes,
  }),
  sort = (v) =>
    [...v].sort((a, b) =>
      referenceCanonical(a) < referenceCanonical(b)
        ? -1
        : referenceCanonical(a) > referenceCanonical(b)
          ? 1
          : 0,
    );
for (const c of ref.cases)
  test('independent nonempty rollback ambiguity resources ' + c.id, async (t) => {
    assert.equal(sha(c.source.path), c.source.sha256);
    for (const model of ref.models) assert.equal(sha(model.path), model.sha256);
    const x = JSON.parse(fs.readFileSync(c.source.path)),
      schema = JSON.parse(fs.readFileSync(x.schemaSource.path));
    assert.equal(sha(x.schemaSource.path), x.schemaSource.sha256);
    for (const p of schema.sources) assert.equal(sha(p.path), p.sha256);
    for (const p of x.models) assert.equal(sha(p.path), p.sha256);
    assert.deepEqual(
      modelMixedRollback(x.input, x.semantic, x.store, schema, ref.databasePath, c.point),
      c.expected,
    );
    const f = await historyFixture(t, 'available', { seed: false });
    seedLiteral(f.db, x.input);
    const expected = modelMixedRollback(
        x.input,
        x.semantic,
        x.store,
        schema,
        f.databasePath,
        c.point,
      ),
      limits = expected.apply.required,
      target = Object.fromEntries(
        Object.entries(expected.durableTables).map(([k, v]) => [k, sort(v)]),
      ),
      h = captureActivationContext(f.db, x.input.repositoryId, historyLimits),
      stage = new MixedAnalysisStage(
        f.db,
        h.handle,
        c.id.startsWith('active-full') ? 'FULL' : 'DELTA',
        limits,
        createMixedAnalysisRules(),
      ),
      owner = stage.prepareOwner(null, x.preparation);
    stage.acceptObservation(
      owner.ownerHandle,
      x.raw
        ? {
            metadata: x.raw.metadata,
            requestBytes: Buffer.from(x.raw.requestText),
            outputBytes: Buffer.from(x.raw.outputText),
          }
        : null,
    );
    const token = stage.freeze(),
      store = new MixedAnalysisStore(f.db),
      add = HistoryReadBudget.prototype.add,
      own = HistoryReadBudget.prototype.own,
      exec = f.db.exec,
      prepare = f.db.prepare;
    let applyBudget,
      inspectBudget,
      commitFault = 0,
      rollbackFault = 0,
      snapshotFault = 0;
    HistoryReadBudget.prototype.add = function (...args) {
      if ((new Error().stack.split('\n')[2] ?? '').includes('at acquireMixedAnalysisLease'))
        applyBudget = this;
      return add.apply(this, args);
    };
    f.db.exec = function (sql) {
      if (sql === 'ROLLBACK') {
        rollbackFault++;
        throw Error('independent-rollback-failure');
      }
      if (c.point === 'commit-and-rollback-fail' && sql === 'COMMIT') {
        commitFault++;
        throw Error('independent-commit-failure');
      }
      return exec.call(this, sql);
    };
    f.db.prepare = function (sql) {
      const statement = prepare.call(this, sql);
      if (
        c.point === 'snapshot-and-rollback-fail' &&
        sql.startsWith('INSERT INTO provider_snapshots(')
      ) {
        const run = statement.run;
        statement.run = function (...args) {
          run.apply(this, args);
          snapshotFault++;
          throw Error('independent-snapshot-after-write');
        };
      }
      return statement;
    };
    try {
      assert.throws(
        () => store.apply(token.lease, limits),
        (e) => e.code === expected.expectedApplyError,
      );
      assert.deepEqual(
        values(applyBudget),
        expected.apply.state,
        'complete independent failed transaction-prefix cost',
      );
      assert.equal(rollbackFault, 1);
      assert.equal(commitFault, c.point === 'commit-and-rollback-fail' ? 1 : 0);
      assert.equal(snapshotFault, c.point === 'snapshot-and-rollback-fail' ? 1 : 0);
    } finally {
      f.db.exec = exec;
      f.db.prepare = prepare;
      HistoryReadBudget.prototype.add = add;
    }
    try {
      assert.equal(f.db.isTransaction, true);
      assert.throws(
        () => store.apply(token.lease, limits),
        (e) => e.code === 'STAGE_RELEASED',
      );
      assert.deepEqual(allRows(f.reopen(true)), target, 'no durable half publication');
      HistoryReadBudget.prototype.own = function (...args) {
        if ((new Error().stack.split('\n')[2] ?? '').includes('at inspectMixedAnalysisOutcome'))
          inspectBudget = this;
        return own.apply(this, args);
      };
      assert.deepEqual(
        inspectMixedAnalysisOutcome(store, expected.open.required),
        expected.open.result,
      );
      assert.deepEqual(
        values(inspectBudget),
        expected.open.state,
        'open transaction guard only owns receipt',
      );
      for (const key of expected.nonzeroOpenDimensions) {
        assert.throws(
          () =>
            inspectMixedAnalysisOutcome(store, {
              ...expected.open.required,
              [key]: expected.open.required[key] - 1,
            }),
          (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
          key,
        );
        assert.equal(inspectBudget.rows, 0);
        assert.equal(inspectBudget.serializedBytes, 0);
      }
      assert.equal(f.db.isTransaction, true, 'inspection does not repair/close writer transaction');
      assert.deepEqual(allRows(f.reopen(true)), target);
      // Release only this fault-injected isolated test transaction using its original SQLite method; no production repair/retry.
      exec.call(f.db, 'ROLLBACK');
      assert.equal(f.db.isTransaction, false);
      assert.deepEqual(allRows(f.db), target);
      assert.deepEqual(
        inspectMixedAnalysisOutcome(store, expected.settled.required),
        expected.settled.result,
      );
      assert.deepEqual(
        values(inspectBudget),
        expected.settled.state,
        'settled independent readonly recovery cost',
      );
      for (const key of Object.keys(expected.settled.required))
        assert.throws(
          () =>
            inspectMixedAnalysisOutcome(store, {
              ...expected.settled.required,
              [key]: expected.settled.required[key] - 1,
            }),
          (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
          key,
        );
      assert.deepEqual(allRows(f.db), target);
      assert.deepEqual(allRows(f.reopen(true)), target);
      const spent = values(applyBudget);
      stage.close();
      assert.deepEqual(values(applyBudget), spent, 'reserved first cleanup');
    } finally {
      HistoryReadBudget.prototype.own = own;
      if (f.db.isTransaction) exec.call(f.db, 'ROLLBACK');
      stage.close();
    }
  });
