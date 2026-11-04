import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { historyFixture, seedLiteral, historyLimits } from './helpers/r011-history-fixture.mjs';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import readMixed, {
  captureActivationContext,
  recheckMixedAnalysisCaptureLocked,
} from '../dist/analysis/activation-history.js';
const ref = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../fixtures/phase1/mixed-analysis-stage/nonempty-history-read-resource-reference.json',
        import.meta.url,
      ),
    ),
  ),
  sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),
  plain = (v) => JSON.parse(JSON.stringify(v));
for (const c of ref.cases)
  test(
    'independent nonempty H1 cumulative detailed read exact and one-below ' + c.id,
    async (t) => {
      assert.equal(sha(c.source.path), c.source.sha256);
      const f = await historyFixture(t, 'available', { seed: false });
      seedLiteral(f.db, c.input);
      const before = allRows(f.db);
      for (const which of ['first', 'second']) {
        const target = c[which],
          limits = target.required,
          run = (l, locked = false) => {
            const cap = captureActivationContext(f.db, c.input.repositoryId, historyLimits);
            assert.deepEqual(cap.view, c.basic.view);
            if (which === 'second')
              assert.deepEqual(
                plain(readMixed(f.db, cap.handle, c.first.required)),
                c.first.result,
              );
            if (locked) {
              f.db.exec('BEGIN');
              try {
                return recheckMixedAnalysisCaptureLocked(f.db, cap.handle, l);
              } finally {
                f.db.exec('ROLLBACK');
              }
            }
            return readMixed(f.db, cap.handle, l);
          };
        assert.deepEqual(plain(run(limits)), target.result);
        assert.deepEqual(plain(run(limits, true)), target.result);
        for (const key of Object.keys(limits))
          assert.throws(
            () => run({ ...limits, [key]: limits[key] - 1 }),
            (e) => e.code === 'HISTORY_LIMIT_EXCEEDED',
            which + ' ' + key,
          );
      }
      for (const key of Object.keys(c.basic.required)) {
        const l = { ...c.basic.required, [key]: c.basic.required[key] - 1 };
        assert.throws(
          () => captureActivationContext(f.db, c.input.repositoryId, l),
          (e) => e.code === 'HISTORY_LIMIT_EXCEEDED',
          'basic ' + key,
        );
      }
      assert.deepEqual(
        captureActivationContext(f.reopen(true), c.input.repositoryId, c.basic.required).view,
        c.basic.view,
      );
      assert.equal(f.db.isTransaction, false);
      assert.deepEqual(allRows(f.db), before);
      assert.deepEqual(allRows(f.reopen(true)), before);
    },
  );
