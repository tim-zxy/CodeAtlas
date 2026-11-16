import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { loadMigrationPlan } from '../../dist/migrations/manifest.js';
import { applyMigrationPlan } from '../../dist/migrations/runner.js';
import {
  openSchema11ReadStore,
  openSchema11OwnedPublicationStore,
} from '../../dist/knowledge/schema11-read-store.js';
import { withOwnedBusinessPublication } from '../../../application/test/helpers/owned-business-publication-fixture.mjs';
import { canonicalCompilationJson } from '../../../ir/dist/compilation-input-contract.js';
import { supportKey } from '../../../ir/dist/index.js';

export async function fixture(
  t,
  body,
  reportStatus = 'NOT_EVALUABLE',
  readyOnly = false,
  withPublication = withOwnedBusinessPublication,
) {
  return withPublication(t, async (owned) => {
    const db = new DatabaseSync(':memory:');
    try {
      const plan = await loadMigrationPlan(
        new URL('../../migrations/workspace/manifest.json', import.meta.url),
        'WORKSPACE',
      );
      assert.equal(plan.latestVersion, 8);
      applyMigrationPlan(db, plan);
      for (const file of ['009_knowledge.sql', '010_lifecycle.sql', '011_read_candidate.sql'])
        db.exec(
          await readFile(
            new URL('../../migrations/workspace-proposed/' + file, import.meta.url),
            'utf8',
          ),
        );
      db.exec('PRAGMA user_version=11');
      const c = owned.control(),
        json = (v) => canonicalCompilationJson(v, c),
        s = owned.snapshot,
        w = owned.workspaceId;
      const insert = (table, row) =>
        db
          .prepare(
            'INSERT INTO ' +
              table +
              '(' +
              Object.keys(row).join(',') +
              ')VALUES(' +
              Object.keys(row)
                .map(() => '?')
                .join(',') +
              ')',
          )
          .run(...Object.values(row));
      insert('workspace', { slot: 1, id: w, root_path: '/owned' });
      insert('revision_sets', { id: s.revisionSetId, workspace_id: w, created_at: 0, frozen: 0 });
      for (const r of s.repositories) {
        insert('repositories', {
          repository_id: r.repoBasis.repositoryId,
          workspace_id: w,
          root_path: '/owned/' + r.repoBasis.repositoryId,
        });
        insert('revision_set_items', {
          revision_set_id: s.revisionSetId,
          repository_id: r.repoBasis.repositoryId,
          revision_id: r.repoBasis.revisionId,
          revision_fingerprint: r.repoBasis.contentFingerprint,
        });
      }
      db.prepare('UPDATE revision_sets SET frozen=1 WHERE id=?').run(s.revisionSetId);
      insert('compilation_input_snapshots', {
        id: s.snapshotId,
        workspace_id: w,
        revision_set_id: s.revisionSetId,
        schema_version: 1,
        input_digest: s.inputDigest,
        capture_started_at_ms: Date.parse(s.captureWindow.startedAt),
        capture_completed_at_ms: Date.parse(s.captureWindow.completedAt),
        payload_json: json(s),
      });
      for (const i of [
        ...s.repositories,
        ...s.documents,
        ...(s.workspaceCapture ? [s.workspaceCapture] : []),
      ])
        for (const support of i.supports)
          insert('snapshot_supports', {
            workspace_id: w,
            snapshot_id: s.snapshotId,
            revision_set_id: s.revisionSetId,
            support_key: supportKey(support.ref),
            basis_key: json(support.ref.basis),
            entity_key: json(support.ref.entity),
            support_value_digest: support.ref.valueDigest,
            captured_value_digest: support.capturedValueDigest,
            value_schema_ref: support.valueSchemaRef,
            payload_json: json(support),
          });
      const record = owned.store.readPublishedKnowledge(
        [owned.knowledgeRef],
        owned.permissions,
        owned.limits,
        c,
      ).records[0];
      const item = record.itemEnvelope.payload,
        r = record.revisionEnvelope.payload;
      const command = JSON.parse(
        owned.db.prepare('SELECT payload_json FROM offline_attempts').get().payload_json,
      );
      const evaluation = command.request.evaluation;
      insert('compilation_runs', {
        id: r.compilationRunId,
        workspace_id: w,
        revision_set_id: s.revisionSetId,
        caller_subject_id: 'owned',
        request_key: 'owned',
        request_json: '{}',
        state: 'CREATED',
        snapshot_id: null,
        metadata_json: '{}',
        created_at_ms: 0,
        finished_at_ms: null,
      });
      db.prepare("UPDATE compilation_runs SET state='CAPTURING' WHERE id=?").run(
        r.compilationRunId,
      );
      db.prepare('UPDATE compilation_runs SET snapshot_id=? WHERE id=?').run(
        s.snapshotId,
        r.compilationRunId,
      );
      for (const state of ['GENERATING', 'VALIDATING', 'READY'])
        db.prepare('UPDATE compilation_runs SET state=? WHERE id=?').run(state, r.compilationRunId);
      if (!readyOnly)
        db.prepare("UPDATE compilation_runs SET state='PUBLISHED',finished_at_ms=1 WHERE id=?").run(
          r.compilationRunId,
        );
      insert('evaluation_runs', {
        workspace_id: w,
        id: r.evaluationRef.id,
        run_id: r.compilationRunId,
        snapshot_id: s.snapshotId,
        revision_set_id: s.revisionSetId,
        report_schema: 'codeatlas.offline-evaluation-record',
        report_version: 1,
        basis_digest: s.inputDigest,
        baseline_ref: null,
        status: reportStatus,
        report_json: json(evaluation),
      });
      if (!readyOnly) {
        const draft = {
          ...record.itemEnvelope,
          payload: { ...item, lifecycleState: 'DRAFT', publishedRevisionId: null },
        };
        insert('knowledge_items', {
          id: item.id,
          workspace_id: w,
          type: item.type,
          scope_json: json(item.scope),
          importance: item.importance,
          lifecycle_state: 'DRAFT',
          published_revision_id: null,
          source_freshness: item.sourceFreshness,
          compilation_currency: item.compilationCurrency,
          payload_json: json(draft),
        });
        insert('knowledge_revisions', {
          id: r.id,
          workspace_id: w,
          item_id: r.itemId,
          previous_id: r.previousRevisionId,
          revision_set_id: r.revisionSetId,
          semantic_fingerprint: r.semanticFingerprint,
          presentation_fingerprint: r.presentationFingerprint,
          input_snapshot_id: r.inputSnapshotRef.id,
          compilation_run_id: r.compilationRunId,
          evaluation_id: r.evaluationRef.id,
          publication_state: r.publicationState,
          created_at_ms: Date.parse(r.createdAt),
          payload_json: json(record.revisionEnvelope),
        });
        insert('knowledge_revision_provenance', {
          workspace_id: w,
          revision_id: r.id,
          run_id: r.compilationRunId,
          snapshot_id: s.snapshotId,
          evaluation_id: r.evaluationRef.id,
          revision_set_id: s.revisionSetId,
        });
        db.prepare(
          "UPDATE knowledge_items SET lifecycle_state='ACTIVE',published_revision_id=?,payload_json=? WHERE id=?",
        ).run(r.id, json(record.itemEnvelope), item.id);
      }
      const api = await openSchema11ReadStore(db, w);
      await body({ db, api, owned, ref: owned.knowledgeRef, c, limits: owned.limits, w, command });
    } finally {
      if (db.isOpen) db.close();
    }
  });
}

// Reuse the real Application producer and existing owned capture, not a caller-asserted receipt.
export async function withReadyPublication(
  t,
  body,
  coverage,
  withPublication = withOwnedBusinessPublication,
) {
  return fixture(
    t,
    async (f) => {
      const { OfflinePublicationPreparer } =
        await import('../../../application/dist/offline-publication.js');
      const { offlinePublicationState } =
        await import('../../../ir/dist/offline-publication-contract.js');
      const { evaluateCandidateRecord } =
        await import('../../../application/dist/evaluation-record.js');
      const r = structuredClone(f.command.request);
      if (coverage) {
        r.candidates[0].payload.coverage = coverage;
        r.subjects[0].candidateEnvelope = r.candidates[0];
        r.evaluation = evaluateCandidateRecord(
          {
            evaluationId: r.evaluation.evaluationId,
            runId: r.runId,
            snapshot: r.snapshot,
            candidates: r.candidates,
          },
          f.c,
        );
        // This is test-owned fixture preparation before issuing the command.
        const trigger = f.db
          .prepare("SELECT sql FROM sqlite_schema WHERE name='read11_evaluation_runs_no_update'")
          .get().sql;
        f.db.exec('DROP TRIGGER read11_evaluation_runs_no_update');
        f.db
          .prepare('UPDATE evaluation_runs SET report_json=?')
          .run(canonicalCompilationJson(r.evaluation, f.c));
        f.db.exec(trigger);
      }
      const preparer = new OfflinePublicationPreparer({
        lookup: () => ({ status: 'ABSENT' }),
        readState: (c) => offlinePublicationState(f.w, [], c),
      });
      const input = Object.fromEntries(
        [
          'workspaceId',
          'runId',
          'subject',
          'requestKey',
          'snapshot',
          'candidates',
          'subjects',
          'evaluation',
        ].map((k) => [k, r[k]]),
      );
      const ready = await preparer.prepare(
        input,
        {
          kind: 'TEST_REVIEW_NOT_AUTHORITY',
          review: ({ planDigest }) => ({ decision: 'APPROVED', planDigest }),
        },
        f.c,
      );
      assert.equal(ready.status, 'PREPARED');
      const writer = await openSchema11OwnedPublicationStore(f.db, f.w, preparer.identity);
      const refs = ready.command.entries.map((e) => ({
        itemId: e.record.itemEnvelope.payload.id,
        revisionId: e.record.revisionEnvelope.payload.id,
      }));
      await body({ ...f, writer, ready, refs });
    },
    'NOT_EVALUABLE',
    true,
    withPublication,
  );
}
