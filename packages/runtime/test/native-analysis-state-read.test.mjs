import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import * as storage from '../../storage/dist/index.js';
import * as providers from '../../providers/dist/index.js';
import { createNativeStateValidationPort } from '../dist/index.js';
const validateNativeStateCandidate = providers.validateNativeStateCandidate;

const header = {
  schemaVersion: 1,
  repositoryId: 'repo',
  revisionId: 'worktree',
  contentFingerprint: 'old-fingerprint',
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
  policyFingerprint: 'policy',
  requestedCapabilities: ['SYMBOL'],
  sourceFileCount: 0,
  // SHA-256 of canonical []: an independent, literal zero-file vector.
  summaryDigest: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
};
const { schemaVersion, sourceFileCount, summaryDigest, ...expected } = header;
const limits = { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 16 * 1024 * 1024 };
const manifestUrl = new URL('../../storage/migrations/repository/manifest.json', import.meta.url);

async function withBaseline(t, run) {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-baseline-read-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'repo.sqlite');
  await storage.runMigrations({ databasePath: path, databaseKind: 'REPOSITORY', manifestUrl });
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      INSERT INTO repository (slot,id,root_path) VALUES (1,'repo','/old-root');
      INSERT INTO revisions (id,repository_id,kind,content_fingerprint) VALUES ('worktree','repo','WORKTREE','old-fingerprint');
      INSERT INTO repository_state (repository_id,indexed_revision_id,indexed_content_fingerprint) VALUES ('repo','worktree','old-fingerprint');
      INSERT INTO provider_snapshots (id,repository_id,provider_id,provider_version,runtime_version,
        requested_revision_id,requested_revision_fingerprint,started_at,completed_at,outcome)
        VALUES ('snapshot','repo','native','0.0.0','0.0.0','worktree','old-fingerprint',1,2,'SUCCEEDED');
    `);
    db.prepare('INSERT INTO native_analysis_state VALUES (?,?,?,?,?,?)').run(
      'repo',
      'native',
      'snapshot',
      'worktree',
      'old-fingerprint',
      JSON.stringify(header),
    );
    await run(db, path);
  } finally {
    db.close();
  }
}
function read(db, context = expected, budget = limits, port) {
  // Provisional core composition approved for calibration. This does not
  // exercise or bypass the production Runtime admission adapter.
  assert.equal(typeof validateNativeStateCandidate, 'function');
  assert.equal(typeof storage.readNativeAnalysisState, 'function');
  return storage.readNativeAnalysisState(db, context, port ?? validateNativeStateCandidate, budget);
}
function unchanged(db) {
  return db.prepare('SELECT * FROM native_analysis_state').all();
}

const readCases = {
  'stale-indexed-state-survives-reconciliation': async (t) =>
    withBaseline(t, async (db) => {
      const source = new storage.RepositorySourceStateStore(db);
      const before = source.load('repo');
      source.replace(before, {
        revision: { ...before.revision, contentFingerprint: 'new-fingerprint' },
        files: [],
      });
      db.exec("UPDATE repository SET root_path='/new-root'");
      const rows = unchanged(db);
      const result = read(db);
      assert.equal(storage.readAnalysisFreshness(db, 'repo'), 'STALE');
      assert.equal(result.status, 'AVAILABLE');
      assert.deepEqual(JSON.parse(result.state.headerJson), header);
      assert.equal(Object.isFrozen(result.state), true);
      assert.equal(Object.isFrozen(result.state.expected.language), true);
      assert.deepEqual(unchanged(db), rows);
    }),
  'bounded-read-refuses-before-validator': async (t) =>
    withBaseline(t, async (db) => {
      let calls = 0;
      const result = read(db, expected, { ...limits, maxSerializedBytes: 1 }, () => {
        calls++;
        throw Error('must not parse');
      });
      assert.deepEqual(result, { status: 'UNAVAILABLE', reason: 'RESOURCE_LIMIT_EXCEEDED' });
      assert.equal(calls, 0);
      const retained = [
        JSON.stringify(header),
        'repo',
        'native',
        'snapshot',
        'worktree',
        'old-fingerprint',
        'worktree',
        'old-fingerprint',
        'snapshot',
        'repo',
        'native',
        '0.0.0',
        'worktree',
        'old-fingerprint',
        'SUCCEEDED',
        'worktree',
        'repo',
        'WORKTREE',
      ].reduce((n, text) => n + Buffer.byteLength(text), 0);
      assert.equal(
        read(db, expected, limits, (input) => {
          assert.equal(input.memoryBudgetBytes, limits.memoryBudgetBytes - 2 * retained);
          return validateNativeStateCandidate(input);
        }).status,
        'AVAILABLE',
      );
      assert.deepEqual(read(db, expected, { ...limits, memoryBudgetBytes: 1 }), {
        status: 'UNAVAILABLE',
        reason: 'RESOURCE_LIMIT_EXCEEDED',
      });
      assert.throws(() => read(db, expected, { ...limits, maxSerializedBytes: 1_000_001 }));
    }),
  'duplicated-sql-columns-are-bounded-before-validator': async (t) =>
    withBaseline(t, async (db) => {
      // A JSON-only size check misses a corrupt duplicated SQL column. The
      // reader must inspect lengths in SQLite before materializing that row.
      const hugePath = 'x'.repeat(limits.memoryBudgetBytes + 1);
      db.prepare('INSERT INTO native_analysis_file VALUES (?,?,?,?,?,?)').run(
        'repo',
        'native',
        'file',
        hugePath,
        'fingerprint',
        '{}',
      );
      let calls = 0;
      assert.deepEqual(
        read(db, expected, limits, () => {
          calls++;
          throw Error('must not materialize or validate oversized row');
        }),
        { status: 'UNAVAILABLE', reason: 'RESOURCE_LIMIT_EXCEEDED' },
      );
      assert.equal(calls, 0);
      assert.equal(db.isTransaction, false);
      assert.equal(db.prepare('SELECT count(*) AS n FROM native_analysis_file').get().n, 1);
    }),
  'column-digest-and-provenance-drift': async (t) =>
    withBaseline(t, async (db) => {
      const restore = () => {
        db.prepare(
          "UPDATE native_analysis_state SET header_json=?,content_fingerprint='old-fingerprint'",
        ).run(JSON.stringify(header));
        db.exec("UPDATE provider_snapshots SET outcome='SUCCEEDED',provider_version='0.0.0'");
      };
      for (const bad of [
        { ...header, unknown: true },
        { ...header, summaryDigest: 'a'.repeat(64) },
        { ...header, sourceFileCount: 1 },
      ]) {
        restore();
        db.prepare('UPDATE native_analysis_state SET header_json=?').run(JSON.stringify(bad));
        assert.deepEqual(read(db), { status: 'UNAVAILABLE', reason: 'INVALID' });
      }
      restore();
      db.exec("UPDATE native_analysis_state SET content_fingerprint='drift'");
      assert.deepEqual(read(db), { status: 'UNAVAILABLE', reason: 'INVALID' });
      restore();
      db.exec("UPDATE provider_snapshots SET outcome='PARTIAL'");
      assert.deepEqual(read(db), { status: 'UNAVAILABLE', reason: 'INVALID' });
      restore();
      db.exec("UPDATE provider_snapshots SET provider_version='other'");
      assert.deepEqual(read(db), { status: 'UNAVAILABLE', reason: 'INVALID' });
      restore();
      db.exec('PRAGMA ignore_check_constraints=ON');
      db.exec("UPDATE native_analysis_state SET header_json='{' ");
      assert.deepEqual(read(db), { status: 'UNAVAILABLE', reason: 'INVALID' });
    }),
  'compatibility-and-applicability-are-explicit': async (t) =>
    withBaseline(t, async (db) => {
      for (const context of [
        { ...expected, policyFingerprint: 'other' },
        { ...expected, resolverVersion: '2' },
        { ...expected, normalizerVersion: '2' },
        { ...expected, requestedCapabilities: ['CALL'] },
        ...['grammarVersion', 'analyzerVersion', 'compatibilityVersion'].map((key) => ({
          ...expected,
          language: { ...expected.language, [key]: 'other' },
        })),
      ])
        assert.deepEqual(read(db, context), { status: 'UNAVAILABLE', reason: 'INCOMPATIBLE' });
      assert.deepEqual(read(db, { ...expected, revisionId: 'different' }), {
        status: 'UNAVAILABLE',
        reason: 'NOT_APPLICABLE',
      });
      db.exec("UPDATE revisions SET kind='COMMIT',commit_identity='abc'");
      assert.deepEqual(read(db), { status: 'UNAVAILABLE', reason: 'NOT_APPLICABLE' });
      db.exec('DELETE FROM native_analysis_state');
      assert.deepEqual(read(db), { status: 'UNAVAILABLE', reason: 'MISSING' });
    }),
  'validation-port-required-and-operational-errors-propagate': async (t) =>
    withBaseline(t, async (db) => {
      assert.equal(typeof storage.readNativeAnalysisState, 'function');
      assert.throws(() => storage.readNativeAnalysisState(db, expected, undefined, limits));
      assert.throws(
        () =>
          read(db, expected, limits, () => {
            throw Error('operational-port-failure');
          }),
        /operational-port-failure/,
      );
      assert.equal(db.isTransaction, false);
      const parse = JSON.parse;
      let decoded = 0;
      try {
        JSON.parse = () => {
          decoded++;
          throw Error('decode-before-admission');
        };
        assert.throws(
          () =>
            read(db, expected, limits, () => {
              throw Error('admission-refusal');
            }),
          /admission-refusal/,
        );
        assert.equal(decoded, 0);
      } finally {
        JSON.parse = parse;
      }
      const closed = new DatabaseSync(':memory:');
      closed.close();
      assert.throws(() => read(closed), /closed|not open/);
    }),
  'read-snapshot-is-coherent-across-concurrent-writer': async (t) =>
    withBaseline(t, async (db, path) => {
      db.exec('PRAGMA journal_mode=WAL');
      const other = new DatabaseSync(path);
      try {
        const port = validateNativeStateCandidate;
        const result = read(db, expected, limits, (input) => {
          other.exec(
            "UPDATE native_analysis_state SET content_fingerprint='next'; UPDATE repository_state SET indexed_content_fingerprint='next'",
          );
          return port(input);
        });
        assert.equal(result.status, 'AVAILABLE');
        assert.equal(result.token.indexedContentFingerprint, 'old-fingerprint');
        assert.equal(
          db.prepare('SELECT indexed_content_fingerprint FROM repository_state').get()
            .indexed_content_fingerprint,
          'next',
        );
      } finally {
        other.close();
      }
    }),
  'exclusive-sqlite-lock-is-not-a-missing-baseline': async (t) =>
    withBaseline(t, async (db, path) => {
      const other = new DatabaseSync(path);
      try {
        db.exec('PRAGMA busy_timeout=0');
        other.exec('BEGIN EXCLUSIVE');
        // Establish the real lock before exercising the missing read API;
        // an assertion about an undefined function must not stand in for it.
        assert.throws(
          () => db.prepare('SELECT * FROM native_analysis_state').get(),
          /locked|busy/i,
        );
        assert.equal(typeof storage.readNativeAnalysisState, 'function');
        assert.throws(() => read(db), /locked|busy/i);
        assert.equal(db.isTransaction, false);
      } finally {
        if (other.isTransaction) other.exec('ROLLBACK');
        other.close();
      }
      assert.equal(read(db).status, 'AVAILABLE');
    }),
};

test('B1 read cases have task-owned executable coverage', async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL('../../../fixtures/storage/native-analysis-state/cases.json', import.meta.url),
      'utf8',
    ),
  );
  assert.deepEqual(fixture.readCases, Object.keys(readCases));
});
for (const [name, run] of Object.entries(readCases)) test(name, run);

test('production read charges retained SQL strings before applying reviewed reservation', async (t) =>
  withBaseline(t, async (db) => {
    const retained = [
      JSON.stringify(header),
      'repo',
      'native',
      'snapshot',
      'worktree',
      'old-fingerprint',
      'worktree',
      'old-fingerprint',
      'snapshot',
      'repo',
      'native',
      '0.0.0',
      'worktree',
      'old-fingerprint',
      'SUCCEEDED',
      'worktree',
      'repo',
      'WORKTREE',
    ].reduce((n, text) => n + Buffer.byteLength(text), 0);
    const budget = { ...limits, memoryBudgetBytes: 247_508_992 + 2 * retained };
    const before = unchanged(db);
    const port = createNativeStateValidationPort();
    const { nativeMetadataEnvironment } = await import('../dist/native-metadata-admission.js');
    const { nativeMetadataProfiles } = await import('../dist/native-metadata-profiles.js');
    const environment = nativeMetadataEnvironment();
    const supported = nativeMetadataProfiles.some((profile) =>
      Object.entries(environment).every(([key, value]) => profile[key] === value),
    );
    assert.deepEqual(
      read(db, expected, { ...budget, memoryBudgetBytes: budget.memoryBudgetBytes - 1 }, port),
      { status: 'UNAVAILABLE', reason: 'RESOURCE_LIMIT_EXCEEDED' },
    );
    const result = read(db, expected, budget, port);
    if (supported) {
      assert.equal(result.status, 'AVAILABLE');
      assert.equal(Object.isFrozen(result.state.expected.language), true);
    } else assert.deepEqual(result, { status: 'UNAVAILABLE', reason: 'RESOURCE_LIMIT_EXCEEDED' });
    assert.deepEqual(unchanged(db), before);
    assert.equal(db.isTransaction, false);
  }));

test('explicit R009 legacy read is missing; R010 missing tables remain operational errors', async (t) =>
  withBaseline(t, async (db) => {
    db.exec(
      'DROP TABLE native_analysis_file; DROP TABLE native_analysis_state; PRAGMA user_version=9',
    );
    assert.deepEqual(read(db), { status: 'UNAVAILABLE', reason: 'MISSING' });
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='native_analysis_state'").get()
        .n,
      0,
    );
    db.exec('PRAGMA user_version=10');
    assert.throws(() => read(db), /no such table/i);
    assert.equal(db.isTransaction, false);
  }));

test('missing snapshot and legacy unknown indexed fingerprint do not invent a baseline', async (t) =>
  withBaseline(t, async (db) => {
    db.exec('UPDATE repository_state SET indexed_content_fingerprint=NULL');
    assert.deepEqual(read(db), { status: 'UNAVAILABLE', reason: 'MISSING' });
    // Missing provenance is a corrupt/externally written database, not a valid
    // application write. Disable FK only while constructing that test input.
    db.exec('PRAGMA foreign_keys=OFF');
    db.exec(
      "UPDATE repository_state SET indexed_content_fingerprint='old-fingerprint'; DELETE FROM provider_snapshots",
    );
    db.exec('PRAGMA foreign_keys=ON');
    assert.deepEqual(read(db), { status: 'UNAVAILABLE', reason: 'INVALID' });
    assert.equal(unchanged(db).length, 1);
    assert.equal(db.isTransaction, false);
  }));

test('sealed native stage rejects every writer and requires a validation port', async () => {
  const db = new DatabaseSync(':memory:');
  const stage = new storage.RepositoryAnalysisStage(db);
  try {
    assert.equal(typeof stage.sealNativeState, 'function');
    assert.throws(() => stage.sealNativeState(JSON.stringify(header), expected, undefined, limits));
    stage.confirmSucceeded({
      type: 'ANALYSIS_COMPLETED',
      payload: {
        outcome: 'SUCCEEDED',
        repositoryId: 'repo',
        revisionId: 'worktree',
        revisionFingerprint: 'old-fingerprint',
        providerSnapshotId: 'snapshot',
        counts: { sourceFiles: 0, nodes: 0, edges: 0, coverage: 0, diagnostics: 0 },
        capabilities: [],
      },
    });
    const sealed = stage.sealNativeState(
      JSON.stringify(header),
      expected,
      validateNativeStateCandidate,
      limits,
    );
    assert.equal(Object.isFrozen(sealed), true);
    assert.deepEqual(stage.readSealedNativeState(), sealed);
    await assert.rejects(stage.accept({ type: 'SOURCE_FILE', payload: {} }), /sealed/);
    await assert.rejects(stage.acceptNativeSummary({}), /sealed/);
    for (const method of [
      'putNormalizedNode',
      'putNormalizedEdge',
      'appendMergedRow',
      'appendSupport',
    ])
      assert.throws(() => stage[method](undefined), /sealed/, method);
    assert.throws(() => stage.confirmSucceeded({}), /sealed/);
    assert.throws(
      () =>
        stage.sealNativeState(
          JSON.stringify(header),
          expected,
          validateNativeStateCandidate,
          limits,
        ),
      /sealed/,
    );
  } finally {
    stage.close();
    db.close();
  }
});
