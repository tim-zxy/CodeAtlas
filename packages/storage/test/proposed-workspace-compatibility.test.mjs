// Candidate-only SQLite experiment. Not a migration manifest or production reader.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { loadMigrationPlan } from '../dist/migrations/manifest.js';
import { applyMigrationPlan } from '../dist/migrations/runner.js';
import { DocumentStore } from '../dist/documents/document-store.js';
import {
  ContractStore,
  readWorkspaceCompilationSelection,
} from '../dist/runtime/contract-store.js';
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';

const candidate = await readFile(
  new URL(
    '../../../docs/superpowers/specs/2026-11-07-w009-w011-ddl-review-candidate.md',
    import.meta.url,
  ),
  'utf8',
);
const blocks = [...candidate.matchAll(/```sql\r?\n([\s\S]*?)```/g)].map((match) => match[1]);
assert.equal(blocks.length, 3, 'explicit W009/W010 and conditional W011 text expected');
const plan = await loadMigrationPlan(
  new URL('../migrations/workspace/manifest.json', import.meta.url),
  'WORKSPACE',
);
assert.equal(plan.latestVersion, 8, 'experiment cannot install a future real manifest');
const limits = {
  maxRows: 10000,
  maxSerializedBytes: 2000000,
  maxItems: 200000,
  maxDepth: 80,
  memoryBudgetBytes: 20000000,
};
function bundle(id, digest) {
  return {
    schema: 'codeatlas.document-bundle',
    version: 1,
    payload: {
      document: {
        id: 'doc:one',
        workspaceId: 'ws:one',
        repositoryId: null,
        logicalPath: 'note.md',
        mediaType: 'text/markdown',
        sourceKind: 'MARKDOWN',
        currentRevisionId: null,
      },
      revision: {
        id,
        documentId: 'doc:one',
        sourceFingerprint: 'sha256:' + digest.repeat(64),
        parserVersion: 'fixture-v1',
        policyVersion: 'fixture-deny-only',
        sourceBasis: {
          documentId: 'doc:one',
          documentRevisionId: id,
          contentFingerprint: 'sha256:' + digest.repeat(64),
        },
        blockRefs: [],
        diagnostics: [],
        completeness: 'COMPLETE',
      },
      externalRefs: [],
      supportInventory: [],
      sections: [],
      blocks: [],
      tables: [],
      links: [],
      codeSnippets: [],
      mentions: [],
      chunks: [],
      claims: [],
    },
  };
}
function fixture(t) {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  t.after(() => db.close());
  applyMigrationPlan(db, plan);
  db.exec(
    "INSERT INTO workspace VALUES(1,'ws:one','/owned'); INSERT INTO revision_sets VALUES('set:one','ws:one',0,1)",
  );
  const store = new DocumentStore(db, 'ws:one');
  for (const [id, digest, old] of [
    ['rev:old', 'a', null],
    ['rev:head', 'b', 'rev:old'],
  ]) {
    assert.equal(
      store.applyDocuments(
        { bundle: bundle(id, digest), expectedCurrentRevisionId: old },
        limits,
        () => {},
      ).status,
      'COMMITTED',
    );
  }
  const names = db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
  const image = () =>
    names.map((name) => [name, db.prepare('SELECT * FROM "' + name + '" ORDER BY rowid').all()]);
  const schema = () =>
    db
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
      )
      .all();
  return { db, store, image, schema, oldImage: image(), oldSchema: schema() };
}
function applyCandidate(db, version, fail = false) {
  // Only this test-owned connection receives candidate text; never use runMigrations.
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(blocks[version - 9]);
    if (fail) db.exec('INSERT INTO candidate_fault_missing_table VALUES(1)');
    db.exec('PRAGMA user_version=' + version);
    db.exec('COMMIT');
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
function assertOldPhysicalState(f) {
  assert.deepEqual(f.image(), f.oldImage);
  const current = new Map(f.schema().map((row) => [row.name, row]));
  for (const object of f.oldSchema) assert.deepEqual(current.get(object.name), object);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(
    f.db.prepare("SELECT current_revision_id FROM documents WHERE id='doc:one'").get()
      .current_revision_id,
    'rev:head',
  );
  assert.equal(f.db.prepare('SELECT count(*) n FROM document_revisions').get().n, 2);
}
for (const version of [9, 10]) {
  test(
    'candidate prefix ' + version + ' preserves all old rows/layout but real readers still refuse',
    (t) => {
      const f = fixture(t);
      assert.equal(f.store.readCurrent('doc:one', limits).revisionId, 'rev:head');
      assert.equal(
        f.store.readRevision('doc:one', 'rev:old', limits, () => {}).revisionId,
        'rev:old',
      );
      for (let v = 9; v <= version; v++) applyCandidate(f.db, v);
      assertOldPhysicalState(f);
      assert.throws(() => f.store.readCurrent('doc:one', limits), {
        code: 'DOCUMENT_SCHEMA_UNSUPPORTED',
      });
      assert.throws(() => new DocumentStore(f.db, 'ws:one'), {
        code: 'DOCUMENT_SCHEMA_UNSUPPORTED',
      });
      const contracts = new ContractStore(f.db, 'ws:one', []);
      assert.throws(() => contracts.traceWorkspaceRuntime(limits), {
        message: 'INVALID_WORKSPACE_RUNTIME',
      });
      assert.throws(
        () =>
          readWorkspaceCompilationSelection(
            contracts,
            'set:one',
            new HistoryReadBudget(limits),
            () => {},
          ),
        { code: 'INVALID_HISTORY' },
      );
      assert.equal(f.db.isTransaction, false);
    },
  );
}
for (const failed of [9, 10]) {
  test(
    'candidate failure at ' + failed + ' rolls back only that step and retains committed prefix',
    (t) => {
      const f = fixture(t);
      if (failed === 10) applyCandidate(f.db, 9);
      const before = f.schema();
      assert.throws(() => applyCandidate(f.db, failed, true), /candidate_fault_missing_table/);
      assert.equal(f.db.prepare('PRAGMA user_version').get().user_version, failed - 1);
      assert.deepEqual(f.schema(), before);
      assertOldPhysicalState(f);
      if (failed === 9) assert.equal(f.store.readCurrent('doc:one', limits).revisionId, 'rev:head');
      else
        assert.throws(() => f.store.readCurrent('doc:one', limits), {
          code: 'DOCUMENT_SCHEMA_UNSUPPORTED',
        });
    },
  );
}
test('candidate W010 binds source-change document/workspace key without weakening old data', (t) => {
  const f = fixture(t);
  applyCandidate(f.db, 9);
  applyCandidate(f.db, 10);
  // SQL constraint probes only, not genuine Source evidence or an authorized writer.
  const insert = f.db.prepare(
    "INSERT INTO source_changes VALUES(?,?,'DOCUMENT',NULL,?,NULL,'{}',0)",
  );
  insert.run('change:own', 'ws:one', 'doc:one');
  assert.throws(() => insert.run('change:missing', 'ws:one', 'doc:missing'), /FOREIGN KEY/);
  assert.throws(() => insert.run('change:foreign', 'ws:other', 'doc:one'), /FOREIGN KEY/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM source_changes').get().n, 1);
  assertOldPhysicalState(f);
});

test('candidate W009 same-item deferred pointer accepts matching revision and rejects cross-item at commit', (t) => {
  const f = fixture(t);
  applyCandidate(f.db, 9);
  // These are SQL shape probes, not validated Knowledge or publication evidence.
  const item = f.db.prepare(
    "INSERT INTO knowledge_items VALUES(?,'ws:one','COMPONENT','{}','NORMAL','DRAFT',NULL,'FRESH','CURRENT','{}')",
  );
  item.run('item:one');
  item.run('item:two');
  f.db
    .prepare(
      "INSERT INTO knowledge_revisions VALUES('knowledge-rev:one','ws:one','item:one',NULL,'set:one',?,?,'snapshot:unissued','run:unissued','eval:unissued','CANDIDATE',0,'{}')",
    )
    .run('a'.repeat(64), 'b'.repeat(64));
  f.db.exec('BEGIN IMMEDIATE');
  f.db.exec(
    "UPDATE knowledge_items SET lifecycle_state='ACTIVE',published_revision_id='knowledge-rev:one' WHERE id='item:two'",
  );
  assert.throws(() => f.db.exec('COMMIT'), /FOREIGN KEY/);
  assert.equal(f.db.isTransaction, true);
  f.db.exec('ROLLBACK');
  assert.equal(
    f.db.prepare("SELECT published_revision_id FROM knowledge_items WHERE id='item:two'").get()
      .published_revision_id,
    null,
  );
  f.db.exec('BEGIN IMMEDIATE');
  f.db.exec(
    "UPDATE knowledge_items SET lifecycle_state='ACTIVE',published_revision_id='knowledge-rev:one' WHERE id='item:one'",
  );
  f.db.exec('COMMIT');
  assertOldPhysicalState(f);
  // W011/state/producer admission is intentionally not represented by this FK probe.
});

test('candidate W010 binds full run/snapshot/set tuples and guards the one-shot transition', (t) => {
  const f = fixture(t);
  applyCandidate(f.db, 9);
  applyCandidate(f.db, 10);
  f.db.exec("INSERT INTO revision_sets VALUES('set:other','ws:one',0,1)");
  const snapshot = f.db.prepare(
    "INSERT INTO compilation_input_snapshots VALUES(?,'ws:one',?,1,?,0,0,'{}')",
  );
  for (const [id, set] of [
    ['snapshot:one', 'set:one'],
    ['snapshot:other', 'set:other'],
    ['snapshot:parallel', 'set:one'],
  ])
    snapshot.run(id, set, 'c'.repeat(64));
  assert.equal(f.db.prepare('SELECT count(*) n FROM compilation_input_snapshots').get().n, 3);
  const run = f.db.prepare(
    "INSERT INTO compilation_runs VALUES(?,'ws:one','set:one','fixture:subject',?,'{}',?,NULL,'{}',0,NULL)",
  );
  assert.throws(() => run.run('run:bad', 'request:bad', 'CAPTURING'), /run must start CREATED/);
  run.run('run:one', 'request:one', 'CREATED');
  f.db.exec("UPDATE compilation_runs SET state='CAPTURING' WHERE id='run:one'");
  assert.throws(
    () => f.db.exec("UPDATE compilation_runs SET snapshot_id='snapshot:other' WHERE id='run:one'"),
    /FOREIGN KEY/,
  );
  assert.throws(
    () =>
      f.db.exec(
        "UPDATE compilation_runs SET snapshot_id='snapshot:one',state='GENERATING' WHERE id='run:one'",
      ),
    /invalid run transition/,
  );
  assert.equal(
    f.db.prepare("SELECT snapshot_id FROM compilation_runs WHERE id='run:one'").get().snapshot_id,
    null,
  );
  f.db.exec("UPDATE compilation_runs SET snapshot_id='snapshot:one' WHERE id='run:one'");
  assert.throws(
    () =>
      f.db.exec("UPDATE compilation_runs SET snapshot_id='snapshot:parallel' WHERE id='run:one'"),
    /snapshot binding is one-shot/,
  );
  f.db.exec("UPDATE compilation_runs SET state='GENERATING' WHERE id='run:one'");
  const publication = f.db.prepare(
    "INSERT INTO publication_runs VALUES(?,'ws:one','run:one',?,'set:one','{}','{}',0,'{}')",
  );
  assert.throws(() => publication.run('publication:wrong', 'snapshot:parallel'), /FOREIGN KEY/);
  const support = f.db.prepare(
    "INSERT INTO snapshot_supports VALUES('ws:one','snapshot:one','set:one',?,'basis:one','entity:one',?,?,'fixture-only','{}')",
  );
  support.run('support:one', 'd'.repeat(64), 'e'.repeat(64));
  assert.throws(
    () => support.run('support:duplicate', 'd'.repeat(64), 'e'.repeat(64)),
    /duplicate immutable key/,
  );
  f.db.exec("UPDATE compilation_runs SET state='FAILED',finished_at_ms=1 WHERE id='run:one'");
  assert.throws(
    () =>
      f.db.exec("UPDATE compilation_runs SET metadata_json='{\"new\":true}' WHERE id='run:one'"),
    /terminal run/,
  );
  assert.equal(f.db.isTransaction, false);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
  // SQL rows above do not supply strict Capture validation, policy or a publisher.
});

test('candidate duplicate guards reject REPLACE independently of recursive triggers', (t) => {
  const f = fixture(t);
  applyCandidate(f.db, 9);
  applyCandidate(f.db, 10);
  f.db.exec('PRAGMA recursive_triggers=OFF');
  f.db.exec(
    "INSERT INTO compilation_input_snapshots VALUES('snapshot:probe','ws:one','set:one',1,'" +
      'a'.repeat(64) +
      "',0,0,'{}')",
  );
  const sql =
    "INTO snapshot_supports VALUES('ws:one','snapshot:probe','set:one',?,'basis:probe','entity:probe',?,?,'fixture-only',?)";
  f.db.prepare('INSERT ' + sql).run('support:probe', 'b'.repeat(64), 'c'.repeat(64), '{}');
  assert.throws(
    () => f.db.exec("UPDATE snapshot_supports SET payload_json='{}'"),
    /immutable history/,
  );
  assert.throws(() => f.db.exec('DELETE FROM snapshot_supports'), /immutable history/);
  f.db.exec('BEGIN IMMEDIATE');
  f.db.exec(
    "INSERT INTO source_changes VALUES('change:temporary','ws:one','DOCUMENT',NULL,'doc:one',NULL,'{}',0)",
  );
  for (const key of ['support:probe', 'support:secondary-collision']) {
    for (const [prefix, suffix] of [
      ['INSERT OR REPLACE', ''],
      ['INSERT OR IGNORE', ''],
      ['INSERT', ' ON CONFLICT DO NOTHING'],
      ['INSERT', ' ON CONFLICT DO UPDATE SET payload_json=excluded.payload_json'],
    ]) {
      assert.throws(
        () =>
          f.db
            .prepare(prefix + ' ' + sql + suffix)
            .run(key, 'b'.repeat(64), 'c'.repeat(64), '{"replaced":true}'),
        /duplicate immutable key/,
      );
      assert.equal(f.db.isTransaction, true);
    }
  }
  // RAISE(ABORT) ends only the failed statement; the owner must roll back all work.
  assert.equal(f.db.prepare('SELECT count(*) n FROM source_changes').get().n, 1);
  f.db.exec('ROLLBACK');
  assert.equal(f.db.prepare('SELECT count(*) n FROM source_changes').get().n, 0);
  assert.equal(f.db.prepare('SELECT payload_json FROM snapshot_supports').get().payload_json, '{}');
  assert.equal(f.db.prepare('SELECT count(*) n FROM snapshot_supports').get().n, 1);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
});
import { nonemptyWorkspaceRuntimeFixture } from './helpers/nonempty-workspace-runtime-fixture.mjs';
import { historyLimits } from './helpers/r011-history-fixture.mjs';
import { RuntimeFactStore } from '../dist/runtime/runtime-fact-store.js';

const tableNames = (db) =>
  db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
const physicalRows = (db, names) =>
  names.map((name) => [name, db.prepare('SELECT * FROM "' + name + '" ORDER BY rowid').all()]);
const physicalSchema = (db) =>
  db
    .prepare(
      "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
    )
    .all();
async function retainedRuntimeFixture(t) {
  const f = await nonemptyWorkspaceRuntimeFixture(t);
  const documents = new DocumentStore(f.db, f.workspaceId);
  for (const [id, digest, previous, text] of [
    ['rev:old', 'a', null, 'retained old declaration note'],
    ['rev:head', 'b', 'rev:old', 'current declaration note'],
  ]) {
    // The existing literal DocumentStore paragraph shape, not a Source/scan receipt.
    const document = bundle(id, digest),
      p = document.payload;
    p.document.workspaceId = f.workspaceId;
    p.revision.blockRefs = [{ kind: 'DOCUMENT_BLOCK', id: 'block:note', revisionId: id }];
    p.blocks = [
      {
        id: 'block:note',
        documentRevisionId: id,
        sectionId: null,
        ordinal: 0,
        sourceRange: {
          documentRevisionId: id,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: text.length,
        },
        kind: 'PARAGRAPH',
        payload: { text },
      },
    ];
    assert.equal(
      documents.applyDocuments(
        { bundle: document, expectedCurrentRevisionId: previous },
        limits,
        () => {},
      ).status,
      'COMMITTED',
    );
  }
  assert.equal(documents.readCurrent('doc:one', limits).revisionId, 'rev:head');
  assert.equal(
    documents.readRevision('doc:one', 'rev:old', limits, () => {}).bundle.payload.blocks[0].payload
      .text,
    'retained old declaration note',
  );
  const oldNames = tableNames(f.db),
    repositoryNames = tableNames(f.repositoryDb);
  return {
    ...f,
    documents,
    oldNames,
    oldRows: physicalRows(f.db, oldNames),
    oldSchema: physicalSchema(f.db),
    repositoryNames,
    repositoryRows: physicalRows(f.repositoryDb, repositoryNames),
  };
}
function assertRetainedRuntime(f, workspaceDb, repositoryDb, version) {
  assert.equal(workspaceDb.prepare('PRAGMA user_version').get().user_version, version);
  assert.equal(repositoryDb.prepare('PRAGMA user_version').get().user_version, 13);
  assert.deepEqual(physicalRows(workspaceDb, f.oldNames), f.oldRows);
  assert.deepEqual(physicalRows(repositoryDb, f.repositoryNames), f.repositoryRows);
  const schema = new Map(physicalSchema(workspaceDb).map((row) => [row.name, row]));
  for (const old of f.oldSchema) assert.deepEqual(schema.get(old.name), old);
  assert.equal(
    workspaceDb.prepare('SELECT activation_id FROM workspace_runtime_state').get().activation_id,
    f.activationId,
  );
  assert.equal(
    workspaceDb
      .prepare('SELECT parent_id FROM workspace_runtime_activations WHERE id=?')
      .get(f.activationId).parent_id,
    f.firstActivationId,
  );
  assert.equal(
    workspaceDb.prepare("SELECT current_revision_id FROM documents WHERE id='doc:one'").get()
      .current_revision_id,
    'rev:head',
  );
  assert.equal(workspaceDb.prepare('SELECT count(*) n FROM document_blocks').get().n, 2);
  assert.equal(
    workspaceDb
      .prepare(
        "SELECT count(*) n FROM sqlite_schema WHERE name IN ('evaluation_runs','knowledge_revision_provenance')",
      )
      .get().n,
    0,
  );
  for (const db of [workspaceDb, repositoryDb]) {
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  }
  const runtime = new RuntimeFactStore(repositoryDb, f.input.repositoryId).traceRuntime(
    historyLimits,
  );
  assert.equal(runtime.status, 'CURRENT');
  assert.equal(runtime.candidate.facts.payload.nodes.length, 2);
  assert.equal(runtime.candidate.facts.payload.edges.length, 1);
  assert.equal(runtime.candidate.facts.payload.contracts.length, 2);
  assert.equal(runtime.candidate.bindings.payload.bindings.length, 1);
}
function reopenRetainedRuntime(f) {
  f.db.close();
  f.repositoryDb.close();
  const workspaceDb = new DatabaseSync(f.workspaceDatabasePath, {
    readOnly: true,
    enableForeignKeyConstraints: true,
  });
  const repositoryDb = new DatabaseSync(f.repositoryDatabasePath, {
    readOnly: true,
    enableForeignKeyConstraints: true,
  });
  f.connections.push(workspaceDb, repositoryDb);
  return { workspaceDb, repositoryDb };
}
function assertRefusedCandidateReaders(f, db, repositoryDb) {
  assert.throws(() => new DocumentStore(db, f.workspaceId), {
    code: 'DOCUMENT_SCHEMA_UNSUPPORTED',
  });
  const repository = new RuntimeFactStore(repositoryDb, f.input.repositoryId);
  const contracts = new ContractStore(db, f.workspaceId, [repository]);
  assert.throws(() => contracts.traceWorkspaceRuntime(historyLimits), {
    message: 'INVALID_WORKSPACE_RUNTIME',
  });
  assert.throws(
    () =>
      readWorkspaceCompilationSelection(
        contracts,
        f.revisionSetId,
        new HistoryReadBudget(historyLimits),
        () => {},
      ),
    { code: 'INVALID_HISTORY' },
  );
  assert.equal(db.isTransaction, false);
}
for (const version of [9, 10])
  test(
    'nonempty retained Runtime and document heads survive candidate prefix ' +
      version +
      ' and genuine readonly reopen',
    async (t) => {
      const f = await retainedRuntimeFixture(t);
      for (let step = 9; step <= version; step++) applyCandidate(f.db, step);
      assertRetainedRuntime(f, f.db, f.repositoryDb, version);
      assert.throws(() => f.documents.readCurrent('doc:one', limits), {
        code: 'DOCUMENT_SCHEMA_UNSUPPORTED',
      });
      assert.throws(() => f.store.traceWorkspaceRuntime(historyLimits), {
        message: 'INVALID_WORKSPACE_RUNTIME',
      });
      assert.throws(() => f.store.inspectOutcome(historyLimits), {
        message: 'INVALID_WORKSPACE_RUNTIME',
      });
      const { workspaceDb, repositoryDb } = reopenRetainedRuntime(f);
      assertRetainedRuntime(f, workspaceDb, repositoryDb, version);
      assertRefusedCandidateReaders(f, workspaceDb, repositoryDb);
    },
  );
for (const failed of [9, 10])
  test(
    'nonempty retained Runtime candidate failure at ' +
      failed +
      ' preserves its committed disk prefix and readonly history',
    async (t) => {
      const f = await retainedRuntimeFixture(t);
      if (failed === 10) applyCandidate(f.db, 9);
      const schemaBefore = physicalSchema(f.db);
      assert.throws(() => applyCandidate(f.db, failed, true), /candidate_fault_missing_table/);
      assert.deepEqual(physicalSchema(f.db), schemaBefore);
      assert.equal(f.db.isTransaction, false);
      assertRetainedRuntime(f, f.db, f.repositoryDb, failed - 1);
      const { workspaceDb, repositoryDb } = reopenRetainedRuntime(f);
      assertRetainedRuntime(f, workspaceDb, repositoryDb, failed - 1);
      if (failed === 9) {
        const documents = new DocumentStore(workspaceDb, f.workspaceId);
        assert.equal(documents.readCurrent('doc:one', limits).revisionId, 'rev:head');
        assert.equal(
          documents.readRevision('doc:one', 'rev:old', limits, () => {}).revisionId,
          'rev:old',
        );
        const contracts = new ContractStore(workspaceDb, f.workspaceId, [
          new RuntimeFactStore(repositoryDb, f.input.repositoryId),
        ]);
        const traced = contracts.traceWorkspaceRuntime(historyLimits);
        assert.equal(traced.activationId, f.activationId);
        assert.equal(traced.matches[0].payload.status, 'MATCHED');
        assert.equal(traced.execution.payload.nodes.length, 2);
        assert.equal(traced.execution.payload.edges.length, 1);
      } else assertRefusedCandidateReaders(f, workspaceDb, repositoryDb);
    },
  );
