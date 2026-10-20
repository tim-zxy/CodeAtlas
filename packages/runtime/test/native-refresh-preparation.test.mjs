import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import * as storage from '../../storage/dist/index.js';
import * as providers from '../../providers/dist/index.js';
import { SourceStateError } from '../../storage/dist/source-state/errors.js';
import { baseCase, stateDigest } from '../../providers/test/helpers/native-full-v3-corpus.mjs';

const preparation = await import('../dist/native-refresh-preparation.js').catch((error) => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const limits = { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 1_000_000_000 };
const options = { executablePath: process.execPath, timeoutMs: 1000 };

test('offline old-policy baseline explicitly requires FULL and preserves activation', async (t) => {
  await withBaseline(t, async (db, base) => {
    const legacy = { ...base.bundle.header, normalizerVersion: '1' };
    db.prepare('UPDATE native_analysis_state SET header_json=?').run(JSON.stringify(legacy));
    const before = db.prepare('SELECT * FROM native_analysis_state').all();
    const pointer = db.prepare('SELECT * FROM repository_state').all();
    const context = invocation(base, 'base');
    const baseline = read(db, context.trustedContext);
    assert.deepEqual(baseline, { status: 'UNAVAILABLE', reason: 'INCOMPATIBLE' });
    assert.throws(() => prepare(context, baseline), { code: 'FULL_ANALYSIS_REQUIRED' });
    assert.deepEqual(db.prepare('SELECT * FROM native_analysis_state').all(), before);
    assert.deepEqual(db.prepare('SELECT * FROM repository_state').all(), pointer);
  });
});
const lifetime = await import('../../storage/dist/analysis/native-apply-sql-observation.js');
const lifetimeRequirement = (family, role = 'MAIN', disposition = 'OBSERVED') => ({
  family,
  role,
  disposition,
});

test('D5 replay worker composite numeric refusal preserves observed inventory and no-TEXT preparation', async (t) => {
  await withBaseline(t, async (db, base) => {
    db.prepare(
      "UPDATE native_analysis_file SET summary_json=json_quote(printf('%.*c',1000000,'x'))",
    ).run();
    const context = invocation(base, 'base');
    const captured = await lifetime.observeNativeSqlLifetime(() => {
      const baseline = read(db, context.trustedContext);
      assert.deepEqual(baseline, { status: 'UNAVAILABLE', reason: 'RESOURCE_LIMIT_EXCEEDED' });
      return preparation.createNativeRefreshPreparation(
        context,
        baseline,
        limits.memoryBudgetBytes,
        options,
      );
    }, [
      lifetimeRequirement('BASELINE_READ'),
      lifetimeRequirement('PREPARATION', 'MAIN', 'PROVEN_NO_TEXT'),
    ]);
    assert.equal(captured.threw, true);
    assert.equal(captured.error.nativeStateReason, 'RESOURCE_LIMIT_EXCEEDED');
    assert.equal(captured.error.message, 'Native refresh baseline unavailable');
    assert.equal(captured.evidence.coverageComplete, true);
    assert.ok(
      captured.evidence.retainedSqlBytes > 0,
      'Composite Source inventory was really selected',
    );
    assert.deepEqual(
      captured.evidence.coverage.map((entry) => entry.disposition),
      ['OBSERVED', 'PROVEN_NO_TEXT'],
    );
  });
});

function lifetimeOracle(db) {
  const inventory = inventorySqlRows(db).reduce((sum, row) => sum + row.bytes, 0);
  const baseline = readOwnershipOracle(db);
  return {
    peak: Math.max(...baseline.map(([, bytes]) => bytes + 19 + inventory)),
    returned: baseline.at(-1)[1] + inventory,
  };
}

test('D5 lifetime family failed_prepare_after_read_return retains source prefix', async (t) => {
  await withBaseline(t, async (db, base) => {
    const oracle = lifetimeOracle(db);
    const result = await lifetime.observeNativeSqlLifetime(() => {
      const context = invocation(base, 'base');
      const baseline = read(db, context.trustedContext);
      preparation.createNativeRefreshPreparation(
        { ...context, unexpected: true },
        baseline,
        limits.memoryBudgetBytes,
        options,
      );
    }, [lifetimeRequirement('BASELINE_READ'), lifetimeRequirement('PREPARATION')]);
    assert.equal(result.threw, true);
    assert.equal(result.error.code, 'INVALID_REQUEST');
    assert.equal(result.captureFailed, false);
    assert.equal(result.evidence.coverageComplete, true);
    assert.equal(result.evidence.retainedSqlBytes, oracle.peak);
    assert.equal(result.evidence.retainedSqlStringChargeBytes, 2 * oracle.peak);
    assert.equal(db.isTransaction, false);
  });
});

test('D5 lifetime family main_competitor_coexist counts independent read once', async (t) => {
  await withBaseline(t, async (db, base) => {
    const oracle = lifetimeOracle(db);
    assert.equal(typeof lifetime.withNativeSqlSourceRole, 'function', 'private role scope missing');
    assert.equal(
      typeof lifetime.endNativeSqlSourceFor,
      'function',
      'private source settlement missing',
    );
    const result = await lifetime.observeNativeSqlLifetime(() => {
      const context = invocation(base, 'base');
      const main = preparation.createNativeRefreshPreparation(
        context,
        read(db, context.trustedContext),
        limits.memoryBudgetBytes,
        options,
      );
      lifetime.withNativeSqlSourceRole('COMPETITOR', () => {
        const competitor = preparation.createNativeRefreshPreparation(
          context,
          read(db, context.trustedContext),
          limits.memoryBudgetBytes,
          options,
        );
        lifetime.endNativeSqlSourceFor(competitor);
      });
      lifetime.endNativeSqlSourceFor(main);
    }, [
      lifetimeRequirement('BASELINE_READ'),
      lifetimeRequirement('PREPARATION'),
      lifetimeRequirement('BASELINE_READ', 'COMPETITOR'),
      lifetimeRequirement('PREPARATION', 'COMPETITOR'),
    ]);
    assert.equal(result.captureFailed, false);
    assert.equal(result.evidence.coverageComplete, true);
    assert.equal(result.evidence.retainedSqlBytes, oracle.returned + oracle.peak);
  });
});

test('D5 lifetime family retry_without_apply transfers aliases without inventing Apply', async (t) => {
  await withBaseline(t, async (db, base) => {
    const oracle = lifetimeOracle(db);
    assert.equal(typeof lifetime.withNativeSqlSourceRole, 'function');
    assert.equal(typeof lifetime.endNativeSqlSourceFor, 'function');
    const result = await lifetime.observeNativeSqlLifetime(
      () =>
        lifetime.withNativeSqlSourceRole('RETRY', () => {
          const context = invocation(base, 'base');
          const prepared = preparation.createNativeRefreshPreparation(
            context,
            read(db, context.trustedContext),
            limits.memoryBudgetBytes,
            options,
          );
          lifetime.endNativeSqlSourceFor(prepared);
        }),
      [
        lifetimeRequirement('BASELINE_READ', 'RETRY'),
        lifetimeRequirement('PREPARATION', 'RETRY'),
        lifetimeRequirement('APPLY', 'RETRY'),
      ],
    );
    assert.equal(result.captureFailed, false);
    assert.equal(result.evidence.coverageComplete, false);
    assert.equal(result.evidence.retainedSqlBytes, null);
    assert.deepEqual(
      result.evidence.coverage.map((row) => row.disposition),
      ['OBSERVED', 'OBSERVED', 'UNKNOWN'],
    );
    assert.ok(oracle.peak > oracle.returned);
  });
});

test('D5 lifetime family failed_prefix measures corrupt inventory before decode', async (t) => {
  await withBaseline(t, async (db, base, reopen) => {
    db.prepare('UPDATE source_files SET language_hint=?').run(' ');
    const prefix = 19 + inventorySqlRows(db)[0].bytes;
    const before = persistentImage(db);
    const result = await lifetime.observeNativeSqlLifetime(
      () => read(db, invocation(base, 'base').trustedContext),
      [lifetimeRequirement('BASELINE_READ')],
    );
    assert.deepEqual(result.value, { status: 'UNAVAILABLE', reason: 'INVALID' });
    assert.equal(result.evidence.coverageComplete, true);
    assert.equal(result.evidence.retainedSqlBytes, prefix);
    assert.deepEqual(persistentImage(reopen()), before);
  });
});

test('D5 lifetime family numeric_no_text is positively proved at refusal', async (t) => {
  await withBaseline(t, async (db, base) => {
    const result = await lifetime.observeNativeSqlLifetime(
      () => read(db, invocation(base, 'base').trustedContext, { ...limits, memoryBudgetBytes: 1 }),
      [lifetimeRequirement('BASELINE_READ', 'MAIN', 'PROVEN_NO_TEXT')],
    );
    assert.deepEqual(result.value, { status: 'UNAVAILABLE', reason: 'RESOURCE_LIMIT_EXCEEDED' });
    assert.equal(result.evidence.coverageComplete, true);
    assert.equal(result.evidence.retainedSqlBytes, 0);
    assert.equal(result.evidence.coverage[0].disposition, 'PROVEN_NO_TEXT');
    assert.ok(result.evidence.coverage[0].cause.length > 0);
  });
});

test('D5 lifetime family failed_prefix preserves primitive callback errors', async (t) => {
  await withBaseline(t, async (db, base) => {
    for (const failure of [0, null, undefined, '']) {
      const result = await lifetime.observeNativeSqlLifetime(
        () =>
          storage.readNativeRefreshBaseline(
            db,
            invocation(base, 'base').trustedContext,
            providers.validateNativeStateCandidate,
            limits,
            undefined,
            undefined,
            () => {
              throw failure;
            },
          ),
        [lifetimeRequirement('BASELINE_READ')],
      );
      assert.equal(result.threw, true);
      assert.strictEqual(result.error, failure);
      assert.equal(result.evidence.coverageComplete, true);
      assert.equal(result.evidence.retainedSqlBytes, 7);
      assert.equal(result.captureFailed, false);
      assert.equal(db.isTransaction, false);
    }
  });
});

test('D5 lifetime family nested_alias_transfer settles preparation on kernel refusal', async (t) => {
  const workspace = await import('../dist/native-refresh-workspace.js');
  await withBaseline(t, async (db, base, reopen) => {
    const before = persistentImage(db);
    const oracle = lifetimeOracle(db);
    const result = await lifetime.observeNativeSqlLifetime(async () => {
      const context = invocation(base, 'base');
      const prepared = prepare(context, read(db, context.trustedContext));
      return workspace.applyPreparedNativeRefreshAnalysisV3(db, prepared, {
        ...options,
        timeoutMs: 0,
      });
    }, [
      lifetimeRequirement('BASELINE_READ'),
      lifetimeRequirement('PREPARATION'),
      ...['COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'].map((family) => ({
        family,
        role: 'MAIN',
        disposition: 'PROVEN_NOT_REACHED',
      })),
    ]);
    assert.equal(result.threw, true);
    assert.equal(result.error.code, 'INVALID_CONFIGURATION');
    assert.equal(result.captureFailed, false);
    assert.deepEqual(
      result.evidence.coverage.slice(2).map((item) => item.disposition),
      ['PROVEN_NOT_REACHED', 'PROVEN_NOT_REACHED', 'PROVEN_NOT_REACHED', 'PROVEN_NOT_REACHED'],
    );
    assert.equal(result.evidence.coverageComplete, true);
    assert.equal(result.evidence.retainedSqlBytes, oracle.peak);
    assert.equal(db.isTransaction, false);
    assert.deepEqual(persistentImage(reopen()), before);
  });
});

test('D5 lifetime family missing_family_event refuses final worker coverage', async (t) => {
  const worker = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(
    typeof worker.captureRefreshSourceLifetime,
    'function',
    'private source capture adapter missing',
  );
  await withBaseline(t, async (db, base) => {
    const result = await worker.captureRefreshSourceLifetime(() => {
      const context = invocation(base, 'base');
      const prepared = prepare(context, read(db, context.trustedContext));
      lifetime.endNativeSqlSourceFor(prepared);
      return false;
    }, [
      lifetimeRequirement('BASELINE_READ'),
      lifetimeRequirement('PREPARATION'),
      lifetimeRequirement('APPLY'),
    ]);
    assert.strictEqual(result.value, false);
    assert.equal(result.threw, false);
    assert.equal(result.evidence.coverageComplete, false);
    assert.equal(result.evidence.retainedSqlBytes, null);
    assert.equal(result.evidence.coverage[2].disposition, 'UNKNOWN');
  });
});

test('D5 lifetime family nested captures do not inherit a competitor role', async (t) => {
  await withBaseline(t, async (db, base) => {
    const oracle = lifetimeOracle(db);
    let nested;
    const result = await lifetime.observeNativeSqlLifetime(
      () =>
        lifetime.withNativeSqlSourceRole('COMPETITOR', async () => {
          const context = invocation(base, 'base');
          const competitor = prepare(context, read(db, context.trustedContext));
          nested = await lifetime.observeNativeSqlLifetime(() => {
            const own = prepare(context, read(db, context.trustedContext));
            lifetime.endNativeSqlSourceFor(own);
          }, [lifetimeRequirement('BASELINE_READ'), lifetimeRequirement('PREPARATION')]);
          lifetime.endNativeSqlSourceFor(competitor);
        }),
      [
        lifetimeRequirement('BASELINE_READ', 'COMPETITOR'),
        lifetimeRequirement('PREPARATION', 'COMPETITOR'),
      ],
    );
    for (const capture of [result, nested]) {
      assert.equal(capture.threw, false);
      assert.equal(capture.captureFailed, false);
      assert.equal(capture.evidence.coverageComplete, true);
      assert.equal(capture.evidence.retainedSqlBytes, oracle.peak);
    }
  });
});

test('D5 lifetime family source census precedes reentrant retention callbacks', async (t) => {
  await withBaseline(t, async (db, base) => {
    const oracle = lifetimeOracle(db);
    const context = invocation(base, 'base');
    for (const callbackKind of ['inventory', 'read']) {
      let called = false;
      const callback = (bytes) => {
        if (called) return;
        called = true;
        assert.equal(bytes, 7);
        lifetime.withNativeSqlSourceRole('COMPETITOR', () => {
          const competitor = prepare(context, read(db, context.trustedContext));
          lifetime.endNativeSqlSourceFor(competitor);
        });
      };
      const capture = await lifetime.observeNativeSqlLifetime(() => {
        const baseline = storage.readNativeRefreshBaseline(
          db,
          context.trustedContext,
          providers.validateNativeStateCandidate,
          limits,
          callbackKind === 'inventory' ? callback : undefined,
          callbackKind === 'read' ? callback : undefined,
        );
        lifetime.endNativeSqlSourceFor(prepare(context, baseline));
      }, [
        lifetimeRequirement('BASELINE_READ'),
        lifetimeRequirement('PREPARATION'),
        lifetimeRequirement('BASELINE_READ', 'COMPETITOR'),
        lifetimeRequirement('PREPARATION', 'COMPETITOR'),
      ]);
      assert.equal(called, true);
      assert.equal(capture.threw, false);
      assert.equal(capture.captureFailed, false);
      assert.equal(capture.evidence.coverageComplete, true);
      assert.equal(capture.evidence.retainedSqlBytes, 7 + oracle.peak);
    }
  });
});

test('D5 lifetime family reentrant token callback uses current row not cumulative history', async (t) => {
  await withBaseline(t, async (db, base) => {
    addTokenProvider(db, base, 'aaa');
    const oracle = lifetimeOracle(db);
    const inventory = inventorySqlRows(db).reduce((sum, row) => sum + row.bytes, 0);
    const currentTokenRow = readOwnershipOracle(db)
      .filter(([phase]) => phase === 'TOKEN_ROW')
      .at(-1)[1];
    const lastCallback =
      2 + base.request.payload.sourceFiles.length + 4 + base.bundle.summaries.length + 2;
    const context = invocation(base, 'base');
    let callbacks = 0;
    const capture = await lifetime.observeNativeSqlLifetime(() => {
      const baseline = storage.readNativeRefreshBaseline(
        db,
        context.trustedContext,
        providers.validateNativeStateCandidate,
        limits,
        undefined,
        () => {
          callbacks++;
          if (callbacks !== lastCallback) return;
          lifetime.withNativeSqlSourceRole('COMPETITOR', () => {
            const competitor = prepare(context, read(db, context.trustedContext));
            lifetime.endNativeSqlSourceFor(competitor);
          });
        },
      );
      lifetime.endNativeSqlSourceFor(prepare(context, baseline));
    }, [
      lifetimeRequirement('BASELINE_READ'),
      lifetimeRequirement('PREPARATION'),
      lifetimeRequirement('BASELINE_READ', 'COMPETITOR'),
      lifetimeRequirement('PREPARATION', 'COMPETITOR'),
    ]);
    assert.equal(callbacks, lastCallback);
    assert.equal(capture.threw, false);
    assert.equal(capture.captureFailed, false);
    assert.equal(capture.evidence.coverageComplete, true);
    assert.equal(capture.evidence.retainedSqlBytes, 19 + inventory + currentTokenRow + oracle.peak);
  });
});

function invocation(base, fingerprint = 'target') {
  const p = base.request.payload;
  const { schemaVersion, sourceFileCount, summaryDigest, ...expected } = base.bundle.header;
  return {
    requestId: 'refresh-preparation',
    descriptor: {
      providerId: 'native',
      providerVersion: '0.0.0',
      runtimeVersion: '0.0.0',
      protocolVersions: [1, 2, 3],
      irSchemaVersions: [1],
      capabilities: ['SYMBOL'],
      languages: [expected.language],
      limits: { maxLineBytes: 1_000_000, maxEventCount: 10_000, maxTotalBytes: 10_000_000 },
      build: { target: 'fixture', profile: 'debug' },
    },
    trustedContext: { ...expected, contentFingerprint: fingerprint },
    payload: {
      irSchemaVersion: 1,
      providerSnapshotId: 'refresh-snapshot',
      repository: p.repository,
      requestedCapabilities: p.requestedCapabilities,
      deadlineEpochMs: null,
      resourceBudget: p.resourceBudget,
      analysisStateContext: p.analysisStateContext,
      targetRevision: { ...p.revision, contentFingerprint: fingerprint },
    },
  };
}

async function withBaseline(t, run, mode = 'empty') {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-refresh-preparation-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'repo.sqlite');
  await storage.runMigrations({
    databasePath,
    databaseKind: 'REPOSITORY',
    manifestUrl: new URL('../../storage/migrations/repository/manifest.json', import.meta.url),
  });
  const base = baseCase(mode === 'utf8' ? 'empty' : mode);
  base.request.payload.analysisStateContext.normalizerVersion = '2';
  base.bundle.header.normalizerVersion = '2';
  if (mode === 'utf8') {
    base.request.payload.sourceFiles[0].path = 'src/中文😀.java';
    base.bundle.summaries[0].sourceFile.path = 'src/中文😀.java';
    base.bundle.header.summaryDigest = stateDigest(base.bundle.summaries);
  }
  let db = new DatabaseSync(databasePath);
  db.exec(`
    INSERT INTO repository(slot,id,root_path) VALUES(1,'r','/repo');
    INSERT INTO repository_state(repository_id,indexed_revision_id,indexed_content_fingerprint)
      VALUES('r','rev','base');
    INSERT INTO revisions(id,repository_id,kind,content_fingerprint) VALUES('rev','r','WORKTREE','base');
    INSERT INTO provider_snapshots(id,repository_id,provider_id,provider_version,runtime_version,
      requested_revision_id,requested_revision_fingerprint,started_at,completed_at,outcome)
      VALUES('snap','r','native','0.0.0','0.0.0','rev','base',1,2,'SUCCEEDED');
  `);
  new storage.RepositorySourceStateStore(db).replace(
    new storage.RepositorySourceStateStore(db).load('r'),
    { revision: base.request.payload.revision, files: base.request.payload.sourceFiles },
  );
  db.prepare('INSERT INTO native_analysis_state VALUES(?,?,?,?,?,?)').run(
    'r',
    'native',
    'snap',
    'rev',
    'base',
    JSON.stringify(base.bundle.header),
  );
  for (const summary of base.bundle.summaries) {
    const f = summary.sourceFile;
    db.prepare('INSERT INTO native_analysis_file VALUES(?,?,?,?,?,?)').run(
      'r',
      'native',
      f.id,
      f.path,
      f.contentFingerprint,
      JSON.stringify(summary),
    );
  }
  const reopen = () => {
    db.close();
    db = new DatabaseSync(databasePath);
    return db;
  };
  try {
    await run(db, base, reopen, databasePath);
  } finally {
    db.close();
  }
}

function read(db, context, budget = limits, validate = providers.validateNativeStateCandidate) {
  assert.equal(typeof storage.readNativeRefreshBaseline, 'function', 'D1 consistent-read port');
  return storage.readNativeRefreshBaseline(db, context, validate, budget);
}
function prepare(context, baseline) {
  assert.equal(
    typeof preparation.createNativeRefreshPreparation,
    'function',
    'D1 pure preparation',
  );
  // Offline component proof only, not admitted Runtime acceptance.
  return preparation.createNativeRefreshPreparation(
    context,
    baseline,
    limits.memoryBudgetBytes,
    options,
  );
}
function reconcile(db, next) {
  const store = new storage.RepositorySourceStateStore(db);
  store.replace(store.load('r'), next);
}

const cases = {
  refuses_before_opener_or_SQL() {
    assert.equal(typeof preparation.prepareNativeRefreshAnalysisV3, 'function', 'D1 guarded entry');
    for (const [budget, code] of [
      [0, 'INVALID_CONFIGURATION'],
      [-1, 'INVALID_CONFIGURATION'],
      [NaN, 'INVALID_CONFIGURATION'],
      [Infinity, 'INVALID_CONFIGURATION'],
      [Number.MAX_SAFE_INTEGER + 1, 'INVALID_CONFIGURATION'],
      [1, 'RESOURCE_LIMIT_EXCEEDED'],
      [Number.MAX_SAFE_INTEGER, 'RESOURCE_LIMIT_EXCEEDED'],
    ]) {
      let observations = 0;
      const unopened = new Proxy(
        {},
        {
          get() {
            observations++;
            throw Error('premature observation');
          },
        },
      );
      assert.throws(
        () =>
          preparation.prepareNativeRefreshAnalysisV3(
            unopened,
            budget,
            () => {
              observations++;
              throw Error('premature opener');
            },
            unopened,
          ),
        (error) => error.code === code || error.nativeStateReason === code,
      );
      assert.equal(observations, 0);
    }
  },
  async indexed_delta_survives_failed_apply_and_empty_rescan(t) {
    await withBaseline(t, async (db, base, reopen) => {
      const next = {
        revision: { ...base.request.payload.revision, contentFingerprint: 'target' },
        files: base.request.payload.sourceFiles.map((f) => ({
          ...f,
          contentFingerprint: 'new-file',
        })),
      };
      reconcile(db, next);
      db.exec("BEGIN; UPDATE repository_state SET indexed_content_fingerprint='target'; ROLLBACK;");
      reconcile(db, next); // An identical rescan is empty; indexed state is still old.
      db = reopen();
      const context = invocation(base);
      const result = read(db, context.trustedContext);
      assert.equal(result.status, 'AVAILABLE');
      assert.equal(result.state.expected.contentFingerprint, 'base');
      assert.equal(result.token.indexedContentFingerprint, 'base');
      const prepared = prepare(context, result);
      assert.equal(prepared.request.payload.baseRevisionFingerprint, 'base');
      assert.equal(prepared.request.payload.targetRevision.contentFingerprint, 'target');
      assert.deepEqual(prepared.request.payload.changes, {
        added: [],
        modified: next.files,
        deleted: [],
      });
      assert.equal(Object.isFrozen(prepared.request.payload.changes.modified[0]), true);
      context.payload.targetRevision.contentFingerprint = 'caller-mutated';
      assert.equal(prepared.request.payload.targetRevision.contentFingerprint, 'target');
      assert.equal(
        db.prepare('SELECT indexed_content_fingerprint AS fp FROM repository_state').get().fp,
        'base',
      );
    });
  },
  async complete_metadata_and_stable_identity(t) {
    await withBaseline(t, async (db, base) => {
      const original = base.request.payload.sourceFiles[0];
      for (const patch of [
        { classification: { ...original.classification, role: 'TEST' } },
        { classification: { ...original.classification, provenance: 'GENERATED' } },
        { classification: { ...original.classification, contentKind: 'BINARY' } },
        { languageHint: 'other' },
        { sensitivity: 'INTERNAL' },
      ]) {
        const changed = { ...original, ...patch };
        reconcile(db, {
          revision: { ...base.request.payload.revision, contentFingerprint: 'target' },
          files: [changed],
        });
        const context = invocation(base);
        assert.deepEqual(
          prepare(context, read(db, context.trustedContext)).request.payload.changes.modified,
          [changed],
        );
      }
      const renamed = { ...original, id: 'renamed-id', path: 'src/renamed.java' };
      reconcile(db, {
        revision: { ...base.request.payload.revision, contentFingerprint: 'target' },
        files: [renamed],
      });
      const context = invocation(base);
      assert.deepEqual(prepare(context, read(db, context.trustedContext)).request.payload.changes, {
        added: [renamed],
        modified: [],
        deleted: [{ id: 'f-0', path: 'src/0.java', previousContentFingerprint: 'fp-0' }],
      });
      reconcile(db, {
        revision: { ...base.request.payload.revision, contentFingerprint: 'target' },
        files: [{ ...original, id: 'replacement' }],
      });
      assert.throws(() => prepare(context, read(db, context.trustedContext)), {
        code: 'INVALID_REQUEST',
      });
    });
  },
  async same_worktree_legacy_and_corruption_reasons(t) {
    await withBaseline(t, async (db, base) => {
      const context = invocation(base, 'base');
      assert.deepEqual(read(db, { ...context.trustedContext, revisionId: 'different' }), {
        status: 'UNAVAILABLE',
        reason: 'NOT_APPLICABLE',
      });
      assert.deepEqual(read(db, { ...context.trustedContext, policyFingerprint: 'different' }), {
        status: 'UNAVAILABLE',
        reason: 'INCOMPATIBLE',
      });
      assert.deepEqual(read(db, context.trustedContext, { ...limits, maxSerializedBytes: 1 }), {
        status: 'UNAVAILABLE',
        reason: 'RESOURCE_LIMIT_EXCEEDED',
      });
      let parses = 0;
      db.prepare('UPDATE source_files SET language_hint=?').run('x'.repeat(1_000_001));
      assert.deepEqual(
        read(db, context.trustedContext, limits, () => {
          parses++;
          throw Error('unexpected parse');
        }),
        { status: 'UNAVAILABLE', reason: 'RESOURCE_LIMIT_EXCEEDED' },
      );
      assert.equal(parses, 0);
      db.prepare('UPDATE source_files SET language_hint=?').run('java');
      db.prepare('UPDATE source_files SET language_hint=?').run(' ');
      assert.deepEqual(read(db, context.trustedContext), {
        status: 'UNAVAILABLE',
        reason: 'INVALID',
      });
      db.prepare('UPDATE source_files SET language_hint=?').run('java');
      db.exec("UPDATE native_analysis_state SET header_json='{}'");
      assert.deepEqual(read(db, context.trustedContext), {
        status: 'UNAVAILABLE',
        reason: 'INVALID',
      });
      db.exec('DELETE FROM native_analysis_state');
      assert.deepEqual(read(db, context.trustedContext), {
        status: 'UNAVAILABLE',
        reason: 'MISSING',
      });
      db.exec('DROP TABLE native_analysis_file');
      assert.deepEqual(read(db, context.trustedContext), {
        status: 'UNAVAILABLE',
        reason: 'INVALID',
      });
    });
    await withBaseline(t, async (db, base) => {
      const context = invocation(base, 'base');
      // Native support with no R009 candidate is legacy/unprovable, not an empty baseline.
      db.exec(`
        INSERT INTO canonical_nodes(revision_id,id,repository_id,fact_key,kind,name,confidence_score,confidence_method,confidence_reasons_json)
          VALUES('rev','node','r','key','MODULE','Old',1,'exact','[]');
        INSERT INTO evidence(id,repository_id,revision_id,provider_snapshot_id,fact_type,provider_id,provider_fact_id,status)
          VALUES('ev','r','rev','snap','NODE','native','fact','ACTIVE');
        INSERT INTO provider_fact_bindings(fact_type,provider_id,provider_fact_id,provider_snapshot_id,canonical_fact_id,evidence_id)
          VALUES('NODE','native','fact','snap','node','ev');
      `);
      assert.deepEqual(read(db, context.trustedContext), {
        status: 'UNAVAILABLE',
        reason: 'MISSING',
      });
      assert.throws(() => prepare(context, read(db, context.trustedContext)), {
        code: 'FULL_ANALYSIS_REQUIRED',
      });
      db.exec('PRAGMA user_version=9');
      assert.deepEqual(read(db, context.trustedContext), {
        status: 'UNAVAILABLE',
        reason: 'MISSING',
      });
    });
  },
  async empty_delta_is_observed_not_skipped(t) {
    await withBaseline(t, async (db, base) => {
      const context = invocation(base, 'base');
      const prepared = prepare(context, read(db, context.trustedContext));
      assert.equal(prepared.request.type, 'REFRESH');
      assert.deepEqual(prepared.request.payload.changes, { added: [], modified: [], deleted: [] });
      assert.equal(prepared.request.payload.targetSourceFiles.length, 1);
      assert.equal(prepared.baseline.summaries[0].emittedFacts.length, 0);
      for (const mutate of [
        (c) => {
          c.descriptor.protocolVersions = [1, 2];
        },
        (c) => {
          c.descriptor.capabilities = [];
        },
        (c) => {
          c.payload.analysisStateContext.resolverVersion = 'different';
        },
        (c) => {
          c.payload.resourceBudget.maxMemoryBytes--;
        },
        (c) => {
          c.payload.targetRevision.repositoryId = 'different';
        },
        (c) => {
          c.payload.requestedCapabilities = null;
        },
        (c) => {
          // Unknown context is not allowed to survive into recursive freezing.
          c.untrustedExtension = { nested: [] };
        },
      ]) {
        const changed = structuredClone(context);
        mutate(changed);
        assert.throws(() => prepare(changed, read(db, context.trustedContext)), {
          code: 'INVALID_REQUEST',
        });
      }
      assert.throws(
        () =>
          preparation.createNativeRefreshPreparation(
            context,
            read(db, context.trustedContext),
            limits.memoryBudgetBytes,
            { ...options, limits: { maxStdinBytes: 1 } },
          ),
        (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
      );
    });
    await withBaseline(t, async (db, base, _reopen, databasePath) => {
      db.exec('PRAGMA journal_mode=WAL');
      const context = invocation(base, 'base');
      let calls = 0;
      const consistent = read(db, context.trustedContext, limits, (input) => {
        calls++;
        const writer = new DatabaseSync(databasePath);
        try {
          writer.exec(
            "BEGIN IMMEDIATE; UPDATE source_files SET content_fingerprint='raced'; UPDATE revisions SET content_fingerprint='raced'; COMMIT;",
          );
        } finally {
          writer.close();
        }
        return providers.validateNativeStateCandidate(input);
      });
      assert.equal(calls, 1);
      assert.equal(consistent.status, 'AVAILABLE');
      assert.equal(consistent.targetSourceFiles[0].contentFingerprint, 'fp-0');
      assert.equal(consistent.state.expected.contentFingerprint, 'base');
      assert.deepEqual(read(db, context.trustedContext), {
        status: 'UNAVAILABLE',
        reason: 'INVALID',
      });
    });
  },
};

test('D1 declared preparation cases are executed', async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL(
        '../../../fixtures/storage/native-refresh-apply/preparation-cases.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  assert.equal(fixture.id, 'p05-native-refresh-preparation-v1');
  assert.deepEqual(fixture.cases, Object.keys(cases));
});
for (const [name, run] of Object.entries(cases)) test(`D1 ${name}`, run);

test('D5 SQL reservation refuses inventory and baseline TEXT before validation', async (t) => {
  await withBaseline(t, async (db, base) => {
    const expected = invocation(base, 'base').trustedContext;
    const queries = [],
      original = db.prepare.bind(db);
    let validations = 0;
    db.prepare = (sql) => {
      queries.push(sql);
      return original(sql);
    };
    const validate = (input) => {
      validations++;
      return providers.validateNativeStateCandidate(input);
    };
    const reserved = { ...limits, workspaceReservationBytes: limits.memoryBudgetBytes };
    assert.deepEqual(read(db, expected, reserved, validate), {
      status: 'UNAVAILABLE',
      reason: 'RESOURCE_LIMIT_EXCEEDED',
    });
    assert.equal(
      queries.some((sql) => /^SELECT \* FROM source_files/i.test(sql)),
      false,
    );
    queries.length = 0;
    assert.deepEqual(storage.readNativeAnalysisState(db, expected, validate, reserved), {
      status: 'UNAVAILABLE',
      reason: 'RESOURCE_LIMIT_EXCEEDED',
    });
    assert.equal(
      queries.some((sql) =>
        /^SELECT (?:indexed_revision_id|\* FROM native_analysis_state)/i.test(sql),
      ),
      false,
    );
    // Inventory may fit first. The nested baseline deduction must retain R,
    // leaving only one byte for baseline SQL, not silently restoring headroom.
    queries.length = 0;
    const f = base.request.payload.sourceFiles[0];
    const inventoryBytes = [
      f.id,
      f.repositoryId,
      f.revisionId,
      f.path,
      f.contentFingerprint,
      f.classification.role,
      f.classification.provenance,
      f.classification.contentKind,
      f.languageHint,
      f.sensitivity,
      'rev',
      'r',
      'WORKTREE',
      'base',
      'rev',
      'base',
    ].reduce((n, value) => n + Buffer.byteLength(value), 0);
    assert.deepEqual(
      read(
        db,
        expected,
        {
          ...limits,
          workspaceReservationBytes: limits.memoryBudgetBytes - 2 * inventoryBytes - 1,
        },
        validate,
      ),
      { status: 'UNAVAILABLE', reason: 'RESOURCE_LIMIT_EXCEEDED' },
    );
    assert.equal(
      queries.some((sql) => /^SELECT \* FROM source_files/i.test(sql)),
      true,
    );
    assert.equal(
      queries.some((sql) => /^SELECT \* FROM native_analysis_state/i.test(sql)),
      false,
    );
    assert.equal(validations, 0);
    assert.equal(db.isTransaction, false);
  });
});

test('D5 preparation retains original SQL UTF-8 once and preserves the workspace reservation', async (t) => {
  await withBaseline(
    t,
    async (db, base) => {
      const context = invocation(base, 'base');
      const baseline = read(db, context.trustedContext);
      assert.equal(baseline.status, 'AVAILABLE');
      // Independently enumerate the fixture's original retained SQL fields. Parsed
      // bundle/request copies belong to the workspace, not another SQL charge.
      const source = base.request.payload.sourceFiles[0];
      const summary = base.bundle.summaries[0];
      assert.ok(Buffer.byteLength(source.path) > source.path.length);
      const sqlStrings = [
        JSON.stringify(base.bundle.header),
        base.bundle.header.summaryDigest,
        source.id,
        source.path,
        source.contentFingerprint,
        JSON.stringify(summary),
        source.id,
        source.repositoryId,
        source.revisionId,
        source.path,
        source.contentFingerprint,
        source.classification.role,
        source.classification.provenance,
        source.classification.contentKind,
        source.languageHint,
        source.sensitivity,
        'rev',
        'base',
        'native',
        'snap',
        base.bundle.header.summaryDigest,
      ];
      const bytes = sqlStrings.reduce(
        (n, value) => n + (value == null ? 0 : Buffer.byteLength(value)),
        0,
      );
      const prepared = preparation.createNativeRefreshPreparation(
        context,
        baseline,
        limits.memoryBudgetBytes,
        options,
        101,
      );
      assert.equal(prepared.retainedSqlBytes, bytes);
      assert.equal(prepared.limits.workspaceReservationBytes, 101);
      assert.ok(Object.isFrozen(prepared));
      assert.throws(
        () =>
          preparation.createNativeRefreshPreparation(
            context,
            baseline,
            limits.memoryBudgetBytes,
            options,
            limits.memoryBudgetBytes,
          ),
        (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
      );
    },
    'utf8',
  );
});

// Independent numeric SQLite oracle, never the product retention counter.
function inventorySqlRows(db) {
  return db
    .prepare(
      `SELECT
    length(CAST(id AS BLOB)) + length(CAST(repository_id AS BLOB)) +
    length(CAST(revision_id AS BLOB)) + length(CAST(path AS BLOB)) +
    length(CAST(content_fingerprint AS BLOB)) + length(CAST(role AS BLOB)) +
    length(CAST(provenance AS BLOB)) + length(CAST(content_kind AS BLOB)) +
    coalesce(length(CAST(language_hint AS BLOB)),0) + length(CAST(sensitivity AS BLOB)) AS bytes
    FROM source_files WHERE repository_id='r' AND revision_id='rev' ORDER BY path`,
    )
    .all();
}
function persistentImage(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map(({ name }) => [
      name,
      db
        .prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
        .all()
        .map((row) => JSON.stringify(row))
        .sort(),
    ]);
}
function baselineSqlPrefixes(db) {
  const bytes = (table, fields, where) =>
    db
      .prepare(
        `SELECT ${fields.map((f) => `coalesce(length(CAST(${f} AS BLOB)),0)`).join('+')} AS bytes FROM ${table} WHERE ${where}`,
      )
      .all()
      .map((r) => r.bytes);
  const state = bytes(
    'native_analysis_state',
    [
      'repository_id',
      'provider_id',
      'provider_snapshot_id',
      'revision_id',
      'content_fingerprint',
      'header_json',
    ],
    "repository_id='r' AND provider_id='native'",
  )[0];
  const snapshot = bytes(
    'provider_snapshots',
    [
      'id',
      'repository_id',
      'provider_id',
      'provider_version',
      'requested_revision_id',
      'requested_revision_fingerprint',
      'outcome',
    ],
    "id='snap'",
  )[0];
  const files = bytes(
    'native_analysis_file',
    ['source_file_id', 'source_path', 'content_fingerprint', 'summary_json'],
    "repository_id='r' AND provider_id='native' ORDER BY source_path",
  );
  let sum = 15 + state + snapshot;
  return [
    7,
    7 + state,
    15 + state,
    sum,
    ...files.map((n) => (sum += n)),
    ...tokenSqlRows(db).map((n) => (sum += n)),
  ];
}
function tokenSqlRows(db) {
  return db
    .prepare(
      `SELECT length(CAST(repository_id AS BLOB))+length(CAST(provider_id AS BLOB))+
    length(CAST(provider_snapshot_id AS BLOB))+length(CAST(revision_id AS BLOB))+
    length(CAST(content_fingerprint AS BLOB))+length(CAST(header_json AS BLOB)) AS bytes
    FROM native_analysis_state WHERE repository_id='r' ORDER BY provider_id`,
    )
    .all()
    .map((r) => r.bytes);
}

function addTokenProvider(db, base, provider, invalid = false) {
  const snapshot = `${provider}-snap`;
  db.prepare(
    `INSERT INTO provider_snapshots(id,repository_id,provider_id,provider_version,runtime_version,
    requested_revision_id,requested_revision_fingerprint,started_at,completed_at,outcome)
    VALUES(?,?,?,'0.0.0','0.0.0','rev','base',1,2,'SUCCEEDED')`,
  ).run(snapshot, 'r', provider);
  const header = { ...base.bundle.header, providerId: provider };
  if (invalid) header.summaryDigest = 'invalid';
  db.prepare('INSERT INTO native_analysis_state VALUES(?,?,?,?,?,?)').run(
    'r',
    provider,
    snapshot,
    'rev',
    'base',
    JSON.stringify(header),
  );
}
// Selected SQLite byte lengths and fixed digest width, not product counters.
function readOwnershipOracle(db) {
  const header = db
    .prepare(
      "SELECT length(CAST(header_json AS BLOB)) AS bytes FROM native_analysis_state WHERE provider_id='native'",
    )
    .get().bytes;
  const fileBytes = db
    .prepare(
      `SELECT coalesce(sum(length(CAST(source_file_id AS BLOB))+
    length(CAST(source_path AS BLOB))+length(CAST(content_fingerprint AS BLOB))+
    length(CAST(summary_json AS BLOB))),0) AS bytes FROM native_analysis_file
    WHERE repository_id='r' AND provider_id='native'`,
    )
    .get().bytes;
  const state = header + 64 + fileBytes;
  const pinned = baselineSqlPrefixes(db)[3] + fileBytes + 64;
  const rows = db
    .prepare(
      `SELECT length(CAST(repository_id AS BLOB))+length(CAST(provider_id AS BLOB))+
    length(CAST(provider_snapshot_id AS BLOB))+length(CAST(revision_id AS BLOB))+
    length(CAST(content_fingerprint AS BLOB))+length(CAST(header_json AS BLOB)) AS raw,
    length(CAST(provider_id AS BLOB))+length(CAST(provider_snapshot_id AS BLOB))+64 AS accepted
    FROM native_analysis_state WHERE repository_id='r' ORDER BY provider_id`,
    )
    .all();
  let prefix = 0;
  const fileCount = db
    .prepare(
      "SELECT count(*) AS n FROM native_analysis_file WHERE repository_id='r' AND provider_id='native'",
    )
    .get().n;
  const checkpoints = baselineSqlPrefixes(db)
    .slice(0, 4 + fileCount)
    .map((bytes) => ['BASELINE_PREFIX', bytes]);
  checkpoints.push(['VALIDATED_BASELINE', pinned]);
  for (const row of rows) {
    checkpoints.push(['TOKEN_ROW', pinned + prefix + row.raw]);
    checkpoints.push(['TOKEN_ACCEPTED', pinned + prefix + row.raw + 64]);
    prefix += row.accepted;
  }
  checkpoints.push(
    ['TOKEN_RETURN', pinned + prefix],
    ['STATE_CLONE_BEGIN', pinned + prefix],
    ['STATE_CLONE_END', pinned + prefix],
    ['RETURN', state + 7 + prefix],
  );
  return checkpoints;
}
function assertOwnership(rows, expected, scope = 'BASELINE_READ_SQL_OWNERSHIP_ONLY') {
  assert.deepEqual(
    rows.map((row) => [row.phase, row.retainedSqlBytes]),
    expected,
  );
  for (const row of rows) {
    assert.equal(row.scope, scope);
    assert.equal(row.retainedSqlStringChargeBytes, 2 * row.retainedSqlBytes);
    assert.equal(Object.isFrozen(row), true);
  }
}

async function readDiagnostic() {
  const module = await import('./helpers/native-refresh-source-fixture.mjs');
  assert.equal(
    typeof module.observeRefreshBaselineRead,
    'function',
    'Failure-inclusive read diagnostic missing',
  );
  return module.observeRefreshBaselineRead;
}
test('D5 prevalidation ownership includes corrupt inventory prefix without reading baseline', async (t) => {
  await withBaseline(
    t,
    async (db, base, reopen) => {
      const second = addInventoryFile(db, base);
      db.prepare('UPDATE source_files SET language_hint=? WHERE id=?').run(' ', second.id);
      const inventory = inventorySqlRows(db),
        before = persistentImage(db),
        rows = [];
      let validations = 0;
      const result = storage.readNativeRefreshBaseline(
        db,
        invocation(base, 'base').trustedContext,
        (input) => {
          validations++;
          return providers.validateNativeStateCandidate(input);
        },
        limits,
        undefined,
        undefined,
        (row) => rows.push(row),
      );
      assert.deepEqual(result, { status: 'UNAVAILABLE', reason: 'INVALID' });
      assertOwnership(
        rows,
        [7, 19, 19 + inventory[0].bytes, 19 + inventory[0].bytes + inventory[1].bytes].map(
          (bytes) => ['INVENTORY_PREFIX', bytes],
        ),
        'REFRESH_READ_SQL_OWNERSHIP_ONLY',
      );
      assert.equal(validations, 0);
      assert.equal(db.isTransaction, false);
      assert.deepEqual(persistentImage(db), before);
      assert.deepEqual(persistentImage(reopen()), before);
    },
    'utf8',
  );
});
test('D5 prevalidation ownership includes raw corrupt header and provenance before validation', async (t) => {
  await withBaseline(t, async (db, base, reopen) => {
    db.prepare('UPDATE native_analysis_state SET header_json=?').run(JSON.stringify({}));
    const expected = baselineSqlPrefixes(db)
        .slice(0, 4)
        .map((bytes) => ['BASELINE_PREFIX', bytes]),
      before = persistentImage(db),
      rows = [];
    let validations = 0;
    const result = storage.readNativeAnalysisState(
      db,
      invocation(base, 'base').trustedContext,
      (input) => {
        validations++;
        return providers.validateNativeStateCandidate(input);
      },
      limits,
      undefined,
      (row) => rows.push(row),
    );
    assert.deepEqual(result, { status: 'UNAVAILABLE', reason: 'INVALID' });
    assertOwnership(rows, expected);
    assert.equal(validations, 0);
    assert.equal(db.isTransaction, false);
    assert.deepEqual(persistentImage(reopen()), before);
  });
});
test('D5 prevalidation ownership callback errors survive validator wrapping and swallowing', async (t) => {
  await withBaseline(t, async (db, base, reopen) => {
    const before = persistentImage(db);
    for (const outer of [false, true])
      for (const swallowed of [false, true])
        for (const failure of [
          0,
          null,
          undefined,
          '',
          Object.assign(new Error('prefix owner'), { nativeStateReason: 'INVALID' }),
        ]) {
          if (outer) db.exec('BEGIN');
          let calls = 0,
            caught = false;
          try {
            storage.readNativeAnalysisState(
              db,
              invocation(base, 'base').trustedContext,
              (input) => {
                try {
                  return providers.validateNativeStateCandidate(input);
                } catch (error) {
                  if (!swallowed) throw error;
                  return {};
                }
              },
              limits,
              undefined,
              (row) => {
                if (row.phase === 'BASELINE_PREFIX' && ++calls === 5) throw failure;
              },
            );
          } catch (error) {
            caught = true;
            assert.equal(error, failure);
          }
          assert.equal(caught, true, 'Raw summary prefix owner failure must escape unchanged');
          assert.equal(db.isTransaction, outer);
          if (outer) db.exec('ROLLBACK');
          assert.deepEqual(persistentImage(db), before);
        }
    assert.deepEqual(persistentImage(reopen()), before);
  });
});
test('D5 prevalidation ownership keeps earlier summaries and a validator-failed raw row but no unread suffix', async (t) => {
  await withBaseline(
    t,
    async (db, base, reopen) => {
      const paths = db
        .prepare('SELECT source_path AS path FROM native_analysis_file ORDER BY source_path')
        .all();
      assert.ok(paths.length >= 2);
      db.prepare('UPDATE native_analysis_file SET summary_json=? WHERE source_path=?').run(
        JSON.stringify('invalid'),
        paths[1].path,
      );
      db.prepare('INSERT INTO native_analysis_file VALUES(?,?,?,?,?,?)').run(
        'r',
        'native',
        'unread',
        'zz-unread.java',
        'unread',
        JSON.stringify({ unread: '末尾😀'.repeat(100) }),
      );
      const expected = baselineSqlPrefixes(db)
          .slice(0, 6)
          .map((bytes) => ['BASELINE_PREFIX', bytes]),
        before = persistentImage(db),
        rows = [];
      assert.deepEqual(
        storage.readNativeAnalysisState(
          db,
          invocation(base, 'base').trustedContext,
          (input) => {
            let consumed = 0;
            for (const _file of input.files)
              if (++consumed === 2)
                throw Object.assign(new Error('Second row validation refused'), {
                  nativeStateReason: 'INVALID',
                });
            assert.fail('Expected actual second-row read');
          },
          limits,
          undefined,
          (row) => rows.push(row),
        ),
        { status: 'UNAVAILABLE', reason: 'INVALID' },
      );
      assertOwnership(rows, expected);
      assert.equal(db.isTransaction, false);
      assert.deepEqual(persistentImage(reopen()), before);
    },
    'shared',
  );
});
test('D5 failed read diagnostic preserves invalid summary prefix without invented ownership', async (t) => {
  const observe = await readDiagnostic();
  await withBaseline(t, async (db, base, reopen) => {
    db.prepare('UPDATE native_analysis_file SET summary_json=?').run(JSON.stringify('invalid'));
    const before = persistentImage(db),
      bytes = 19 + inventorySqlRows(db)[0].bytes + baselineSqlPrefixes(db)[4];
    const result = observe(db, invocation(base, 'base').trustedContext, limits);
    assert.equal(result.error, null);
    assert.deepEqual(result.value, { status: 'UNAVAILABLE', reason: 'INVALID' });
    assert.deepEqual(result.diagnostic, {
      scope: 'REFRESH_READ_DIAGNOSTIC_ONLY',
      status: 'UNAVAILABLE',
      reason: 'INVALID',
      sqlReadFields: { scope: 'REFRESH_READ_SQL_FIELDS_ONLY', checkpoints: 8, readSqlBytes: bytes },
      sqlReadOwnership: {
        scope: 'REFRESH_READ_SQL_OWNERSHIP_ONLY',
        checkpoints: 8,
        phaseCounts: { INVENTORY_PREFIX: 3, BASELINE_PREFIX: 5 },
        retainedSqlBytes: bytes,
        retainedSqlStringChargeBytes: 2 * bytes,
        returnedSqlBytes: null,
      },
    });
    assert.ok(Object.isFrozen(result.diagnostic));
    assert.ok(Object.isFrozen(result.diagnostic.sqlReadFields));
    assert.equal(db.isTransaction, false);
    assert.deepEqual(persistentImage(db), before);
    assert.deepEqual(persistentImage(reopen()), before);
  });
});
test('D5 failed read diagnostic retains token prefix but never RETURN on corruption', async (t) => {
  const observe = await readDiagnostic();
  await withBaseline(t, async (db, base, reopen) => {
    for (const provider of ['z-bad', 'zz-unread']) {
      const header = { ...base.bundle.header, providerId: provider, summaryDigest: 'invalid' };
      db.prepare('INSERT INTO native_analysis_state VALUES(?,?,?,?,?,?)').run(
        'r',
        provider,
        'snap',
        'rev',
        'base',
        JSON.stringify(header),
      );
    }
    const before = persistentImage(db),
      bytes = 19 + inventorySqlRows(db)[0].bytes + baselineSqlPrefixes(db).at(-2);
    const result = observe(db, invocation(base, 'base').trustedContext, limits);
    assert.equal(result.error, null);
    assert.deepEqual(result.value, { status: 'UNAVAILABLE', reason: 'INVALID' });
    assert.deepEqual(result.diagnostic.sqlReadFields, {
      scope: 'REFRESH_READ_SQL_FIELDS_ONLY',
      checkpoints: 10,
      readSqlBytes: bytes,
    });
    assert.equal(result.diagnostic.sqlReadOwnership.checkpoints, 12);
    assert.deepEqual(result.diagnostic.sqlReadOwnership.phaseCounts, {
      INVENTORY_PREFIX: 3,
      BASELINE_PREFIX: 5,
      VALIDATED_BASELINE: 1,
      TOKEN_ROW: 2,
      TOKEN_ACCEPTED: 1,
    });
    assert.equal(result.diagnostic.sqlReadOwnership.returnedSqlBytes, null);
    assert.ok(Object.isFrozen(result.diagnostic.sqlReadOwnership.phaseCounts));
    assert.equal(db.isTransaction, false);
    assert.deepEqual(persistentImage(db), before);
    assert.deepEqual(persistentImage(reopen()), before);
  });
});
test('D5 failed read diagnostic preserves thrown validator identity and transaction owner', async (t) => {
  const observe = await readDiagnostic();
  await withBaseline(t, async (db, base, reopen) => {
    const before = persistentImage(db),
      failure = new Error('Original validation failure');
    for (const outer of [false, true]) {
      if (outer) db.exec('BEGIN');
      const result = observe(db, invocation(base, 'base').trustedContext, limits, (candidate) => {
        for (const _file of candidate.files) throw failure;
        assert.fail('Expected actual summary read');
      });
      assert.equal(result.error, failure);
      assert.equal(result.value, null);
      assert.equal(result.diagnostic.status, 'THREW');
      assert.equal(result.diagnostic.reason, null);
      assert.equal(result.diagnostic.sqlReadFields.checkpoints, 8);
      assert.equal(result.diagnostic.sqlReadOwnership.checkpoints, 8);
      assert.deepEqual(result.diagnostic.sqlReadOwnership.phaseCounts, {
        INVENTORY_PREFIX: 3,
        BASELINE_PREFIX: 5,
      });
      assert.equal(result.diagnostic.sqlReadOwnership.returnedSqlBytes, null);
      assert.equal(db.isTransaction, outer);
      if (outer) db.exec('ROLLBACK');
      assert.deepEqual(persistentImage(db), before);
    }
    assert.deepEqual(persistentImage(reopen()), before);
  });
});
test('D5 failed read diagnostic distinguishes numeric refusal from a measured zero', async (t) => {
  const observe = await readDiagnostic();
  await withBaseline(t, async (db, base, reopen) => {
    const before = persistentImage(db);
    const result = observe(db, invocation(base, 'base').trustedContext, {
      ...limits,
      workspaceReservationBytes: limits.memoryBudgetBytes,
    });
    assert.equal(result.error, null);
    assert.deepEqual(result.value, { status: 'UNAVAILABLE', reason: 'RESOURCE_LIMIT_EXCEEDED' });
    assert.deepEqual(result.diagnostic.sqlReadFields, {
      scope: 'REFRESH_READ_SQL_FIELDS_ONLY',
      checkpoints: 0,
      readSqlBytes: null,
    });
    assert.equal(result.diagnostic.sqlReadOwnership, null);
    assert.equal(db.isTransaction, false);
    assert.deepEqual(persistentImage(reopen()), before);
  });
});
test('D5 failed read diagnostic success keeps original query sequence and result', async (t) => {
  const observe = await readDiagnostic();
  await withBaseline(t, async (db, base, reopen) => {
    const before = persistentImage(db),
      prepare = db.prepare,
      sql = [];
    const expected = invocation(base, 'base').trustedContext;
    db.prepare = function (query) {
      sql.push(query);
      return prepare.call(this, query);
    };
    let original, traced;
    try {
      original = storage.readNativeRefreshBaseline(
        db,
        expected,
        providers.validateNativeStateCandidate,
        limits,
      );
      const originalQueries = sql.splice(0);
      traced = observe(db, expected, limits);
      assert.deepEqual(sql, originalQueries);
    } finally {
      db.prepare = prepare;
    }
    assert.equal(traced.error, null);
    assert.deepEqual(traced.value, original);
    assert.equal(traced.diagnostic.status, 'AVAILABLE');
    assert.equal(traced.diagnostic.sqlReadOwnership.checkpoints, 16);
    assert.equal(traced.diagnostic.sqlReadOwnership.phaseCounts.RETURN, 1);
    assert.equal(
      traced.diagnostic.sqlReadFields.readSqlBytes,
      19 + inventorySqlRows(db)[0].bytes + baselineSqlPrefixes(db).at(-1),
    );
    assert.equal(db.isTransaction, false);
    assert.deepEqual(persistentImage(db), before);
    assert.deepEqual(persistentImage(reopen()), before);
  });
});
test('D5 read ownership tracks streaming token overlap and clone handoff without queries', async (t) => {
  await withBaseline(
    t,
    async (db, base) => {
      addTokenProvider(db, base, 'a-中文😀');
      addTokenProvider(db, base, 'z-last');
      const expected = readOwnershipOracle(db),
        context = invocation(base, 'base').trustedContext;
      const queries = [],
        original = db.prepare.bind(db);
      db.prepare = (sql) => {
        queries.push(sql);
        return original(sql);
      };
      const legacy = storage.readNativeAnalysisState(
        db,
        context,
        providers.validateNativeStateCandidate,
        limits,
      );
      assert.equal(legacy.status, 'AVAILABLE');
      const oldQueries = [...queries];
      queries.length = 0;
      const rows = [],
        clone = globalThis.structuredClone;
      let validated,
        clones = 0;
      try {
        globalThis.structuredClone = (value, ...args) => {
          if (value === validated) clones++;
          return clone(value, ...args);
        };
        const result = storage.readNativeAnalysisState(
          db,
          context,
          (input) => {
            validated = providers.validateNativeStateCandidate(input);
            return validated;
          },
          limits,
          undefined,
          (row) => {
            if (row.phase === 'STATE_CLONE_BEGIN') assert.equal(clones, 0);
            if (row.phase === 'STATE_CLONE_END' || row.phase === 'RETURN') assert.equal(clones, 1);
            rows.push(row);
          },
        );
        assert.deepEqual(result, legacy);
      } finally {
        globalThis.structuredClone = clone;
      }
      assertOwnership(rows, expected);
      assert.deepEqual(queries, oldQueries);
      assert.equal(db.isTransaction, false);
    },
    'utf8',
  );
});

test('D5 read ownership retains accepted token fields and the failing raw row only', async (t) => {
  await withBaseline(t, async (db, base, reopen) => {
    addTokenProvider(db, base, 'a-first');
    addTokenProvider(db, base, 'z-bad', true);
    addTokenProvider(db, base, 'zz-unread');
    const expected = readOwnershipOracle(db).slice(0, 11),
      before = persistentImage(db),
      rows = [];
    assert.deepEqual(
      storage.readNativeAnalysisState(
        db,
        invocation(base, 'base').trustedContext,
        providers.validateNativeStateCandidate,
        limits,
        undefined,
        (row) => rows.push(row),
      ),
      { status: 'UNAVAILABLE', reason: 'INVALID' },
    );
    assertOwnership(rows, expected);
    assert.equal(db.isTransaction, false);
    assert.deepEqual(persistentImage(db), before);
    assert.deepEqual(persistentImage(reopen()), before);
  });
});

test('D5 read ownership callback failure preserves identity at every observed handoff', async (t) => {
  await withBaseline(t, async (db, base) => {
    const expected = readOwnershipOracle(db),
      before = persistentImage(db);
    for (const outer of [false, true])
      for (const [phase] of expected) {
        if (outer) db.exec('BEGIN');
        const sentinel = new Error('Invalid native activation token header');
        let refused = false;
        assert.throws(
          () =>
            storage.readNativeAnalysisState(
              db,
              invocation(base, 'base').trustedContext,
              providers.validateNativeStateCandidate,
              limits,
              undefined,
              (row) => {
                if (row.phase === phase) {
                  refused = true;
                  throw sentinel;
                }
              },
            ),
          (error) => error === sentinel,
        );
        assert.equal(refused, true);
        assert.equal(db.isTransaction, outer);
        if (outer) db.exec('ROLLBACK');
        assert.deepEqual(persistentImage(db), before);
      }
  });
});

test('D5 read ownership records clone entry but never successful handoff on clone failure', async (t) => {
  await withBaseline(t, async (db, base, reopen) => {
    const expected = readOwnershipOracle(db).slice(0, -2),
      before = persistentImage(db),
      rows = [];
    const clone = globalThis.structuredClone,
      sentinel = new Error('clone refused');
    let validated;
    try {
      globalThis.structuredClone = (value, ...args) => {
        if (value === validated) throw sentinel;
        return clone(value, ...args);
      };
      assert.throws(
        () =>
          storage.readNativeAnalysisState(
            db,
            invocation(base, 'base').trustedContext,
            (input) => {
              validated = providers.validateNativeStateCandidate(input);
              return validated;
            },
            limits,
            undefined,
            (row) => rows.push(row),
          ),
        (error) => error === sentinel,
      );
    } finally {
      globalThis.structuredClone = clone;
    }
    assertOwnership(rows, expected);
    assert.equal(db.isTransaction, false);
    assert.deepEqual(persistentImage(db), before);
    assert.deepEqual(persistentImage(reopen()), before);
  });
});

test('D5 read ownership forwards outer overlap then drops non-returned SQL fields', async (t) => {
  await withBaseline(
    t,
    async (db, base) => {
      addInventoryFile(db, base);
      const baseline = readOwnershipOracle(db),
        sourceBytes = inventorySqlRows(db).reduce((sum, row) => sum + row.bytes, 0);
      const expected = baseline.map(([phase, bytes]) => [
        phase === 'RETURN' ? 'BASELINE_RETURN' : phase,
        bytes + 19 + sourceBytes,
      ]);
      const inventory = inventorySqlRows(db);
      expected.unshift(
        ...[7, 19, 19 + inventory[0].bytes, 19 + sourceBytes].map((bytes) => [
          'INVENTORY_PREFIX',
          bytes,
        ]),
      );
      expected.push(['RETURN', baseline.at(-1)[1] + sourceBytes]);
      const rows = [],
        legacy = read(db, invocation(base, 'base').trustedContext);
      const result = storage.readNativeRefreshBaseline(
        db,
        invocation(base, 'base').trustedContext,
        providers.validateNativeStateCandidate,
        limits,
        undefined,
        undefined,
        (row) => rows.push(row),
      );
      assert.deepEqual(result, legacy);
      assertOwnership(rows, expected, 'REFRESH_READ_SQL_OWNERSHIP_ONLY');
      assert.equal(db.isTransaction, false);
    },
    'utf8',
  );
});

test('D5 read ownership is silent on numeric preflight refusal', async (t) => {
  await withBaseline(t, async (db, base) => {
    const rows = [],
      refused = { ...limits, workspaceReservationBytes: limits.memoryBudgetBytes };
    const expected = invocation(base, 'base').trustedContext;
    assert.deepEqual(
      storage.readNativeAnalysisState(
        db,
        expected,
        providers.validateNativeStateCandidate,
        refused,
        undefined,
        (row) => rows.push(row),
      ),
      { status: 'UNAVAILABLE', reason: 'RESOURCE_LIMIT_EXCEEDED' },
    );
    assert.deepEqual(
      storage.readNativeRefreshBaseline(
        db,
        expected,
        providers.validateNativeStateCandidate,
        refused,
        undefined,
        undefined,
        (row) => rows.push(row),
      ),
      { status: 'UNAVAILABLE', reason: 'RESOURCE_LIMIT_EXCEEDED' },
    );
    assert.deepEqual(rows, []);
    assert.equal(db.isTransaction, false);
  });
});

test('D5 read ownership covers zero and multiple retained summary rows', async (t) => {
  for (const mode of ['zero-file', 'shared'])
    await withBaseline(
      t,
      async (db, base) => {
        const expected = readOwnershipOracle(db),
          rows = [];
        const result = storage.readNativeAnalysisState(
          db,
          invocation(base, 'base').trustedContext,
          providers.validateNativeStateCandidate,
          limits,
          undefined,
          (row) => rows.push(row),
        );
        assert.equal(result.status, 'AVAILABLE');
        assertOwnership(rows, expected);
        assert.equal(db.isTransaction, false);
      },
      mode,
    );
});

test('D5 read ownership outer observer failure preserves read transaction ownership', async (t) => {
  await withBaseline(t, async (db, base, reopen) => {
    const before = persistentImage(db);
    for (const outer of [false, true])
      for (const phase of ['TOKEN_ROW', 'BASELINE_RETURN', 'RETURN']) {
        if (outer) db.exec('BEGIN');
        const sentinel = new Error('Invalid native activation token header');
        let refused = false;
        assert.throws(
          () =>
            storage.readNativeRefreshBaseline(
              db,
              invocation(base, 'base').trustedContext,
              providers.validateNativeStateCandidate,
              limits,
              undefined,
              undefined,
              (row) => {
                if (row.phase === phase) {
                  refused = true;
                  throw sentinel;
                }
              },
            ),
          (error) => error === sentinel,
        );
        assert.equal(refused, true);
        assert.equal(db.isTransaction, outer);
        if (outer) db.exec('ROLLBACK');
        assert.deepEqual(persistentImage(db), before);
      }
    assert.deepEqual(persistentImage(reopen()), before);
  });
});

test('D5 token owner counts actual selected rows through the corrupt token prefix', async (t) => {
  await withBaseline(t, async (db, base, reopen) => {
    for (const provider of ['a-中文😀', 'z-bad', 'zz-unread']) {
      const header = { ...base.bundle.header, providerId: provider };
      if (provider === 'z-bad') header.summaryDigest = 'invalid';
      db.prepare('INSERT INTO native_analysis_state VALUES(?,?,?,?,?,?)').run(
        'r',
        provider,
        'snap',
        'rev',
        'base',
        JSON.stringify(header),
      );
    }
    const before = persistentImage(db),
      prefixes = baselineSqlPrefixes(db),
      observations = [];
    assert.deepEqual(
      storage.readNativeAnalysisState(
        db,
        invocation(base, 'base').trustedContext,
        providers.validateNativeStateCandidate,
        limits,
        (n) => observations.push(n),
      ),
      { status: 'UNAVAILABLE', reason: 'INVALID' },
    );
    // Five baseline checkpoints, then the valid other/native/corrupt token rows.
    assert.deepEqual(observations, prefixes.slice(0, 8));
    assert.equal(db.isTransaction, false);
    assert.deepEqual(persistentImage(db), before);
    assert.deepEqual(persistentImage(reopen()), before);
  });
});

test('D5 token owner error with a decoder message preserves exact identity', async (t) => {
  await withBaseline(t, async (db, base) => {
    const before = persistentImage(db);
    for (const outer of [false, true]) {
      if (outer) db.exec('BEGIN');
      const sentinel = new Error('Invalid native activation token header');
      let observations = 0;
      assert.throws(
        () =>
          storage.readNativeAnalysisState(
            db,
            invocation(base, 'base').trustedContext,
            providers.validateNativeStateCandidate,
            limits,
            () => {
              if (++observations === 6) throw sentinel;
            },
          ),
        (error) => error === sentinel,
      );
      assert.equal(observations, 6);
      assert.equal(db.isTransaction, outer);
      if (outer) db.exec('ROLLBACK');
      assert.deepEqual(persistentImage(db), before);
    }
  });
});

test('D5 clone boundary returns detached frozen metadata without altering the validated owner', async (t) => {
  await withBaseline(t, async (db, base) => {
    let validated;
    const baseline = storage.readNativeAnalysisState(
      db,
      invocation(base, 'base').trustedContext,
      (input) => {
        validated = providers.validateNativeStateCandidate(input);
        return validated;
      },
      limits,
    );
    assert.equal(baseline.status, 'AVAILABLE');
    const expected = structuredClone(validated);
    assert.notEqual(baseline.state, validated);
    assert.notEqual(baseline.state.files, validated.files);
    assert.notEqual(baseline.state.files[0], validated.files[0]);
    assert.notEqual(baseline.state.expected.language, validated.expected.language);
    assert.equal(Object.isFrozen(validated), false);
    validated.files[0].sourcePath = 'changed-after-return.java';
    validated.expected.language.analyzerVersion = 'changed';
    assert.deepEqual(baseline.state, expected);
    const pending = [baseline.state, baseline.token];
    while (pending.length) {
      const value = pending.pop();
      assert.equal(Object.isFrozen(value), true);
      for (const nested of Object.values(value))
        if (nested !== null && typeof nested === 'object') pending.push(nested);
    }
  });
});

test('D5 clone boundary failure preserves the old image and transaction ownership', async (t) => {
  await withBaseline(t, async (db, base, reopen) => {
    const before = persistentImage(db),
      clone = globalThis.structuredClone;
    for (const outer of [false, true]) {
      const sentinel = new Error('clone failed'),
        expected = invocation(base, 'base').trustedContext;
      let validated,
        cloning = 0;
      if (outer) db.exec('BEGIN');
      try {
        globalThis.structuredClone = (value, ...args) => {
          if (value === validated) {
            cloning++;
            throw sentinel;
          }
          return clone(value, ...args);
        };
        assert.throws(
          () =>
            storage.readNativeAnalysisState(
              db,
              expected,
              (input) => {
                validated = providers.validateNativeStateCandidate(input);
                return validated;
              },
              limits,
            ),
          (error) => error === sentinel,
        );
        assert.equal(cloning, 1);
        assert.equal(db.isTransaction, outer);
      } finally {
        globalThis.structuredClone = clone;
        if (outer) db.exec('ROLLBACK');
      }
      assert.deepEqual(persistentImage(db), before);
    }
    assert.deepEqual(persistentImage(reopen()), before);
  });
});

test('D5 baseline owner observes selected UTF-8 fields without additional queries', async (t) => {
  await withBaseline(
    t,
    async (db, base) => {
      const prefixes = baselineSqlPrefixes(db),
        expected = invocation(base, 'base').trustedContext;
      const queries = [],
        original = db.prepare.bind(db);
      db.prepare = (sql) => {
        queries.push(sql);
        return original(sql);
      };
      const legacy = storage.readNativeAnalysisState(
        db,
        expected,
        providers.validateNativeStateCandidate,
        limits,
      );
      assert.equal(legacy.status, 'AVAILABLE');
      const legacyQueries = [...queries];
      queries.length = 0;
      const observations = [];
      assert.deepEqual(
        storage.readNativeAnalysisState(
          db,
          expected,
          providers.validateNativeStateCandidate,
          limits,
          (n) => observations.push(n),
        ),
        legacy,
      );
      assert.deepEqual(observations, prefixes);
      assert.deepEqual(queries, legacyQueries);
    },
    'utf8',
  );
});

test('D5 baseline owner keeps summary decode failure prefix and persistent image', async (t) => {
  await withBaseline(t, async (db, base, reopen) => {
    // Deliberately corrupt persisted metadata in this fault fixture only.
    db.exec('PRAGMA ignore_check_constraints=ON');
    db.prepare('INSERT INTO native_analysis_file VALUES(?,?,?,?,?,?)').run(
      'r',
      'native',
      'bad',
      'z/bad.java',
      'fp',
      '{',
    );
    db.prepare('INSERT INTO native_analysis_file VALUES(?,?,?,?,?,?)').run(
      'r',
      'native',
      'later',
      'zz/later.java',
      'fp',
      '{}',
    );
    db.exec('PRAGMA ignore_check_constraints=OFF');
    const prefixes = baselineSqlPrefixes(db),
      before = persistentImage(db),
      observations = [];
    assert.deepEqual(
      storage.readNativeAnalysisState(
        db,
        invocation(base, 'base').trustedContext,
        providers.validateNativeStateCandidate,
        limits,
        (n) => observations.push(n),
      ),
      { status: 'UNAVAILABLE', reason: 'INVALID' },
    );
    assert.deepEqual(observations, prefixes.slice(0, 6));
    assert.equal(db.isTransaction, false);
    assert.deepEqual(persistentImage(db), before);
    assert.deepEqual(persistentImage(reopen()), before);
  });
});

test('D5 baseline owner callback errors are not metadata decode errors', async (t) => {
  await withBaseline(t, async (db, base) => {
    const before = persistentImage(db);
    const expected = invocation(base, 'base').trustedContext;
    const accepted = storage.readNativeAnalysisState(
      db,
      expected,
      providers.validateNativeStateCandidate,
      limits,
    ).state;
    for (const outer of [false, true]) {
      for (const swallow of [false, true]) {
        if (outer) db.exec('BEGIN');
        const sentinel = new SyntaxError('owner refused');
        let observations = 0;
        const validate = swallow
          ? (input) => {
              try {
                [...input.files];
              } catch {}
              return accepted;
            }
          : providers.validateNativeStateCandidate;
        assert.throws(
          () =>
            storage.readNativeAnalysisState(db, expected, validate, limits, () => {
              if (++observations === 5) throw sentinel;
            }),
          (e) => e === sentinel,
        );
        assert.equal(observations, 5);
        assert.equal(db.isTransaction, outer);
        if (outer) db.exec('ROLLBACK');
        assert.deepEqual(persistentImage(db), before);
      }
    }
  });
});

test('D5 baseline owner outer forwarding counts separately read fields once', async (t) => {
  await withBaseline(t, async (db, base) => {
    const prefixes = baselineSqlPrefixes(db),
      inventory = [7, 19, 19 + inventorySqlRows(db)[0].bytes];
    const expected = invocation(base, 'base').trustedContext,
      legacy = read(db, expected);
    for (const observeInventory of [false, true]) {
      const all = [],
        outer = [];
      assert.deepEqual(
        storage.readNativeRefreshBaseline(
          db,
          expected,
          providers.validateNativeStateCandidate,
          limits,
          observeInventory ? (n) => outer.push(n) : undefined,
          (n) => all.push(n),
        ),
        legacy,
      );
      assert.deepEqual(all, [...inventory, ...prefixes.map((n) => n + inventory.at(-1))]);
      assert.deepEqual(outer, observeInventory ? inventory : []);
    }
    const refused = [];
    assert.deepEqual(
      storage.readNativeAnalysisState(
        db,
        expected,
        providers.validateNativeStateCandidate,
        { ...limits, workspaceReservationBytes: limits.memoryBudgetBytes },
        (n) => refused.push(n),
      ),
      { status: 'UNAVAILABLE', reason: 'RESOURCE_LIMIT_EXCEEDED' },
    );
    assert.deepEqual(refused, []);
  });
});
function addInventoryFile(db, base) {
  const first = base.request.payload.sourceFiles[0];
  const second = { ...first, id: 'file-second', path: 'z/尾😀.java', languageHint: null };
  reconcile(db, { revision: base.request.payload.revision, files: [first, second] });
  return second;
}

test('D5 inventory owner counts selected UTF-8 fields, not preflight-only revision columns', async (t) => {
  await withBaseline(
    t,
    async (db, base) => {
      addInventoryFile(db, base);
      db.prepare('UPDATE revisions SET base_revision_id=?').run('unselected-'.repeat(1000));
      const rows = inventorySqlRows(db);
      assert.equal(rows.length, 2);
      const expected = invocation(base, 'base').trustedContext;
      const queries = [],
        original = db.prepare.bind(db);
      db.prepare = (sql) => {
        queries.push(sql);
        return original(sql);
      };
      const legacy = read(db, expected);
      assert.equal(legacy.status, 'AVAILABLE');
      const legacyQueries = [...queries];
      queries.length = 0;
      const observations = [];
      const observed = storage.readNativeRefreshBaseline(
        db,
        expected,
        providers.validateNativeStateCandidate,
        limits,
        (bytes) => observations.push(bytes),
      );
      // Pointer rev/base=7 bytes; revision WORKTREE/base=12 bytes. Wrappers
      // alias strings; no extra representation is charged for the decoded row.
      assert.deepEqual(observations, [
        7,
        19,
        19 + rows[0].bytes,
        19 + rows[0].bytes + rows[1].bytes,
      ]);
      assert.deepEqual(observed, legacy);
      assert.deepEqual(queries, legacyQueries);
      assert.equal(db.isTransaction, false);
    },
    'utf8',
  );
});

test('D5 inventory owner retains the decoded prefix and failing raw row without writes', async (t) => {
  await withBaseline(
    t,
    async (db, base, reopen) => {
      const second = addInventoryFile(db, base);
      db.prepare('UPDATE source_files SET language_hint=? WHERE id=?').run(' ', second.id);
      const rows = inventorySqlRows(db),
        before = persistentImage(db),
        observations = [];
      let validations = 0;
      assert.deepEqual(
        storage.readNativeRefreshBaseline(
          db,
          invocation(base, 'base').trustedContext,
          (input) => {
            validations++;
            return providers.validateNativeStateCandidate(input);
          },
          limits,
          (bytes) => observations.push(bytes),
        ),
        { status: 'UNAVAILABLE', reason: 'INVALID' },
      );
      assert.deepEqual(observations, [
        7,
        19,
        19 + rows[0].bytes,
        19 + rows[0].bytes + rows[1].bytes,
      ]);
      assert.equal(validations, 0);
      assert.equal(db.isTransaction, false);
      assert.deepEqual(persistentImage(db), before);
      assert.deepEqual(persistentImage(reopen()), before);
    },
    'utf8',
  );
});

test('D5 inventory owner failure preserves exception identity and own/outer transaction ownership', async (t) => {
  await withBaseline(t, async (db, base) => {
    const before = persistentImage(db);
    for (const outer of [false, true]) {
      for (const when of [1, 3]) {
        const sentinel =
          when === 1
            ? new Error('owner observation refused')
            : new SourceStateError('SOURCE_STATE_INVALID');
        if (outer) db.exec('BEGIN');
        let observations = 0,
          validations = 0;
        assert.throws(
          () =>
            storage.readNativeRefreshBaseline(
              db,
              invocation(base, 'base').trustedContext,
              (input) => {
                validations++;
                return providers.validateNativeStateCandidate(input);
              },
              limits,
              () => {
                if (++observations === when) throw sentinel;
              },
            ),
          (error) => error === sentinel,
        );
        assert.equal(observations, when);
        assert.equal(validations, 0);
        assert.equal(db.isTransaction, outer);
        if (outer) db.exec('ROLLBACK');
        assert.deepEqual(persistentImage(db), before);
      }
    }
  });
});

test('D5 inventory owner observes a nullable pointer and selected revision before early refusal', async (t) => {
  await withBaseline(t, async (db, base) => {
    const observations = [];
    assert.deepEqual(
      storage.readNativeRefreshBaseline(
        db,
        invocation(base, 'target').trustedContext,
        providers.validateNativeStateCandidate,
        limits,
        (bytes) => observations.push(bytes),
      ),
      { status: 'UNAVAILABLE', reason: 'INVALID' },
    );
    assert.deepEqual(observations, [7, 19]);
    observations.length = 0;
    db.prepare('UPDATE repository_state SET indexed_content_fingerprint=NULL').run();
    assert.deepEqual(
      storage.readNativeRefreshBaseline(
        db,
        invocation(base, 'base').trustedContext,
        providers.validateNativeStateCandidate,
        limits,
        (bytes) => observations.push(bytes),
      ),
      { status: 'UNAVAILABLE', reason: 'MISSING' },
    );
    assert.deepEqual(observations, [3]);
    assert.equal(db.isTransaction, false);
  });
});

test('D5 inventory owner is silent when the numeric reservation refuses before TEXT', async (t) => {
  await withBaseline(t, async (db, base) => {
    const queries = [],
      original = db.prepare.bind(db);
    db.prepare = (sql) => {
      queries.push(sql);
      return original(sql);
    };
    let observations = 0,
      validations = 0;
    assert.deepEqual(
      storage.readNativeRefreshBaseline(
        db,
        invocation(base, 'base').trustedContext,
        (input) => {
          validations++;
          return providers.validateNativeStateCandidate(input);
        },
        { ...limits, workspaceReservationBytes: limits.memoryBudgetBytes },
        () => observations++,
      ),
      { status: 'UNAVAILABLE', reason: 'RESOURCE_LIMIT_EXCEEDED' },
    );
    assert.equal(observations, 0);
    assert.equal(validations, 0);
    assert.equal(
      queries.some((sql) => /^SELECT (?:indexed_revision_id|\* FROM source_files)/i.test(sql)),
      false,
    );
    assert.equal(db.isTransaction, false);
  });
});
