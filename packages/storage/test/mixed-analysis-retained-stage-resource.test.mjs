import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
import { historyFixture, seedLiteral, historyLimits } from './helpers/r011-history-fixture.mjs';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { historyCanonical as C } from '../../../fixtures/phase1/mixed-analysis-stage/independent-history-resource-model.mjs';
import { modelRetainedStage } from '../../../fixtures/phase1/mixed-analysis-stage/independent-retained-stage-resource-model.mjs';
const ref = JSON.parse(
    fs.readFileSync(
      'fixtures/phase1/mixed-analysis-stage/retained-history-resource-reference.json',
    ),
  ),
  sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),
  values = (b) => ({
    rows: b.rows,
    serializedBytes: b.serializedBytes,
    items: b.items,
    retainedLogicalBytes: b.retainedLogicalBytes,
  }),
  rawBundle = () => null;

function provenance() {
  for (const s of [ref.source, ...ref.models]) assert.equal(sha(s.path), s.sha256, s.path);
  const x = JSON.parse(fs.readFileSync(ref.source.path));
  assert.deepEqual(ref.input, x.input);
  assert.deepEqual(ref.ownerReference, x.owner.body);
  assert.deepEqual(ref.stage.ownerBody, x.owner.body);
  assert.equal(ref.stage.stageDigest, x.owner.stageDigest);
  for (const k of Object.keys(x.expected)) assert.deepEqual(ref.stage.result[k], x.expected[k], k);
}
for (const phase of ['observed', 'frozen'])
  test(
    'independent retained deletion Stage ' + phase + ' complete exact and one-below',
    async (t) => {
      provenance();
      assert.deepEqual(
        modelRetainedStage(ref.input, ref.semantic, ref.preparation, ref.ownerReference),
        ref.stage,
      );
      const f = await historyFixture(t, 'available', { seed: false });
      seedLiteral(f.db, ref.input);
      const before = allRows(f.db),
        run = (limits) => {
          const cap = captureActivationContext(f.db, ref.input.repositoryId, historyLimits),
            add = HistoryReadBudget.prototype.add,
            real = createMixedAnalysisRules(),
            calls = { prepareJavaOwner: 0, validateObservation: 0, compose: 0 };
          let b, stage;
          const rules = Object.freeze(
            Object.fromEntries(
              Object.keys(calls).map((method) => [
                method,
                (...args) => {
                  calls[method]++;
                  return real[method](...args);
                },
              ]),
            ),
          );
          HistoryReadBudget.prototype.add = function (...args) {
            if ((new Error().stack.split('\n')[2] ?? '').includes('at new MixedAnalysisStage'))
              b = this;
            return add.apply(this, args);
          };
          try {
            stage = new MixedAnalysisStage(f.db, cap.handle, 'DELTA', limits, rules);
            assert.deepEqual(values(b), ref.stage.constructor.state);
            const owner = stage.prepareOwner(null, ref.preparation);
            assert.equal(owner.stageDigest, ref.stage.stageDigest);
            assert.deepEqual(values(b), ref.stage.owner.state);
            stage.acceptObservation(owner.ownerHandle, rawBundle());
            assert.deepEqual(values(b), ref.stage.observed.state);
            if (phase === 'frozen') {
              assert.deepEqual(stage.freeze().basis, ref.stage.result.basis);
              assert.deepEqual(values(b), ref.stage.frozen.state);
            }
            const temp = f.db
              .prepare('SELECT key,value_json FROM mixed_stage ORDER BY rowid')
              .all()
              .map((v) => ({ ...v }));
            assert.deepEqual(temp, ref.stage[phase].tempRows);
            if (phase === 'frozen')
              assert.equal(
                crypto
                  .createHash('sha256')
                  .update(C(temp.map((r) => [r.key, r.value_json])))
                  .digest('hex'),
                ref.stage.seal,
              );
            assert.deepEqual(calls, {
              prepareJavaOwner: 0,
              validateObservation: 0,
              compose: phase === 'frozen' ? 1 : 0,
            });
            const spent = values(b);
            stage.close();
            assert.deepEqual(values(b), spent);
          } finally {
            HistoryReadBudget.prototype.add = add;
            if (stage) stage.close();
          }
        };
      run(ref.stage[phase].required);
      for (const key of Object.keys(ref.stage[phase].required))
        assert.throws(
          () => run({ ...ref.stage[phase].required, [key]: ref.stage[phase].required[key] - 1 }),
          (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
          key,
        );
      assert.deepEqual(allRows(f.db), before);
      assert.deepEqual(allRows(f.reopen(true)), before);
    },
  );

import { MixedAnalysisStore } from '../dist/analysis/mixed-analysis-store.js';
import { referenceCanonical } from './helpers/r011-history-fixture.mjs';
import { modelRetainedStore } from '../../../fixtures/phase1/mixed-analysis-stage/independent-retained-store-resource-model.mjs';
test('independent retained deletion whole Stage Runtime Provider Store exact and one-below', async (t) => {
  provenance();
  const schema = JSON.parse(fs.readFileSync(ref.schemaSource.path));
  assert.deepEqual(
    modelRetainedStore(ref.input, ref.semantic, ref.preparation, ref.ownerReference, schema),
    ref.store,
  );
  const run = async (key) => {
    const f = await historyFixture(t, 'available', { seed: false });
    seedLiteral(f.db, ref.input);
    const before = allRows(f.db),
      limits = { ...ref.store.committed.required };
    if (key) limits[key]--;
    const add = HistoryReadBudget.prototype.add;
    let b, stage, lease, store;
    HistoryReadBudget.prototype.add = function (...args) {
      if ((new Error().stack.split('\n')[2] ?? '').includes('at acquireMixedAnalysisLease'))
        b = this;
      return add.apply(this, args);
    };
    const operation = () => {
      const cap = captureActivationContext(f.db, ref.input.repositoryId, historyLimits);
      stage = new MixedAnalysisStage(f.db, cap.handle, 'DELTA', limits, createMixedAnalysisRules());
      const owner = stage.prepareOwner(null, ref.preparation);
      stage.acceptObservation(owner.ownerHandle, rawBundle());
      lease = stage.freeze().lease;
      store = new MixedAnalysisStore(f.db);
      return store.apply(lease, limits);
    };
    try {
      if (key) {
        assert.throws(operation, (e) => e.code === 'STAGE_LIMIT_EXCEEDED', key);
        assert.equal(f.db.isTransaction, false);
        assert.deepEqual(allRows(f.db), before);
        assert.deepEqual(allRows(f.reopen(true)), before);
      } else {
        assert.equal(operation(), ref.store.activationId);
        assert.deepEqual(values(b), ref.store.committed.state);
        assert.deepEqual(allRows(f.db), ref.expectedTables);
        assert.deepEqual(allRows(f.reopen(true)), ref.expectedTables);
        assert.equal(
          f.db
            .prepare("SELECT count(*) AS n FROM sqlite_temp_schema WHERE name='mixed_stage'")
            .get().n,
          0,
        );
        assert.throws(
          () => store.apply(lease, limits),
          (e) => e.code === 'STAGE_RELEASED',
        );
        const fresh = captureActivationContext(f.db, ref.input.repositoryId, historyLimits);
        assert.equal(fresh.view.status, 'AVAILABLE');
        assert.deepEqual(fresh.view.history, ref.store.result.manifest);
        assert.equal(
          fresh.view.history.parent.activationId,
          ref.input.tables.active_history_pointer[0].activation_id,
        );
        for (const table of [
          'activation_history',
          'syntax_origins',
          'syntax_projections',
          'activation_syntax_members',
        ])
          for (const row of before[table])
            assert.ok(
              ref.expectedTables[table].some(
                (v) => referenceCanonical(v) === referenceCanonical(row),
              ),
              table + ' immutable preserved',
            );
        const spent = values(b);
        stage.close();
        assert.deepEqual(values(b), spent);
      }
    } finally {
      HistoryReadBudget.prototype.add = add;
      if (stage) stage.close();
    }
  };
  await run(null);
  for (const key of Object.keys(ref.store.committed.required)) await run(key);
});
