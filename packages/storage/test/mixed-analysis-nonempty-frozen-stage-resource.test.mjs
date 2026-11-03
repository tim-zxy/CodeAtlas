import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { historyCanonical as C } from '../../../fixtures/phase1/mixed-analysis-stage/independent-history-resource-model.mjs';
import { historyFixture, seedLiteral, historyLimits } from './helpers/r011-history-fixture.mjs';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
import { modelNonemptyFrozenStage } from '../../../fixtures/phase1/mixed-analysis-stage/independent-nonempty-frozen-stage-resource-model.mjs';
import { readComponentReference as read } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
const ref = JSON.parse(
    fs.readFileSync(
      'fixtures/phase1/mixed-analysis-stage/nonempty-frozen-stage-resource-reference.json',
    ),
  ),
  sha = (v) => crypto.createHash('sha256').update(v).digest('hex'),
  values = (b) => ({
    rows: b.rows,
    serializedBytes: b.serializedBytes,
    items: b.items,
    retainedLogicalBytes: b.retainedLogicalBytes,
  });
for (const c of ref.cases)
  for (const phase of ['observed', 'frozen'])
    test(
      'independent nonempty Stage complete ' + phase + ' exact and one-below ' + c.id,
      async (t) => {
        for (const s of [
          { path: ref.sourcePath, sha256: ref.sourceSha256 },
          { path: ref.manifestPath, sha256: ref.manifestSha256 },
          { path: ref.modelPath, sha256: ref.modelSha256 },
          { path: c.source.assetPath, sha256: c.source.assetSha256 },
        ])
          assert.equal(sha(fs.readFileSync(s.path)), s.sha256);
        assert.equal(sha(read(c.source.path)), c.source.sha256);
        const old = JSON.parse(read(c.source.path));
        assert.deepEqual(c.input, old.input);
        assert.deepEqual(c.preparation, old.preparation);
        assert.deepEqual(c.javaRows, old.javaRows);
        assert.deepEqual(c.expected.ownerBody, old.expected.body);
        assert.equal(c.expected.stageDigest, old.expected.stageDigest);
        assert.deepEqual(
          modelNonemptyFrozenStage(c.input, c.preparation, c.javaRows, c.raw),
          c.expected,
        );
        const f = await historyFixture(t, 'available', { seed: false });
        seedLiteral(f.db, c.input);
        const before = allRows(f.db),
          run = (limits) => {
            const cap = captureActivationContext(f.db, c.input.repositoryId, historyLimits),
              add = HistoryReadBudget.prototype.add,
              real = createMixedAnalysisRules(),
              calls = { prepareJavaOwner: 0, validateObservation: 0, compose: 0 };
            let stage, b;
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
              assert.deepEqual(values(b), c.expected.constructor.state);
              const token = stage.prepareOwner(c.javaRows, c.preparation);
              assert.equal(token.stageDigest, c.expected.stageDigest);
              assert.deepEqual(values(b), c.expected.owner.state);
              stage.acceptObservation(token.ownerHandle, {
                metadata: c.raw.metadata,
                requestBytes: Buffer.from(c.raw.requestText),
                outputBytes: Buffer.from(c.raw.outputText),
              });
              assert.deepEqual(values(b), c.expected.observed.state, 'complete OBSERVED ledger');
              if (phase === 'frozen') {
                const result = stage.freeze();
                assert.deepEqual(result.basis, c.expected.result.basis);
                assert.deepEqual(values(b), c.expected.frozen.state, 'complete FROZEN ledger');
                assert.deepEqual(
                  JSON.parse(
                    f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='FROZEN'").get()
                      .value_json,
                  ),
                  c.expected.result,
                );
              }
              const temp = f.db
                .prepare('SELECT key,value_json FROM mixed_stage ORDER BY rowid')
                .all()
                .map((v) => ({ ...v }));
              assert.deepEqual(temp, c.expected[phase].tempRows);
              if (phase === 'frozen')
                assert.equal(
                  sha(Buffer.from(C(temp.map((r) => [r.key, r.value_json])))),
                  c.expected.seal,
                );
              assert.deepEqual(calls, {
                prepareJavaOwner: c.javaRows === null ? 0 : 1,
                validateObservation: 1,
                compose: phase === 'frozen' ? 1 : 0,
              });
              const spent = values(b);
              stage.close();
              assert.deepEqual(values(b), spent, 'first cleanup prepaid');
            } finally {
              HistoryReadBudget.prototype.add = add;
              if (stage) stage.close();
            }
          };
        run(c.expected[phase].required);
        for (const key of Object.keys(c.expected[phase].required))
          assert.throws(
            () =>
              run({ ...c.expected[phase].required, [key]: c.expected[phase].required[key] - 1 }),
            (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
            key,
          );
        assert.deepEqual(allRows(f.db), before);
        assert.deepEqual(allRows(f.reopen(true)), before);
      },
    );
