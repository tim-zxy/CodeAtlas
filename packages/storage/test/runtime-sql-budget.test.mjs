import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';
import { runtimeSql } from '../dist/runtime/runtime-sql.js';
test('new SQL paths prepay actual rows/TEXT and refuse before materialization or mutation', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE runtime_budget_probe(id TEXT,payload TEXT) STRICT');
    const id = 'r',
      payload = '甲🙂',
      bytes = Buffer.byteLength(id) + Buffer.byteLength(payload);
    db.prepare('INSERT INTO runtime_budget_probe VALUES(?,?)').run(id, payload);
    const limits = {
      maxRows: Number.MAX_SAFE_INTEGER,
      maxSerializedBytes: Number.MAX_SAFE_INTEGER,
      maxItems: Number.MAX_SAFE_INTEGER,
      maxDepth: Number.MAX_SAFE_INTEGER,
      memoryBudgetBytes: Number.MAX_SAFE_INTEGER,
    };
    const prepare = db.prepare.bind(db),
      queries = [];
    db.prepare = (sql) => {
      queries.push(sql);
      return prepare(sql);
    };
    for (const cap of [
      { maxRows: 1 },
      { maxSerializedBytes: bytes - 1 },
      { memoryBudgetBytes: 2 * bytes - 1 },
    ]) {
      queries.length = 0;
      const budget = new HistoryReadBudget({ ...limits, ...cap });
      assert.throws(
        () => runtimeSql(db, budget).read('runtime_budget_probe', ['id', 'payload'], '1', []),
        (e) => e.code === 'HISTORY_LIMIT_EXCEEDED',
      );
      assert.equal(queries.length, 1);
      assert.match(queries[0], /^SELECT count/);
    }
    queries.length = 0;
    const exact = new HistoryReadBudget({
      ...limits,
      maxRows: 2,
      maxSerializedBytes: bytes,
      memoryBudgetBytes: 2 * bytes,
    });
    const rows = runtimeSql(db, exact).read('runtime_budget_probe', ['id', 'payload'], '1', []);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].payload, payload);
    assert.equal(queries.length, 2);
    assert.equal(exact.rows, 2);
    assert.equal(exact.serializedBytes, bytes);
    assert.equal(exact.retainedLogicalBytes, bytes);
    queries.length = 0;
    const write = new HistoryReadBudget({ ...limits, maxSerializedBytes: bytes - 1 });
    assert.throws(
      () =>
        runtimeSql(db, write).run('INSERT INTO runtime_budget_probe VALUES(?,?)', [id, payload]),
      (e) => e.code === 'HISTORY_LIMIT_EXCEEDED',
    );
    assert.equal(queries.length, 0);
    assert.equal(prepare('SELECT count(*) n FROM runtime_budget_probe').get().n, 1);
  } finally {
    db.close();
  }
});
