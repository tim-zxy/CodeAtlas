import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nativeMetadataEnvironment } from '../dist/native-metadata-admission.js';
import { discoverFixtures } from '../../evaluation/dist/index.js';
import {
  runMigrations,
  captureNativeActivationToken,
  RepositoryCanonicalFactStore,
  RepositoryPatchStage,
  RepositorySourceStateStore,
  readAnalysisFreshness,
} from '../../storage/dist/index.js';
import * as runtime from '../dist/index.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const index = JSON.parse(
  await readFile(path.join(root, 'fixtures/storage/native-full-bootstrap/cases.json'), 'utf8'),
);
const fixtures = await discoverFixtures(path.join(root, 'fixtures/native'));
const binary = path.join(
  process.env.CARGO_TARGET_DIR
    ? path.resolve(root, process.env.CARGO_TARGET_DIR)
    : path.join(root, 'target'),
  'debug',
  process.platform === 'win32' ? 'codeatlas-native-analyzer.exe' : 'codeatlas-native-analyzer',
);
const options = { executablePath: binary, arguments: ['--parse-workers', '1'], timeoutMs: 10_000 };
const context = {
  providerId: 'native',
  providerVersion: '0.0.0',
  language: {
    languageId: 'java',
    grammarVersion: '0.23.5',
    analyzerVersion: '0.0.0',
    compatibilityVersion: '1',
  },
  resolverVersion: '1',
  normalizerVersion: '1',
  policyFingerprint: 'fixture-policy',
};
// Task 6 tests the explicit full-v3 path before Task 7 publishes negotiation.
// This future descriptor is not evidence that the actual handshake advertises 3.
const descriptor = {
  providerId: 'native',
  providerVersion: '0.0.0',
  runtimeVersion: '0.0.0',
  protocolVersions: [1, 2, 3],
  irSchemaVersions: [1],
  capabilities: ['protocol-handshake', 'SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'],
  languages: [context.language],
  limits: { maxLineBytes: 1_000_000, maxEventCount: 10_000, maxTotalBytes: 10_000_000 },
  build: { target: 'test', profile: 'debug' },
};
async function requestFor(id = 'java-call-basic') {
  assert.ok(index.sourceFixtures.includes(id));
  const fixture = fixtures.find((f) => f.manifest.id === id);
  assert.ok(fixture);
  const names = (await readdir(path.join(fixture.inputs.source, 'src')))
    .filter((v) => v.endsWith('.java'))
    .sort();
  const sourceFiles = await Promise.all(
    names.map(async (name) => ({
      id: `file-${name}`,
      repositoryId: 'repo-fixture',
      revisionId: 'rev-fixture',
      path: `src/${name}`,
      contentFingerprint:
        'sha256:' +
        createHash('sha256')
          .update(await readFile(path.join(fixture.inputs.source, 'src', name)))
          .digest('hex'),
      classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
      languageHint: 'java',
      sensitivity: 'PUBLIC',
    })),
  );
  return {
    protocolVersion: 3,
    requestId: 'bootstrap',
    sequence: 0,
    type: 'ANALYZE',
    payload: {
      irSchemaVersion: 1,
      providerSnapshotId: 'snapshot-bootstrap',
      repository: { id: 'repo-fixture', rootPath: fixture.inputs.source },
      revision: {
        id: 'rev-fixture',
        repositoryId: 'repo-fixture',
        kind: 'WORKTREE',
        contentFingerprint: 'sha256:revision-fixture',
        baseRevisionId: null,
      },
      sourceFiles,
      requestedCapabilities: fixture.manifest.capabilities,
      deadlineEpochMs: null,
      resourceBudget: { maxDurationMs: 10_000, maxMemoryBytes: 1_000_000_000, maxEvents: 10_000 },
      analysisStateContext: structuredClone(context),
      baselineState: null,
    },
  };
}
function expected(request) {
  return {
    ...structuredClone(context),
    repositoryId: 'repo-fixture',
    revisionId: 'rev-fixture',
    contentFingerprint: 'sha256:revision-fixture',
    requestedCapabilities: [...request.payload.requestedCapabilities],
  };
}
async function withDatabase(request, run, version = 10) {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-full-bootstrap-'));
  const databasePath = path.join(directory, 'repository.sqlite');
  let db;
  try {
    let manifestUrl = new URL('../../storage/migrations/repository/manifest.json', import.meta.url);
    if (version === 9) {
      const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
      manifest.migrations = manifest.migrations.slice(0, 9);
      for (const entry of manifest.migrations)
        await cp(new URL(entry.file, manifestUrl), path.join(directory, entry.file));
      manifestUrl = pathToFileURL(path.join(directory, 'manifest-r009.json'));
      await writeFile(manifestUrl, JSON.stringify(manifest));
    }
    await runMigrations({
      databasePath,
      databaseKind: 'REPOSITORY',
      manifestUrl,
    });
    db = new DatabaseSync(databasePath);
    const { repository, revision, sourceFiles } = request.payload;
    db.prepare('INSERT INTO repository (slot,id,root_path) VALUES (1,?,?)').run(
      repository.id,
      repository.rootPath,
    );
    db.prepare('INSERT INTO repository_state (repository_id) VALUES (?)').run(repository.id);
    db.prepare(
      'INSERT INTO revisions (id,repository_id,kind,content_fingerprint,base_revision_id) VALUES (?,?,?,?,?)',
    ).run(revision.id, repository.id, revision.kind, revision.contentFingerprint, null);
    for (const file of sourceFiles)
      db.prepare(
        'INSERT INTO source_files (revision_id,id,repository_id,path,content_fingerprint,role,provenance,content_kind,language_hint,sensitivity) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(
        file.revisionId,
        file.id,
        file.repositoryId,
        file.path,
        file.contentFingerprint,
        file.classification.role,
        file.classification.provenance,
        file.classification.contentKind,
        file.languageHint,
        file.sensitivity,
      );
    await run({
      get db() {
        return db;
      },
      databasePath,
      reopen() {
        db.close();
        db = new DatabaseSync(databasePath);
        return db;
      },
    });
  } finally {
    db?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
function rows(db) {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  return Object.fromEntries(
    tables.map(({ name }) => [
      name,
      db
        .prepare(`SELECT * FROM "${name}"`)
        .all()
        .map((r) => JSON.stringify(r))
        .sort(),
    ]),
  );
}
async function bootstrap(db, request) {
  assert.equal(
    typeof runtime.applyNativeFullBootstrap,
    'function',
    'Task 6 Runtime composition is required',
  );
  return runtime.applyNativeFullBootstrap(db, request, options, descriptor, expected(request));
}
function baseline(db, request) {
  assert.equal(typeof runtime.readNativeFullBaseline, 'function');
  return runtime.readNativeFullBaseline(db, expected(request), {
    maxSerializedBytes: 1_000_000,
    memoryBudgetBytes: 1_000_000_000,
  });
}
const executed = new Set();
function caseTest(id, fn) {
  assert.ok(index.cases.includes(id));
  assert.ok(!executed.has(id));
  executed.add(id);
  test(id, fn);
}
caseTest('real-bootstrap-reopen', async () => {
  const request = await requestFor();
  await withDatabase(request, async (state) => {
    await bootstrap(state.db, request);
    const before = baseline(state.db, request);
    assert.equal(before.status, 'AVAILABLE');
    assert.equal(before.state.files.length, request.payload.sourceFiles.length);
    assert.ok(state.db.prepare('SELECT count(*) AS n FROM canonical_nodes').get().n > 0);
    const full = rows(state.db);
    state.reopen();
    assert.deepEqual(baseline(state.db, request), before);
    assert.deepEqual(rows(state.db), full);
  });
});
caseTest('same-fingerprint-activation-race', async () => {
  const request = await requestFor();
  await withDatabase(request, async (state) => {
    await bootstrap(state.db, request);
    const other = new DatabaseSync(state.databasePath);
    try {
      const a = structuredClone(request),
        b = structuredClone(request);
      a.payload.providerSnapshotId = 'race-a';
      b.payload.providerSnapshotId = 'race-b';
      const results = await Promise.allSettled([bootstrap(state.db, a), bootstrap(other, b)]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
      const saved = rows(state.db);
      state.reopen();
      assert.deepEqual(rows(state.db), saved);
      assert.equal(baseline(state.db, request).status, 'AVAILABLE');
      assert.equal(state.db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
    } finally {
      other.close();
    }
  });
});
caseTest('classification-drift-before-write-lock', async () => {
  const request = await requestFor();
  await withDatabase(request, async (state) => {
    await bootstrap(state.db, request);
    const other = new DatabaseSync(state.databasePath);
    const originalExec = state.db.exec;
    let changed;
    state.db.exec = function (sql) {
      if (sql === 'BEGIN IMMEDIATE') {
        other
          .prepare('UPDATE source_files SET sensitivity=? WHERE id=?')
          .run('SECRET', request.payload.sourceFiles[0].id);
        changed = rows(other);
      }
      return originalExec.call(this, sql);
    };
    try {
      const next = structuredClone(request);
      next.payload.providerSnapshotId = 'classification-drift';
      await assert.rejects(bootstrap(state.db, next), /source.*differs/i);
      assert.ok(changed, 'exercise the write-lock boundary, not the Runtime precheck');
      assert.equal(state.db.isTransaction, false);
      state.reopen();
      assert.deepEqual(rows(state.db), changed);
    } finally {
      other.close();
    }
  });
});
for (const [id, sql] of [
  [
    'rollback-after-support-retirement',
    "CREATE TRIGGER reject_full BEFORE DELETE ON canonical_nodes BEGIN SELECT RAISE(ABORT,'injected failure'); END",
  ],
  [
    'rollback-after-summary-deletion',
    "CREATE TRIGGER reject_full AFTER DELETE ON native_analysis_file BEGIN SELECT RAISE(ABORT,'injected failure'); END",
  ],
  [
    'rollback-after-summary-insertion',
    "CREATE TRIGGER reject_full AFTER INSERT ON native_analysis_file BEGIN SELECT RAISE(ABORT,'injected failure'); END",
  ],
  [
    'rollback-after-pointer-update',
    "CREATE TRIGGER reject_full AFTER UPDATE OF indexed_revision_id ON repository_state BEGIN SELECT RAISE(ABORT,'injected failure'); END",
  ],
])
  caseTest(id, async () => {
    const request = await requestFor();
    await withDatabase(request, async (state) => {
      await bootstrap(state.db, request);
      const before = rows(state.db);
      state.db.exec(sql);
      const next = structuredClone(request);
      next.payload.providerSnapshotId = 'failed-attempt';
      await assert.rejects(bootstrap(state.db, next), /injected failure/);
      assert.equal(state.db.isTransaction, false);
      state.reopen();
      assert.deepEqual(rows(state.db), before);
      assert.equal(baseline(state.db, request).status, 'AVAILABLE');
    });
  });
function legacy(request, snapshotId) {
  const { analysisStateContext: _context, baselineState: _baseline, ...payload } = request.payload;
  return {
    protocolVersion: 2,
    requestId: 'legacy',
    type: 'ANALYZE',
    payload: { ...payload, providerSnapshotId: snapshotId },
  };
}
caseTest('same-fingerprint-legacy-activation-invalidates-token', async () => {
  const request = await requestFor();
  await withDatabase(request, async (state) => {
    await runtime.applyNativeFullAnalysis(
      state.db,
      legacy(request, 'legacy-before'),
      options,
      descriptor,
    );
    const captured = captureNativeActivationToken(state.db, 'repo-fixture');
    await runtime.applyNativeFullAnalysis(
      state.db,
      legacy(request, 'legacy-concurrent'),
      options,
      descriptor,
    );
    const current = captureNativeActivationToken(state.db, 'repo-fixture');
    assert.equal(state.db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
    assert.notDeepEqual(
      current,
      captured,
      'A new successful legacy activation must invalidate the pre-observation token',
    );
  });
});
caseTest('legacy-full-success-invalidates', async () => {
  const request = await requestFor();
  await withDatabase(request, async (state) => {
    await bootstrap(state.db, request);
    await runtime.applyNativeFullAnalysis(
      state.db,
      legacy(request, 'legacy-success'),
      options,
      descriptor,
    );
    state.reopen();
    assert.equal(baseline(state.db, request).status, 'UNAVAILABLE');
    assert.deepEqual(state.db.prepare('SELECT * FROM native_analysis_state').all(), []);
    assert.deepEqual(state.db.prepare('SELECT * FROM native_analysis_file').all(), []);
    assert.ok(state.db.prepare('SELECT count(*) AS n FROM canonical_nodes').get().n > 0);
  });
});
caseTest('legacy-full-failure-preserves', async () => {
  const request = await requestFor();
  await withDatabase(request, async (state) => {
    await bootstrap(state.db, request);
    const before = rows(state.db);
    state.db.exec(
      "CREATE TRIGGER reject_legacy AFTER UPDATE OF indexed_revision_id ON repository_state BEGIN SELECT RAISE(ABORT,'legacy failure'); END",
    );
    await assert.rejects(
      runtime.applyNativeFullAnalysis(
        state.db,
        legacy(request, 'legacy-failure'),
        options,
        descriptor,
      ),
      /legacy failure/,
    );
    state.reopen();
    assert.deepEqual(rows(state.db), before);
  });
});
for (const fails of [false, true])
  caseTest(
    fails ? 'legacy-patch-failure-preserves' : 'legacy-patch-success-invalidates',
    async () => {
      const request = await requestFor();
      await withDatabase(request, async (state) => {
        await bootstrap(state.db, request);
        const before = rows(state.db);
        const snapshot = {
          id: 'legacy-patch',
          repositoryId: 'repo-fixture',
          providerId: 'native',
          providerVersion: '0.0.0',
          runtimeVersion: '0.0.0',
          requestedRevisionId: 'rev-fixture',
          requestedRevisionFingerprint: request.payload.revision.contentFingerprint,
          startedAt: '2026-10-02T00:00:00.000Z',
          completedAt: '2026-10-02T00:00:01.000Z',
          capabilities: request.payload.requestedCapabilities.map((name) => ({
            name,
            support: 'SUPPORTED',
            coverage: 'COMPLETE',
          })),
          diagnostics: [],
          outcome: 'SUCCEEDED',
        };
        const stage = new RepositoryPatchStage(state.db, (group) => group[0].canonical);
        try {
          stage.confirmSucceeded({
            type: 'REFRESH_COMPLETED',
            payload: {
              repositoryId: snapshot.repositoryId,
              revisionId: snapshot.requestedRevisionId,
              revisionFingerprint: snapshot.requestedRevisionFingerprint,
              providerSnapshotId: snapshot.id,
              outcome: 'SUCCEEDED',
              counts: {
                sourceFiles: 0,
                upsertedNodes: 0,
                removedNodes: 0,
                upsertedEdges: 0,
                removedEdges: 0,
                coverage: 0,
                diagnostics: 0,
              },
            },
          });
          if (fails)
            state.db.exec(
              "CREATE TRIGGER reject_patch AFTER UPDATE OF indexed_revision_id ON repository_state BEGIN SELECT RAISE(ABORT,'patch failure'); END",
            );
          const apply = () =>
            new RepositoryCanonicalFactStore(state.db).applyAnalysisPatch(stage, {
              repositoryId: snapshot.repositoryId,
              baseRevisionId: snapshot.requestedRevisionId,
              baseContentFingerprint: snapshot.requestedRevisionFingerprint,
              targetRevisionId: snapshot.requestedRevisionId,
              targetContentFingerprint: snapshot.requestedRevisionFingerprint,
              snapshot,
            });
          if (fails) assert.throws(apply, /patch failure/);
          else apply();
        } finally {
          stage.close();
        }
        state.reopen();
        if (fails) assert.deepEqual(rows(state.db), before);
        else {
          assert.equal(baseline(state.db, request).status, 'UNAVAILABLE');
          assert.deepEqual(state.db.prepare('SELECT * FROM native_analysis_state').all(), []);
          assert.deepEqual(state.db.prepare('SELECT * FROM native_analysis_file').all(), []);
          for (const table of [
            'canonical_nodes',
            'canonical_edges',
            'evidence',
            'provider_fact_bindings',
          ])
            assert.deepEqual(rows(state.db)[table], before[table]);
        }
      });
    },
  );
caseTest('reconciliation-preserves-stale-baseline', async () => {
  const request = await requestFor();
  await withDatabase(request, async (state) => {
    await bootstrap(state.db, request);
    const before = baseline(state.db, request);
    const source = new RepositorySourceStateStore(state.db);
    const loaded = source.load('repo-fixture');
    source.replace(loaded, {
      revision: { ...loaded.revision, contentFingerprint: 'sha256:new-revision' },
      files: loaded.files,
    });
    state.reopen();
    assert.equal(readAnalysisFreshness(state.db, 'repo-fixture'), 'STALE');
    assert.deepEqual(baseline(state.db, request), before);
  });
});
caseTest('baseline-read-does-not-parse', async () => {
  const request = await requestFor();
  await withDatabase(request, async (state) => {
    assert.equal(baseline(state.db, request).status, 'UNAVAILABLE');
    await bootstrap(state.db, request);
    const before = rows(state.db);
    const original = childProcess.spawn;
    let calls = 0;
    childProcess.spawn = () => {
      calls++;
      throw new Error('read must not spawn');
    };
    syncBuiltinESMExports();
    try {
      const result = runtime.readNativeFullBaseline(
        state.db,
        {
          ...expected(request),
          normalizerVersion: 'incompatible',
        },
        { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 1_000_000_000 },
      );
      assert.equal(result.status, 'UNAVAILABLE');
      assert.equal(result.reason, 'INCOMPATIBLE');
      assert.equal(calls, 0);
      assert.deepEqual(rows(state.db), before);
    } finally {
      childProcess.spawn = original;
      syncBuiltinESMExports();
    }
  });
});
caseTest('zero-fact-file-success', async () => {
  const request = await requestFor('java-coverage-zero');
  assert.ok(request.payload.sourceFiles.length > 0);
  await withDatabase(request, async (state) => {
    await bootstrap(state.db, request);
    state.reopen();
    assert.equal(baseline(state.db, request).status, 'AVAILABLE');
    assert.equal(state.db.prepare('SELECT count(*) AS n FROM canonical_nodes').get().n, 0);
    assert.equal(state.db.prepare('SELECT count(*) AS n FROM canonical_edges').get().n, 0);
    assert.equal(
      state.db.prepare('SELECT count(*) AS n FROM native_analysis_file').get().n,
      request.payload.sourceFiles.length,
    );
  });
});
caseTest('zero-file-success', async () => {
  const request = await requestFor('java-coverage-zero');
  request.payload.sourceFiles = [];
  await withDatabase(request, async (state) => {
    await bootstrap(state.db, request);
    state.reopen();
    assert.equal(baseline(state.db, request).status, 'AVAILABLE');
    assert.equal(state.db.prepare('SELECT count(*) AS n FROM native_analysis_state').get().n, 1);
    assert.equal(state.db.prepare('SELECT count(*) AS n FROM native_analysis_file').get().n, 0);
  });
});
caseTest('r009-legacy-success-and-bootstrap-refusal', async () => {
  const request = await requestFor();
  await withDatabase(
    request,
    async (state) => {
      await runtime.applyNativeFullAnalysis(
        state.db,
        legacy(request, 'r009-legacy'),
        options,
        descriptor,
      );
      const before = rows(state.db);
      await assert.rejects(bootstrap(state.db, request), /requires R010/);
      state.reopen();
      assert.deepEqual(rows(state.db), before);
      assert.equal(state.db.prepare('PRAGMA user_version').get().user_version, 9);
      assert.equal(baseline(state.db, request).status, 'UNAVAILABLE');
    },
    9,
  );
});
caseTest('broken-r010-is-not-silently-legacy', async () => {
  const request = await requestFor();
  await withDatabase(request, async (state) => {
    await bootstrap(state.db, request);
    state.db.exec('DROP TABLE native_analysis_file');
    const before = rows(state.db);
    await assert.rejects(
      runtime.applyNativeFullAnalysis(
        state.db,
        legacy(request, 'broken-schema'),
        options,
        descriptor,
      ),
      /complete R010 schema/,
    );
    state.reopen();
    assert.deepEqual(rows(state.db), before);
  });
});
caseTest('stale-target-inventory-refuses', async () => {
  const request = await requestFor();
  await withDatabase(request, async (state) => {
    await bootstrap(state.db, request);
    state.db
      .prepare('UPDATE source_files SET content_fingerprint=? WHERE id=?')
      .run('sha256:changed-file', request.payload.sourceFiles[0].id);
    const before = rows(state.db);
    const next = structuredClone(request);
    next.payload.providerSnapshotId = 'stale-attempt';
    await assert.rejects(bootstrap(state.db, next), /source differs/);
    state.reopen();
    assert.deepEqual(rows(state.db), before);
    assert.equal(baseline(state.db, request).status, 'AVAILABLE');
  });
});
for (const cancelled of [false, true])
  caseTest(cancelled ? 'cancelled-bootstrap-preserves' : 'analyzer-failure-preserves', async () => {
    const request = await requestFor();
    await withDatabase(request, async (state) => {
      await bootstrap(state.db, request);
      const before = rows(state.db);
      const next = structuredClone(request);
      next.payload.providerSnapshotId = 'failed-bootstrap';
      const controller = new AbortController();
      if (cancelled) controller.abort();
      else
        next.payload.repository.rootPath = path.join(
          path.dirname(state.databasePath),
          'missing-root',
        );
      await assert.rejects(
        runtime.applyNativeFullBootstrap(
          state.db,
          next,
          {
            ...options,
            signal: controller.signal,
          },
          descriptor,
          expected(next),
        ),
        (error) => (cancelled ? error.code === 'CANCELLED' : error.code === 'ANALYZER_FAILED'),
      );
      assert.equal(
        state.db
          .prepare(
            "SELECT count(*) AS n FROM sqlite_temp_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
          )
          .get().n,
        0,
      );
      state.reopen();
      assert.deepEqual(rows(state.db), before);
      assert.equal(baseline(state.db, request).status, 'AVAILABLE');
    });
  });
caseTest('read-only-profile-refuses-before-observation', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-bootstrap-read-only-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const isolated = path.join(directory, 'packages', 'runtime');
  await mkdir(isolated, { recursive: true });
  await cp(new URL('../dist', import.meta.url), path.join(isolated, 'dist'), { recursive: true });
  await cp(new URL('../package.json', import.meta.url), path.join(isolated, 'package.json'));
  for (const name of ['providers', 'storage', 'application'])
    await symlink(
      path.join(root, 'packages', name),
      path.join(directory, 'packages', name),
      'junction',
    );
  const profile = { ...nativeMetadataEnvironment(), reservationBytes: 247_508_992 };
  await writeFile(
    path.join(isolated, 'dist', 'native-metadata-profiles.js'),
    'export const nativeMetadataProfiles = Object.freeze([' + JSON.stringify(profile) + ']);\n',
  );
  const admission = await import(
    pathToFileURL(path.join(isolated, 'dist', 'native-metadata-admission.js')).href
  );
  admission.assertNativeMetadataAdmission(1_000_000_000);
  const module = await import(
    pathToFileURL(path.join(isolated, 'dist', 'native-full-bootstrap.js')).href
  );
  const request = await requestFor();
  await withDatabase(request, async (state) => {
    const before = rows(state.db);
    const trusted = expected(request);
    let observations = 0;
    Object.defineProperty(request.payload, 'sourceFiles', {
      get() {
        observations++;
        throw Error('source must not be inspected');
      },
    });
    Object.defineProperty(request, 'toJSON', {
      value() {
        observations++;
        throw Error('must not serialize');
      },
    });
    const original = childProcess.spawn;
    childProcess.spawn = () => {
      observations++;
      throw Error('must not spawn');
    };
    syncBuiltinESMExports();
    try {
      await assert.rejects(
        module.applyNativeFullBootstrap(state.db, request, options, descriptor, trusted),
        (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
      );
      assert.equal(observations, 0);
      assert.deepEqual(rows(state.db), before);
    } finally {
      childProcess.spawn = original;
      syncBuiltinESMExports();
    }
  });
});
caseTest('partial-refusal', async () => {
  const request = await requestFor('java-coverage-syntax');
  await withDatabase(request, async (state) => {
    const before = rows(state.db);
    await assert.rejects(bootstrap(state.db, request), /not eligible/);
    state.reopen();
    assert.deepEqual(rows(state.db), before);
  });
});
caseTest('unreviewed-profile-refuses-before-observation', async () => {
  const originalV8 = Object.getOwnPropertyDescriptor(process.versions, 'v8');
  Object.defineProperty(process.versions, 'v8', {
    value: 'unreviewed-fixture',
    configurable: true,
  });
  try {
    const request = await requestFor();
    await withDatabase(request, async (state) => {
      const before = rows(state.db);
      const observations = { source: 0, serialization: 0, spawn: 0 };
      const files = request.payload.sourceFiles;
      Object.defineProperty(request.payload, 'sourceFiles', {
        enumerable: true,
        get() {
          observations.source++;
          return files;
        },
      });
      Object.defineProperty(request, 'toJSON', {
        value() {
          observations.serialization++;
          return {};
        },
      });
      const original = childProcess.spawn;
      childProcess.spawn = () => {
        observations.spawn++;
        throw new Error('spawn must not occur');
      };
      syncBuiltinESMExports();
      try {
        await assert.rejects(
          bootstrap(state.db, request),
          (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
        );
        assert.deepEqual(observations, { source: 0, serialization: 0, spawn: 0 });
        assert.deepEqual(rows(state.db), before);
      } finally {
        childProcess.spawn = original;
        syncBuiltinESMExports();
      }
    });
  } finally {
    Object.defineProperty(process.versions, 'v8', originalV8);
  }
});
assert.deepEqual([...executed].sort(), [...index.cases].sort());
