import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { runMigrations } from '../dist/index.js';

const manifestUrl = new URL('../migrations/repository/manifest.json', import.meta.url);

test('p0-repository-schema-v1 constraints-and-isolation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-repo-constraints-'));
  const databasePath = join(directory, 'repository.sqlite');
  try {
    await runMigrations({ databasePath, databaseKind: 'REPOSITORY', manifestUrl });
    const db = new DatabaseSync(databasePath);
    try {
      db.exec(`
        INSERT INTO repository (slot, id, root_path) VALUES (1, 'repo-a', '/repo-a');
        INSERT INTO repository_state (repository_id) VALUES ('repo-a');
        INSERT INTO revisions (id, repository_id, kind, content_fingerprint, base_revision_id)
          VALUES ('rev-a', 'repo-a', 'WORKTREE', 'fp-a', NULL);
        INSERT INTO source_files
          (revision_id, id, repository_id, path, content_fingerprint, role, provenance, content_kind, sensitivity)
          VALUES ('rev-a', 'file-a', 'repo-a', 'src/a.ts', 'fp-file-a', 'SOURCE', 'AUTHORED', 'TEXT', 'PUBLIC');
        INSERT INTO provider_snapshots
          (id, repository_id, provider_id, provider_version, runtime_version,
           requested_revision_id, requested_revision_fingerprint, started_at, completed_at, outcome)
          VALUES ('snapshot-a', 'repo-a', 'provider-a', '1', '1', 'rev-a', 'fp-a', 10, 11, 'PARTIAL');
        INSERT INTO provider_capabilities (snapshot_id, name, support, coverage)
          VALUES ('snapshot-a', 'code-graph', 'SUPPORTED', 'PARTIAL');
        INSERT INTO canonical_nodes
          (revision_id, id, repository_id, fact_key, kind, name,
           confidence_score, confidence_method, confidence_reasons_json)
          VALUES ('rev-a', 'node-a', 'repo-a', 'node-key-a', 'MODULE', 'a', 1, 'exact', '[]');
        INSERT INTO canonical_edges
          (revision_id, id, repository_id, fact_key, kind, source_node_id,
           target_state, resolution, confidence_score, confidence_method, confidence_reasons_json)
          VALUES ('rev-a', 'edge-a', 'repo-a', 'edge-key-a', 'CALL', 'node-a',
                  'UNRESOLVED', 'AMBIGUOUS', 0.5, 'analysis', '[]');
        INSERT INTO unresolved_targets (revision_id, edge_id, original_hint, candidates_json)
          VALUES ('rev-a', 'edge-a', 'target', '[{"factType":"NODE","id":"node-a"},{"factType":"NODE","id":"node-b"}]');
        INSERT INTO evidence
          (id, repository_id, revision_id, provider_snapshot_id, fact_type, provider_id, provider_fact_id, status)
          VALUES ('evidence-a', 'repo-a', 'rev-a', 'snapshot-a', 'EDGE', 'provider-a', 'fact-a', 'ACTIVE');
        INSERT INTO fact_evidence (fact_type, canonical_fact_id, evidence_id)
          VALUES ('EDGE', 'edge-a', 'evidence-a');
        INSERT INTO provider_fact_bindings
          (fact_type, provider_id, provider_fact_id, provider_snapshot_id, canonical_fact_id, evidence_id)
          VALUES ('EDGE', 'provider-a', 'fact-a', 'snapshot-a', 'edge-a', 'evidence-a');
        INSERT INTO analysis_coverage (provider_snapshot_id, capability_name, status)
          VALUES ('snapshot-a', 'code-graph', 'PARTIAL');
        INSERT INTO analysis_diagnostics (provider_snapshot_id, ordinal, code, severity, message)
          VALUES ('snapshot-a', 0, 'PARSE_PARTIAL', 'WARNING', 'Partial parse');
      `);

      assert.equal(
        db.prepare('SELECT indexed_revision_id FROM repository_state').get().indexed_revision_id,
        null,
      );
      assert.equal(
        db.prepare('SELECT resolution FROM canonical_edges WHERE id = ?').get('edge-a').resolution,
        'AMBIGUOUS',
      );
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

      assert.throws(() =>
        db.exec("INSERT INTO repository (slot, id, root_path) VALUES (2, 'repo-b', '/repo-b')"),
      );
      assert.throws(() =>
        db.exec(
          "INSERT INTO revisions (id, repository_id, kind, content_fingerprint) VALUES ('bad-commit', 'repo-a', 'COMMIT', 'fp')",
        ),
      );
      assert.throws(() =>
        db.exec(
          "INSERT INTO source_files (revision_id, id, repository_id, path, content_fingerprint, role, provenance, content_kind, sensitivity) VALUES ('rev-a', 'file-b', 'repo-a', 'src/a.ts', 'fp', 'SOURCE', 'AUTHORED', 'TEXT', 'PUBLIC')",
        ),
      );
      assert.throws(() =>
        db.exec(
          "INSERT INTO provider_snapshots (id, repository_id, provider_id, provider_version, runtime_version, requested_revision_id, requested_revision_fingerprint, started_at, completed_at, outcome) VALUES ('bad-snapshot', 'repo-a', 'provider-a', '1', '1', 'rev-a', 'fp-a', 11, 10, 'FAILED')",
        ),
      );
      assert.throws(() =>
        db.exec(
          "INSERT INTO canonical_nodes (revision_id, id, repository_id, fact_key, kind, name, confidence_score, confidence_method, confidence_reasons_json) VALUES ('rev-a', 'node-b', 'repo-a', 'node-key-a', 'MODULE', 'b', 1, 'exact', '[]')",
        ),
      );
      assert.throws(() =>
        db.exec(
          "INSERT INTO canonical_edges (revision_id, id, repository_id, fact_key, kind, source_node_id, target_state, resolution, confidence_score, confidence_method, confidence_reasons_json) VALUES ('rev-a', 'edge-b', 'repo-a', 'edge-key-b', 'CALL', 'node-a', 'RESOLVED', 'EXACT', 1, 'exact', '[]')",
        ),
      );
      assert.throws(() =>
        db.exec(
          "INSERT INTO evidence (id, repository_id, revision_id, provider_snapshot_id, fact_type, provider_id, provider_fact_id, status) VALUES ('bad-evidence', 'repo-a', 'rev-a', 'snapshot-a', 'EDGE', 'provider-a', 'fact-b', 'UNKNOWN')",
        ),
      );
      assert.throws(() =>
        db.exec(
          "INSERT INTO provider_fact_bindings (fact_type, provider_id, provider_fact_id, provider_snapshot_id, canonical_fact_id, evidence_id) VALUES ('NODE', 'provider-a', 'fact-a', 'snapshot-a', 'node-a', 'evidence-a')",
        ),
      );
      assert.throws(() =>
        db.exec(
          "INSERT INTO analysis_coverage (provider_snapshot_id, capability_name, status) VALUES ('snapshot-a', 'missing', 'COMPLETE')",
        ),
      );
      assert.throws(() =>
        db.exec(
          `INSERT INTO analysis_diagnostics (provider_snapshot_id, ordinal, code, severity, message) VALUES ('snapshot-a', 1, 'LONG', 'WARNING', '${'x'.repeat(129)}')`,
        ),
      );
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
      db.close();
    }
  } finally {
    await rm(directory, { recursive: true });
  }
});
