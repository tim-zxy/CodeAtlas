import assert from 'node:assert/strict';
import test from 'node:test';
import * as api from '../dist/analysis/mixed-analysis-stage.js';
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';
import { observationFixture } from './helpers/mixed-analysis-fixture.mjs';
import { stageOnConnection } from './helpers/mixed-analysis-store-fixture.mjs';
import { MixedAnalysisStore } from '../dist/analysis/mixed-analysis-store.js';
const code = (c) => (e) => e.code === c;
async function setup(t) {
  const f = await observationFixture(t, 'mixed'),
    original = HistoryReadBudget.prototype.add;
  let budget;
  HistoryReadBudget.prototype.add = function (...args) {
    budget = this;
    return original.apply(this, args);
  };
  let ctx;
  try {
    ctx = stageOnConnection(f.db, 'mixed');
  } finally {
    HistoryReadBudget.prototype.add = original;
  }
  t.after(() => {
    try {
      ctx.stage.close();
    } catch {}
  });
  const signal = new AbortController().signal;
  return {
    ...f,
    ...ctx,
    budget,
    control: { signal, deadlineEpochMs: Date.now() + 60000, maxInputBytes: 88 },
  };
}
test('AR Stage account API is private and present', async () => {
  assert.equal(typeof api.borrowMixedSourceAccount, 'function');
  assert.equal((await import('../dist/index.js')).borrowMixedSourceAccount, undefined);
});
test('AR Source account adds to a nonzero existing Stage ledger', async (t) => {
  const f = await setup(t),
    a = api.borrowMixedSourceAccount(f.stage, f.control),
    b = f.budget;
  assert.ok(b.rows > 0);
  assert.ok(b.items > 0);
  const before = {
    bytes: b.serializedBytes,
    items: b.items,
    memory: b.retainedLogicalBytes,
    rows: b.rows,
  };
  a.own({ n: 'abc' });
  a.reserveBuffer(2);
  a.readBytes(5);
  a.visitItem();
  assert.equal(b.serializedBytes, before.bytes + 5);
  assert.equal(b.items, before.items + 3);
  assert.equal(b.retainedLogicalBytes, before.memory + 6);
  assert.equal(b.rows, before.rows);
});
test('AR reborrow never resets input allowance', async (t) => {
  const f = await setup(t),
    a = api.borrowMixedSourceAccount(f.stage, { ...f.control, maxInputBytes: 5 });
  a.readBytes(5);
  const b = api.borrowMixedSourceAccount(f.stage, { ...f.control, maxInputBytes: 88 });
  const prior = f.budget.serializedBytes;
  assert.throws(() => b.readBytes(1), code('STAGE_LIMIT_EXCEEDED'));
  assert.equal(f.budget.serializedBytes, prior);
  assert.throws(() => a.checkpoint(), code('STAGE_RELEASED'));
});
test('AR reborrow may tighten and never replace the signal', async (t) => {
  const f = await setup(t);
  api.borrowMixedSourceAccount(f.stage, f.control);
  assert.throws(
    () =>
      api.borrowMixedSourceAccount(f.stage, { ...f.control, signal: new AbortController().signal }),
    code('INVALID_STAGE'),
  );
});
for (const kind of ['bytes', 'memory', 'overflow', 'negative'])
  test('AR ' + kind + ' exhaustion preserves the spent prefix', async (t) => {
    const f = await setup(t),
      a = api.borrowMixedSourceAccount(f.stage, {
        ...f.control,
        maxInputBytes: Number.MAX_SAFE_INTEGER,
      });
    a.readBytes(7);
    const before = f.budget.serializedBytes;
    const action =
      kind === 'memory'
        ? () => a.reserveBuffer(Number.MAX_SAFE_INTEGER)
        : kind === 'negative'
          ? () => a.readBytes(-1)
          : () => a.readBytes(Number.MAX_SAFE_INTEGER);
    assert.throws(action, code('STAGE_LIMIT_EXCEEDED'));
    assert.equal(f.budget.serializedBytes, before);
    assert.throws(() => a.visitItem(), code('STAGE_RELEASED'));
  });
test('AR cancellation is a typed permanent refusal', async (t) => {
  const f = await setup(t),
    c = new AbortController(),
    a = api.borrowMixedSourceAccount(f.stage, { ...f.control, signal: c.signal });
  a.readBytes(3);
  c.abort();
  assert.throws(() => a.checkpoint(), code('CANCELLED'));
  assert.throws(() => f.stage.freeze(), code('STAGE_RELEASED'));
});
test('AR tighter deadline is shared by an earlier account', async (t) => {
  const f = await setup(t),
    a = api.borrowMixedSourceAccount(f.stage, f.control);
  assert.throws(
    () => api.borrowMixedSourceAccount(f.stage, { ...f.control, deadlineEpochMs: 1 }),
    code('DEADLINE_EXCEEDED'),
  );
  assert.throws(() => a.checkpoint(), code('STAGE_RELEASED'));
});
test('AR invalidate and close revoke every borrowed account', async (t) => {
  const f = await setup(t),
    a = api.borrowMixedSourceAccount(f.stage, f.control);
  a.invalidate();
  assert.throws(() => a.checkpoint(), code('STAGE_RELEASED'));
  f.stage.close();
  assert.throws(() => a.readBytes(0), code('STAGE_RELEASED'));
});
test('AR frozen Stage accepts charges and Store imports them without losing cleanup credit', async (t) => {
  const f = await setup(t),
    owner = f.stage.prepareOwner(f.javaRows, f.preparation);
  f.stage.acceptObservation(owner.ownerHandle, f.observationForOwner(owner));
  const token = f.stage.freeze();
  const a = api.borrowMixedSourceAccount(f.stage, f.control);
  a.readBytes(88);
  const previous = f.budget.serializedBytes,
    add = HistoryReadBudget.prototype.add;
  let imported = false;
  HistoryReadBudget.prototype.add = function (key, n) {
    if (key === 'serializedBytes' && n === previous) imported = true;
    return add.call(this, key, n);
  };
  let id;
  try {
    id = new MixedAnalysisStore(f.db).apply(token.lease, f.budget.limits);
  } finally {
    HistoryReadBudget.prototype.add = add;
  }
  assert.match(id, /^activation:/);
  assert.equal(imported, true);
  assert.throws(() => a.checkpoint(), code('STAGE_RELEASED'));
});

for (const cap of [88, 87])
  test('AR exact and one-below Source input cap ' + cap, async (t) => {
    const f = await setup(t),
      a = api.borrowMixedSourceAccount(f.stage, { ...f.control, maxInputBytes: cap });
    const prior = f.budget.serializedBytes;
    if (cap === 88) {
      a.readBytes(88);
      assert.equal(f.budget.serializedBytes, prior + 88);
    } else {
      assert.throws(() => a.readBytes(88), code('STAGE_LIMIT_EXCEEDED'));
      assert.equal(f.budget.serializedBytes, prior);
    }
  });
test('AR actual file failure invalidates a real Stage without changing persistent rows', async (t) => {
  const fs = await import('node:fs/promises'),
    path = await import('node:path'),
    os = await import('node:os');
  const verify = await import('../../source/dist/mixed-source-verification.js'),
    { allRows } = await import('./helpers/mixed-analysis-store-fixture.mjs');
  const f = await setup(t),
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'codeatlas-ar-adapter-'));
  t.after(async () => {
    assert.equal(path.dirname(root), os.tmpdir());
    await fs.rm(root, { recursive: true, force: true });
  });
  const file = f.metadata.inventory[0];
  await fs.mkdir(path.dirname(path.join(root, file.path)), { recursive: true });
  await fs.writeFile(path.join(root, file.path), 'known wrong bytes');
  const before = allRows(f.db),
    a = api.borrowMixedSourceAccount(f.stage, f.control);
  await assert.rejects(
    verify.verifyMixedSourceFiles({ rootPath: root, files: [file], removedPaths: [] }, a),
    code('SOURCE_CHANGED'),
  );
  assert.throws(() => f.stage.freeze(), code('STAGE_RELEASED'));
  assert.deepEqual(allRows(f.db), before);
});

test('AR Source accounting cannot begin inside a caller transaction', async (t) => {
  const f = await setup(t);
  f.db.exec('BEGIN');
  try {
    assert.throws(() => api.borrowMixedSourceAccount(f.stage, f.control), code('INVALID_STAGE'));
  } finally {
    f.db.exec('ROLLBACK');
  }
});

let preludeAPI = {};
try {
  preludeAPI = await import('../dist/analysis/mixed-source-account.js');
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const a2Recipe = JSON.parse(
  (await import('node:fs')).readFileSync(
    new URL(
      '../../../fixtures/phase1/mixed-runtime-readiness/source-integration/expected.json',
      import.meta.url,
    ),
    'utf8',
  ),
).prelude;
test('A2 prelude creates a real shared budget with independent exact Source charges', () => {
  assert.equal(typeof preludeAPI.beginMixedSourceAccount, 'function');
  const limits = {
    maxRows: 100,
    maxSerializedBytes: 10000,
    maxItems: 1000,
    maxDepth: 100,
    memoryBudgetBytes: 10000,
  };
  const p = preludeAPI.beginMixedSourceAccount(limits, {
    signal: new AbortController().signal,
    deadlineEpochMs: Date.now() + 60000,
    maxInputBytes: 5,
  });
  const before = {
    bytes: p.budget.serializedBytes,
    items: p.budget.items,
    memory: p.budget.retainedLogicalBytes,
  };
  p.account.own(a2Recipe.metadata);
  p.account.reserveBuffer(a2Recipe.bufferCharge);
  p.account.readBytes(a2Recipe.readCharge);
  p.account.visitItem();
  assert.equal(p.budget.serializedBytes, before.bytes + a2Recipe.serializedDelta);
  assert.equal(p.budget.items, before.items + a2Recipe.itemsDelta);
  assert.equal(p.budget.retainedLogicalBytes, before.memory + a2Recipe.retainedDelta);
  assert.throws(() => p.account.readBytes(1), code('STAGE_LIMIT_EXCEEDED'));
  assert.throws(() => p.account.checkpoint(), code('STAGE_RELEASED'));
});
test('A2 Stage adopts the same prelude budget and closes earlier account with Store', async (t) => {
  const f = await setup(t);
  f.stage.close();
  const { captureActivationContext } = await import('../dist/analysis/activation-history.js');
  const { createMixedAnalysisRules } = await import('../../runtime/dist/mixed-analysis.js');
  const p = preludeAPI.beginMixedSourceAccount(f.budget.limits, {
    ...f.control,
    maxInputBytes: 100,
  });
  p.account.readBytes(5);
  const capture = captureActivationContext(f.db, f.input.repositoryId, f.budget.limits);
  const stage = new api.MixedAnalysisStage(
    f.db,
    capture.handle,
    'FULL',
    f.budget.limits,
    createMixedAnalysisRules(),
    p.budget,
  );
  t.after(() => {
    try {
      stage.close();
    } catch {}
  });
  assert.ok(p.budget.rows > 0);
  assert.ok(p.budget.serializedBytes > 5);
  const after = p.budget.serializedBytes;
  const account = api.borrowMixedSourceAccount(stage, { ...f.control, maxInputBytes: 6 });
  account.readBytes(1);
  assert.equal(p.budget.serializedBytes, after + 1);
  assert.throws(() => p.account.readBytes(1), code('STAGE_LIMIT_EXCEEDED'));
  assert.throws(() => stage.freeze(), code('STAGE_RELEASED'));
});
test('A2 exhausted prelude refuses Stage before TEMP allocation', async (t) => {
  const f = await setup(t);
  f.stage.close();
  const { captureActivationContext } = await import('../dist/analysis/activation-history.js');
  const { createMixedAnalysisRules } = await import('../../runtime/dist/mixed-analysis.js');
  const h = captureActivationContext(f.db, f.input.repositoryId, f.budget.limits);
  const p = preludeAPI.beginMixedSourceAccount(f.budget.limits, f.control);
  p.budget.add('rows', p.budget.limits.maxRows - 6);
  assert.throws(
    () =>
      new api.MixedAnalysisStage(
        f.db,
        h.handle,
        'FULL',
        f.budget.limits,
        createMixedAnalysisRules(),
        p.budget,
      ),
  );
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM sqlite_temp_schema WHERE name='mixed_stage'").get().n,
    0,
  );
  assert.throws(() => p.account.checkpoint(), code('STAGE_RELEASED'));
});
test('A2 consumed Stage revokes prelude account after real Store apply', async (t) => {
  const f = await setup(t);
  f.stage.close();
  const { captureActivationContext } = await import('../dist/analysis/activation-history.js');
  const { createMixedAnalysisRules } = await import('../../runtime/dist/mixed-analysis.js');
  const p = preludeAPI.beginMixedSourceAccount(f.budget.limits, f.control);
  p.account.readBytes(5);
  const h = captureActivationContext(f.db, f.input.repositoryId, f.budget.limits);
  const stage = new api.MixedAnalysisStage(
    f.db,
    h.handle,
    'FULL',
    f.budget.limits,
    createMixedAnalysisRules(),
    p.budget,
  );
  t.after(() => {
    try {
      stage.close();
    } catch {}
  });
  const o = stage.prepareOwner(f.javaRows, f.preparation);
  stage.acceptObservation(o.ownerHandle, f.observationForOwner(o));
  const token = stage.freeze();
  p.account.readBytes(1);
  const previous = p.budget.serializedBytes,
    original = HistoryReadBudget.prototype.add;
  let imported = false;
  HistoryReadBudget.prototype.add = function (k, n) {
    if (k === 'serializedBytes' && n === previous) imported = true;
    return original.call(this, k, n);
  };
  try {
    assert.match(new MixedAnalysisStore(f.db).apply(token.lease, f.budget.limits), /^activation:/);
  } finally {
    HistoryReadBudget.prototype.add = original;
  }
  assert.equal(imported, true);
  assert.throws(() => p.account.checkpoint(), code('STAGE_RELEASED'));
});
