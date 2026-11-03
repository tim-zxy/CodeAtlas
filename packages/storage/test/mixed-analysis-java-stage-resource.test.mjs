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
import { modelJavaStageBudget } from '../../../fixtures/phase1/mixed-analysis-stage/independent-java-stage-resource-model.mjs';
const ref = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../fixtures/phase1/mixed-analysis-stage/java-stage-resource-reference.json',
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
  for (const phase of ['constructor', 'owner'])
    test(
      'independent Java Stage real callback ' + phase + ' exact and one-below ' + c.id,
      async (t) => {
        assert.equal(sha(c.source.manifestPath), c.source.manifestSha256);
        assert.equal(sha(c.source.assetPath), c.source.assetSha256);
        if (c.historySource) assert.equal(sha(c.historySource.path), c.historySource.sha256);
        assert.deepEqual(
          modelJavaStageBudget(c.input, c.preparation, c.javaRows, c.semantic ?? null),
          c.expected,
        );
        const f = await historyFixture(t, 'available', { seed: false });
        seedLiteral(f.db, c.input);
        const before = allRows(f.db),
          expected = c.expected[phase],
          run = (limits) => {
            const cap = captureActivationContext(f.db, c.input.repositoryId, historyLimits),
              add = HistoryReadBudget.prototype.add,
              real = createMixedAnalysisRules();
            let stage,
              budget,
              calls = 0;
            const forbidden = () => {
                throw Error('unexpected observation/compose callback');
              },
              rules = Object.freeze({
                prepareJavaOwner: (...args) => {
                  calls++;
                  return real.prepareJavaOwner(...args);
                },
                validateObservation: forbidden,
                compose: forbidden,
              });
            HistoryReadBudget.prototype.add = function (...args) {
              if ((new Error().stack.split('\n')[2] ?? '').includes('at new MixedAnalysisStage'))
                budget = this;
              return add.apply(this, args);
            };
            try {
              stage = new MixedAnalysisStage(f.db, cap.handle, 'FULL', limits, rules);
              assert.deepEqual(values(budget), c.expected.constructor.state);
              if (phase === 'owner') {
                const token = stage.prepareOwner(c.javaRows, c.preparation);
                assert.equal(token.stageDigest, c.expected.stageDigest);
                assert.deepEqual(
                  JSON.parse(
                    f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='OWNER'").get()
                      .value_json,
                  ),
                  c.expected.ownerBody,
                );
              }
              assert.equal(calls, phase === 'owner' ? 1 : 0);
              assert.deepEqual(values(budget), expected.state);
              assert.deepEqual(
                f.db
                  .prepare('SELECT key,value_json FROM mixed_stage ORDER BY key')
                  .all()
                  .map((v) => ({ ...v })),
                expected.tempRows,
              );
              const spent = values(budget);
              stage.close();
              assert.deepEqual(values(budget), spent);
            } finally {
              HistoryReadBudget.prototype.add = add;
              if (stage) stage.close();
              assert.ok(calls <= 1);
            }
          };
        run(expected.required);
        for (const key of Object.keys(expected.required))
          assert.throws(
            () => run({ ...expected.required, [key]: expected.required[key] - 1 }),
            (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
            key,
          );
        assert.deepEqual(allRows(f.db), before);
        assert.deepEqual(allRows(f.reopen(true)), before);
      },
    );
