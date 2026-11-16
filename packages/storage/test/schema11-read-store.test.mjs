import test from 'node:test';
import assert from 'node:assert/strict';
import { openSchema11OwnedPublicationStore } from '../dist/knowledge/schema11-read-store.js';
import { openCompilationInputStore } from '../dist/knowledge/compilation-input-store.js';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
import { parseKnowledgeRevision } from '../../ir/dist/index.js';
import { fixture, withReadyPublication } from './helpers/schema11-publication-fixture.mjs';

test('schema11 reads real canonical metadata and provenance without writes, quality admission or changing legacy schema gates', async (t) =>
  fixture(t, async (f) => {
    const before = f.db.prepare('SELECT total_changes() n').get().n;
    const value = f.api.readSelectedMetadata([f.ref], f.limits, f.c, () => {});
    assert.equal(value.version, 2);
    assert.equal(value.mode, 'SCHEMA11_READ_CANDIDATE');
    assert.equal(value.qualityAdmission, 'UNAVAILABLE');
    assert.equal(value.productionAccess, 'CLOSED');
    assert.equal(value.records.length, 1);
    assert.equal(value.records[0].revisionId, f.ref.revisionId);
    assert.equal(value.records[0].snapshotId, f.owned.snapshot.snapshotId);
    assert.equal(value.records[0].structuredContent, undefined);
    assert.ok(Object.isFrozen(value) && Object.isFrozen(value.records));
    assert.equal(f.db.prepare('SELECT total_changes() n').get().n, before);
    await assert.rejects(
      openCompilationInputStore(f.db, f.w, f.limits),
      /SNAPSHOT_SCHEMA_UNSUPPORTED/,
    );
  }));
test('query permission/control/refusal does not leak arbitrary errors or leave a transaction active', async (t) =>
  fixture(t, async (f) => {
    for (const check of [
      () => true,
      () => Promise.reject(Error('PRIVATE')),
      () => {
        throw Error('PRIVATE');
      },
    ]) {
      assert.throws(() => f.api.readSelectedMetadata([f.ref], f.limits, f.c, check));
      assert.equal(f.db.isTransaction, false);
    }
    assert.throws(
      () =>
        f.api.readSelectedMetadata([{ ...f.ref, revisionId: 'wrong' }], f.limits, f.c, () => {}),
      /READ11_REVISION_MISMATCH/,
    );
    const cancel = new AbortController();
    cancel.abort();
    assert.throws(() =>
      f.api.readSelectedMetadata([f.ref], f.limits, { ...f.c, signal: cancel.signal }, () => {}),
    );
    assert.throws(() =>
      f.api.readSelectedMetadata([f.ref], { ...f.limits, maxRows: 1 }, f.c, () => {}),
    );
    assert.equal(f.db.isTransaction, false);
  }));
test('unknown schema and disabled FKs refuse; immutable provenance and dangling associations cannot be installed', async (t) =>
  fixture(t, async (f) => {
    assert.throws(
      () => f.db.exec("UPDATE knowledge_revision_provenance SET evaluation_id='wrong'"),
      /immutable/,
    );
    assert.throws(() =>
      f.db
        .prepare('INSERT INTO knowledge_revision_provenance VALUES(?,?,?,?,?,?)')
        .run(f.w, 'missing', 'missing', 'missing', 'missing', 'missing'),
    );
    f.db.exec('PRAGMA foreign_keys=OFF');
    assert.throws(
      () => f.api.readSelectedMetadata([f.ref], f.limits, f.c, () => {}),
      /READ11_FOREIGN_KEYS_REQUIRED/,
    );
    f.db.exec('PRAGMA foreign_keys=ON');
    f.db.exec('CREATE TABLE unexpected(x TEXT)');
    assert.throws(
      () => f.api.readSelectedMetadata([f.ref], f.limits, f.c, () => {}),
      /READ11_SCHEMA_UNSUPPORTED/,
    );
  }));

test('permission callout loses connection or snapshot then throws: UNKNOWN latches rather than false settlement', async (t) => {
  for (const mode of ['close', 'commit'])
    await fixture(t, async (f) => {
      assert.throws(
        () =>
          f.api.readSelectedMetadata([f.ref], f.limits, f.c, () => {
            if (f.db.isTransaction) {
              if (mode === 'close') f.db.close();
              else f.db.exec('COMMIT');
              throw Error('PRIVATE');
            }
          }),
        (e) =>
          ['READ11_OWNER_UNSETTLED', 'READ11_CLEANUP_UNKNOWN'].includes(e.code) &&
          e.cleanupState === 'UNKNOWN' &&
          !e.message.includes('PRIVATE'),
      );
      assert.throws(
        () => f.api.readSelectedMetadata([f.ref], f.limits, f.c, () => {}),
        (e) =>
          ['READ11_OWNER_UNSETTLED', 'READ11_CLEANUP_UNKNOWN'].includes(e.code) &&
          e.cleanupState === 'UNKNOWN',
      );
    });
});
test('item scope uses only its own snapshot repository set, never prior selections', async () => {
  const { assertSchema11ItemScope: check } =
    await import('../dist/knowledge/schema11-read-store.js');
  const priorSnapshot = ['repo:a'],
    currentSnapshot = ['repo:b'];
  check({ kind: 'REPOSITORY', repositoryId: 'repo:a' }, 'w', priorSnapshot);
  assert.throws(() => check({ kind: 'REPOSITORY', repositoryId: 'repo:a' }, 'w', currentSnapshot));
  assert.throws(() =>
    check({ kind: 'CROSS_REPO', repositoryIds: ['repo:a', 'repo:b'] }, 'w', currentSnapshot),
  );
  check({ kind: 'REPOSITORY', repositoryId: 'repo:b' }, 'w', currentSnapshot);
});

test('caller supplied PASS cannot become quality admission or authorize production', async (t) =>
  fixture(
    t,
    async (f) => {
      assert.throws(
        () => f.api.readSelectedMetadata([f.ref], f.limits, f.c, () => {}),
        /READ11_QUALITY_FORMAT_UNAVAILABLE/,
      );
      assert.equal(f.db.isTransaction, false);
    },
    'PASS',
  ));

test('schema11 independent projection delivers exact current Canonical content and refs with no quality or coverage promotion', async (t) =>
  fixture(t, async (f) => {
    const metadata = f.api.readSelectedMetadata([f.ref], f.limits, f.c, () => {});
    const before = f.db.prepare('SELECT total_changes() n').get().n;
    const grants = [];
    const value = f.api.readSelectedProjection([f.ref], f.limits, f.c, (m) => {
      grants.push(m);
    });
    const original = f.owned.store.readPublishedKnowledge(
      [f.ref],
      f.owned.permissions,
      f.owned.limits,
      f.c,
    ).records[0];
    assert.equal(value.schema, 'codeatlas.published-knowledge-projection');
    assert.equal(value.version, 1);
    assert.equal(value.mode, 'SCHEMA11_READ_CANDIDATE');
    assert.equal(value.qualityAdmission, 'UNAVAILABLE');
    assert.equal(value.productionAccess, 'CLOSED');
    const record = value.records[0];
    assert.deepEqual(record.itemEnvelope, original.itemEnvelope);
    assert.deepEqual(record.revisionEnvelope, original.revisionEnvelope);
    const refs = (context) =>
      Object.fromEntries(
        Object.entries(context).map(([key, values]) => [
          key,
          values.map((v) => canonicalCompilationJson(v, f.c)).sort(),
        ]),
      );
    assert.deepEqual(refs(record.referenceContext), refs(original.referenceContext));
    assert.deepEqual(
      parseKnowledgeRevision(record.revisionEnvelope, record.referenceContext),
      record.revisionEnvelope,
    );
    assert.deepEqual(Object.keys(record.provenance).sort(), [
      'evaluationId',
      'revisionSetId',
      'runId',
      'snapshotId',
    ]);
    assert.equal(record.provenance.snapshotId, f.owned.snapshot.snapshotId);
    assert.equal(record.currentHeadRevisionId, f.ref.revisionId);
    assert.equal(record.evaluationStatus, 'NOT_EVALUABLE');
    assert.equal(record.knowledgeCoverage, null);
    assert.equal(value.kind, undefined);
    assert.ok(Object.isFrozen(record.revisionEnvelope.payload.structuredContent));
    assert.ok(Object.isFrozen(record.referenceContext.availableSupports));
    assert.ok(
      grants.every((m) =>
        [
          'PUBLISHED_ITEM_DELIVERY',
          'PUBLISHED_REVISION_DELIVERY',
          'REFERENCE_METADATA_DELIVERY',
        ].every((field) => m.fields.includes(field)),
      ),
    );
    assert.deepEqual(
      f.api.readSelectedMetadata([f.ref], f.limits, f.c, () => {}),
      metadata,
    );
    assert.equal(f.db.prepare('SELECT total_changes() n').get().n, before);
  }));

test('schema11 projection needs delivery permission, exact current version and original controls', async (t) =>
  fixture(t, async (f) => {
    const metadataOnly = (m) => {
      if (m.fields.some((field) => field.endsWith('_DELIVERY')))
        throw Error('PRIVATE_DELIVERY_DENIED');
    };
    assert.throws(
      () => f.api.readSelectedProjection([f.ref], f.limits, f.c, metadataOnly),
      /READ11_PERMISSION_DENIED/,
    );
    assert.equal(f.api.readSelectedMetadata([f.ref], f.limits, f.c, metadataOnly).version, 2);
    assert.throws(
      () =>
        f.api.readSelectedProjection(
          [{ ...f.ref, revisionId: 'historical-or-unknown' }],
          f.limits,
          f.c,
          () => {},
        ),
      /READ11_REVISION_MISMATCH/,
    );
    assert.throws(
      () =>
        f.api.readSelectedProjection(
          [f.ref],
          f.limits,
          { ...f.c, signal: AbortSignal.abort() },
          () => {},
        ),
      /CANCELLED/,
    );
    assert.throws(() =>
      f.api.readSelectedProjection([f.ref], { ...f.limits, maxRows: 1 }, f.c, () => {}),
    );
    assert.equal(f.db.isTransaction, false);
    const { createOwnedKnowledgeStatusSession } =
      await import('../../agent-api/dist/knowledge-status-tool.js');
    const { createCl100kTokenCounter } = await import('../../runtime/dist/local-token-counter.js');
    const limits = { maxItems: 10, maxDepth: 0, maxOutputBytes: 1000000, maxTokens: 50000 };
    const session = createOwnedKnowledgeStatusSession({
      workspaceId: f.w,
      repositoryIds: f.owned.repositoryIds,
      selectedRefs: [f.ref],
      limits,
      authorize() {},
      knowledgeQuery: async (refs, c) => f.api.readSelectedProjection(refs, f.limits, c, () => {}),
      tokenCounter: createCl100kTokenCounter(limits.maxOutputBytes),
    });
    try {
      const result = await session.execute(
        { version: 1, mode: 'SELECTED_PUBLISHED', budget: limits },
        session.context,
        f.owned.control(),
      );
      assert.equal(result.error.code, 'DATA_INVALID');
    } finally {
      session.close();
    }
  }));

test('schema11 projection keeps uncertain owner latched across both read interfaces', async (t) =>
  fixture(t, async (f) => {
    assert.throws(
      () =>
        f.api.readSelectedProjection([f.ref], f.limits, f.c, () => {
          if (f.db.isTransaction) {
            f.db.exec('COMMIT');
            throw Error('PRIVATE');
          }
        }),
      (e) => e.cleanupState === 'UNKNOWN',
    );
    for (const method of ['readSelectedMetadata', 'readSelectedProjection'])
      assert.throws(
        () => f.api[method]([f.ref], f.limits, f.c, () => {}),
        (e) => e.cleanupState === 'UNKNOWN',
      );
  }));

test('schema11 atomically retains original candidate coverage and binding without changing old projections', async (t) => {
  for (const coverage of [
    { status: 'COMPLETE', limitations: [], unverifiedRefs: [] },
    { status: 'PARTIAL', limitations: ['SOURCE_PARTIAL'], unverifiedRefs: [] },
  ])
    await withReadyPublication(
      t,
      async (f) => {
        const result = f.writer.publishOwnedPrepared(f.ready.handle, f.limits, f.c);
        assert.equal(result.status, 'COMMITTED');
        assert.equal(result.cleanupState, 'SETTLED');
        const before = f.db.prepare('SELECT total_changes() n').get().n;
        const value = f.api.readSelectedCoveredProjection(f.refs, f.limits, f.c, () => {});
        assert.equal(value.version, 2);
        assert.equal(value.qualityAdmission, 'UNAVAILABLE');
        assert.equal(value.productionAccess, 'CLOSED');
        assert.deepEqual(value.records[0].knowledgeCoverage, coverage);
        assert.equal(value.records[0].candidateId, f.ready.command.entries[0].candidateId);
        assert.equal(value.records[0].publicationId, f.command.request.runId);
        assert.equal(value.records[0].evaluationStatus, 'NOT_EVALUABLE');
        assert.ok(Object.isFrozen(value.records[0].knowledgeCoverage.limitations));
        const row = f.db.prepare('SELECT * FROM publication_runs').get();
        const receipt = JSON.parse(row.receipt_json);
        assert.equal(receipt.schema, 'codeatlas.schema11-publication-provenance');
        assert.equal(receipt.inputDigest, f.owned.snapshot.inputDigest);
        assert.equal(
          receipt.candidateSetDigest,
          f.ready.command.request.evaluation.candidateDigest,
        );
        assert.deepEqual(receipt.command, f.ready.command);
        assert.deepEqual(
          JSON.parse(row.result_heads_json),
          Object.fromEntries(f.refs.map((r) => [r.itemId, r.revisionId])),
        );
        assert.equal(
          f.api.readSelectedProjection(f.refs, f.limits, f.c, () => {}).records[0]
            .knowledgeCoverage,
          null,
        );
        assert.equal(f.api.readSelectedMetadata(f.refs, f.limits, f.c, () => {}).version, 2);
        assert.equal(f.db.prepare('SELECT total_changes() n').get().n, before);
        assert.throws(
          () => f.writer.publishOwnedPrepared(f.ready.handle, f.limits, f.c),
          /READ11_RUN_NOT_READY/,
        );
        assert.equal(f.db.prepare('SELECT count(*) n FROM publication_runs').get().n, 1);
      },
      coverage,
    );
});

test('schema11 covered projection refuses old missing receipts and permission changes', async (t) => {
  await fixture(t, async (f) => {
    assert.throws(
      () => f.api.readSelectedCoveredProjection([f.ref], f.limits, f.c, () => {}),
      /READ11_ASSOCIATION_MISSING/,
    );
    assert.equal(
      f.api.readSelectedProjection([f.ref], f.limits, f.c, () => {}).records[0].knowledgeCoverage,
      null,
    );
  });
  await withReadyPublication(t, async (f) => {
    f.writer.publishOwnedPrepared(f.ready.handle, f.limits, f.c);
    assert.throws(
      () =>
        f.api.readSelectedCoveredProjection(f.refs, f.limits, f.c, (m) => {
          if (m.fields.includes('KNOWLEDGE_COVERAGE_DELIVERY')) throw Error('DENIED');
        }),
      /READ11_PERMISSION_DENIED/,
    );
  });
});

function corruptReceipt(f, mutate) {
  const row = f.db.prepare('SELECT receipt_json FROM publication_runs').get();
  const receipt = JSON.parse(row.receipt_json);
  mutate(receipt);
  const trigger = f.db
    .prepare("SELECT sql FROM sqlite_schema WHERE name='proposed_publication_runs_no_update'")
    .get().sql;
  f.db.exec('DROP TRIGGER proposed_publication_runs_no_update');
  f.db
    .prepare('UPDATE publication_runs SET receipt_json=?')
    .run(canonicalCompilationJson(receipt, f.c));
  f.db.exec(trigger);
}
test('schema11 revalidates full candidate digest, mapping and all provenance bindings', async (t) => {
  for (const mutate of [
    (r) => {
      r.candidateSetDigest = '0'.repeat(64);
    },
    (r) => {
      r.workspaceId = 'different-workspace';
    },
    (r) => {
      r.command.request.candidates[0].payload.coverage = {
        status: 'PARTIAL',
        limitations: ['TAMPERED'],
        unverifiedRefs: [],
      };
    },
    (r) => {
      r.command.entries[0].candidateId = 'unmapped';
    },
    (r) => {
      r.command.entries[0].record.revisionEnvelope.payload.id = 'different-revision';
    },
    (r) => {
      r.version = 2;
    },
  ])
    await withReadyPublication(t, async (f) => {
      f.writer.publishOwnedPrepared(f.ready.handle, f.limits, f.c);
      corruptReceipt(f, mutate);
      assert.throws(() => f.api.readSelectedCoveredProjection(f.refs, f.limits, f.c, () => {}));
      assert.equal(f.db.isTransaction, false);
    });
});

test('schema11 forged handles, budget and write failures refuse with atomic rollback', async (t) => {
  await withReadyPublication(t, async (f) => {
    assert.throws(() => f.writer.publishOwnedPrepared({}, f.limits, f.c));
    assert.throws(() =>
      f.writer.publishOwnedPrepared(f.ready.handle, { ...f.limits, maxRows: 1 }, f.c),
    );
    assert.equal(f.db.prepare('SELECT count(*) n FROM knowledge_revisions').get().n, 0);
    assert.equal(f.db.isTransaction, false);
    const original = f.db.prepare.bind(f.db);
    f.db.prepare = (sql) => {
      if (sql.startsWith('INSERT INTO "publication_runs"')) throw Error('OWNED_INJECTED_FAILURE');
      return original(sql);
    };
    try {
      assert.throws(
        () => f.writer.publishOwnedPrepared(f.ready.handle, f.limits, f.c),
        /READ11_PUBLICATION_REFUSED/,
      );
    } finally {
      f.db.prepare = original;
    }
    for (const table of [
      'knowledge_items',
      'knowledge_revisions',
      'knowledge_revision_provenance',
      'publication_runs',
    ])
      assert.equal(f.db.prepare('SELECT count(*) n FROM ' + table).get().n, 0);
    assert.equal(f.db.prepare('SELECT state FROM compilation_runs').get().state, 'READY');
    assert.equal(f.db.isTransaction, false);
  });
});

test('schema11 confirmed commit survives uncertain acknowledgement and writer does not rewrite', async (t) =>
  withReadyPublication(t, async (f) => {
    const exec = f.db.exec.bind(f.db);
    f.db.exec = (sql) => {
      const result = exec(sql);
      if (sql === 'COMMIT') throw Error('OWNED_LOST_ACK');
      return result;
    };
    try {
      assert.throws(
        () => f.writer.publishOwnedPrepared(f.ready.handle, f.limits, f.c),
        (e) => e.code === 'READ11_COMMIT_OUTCOME_UNKNOWN' && e.cleanupState === 'UNKNOWN',
      );
    } finally {
      f.db.exec = exec;
    }
    assert.equal(f.db.isTransaction, false);
    assert.equal(f.db.prepare('SELECT count(*) n FROM publication_runs').get().n, 1);
    assert.equal(
      f.api.readSelectedCoveredProjection(f.refs, f.limits, f.c, () => {}).records.length,
      1,
    );
    assert.throws(
      () => f.writer.publishOwnedPrepared(f.ready.handle, f.limits, f.c),
      /READ11_UNAVAILABLE/,
    );
    assert.equal(f.db.prepare('SELECT count(*) n FROM publication_runs').get().n, 1);
  }));

test('schema11 updates keep immutable receipts and reject a stale prepared head', async (t) =>
  withReadyPublication(t, async (f) => {
    f.writer.publishOwnedPrepared(f.ready.handle, f.limits, f.c);
    const { OfflinePublicationPreparer } =
      await import('../../application/dist/offline-publication.js');
    const { offlinePublicationState } =
      await import('../../ir/dist/offline-publication-contract.js');
    const { evaluateCandidateRecord } = await import('../../application/dist/evaluation-record.js');
    const prepare = async (suffix) => {
      const request = structuredClone(f.ready.command.request);
      request.runId = 'owned-update:' + suffix;
      request.requestKey = request.runId;
      request.candidates[0].payload.structuredContent.goal += ' ' + suffix;
      request.subjects[0].candidateEnvelope = request.candidates[0];
      request.evaluation = evaluateCandidateRecord(
        {
          evaluationId: 'owned-eval:' + suffix,
          runId: request.runId,
          snapshot: request.snapshot,
          candidates: request.candidates,
        },
        f.c,
      );
      const json = (v) => canonicalCompilationJson(v, f.c);
      f.db
        .prepare(
          "INSERT INTO compilation_runs(id,workspace_id,revision_set_id,caller_subject_id,request_key,request_json,state,snapshot_id,metadata_json,created_at_ms,finished_at_ms) VALUES(?,?,?,?,?,'{}','CREATED',NULL,'{}',0,NULL)",
        )
        .run(request.runId, f.w, request.snapshot.revisionSetId, 'owned', request.requestKey);
      f.db.prepare("UPDATE compilation_runs SET state='CAPTURING' WHERE id=?").run(request.runId);
      f.db
        .prepare('UPDATE compilation_runs SET snapshot_id=? WHERE id=?')
        .run(request.snapshot.snapshotId, request.runId);
      for (const state of ['GENERATING', 'VALIDATING', 'READY'])
        f.db.prepare('UPDATE compilation_runs SET state=? WHERE id=?').run(state, request.runId);
      f.db
        .prepare(
          "INSERT INTO evaluation_runs(workspace_id,id,run_id,snapshot_id,revision_set_id,report_schema,report_version,basis_digest,baseline_ref,status,report_json) VALUES(?,?,?,?,?,'codeatlas.offline-evaluation-record',1,?,NULL,'NOT_EVALUABLE',?)",
        )
        .run(
          f.w,
          request.evaluation.evaluationId,
          request.runId,
          request.snapshot.snapshotId,
          request.snapshot.revisionSetId,
          request.snapshot.inputDigest,
          json(request.evaluation),
        );
      const preparer = new OfflinePublicationPreparer({
        lookup: () => ({ status: 'ABSENT' }),
        readState: (c) => offlinePublicationState(f.w, [f.ready.command.entries[0].record], c),
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
        ].map((k) => [k, request[k]]),
      );
      const ready = await preparer.prepare(
        input,
        {
          kind: 'TEST_REVIEW_NOT_AUTHORITY',
          review: ({ planDigest }) => ({ decision: 'APPROVED', planDigest }),
        },
        f.c,
      );
      assert.equal(ready.command.entries[0].operation, 'UPDATE');
      return {
        ready,
        writer: await openSchema11OwnedPublicationStore(f.db, f.w, preparer.identity),
      };
    };
    const next = await prepare('next'),
      stale = await prepare('stale');
    next.writer.publishOwnedPrepared(next.ready.handle, f.limits, f.c);
    assert.throws(
      () => stale.writer.publishOwnedPrepared(stale.ready.handle, f.limits, f.c),
      /READ11_HEAD_CHANGED/,
    );
    const e = next.ready.command.entries[0],
      ref = {
        itemId: e.record.itemEnvelope.payload.id,
        revisionId: e.record.revisionEnvelope.payload.id,
      };
    assert.equal(
      f.api.readSelectedCoveredProjection([ref], f.limits, f.c, () => {}).records[0].provenance
        .runId,
      'owned-update:next',
    );
    assert.throws(
      () => f.api.readSelectedCoveredProjection(f.refs, f.limits, f.c, () => {}),
      /READ11_REVISION_MISMATCH/,
    );
    assert.equal(f.db.prepare('SELECT count(*) n FROM knowledge_revisions').get().n, 2);
    assert.equal(f.db.prepare('SELECT count(*) n FROM publication_runs').get().n, 2);
    assert.equal(
      f.db.prepare('SELECT state FROM compilation_runs WHERE id=?').get('owned-update:stale').state,
      'READY',
    );
    assert.throws(() => f.db.prepare('DELETE FROM publication_runs').run(), /immutable history/);
    assert.equal(f.db.isTransaction, false);
  }));

import { Schema11KnowledgeSearchIndex } from '../dist/knowledge/offline-knowledge-search.js';
const receiptSearchPermissions = (check) => ({
  kind: 'SCHEMA11_READ_CANDIDATE_NOT_AUTHORITY',
  check,
});
function removeOwnedHead(f) {
  const row = f.db.prepare('SELECT id,payload_json FROM knowledge_items').get(),
    envelope = JSON.parse(row.payload_json);
  envelope.payload.lifecycleState = 'DRAFT';
  envelope.payload.publishedRevisionId = null;
  f.db
    .prepare(
      "UPDATE knowledge_items SET lifecycle_state='DRAFT',published_revision_id=NULL,payload_json=? WHERE id=?",
    )
    .run(canonicalCompilationJson(envelope, f.c), row.id);
}
test('receipt catalog and derived FTS retain full current lineage without source writes', async (t) =>
  withReadyPublication(t, async (f) => {
    f.writer.publishOwnedPrepared(f.ready.handle, f.limits, f.c);
    const before = f.db.prepare('SELECT total_changes() n').get().n,
      grants = [];
    const index = new Schema11KnowledgeSearchIndex(
      f.api,
      receiptSearchPermissions((m) => {
        grants.push(m);
      }),
    );
    try {
      const catalog = f.api.readCurrentCoveredProjection(f.limits, f.c, () => {});
      assert.equal(catalog.records.length, 1);
      const built = index.rebuild(f.limits, f.c),
        again = index.rebuild(f.limits, f.c);
      assert.equal(built.kind, 'SCHEMA11_RECEIPT');
      assert.equal(built.items, 1);
      assert.equal(again.contentDigest, built.contentDigest);
      const hit = index.searchPage(
        { text: 'Owned declared', types: ['BUSINESS_FLOW'], maxResults: 1 },
        f.limits,
        f.c,
      );
      assert.equal(hit.results.length, 1);
      assert.equal(hit.kind, 'SCHEMA11_RECEIPT');
      assert.equal(hit.results[0].provenance.publicationId, f.ready.command.request.runId);
      assert.equal(hit.results[0].provenance.candidateId, f.ready.command.entries[0].candidateId);
      assert.equal(hit.results[0].provenance.attemptId, undefined);
      assert.deepEqual(
        hit.results[0].coverage,
        f.ready.command.request.candidates[0].payload.coverage,
      );
      assert.ok(
        grants.every(
          (m) =>
            m.evidenceKind === 'SCHEMA11_READ_CANDIDATE_NOT_AUTHORITY' &&
            m.fields.includes('CURRENT_PUBLISHED_CATALOG'),
        ),
      );
      assert.equal(f.db.prepare('SELECT total_changes() n').get().n, before);
    } finally {
      index.close();
    }
  }));
test('receipt FTS refuses missing receipts, unbuilt state and denied complete catalog', async (t) => {
  await fixture(t, async (f) => {
    const index = new Schema11KnowledgeSearchIndex(
      f.api,
      receiptSearchPermissions(() => {}),
    );
    try {
      assert.throws(() => index.rebuild(f.limits, f.c), /INDEX_UNAVAILABLE/);
      assert.throws(
        () => index.searchPage({ text: 'Owned', types: null, maxResults: 1 }, f.limits, f.c),
        /INDEX_UNAVAILABLE/,
      );
    } finally {
      index.close();
    }
  });
  await withReadyPublication(t, async (f) => {
    f.writer.publishOwnedPrepared(f.ready.handle, f.limits, f.c);
    const index = new Schema11KnowledgeSearchIndex(
      f.api,
      receiptSearchPermissions(() => {
        throw Error('DENIED');
      }),
    );
    try {
      assert.throws(() => index.rebuild(f.limits, f.c), /PERMISSION_DENIED/);
    } finally {
      index.close();
    }
  });
});
test('receipt FTS refuses stale publication sets and rebuild drift without automatic repair', async (t) =>
  withReadyPublication(t, async (f) => {
    f.writer.publishOwnedPrepared(f.ready.handle, f.limits, f.c);
    let armed = false,
      starts = 0;
    const index = new Schema11KnowledgeSearchIndex(
      f.api,
      receiptSearchPermissions(() => {
        if (armed && !f.db.isTransaction && ++starts === 2) removeOwnedHead(f);
      }),
    );
    try {
      index.rebuild(f.limits, f.c);
      armed = true;
      assert.throws(() => index.rebuild(f.limits, f.c), /INDEX_UNAVAILABLE/);
      armed = false;
      assert.throws(
        () => index.searchPage({ text: 'Owned', types: null, maxResults: 1 }, f.limits, f.c),
        /INDEX_UNAVAILABLE/,
      );
      assert.equal(f.db.prepare('SELECT count(*) n FROM knowledge_revisions').get().n, 1);
      assert.equal(f.db.prepare('SELECT count(*) n FROM publication_runs').get().n, 1);
      assert.equal(index.rebuild(f.limits, f.c).items, 0);
      assert.deepEqual(
        index.searchPage({ text: 'Owned', types: null, maxResults: 1 }, f.limits, f.c).results,
        [],
      );
      assert.equal(f.db.isTransaction, false);
    } finally {
      index.close();
    }
  }));

test('receipt FTS retains the original ACTIVE publication admission instead of serving inactive heads', async (t) =>
  withReadyPublication(t, async (f) => {
    f.writer.publishOwnedPrepared(f.ready.handle, f.limits, f.c);
    const index = new Schema11KnowledgeSearchIndex(
      f.api,
      receiptSearchPermissions(() => {}),
    );
    try {
      index.rebuild(f.limits, f.c);
      const row = f.db.prepare('SELECT id,payload_json FROM knowledge_items').get(),
        envelope = JSON.parse(row.payload_json);
      envelope.payload.lifecycleState = 'DEPRECATED';
      f.db
        .prepare(
          "UPDATE knowledge_items SET lifecycle_state='DEPRECATED',payload_json=? WHERE id=?",
        )
        .run(canonicalCompilationJson(envelope, f.c), row.id);
      assert.throws(
        () => index.searchPage({ text: 'Owned', types: null, maxResults: 1 }, f.limits, f.c),
        /INDEX_UNAVAILABLE/,
      );
      assert.throws(() => index.rebuild(f.limits, f.c), /INDEX_UNAVAILABLE/);
    } finally {
      index.close();
    }
  }));

test('owned freshness reconciliation is a distinct private operation', async (t) => {
  await fixture(t, async ({ api }) => {
    assert.equal(typeof api.reconcileOwnedFreshness, 'function');
  });
});

import { publicationDigest } from '../../ir/dist/offline-publication-contract.js';
import { issueOwnedFreshnessCommand } from '../../ir/dist/owned-freshness-contract.js';
async function freshnessFixture(t, body) {
  return withReadyPublication(t, async (f) => {
    f.writer.publishOwnedPrepared(f.ready.handle, f.limits, f.c);
    const issuer = Object.freeze({});
    const writer = await openSchema11OwnedPublicationStore(f.db, f.w, issuer);
    const basis = writer.readOwnedFreshnessBasis(f.refs, f.limits, f.c, () => {});
    const issue = (overrides = {}) =>
      issueOwnedFreshnessCommand(
        issuer,
        {
          ruleVersion: 'owned-one-shot-freshness@1',
          workspaceId: f.w,
          selected: f.refs,
          expectedProjection: basis.projection,
          snapshots: basis.snapshots,
          basisDigest: publicationDigest(
            'codeatlas.owned-freshness.basis.v1',
            basis.snapshots,
            f.c,
          ),
          ...overrides,
        },
        () => {},
        f.c,
      );
    await body({ ...f, writer, basis, issue });
  });
}
test('owned freshness CAS changes both mutable representations, preserves immutable history and projects Wiki', async (t) =>
  freshnessFixture(t, async (f) => {
    const tables = [
      'knowledge_revisions',
      'publication_runs',
      'knowledge_revision_provenance',
      'evaluation_runs',
    ];
    const history = () => tables.map((table) => f.db.prepare('SELECT * FROM ' + table).all());
    const before = history(),
      token = f.issue();
    assert.deepEqual(
      f.writer.reconcileOwnedFreshness(token, f.limits, f.c, () => {}),
      { commitState: 'COMMITTED', cleanupState: 'SETTLED' },
    );
    assert.deepEqual(history(), before);
    const row = f.db.prepare('SELECT source_freshness,payload_json FROM knowledge_items').get();
    assert.equal(row.source_freshness, 'FRESH');
    assert.equal(JSON.parse(row.payload_json).payload.sourceFreshness, 'FRESH');
    const { projectSchema11Wiki } = await import('../../application/dist/offline-wiki.js');
    const result = await projectSchema11Wiki(
      {
        workspaceId: f.w,
        repositoryIds: f.owned.repositoryIds,
        selectedPublishedRevisionRefs: f.refs,
        customizationPolicy: 'LOCKED',
        allowPartial: true,
      },
      {
        workspaceId: f.w,
        read: async (refs, c) => f.api.readSelectedCoveredProjection(refs, f.limits, c, () => {}),
      },
      f.c,
    );
    assert.equal(result.status, 'PARTIAL');
    assert.equal(result.quality, 'NOT_EVALUABLE');
    assert.throws(
      () => f.writer.reconcileOwnedFreshness(token, f.limits, f.c, () => {}),
      /FRESHNESS_HANDLE_UNAVAILABLE/,
    );
  }));
test('owned freshness refuses copied tokens and exact old metadata CAS conflicts without retries', async (t) =>
  freshnessFixture(t, async (f) => {
    assert.throws(
      () => f.writer.reconcileOwnedFreshness({}, f.limits, f.c, () => {}),
      /FRESHNESS_HANDLE_UNAVAILABLE/,
    );
    const token = f.issue();
    const r = f.db.prepare('SELECT payload_json FROM knowledge_items').get();
    const payload = JSON.parse(r.payload_json);
    payload.payload.sourceFreshness = 'STALE';
    f.db
      .prepare('UPDATE knowledge_items SET source_freshness=?,payload_json=?')
      .run('STALE', canonicalCompilationJson(payload, f.c));
    assert.throws(
      () => f.writer.reconcileOwnedFreshness(token, f.limits, f.c, () => {}),
      /FRESHNESS_CAS_CONFLICT/,
    );
    assert.equal(
      f.db.prepare('SELECT source_freshness FROM knowledge_items').get().source_freshness,
      'STALE',
    );
    assert.equal(f.db.isTransaction, false);
    assert.throws(
      () => f.writer.reconcileOwnedFreshness(token, f.limits, f.c, () => {}),
      /FRESHNESS_HANDLE_UNAVAILABLE/,
    );
  }));
test('owned freshness rollback and lost commit acknowledgement preserve exact outcome distinctions', async (t) => {
  for (const lostAck of [false, true])
    await freshnessFixture(t, async (f) => {
      const token = f.issue(),
        exec = f.db.exec.bind(f.db),
        prepare = f.db.prepare.bind(f.db);
      if (lostAck)
        f.db.exec = (sql) => {
          const out = exec(sql);
          if (sql === 'COMMIT') throw Error('LOST_ACK');
          return out;
        };
      else
        f.db.prepare = (sql) => {
          if (sql.startsWith('UPDATE knowledge_items')) throw Error('WRITE_FAILURE');
          return prepare(sql);
        };
      try {
        assert.throws(
          () => f.writer.reconcileOwnedFreshness(token, f.limits, f.c, () => {}),
          lostAck ? /FRESHNESS_COMMIT_UNKNOWN/ : /WRITE_FAILURE/,
        );
      } finally {
        f.db.exec = exec;
        f.db.prepare = prepare;
      }
      assert.equal(
        f.db.prepare('SELECT source_freshness FROM knowledge_items').get().source_freshness,
        lostAck ? 'FRESH' : 'AFFECTED',
      );
      assert.equal(f.db.isTransaction, false);
    });
});

test('owned freshness never restores STALE even with a newly matched CAS', async (t) =>
  freshnessFixture(t, async (f) => {
    const item = JSON.parse(
      f.db.prepare('SELECT payload_json FROM knowledge_items').get().payload_json,
    );
    item.payload.sourceFreshness = 'STALE';
    f.db
      .prepare('UPDATE knowledge_items SET source_freshness=?,payload_json=?')
      .run('STALE', canonicalCompilationJson(item, f.c));
    const current = f.writer.readOwnedFreshnessBasis(f.refs, f.limits, f.c, () => {});
    assert.throws(
      () =>
        f.writer.reconcileOwnedFreshness(
          f.issue({ expectedProjection: current.projection }),
          f.limits,
          f.c,
          () => {},
        ),
      /FRESHNESS_NOT_AFFECTED/,
    );
    assert.equal(
      f.db.prepare('SELECT source_freshness FROM knowledge_items').get().source_freshness,
      'STALE',
    );
  }));

test('owned freshness refuses extra attached databases and mismatched basis seals before mutation', async (t) =>
  freshnessFixture(t, async (f) => {
    assert.throws(
      () =>
        f.writer.reconcileOwnedFreshness(
          f.issue({ basisDigest: '0'.repeat(64) }),
          f.limits,
          f.c,
          () => {},
        ),
      /FRESHNESS_BINDING_INVALID/,
    );
    f.db.exec("ATTACH DATABASE ':memory:' AS other_owned");
    try {
      assert.throws(
        () => f.writer.reconcileOwnedFreshness(f.issue(), f.limits, f.c, () => {}),
        /FRESHNESS_MEMORY_ONLY/,
      );
    } finally {
      f.db.exec('DETACH DATABASE other_owned');
    }
    assert.equal(
      f.db.prepare('SELECT source_freshness FROM knowledge_items').get().source_freshness,
      'AFFECTED',
    );
  }));

test('receipt Capability reader exposes exact captured input digests under explicit permission', async (t) =>
  withReadyPublication(t, async (f) => {
    f.writer.publishOwnedPrepared(f.ready.handle, f.limits, f.c);
    let checked = false;
    assert.throws(
      () =>
        f.api.readSelectedCapabilityInputs(f.refs, f.limits, f.c, (m) => {
          checked = true;
          assert(m.fields.includes('SNAPSHOT_INPUT_DIGEST'));
        }),
      /READ11_COMPONENT_REQUIRED/,
    );
    assert.equal(checked, true);
    assert.equal(f.db.isTransaction, false);
  }));
