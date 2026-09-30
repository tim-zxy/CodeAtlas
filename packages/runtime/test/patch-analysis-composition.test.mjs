import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { runMigrations, readAnalysisFreshness } from '../../storage/dist/index.js';
import { applyNativeFullAnalysis, applyNativePatchAnalysis } from '../dist/index.js';

const analyze = JSON.parse(
  await readFile(
    new URL(
      '../../../fixtures/ipc/protocol-v1/analyze-java-basic-v1/request.jsonl',
      import.meta.url,
    ),
    'utf8',
  ),
);
analyze.payload.sourceFiles = [];
const sourceFile = {
  id: 'file-added',
  repositoryId: 'repo-a',
  revisionId: 'rev-a',
  path: 'src/Added.java',
  contentFingerprint: 'file-fp-added',
  classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
  languageHint: 'java',
  sensitivity: 'PUBLIC',
};
const refresh = {
  protocolVersion: 1,
  requestId: 'refresh-added',
  type: 'REFRESH',
  payload: {
    ...analyze.payload,
    baseRevisionId: 'rev-a',
    baseRevisionFingerprint: 'rev-fp-a',
    targetRevision: { ...analyze.payload.revision, contentFingerprint: 'rev-fp-b' },
    changes: { added: [sourceFile], modified: [], deleted: [] },
    providerSnapshotId: 'snapshot-b',
  },
};
delete refresh.payload.revision;
delete refresh.payload.sourceFiles;
const descriptor = {
  providerId: 'native',
  providerVersion: '1',
  runtimeVersion: '1',
  protocolVersions: [1],
  irSchemaVersions: [1],
  capabilities: ['SYMBOL'],
  languages: [
    { languageId: 'java', grammarVersion: '1', analyzerVersion: '1', compatibilityVersion: '1' },
  ],
  limits: { maxLineBytes: 1_000_000, maxEventCount: 10_000, maxTotalBytes: 10_000_000 },
  build: { target: 'test', profile: 'debug' },
};
const helper = fileURLToPath(
  new URL('../../providers/test/fixtures/native-client-child.mjs', import.meta.url),
);
const manifestUrl = new URL('../../storage/migrations/repository/manifest.json', import.meta.url);
function options(scenario) {
  return {
    executablePath: process.execPath,
    arguments: [helper, scenario],
    timeoutMs: 4_000,
    allowedEnvironment: Object.fromEntries(
      ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
        .filter((name) => process.env[name] !== undefined)
        .map((name) => [name, process.env[name]]),
    ),
  };
}
async function withDatabase(run) {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-patch-runtime-'));
  try {
    const databasePath = join(directory, 'repo.sqlite');
    await runMigrations({ databasePath, databaseKind: 'REPOSITORY', manifestUrl });
    const db = new DatabaseSync(databasePath);
    try {
      db.prepare('INSERT INTO repository (slot, id, root_path) VALUES (1, ?, ?)').run(
        'repo-a',
        '/repo-a',
      );
      db.prepare('INSERT INTO repository_state (repository_id) VALUES (?)').run('repo-a');
      db.prepare(
        'INSERT INTO revisions (id, repository_id, kind, content_fingerprint, base_revision_id) VALUES (?, ?, ?, ?, ?)',
      ).run('rev-a', 'repo-a', 'WORKTREE', 'rev-fp-a', null);
      await applyNativeFullAnalysis(db, analyze, options('valid-analyze'), descriptor);
      db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
        'rev-fp-b',
        'rev-a',
      );
      db.prepare(
        `INSERT INTO source_files
        (revision_id, id, repository_id, path, content_fingerprint, role, provenance, content_kind, language_hint, sensitivity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        'rev-a',
        sourceFile.id,
        'repo-a',
        sourceFile.path,
        sourceFile.contentFingerprint,
        'SOURCE',
        'AUTHORED',
        'TEXT',
        'java',
        'PUBLIC',
      );
      await run(db);
    } finally {
      db.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('validated synthetic REFRESH activates graph, support, coverage and freshness', async () => {
  await withDatabase(async (db) => {
    await applyNativePatchAnalysis(db, refresh, options('refresh-added-node'), descriptor);
    assert.equal(db.prepare('SELECT count(*) AS n FROM canonical_nodes').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM provider_fact_bindings').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM analysis_coverage').get().n, 1);
    assert.equal(readAnalysisFreshness(db, 'repo-a'), 'CURRENT');
  });
});

test('PARTIAL, corrupt stream, normalization failure and stale base retain the previous graph', async () => {
  await withDatabase(async (db) => {
    for (const [request, scenario] of [
      [refresh, 'refresh-partial'],
      [refresh, 'refresh-bad-checksum'],
      [refresh, 'refresh-added-node-no-range'],
      [
        { ...refresh, payload: { ...refresh.payload, baseRevisionFingerprint: 'stale' } },
        'refresh-added-node',
      ],
    ]) {
      await assert.rejects(applyNativePatchAnalysis(db, request, options(scenario), descriptor));
      assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 1);
      assert.equal(db.prepare('SELECT count(*) AS n FROM canonical_nodes').get().n, 0);
      assert.equal(
        db.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE name LIKE 'patch_%'").get()
          .n,
        0,
      );
      assert.equal(
        db.prepare('SELECT indexed_content_fingerprint AS fp FROM repository_state').get().fp,
        'rev-fp-a',
      );
    }
  });
});
