import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { control, canonical } from './helpers/captured-integration-fixture.mjs';
import {
  sampleSet,
  approve,
  limits,
} from '../../storage/test/helpers/offline-publication-fixture.mjs';
import { OfflinePublicationPreparer } from '../dist/offline-publication.js';
import { initializeOfflinePublicationStore } from '../../storage/dist/knowledge/offline-publication-store.js';
import { OfflineWikiProjector } from '../dist/offline-wiki.js';

const vectors = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/phase1/knowledge-identity/inputs.json', import.meta.url),
    'utf8',
  ),
);
const refOf = (row) => ({
  itemId: row.itemEnvelope.payload.id,
  revisionId: row.revisionEnvelope.payload.id,
});
const sortRefs = (refs) =>
  [...refs].sort((a, b) =>
    a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : a.revisionId < b.revisionId ? -1 : 1,
  );
// Explicit synthetic owned query data; these fixture records establish no real
// publication, Source freshness, semantic quality or production permission.
function syntheticRecords() {
  return vectors.subjects.map((vector) => {
    const existing = structuredClone(vector.existing),
      item = existing.itemEnvelope.payload,
      revision = existing.revisionEnvelope.payload;
    item.id = 'owned-item:' + vector.name;
    revision.id = 'owned-revision:' + vector.name;
    revision.itemId = item.id;
    item.publishedRevisionId = revision.id;
    const refs = [],
      supports = [];
    const collect = (value) => {
      if (!value || typeof value !== 'object') return;
      if ((value.scope === 'REPOSITORY' || value.scope === 'WORKSPACE') && value.entity)
        refs.push(value);
      if (Array.isArray(value.supportRefs)) supports.push(...value.supportRefs);
      for (const child of Object.values(value)) collect(child);
    };
    collect(revision);
    for (const support of supports) {
      const basis = support.basis;
      refs.push(
        'repositoryId' in basis
          ? { scope: 'REPOSITORY', repositoryId: basis.repositoryId, entity: support.entity }
          : { scope: 'WORKSPACE', workspaceId: 'workspace:one', entity: support.entity },
      );
    }
    const referenceContext = {
      availableEntities: existing.referenceContext.availableEntities.filter((ref) =>
        refs.some((selected) => canonical(selected) === canonical(ref)),
      ),
      availableSupports: existing.referenceContext.availableSupports.filter((ref) =>
        supports.some((selected) => canonical(selected) === canonical(ref)),
      ),
    };
    return {
      itemEnvelope: existing.itemEnvelope,
      revisionEnvelope: existing.revisionEnvelope,
      referenceContext,
      coverage: structuredClone(vector.candidate.candidateEnvelope.payload.coverage),
      provenance: {
        attemptId: 'owned-attempt:' + vector.name,
        runId: revision.compilationRunId,
        snapshotId: revision.inputSnapshotRef.id,
        revisionSetId: revision.revisionSetId,
        evaluationId: revision.evaluationRef.id,
      },
      currentHeadRevisionId: revision.id,
      isCurrentHead: true,
      warnings: ['LIVE_SOURCE_NOT_OBSERVED'],
    };
  });
}
function requestFor(records, allowPartial = false) {
  return {
    workspaceId: 'workspace:one',
    repositoryIds: ['repo:one'],
    selectedPublishedRevisionRefs: records.map(refOf),
    customizationPolicy: 'LOCKED',
    allowPartial,
  };
}
function queryResult(records, workspaceId = 'workspace:one') {
  return {
    kind: 'OWNED_TEST_PUBLICATION',
    workspaceId,
    selectionDigest: createHash('sha256')
      .update(
        'codeatlas.offline-knowledge.selection.v1\0' +
          canonical({ workspaceId, refs: sortRefs(records.map(refOf)) }),
      )
      .digest('hex'),
    records: structuredClone(records),
    productionQuery: 'NOT_AUTHORIZED',
    quality: 'NOT_EVALUABLE',
  };
}
function harness(records = syntheticRecords()) {
  let callback = null,
    calls = 0;
  const query = async (exactRequest, c) => {
    calls++;
    assert.ok(c.signal instanceof AbortSignal);
    if (callback) return callback(exactRequest, c);
    assert.equal(exactRequest.workspaceId, 'workspace:one');
    assert.deepEqual(exactRequest.repositoryIds, ['repo:one']);
    const selected = exactRequest.selectedPublishedRevisionRefs;
    return queryResult(
      records.filter((row) =>
        selected.some(
          (ref) =>
            ref.itemId === row.itemEnvelope.payload.id &&
            ref.revisionId === row.revisionEnvelope.payload.id,
        ),
      ),
    );
  };
  const ports = { knowledgeQuery: query },
    projector = new OfflineWikiProjector(ports);
  return {
    records,
    projector,
    ports,
    get calls() {
      return calls;
    },
    setQuery(fn) {
      callback = fn;
    },
  };
}

test('locked five-type projection creates once, ignores order and retains immutable historical artifacts', async () => {
  const h = harness(),
    c = control(),
    request = requestFor(h.records),
    first = await h.projector.project(request, c);
  assert.equal(first.projection.status, 'COMPLETE');
  assert.equal(first.artifactEffect, 'CREATED');
  assert.ok(first.artifact.artifactRevisionId);
  assert.match(first.projection.contentFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(typeof first.projection.markdown, 'string');
  assert.ok(first.projection.markdown.length > 0);
  assert.ok(first.projection.provenance);
  assert.deepEqual(h.projector.getCurrent(), first.artifact);
  const original = structuredClone(first.artifact),
    reordered = {
      ...request,
      selectedPublishedRevisionRefs: [...request.selectedPublishedRevisionRefs].reverse(),
    };
  const unchanged = await h.projector.project(reordered, c);
  assert.equal(unchanged.artifactEffect, 'UNCHANGED');
  assert.equal(unchanged.artifact.artifactRevisionId, original.artifactRevisionId);
  assert.equal(unchanged.projection.contentFingerprint, first.projection.contentFingerprint);
  const row = h.records[0],
    oldId = row.revisionEnvelope.payload.id;
  row.revisionEnvelope.payload.id = oldId + ':next';
  row.revisionEnvelope.payload.previousRevisionId = oldId;
  row.itemEnvelope.payload.publishedRevisionId = row.revisionEnvelope.payload.id;
  row.currentHeadRevisionId = row.revisionEnvelope.payload.id;
  const next = await h.projector.project(requestFor(h.records), c);
  assert.equal(next.artifactEffect, 'CREATED');
  assert.notEqual(next.artifact.artifactRevisionId, original.artifactRevisionId);
  assert.notEqual(next.projection.contentFingerprint, first.projection.contentFingerprint);
  assert.deepEqual(h.projector.getRevision(original.artifactRevisionId), original);
  assert.deepEqual(h.projector.getCurrent(), next.artifact);
});

test('query failure and late cancellation preserve the prior current artifact', async () => {
  const h = harness(),
    c = control(),
    request = requestFor(h.records),
    first = await h.projector.project(request, c);
  h.setQuery(() => {
    throw Error('owned query failure');
  });
  await assert.rejects(() => h.projector.project(request, c));
  assert.deepEqual(h.projector.getCurrent(), first.artifact);
  const abort = new AbortController();
  h.setQuery(() => {
    abort.abort();
    return queryResult(h.records);
  });
  await assert.rejects(() => h.projector.project(request, { ...c, signal: abort.signal }));
  assert.deepEqual(h.projector.getCurrent(), first.artifact);
  assert.deepEqual(h.projector.getRevision(first.artifact.artifactRevisionId), first.artifact);
});

test('fixed query port cannot be replaced after construction', async () => {
  const h = harness();
  h.ports.knowledgeQuery = () => {
    throw Error('replaced callback must not run');
  };
  const result = await h.projector.project(requestFor(h.records), control());
  assert.equal(result.artifactEffect, 'CREATED');
  assert.equal(h.calls, 1);
});

test('a projector bound to its first valid scope rejects foreign scope before querying or exposing an artifact', async () => {
  const h = harness(),
    c = control(),
    request = requestFor(h.records);
  const first = await h.projector.project(request, c),
    calls = h.calls;
  for (const patch of [
    { workspaceId: 'foreign-workspace' },
    { repositoryIds: ['foreign-repository'] },
  ]) {
    await assert.rejects(() =>
      h.projector.project(
        {
          ...request,
          ...patch,
          selectedPublishedRevisionRefs: [],
        },
        c,
      ),
    );
    assert.equal(h.calls, calls);
    assert.deepEqual(h.projector.getCurrent(), first.artifact);
    assert.deepEqual(h.projector.getRevision(first.artifact.artifactRevisionId), first.artifact);
  }
});

test('deferred query excludes concurrent projection and releases ownership for subsequent calls', async () => {
  const h = harness(),
    c = control(),
    first = await h.projector.project(requestFor(h.records), c);
  const original = structuredClone(first.artifact),
    row = h.records[0],
    oldId = row.revisionEnvelope.payload.id;
  row.revisionEnvelope.payload.id = oldId + ':concurrent-next';
  row.revisionEnvelope.payload.previousRevisionId = oldId;
  row.itemEnvelope.payload.publishedRevisionId = row.revisionEnvelope.payload.id;
  row.currentHeadRevisionId = row.revisionEnvelope.payload.id;
  let release, started;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  h.setQuery(() => {
    started();
    return waiting;
  });
  const request = requestFor(h.records),
    pending = h.projector.project(request, c);
  await entered;
  assert.deepEqual(h.projector.getCurrent(), original);
  await assert.rejects(() => h.projector.project(request, c), { code: 'WIKI_PROJECTION_BUSY' });
  release(queryResult(h.records));
  const completed = await pending;
  assert.equal(completed.artifactEffect, 'CREATED');
  assert.notEqual(completed.artifact.artifactRevisionId, original.artifactRevisionId);
  h.setQuery(() => queryResult(h.records));
  const repeated = await h.projector.project(request, c);
  assert.equal(repeated.artifactEffect, 'UNCHANGED');
  assert.equal(repeated.artifact.artifactRevisionId, completed.artifact.artifactRevisionId);
  assert.deepEqual(h.projector.getCurrent(), completed.artifact);
  assert.deepEqual(h.projector.getRevision(original.artifactRevisionId), original);
  assert.deepEqual(
    h.projector.getRevision(completed.artifact.artifactRevisionId),
    completed.artifact,
  );
});

test('substituted scope, missing duplicate or substituted members and broken provenance refuse as a whole', async () => {
  const h = harness(),
    c = control(),
    request = requestFor(h.records),
    first = await h.projector.project(request, c);
  for (const change of [
    (value) => {
      value.workspaceId = 'foreign-workspace';
    },
    (value) => {
      value.records[0].itemEnvelope.payload.scope.repositoryId = 'foreign-repository';
    },
    (value) => {
      value.records.pop();
    },
    (value) => {
      value.records[1] = structuredClone(value.records[0]);
    },
    (value) => {
      value.records[0].revisionEnvelope.payload.id = 'substituted-revision';
    },
    (value) => {
      value.records[0].provenance.runId = 'substituted-run';
    },
  ]) {
    const value = queryResult(h.records);
    change(value);
    h.setQuery(() => value);
    await assert.rejects(() => h.projector.project(request, c));
    assert.deepEqual(h.projector.getCurrent(), first.artifact);
  }
});

test('LOCKED policy and strict unique selection validate before any knowledge query', async () => {
  const h = harness(),
    c = control(),
    request = requestFor(h.records);
  for (const patch of [
    { customizationPolicy: 'PROFILE_CONFIG' },
    { customizationPolicy: 'EXTENSION' },
    { sections: [] },
    { allowPartial: 'yes' },
    {
      selectedPublishedRevisionRefs: [
        request.selectedPublishedRevisionRefs[0],
        request.selectedPublishedRevisionRefs[0],
      ],
    },
    {
      selectedPublishedRevisionRefs: [{ ...request.selectedPublishedRevisionRefs[0], extra: true }],
    },
  ])
    await assert.rejects(() => h.projector.project({ ...request, ...patch }, c));
  assert.equal(h.calls, 0);
  assert.equal(h.projector.getCurrent(), null);
});

test('partial permission permits only optional gaps and cannot override required, review or stale status', async () => {
  const h = harness(),
    c = control(),
    first = await h.projector.project(requestFor(h.records), c);
  const onlyComponent = h.records.filter((row) => row.itemEnvelope.payload.type === 'COMPONENT');
  h.setQuery(() => queryResult(onlyComponent));
  const blocked = await h.projector.project(requestFor(onlyComponent, false), c);
  assert.equal(blocked.projection.status, 'PARTIAL');
  assert.equal(blocked.artifactEffect, 'NOT_WRITTEN');
  assert.deepEqual(h.projector.getCurrent(), first.artifact);
  const allowed = await h.projector.project(requestFor(onlyComponent, true), c);
  assert.equal(allowed.projection.status, 'PARTIAL');
  assert.equal(allowed.artifactEffect, 'CREATED');
  const prior = structuredClone(h.projector.getCurrent());
  for (const mode of ['required', 'unsupported', 'review', 'stale']) {
    const rows = mode === 'required' ? [] : structuredClone(h.records);
    if (mode === 'unsupported')
      rows[0].coverage = {
        status: 'UNSUPPORTED',
        limitations: ['synthetic unsupported coverage'],
        unverifiedRefs: [],
      };
    if (mode === 'review') rows[0].itemEnvelope.payload.compilationCurrency = 'OUTDATED_WORKFLOW';
    if (mode === 'stale') {
      rows[0].itemEnvelope.payload.sourceFreshness = 'STALE';
      rows[0].warnings.push('STALE');
    }
    h.setQuery(() => queryResult(rows));
    const result = await h.projector.project(requestFor(rows, true), c);
    assert.equal(
      result.projection.status,
      mode === 'review' ? 'REVIEW_REQUIRED' : mode === 'stale' ? 'STALE' : 'MISSING_DATA',
    );
    assert.equal(result.artifactEffect, 'NOT_WRITTEN');
    assert.ok(result.projection.diagnostics.length > 0);
    assert.deepEqual(h.projector.getCurrent(), prior);
  }
});

test('real owned publication query remains AFFECTED and cannot create a fresh Wiki artifact or change canonical history', async (t) => {
  const f = sampleSet(),
    db = new DatabaseSync(':memory:');
  t.after(() => {
    if (db.isOpen) db.close();
  });
  let store;
  const preparer = new OfflinePublicationPreparer({
    lookup: (subject, key, digest, c) => store.lookup(subject, key, digest, limits, c),
    readState: (c) => store.readState(limits, c),
  });
  store = initializeOfflinePublicationStore(db, 'w', limits, f.c, preparer.identity);
  const ready = await preparer.prepare(f.input, approve, f.c),
    attempt = store.begin(ready.handle, limits, f.c);
  store.publish(attempt.handle, limits, f.c);
  const history = () =>
    ['offline_attempts', 'offline_revisions', 'offline_receipts', 'offline_heads'].map((table) =>
      db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    );
  const before = history();
  let queries = 0;
  const projector = new OfflineWikiProjector({
    knowledgeQuery: async (request, c) => {
      queries++;
      return store.readPublishedKnowledge(
        request.selectedPublishedRevisionRefs,
        { kind: 'TEST_KNOWLEDGE_READ_NOT_AUTHORITY', check() {} },
        limits,
        c,
      );
    },
  });
  const result = await projector.project(
    {
      workspaceId: 'w',
      repositoryIds: ['r'],
      selectedPublishedRevisionRefs: ready.command.entries.map((entry) => refOf(entry.record)),
      customizationPolicy: 'LOCKED',
      allowPartial: true,
    },
    f.c,
  );
  assert.equal(queries, 1);
  assert.equal(result.projection.status, 'STALE');
  assert.equal(result.artifactEffect, 'NOT_WRITTEN');
  assert.equal(projector.getCurrent(), null);
  assert.deepEqual(history(), before);
});
