import { readComponentReference } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { historyFixture, historyLimits, persistentRows } from './helpers/r011-history-fixture.mjs';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
const port = Object.freeze({
  prepareJavaOwner() {
    throw Error('unexpected Java preparation');
  },
  validateObservation() {
    throw Error('unexpected raw validation');
  },
  compose() {
    throw Error('constructor must not compose');
  },
});
const api = async () => {
  const u = new URL('../dist/analysis/mixed-analysis-stage.js', import.meta.url);
  assert.ok(fs.existsSync(u), 'Stage implementation must exist');
  return import(u.href);
};
test('owned Stage constructor/close preserves persistent rows and owns only its TEMP table', async (t) => {
  const { MixedAnalysisStage } = await api(),
    f = await historyFixture(t, 'syntax-ancestor'),
    before = persistentRows(f.db),
    h = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  f.db.exec('CREATE TEMP TABLE unrelated(value TEXT)');
  f.db.exec("INSERT INTO unrelated VALUES('preserve')");
  const stage = new MixedAnalysisStage(f.db, h.handle, 'DELTA', historyLimits, port);
  assert.deepEqual(Object.keys(stage), []);
  assert.deepEqual(persistentRows(f.db), before);
  assert.equal(
    f.db
      .prepare(
        "SELECT count(*) n FROM sqlite_temp_schema WHERE type='table' AND name='mixed_stage'",
      )
      .get().n,
    1,
  );
  stage.close();
  stage.close();
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM sqlite_temp_schema WHERE name='mixed_stage'").get().n,
    0,
  );
  assert.equal(f.db.prepare('SELECT value FROM unrelated').get().value, 'preserve');
  assert.deepEqual(persistentRows(f.db), before);
});
test('second Stage and pre-existing mixed TEMP table cannot steal ownership', async (t) => {
  const { MixedAnalysisStage } = await api(),
    f = await historyFixture(t, 'available'),
    h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    s = new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, port);
  assert.throws(
    () => new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, port),
    (e) => e.code === 'INVALID_STAGE',
  );
  s.close();
  const fresh = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  f.db.exec('CREATE TEMP TABLE mixed_stage(value TEXT)');
  f.db.exec("INSERT INTO mixed_stage VALUES('foreign')");
  assert.throws(
    () => new MixedAnalysisStage(f.db, fresh.handle, 'FULL', historyLimits, port),
    (e) => e.code === 'INVALID_STAGE',
  );
  assert.equal(f.db.prepare('SELECT value FROM mixed_stage').get().value, 'foreign');
});
test('Stage rejects clone/cross-database handles, unsafe port/mode and ambient caller transaction', async (t) => {
  const { MixedAnalysisStage } = await api(),
    f = await historyFixture(t, 'available'),
    g = await historyFixture(t, 'available'),
    h = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  for (const [db, handle, mode, rules] of [
    [f.db, {}, 'FULL', port],
    [g.db, h.handle, 'FULL', port],
    [f.db, h.handle, 'NO_OP', port],
    [f.db, h.handle, 'FULL', { compose() {} }],
  ])
    assert.throws(
      () => new MixedAnalysisStage(db, handle, mode, historyLimits, rules),
      (e) => e.message === e.code,
    );
  f.db.exec('BEGIN');
  assert.throws(
    () => new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, port),
    (e) => e.code === 'INVALID_STAGE',
  );
  assert.equal(f.db.isTransaction, true);
  f.db.exec('ROLLBACK');
  assert.throws(
    () => MixedAnalysisStage.prototype.close.call({}),
    (e) => e.code === 'INVALID_STAGE',
  );
});
test('close cannot drop a recreated TEMP table or one on a reopened connection', async (t) => {
  const { MixedAnalysisStage } = await api(),
    f = await historyFixture(t, 'available'),
    h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    s = new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, port);
  f.db.exec('DROP TABLE mixed_stage');
  f.db.exec('CREATE TEMP TABLE mixed_stage(value TEXT)');
  f.db.exec("INSERT INTO mixed_stage VALUES('replacement')");
  s.close();
  assert.equal(f.db.prepare('SELECT value FROM mixed_stage').get().value, 'replacement');
  const g = await historyFixture(t, 'available'),
    j = captureActivationContext(g.db, g.input.repositoryId, historyLimits),
    r = new MixedAnalysisStage(g.db, j.handle, 'FULL', historyLimits, port);
  g.db.close();
  g.db.open();
  g.db.exec('CREATE TEMP TABLE mixed_stage(value TEXT)');
  g.db.exec("INSERT INTO mixed_stage VALUES('reopened')");
  r.close();
  assert.equal(g.db.prepare('SELECT value FROM mixed_stage').get().value, 'reopened');
});

test('Stage constructor rejects proxy database and asynchronous/proxy rules without invoking traps', async (t) => {
  const { MixedAnalysisStage } = await api(),
    f = await historyFixture(t, 'available'),
    h = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  let calls = 0;
  const db = new Proxy(f.db, {
    getPrototypeOf() {
      calls++;
      return Object.getPrototypeOf(f.db);
    },
  });
  assert.throws(
    () => new MixedAnalysisStage(db, h.handle, 'FULL', historyLimits, port),
    (e) => e.code === 'INVALID_STAGE',
  );
  assert.equal(calls, 0);
  const asyncPort = Object.freeze({
      async compose() {
        calls++;
      },
    }),
    proxyPort = Object.freeze({
      compose: new Proxy(() => null, {
        apply() {
          calls++;
          throw Error('must not invoke');
        },
      }),
    });
  for (const rules of [asyncPort, proxyPort])
    assert.throws(
      () => new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, rules),
      (e) => e.code === 'INVALID_STAGE',
    );
  assert.equal(calls, 0);
});

test('Stage pre-reserves five setup SQL rows and first cleanup before creating TEMP state', async (t) => {
  const { MixedAnalysisStage } = await api(),
    captureAPI = await import('../dist/analysis/activation-history.js'),
    f = await historyFixture(t, 'available'),
    reference = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    usage = captureAPI.default(f.db, reference.handle, historyLimits).usage;
  const original = f.db.exec;
  let creates = 0;
  f.db.exec = function (sql) {
    if (sql.startsWith('CREATE TEMP TABLE mixed_stage')) creates++;
    return original.call(this, sql);
  };
  const h = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  assert.throws(
    () =>
      new MixedAnalysisStage(
        f.db,
        h.handle,
        'FULL',
        { ...historyLimits, maxRows: usage.rows + 5 },
        port,
      ),
    (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
  );
  assert.equal(creates, 0);
  const fresh = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    stage = new MixedAnalysisStage(
      f.db,
      fresh.handle,
      'FULL',
      { ...historyLimits, maxRows: usage.rows + 6 },
      port,
    );
  assert.equal(creates, 1);
  stage.close();
});

import { seedLiteral } from './helpers/r011-history-fixture.mjs';
import { ownerFixture, observationFixture } from './helpers/mixed-analysis-fixture.mjs';
for (const id of ['full-python', 'delta-python-modified', 'delta-delete-only'])
  test('Stage prepares independently frozen owned scope and digest ' + id, async (t) => {
    const { MixedAnalysisStage } = await api(),
      f = await ownerFixture(t, id),
      before = persistentRows(f.db),
      h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
      s = new MixedAnalysisStage(f.db, h.handle, f.mode, historyLimits, port);
    assert.equal(typeof s.prepareOwner, 'function');
    const p = structuredClone(f.preparation),
      owner = s.prepareOwner(null, p);
    assert.equal(owner.stageDigest, f.expected.stageDigest);
    assert.deepEqual(Object.keys(owner.ownerHandle), []);
    assert.ok(Object.isFrozen(owner.ownerHandle));
    assert.ok(Object.isFrozen(owner));
    assert.deepEqual(p, f.preparation);
    assert.deepEqual(
      JSON.parse(
        f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='OWNER'").get().value_json,
      ),
      f.expected.body,
    );
    assert.deepEqual(persistentRows(f.db), before);
    assert.throws(
      () => s.prepareOwner(null, p),
      (e) => e.code === 'INVALID_STAGE',
    );
    assert.throws(
      () => s.prepareOwner(null, p),
      (e) => e.code === 'INVALID_STAGE',
    );
    s.close();
  });
test('Stage owner rejects caller-selected scope, policy flags and unsafe preparation without getters', async (t) => {
  const { MixedAnalysisStage } = await api();
  for (const kind of ['scope', 'source', 'score', 'getter', 'java']) {
    const f = await ownerFixture(t, 'full-python'),
      h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
      s = new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, port);
    assert.equal(typeof s.prepareOwner, 'function');
    let calls = 0;
    const p = structuredClone(f.preparation);
    let java = null;
    if (kind === 'scope') p.unitIds = [];
    if (kind === 'source') p.targetSource = {};
    if (kind === 'score') p.score = 1;
    if (kind === 'getter')
      Object.defineProperty(p, 'contracts', {
        enumerable: true,
        get() {
          calls++;
          return [];
        },
      });
    if (kind === 'java') java = { nodePairs: [] };
    assert.throws(
      () => s.prepareOwner(java, p),
      (e) => e.message === e.code,
    );
    assert.equal(calls, 0);
    assert.throws(
      () => s.prepareOwner(null, f.preparation),
      (e) => e.code === 'STAGE_RELEASED',
    );
    s.close();
  }
});
test('Stage owner checks captured Source and TEMP before issuing an opaque owner', async (t) => {
  const { MixedAnalysisStage } = await api();
  for (const kind of ['temp', 'capture']) {
    const f = await ownerFixture(t, 'full-python'),
      h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
      s = new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, port);
    assert.equal(typeof s.prepareOwner, 'function');
    if (kind === 'temp')
      f.db.prepare("UPDATE mixed_stage SET value_json='{}' WHERE key='CAPTURE'").run();
    else
      f.db
        .prepare('DELETE FROM active_history_pointer WHERE repository_id=?')
        .run(f.input.repositoryId);
    assert.throws(
      () => s.prepareOwner(null, f.preparation),
      (e) => ['STAGE_CHANGED', 'HISTORY_CHANGED'].includes(e.code),
    );
    s.close();
  }
});

async function observedPort() {
  const real = (await import('../../runtime/dist/mixed-analysis.js')).createMixedAnalysisRules(),
    calls = { prepare: 0, accept: 0, compose: 0 },
    rules = Object.freeze({
      prepareJavaOwner(...args) {
        calls.prepare++;
        return real.prepareJavaOwner(...args);
      },
      validateObservation(...args) {
        calls.accept++;
        return real.validateObservation(...args);
      },
      compose() {
        calls.compose++;
        throw Error('must not compose before freeze');
      },
    });
  return { rules, calls };
}
for (const id of ['java-only', 'mixed', 'python-only'])
  test(
    'Stage prepares exact real Source-only owner and accepts bound observation ' + id,
    async (t) => {
      const { MixedAnalysisStage } = await api(),
        f = await observationFixture(t, id),
        before = persistentRows(f.db),
        h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
        p = await observedPort(),
        s = new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, p.rules),
        o = s.prepareOwner(f.javaRows, f.preparation);
      assert.equal(o.stageDigest, f.expected.stageDigest);
      assert.deepEqual(
        JSON.parse(
          f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='OWNER'").get().value_json,
        ),
        f.expected.body,
      );
      assert.equal(p.calls.prepare, f.javaRows ? 1 : 0);
      assert.equal(typeof s.acceptObservation, 'function');
      s.acceptObservation(o.ownerHandle, f.raw);
      assert.deepEqual(p.calls, { prepare: f.javaRows ? 1 : 0, accept: 1, compose: 0 });
      assert.deepEqual(persistentRows(f.db), before);
      assert.throws(
        () => s.acceptObservation(o.ownerHandle, f.raw),
        (e) => e.code === 'INVALID_STAGE',
      );
      assert.throws(
        () => s.acceptObservation(o.ownerHandle, f.raw),
        (e) => e.code === 'INVALID_STAGE',
      );
      s.close();
    },
  );
test('Stage delete-only accepts null without invoking any rule', async (t) => {
  const { MixedAnalysisStage } = await api(),
    f = await ownerFixture(t, 'delta-delete-only'),
    h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    s = new MixedAnalysisStage(f.db, h.handle, 'DELTA', historyLimits, port),
    o = s.prepareOwner(null, f.preparation);
  assert.equal(typeof s.acceptObservation, 'function');
  s.acceptObservation(o.ownerHandle, null);
  assert.throws(
    () => s.acceptObservation(o.ownerHandle, null),
    (e) => e.code === 'INVALID_STAGE',
  );
  s.close();
});
for (const kind of ['clone', 'wrong-stage', 'checksum', 'java', 'null', 'temp', 'source'])
  test('Stage rejects observation ' + kind + ' and permanently invalidates', async (t) => {
    const { MixedAnalysisStage } = await api(),
      f = await observationFixture(t, 'mixed'),
      h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
      p = await observedPort(),
      s = new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, p.rules),
      o = s.prepareOwner(f.javaRows, f.preparation);
    assert.equal(typeof s.acceptObservation, 'function');
    let owner = o.ownerHandle,
      raw = f.raw;
    if (kind === 'clone') owner = {};
    if (kind === 'wrong-stage') {
      const g = await observationFixture(t, 'mixed'),
        gh = captureActivationContext(g.db, g.input.repositoryId, historyLimits),
        gs = new MixedAnalysisStage(g.db, gh.handle, 'FULL', historyLimits, p.rules);
      owner = gs.prepareOwner(g.javaRows, g.preparation).ownerHandle;
      t.after(() => gs.close());
    }
    if (kind === 'checksum') raw.outputBytes[0] ^= 1;
    if (kind === 'java') raw.metadata.java.events.pop();
    if (kind === 'null') raw = null;
    if (kind === 'temp')
      f.db.prepare("UPDATE mixed_stage SET value_json='{}' WHERE key='OWNER'").run();
    if (kind === 'source')
      f.db.prepare("UPDATE source_files SET content_fingerprint='changed'").run();
    assert.throws(
      () => s.acceptObservation(owner, raw),
      (e) => e.message === e.code,
    );
    assert.throws(
      () => s.acceptObservation(o.ownerHandle, f.raw),
      (e) => e.code === 'STAGE_RELEASED',
    );
    assert.equal(p.calls.compose, 0);
    s.close();
  });
test('Stage constructor requires all three synchronous fixed rules', async (t) => {
  const { MixedAnalysisStage } = await api(),
    f = await historyFixture(t, 'available');
  for (const rules of [
    Object.freeze({ compose() {} }),
    ...['prepareJavaOwner', 'validateObservation'].map((k) =>
      Object.freeze({ ...port, [k]: async () => null }),
    ),
  ]) {
    const h = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
    assert.throws(
      () => new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, rules),
      (e) => e.code === 'INVALID_STAGE',
    );
  }
});

test('Stage compares returned event declarations to its original owned JSONL bytes', async (t) => {
  const { MixedAnalysisStage } = await api(),
    f = await observationFixture(t, 'python-only'),
    h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    real = (await import('../../runtime/dist/mixed-analysis.js')).createMixedAnalysisRules(),
    rules = Object.freeze({
      ...real,
      validateObservation(...args) {
        const r = structuredClone(real.validateObservation(...args));
        r.raw.codeSyntax.events.pop();
        return r;
      },
    }),
    s = new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, rules),
    o = s.prepareOwner(null, f.preparation);
  assert.throws(
    () => s.acceptObservation(o.ownerHandle, f.raw),
    (e) => e.code === 'INVALID_CANDIDATE',
  );
  s.close();
});
test('Stage guards reentrant rules and cannot issue owner after invalidation', async (t) => {
  const { MixedAnalysisStage } = await api(),
    f = await observationFixture(t, 'java-only'),
    h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    real = (await import('../../runtime/dist/mixed-analysis.js')).createMixedAnalysisRules();
  let s;
  const rules = Object.freeze({
    ...real,
    prepareJavaOwner(...args) {
      assert.throws(
        () => s.prepareOwner(f.javaRows, f.preparation),
        (e) => e.code === 'INVALID_STAGE',
      );
      return real.prepareJavaOwner(...args);
    },
  });
  s = new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, rules);
  assert.throws(
    () => s.prepareOwner(f.javaRows, f.preparation),
    (e) => e.code === 'STAGE_RELEASED',
  );
  assert.equal(f.db.prepare("SELECT count(*) n FROM mixed_stage WHERE key='OWNER'").get().n, 0);
  s.close();
});

for (const id of ['java-only', 'mixed', 'python-only'])
  test(
    'Stage freeze independently validates complete final history and returns opaque lease ' + id,
    async (t) => {
      const { MixedAnalysisStage } = await api(),
        f = await observationFixture(t, id),
        h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
        real = (await import('../../runtime/dist/mixed-analysis.js')).createMixedAnalysisRules();
      let calls = 0;
      const rules = Object.freeze({
          ...real,
          compose(...args) {
            calls++;
            assert.equal(f.db.isTransaction, false);
            return real.compose(...args);
          },
        }),
        s = new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, rules),
        o = s.prepareOwner(f.javaRows, f.preparation);
      s.acceptObservation(o.ownerHandle, f.raw);
      assert.equal(typeof s.freeze, 'function');
      const before = persistentRows(f.db),
        result = s.freeze(),
        expected = JSON.parse(
          readComponentReference(
            'fixtures/phase1/mixed-analysis-stage/component-references/stage-freeze-independent/' +
              id +
              '.json',
          ),
        ),
        stored = JSON.parse(
          f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='FROZEN'").get().value_json,
        );
      assert.deepEqual(result.basis, expected.basis);
      assert.deepEqual(Object.keys(result), ['lease', 'basis']);
      assert.ok(Object.isFrozen(result.lease));
      assert.deepEqual(Object.keys(result.lease), []);
      assert.equal(stored.activationId, expected.activationId);
      for (const key of ['manifest', 'origins', 'projections', 'members', 'basis'])
        assert.deepEqual(stored[key], expected[key]);
      assert.equal(calls, 1);
      assert.deepEqual(persistentRows(f.db), before);
      assert.throws(
        () => s.freeze(),
        (e) => e.code === 'INVALID_STAGE',
      );
      assert.equal(calls, 1);
      s.close();
    },
  );
for (const kind of ['before-observation', 'temp', 'basis', 'origins', 'support'])
  test('Stage freeze refuses ' + kind + ' and grants no reusable lease', async (t) => {
    const { MixedAnalysisStage } = await api(),
      f = await observationFixture(t, 'mixed'),
      h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
      real = (await import('../../runtime/dist/mixed-analysis.js')).createMixedAnalysisRules(),
      rules = Object.freeze({
        ...real,
        compose(...args) {
          const r = structuredClone(real.compose(...args));
          if (kind === 'basis') r.basis.codeActivationDigest = '0'.repeat(64);
          if (kind === 'origins') r.origins.pop();
          if (kind === 'support') r.code.candidates.pop();
          return r;
        },
      }),
      s = new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, rules),
      o = s.prepareOwner(f.javaRows, f.preparation);
    assert.equal(typeof s.freeze, 'function');
    if (kind !== 'before-observation') s.acceptObservation(o.ownerHandle, f.raw);
    if (kind === 'temp')
      f.db.prepare("UPDATE mixed_stage SET value_json='{}' WHERE key='OBSERVATION'").run();
    assert.throws(
      () => s.freeze(),
      (e) => e.message === e.code,
    );
    assert.throws(
      () => s.freeze(),
      (e) => e.code === (kind === 'before-observation' ? 'INVALID_STAGE' : 'STAGE_RELEASED'),
    );
    s.close();
  });

test('Stage delete-only freeze retains real original snapshots and physical coverage without raw callbacks', async (t) => {
  const { MixedAnalysisStage } = await api(),
    f = await ownerFixture(t, 'delta-delete-only'),
    h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    real = (await import('../../runtime/dist/mixed-analysis.js')).createMixedAnalysisRules();
  let calls = 0;
  const rules = Object.freeze({
      ...port,
      compose(...args) {
        calls++;
        return real.compose(...args);
      },
    }),
    s = new MixedAnalysisStage(f.db, h.handle, 'DELTA', historyLimits, rules),
    o = s.prepareOwner(null, f.preparation);
  s.acceptObservation(o.ownerHandle, null);
  const result = s.freeze(),
    stored = JSON.parse(
      f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='FROZEN'").get().value_json,
    );
  assert.equal(calls, 1);
  assert.equal(stored.manifest.observation, null);
  assert.equal(stored.manifest.transitions.kind, 'TRANSITION_DRAFT');
  assert.deepEqual(stored.manifest.state.inventory, []);
  assert.deepEqual(stored.manifest.state.units, []);
  assert.deepEqual(stored.manifest.parent, {
    activationId: f.expected.body.expectedActivationId,
    repositoryId: f.input.repositoryId,
    revisionId: result.basis.revisionId,
  });
  assert.deepEqual(stored.manifest.state.snapshots, h.view.history.state.snapshots);
  assert.equal(stored.code.coverage.length, f.input.tables.analysis_coverage.length);
  s.close();
});

test('frozen STATE_MATRIX illegal calls preserve the valid current Stage state', async (t) => {
  const { MixedAnalysisStage } = await api(),
    f = await observationFixture(t, 'python-only'),
    h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    real = (await import('../../runtime/dist/mixed-analysis.js')).createMixedAnalysisRules(),
    s = new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, real);
  assert.throws(
    () => s.acceptObservation({}, f.raw),
    (e) => e.code === 'INVALID_STAGE',
  );
  const o = s.prepareOwner(null, f.preparation);
  assert.throws(
    () => s.prepareOwner(null, f.preparation),
    (e) => e.code === 'INVALID_STAGE',
  );
  assert.throws(
    () => s.freeze(),
    (e) => e.code === 'INVALID_STAGE',
  );
  s.acceptObservation(o.ownerHandle, f.raw);
  assert.throws(
    () => s.prepareOwner(null, f.preparation),
    (e) => e.code === 'INVALID_STAGE',
  );
  assert.throws(
    () => s.acceptObservation(o.ownerHandle, f.raw),
    (e) => e.code === 'INVALID_STAGE',
  );
  const lease = s.freeze();
  assert.ok(lease.lease);
  assert.throws(
    () => s.freeze(),
    (e) => e.code === 'INVALID_STAGE',
  );
  assert.throws(
    () => s.freeze(),
    (e) => e.code === 'INVALID_STAGE',
  );
  s.close();
});

for (const connection of ['same', 'other'])
  test(
    'Stage refuses pointer ABA on ' + connection + ' connection before owner issuance',
    async (t) => {
      const { MixedAnalysisStage } = await api(),
        f = await ownerFixture(t, 'full-python'),
        h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
        s = new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, port),
        writer = connection === 'same' ? f.db : f.reopen(),
        row = writer.prepare('SELECT * FROM active_history_pointer').get();
      writer.exec('BEGIN IMMEDIATE');
      writer
        .prepare('DELETE FROM active_history_pointer WHERE repository_id=?')
        .run(row.repository_id);
      writer
        .prepare('INSERT INTO active_history_pointer(repository_id,activation_id)VALUES(?,?)')
        .run(row.repository_id, row.activation_id);
      writer.exec('COMMIT');
      assert.throws(
        () => s.prepareOwner(null, f.preparation),
        (e) => ['STAGE_CHANGED', 'HISTORY_CHANGED'].includes(e.code),
      );
      s.close();
    },
  );

for (const kind of ['node', 'edge', 'original-candidate'])
  test('independent review IR1 rejects rehashed manifest-only ' + kind, async (t) => {
    const { MixedAnalysisStage } = await api(),
      f = await observationFixture(t, 'mixed'),
      before = persistentRows(f.db),
      h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
      { createMixedAnalysisRules } = await import('../../runtime/dist/mixed-analysis.js'),
      { historyDigest, HistoryReadBudget, encodeHistoryValue } =
        await import('../dist/analysis/activation-history-format.js'),
      { createHash } = await import('node:crypto'),
      real = createMixedAnalysisRules(),
      s = new MixedAnalysisStage(
        f.db,
        h.handle,
        'FULL',
        historyLimits,
        Object.freeze({
          ...real,
          compose(...args) {
            const r = structuredClone(real.compose(...args));
            if (kind === 'node') r.manifest.state.nodes[0].confidence.reasons = ['altered'];
            if (kind === 'edge') r.manifest.state.edges[0].confidence.reasons = ['altered'];
            if (kind === 'original-candidate') {
              const support = r.manifest.state.supports[0];
              support.canonical.confidence = { score: 1, method: 'parser', reasons: ['altered'] };
              support.valueDigest = createHash('sha256')
                .update(
                  encodeHistoryValue(
                    { kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate: support.canonical },
                    new HistoryReadBudget(historyLimits),
                  ),
                )
                .digest('hex');
            }
            r.activationId =
              'activation:' +
              historyDigest(
                'codeatlas-activation-history-v1',
                r.manifest,
                new HistoryReadBudget(historyLimits),
              );
            return r;
          },
        }),
      ),
      o = s.prepareOwner(f.javaRows, f.preparation);
    s.acceptObservation(o.ownerHandle, f.raw);
    assert.throws(
      () => s.freeze(),
      (e) => e.code === 'INVALID_CANDIDATE',
    );
    assert.throws(
      () => s.freeze(),
      (e) => e.code === 'STAGE_RELEASED',
    );
    s.close();
    assert.deepEqual(persistentRows(f.db), before);
    assert.deepEqual(persistentRows(f.reopen(true)), before);
  });

test('independent review IR1 successful Store commit reopens complete history on a fresh connection', async (t) => {
  const { frozen } = await import('./helpers/mixed-analysis-store-fixture.mjs'),
    { MixedAnalysisStore } = await import('../dist/analysis/mixed-analysis-store.js'),
    f = await frozen(t, 'mixed'),
    activationId = new MixedAnalysisStore(f.db).apply(f.token.lease, historyLimits),
    cap = captureActivationContext(f.reopen(true), f.input.repositoryId, historyLimits),
    { historyDigest, HistoryReadBudget } =
      await import('../dist/analysis/activation-history-format.js');
  assert.equal(cap.view.status, 'AVAILABLE');
  assert.deepEqual(cap.view.activeBasis, f.token.basis);
  assert.equal(
    'activation:' +
      historyDigest(
        'codeatlas-activation-history-v1',
        cap.view.history,
        new HistoryReadBudget(historyLimits),
      ),
    activationId,
  );
  f.stage.close();
});
