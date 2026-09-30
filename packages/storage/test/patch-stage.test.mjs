import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { RepositoryPatchStage, runMigrations } from '../dist/index.js';

const events = (
  await readFile(
    new URL(
      '../../../fixtures/ipc/protocol-v1/refresh-modified-file-v1/events.jsonl',
      import.meta.url,
    ),
    'utf8',
  )
)
  .trim()
  .split('\n')
  .map(JSON.parse);
const terminal = events.at(-1);
const selector = (group) => group[0].canonical;

test('patch stage accepts out-of-order fact rows but iterates source and operations deterministically', async () => {
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryPatchStage(db, selector);
  try {
    for (const event of [events[3], events[2], events[1], events[4]]) await stage.accept(event);
    stage.confirmSucceeded(terminal);
    assert.deepEqual(
      [...stage.readSourceFiles()].map((file) => file.path),
      ['src/A.java'],
    );
    assert.deepEqual(
      [...stage.readUpsertNodes()].map((node) => node.providerFactId),
      ['node-a'],
    );
    assert.deepEqual(
      [...stage.readUpsertEdges()].map((edge) => edge.providerFactId),
      ['edge-a'],
    );
    assert.equal([...stage.readCoverage()].length, 1);
    assert.equal(stage.getProviderNode('node-a').providerFactId, 'node-a');
  } finally {
    stage.close();
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE name LIKE 'patch_%'").get().n,
      0,
    );
    db.close();
  }
});

test('patch stage rejects duplicate and contradictory Provider operations', async () => {
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryPatchStage(db, selector);
  try {
    await stage.accept(events[2]);
    await assert.rejects(stage.accept(events[2]));
    await assert.rejects(
      stage.accept({
        type: 'REMOVE_NODE',
        payload: {
          factType: 'NODE',
          providerId: 'native',
          providerFactId: 'node-a',
        },
      }),
    );
  } finally {
    stage.close();
    db.close();
  }
});

test('patch stage checks success, counts and target context before activation', async () => {
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryPatchStage(db, selector);
  try {
    await assert.rejects(stage.accept({ type: 'UNKNOWN', payload: {} }));
    await stage.accept({
      ...events[2],
      payload: { ...events[2].payload, revisionId: 'wrong' },
    });
    assert.throws(() => stage.confirmSucceeded(terminal));
    const empty = structuredClone(terminal);
    empty.payload.counts = Object.fromEntries(
      Object.keys(empty.payload.counts).map((key) => [key, 0]),
    );
    empty.payload.outcome = 'PARTIAL';
    assert.throws(() => stage.confirmSucceeded(empty));
  } finally {
    stage.close();
    db.close();
  }
});

test('patch stage accepts a successful zero-event patch exactly once', () => {
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryPatchStage(db, selector);
  try {
    const empty = structuredClone(terminal);
    empty.payload.counts = Object.fromEntries(
      Object.keys(empty.payload.counts).map((key) => [key, 0]),
    );
    stage.confirmSucceeded(empty);
    assert.throws(() => stage.confirmSucceeded(empty));
  } finally {
    stage.close();
    db.close();
  }
});

test('patch stage rejects malformed coverage before a terminal can validate it', async () => {
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryPatchStage(db, selector);
  try {
    await assert.rejects(stage.accept({ type: 'COVERAGE', payload: { capability: 'code-graph' } }));
    assert.equal([...stage.readCoverage()].length, 0);
  } finally {
    stage.close();
    db.close();
  }
});

test('patch stage accepts a diagnostic without inventing repository or revision fields', async () => {
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryPatchStage(db, selector);
  const diagnostic = {
    code: 'PARSE_WARNING',
    severity: 'WARNING',
    message: 'Partial source',
    sourceRange: null,
  };
  try {
    await stage.accept({ type: 'DIAGNOSTIC', payload: diagnostic });
    const completed = structuredClone(terminal);
    completed.payload.counts = Object.fromEntries(
      Object.keys(completed.payload.counts).map((key) => [key, key === 'diagnostics' ? 1 : 0]),
    );
    stage.confirmSucceeded(completed);
    assert.deepEqual([...stage.readDiagnostics()], [diagnostic]);
  } finally {
    stage.close();
    db.close();
  }
});

test('patch stage orders source rows by path, independent of ID and arrival order', async () => {
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryPatchStage(db, selector);
  const file = events[1];
  try {
    await stage.accept({ ...file, payload: { ...file.payload, id: 'a-id', path: 'src/Z.java' } });
    await stage.accept({ ...file, payload: { ...file.payload, id: 'z-id', path: 'src/A.java' } });
    assert.deepEqual(
      [...stage.readSourceFiles()].map((value) => value.path),
      ['src/A.java', 'src/Z.java'],
    );
  } finally {
    stage.close();
    db.close();
  }
});

test('patch stage rejects a remove without exactly one active Provider binding', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-patch-stage-'));
  const path = join(directory, 'repository.sqlite');
  const manifestUrl = new URL('../migrations/repository/manifest.json', import.meta.url);
  try {
    await runMigrations({ databasePath: path, databaseKind: 'REPOSITORY', manifestUrl });
    const db = new DatabaseSync(path);
    const stage = new RepositoryPatchStage(db, selector);
    try {
      await stage.accept({
        type: 'REMOVE_NODE',
        payload: {
          factType: 'NODE',
          providerId: 'native',
          providerFactId: 'missing',
        },
      });
      const completed = structuredClone(terminal);
      completed.payload.counts = Object.fromEntries(
        Object.keys(completed.payload.counts).map((key) => [key, key === 'removedNodes' ? 1 : 0]),
      );
      assert.throws(() => stage.confirmSucceeded(completed), /active Provider binding/);
    } finally {
      stage.close();
      db.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('patch stage accepts a remove with exactly one active Provider binding', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE evidence (id TEXT, repository_id TEXT, revision_id TEXT, status TEXT);
    CREATE TABLE provider_fact_bindings (evidence_id TEXT, fact_type TEXT, provider_id TEXT, provider_fact_id TEXT);
    INSERT INTO evidence VALUES ('old-evidence', 'repo-a', 'rev-b', 'ACTIVE');
    INSERT INTO provider_fact_bindings VALUES ('old-evidence', 'NODE', 'native', 'old-node');
  `);
  const stage = new RepositoryPatchStage(db, selector);
  try {
    await stage.accept({
      type: 'REMOVE_NODE',
      payload: {
        factType: 'NODE',
        providerId: 'native',
        providerFactId: 'old-node',
      },
    });
    const completed = structuredClone(terminal);
    completed.payload.counts = Object.fromEntries(
      Object.keys(completed.payload.counts).map((key) => [key, key === 'removedNodes' ? 1 : 0]),
    );
    stage.confirmSucceeded(completed);
    assert.deepEqual(
      [...stage.readRemoveNodes()].map((item) => item.providerFactId),
      ['old-node'],
    );
  } finally {
    stage.close();
    db.close();
  }
});

test('patch stage resolves an unchanged source file from the target revision inventory', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE source_files (
    revision_id TEXT, id TEXT, repository_id TEXT, path TEXT, content_fingerprint TEXT,
    role TEXT, provenance TEXT, content_kind TEXT, language_hint TEXT, sensitivity TEXT
  )`);
  const file = events[1].payload;
  db.prepare('INSERT INTO source_files VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
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
  const stage = new RepositoryPatchStage(db, selector);
  try {
    const empty = structuredClone(terminal);
    empty.payload.counts = Object.fromEntries(
      Object.keys(empty.payload.counts).map((key) => [key, 0]),
    );
    stage.confirmSucceeded(empty);
    assert.deepEqual(stage.getSourceFile(file.id), file);
    assert.deepEqual(stage.getSourceFileByPath(file.path), file);
  } finally {
    stage.close();
    db.close();
  }
});
