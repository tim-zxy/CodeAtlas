import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { RepositoryAnalysisStage } from '../dist/index.js';

const file = {
  id: 'source-A',
  repositoryId: 'repo-A',
  revisionId: 'revision-A',
  path: 'A.java',
  contentFingerprint: 'sha256:source-A',
  classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
  languageHint: 'java',
  sensitivity: 'PUBLIC',
};

const manifest = JSON.parse(
  await readFile(
    new URL('../../../fixtures/storage/full-analysis-apply/cases.json', import.meta.url),
    'utf8',
  ),
);

test('P05 full-apply Fixture declares stage and activation failure boundaries', () => {
  assert.equal(manifest.id, 'p05-full-analysis-apply-v1');
  assert.ok(manifest.cases.includes('reordered-edge-node-normalization'));
  assert.ok(manifest.cases.includes('failed-apply-rollback'));
});

function event(type, payload) {
  return { protocolVersion: 1, requestId: 'request-A', sequence: 0, type, payload };
}

test('TEMP stage keeps ordered facts and drops only its connection-local rows', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    "CREATE TABLE durable_marker (value TEXT NOT NULL); INSERT INTO durable_marker VALUES ('old')",
  );
  const stage = new RepositoryAnalysisStage(db);
  await stage.accept(event('SOURCE_FILE', file));
  assert.deepEqual([...stage.readSourceFiles()], [file]);
  assert.deepEqual([...stage.readProviderNodes()], []);
  assert.equal(db.prepare('SELECT value FROM durable_marker').get().value, 'old');
  stage.close();
  assert.throws(() => db.prepare('SELECT * FROM temp.analysis_event').all());
  assert.equal(db.prepare('SELECT value FROM durable_marker').get().value, 'old');
  db.close();
});

test('TEMP stage rejects duplicate provider facts and is isolated by connection', async () => {
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryAnalysisStage(db);
  await stage.accept(event('SOURCE_FILE', file));
  await assert.rejects(stage.accept(event('SOURCE_FILE', file)));
  const second = new DatabaseSync(':memory:');
  assert.throws(() => second.prepare('SELECT * FROM temp.analysis_event').all());
  stage.close();
  second.close();
  db.close();
});
