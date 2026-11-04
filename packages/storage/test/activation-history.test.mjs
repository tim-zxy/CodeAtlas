import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  historyCases,
  historyFixture,
  historyLimits,
  loadHistoryCase,
  persistentRows,
} from './helpers/r011-history-fixture.mjs';
test('activation history exposes owned capture API', async () => {
  const api = await import('../dist/analysis/activation-history.js');
  assert.equal(typeof api.captureActivationContext, 'function');
  assert.equal(typeof api.recheckActivationContext, 'function');
  assert.equal(typeof api.releaseActivationContext, 'function');
});
for (const c of historyCases.filter((c) => c.id !== 'encoding'))
  test('literal history ' + c.id, async (t) => {
    const api = await import('../dist/analysis/activation-history.js'),
      f = await historyFixture(t, c.id),
      before = persistentRows(f.db);
    if (f.expected.error)
      assert.throws(
        () => api.captureActivationContext(f.db, f.input.repositoryId, historyLimits),
        (e) => e.code === f.expected.error && e.message === e.code,
      );
    else {
      const captured = api.captureActivationContext(f.db, f.input.repositoryId, historyLimits);
      assert.deepEqual(captured.view, f.expected);
      assert.deepEqual(Object.keys(captured.handle), []);
      assert.equal(Object.isFrozen(captured.view), true);
      api.recheckActivationContext(f.db, captured.handle, historyLimits);
      api.releaseActivationContext(f.db, captured.handle);
      api.releaseActivationContext(f.db, captured.handle);
      assert.throws(
        () => api.recheckActivationContext(f.db, captured.handle, historyLimits),
        (e) => e.code === 'HISTORY_RELEASED',
      );
    }
    assert.equal(f.db.isTransaction, false);
    assert.deepEqual(persistentRows(f.db), before);
  });
for (const [name, mutate] of [
  [
    'parent revision',
    (m) => {
      m.parent.revisionId = 'wrong-revision';
    },
  ],
  [
    'transition extra nested field',
    (m) => {
      m.transitions = {
        kind: 'TRANSITION_DRAFT',
        activationId: m.parent.activationId,
        oldBasis: m.state.basis,
        targetSource: {
          repositoryId: m.state.basis.repositoryId,
          revisionId: m.state.basis.revisionId,
          contentFingerprint: m.state.basis.contentFingerprint,
        },
        historyDigest: 'a'.repeat(64),
        ledgerDigest: 'b'.repeat(64),
        diff: [{ kind: 'ADDED', before: null, after: m.state.inventory[0], extra: true }],
        supportDecisions: [],
        addedEvidenceIds: [],
        survivingFactKeys: [],
        coverageOrigins: [],
        syntaxRequirements: [],
      };
    },
  ],
])
  test('rejects resealed ' + name, async (t) => {
    const api = await import('../dist/analysis/activation-history.js'),
      { mutateHistoryFixture, resealManifest } = await import('./helpers/r011-history-fixture.mjs');
    const f = await mutateHistoryFixture(
      t,
      (input) => resealManifest(input, mutate),
      'syntax-ancestor',
    );
    assert.throws(
      () => api.captureActivationContext(f.db, f.input.repositoryId, historyLimits),
      (e) => e.code === 'INVALID_HISTORY',
    );
  });
for (const missing of [false, true])
  test(
    'Native storage-only zero-fact census ' +
      (missing ? 'refuses missing unit' : 'complete positive control'),
    async (t) => {
      const api = await import('../dist/analysis/activation-history.js'),
        { nativeEmptyHistoryInput, resealManifest, seedLiteral } =
          await import('./helpers/r011-history-fixture.mjs'),
        f = await historyFixture(t, 'available', { seed: false }),
        input = await nativeEmptyHistoryInput();
      if (missing)
        await resealManifest(input, (m) => {
          m.state.units = [];
          m.state.coverage = [];
        });
      seedLiteral(f.db, input);
      if (missing)
        assert.throws(
          () => api.captureActivationContext(f.db, input.repositoryId, historyLimits),
          (e) => e.code === 'INVALID_HISTORY',
        );
      else {
        const r = api.captureActivationContext(f.db, input.repositoryId, historyLimits);
        assert.equal(r.view.status, 'AVAILABLE');
        assert.deepEqual(
          r.view.history.state.coverage.map((c) => c.facet),
          ['FRAMEWORK_SYNTAX_OBSERVATION_V1', 'PYTHON_SYNTAX_CODE_V1'],
        );
        api.releaseActivationContext(f.db, r.handle);
      }
    },
  );
import {
  captureActivationContext,
  recheckActivationContext,
  releaseActivationContext,
} from '../dist/analysis/activation-history.js';
import {
  HistoryReadBudget,
  encodeHistoryValue,
  historyDigest,
  checkedHistoryLimits,
} from '../dist/analysis/activation-history-format.js';
const rejects = (fn, code) => assert.throws(fn, (e) => e.code === code && e.message === code);
test('history handles are unforgeable and bound to one connection', async (t) => {
  const f = await historyFixture(t),
    other = f.reopen(),
    c = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  let calls = 0;
  const getter = {
    get value() {
      calls++;
      return c.handle;
    },
  };
  const cycle = {};
  cycle.self = cycle;
  for (const fake of [{}, structuredClone(c.handle), new Proxy(c.handle, {}), getter, cycle])
    rejects(() => recheckActivationContext(f.db, fake, historyLimits), 'INVALID_HISTORY');
  rejects(() => recheckActivationContext(other, c.handle, historyLimits), 'INVALID_HISTORY');
  rejects(() => releaseActivationContext(other, c.handle), 'INVALID_HISTORY');
  assert.equal(calls, 0);
  recheckActivationContext(f.db, c.handle, historyLimits);
  releaseActivationContext(f.db, c.handle);
});
test('ambient transaction refusal revokes owner without rolling back caller', async (t) => {
  const f = await historyFixture(t),
    c = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  f.db.exec('BEGIN');
  rejects(() => recheckActivationContext(f.db, c.handle, historyLimits), 'INVALID_HISTORY');
  assert.equal(f.db.isTransaction, true);
  f.db.exec('ROLLBACK');
  rejects(() => recheckActivationContext(f.db, c.handle, historyLimits), 'HISTORY_RELEASED');
});
test('close and same object reopen cannot revive history handle', async (t) => {
  const f = await historyFixture(t),
    c = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  f.db.close();
  f.db.open();
  rejects(() => recheckActivationContext(f.db, c.handle, historyLimits), 'HISTORY_RELEASED');
  const fresh = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  assert.deepEqual(fresh.view, f.expected);
  releaseActivationContext(f.db, fresh.handle);
});
test('readonly disk reopen captures without persistent mutation', async (t) => {
  const f = await historyFixture(t, 'syntax-ancestor'),
    before = persistentRows(f.db);
  f.db.close();
  const db = f.reopen(true),
    c = captureActivationContext(db, f.input.repositoryId, historyLimits);
  assert.deepEqual(c.view, f.expected);
  recheckActivationContext(db, c.handle, historyLimits);
  releaseActivationContext(db, c.handle);
  assert.deepEqual(persistentRows(db), before);
});
test('committed legacy mutation and restoration cannot revive old handle', async (t) => {
  const f = await historyFixture(t),
    c = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  f.db.exec('UPDATE canonical_nodes SET name=name');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM active_history_pointer').get().n, 0);
  rejects(() => recheckActivationContext(f.db, c.handle, historyLimits), 'HISTORY_CHANGED');
  const fresh = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  assert.equal(fresh.view.status, 'UNAVAILABLE');
  rejects(() => recheckActivationContext(f.db, c.handle, historyLimits), 'HISTORY_RELEASED');
  releaseActivationContext(f.db, fresh.handle);
});
test('rolled back mutation preserves history identity and handle', async (t) => {
  const f = await historyFixture(t),
    c = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  f.db.exec('BEGIN;UPDATE canonical_nodes SET name=name;ROLLBACK');
  recheckActivationContext(f.db, c.handle, historyLimits);
  releaseActivationContext(f.db, c.handle);
});
test('non-data limits rejected without invoking user getters', async (t) => {
  const f = await historyFixture(t);
  let calls = 0;
  const accessor = { ...historyLimits };
  Object.defineProperty(accessor, 'maxRows', {
    enumerable: true,
    get() {
      calls++;
      return 1;
    },
  });
  for (const input of [
    null,
    {},
    accessor,
    new Proxy(historyLimits, {}),
    { ...historyLimits, extra: 1 },
    ...['maxRows', 'maxSerializedBytes', 'maxItems', 'maxDepth', 'memoryBudgetBytes'].flatMap((k) =>
      [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((v) => ({
        ...historyLimits,
        [k]: v,
      })),
    ),
  ])
    rejects(() => captureActivationContext(f.db, f.input.repositoryId, input), 'INVALID_HISTORY');
  assert.equal(calls, 0);
  assert.equal(f.db.isTransaction, false);
});
test('numeric admission refuses before any payload TEXT is delivered', async (t) => {
  const f = await historyFixture(t),
    prepare = f.db.prepare.bind(f.db),
    sql = [];
  f.db.prepare = function (query) {
    sql.push(query);
    return prepare(query);
  };
  for (const key of ['maxRows', 'maxSerializedBytes', 'maxItems', 'memoryBudgetBytes']) {
    sql.length = 0;
    rejects(
      () => captureActivationContext(f.db, f.input.repositoryId, { ...historyLimits, [key]: 1 }),
      'HISTORY_LIMIT_EXCEEDED',
    );
    assert.equal(
      sql.some((s) => /^SELECT id,repository_id,revision_id,parent_id/.test(s)),
      false,
    );
  }
  assert.equal(f.db.isTransaction, false);
});
test('history canonical vectors have independent exact byte and item budgets', () => {
  const { input, expected } = loadHistoryCase('encoding');
  for (let i = 0; i < input.vectors.length; i++) {
    const value = input.vectors[i],
      bytes = Buffer.byteLength(expected.encoded[i]);
    const count = (v) =>
      1 +
      (v !== null && typeof v === 'object'
        ? Object.values(v).reduce((n, c) => n + count(c), 0)
        : 0);
    const exact = {
      ...historyLimits,
      maxItems: count(value),
      maxSerializedBytes: bytes * 2,
      memoryBudgetBytes: bytes * 4,
    };
    assert.equal(encodeHistoryValue(value, new HistoryReadBudget(exact)), expected.encoded[i]);
    for (const key of ['maxItems', 'maxSerializedBytes', 'memoryBudgetBytes'])
      rejects(
        () => encodeHistoryValue(value, new HistoryReadBudget({ ...exact, [key]: exact[key] - 1 })),
        'HISTORY_LIMIT_EXCEEDED',
      );
  }
});
test('safe traversal refuses cycles accessors proxies and excessive lexical depth', () => {
  let calls = 0;
  const cycle = {};
  cycle.self = cycle;
  const accessor = {
    get x() {
      calls++;
      return 1;
    },
  };
  for (const v of [cycle, accessor, new Proxy({}, {})])
    rejects(() => encodeHistoryValue(v, new HistoryReadBudget(historyLimits)), 'INVALID_HISTORY');
  assert.equal(calls, 0);
  rejects(
    () => new HistoryReadBudget({ ...historyLimits, maxDepth: 1 }).parse('[[[{}]]]'),
    'HISTORY_LIMIT_EXCEEDED',
  );
  const b = new HistoryReadBudget(historyLimits);
  b.add('rows', Number.MAX_SAFE_INTEGER);
  rejects(() => b.add('rows', 1), 'HISTORY_LIMIT_EXCEEDED');
});
test('R011 refuses malformed UTF8 in legacy non-JSON text', async (t) => {
  const f = await historyFixture(t);
  f.db.exec("UPDATE repository SET root_path=CAST(X'80' AS TEXT)");
  rejects(
    () => captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    'INVALID_HISTORY',
  );
});
test('nested transition valid declaration accepts existing non-hex Source fingerprint', async () => {
  const { validateHistoryManifest } = await import('../dist/analysis/activation-history-format.js'),
    m = structuredClone(loadHistoryCase('syntax-ancestor').expected.history);
  m.transitions = {
    kind: 'TRANSITION_DRAFT',
    activationId: m.parent.activationId,
    oldBasis: m.state.basis,
    targetSource: {
      repositoryId: m.state.basis.repositoryId,
      revisionId: m.state.basis.revisionId,
      contentFingerprint: m.state.basis.contentFingerprint,
    },
    historyDigest: 'a'.repeat(64),
    ledgerDigest: 'b'.repeat(64),
    diff: m.state.inventory.map((f) => ({ kind: 'UNCHANGED', before: f, after: f })),
    supportDecisions: [],
    addedEvidenceIds: [],
    survivingFactKeys: [],
    coverageOrigins: [],
    syntaxRequirements: [],
  };
  assert.deepEqual(validateHistoryManifest(m, new HistoryReadBudget(historyLimits)), m);
});
test('Source CAS changes target while immutable active history stays readable', async (t) => {
  const f = await historyFixture(t),
    { RepositorySourceStateStore } = await import('../dist/index.js'),
    s = new RepositorySourceStateStore(f.db),
    before = s.load(f.input.repositoryId),
    old = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  s.replace(before, {
    revision: { ...before.revision, contentFingerprint: 'source:advanced' },
    files: before.files,
  });
  rejects(() => recheckActivationContext(f.db, old.handle, historyLimits), 'HISTORY_CHANGED');
  const next = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  assert.equal(next.view.status, 'AVAILABLE');
  assert.deepEqual(next.view.history, f.expected.history);
  assert.equal(next.view.targetSource.contentFingerprint, 'source:advanced');
  assert.notDeepEqual(next.view.targetSource, next.view.activeBasis);
  releaseActivationContext(f.db, next.handle);
});
test('whole capture rows match independently observed SQLite deliveries', async (t) => {
  const f = await historyFixture(t, 'syntax-ancestor'),
    prepare = f.db.prepare.bind(f.db);
  let rows = 0;
  f.db.prepare = function (sql) {
    const st = prepare(sql),
      get = st.get.bind(st),
      iterate = st.iterate.bind(st);
    st.get = function (...args) {
      const r = get(...args);
      if (r !== undefined) rows++;
      return r;
    };
    st.iterate = function* (...args) {
      for (const r of iterate(...args)) {
        rows++;
        yield r;
      }
    };
    return st;
  };
  let c = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  releaseActivationContext(f.db, c.handle);
  const exact = rows;
  rows = 0;
  c = captureActivationContext(f.db, f.input.repositoryId, { ...historyLimits, maxRows: exact });
  assert.equal(rows, exact);
  releaseActivationContext(f.db, c.handle);
  rejects(
    () =>
      captureActivationContext(f.db, f.input.repositoryId, {
        ...historyLimits,
        maxRows: exact - 1,
      }),
    'HISTORY_LIMIT_EXCEEDED',
  );
});
test('whole capture each explicit allowance has exact and one-below dynamic boundary', async (t) => {
  const f = await historyFixture(t, 'syntax-ancestor');
  const samples = {};
  for (const key of [
    'maxRows',
    'maxSerializedBytes',
    'maxItems',
    'maxDepth',
    'memoryBudgetBytes',
  ]) {
    let low = 1,
      high = Number.MAX_SAFE_INTEGER;
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      try {
        const c = captureActivationContext(f.db, f.input.repositoryId, {
          ...historyLimits,
          [key]: mid,
        });
        releaseActivationContext(f.db, c.handle);
        high = mid;
      } catch (e) {
        assert.equal(e.code, 'HISTORY_LIMIT_EXCEEDED');
        low = mid + 1;
      }
    }
    samples[key] = low;
    const c = captureActivationContext(f.db, f.input.repositoryId, {
      ...historyLimits,
      [key]: low,
    });
    assert.deepEqual(c.view, f.expected);
    releaseActivationContext(f.db, c.handle);
    rejects(
      () =>
        captureActivationContext(f.db, f.input.repositoryId, { ...historyLimits, [key]: low - 1 }),
      'HISTORY_LIMIT_EXCEEDED',
    );
  }
  t.diagnostic(
    'Compatibility observations only, not independent goldens/profile: ' + JSON.stringify(samples),
  );
});
for (const missing of [false, true])
  test(
    'full snapshot registry ' +
      (missing ? 'rejects omitted unused origin' : 'retains unused original'),
    async (t) => {
      const { mutateHistoryFixture, resealManifest, referenceCanonical } =
          await import('./helpers/r011-history-fixture.mjs'),
        { createHash } = await import('node:crypto');
      const f = await mutateHistoryFixture(
        t,
        async (input) => {
          input.tables.activation_syntax_members = [];
          await resealManifest(input, (m) => {
            m.syntaxMembers = [];
            m.state.syntaxOrigins = [];
            if (missing) {
              m.state.snapshots = m.state.snapshots.filter((s) => s.id !== 'snapshot:alpha');
              m.originRegistryDigest = createHash('sha256')
                .update('codeatlas-activation-origins-v1\0' + referenceCanonical(m.state.snapshots))
                .digest('hex');
            }
          });
        },
        'syntax-ancestor',
      );
      if (missing)
        rejects(
          () => captureActivationContext(f.db, f.input.repositoryId, historyLimits),
          'INVALID_HISTORY',
        );
      else {
        const c = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
        assert.equal(c.view.history.state.snapshots.length, 2);
        releaseActivationContext(f.db, c.handle);
      }
    },
  );
test('existing historyCompare UTF16 order is preserved for non-BMP keys', () => {
  const v = { '\uE000': 'bmp', '\u{10000}': 'astral' };
  assert.equal(
    encodeHistoryValue(v, new HistoryReadBudget(historyLimits)),
    '{"𐀀":"astral","":"bmp"}',
  );
});
for (const kind of [
  'duplicate Source path',
  'duplicate selected FactKey',
  'snapshot clock reversal',
])
  test('strict historical state rejects ' + kind, async () => {
    const { validateHistoryManifest } =
        await import('../dist/analysis/activation-history-format.js'),
      { referenceCanonical } = await import('./helpers/r011-history-fixture.mjs'),
      { createHash } = await import('node:crypto'),
      m = structuredClone(loadHistoryCase('available').expected.history),
      H = (domain, v) =>
        createHash('sha256')
          .update(domain + '\0' + referenceCanonical(v))
          .digest('hex');
    if (kind === 'duplicate Source path') {
      m.state.inventory.push({ ...m.state.inventory[0], id: 'source:two' });
    } else if (kind === 'duplicate selected FactKey') {
      m.state.nodes[1].factKey = m.state.nodes[0].factKey;
      for (const s of m.state.supports)
        if (s.factType === 'NODE' && s.canonical.id === m.state.nodes[1].id) {
          s.canonical.factKey = m.state.nodes[0].factKey;
          s.valueDigest = createHash('sha256')
            .update(
              referenceCanonical({ kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate: s.canonical }),
            )
            .digest('hex');
        }
    } else m.state.snapshots[0].completedAt = '2026-10-22T00:00:00.000Z';
    m.sourceIdentity = H('codeatlas-activation-source-v1', m.state.inventory);
    m.originRegistryDigest = H('codeatlas-activation-origins-v1', m.state.snapshots);
    assert.throws(() => validateHistoryManifest(m, new HistoryReadBudget(historyLimits)));
  });
for (const kind of [
  'first full',
  'full re-establishment with parent',
  'valid delta',
  'delta missing parent',
  'delta wrong parent activation',
  'delta wrong old basis',
  'delta wrong target Source',
  'persisted NO_OP',
])
  test('approved establishment relation ' + kind, async (t) => {
    const { mutateHistoryFixture, declaredDelta, resealManifest } =
      await import('./helpers/r011-history-fixture.mjs');
    const positive = ['first full', 'full re-establishment with parent', 'valid delta'].includes(
        kind,
      ),
      f = await mutateHistoryFixture(
        t,
        async (input) => {
          if (!kind.includes('full')) {
            await declaredDelta(input);
            await resealManifest(input, (m) => {
              switch (kind) {
                case 'delta missing parent':
                  m.parent = null;
                  break;
                case 'delta wrong parent activation':
                  m.transitions.activationId = 'activation:wrong';
                  break;
                case 'delta wrong old basis':
                  m.transitions.oldBasis = {
                    ...m.transitions.oldBasis,
                    contentFingerprint: 'wrong',
                  };
                  break;
                case 'delta wrong target Source':
                  m.transitions.targetSource = {
                    ...m.transitions.targetSource,
                    contentFingerprint: 'wrong',
                  };
                  break;
                case 'persisted NO_OP':
                  m.transitions.kind = 'NO_OP_DRAFT';
                  break;
              }
            });
          }
        },
        kind === 'first full' ? 'available' : 'syntax-ancestor',
      );
    if (positive) {
      const c = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
      assert.equal(c.view.status, 'AVAILABLE');
      assert.equal(c.view.history.transitions === null, kind !== 'valid delta');
      releaseActivationContext(f.db, c.handle);
    } else
      rejects(
        () => captureActivationContext(f.db, f.input.repositoryId, historyLimits),
        'INVALID_HISTORY',
      );
  });
test('legacy Native fixture is genuine R010 before an actual R011 upgrade', async (t) => {
  const { emptyNativePatch } = await import('./helpers/native-refresh-patch-fixture.mjs'),
    c = await emptyNativePatch(t);
  assert.equal(c.db.prepare('PRAGMA user_version').get().user_version, 10);
  assert.equal(
    c.db
      .prepare(
        "SELECT count(*) AS n FROM sqlite_schema WHERE type='table' AND name='activation_history'",
      )
      .get().n,
    0,
  );
});
// R03: actual four validated Store writers, with an AVAILABLE component history
// and a real returned handle, not a made-up ownership token or production-run claim.
for (const writer of ['generic full', 'generic patch', 'Native full', 'Native patch'])
  for (const rollback of [false, true])
    test(
      'R03 actual ' +
        writer +
        ' ' +
        (rollback ? 'rollback preserves' : 'commit invalidates') +
        ' captured history',
      async (t) => {
        const {
            RepositoryCanonicalFactStore,
            RepositoryAnalysisStage,
            captureNativeActivationToken,
          } = await import('../dist/index.js'),
          { applyMigrationPlan } = await import('../dist/migrations/runner.js'),
          { prefixPlan, installComponentManifest } =
            await import('./helpers/r011-history-fixture.mjs');
        let db,
          manifest,
          apply,
          disk = false;
        if (writer.startsWith('generic')) {
          const { captureFixture } = await import('./helpers/code-context-capture-fixture.mjs'),
            f = await captureFixture(t, 'complete');
          db = f.db;
          disk = true;
          applyMigrationPlan(db, await prefixPlan(11));
          manifest = structuredClone(loadHistoryCase('available').expected.history);
          manifest.state.repositoryLocatorDigest = f.expected.repositoryLocatorDigest;
          manifest.state.basis = f.expected.activeBasis;
          const run = structuredClone(f.sample.runs[0]);
          run.snapshot.id = 'snapshot:h1-next';
          apply = () => f.applyRun(run, writer === 'generic full' ? 0 : 1);
        } else {
          const { emptyNativePatch, nativePatchLimits } =
              await import('./helpers/native-refresh-patch-fixture.mjs'),
            { validateNativeStateCandidate, validateNativeRefreshOverlay } =
              await import('../../providers/dist/index.js'),
            { baseCase } = await import('../../providers/test/helpers/native-full-v3-corpus.mjs'),
            { cases, reference } =
              await import('../../../fixtures/phase1/code-context-capture/authoring.mjs'),
            c = await emptyNativePatch(t);
          db = c.db;
          applyMigrationPlan(db, await prefixPlan(11));
          const snapshot = { ...c.snapshot, id: 'snap' },
            sample = structuredClone(cases.find((x) => x.id === 'empty-code-with-coverage'));
          sample.repository = { id: 'r', rootPath: '/r' };
          sample.revision = {
            id: 'rev',
            repositoryId: 'r',
            kind: 'WORKTREE',
            contentFingerprint: 'base',
            commitIdentity: null,
            baseRevisionId: null,
            sourceRevisionId: null,
          };
          sample.files = [];
          sample.runs = [{ snapshot, nodes: [], edges: [], coverage: [] }];
          sample.activeRunIndexes = [0];
          sample.canonicalNodes = [];
          sample.canonicalEdges = [];
          const ref = reference(sample);
          manifest = structuredClone(loadHistoryCase('available').expected.history);
          Object.assign(manifest.state, {
            basis: ref.view.activeBasis,
            repositoryLocatorDigest: ref.view.repositoryLocatorDigest,
            inventory: [],
            contracts: [
              {
                providerId: 'native',
                extractor: 'component-only',
                normalizer: 'component-only',
                contract: 'component-only',
                policy: 'component-only',
              },
            ],
            units: [],
            snapshots: [snapshot],
            nodes: [],
            edges: [],
            supports: [],
            coverage: [],
            syntaxOrigins: [],
          });
          if (writer === 'Native patch') {
            c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
            c.stage.sealNativePatchState(c.expected, c.token, validateNativeRefreshOverlay);
            apply = () =>
              new RepositoryCanonicalFactStore(db).applyNativeAnalysisPatch(
                c.stage,
                {
                  repositoryId: 'r',
                  baseRevisionId: 'rev',
                  baseContentFingerprint: 'base',
                  targetRevisionId: 'rev',
                  targetContentFingerprint: 'base',
                  snapshot: c.snapshot,
                },
                c.token,
              );
          } else {
            const stage = new RepositoryAnalysisStage(db, nativePatchLimits),
              bundle = baseCase('zero-file').bundle,
              { schemaVersion, sourceFileCount, summaryDigest, ...expected } = bundle.header;
            void schemaVersion;
            void sourceFileCount;
            void summaryDigest;
            t.after(() => {
              if (db.isOpen) stage.close();
            });
            stage.confirmSucceeded({
              type: 'ANALYSIS_COMPLETED',
              payload: {
                outcome: 'SUCCEEDED',
                repositoryId: 'r',
                revisionId: 'rev',
                revisionFingerprint: 'base',
                providerSnapshotId: c.snapshot.id,
                capabilities: c.snapshot.capabilities,
                counts: { sourceFiles: 0, nodes: 0, edges: 0, coverage: 0, diagnostics: 0 },
              },
            });
            stage.sealNativeState(
              JSON.stringify(bundle.header),
              expected,
              validateNativeStateCandidate,
              nativePatchLimits,
            );
            const token = captureNativeActivationToken(db, 'r');
            apply = () => {
              try {
                return new RepositoryCanonicalFactStore(db).applyNativeAnalysisBatch(
                  stage,
                  {
                    repositoryId: 'r',
                    revisionId: 'rev',
                    contentFingerprint: 'base',
                    snapshot: c.snapshot,
                  },
                  token,
                );
              } finally {
                stage.close();
              }
            };
          }
        }
        manifest = await installComponentManifest(db, manifest);
        const repositoryId = manifest.state.basis.repositoryId,
          owned = captureActivationContext(db, repositoryId, historyLimits);
        assert.equal(owned.view.status, 'AVAILABLE');
        assert.deepEqual(owned.view.history, manifest);
        const image = () =>
            Object.fromEntries(
              db
                .prepare(
                  "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
                )
                .all()
                .map(({ name }) => [
                  name,
                  db.prepare('SELECT * FROM ' + name + ' ORDER BY rowid').all(),
                ]),
            ),
          before = image();
        let witness = null;
        if (rollback) {
          db.function('h1_pointer_witness', (n) => {
            witness = Number(n);
            return 0;
          });
          db.exec(
            "CREATE TEMP TRIGGER h1_store_failure AFTER INSERT ON main.provider_capabilities BEGIN SELECT h1_pointer_witness((SELECT count(*)FROM active_history_pointer));SELECT RAISE(ABORT,'H1_STORE_ROLLBACK');END",
          );
          await assert.rejects(async () => apply());
          assert.equal(witness, 0, 'real Store reached a point after R011 pointer invalidation');
          assert.deepEqual(image(), before);
          recheckActivationContext(db, owned.handle, historyLimits);
        } else {
          await apply();
          assert.equal(db.prepare('SELECT count(*) AS n FROM active_history_pointer').get().n, 0);
          rejects(
            () => recheckActivationContext(db, owned.handle, historyLimits),
            'HISTORY_CHANGED',
          );
        }
        assert.equal(db.isTransaction, false);
        const after = captureActivationContext(db, repositoryId, historyLimits);
        assert.equal(after.view.status, rollback ? 'AVAILABLE' : 'UNAVAILABLE');
        releaseActivationContext(db, after.handle);
        if (disk) {
          db.close();
          db.open();
          if (rollback) assert.deepEqual(image(), before);
          const reopened = captureActivationContext(db, repositoryId, historyLimits);
          assert.equal(reopened.view.status, rollback ? 'AVAILABLE' : 'UNAVAILABLE');
          releaseActivationContext(db, reopened.handle);
        }
      },
    );
test('R011 raw text byte census rejects malformed UTF8 hidden in canonical contract metadata', async (t) => {
  const { historyFixture, resealManifest, seedLiteral } =
      await import('./helpers/r011-history-fixture.mjs'),
    f = await historyFixture(t, 'available', { seed: false });
  await resealManifest(f.input, (m) => {
    m.state.contracts[0].contract = 'component:\uFFFD';
  });
  const row = f.input.tables.activation_history[0],
    pointer = f.input.tables.active_history_pointer[0];
  f.input.tables.activation_history = [];
  f.input.tables.active_history_pointer = [];
  seedLiteral(f.db, f.input);
  const encoded = Buffer.from(row.manifest_json),
    at = encoded.indexOf(Buffer.from('\uFFFD'));
  assert.ok(at >= 0);
  const raw = Buffer.concat([
    encoded.subarray(0, at),
    Buffer.from([0x80]),
    encoded.subarray(at + 3),
  ]);
  f.db
    .prepare(
      'INSERT INTO activation_history(id,repository_id,revision_id,parent_id,manifest_digest,manifest_json)VALUES(?,?,?,?,?,CAST(? AS TEXT))',
    )
    .run(row.id, row.repository_id, row.revision_id, row.parent_id, row.manifest_digest, raw);
  f.db
    .prepare('INSERT INTO active_history_pointer(repository_id,activation_id)VALUES(?,?)')
    .run(pointer.repository_id, pointer.activation_id);
  rejects(
    () => captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    'INVALID_HISTORY',
  );
});

test('null-basis capture must detect a newly committed snapshot census before full CAS', async (t) => {
  const { seedLiteral } = await import('./helpers/r011-history-fixture.mjs');
  const { captureActivationContext, recheckActivationContext } =
    await import('../dist/analysis/activation-history.js');
  const f = await historyFixture(t, 'available', { seed: false });
  const tables = {};
  for (const k of ['repository', 'repository_state', 'revisions', 'source_files'])
    tables[k] = structuredClone(f.input.tables[k]);
  tables.repository_state[0].indexed_revision_id = null;
  tables.repository_state[0].indexed_content_fingerprint = null;
  seedLiteral(f.db, { tables });
  const c = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  assert.equal(c.view.activeBasis, null);
  const row = structuredClone(f.input.tables.provider_snapshots[0]);
  row.id = 'snapshot:census-new';
  const keys = Object.keys(row);
  f.db
    .prepare(
      'INSERT INTO provider_snapshots(' +
        keys.join(',') +
        ')VALUES(' +
        keys.map(() => '?').join(',') +
        ')',
    )
    .run(...Object.values(row));
  assert.throws(
    () => recheckActivationContext(f.db, c.handle, historyLimits),
    (e) => e.code === 'HISTORY_CHANGED',
  );
});

// Accepted diagnostics compatibility: SQL proves persisted fields; history retains full diagnostics.
for (const severity of ['INFO', 'WARNING'])
  test(
    'complete snapshot ' + severity + ' diagnostics survive capture and disk reopen',
    async (t) => {
      const { nativeEmptyHistoryInput, resealManifest, seedLiteral } =
        await import('./helpers/r011-history-fixture.mjs');
      const { createHash } = await import('node:crypto');
      const { referenceCanonical: C } = await import('./helpers/r011-history-fixture.mjs');
      const f = await historyFixture(t, 'available', { seed: false }),
        input = await nativeEmptyHistoryInput();
      const diagnostics = [
        {
          code: 'COMPONENT_' + severity,
          severity,
          message: 'declared component diagnostic',
          sourceRange: null,
        },
      ];
      await resealManifest(input, (m) => {
        m.state.snapshots[0].diagnostics = diagnostics;
        m.originRegistryDigest = createHash('sha256')
          .update('codeatlas-activation-origins-v1\0' + C(m.state.snapshots))
          .digest('hex');
      });
      seedLiteral(f.db, input);
      for (const db of [f.db, f.reopen(true)]) {
        const c = captureActivationContext(db, input.repositoryId, historyLimits);
        assert.equal(c.view.status, 'AVAILABLE');
        assert.deepEqual(c.view.history.state.snapshots[0].diagnostics, diagnostics);
        releaseActivationContext(db, c.handle);
      }
    },
  );
for (const field of ['startedAt', 'completedAt'])
  test(
    'snapshot persisted ' + field + ' drift still rejects when Code identity is unchanged',
    async (t) => {
      const {
        nativeEmptyHistoryInput,
        resealManifest,
        seedLiteral,
        referenceCanonical: C,
      } = await import('./helpers/r011-history-fixture.mjs');
      const { createHash } = await import('node:crypto');
      const f = await historyFixture(t, 'available', { seed: false }),
        input = await nativeEmptyHistoryInput();
      await resealManifest(input, (m) => {
        const s = m.state.snapshots[0];
        s[field] = new Date(Date.parse(s[field]) + 1).toISOString();
        m.originRegistryDigest = createHash('sha256')
          .update('codeatlas-activation-origins-v1\0' + C(m.state.snapshots))
          .digest('hex');
      });
      seedLiteral(f.db, input);
      rejects(
        () => captureActivationContext(f.db, input.repositoryId, historyLimits),
        'INVALID_HISTORY',
      );
    },
  );

for (const [field, value] of [
  ['id', 'snapshot:diagnostics-other'],
  ['repositoryId', 'repo:diagnostics-other'],
  ['providerId', 'provider:diagnostics-other'],
  ['providerVersion', 'diagnostics-other-version'],
  ['runtimeVersion', 'diagnostics-other-runtime'],
  ['requestedRevisionId', 'revision:diagnostics-other'],
  ['requestedRevisionFingerprint', 'content:diagnostics-other'],
  ['outcome', 'FAILED'],
  ['capabilities.name', 'DIAGNOSTICS_OTHER_CAPABILITY'],
  ['capabilities.support', 'UNSUPPORTED'],
  ['capabilities.coverage', 'PARTIAL'],
])
  test(
    'diagnostics compatibility still refuses persisted snapshot field drift ' + field,
    async (t) => {
      const {
          nativeEmptyHistoryInput,
          resealManifest,
          seedLiteral,
          referenceCanonical: C,
        } = await import('./helpers/r011-history-fixture.mjs'),
        { createHash } = await import('node:crypto');
      const f = await historyFixture(t, 'available', { seed: false }),
        input = await nativeEmptyHistoryInput();
      await resealManifest(input, (m) => {
        const s = m.state.snapshots[0],
          previous = s.id;
        if (field.startsWith('capabilities.')) s.capabilities[0][field.split('.')[1]] = value;
        else s[field] = value;
        if (field === 'id')
          for (const c of m.state.coverage)
            if (c.originSnapshotId === previous) c.originSnapshotId = value;
        m.originRegistryDigest = createHash('sha256')
          .update('codeatlas-activation-origins-v1\0' + C(m.state.snapshots))
          .digest('hex');
      });
      seedLiteral(f.db, input);
      rejects(
        () => captureActivationContext(f.db, input.repositoryId, historyLimits),
        'INVALID_HISTORY',
      );
    },
  );

for (const id of ['available', 'syntax-ancestor', 'legacy'])
  test('private owned Stage readset is complete, bounded and read-only ' + id, async (t) => {
    const api = await import('../dist/analysis/activation-history.js'),
      f = await historyFixture(t, id),
      before = persistentRows(f.db),
      c = api.captureActivationContext(f.db, f.input.repositoryId, historyLimits);
    assert.equal(typeof api.default, 'function');
    const d = api.default(f.db, c.handle, historyLimits);
    assert.deepEqual(d.data.view, c.view);
    assert.ok(Object.isFrozen(d.data));
    assert.deepEqual(
      d.data.snapshotRows,
      f.db
        .prepare('SELECT * FROM provider_snapshots WHERE repository_id=? ORDER BY rowid')
        .all(f.input.repositoryId),
    );
    assert.deepEqual(
      d.data.capabilityRows,
      f.db
        .prepare(
          'SELECT * FROM provider_capabilities WHERE snapshot_id IN(SELECT id FROM provider_snapshots WHERE repository_id=?) ORDER BY rowid',
        )
        .all(f.input.repositoryId),
    );
    assert.deepEqual(
      d.data.coverageRows,
      f.db
        .prepare(
          'SELECT * FROM analysis_coverage WHERE provider_snapshot_id IN(SELECT id FROM provider_snapshots WHERE repository_id=?) ORDER BY rowid',
        )
        .all(f.input.repositoryId),
    );
    assert.deepEqual(d.data.snapshotIds, d.data.snapshotRows.map((x) => x.id).sort());
    assert.equal(d.data.snapshotIds.length, d.committedSnapshotCount);
    assert.deepEqual(
      d.data.historyRows,
      f.db
        .prepare('SELECT * FROM activation_history WHERE repository_id=? ORDER BY rowid')
        .all(f.input.repositoryId),
    );
    if (c.view.history) {
      assert.deepEqual(d.data.archive[0], c.view.history);
      assert.equal(d.data.origins.length, c.view.history.syntaxMembers.length);
      assert.equal(d.data.projections.length, c.view.history.syntaxMembers.length);
    }
    assert.ok(
      d.usage.rows > 0 &&
        d.usage.items > 0 &&
        d.usage.serializedBytes > 0 &&
        d.usage.retainedLogicalBytes > 0,
    );
    api.recheckActivationContext(f.db, c.handle, historyLimits);
    assert.deepEqual(persistentRows(f.db), before);
    assert.equal(f.db.isTransaction, false);
  });
test('private Stage readset rejects clone, foreign DB, released handle and caller transaction', async (t) => {
  const api = await import('../dist/analysis/activation-history.js'),
    f = await historyFixture(t, 'syntax-ancestor'),
    g = await historyFixture(t, 'available');
  assert.equal(typeof api.default, 'function');
  const c = api.captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  for (const [db, h] of [
    [f.db, {}],
    [g.db, c.handle],
    [f.db, new Proxy(c.handle, {})],
  ])
    assert.throws(
      () => api.default(db, h, historyLimits),
      (e) => e.message === e.code,
    );
  api.releaseActivationContext(f.db, c.handle);
  assert.throws(
    () => api.default(f.db, c.handle, historyLimits),
    (e) => e.code === 'HISTORY_RELEASED',
  );
  const d = api.captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  f.db.exec('BEGIN');
  assert.throws(
    () => api.default(f.db, d.handle, historyLimits),
    (e) => e.message === e.code,
  );
  assert.equal(f.db.isTransaction, true);
  f.db.exec('ROLLBACK');
});
test('private Stage rereads retain capture and every previous readset consumption', async (t) => {
  const api = await import('../dist/analysis/activation-history.js'),
    f = await historyFixture(t, 'syntax-ancestor');
  assert.equal(typeof api.default, 'function');
  const c = api.captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    a = api.default(f.db, c.handle, historyLimits),
    b = api.default(f.db, c.handle, historyLimits),
    d = api.default(f.db, c.handle, historyLimits);
  for (const key of ['rows', 'serializedBytes', 'items', 'retainedLogicalBytes']) {
    assert.ok(b.usage[key] > a.usage[key]);
    assert.equal(d.usage[key] - b.usage[key], b.usage[key] - a.usage[key]);
  }
  assert.equal(a.identity, b.identity);
  assert.equal(b.identity, d.identity);
  const exact = {
    ...historyLimits,
    maxRows: a.usage.rows,
    maxSerializedBytes: a.usage.serializedBytes,
    maxItems: a.usage.items,
    memoryBudgetBytes: a.usage.retainedLogicalBytes * 2,
  };
  const fresh = api.captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  assert.deepEqual(api.default(f.db, fresh.handle, exact).usage, a.usage);
  for (const key of ['maxRows', 'maxSerializedBytes', 'maxItems', 'memoryBudgetBytes']) {
    const h = api.captureActivationContext(f.db, f.input.repositoryId, historyLimits);
    assert.throws(
      () => api.default(f.db, h.handle, { ...exact, [key]: exact[key] - 1 }),
      (e) => e.code === 'HISTORY_LIMIT_EXCEEDED',
    );
    assert.throws(
      () => api.default(f.db, h.handle, historyLimits),
      (e) => e.code === 'HISTORY_RELEASED',
    );
  }
});

test('private Stage readset refuses changed capture and reopened connection incarnation', async (t) => {
  const api = await import('../dist/analysis/activation-history.js'),
    f = await historyFixture(t, 'available'),
    before = persistentRows(f.db),
    c = api.captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  f.db
    .prepare('DELETE FROM active_history_pointer WHERE repository_id=?')
    .run(f.input.repositoryId);
  assert.throws(
    () => api.default(f.db, c.handle, historyLimits),
    (e) => e.code === 'HISTORY_CHANGED',
  );
  assert.equal(f.db.isTransaction, false);
  assert.deepEqual(persistentRows(f.db), { ...before, active_history_pointer: [] });
  const g = await historyFixture(t, 'syntax-ancestor'),
    h = api.captureActivationContext(g.db, g.input.repositoryId, historyLimits),
    beforeReopen = persistentRows(g.db);
  g.db.close();
  g.db.open();
  assert.throws(
    () => api.default(g.db, h.handle, historyLimits),
    (e) => e.code === 'HISTORY_RELEASED',
  );
  assert.deepEqual(persistentRows(g.db), beforeReopen);
});
