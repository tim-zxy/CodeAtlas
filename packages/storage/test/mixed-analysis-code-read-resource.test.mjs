import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { historyFixture, seedLiteral } from './helpers/r011-history-fixture.mjs';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import { readCodeContextSnapshot } from '../dist/analysis/code-context-read.js';
const ref = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../fixtures/phase1/mixed-analysis-stage/zero-code-read-resource-reference.json',
        import.meta.url,
      ),
    ),
  ),
  sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for (const c of ref.cases)
  test(
    'independent complete zero-fact Code SQL read resource exact and one-below ' + c.id,
    async (t) => {
      assert.equal(sha(c.source.path), c.source.sha256);
      const f = await historyFixture(t, 'available', { seed: false });
      seedLiteral(f.db, c.input);
      const before = allRows(f.db),
        limits = c.expected.required,
        run = (db, l) => {
          db.exec('BEGIN');
          try {
            return readCodeContextSnapshot(
              db,
              c.input.repositoryId,
              {
                maxRows: l.maxRows,
                maxSerializedBytes: l.maxSerializedBytes,
                memoryBudgetBytes: l.memoryBudgetBytes,
              },
              { schemaVersion: 11, maxItems: l.maxItems, maxDepth: l.maxDepth },
            );
          } finally {
            db.exec('ROLLBACK');
          }
        };
      const observed = run(f.db, limits);
      for (const key of ['view', 'entries', 'consumed', 'retainedLogicalBytes'])
        assert.deepEqual(observed[key], c.expected[key], key);
      for (const key of Object.keys(limits))
        assert.throws(
          () => run(f.db, { ...limits, [key]: limits[key] - 1 }),
          (e) => e.code === 'CODE_CAPTURE_LIMIT_EXCEEDED',
          key,
        );
      assert.equal(f.db.isTransaction, false);
      assert.deepEqual(allRows(f.db), before);
      assert.deepEqual(allRows(f.reopen(true)), before);
      assert.deepEqual(run(f.reopen(true), limits), observed);
    },
  );
