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
        '../../../fixtures/phase1/mixed-analysis-stage/zero-frozen-stage-resource-reference.json',
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
    'independent complete zero-unit Stage real Runtime freeze exact and one-below ' + c.id,
    async (t) => {
      assert.equal(sha(c.source.path), c.source.sha256);
      assert.equal(sha(c.stageSource.path), c.stageSource.sha256);
      const f = await historyFixture(t, 'available', { seed: false });
      seedLiteral(f.db, c.input);
      const before = allRows(f.db),
        run = (limits) => {
          const h = captureActivationContext(f.db, c.input.repositoryId, historyLimits),
            add = HistoryReadBudget.prototype.add;
          let b, stage;
          HistoryReadBudget.prototype.add = function (...args) {
            if ((new Error().stack.split('\n')[2] ?? '').includes('at new MixedAnalysisStage'))
              b = this;
            return add.apply(this, args);
          };
          try {
            stage = new MixedAnalysisStage(
              f.db,
              h.handle,
              'FULL',
              limits,
              createMixedAnalysisRules(),
            );
            const owner = stage.prepareOwner(null, c.preparation);
            assert.equal(owner.stageDigest, c.expected.stageDigest);
            stage.acceptObservation(owner.ownerHandle, {
              metadata: c.raw.metadata,
              requestBytes: Buffer.from(c.raw.requestText),
              outputBytes: Buffer.from(c.raw.outputText),
            });
            assert.deepEqual(
              values(b),
              c.expected.observed.state,
              'OBSERVED complete independent cost',
            );
            const token = stage.freeze();
            assert.deepEqual(token.basis, c.expected.result.basis);
            assert.deepEqual(
              values(b),
              c.expected.frozen.state,
              'FROZEN complete independent cost',
            );
            assert.deepEqual(
              JSON.parse(
                f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='FROZEN'").get()
                  .value_json,
              ),
              c.expected.result,
            );
            assert.deepEqual(
              f.db
                .prepare('SELECT key,value_json FROM mixed_stage ORDER BY rowid')
                .all()
                .map((v) => ({ ...v })),
              c.expected.frozen.tempRows,
            );
            const final = values(b);
            stage.close();
            assert.deepEqual(values(b), final);
            return token;
          } finally {
            HistoryReadBudget.prototype.add = add;
            if (stage) stage.close();
          }
        };
      run(c.expected.frozen.required);
      for (const key of Object.keys(c.expected.frozen.required))
        assert.throws(
          () => run({ ...c.expected.frozen.required, [key]: c.expected.frozen.required[key] - 1 }),
          (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
          key,
        );
      assert.deepEqual(allRows(f.db), before);
      assert.deepEqual(allRows(f.reopen(true)), before);
    },
  );
