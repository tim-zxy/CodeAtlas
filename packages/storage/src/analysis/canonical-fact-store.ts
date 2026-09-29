import type { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import {
  ContentFingerprintSchema,
  EntityIdSchema,
  ProviderSnapshotSchema,
  ProviderSnapshotDiagnosticSchema,
  type ContentFingerprint,
  type EntityId,
  type ProviderSnapshot,
} from '@codeatlas/ir';

import { RepositoryAnalysisStage } from './temp-stage.js';

export interface ExpectedAnalysis {
  readonly repositoryId: EntityId;
  readonly revisionId: EntityId;
  readonly contentFingerprint: ContentFingerprint;
  readonly snapshot: ProviderSnapshot;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export class RepositoryCanonicalFactStore {
  constructor(private readonly db: DatabaseSync) {
    db.exec('PRAGMA foreign_keys = ON');
    assert(
      db.prepare('PRAGMA foreign_keys').get()?.foreign_keys === 1,
      'SQLite foreign keys required',
    );
  }

  applyAnalysisBatch(stage: RepositoryAnalysisStage, expectedValue: ExpectedAnalysis): number {
    const expected = {
      repositoryId: EntityIdSchema.parse(expectedValue.repositoryId),
      revisionId: EntityIdSchema.parse(expectedValue.revisionId),
      contentFingerprint: ContentFingerprintSchema.parse(expectedValue.contentFingerprint),
      snapshot: ProviderSnapshotSchema.parse(expectedValue.snapshot),
    };
    const { repositoryId, revisionId, contentFingerprint, snapshot } = expected;
    assert(snapshot.outcome === 'SUCCEEDED', 'Only successful analysis may activate');
    assert(
      snapshot.repositoryId === repositoryId &&
        snapshot.requestedRevisionId === revisionId &&
        snapshot.requestedRevisionFingerprint === contentFingerprint,
      'Snapshot does not match activation context',
    );
    stage.assertApplicable(this.db, {
      repositoryId,
      revisionId,
      contentFingerprint,
      snapshotId: snapshot.id,
      capabilities: snapshot.capabilities,
    });
    this.validateCandidate(stage, expected);

    const lockStarted = performance.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const revision = this.db
        .prepare('SELECT content_fingerprint FROM revisions WHERE repository_id = ? AND id = ?')
        .get(repositoryId, revisionId) as { content_fingerprint: string } | undefined;
      assert(
        revision?.content_fingerprint === contentFingerprint,
        'Source revision changed during analysis',
      );
      const state = this.db
        .prepare('SELECT indexed_revision_id FROM repository_state WHERE repository_id = ?')
        .get(repositoryId) as { indexed_revision_id: string | null } | undefined;
      assert(state !== undefined, 'Repository state is absent');
      assert(
        this.db.prepare('SELECT id FROM provider_snapshots WHERE id = ?').get(snapshot.id) ===
          undefined,
        'Provider snapshot already exists',
      );

      // Retire active support before any target-revision fact is removed.
      const retire = this.db.prepare(`
        DELETE FROM provider_fact_bindings WHERE evidence_id IN
          (SELECT id FROM evidence WHERE repository_id = ? AND revision_id = ?)`);
      const unlink = this.db.prepare(`
        DELETE FROM fact_evidence WHERE evidence_id IN
          (SELECT id FROM evidence WHERE repository_id = ? AND revision_id = ?)`);
      const supersede = this.db.prepare(`
        UPDATE evidence SET status = 'SUPERSEDED' WHERE repository_id = ? AND revision_id = ? AND status = 'ACTIVE'`);
      const retireRevision = (id: string) => {
        retire.run(repositoryId, id);
        unlink.run(repositoryId, id);
        supersede.run(repositoryId, id);
      };
      if (state.indexed_revision_id !== null && state.indexed_revision_id !== revisionId) {
        retireRevision(state.indexed_revision_id);
      }
      retireRevision(revisionId);
      this.db.prepare('DELETE FROM unresolved_targets WHERE revision_id = ?').run(revisionId);
      this.db.prepare('DELETE FROM canonical_edges WHERE revision_id = ?').run(revisionId);
      this.db.prepare('DELETE FROM canonical_nodes WHERE revision_id = ?').run(revisionId);

      this.writeSnapshot(snapshot);
      this.writeFacts(stage, revisionId, repositoryId);
      this.writeSupport(stage);
      this.writeCoverageAndDiagnostics(stage, snapshot);
      const changed = this.db
        .prepare(
          `UPDATE repository_state
        SET indexed_revision_id = ?, indexed_content_fingerprint = ? WHERE repository_id = ?`,
        )
        .run(revisionId, contentFingerprint, repositoryId);
      assert(changed.changes === 1, 'Activation pointer update failed');
      this.db.exec('COMMIT');
      return performance.now() - lockStarted;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private validateCandidate(stage: RepositoryAnalysisStage, expected: ExpectedAnalysis): void {
    const { repositoryId, revisionId } = expected;
    const source = this.db.prepare(
      'SELECT 1 FROM source_files WHERE repository_id = ? AND revision_id = ? AND id = ?',
    );
    const sourceRange = (range: { sourceFileId: string } | null) => {
      if (range)
        assert(
          stage.getSourceFile(range.sourceFileId) !== null &&
            source.get(repositoryId, revisionId, range.sourceFileId),
          'Source range has no file',
        );
    };
    let stagedFileCount = 0;
    for (const file of stage.readSourceFiles()) {
      stagedFileCount++;
      assert(
        file.repositoryId === repositoryId && file.revisionId === revisionId,
        'Staged source file context differs',
      );
      const persisted = this.db
        .prepare(
          'SELECT path, content_fingerprint FROM source_files WHERE repository_id = ? AND revision_id = ? AND id = ?',
        )
        .get(repositoryId, revisionId, file.id) as
        { path: string; content_fingerprint: string } | undefined;
      assert(
        persisted?.path === file.path && persisted?.content_fingerprint === file.contentFingerprint,
        'Staged source file differs from persisted source',
      );
    }
    const persistedFiles = this.db
      .prepare('SELECT count(*) AS n FROM source_files WHERE repository_id = ? AND revision_id = ?')
      .get(repositoryId, revisionId) as { n: number };
    assert(stagedFileCount === persistedFiles.n, 'Staged source file inventory is incomplete');
    for (const unknown of stage.readCoverage()) {
      const sourceFileId = (unknown as { sourceFileId?: unknown }).sourceFileId;
      assert(
        sourceFileId === null ||
          (typeof sourceFileId === 'string' &&
            stage.getSourceFile(sourceFileId) !== null &&
            source.get(repositoryId, revisionId, sourceFileId)),
        'Coverage source has no file',
      );
    }
    for (const diagnostic of stage.readDiagnostics()) sourceRange(diagnostic.sourceRange);
    for (const diagnostic of expected.snapshot.diagnostics) sourceRange(diagnostic.sourceRange);
    for (const row of stage.readMergedRows('NODE')) {
      const node = row.value;
      assert(
        node.repositoryId === repositoryId && node.revisionId === revisionId,
        'Canonical node context differs',
      );
      sourceRange(node.sourceRange);
    }
    for (const row of stage.readMergedRows('EDGE')) {
      const edge = row.value;
      assert(
        edge.repositoryId === repositoryId && edge.revisionId === revisionId,
        'Canonical edge context differs',
      );
      sourceRange(edge.sourceRange);
      assert(stage.hasMergedNode(edge.source.id), 'Canonical edge source is absent');
      if (edge.target.state === 'RESOLVED') {
        assert(stage.hasMergedNode(edge.target.target.id), 'Canonical edge target is absent');
      } else {
        for (const candidate of edge.target.candidates) {
          assert(stage.hasMergedNode(candidate.id), 'Canonical candidate is absent');
        }
      }
    }
    for (const row of stage.readMergedRows('EVIDENCE')) {
      const evidence = row.value;
      assert(
        evidence.repositoryId === repositoryId &&
          evidence.revisionId === revisionId &&
          evidence.providerSnapshotId === expected.snapshot.id &&
          evidence.status === 'ACTIVE',
        'Evidence context differs',
      );
    }
    for (const row of stage.readMergedRows('FACT_EVIDENCE')) {
      const value = row.value;
      assert(
        stage.hasMergedRow('EVIDENCE', value.evidenceId) &&
          stage.hasMergedRow(value.fact.factType, value.fact.id),
        'FactEvidence is dangling',
      );
    }
    for (const row of stage.readMergedRows('BINDING')) {
      const value = row.value;
      assert(
        value.providerSnapshotId === expected.snapshot.id &&
          stage.hasMergedRow('EVIDENCE', value.evidenceId) &&
          stage.hasMergedRow(value.canonicalFact.factType, value.canonicalFact.id),
        'Provider binding is dangling',
      );
    }
  }

  private writeSnapshot(snapshot: ProviderSnapshot): void {
    this.db
      .prepare(
        `INSERT INTO provider_snapshots
      (id, repository_id, provider_id, provider_version, runtime_version,
       requested_revision_id, requested_revision_fingerprint, started_at, completed_at, outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        snapshot.id,
        snapshot.repositoryId,
        snapshot.providerId,
        snapshot.providerVersion,
        snapshot.runtimeVersion,
        snapshot.requestedRevisionId,
        snapshot.requestedRevisionFingerprint,
        Date.parse(snapshot.startedAt),
        Date.parse(snapshot.completedAt),
        snapshot.outcome,
      );
    const capability = this.db.prepare(`INSERT INTO provider_capabilities
      (snapshot_id, name, support, coverage) VALUES (?, ?, ?, ?)`);
    for (const item of snapshot.capabilities) {
      capability.run(snapshot.id, item.name, item.support, item.coverage);
    }
  }

  private writeFacts(
    stage: RepositoryAnalysisStage,
    revisionId: string,
    repositoryId: string,
  ): void {
    const node = this.db.prepare(`INSERT INTO canonical_nodes
      (revision_id, id, repository_id, fact_key, kind, type_kind, symbol_kind, name,
       qualified_name, source_range_json, confidence_score, confidence_method, confidence_reasons_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const row of stage.readMergedRows('NODE')) {
      const value = row.value;
      node.run(
        revisionId,
        value.id,
        repositoryId,
        value.factKey,
        value.kind,
        value.kind === 'TYPE' ? value.typeKind : null,
        value.kind === 'SYMBOL' ? value.symbolKind : null,
        value.name,
        value.qualifiedName,
        value.sourceRange === null ? null : JSON.stringify(value.sourceRange),
        value.confidence.score,
        value.confidence.method,
        JSON.stringify(value.confidence.reasons),
      );
    }
    const edge = this.db.prepare(`INSERT INTO canonical_edges
      (revision_id, id, repository_id, fact_key, kind, source_node_id, target_state,
       resolution, target_node_id, source_range_json, confidence_score,
       confidence_method, confidence_reasons_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const unresolved = this.db.prepare(`INSERT INTO unresolved_targets
      (revision_id, edge_id, original_hint, candidates_json) VALUES (?, ?, ?, ?)`);
    for (const row of stage.readMergedRows('EDGE')) {
      const value = row.value;
      edge.run(
        revisionId,
        value.id,
        repositoryId,
        value.factKey,
        value.kind,
        value.source.id,
        value.target.state,
        value.target.resolution,
        value.target.state === 'RESOLVED' ? value.target.target.id : null,
        value.sourceRange === null ? null : JSON.stringify(value.sourceRange),
        value.confidence.score,
        value.confidence.method,
        JSON.stringify(value.confidence.reasons),
      );
      if (value.target.state === 'UNRESOLVED') {
        unresolved.run(
          revisionId,
          value.id,
          value.target.originalHint,
          JSON.stringify(value.target.candidates),
        );
      }
    }
  }

  private writeSupport(stage: RepositoryAnalysisStage): void {
    const evidence = this.db.prepare(`INSERT INTO evidence
      (id, repository_id, revision_id, provider_snapshot_id, fact_type, provider_id, provider_fact_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const row of stage.readMergedRows('EVIDENCE')) {
      const value = row.value;
      evidence.run(
        value.id,
        value.repositoryId,
        value.revisionId,
        value.providerSnapshotId,
        value.providerFact.factType,
        value.providerFact.providerId,
        value.providerFact.providerFactId,
        value.status,
      );
    }
    const link = this.db.prepare(
      'INSERT INTO fact_evidence (fact_type, canonical_fact_id, evidence_id) VALUES (?, ?, ?)',
    );
    for (const row of stage.readMergedRows('FACT_EVIDENCE')) {
      link.run(row.value.fact.factType, row.value.fact.id, row.value.evidenceId);
    }
    const binding = this.db.prepare(`INSERT INTO provider_fact_bindings
      (fact_type, provider_id, provider_fact_id, provider_snapshot_id, canonical_fact_id, evidence_id)
      VALUES (?, ?, ?, ?, ?, ?)`);
    for (const row of stage.readMergedRows('BINDING')) {
      const value = row.value;
      binding.run(
        value.providerFact.factType,
        value.providerFact.providerId,
        value.providerFact.providerFactId,
        value.providerSnapshotId,
        value.canonicalFact.id,
        value.evidenceId,
      );
    }
  }

  private writeCoverageAndDiagnostics(
    stage: RepositoryAnalysisStage,
    snapshot: ProviderSnapshot,
  ): void {
    const coverage = this.db.prepare(`INSERT INTO analysis_coverage
      (provider_snapshot_id, capability_name, source_file_id, status) VALUES (?, ?, ?, ?)`);
    for (const unknown of stage.readCoverage()) {
      const item = unknown as { capability: string; sourceFileId: string | null; coverage: string };
      coverage.run(snapshot.id, item.capability, item.sourceFileId, item.coverage);
    }
    const diagnostic = this.db.prepare(`INSERT INTO analysis_diagnostics
      (provider_snapshot_id, ordinal, code, severity, message, source_range_json)
      VALUES (?, ?, ?, ?, ?, ?)`);
    let ordinal = 0;
    for (const unknown of stage.readDiagnostics()) {
      const item = ProviderSnapshotDiagnosticSchema.parse(unknown);
      diagnostic.run(
        snapshot.id,
        ordinal++,
        item.code,
        item.severity,
        item.message,
        item.sourceRange === null ? null : JSON.stringify(item.sourceRange),
      );
    }
  }
}
