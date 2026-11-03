import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
import {
  historyFixture,
  seedLiteral,
  historyLimits,
  referenceCanonical,
} from './helpers/r011-history-fixture.mjs';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { MixedAnalysisStore } from '../dist/analysis/mixed-analysis-store.js';
import { historyCanonical as C } from '../../../fixtures/phase1/mixed-analysis-stage/independent-history-resource-model.mjs';
import { modelNonemptyValidation } from '../../../fixtures/phase1/mixed-analysis-stage/independent-nonempty-validation-resource-model.mjs';
import { modelActiveFullCompose } from '../../../fixtures/phase1/mixed-analysis-stage/independent-active-full-compose-resource-model.mjs';
import { modelActiveFullStage } from '../../../fixtures/phase1/mixed-analysis-stage/independent-active-full-stage-resource-model.mjs';
import { modelActiveFullStore } from '../../../fixtures/phase1/mixed-analysis-stage/independent-active-full-store-resource-model.mjs';
const ref = JSON.parse(
    fs.readFileSync('fixtures/phase1/mixed-analysis-stage/active-full-resource-reference.json'),
  ),
  sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),
  values = (b) => ({
    rows: b.rows,
    serializedBytes: b.serializedBytes,
    items: b.items,
    retainedLogicalBytes: b.retainedLogicalBytes,
  }),
  sort = (v) => [...v].sort((a, b) => (C(a) < C(b) ? -1 : C(a) > C(b) ? 1 : 0)),
  rawBundle = () => ({
    metadata: ref.raw.metadata,
    requestBytes: Buffer.from(ref.raw.requestText),
    outputBytes: Buffer.from(ref.raw.outputText),
  }),
  source = JSON.parse(fs.readFileSync(ref.source.path));
function provenance() {
  assert.equal(sha(ref.source.path), ref.source.sha256);
  assert.equal(sha(ref.schemaSource.path), ref.schemaSource.sha256);
  for (const s of [...ref.models, ...JSON.parse(fs.readFileSync(ref.schemaSource.path)).sources])
    assert.equal(sha(s.path), s.sha256);
  assert.deepEqual(ref.input, source.input);
  assert.deepEqual(ref.preparation, source.preparation);
  assert.deepEqual(ref.raw, source.raw);
  assert.deepEqual(ref.stage.ownerBody, source.owner.body);
  assert.equal(ref.stage.stageDigest, source.owner.stageDigest);
  for (const k of Object.keys(source.expected))
    assert.deepEqual(
      k === 'projections' ? sort(ref.composition.result[k]) : ref.composition.result[k],
      k === 'projections' ? sort(source.expected[k]) : source.expected[k],
    );
}
for (const phase of ['validation', 'composition'])
  test('independent active FULL Runtime ' + phase + ' complete exact and one-below', () => {
    provenance();
    const e = ref[phase];
    assert.deepEqual(
      phase === 'validation'
        ? modelNonemptyValidation(
            e.input.target,
            e.input.capture,
            e.input.owner.stageDigest,
            ref.raw,
          )
        : modelActiveFullCompose(
            e.input.target,
            e.input.capture,
            e.input.qualificationRef,
            ref.raw,
          ),
      e,
    );
    const limits = {
        maxRows: 1,
        maxSerializedBytes: e.cost.serializedBytes,
        maxItems: e.cost.items,
        maxDepth: e.cost.maxDepth,
        memoryBudgetBytes: e.cost.memoryBudgetBytes,
      },
      input = { ...e.input, rawBundle: rawBundle() },
      before = structuredClone(e.input),
      run = (l) =>
        createMixedAnalysisRules()[phase === 'validation' ? 'validateObservation' : 'compose'](
          input,
          l,
        );
    assert.deepEqual(run(limits), e.result);
    for (const key of ['maxSerializedBytes', 'maxItems', 'maxDepth', 'memoryBudgetBytes'])
      assert.throws(
        () => run({ ...limits, [key]: limits[key] - 1 }),
        (err) =>
          phase === 'validation'
            ? err.code === 'STAGE_LIMIT_EXCEEDED'
            : ['HISTORY_LIMIT_EXCEEDED', 'RESOURCE_LIMIT_EXCEEDED'].includes(err.code),
        key,
      );
    assert.equal(e.cost.rows, 0);
    for (const key of ['serializedBytes', 'items', 'retainedLogicalBytes'])
      assert.equal(
        e.ledger.reduce((n, s) => n + s[key], 0),
        e.cost[key],
      );
    assert.deepEqual(e.input, before);
  });
for (const phase of ['observed', 'frozen'])
  test('independent active FULL Stage ' + phase + ' complete exact and one-below', async (t) => {
    provenance();
    assert.deepEqual(
      modelActiveFullStage(ref.input, ref.semantic, ref.preparation, ref.raw),
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
          stage = new MixedAnalysisStage(f.db, cap.handle, 'FULL', limits, rules);
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
            validateObservation: 1,
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
  });
test('independent active FULL whole Stage Runtime Provider Store exact and one-below', async (t) => {
  provenance();
  const schema = JSON.parse(fs.readFileSync(ref.schemaSource.path));
  assert.deepEqual(
    modelActiveFullStore(ref.input, ref.semantic, ref.preparation, ref.raw, schema),
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
      stage = new MixedAnalysisStage(f.db, cap.handle, 'FULL', limits, createMixedAnalysisRules());
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
