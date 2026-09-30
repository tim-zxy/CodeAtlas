import type { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import {
  CanonicalEdgeSchema,
  CanonicalNodeSchema,
  ContentFingerprintSchema,
  EntityIdSchema,
  EvidenceSchema,
  FactEvidenceSchema,
  ProviderFactBindingSchema,
  ProviderSnapshotSchema,
  ProviderSnapshotDiagnosticSchema,
  type ContentFingerprint,
  type EntityId,
  type ProviderSnapshot,
  type CanonicalNode,
  type CanonicalEdge,
} from '@codeatlas/ir';

import { RepositoryAnalysisStage } from './temp-stage.js';
import { RepositoryPatchStage, type PatchSupport } from './patch-stage.js';

export interface ExpectedAnalysis {
  readonly repositoryId: EntityId;
  readonly revisionId: EntityId;
  readonly contentFingerprint: ContentFingerprint;
  readonly snapshot: ProviderSnapshot;
}

export interface ExpectedPatch {
  readonly repositoryId: EntityId;
  readonly baseRevisionId: EntityId;
  readonly baseContentFingerprint: ContentFingerprint;
  readonly targetRevisionId: EntityId;
  readonly targetContentFingerprint: ContentFingerprint;
  readonly snapshot: ProviderSnapshot;
}

export class AnalysisPatchError extends Error {
  constructor(
    readonly code: 'INVALID_PATCH' | 'BASE_REVISION_MISMATCH' | 'FULL_ANALYSIS_REQUIRED',
  ) {
    super(`Analysis patch cannot activate: ${code}`);
    this.name = 'AnalysisPatchError';
  }
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

  applyAnalysisPatch(stage: RepositoryPatchStage, expectedValue: ExpectedPatch): number {
    const expected = {
      repositoryId: EntityIdSchema.parse(expectedValue.repositoryId),
      baseRevisionId: EntityIdSchema.parse(expectedValue.baseRevisionId),
      baseContentFingerprint: ContentFingerprintSchema.parse(expectedValue.baseContentFingerprint),
      targetRevisionId: EntityIdSchema.parse(expectedValue.targetRevisionId),
      targetContentFingerprint: ContentFingerprintSchema.parse(
        expectedValue.targetContentFingerprint,
      ),
      snapshot: ProviderSnapshotSchema.parse(expectedValue.snapshot),
    };
    const {
      repositoryId,
      baseRevisionId,
      baseContentFingerprint,
      targetRevisionId,
      targetContentFingerprint,
      snapshot,
    } = expected;
    if (
      snapshot.outcome !== 'SUCCEEDED' ||
      snapshot.repositoryId !== repositoryId ||
      snapshot.requestedRevisionId !== targetRevisionId ||
      snapshot.requestedRevisionFingerprint !== targetContentFingerprint
    ) {
      throw new AnalysisPatchError('INVALID_PATCH');
    }
    stage.assertApplicable(this.db, {
      repositoryId,
      revisionId: targetRevisionId,
      contentFingerprint: targetContentFingerprint,
      snapshotId: snapshot.id,
    });
    const lockStarted = performance.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const revision = this.db
        .prepare(
          'SELECT kind, content_fingerprint FROM revisions WHERE repository_id = ? AND id = ?',
        )
        .get(repositoryId, targetRevisionId) as
        { kind: string; content_fingerprint: string } | undefined;
      if (baseRevisionId !== targetRevisionId || revision?.kind !== 'WORKTREE')
        throw new AnalysisPatchError('FULL_ANALYSIS_REQUIRED');
      const state = this.db
        .prepare(
          'SELECT indexed_revision_id, indexed_content_fingerprint FROM repository_state WHERE repository_id = ?',
        )
        .get(repositoryId) as
        | { indexed_revision_id: string | null; indexed_content_fingerprint: string | null }
        | undefined;
      if (
        state?.indexed_revision_id !== baseRevisionId ||
        state.indexed_content_fingerprint !== baseContentFingerprint
      )
        throw new AnalysisPatchError('BASE_REVISION_MISMATCH');
      if (
        revision.content_fingerprint !== targetContentFingerprint ||
        this.db.prepare('SELECT 1 FROM provider_snapshots WHERE id = ?').get(snapshot.id)
      )
        throw new AnalysisPatchError('INVALID_PATCH');
      const bindings = this.db
        .prepare(
          `SELECT count(*) AS n FROM provider_fact_bindings AS binding
        JOIN evidence AS evidence ON evidence.id = binding.evidence_id
        WHERE evidence.repository_id = ? AND evidence.revision_id = ? AND evidence.status = 'ACTIVE'`,
        )
        .get(repositoryId, targetRevisionId) as { n: number };
      const candidates = this.db
        .prepare(
          `SELECT count(*) AS n FROM active_support_candidates AS candidate
        JOIN evidence AS evidence ON evidence.id = candidate.evidence_id
        WHERE evidence.repository_id = ? AND evidence.revision_id = ? AND evidence.status = 'ACTIVE'`,
        )
        .get(repositoryId, targetRevisionId) as { n: number };
      if (bindings.n !== candidates.n) throw new AnalysisPatchError('FULL_ANALYSIS_REQUIRED');
      // ponytail: R009 requires a full active-support integrity check under this lock;
      // add a durable validated-generation marker only if Evaluation shows lock-time pressure.
      this.validatePatchBaseline(repositoryId, targetRevisionId);
      this.validatePatchSources(stage, repositoryId, targetRevisionId, snapshot);
      const affected = new Map<string, { factType: 'NODE' | 'EDGE'; id: string }>();
      const recordAffected = (factType: 'NODE' | 'EDGE', id: string) =>
        affected.set(JSON.stringify([factType, id]), { factType, id });
      const retire = (
        factType: 'NODE' | 'EDGE',
        providerId: string,
        providerFactId: string,
        status: 'INVALIDATED' | 'SUPERSEDED',
        required: boolean,
      ) => {
        const rows = this.db
          .prepare(
            `SELECT binding.evidence_id, binding.canonical_fact_id
          FROM provider_fact_bindings AS binding
          JOIN evidence AS evidence ON evidence.id = binding.evidence_id
          WHERE binding.fact_type = ? AND binding.provider_id = ? AND binding.provider_fact_id = ?
            AND evidence.repository_id = ? AND evidence.revision_id = ? AND evidence.status = 'ACTIVE'`,
          )
          .all(factType, providerId, providerFactId, repositoryId, targetRevisionId) as {
          evidence_id: string;
          canonical_fact_id: string;
        }[];
        if (
          rows.length > 1 ||
          (required && rows.length !== 1) ||
          providerId !== snapshot.providerId
        )
          throw new AnalysisPatchError('INVALID_PATCH');
        if (!rows.length) return;
        const old = rows[0]!;
        recordAffected(factType, old.canonical_fact_id);
        this.db.prepare('DELETE FROM fact_evidence WHERE evidence_id = ?').run(old.evidence_id);
        this.db
          .prepare('DELETE FROM provider_fact_bindings WHERE evidence_id = ?')
          .run(old.evidence_id);
        this.db
          .prepare('UPDATE evidence SET status = ? WHERE id = ? AND status = ?')
          .run(status, old.evidence_id, 'ACTIVE');
      };
      for (const removal of stage.readRemoveEdges())
        retire('EDGE', removal.providerId, removal.providerFactId, 'INVALIDATED', true);
      for (const removal of stage.readRemoveNodes())
        retire('NODE', removal.providerId, removal.providerFactId, 'INVALIDATED', true);
      for (const upsert of stage.readUpsertEdges())
        retire('EDGE', upsert.providerId, upsert.providerFactId, 'SUPERSEDED', false);
      for (const upsert of stage.readUpsertNodes())
        retire('NODE', upsert.providerId, upsert.providerFactId, 'SUPERSEDED', false);
      this.writeSnapshot(snapshot);
      const insertEvidence = this.db.prepare(`INSERT INTO evidence
        (id, repository_id, revision_id, provider_snapshot_id, fact_type, provider_id, provider_fact_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      const insertLink = this.db.prepare(
        'INSERT INTO fact_evidence (fact_type, canonical_fact_id, evidence_id) VALUES (?, ?, ?)',
      );
      const insertBinding = this.db.prepare(`INSERT INTO provider_fact_bindings
        (fact_type, provider_id, provider_fact_id, provider_snapshot_id, canonical_fact_id, evidence_id)
        VALUES (?, ?, ?, ?, ?, ?)`);
      const insertCandidate = this.db.prepare(`INSERT INTO active_support_candidates
        (evidence_id, fact_type, canonical_fact_id, candidate_json) VALUES (?, ?, ?, ?)`);
      const expectedUpserts = new Set<string>();
      for (const upsert of stage.readUpsertNodes())
        expectedUpserts.add(JSON.stringify(['NODE', upsert.providerId, upsert.providerFactId]));
      for (const upsert of stage.readUpsertEdges())
        expectedUpserts.add(JSON.stringify(['EDGE', upsert.providerId, upsert.providerFactId]));
      const normalized = new Map<string, CanonicalNode | CanonicalEdge>();
      for (const pair of stage.readNormalizedNodes()) {
        if (pair.provider.factType !== 'NODE') throw new AnalysisPatchError('INVALID_PATCH');
        normalized.set(
          JSON.stringify(['NODE', pair.provider.providerId, pair.provider.providerFactId]),
          pair.canonical,
        );
      }
      for (const pair of stage.readNormalizedEdges()) {
        if (pair.provider.factType !== 'EDGE') throw new AnalysisPatchError('INVALID_PATCH');
        normalized.set(
          JSON.stringify(['EDGE', pair.provider.providerId, pair.provider.providerFactId]),
          pair.canonical,
        );
      }
      if (
        normalized.size !== expectedUpserts.size ||
        [...normalized.keys()].some((key) => !expectedUpserts.has(key))
      )
        throw new AnalysisPatchError('INVALID_PATCH');
      for (const support of stage.readSupports()) {
        const key = JSON.stringify([
          support.factType,
          support.binding.providerFact.providerId,
          support.binding.providerFact.providerFactId,
        ]);
        const fact = (
          support.factType === 'NODE' ? CanonicalNodeSchema : CanonicalEdgeSchema
        ).parse(support.canonical);
        const evidence = EvidenceSchema.parse(support.evidence);
        const binding = ProviderFactBindingSchema.parse(support.binding);
        const link = FactEvidenceSchema.parse(support.factEvidence);
        if (
          !expectedUpserts.delete(key) ||
          !isDeepStrictEqual(fact, normalized.get(key)) ||
          support.snapshotId !== snapshot.id ||
          evidence.id !== binding.evidenceId ||
          !isDeepStrictEqual(evidence.providerFact, binding.providerFact) ||
          link.evidenceId !== evidence.id ||
          link.fact.id !== fact.id ||
          link.fact.factType !== support.factType ||
          binding.canonicalFact.id !== fact.id ||
          binding.canonicalFact.factType !== support.factType ||
          binding.providerSnapshotId !== snapshot.id ||
          evidence.providerSnapshotId !== snapshot.id ||
          evidence.status !== 'ACTIVE' ||
          evidence.repositoryId !== repositoryId ||
          evidence.revisionId !== targetRevisionId ||
          fact.repositoryId !== repositoryId ||
          fact.revisionId !== targetRevisionId ||
          binding.providerFact.providerId !== snapshot.providerId
        )
          throw new AnalysisPatchError('INVALID_PATCH');
        recordAffected(support.factType, fact.id);
        insertEvidence.run(
          evidence.id,
          repositoryId,
          targetRevisionId,
          snapshot.id,
          support.factType,
          binding.providerFact.providerId,
          binding.providerFact.providerFactId,
          'ACTIVE',
        );
        insertLink.run(support.factType, fact.id, evidence.id);
        insertBinding.run(
          support.factType,
          binding.providerFact.providerId,
          binding.providerFact.providerFactId,
          snapshot.id,
          fact.id,
          evidence.id,
        );
        insertCandidate.run(evidence.id, support.factType, fact.id, JSON.stringify(fact));
      }
      if (expectedUpserts.size) throw new AnalysisPatchError('INVALID_PATCH');
      for (const { factType, id } of affected.values()) {
        if (factType !== 'EDGE') continue;
        this.db
          .prepare('DELETE FROM canonical_edges WHERE revision_id = ? AND id = ?')
          .run(targetRevisionId, id);
      }
      for (const { factType, id } of affected.values()) {
        if (factType !== 'NODE') continue;
        this.reselectPatchFact(stage, repositoryId, targetRevisionId, factType, id);
      }
      for (const { factType, id } of affected.values()) {
        if (factType !== 'EDGE') continue;
        this.reselectPatchFact(stage, repositoryId, targetRevisionId, factType, id);
      }
      this.validatePatchGraph(repositoryId, targetRevisionId);
      this.writeCoverageAndDiagnostics(stage, snapshot);
      const changed = this.db
        .prepare(
          `UPDATE repository_state
        SET indexed_revision_id = ?, indexed_content_fingerprint = ? WHERE repository_id = ?`,
        )
        .run(targetRevisionId, targetContentFingerprint, repositoryId);
      if (changed.changes !== 1) throw new AnalysisPatchError('INVALID_PATCH');
      this.db.exec('COMMIT');
      return performance.now() - lockStarted;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private validatePatchSources(
    stage: RepositoryPatchStage,
    repositoryId: string,
    revisionId: string,
    snapshot: ProviderSnapshot,
  ): void {
    const source = this.db.prepare(`SELECT path, content_fingerprint FROM source_files
      WHERE repository_id = ? AND revision_id = ? AND id = ?`);
    for (const file of stage.readSourceFiles()) {
      const row = source.get(repositoryId, revisionId, file.id) as
        { path: string; content_fingerprint: string } | undefined;
      if (
        file.repositoryId !== repositoryId ||
        file.revisionId !== revisionId ||
        row?.path !== file.path ||
        row.content_fingerprint !== file.contentFingerprint
      )
        throw new AnalysisPatchError('INVALID_PATCH');
    }
    const checkRange = (range: { sourceFileId: string } | null) => {
      if (range && !source.get(repositoryId, revisionId, range.sourceFileId))
        throw new AnalysisPatchError('INVALID_PATCH');
    };
    for (const coverage of stage.readCoverage())
      if (
        coverage.sourceFileId !== null &&
        !source.get(repositoryId, revisionId, coverage.sourceFileId)
      )
        throw new AnalysisPatchError('INVALID_PATCH');
    for (const diagnostic of stage.readDiagnostics() as Iterable<{
      sourceRange: { sourceFileId: string } | null;
    }>)
      checkRange(diagnostic.sourceRange);
    for (const diagnostic of snapshot.diagnostics) checkRange(diagnostic.sourceRange);
    for (const pair of stage.readNormalizedNodes()) checkRange(pair.canonical.sourceRange);
    for (const pair of stage.readNormalizedEdges()) checkRange(pair.canonical.sourceRange);
  }

  private validatePatchBaseline(repositoryId: string, revisionId: string): void {
    const rows = this.db
      .prepare(
        `SELECT binding.fact_type, binding.canonical_fact_id,
      candidate.candidate_json FROM provider_fact_bindings AS binding
      JOIN evidence AS evidence ON evidence.id = binding.evidence_id
      LEFT JOIN active_support_candidates AS candidate ON candidate.evidence_id = binding.evidence_id
      WHERE evidence.repository_id = ? AND evidence.revision_id = ? AND evidence.status = 'ACTIVE'`,
      )
      .iterate(repositoryId, revisionId) as IterableIterator<{
      fact_type: 'NODE' | 'EDGE';
      canonical_fact_id: string;
      candidate_json: string | null;
    }>;
    const node = this.db.prepare(
      'SELECT fact_key FROM canonical_nodes WHERE revision_id = ? AND id = ?',
    );
    const edge = this.db.prepare(
      'SELECT fact_key FROM canonical_edges WHERE revision_id = ? AND id = ?',
    );
    const source = this.db.prepare(
      'SELECT 1 FROM source_files WHERE repository_id = ? AND revision_id = ? AND id = ?',
    );
    for (const row of rows) {
      let candidate: CanonicalNode | CanonicalEdge;
      try {
        candidate = (row.fact_type === 'NODE' ? CanonicalNodeSchema : CanonicalEdgeSchema).parse(
          JSON.parse(row.candidate_json ?? 'null'),
        );
      } catch {
        throw new AnalysisPatchError('FULL_ANALYSIS_REQUIRED');
      }
      const fact = (row.fact_type === 'NODE' ? node : edge).get(
        revisionId,
        row.canonical_fact_id,
      ) as { fact_key: string } | undefined;
      if (
        candidate.id !== row.canonical_fact_id ||
        candidate.repositoryId !== repositoryId ||
        candidate.revisionId !== revisionId ||
        candidate.factKey !== fact?.fact_key ||
        (candidate.sourceRange !== null &&
          !source.get(repositoryId, revisionId, candidate.sourceRange.sourceFileId))
      )
        throw new AnalysisPatchError('FULL_ANALYSIS_REQUIRED');
    }
    const orphan = this.db
      .prepare(
        `SELECT 1 FROM evidence AS evidence
      WHERE evidence.repository_id = ? AND evidence.revision_id = ? AND evidence.status = 'ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM provider_fact_bindings AS binding
          WHERE binding.evidence_id = evidence.id)
      LIMIT 1`,
      )
      .get(repositoryId, revisionId);
    if (orphan) throw new AnalysisPatchError('FULL_ANALYSIS_REQUIRED');
    if (this.hasDanglingFactEvidence(repositoryId, revisionId))
      throw new AnalysisPatchError('FULL_ANALYSIS_REQUIRED');
    for (const [type, table] of [
      ['NODE', 'canonical_nodes'],
      ['EDGE', 'canonical_edges'],
    ] as const) {
      const unsupported = this.db
        .prepare(
          `SELECT 1 FROM ${table} AS fact
        WHERE fact.repository_id = ? AND fact.revision_id = ? AND NOT EXISTS (
          SELECT 1 FROM provider_fact_bindings AS binding
          JOIN evidence AS evidence ON evidence.id = binding.evidence_id
          WHERE binding.fact_type = ? AND binding.canonical_fact_id = fact.id
            AND evidence.repository_id = ? AND evidence.revision_id = ? AND evidence.status = 'ACTIVE')
        LIMIT 1`,
        )
        .get(repositoryId, revisionId, type, repositoryId, revisionId);
      if (unsupported) throw new AnalysisPatchError('FULL_ANALYSIS_REQUIRED');
    }
  }

  private validatePatchGraph(repositoryId: string, revisionId: string): void {
    if (this.hasDanglingFactEvidence(repositoryId, revisionId))
      throw new AnalysisPatchError('INVALID_PATCH');
    const danglingCandidate = this.db
      .prepare(
        `SELECT 1 FROM unresolved_targets AS target
      JOIN canonical_edges AS edge ON edge.revision_id = target.revision_id AND edge.id = target.edge_id
      JOIN json_each(target.candidates_json) AS candidate
      LEFT JOIN canonical_nodes AS node ON node.revision_id = target.revision_id
        AND node.id = json_extract(candidate.value, '$.id')
      WHERE edge.repository_id = ? AND edge.revision_id = ? AND node.id IS NULL LIMIT 1`,
      )
      .get(repositoryId, revisionId);
    if (danglingCandidate) throw new AnalysisPatchError('INVALID_PATCH');
    for (const [type, table] of [
      ['NODE', 'canonical_nodes'],
      ['EDGE', 'canonical_edges'],
    ] as const) {
      const danglingRange = this.db
        .prepare(
          `SELECT 1 FROM ${table} AS fact
        WHERE fact.repository_id = ? AND fact.revision_id = ? AND fact.source_range_json IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM source_files AS source
            WHERE source.repository_id = fact.repository_id AND source.revision_id = fact.revision_id
              AND source.id = json_extract(fact.source_range_json, '$.sourceFileId'))
        LIMIT 1`,
        )
        .get(repositoryId, revisionId);
      if (danglingRange) throw new AnalysisPatchError('INVALID_PATCH');
      const unsupported = this.db
        .prepare(
          `SELECT 1 FROM ${table} AS fact
        WHERE fact.repository_id = ? AND fact.revision_id = ? AND NOT EXISTS (
          SELECT 1 FROM provider_fact_bindings AS binding
          JOIN evidence AS evidence ON evidence.id = binding.evidence_id
          WHERE binding.fact_type = ? AND binding.canonical_fact_id = fact.id
            AND evidence.repository_id = ? AND evidence.revision_id = ? AND evidence.status = 'ACTIVE')
        LIMIT 1`,
        )
        .get(repositoryId, revisionId, type, repositoryId, revisionId);
      if (unsupported) throw new AnalysisPatchError('INVALID_PATCH');
    }
  }

  private hasDanglingFactEvidence(repositoryId: string, revisionId: string): boolean {
    return !!this.db
      .prepare(
        `SELECT 1 FROM fact_evidence AS link
      JOIN evidence AS evidence ON evidence.id = link.evidence_id
      LEFT JOIN canonical_nodes AS node ON link.fact_type = 'NODE'
        AND node.repository_id = evidence.repository_id
        AND node.revision_id = evidence.revision_id AND node.id = link.canonical_fact_id
      LEFT JOIN canonical_edges AS edge ON link.fact_type = 'EDGE'
        AND edge.repository_id = evidence.repository_id
        AND edge.revision_id = evidence.revision_id AND edge.id = link.canonical_fact_id
      WHERE evidence.repository_id = ? AND evidence.revision_id = ? AND evidence.status = 'ACTIVE'
        AND (link.fact_type <> evidence.fact_type OR
          (link.fact_type = 'NODE' AND node.id IS NULL) OR
          (link.fact_type = 'EDGE' AND edge.id IS NULL))
      LIMIT 1`,
      )
      .get(repositoryId, revisionId);
  }

  private reselectPatchFact(
    stage: RepositoryPatchStage,
    repositoryId: string,
    revisionId: string,
    factType: 'NODE' | 'EDGE',
    id: string,
  ): void {
    const rows = this.db
      .prepare(
        `SELECT candidate.candidate_json, binding.provider_id,
      binding.provider_fact_id, binding.provider_snapshot_id, binding.evidence_id
      FROM provider_fact_bindings AS binding
      JOIN evidence AS evidence ON evidence.id = binding.evidence_id
      JOIN active_support_candidates AS candidate ON candidate.evidence_id = binding.evidence_id
      WHERE binding.fact_type = ? AND binding.canonical_fact_id = ?
        AND evidence.repository_id = ? AND evidence.revision_id = ? AND evidence.status = 'ACTIVE'
      ORDER BY binding.evidence_id`,
      )
      .all(factType, id, repositoryId, revisionId) as {
      candidate_json: string;
      provider_id: string;
      provider_fact_id: string;
      provider_snapshot_id: string;
      evidence_id: string;
    }[];
    if (!rows.length) {
      if (factType === 'NODE') {
        const dependent = this.db
          .prepare(
            `SELECT 1 FROM canonical_edges
          WHERE revision_id = ? AND (source_node_id = ? OR target_node_id = ?) LIMIT 1`,
          )
          .get(revisionId, id, id);
        if (dependent) throw new AnalysisPatchError('INVALID_PATCH');
        this.db
          .prepare('DELETE FROM canonical_nodes WHERE revision_id = ? AND id = ?')
          .run(revisionId, id);
      }
      return;
    }
    const group: PatchSupport[] = rows.map((row) => {
      const fact = (factType === 'NODE' ? CanonicalNodeSchema : CanonicalEdgeSchema).parse(
        JSON.parse(row.candidate_json),
      );
      if (fact.id !== id || fact.repositoryId !== repositoryId || fact.revisionId !== revisionId)
        throw new AnalysisPatchError('FULL_ANALYSIS_REQUIRED');
      const providerFact = {
        factType,
        providerId: row.provider_id,
        providerFactId: row.provider_fact_id,
      };
      const reference = { factType, id };
      return {
        factType,
        canonical: fact,
        snapshotId: row.provider_snapshot_id,
        inputPath: [],
        evidence: EvidenceSchema.parse({
          id: row.evidence_id,
          repositoryId,
          revisionId,
          providerSnapshotId: row.provider_snapshot_id,
          providerFact,
          status: 'ACTIVE',
        }),
        factEvidence: FactEvidenceSchema.parse({ fact: reference, evidenceId: row.evidence_id }),
        binding: ProviderFactBindingSchema.parse({
          providerFact,
          providerSnapshotId: row.provider_snapshot_id,
          canonicalFact: reference,
          evidenceId: row.evidence_id,
        }),
      };
    });
    if (group.some((support) => support.canonical.factKey !== group[0]!.canonical.factKey))
      throw new AnalysisPatchError('INVALID_PATCH');
    const selected = stage.selectGroup(group);
    if (
      selected.id !== id ||
      selected.repositoryId !== repositoryId ||
      selected.revisionId !== revisionId ||
      selected.factKey !== group[0]!.canonical.factKey
    )
      throw new AnalysisPatchError('INVALID_PATCH');
    if (factType === 'NODE') {
      const node = CanonicalNodeSchema.parse(selected) as CanonicalNode;
      this.db
        .prepare(
          `INSERT INTO canonical_nodes
        (revision_id, id, repository_id, fact_key, kind, type_kind, symbol_kind, name,
         qualified_name, source_range_json, confidence_score, confidence_method, confidence_reasons_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(revision_id, id) DO UPDATE SET
          fact_key=excluded.fact_key, kind=excluded.kind, type_kind=excluded.type_kind,
          symbol_kind=excluded.symbol_kind, name=excluded.name,
          qualified_name=excluded.qualified_name, source_range_json=excluded.source_range_json,
          confidence_score=excluded.confidence_score, confidence_method=excluded.confidence_method,
          confidence_reasons_json=excluded.confidence_reasons_json`,
        )
        .run(
          revisionId,
          id,
          repositoryId,
          node.factKey,
          node.kind,
          node.kind === 'TYPE' ? node.typeKind : null,
          node.kind === 'SYMBOL' ? node.symbolKind : null,
          node.name,
          node.qualifiedName,
          node.sourceRange === null ? null : JSON.stringify(node.sourceRange),
          node.confidence.score,
          node.confidence.method,
          JSON.stringify(node.confidence.reasons),
        );
    } else {
      const edge = CanonicalEdgeSchema.parse(selected) as CanonicalEdge;
      const node = this.db.prepare(
        'SELECT 1 FROM canonical_nodes WHERE revision_id = ? AND id = ?',
      );
      if (
        !node.get(revisionId, edge.source.id) ||
        (edge.target.state === 'RESOLVED' && !node.get(revisionId, edge.target.target.id)) ||
        (edge.target.state === 'UNRESOLVED' &&
          edge.target.candidates.some((candidate) => !node.get(revisionId, candidate.id)))
      )
        throw new AnalysisPatchError('INVALID_PATCH');
      this.db
        .prepare(
          `INSERT INTO canonical_edges
        (revision_id, id, repository_id, fact_key, kind, source_node_id, target_state,
         resolution, target_node_id, source_range_json, confidence_score,
         confidence_method, confidence_reasons_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          revisionId,
          id,
          repositoryId,
          edge.factKey,
          edge.kind,
          edge.source.id,
          edge.target.state,
          edge.target.resolution,
          edge.target.state === 'RESOLVED' ? edge.target.target.id : null,
          edge.sourceRange === null ? null : JSON.stringify(edge.sourceRange),
          edge.confidence.score,
          edge.confidence.method,
          JSON.stringify(edge.confidence.reasons),
        );
      if (edge.target.state === 'UNRESOLVED')
        this.db
          .prepare(
            `INSERT INTO unresolved_targets
          (revision_id, edge_id, original_hint, candidates_json) VALUES (?, ?, ?, ?)`,
          )
          .run(revisionId, id, edge.target.originalHint, JSON.stringify(edge.target.candidates));
    }
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
    const candidate = this.db.prepare(`INSERT INTO active_support_candidates
      (evidence_id, fact_type, canonical_fact_id, candidate_json) VALUES (?, ?, ?, ?)`);
    const nodeKey = this.db.prepare(
      'SELECT fact_key FROM canonical_nodes WHERE revision_id = ? AND id = ?',
    );
    const edgeKey = this.db.prepare(
      'SELECT fact_key FROM canonical_edges WHERE revision_id = ? AND id = ?',
    );
    for (const group of stage.readSupportGroups<{
      factType: 'NODE' | 'EDGE';
      canonical: unknown;
      evidence: unknown;
      binding: unknown;
    }>()) {
      for (const support of group) {
        const fact = (
          support.factType === 'NODE' ? CanonicalNodeSchema : CanonicalEdgeSchema
        ).parse(support.canonical);
        const evidenceValue = EvidenceSchema.parse(support.evidence);
        const bindingValue = ProviderFactBindingSchema.parse(support.binding);
        assert(
          bindingValue.evidenceId === evidenceValue.id &&
            bindingValue.canonicalFact.factType === support.factType &&
            bindingValue.canonicalFact.id === fact.id &&
            bindingValue.providerSnapshotId === evidenceValue.providerSnapshotId &&
            fact.repositoryId === evidenceValue.repositoryId &&
            fact.revisionId === evidenceValue.revisionId &&
            (
              (support.factType === 'NODE' ? nodeKey : edgeKey).get(fact.revisionId, fact.id) as
                { fact_key: string } | undefined
            )?.fact_key === fact.factKey,
          'Support candidate differs from binding',
        );
        candidate.run(evidenceValue.id, support.factType, fact.id, JSON.stringify(fact));
      }
    }
  }

  private writeCoverageAndDiagnostics(
    stage: RepositoryAnalysisStage | RepositoryPatchStage,
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
