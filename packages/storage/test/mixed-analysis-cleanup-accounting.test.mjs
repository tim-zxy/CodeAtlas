import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HistoryReadBudget,
  HistoryCaptureError,
} from '../dist/analysis/activation-history-format.js';
import { historyLimits } from './helpers/r011-history-fixture.mjs';
import { observationFixture } from './helpers/mixed-analysis-fixture.mjs';
import { allRows, freezeOnConnection } from './helpers/mixed-analysis-store-fixture.mjs';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
function audit(db, failEpoch = false) {
  const prepare = db.prepare,
    add = HistoryReadBudget.prototype.add;
  let initialized = false,
    cleanup = false,
    setupRows = 0,
    cleanupRows = 0,
    cleanupCharges = 0;
  const directConstructorCharges = [],
    queries = [];
  HistoryReadBudget.prototype.add = function (key, n) {
    if (key === 'rows') {
      const caller = new Error().stack.split('\n')[2] ?? '';
      if (caller.includes('at new MixedAnalysisStage')) directConstructorCharges.push(n);
      if (cleanup) cleanupCharges += n;
    }
    return add.call(this, key, n);
  };
  db.prepare = function (sql) {
    const stmt = prepare.call(this, sql),
      get = stmt.get,
      run = stmt.run;
    stmt.get = function (...args) {
      const row = get.apply(this, args),
        n = row === undefined ? 0 : 1;
      if (cleanup) {
        cleanupRows += n;
        queries.push({ sql, rows: n });
      } else if (
        !initialized &&
        (/^SELECT count\(\*\) AS n FROM sqlite_temp_schema WHERE name='mixed_stage'$/.test(sql) ||
          sql === 'PRAGMA temp.schema_version' ||
          sql === 'SELECT total_changes() AS n' ||
          sql === 'PRAGMA data_version')
      )
        setupRows += n;
      if (sql === 'PRAGMA data_version' && !initialized) {
        initialized = true;
        if (failEpoch) cleanup = true;
      }
      if (failEpoch && sql === 'SELECT total_changes() AS n') return { n: 0n };
      return row;
    };
    stmt.run = function (...args) {
      const result = run.apply(this, args);
      if (!initialized && /^INSERT INTO mixed_stage\(/.test(sql)) setupRows++;
      return result;
    };
    return stmt;
  };
  return {
    beginClose() {
      cleanup = true;
    },
    finish() {
      db.prepare = prepare;
      HistoryReadBudget.prototype.add = add;
      const prepaid = directConstructorCharges.slice(1).reduce((n, v) => n + v, 0);
      return {
        physicalSetupRows: setupRows,
        prepaidConstructorRows: prepaid,
        unconsumedConstructorPrepayment: Math.max(0, prepaid - setupRows),
        cleanupDeliveredRows: cleanupRows,
        cleanupNewRowCharges: cleanupCharges,
        fundedCleanupRows: Math.max(0, prepaid - setupRows) + cleanupCharges,
        queries,
        oracle:
          'Independent SQLite returned-row/statement-result audit; candidate add calls are measured actual payment only, never used to generate expected cost or profile.',
      };
    },
  };
}
function record(t, id, value) {
  t.diagnostic(id + ': ' + JSON.stringify(value));
  assert.equal(value.physicalSetupRows, 5);
  assert.equal(value.prepaidConstructorRows, 6);
  assert.equal(value.cleanupNewRowCharges, 0);
  assert.equal(value.cleanupDeliveredRows, 1);
  assert.ok(
    value.fundedCleanupRows >= value.cleanupDeliveredRows,
    'every delivered cleanup SQL row must have budget funding; five constructor charges are already consumed by five setup rows',
  );
}
test('independent SQL audit requires normal Stage close read to be funded', async (t) => {
  const f = await observationFixture(t, 'python-only'),
    before = allRows(f.db),
    a = audit(f.db);
  let value;
  try {
    const frozen = freezeOnConnection(f.db, 'python-only');
    a.beginClose();
    frozen.stage.close();
  } finally {
    value = a.finish();
  }
  assert.deepEqual(allRows(f.db), before);
  assert.deepEqual(allRows(f.reopen(true)), before);
  record(t, 'close', value);
});
test('independent SQL audit requires constructor-failure cleanup read to be funded after all setup charges', async (t) => {
  const f = await observationFixture(t, 'python-only'),
    before = allRows(f.db),
    h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    a = audit(f.db, true);
  let value;
  try {
    assert.throws(
      () =>
        new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, createMixedAnalysisRules()),
      (e) => e.code === 'STAGE_CHANGED',
    );
  } finally {
    value = a.finish();
  }
  assert.deepEqual(allRows(f.db), before);
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM sqlite_temp_schema WHERE name='mixed_stage'").get().n,
    0,
  );
  record(t, 'constructor-failure', value);
});

test('failed DROP consumes first cleanup credit and retry pays once without double charging or automatic retry', async (t) => {
  const f = await observationFixture(t, 'python-only'),
    before = allRows(f.db),
    a = audit(f.db),
    exec = f.db.exec;
  let value,
    attempts = 0;
  try {
    const frozen = freezeOnConnection(f.db, 'python-only');
    a.beginClose();
    f.db.exec = function (sql) {
      if (sql === 'DROP TABLE temp.mixed_stage' && ++attempts === 1)
        throw Error('injected cleanup failure');
      return exec.call(this, sql);
    };
    assert.throws(
      () => frozen.stage.close(),
      (e) => e.code === 'INVALID_STAGE',
    );
    assert.equal(attempts, 1);
    frozen.stage.close();
    frozen.stage.close();
    assert.equal(attempts, 2);
  } finally {
    f.db.exec = exec;
    value = a.finish();
  }
  assert.equal(value.physicalSetupRows, 5);
  assert.equal(value.prepaidConstructorRows, 6);
  assert.equal(value.cleanupDeliveredRows, 2);
  assert.equal(value.cleanupNewRowCharges, 1);
  assert.equal(value.fundedCleanupRows, 2);
  assert.deepEqual(allRows(f.db), before);
});

test('retry funding failure propagates before SQL and leaves owned TEMP for a subsequently funded explicit close', async (t) => {
  const f = await observationFixture(t, 'python-only'),
    before = allRows(f.db),
    prepare = f.db.prepare,
    a = audit(f.db),
    exec = f.db.exec;
  let value,
    attempts = 0,
    add;
  try {
    const frozen = freezeOnConnection(f.db, 'python-only');
    a.beginClose();
    f.db.exec = function (sql) {
      if (sql === 'DROP TABLE temp.mixed_stage' && ++attempts === 1)
        throw Error('injected cleanup failure');
      return exec.call(this, sql);
    };
    assert.throws(
      () => frozen.stage.close(),
      (e) => e.code === 'INVALID_STAGE',
    );
    add = HistoryReadBudget.prototype.add;
    HistoryReadBudget.prototype.add = function (key, n) {
      if (key === 'rows') throw new HistoryCaptureError('HISTORY_LIMIT_EXCEEDED');
      return add.call(this, key, n);
    };
    assert.throws(
      () => frozen.stage.close(),
      (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
    );
    assert.equal(
      prepare.call(f.db, "SELECT count(*) n FROM sqlite_temp_schema WHERE name='mixed_stage'").get()
        .n,
      1,
    );
    assert.equal(attempts, 1);
    HistoryReadBudget.prototype.add = add;
    frozen.stage.close();
    assert.equal(attempts, 2);
  } finally {
    if (add) HistoryReadBudget.prototype.add = add;
    f.db.exec = exec;
    value = a.finish();
  }
  assert.equal(value.cleanupDeliveredRows, 2);
  assert.equal(value.cleanupNewRowCharges, 1);
  assert.deepEqual(allRows(f.db), before);
});

test('constructor reserves setup and cleanup before any TEMP preflight when all six rows leave no capture capacity', async (t) => {
  const f = await observationFixture(t, 'python-only'),
    before = allRows(f.db),
    h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    prepare = f.db.prepare;
  let preflight = 0;
  f.db.prepare = function (sql) {
    if (sql === "SELECT count(*) AS n FROM sqlite_temp_schema WHERE name='mixed_stage'")
      preflight++;
    return prepare.call(this, sql);
  };
  try {
    assert.throws(
      () =>
        new MixedAnalysisStage(
          f.db,
          h.handle,
          'FULL',
          { ...historyLimits, maxRows: 6 },
          createMixedAnalysisRules(),
        ),
      (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
    );
    assert.equal(preflight, 0);
  } finally {
    f.db.prepare = prepare;
  }
  assert.deepEqual(allRows(f.db), before);
});

test('cleanup schema-read SQL failure reports failure and explicit retry funds a new read without dropping uncertain ownership', async (t) => {
  const f = await observationFixture(t, 'python-only'),
    before = allRows(f.db),
    frozen = freezeOnConnection(f.db, 'python-only'),
    prepare = f.db.prepare,
    exec = f.db.exec,
    add = HistoryReadBudget.prototype.add;
  let reads = 0,
    drops = 0,
    charges = 0;
  f.db.prepare = function (sql) {
    const stmt = prepare.call(this, sql);
    if (sql === 'PRAGMA temp.schema_version') {
      const get = stmt.get;
      stmt.get = function (...args) {
        if (++reads === 1) throw Error('injected schema read failure');
        return get.apply(this, args);
      };
    }
    return stmt;
  };
  f.db.exec = function (sql) {
    if (sql === 'DROP TABLE temp.mixed_stage') drops++;
    return exec.call(this, sql);
  };
  HistoryReadBudget.prototype.add = function (key, n) {
    if (key === 'rows' && (new Error().stack.split('\n')[2] ?? '').includes('liveTable'))
      charges += n;
    return add.call(this, key, n);
  };
  try {
    assert.throws(
      () => frozen.stage.close(),
      (e) => e.code === 'INVALID_STAGE',
    );
    assert.equal(drops, 0);
    assert.equal(
      prepare.call(f.db, "SELECT count(*) n FROM sqlite_temp_schema WHERE name='mixed_stage'").get()
        .n,
      1,
    );
    frozen.stage.close();
    frozen.stage.close();
    assert.equal(reads, 2);
    assert.equal(drops, 1);
    assert.equal(charges, 1);
  } finally {
    f.db.prepare = prepare;
    f.db.exec = exec;
    HistoryReadBudget.prototype.add = add;
  }
  assert.deepEqual(allRows(f.db), before);
});
