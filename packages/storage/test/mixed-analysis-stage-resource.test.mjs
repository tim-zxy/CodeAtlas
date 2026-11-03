import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { historyFixture, seedLiteral, historyLimits } from './helpers/r011-history-fixture.mjs';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
const ref = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../fixtures/phase1/mixed-analysis-stage/zero-stage-resource-reference.json',
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
  });
for (const c of ref.cases)
  test(
    'independent cumulative zero-unit Stage constructor owner and prepaid close exact and one-below ' +
      c.id,
    async (t) => {
      assert.equal(sha(c.source.path), c.source.sha256);
      assert.equal(sha(ref.preparationSource.path), ref.preparationSource.sha256);
      const f = await historyFixture(t, 'available', { seed: false });
      seedLiteral(f.db, c.input);
      const before = allRows(f.db);
      for (const phase of ['constructor', 'owner']) {
        const expected = c.expected[phase],
          run = (l) => {
            const h = captureActivationContext(f.db, c.input.repositoryId, historyLimits),
              add = HistoryReadBudget.prototype.add;
            let budget, stage;
            HistoryReadBudget.prototype.add = function (...args) {
              if ((new Error().stack.split('\n')[2] ?? '').includes('at new MixedAnalysisStage'))
                budget = this;
              return add.apply(this, args);
            };
            try {
              stage = new MixedAnalysisStage(f.db, h.handle, 'FULL', l, createMixedAnalysisRules());
              assert.ok(budget);
              assert.deepEqual(values(budget), c.expected.constructor.state);
              if (phase === 'owner') {
                const owner = stage.prepareOwner(null, c.preparation);
                assert.equal(owner.stageDigest, c.expected.stageDigest);
                assert.deepEqual(
                  JSON.parse(
                    f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='OWNER'").get()
                      .value_json,
                  ),
                  c.expected.ownerBody,
                );
              }
              assert.deepEqual(values(budget), expected.state);
              assert.deepEqual(
                f.db
                  .prepare('SELECT key,value_json FROM mixed_stage ORDER BY key')
                  .all()
                  .map((r) => ({ ...r })),
                expected.tempRows,
              );
              const state = values(budget);
              stage.close();
              assert.deepEqual(values(budget), state);
              assert.equal(
                f.db
                  .prepare("SELECT count(*) n FROM sqlite_temp_schema WHERE name='mixed_stage'")
                  .get().n,
                0,
              );
            } finally {
              HistoryReadBudget.prototype.add = add;
              if (stage) stage.close();
            }
          };
        run(expected.required);
        for (const key of Object.keys(expected.required))
          assert.throws(
            () => run({ ...expected.required, [key]: expected.required[key] - 1 }),
            (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
            phase + ' ' + key,
          );
      }
      assert.equal(f.db.isTransaction, false);
      assert.deepEqual(allRows(f.db), before);
      assert.deepEqual(allRows(f.reopen(true)), before);
    },
  );
