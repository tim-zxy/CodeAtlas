import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import * as storage from '../../storage/dist/index.js';
import * as providers from '../../providers/dist/index.js';
import { baseCase } from '../../providers/test/helpers/native-full-v3-corpus.mjs';

const preparation = await import('../dist/native-refresh-preparation.js').catch((error) => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const limits = { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 1_000_000_000 };
const options = { executablePath: process.execPath, timeoutMs: 1000 };

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
  const base = baseCase(mode);
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
