import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import * as providers from '../dist/index.js';
import { RepositoryPatchStage } from '../../storage/dist/index.js';

const childHelper = fileURLToPath(new URL('./fixtures/native-client-child.mjs', import.meta.url));
const request = JSON.parse(
  await readFile(
    new URL(
      '../../../fixtures/ipc/protocol-v1/refresh-modified-file-v1/request.jsonl',
      import.meta.url,
    ),
    'utf8',
  ),
);

function options(scenario) {
  return {
    executablePath: process.execPath,
    arguments: [childHelper, scenario],
    timeoutMs: 3_000,
    allowedEnvironment: Object.fromEntries(
      ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
        .filter((name) => process.env[name] !== undefined)
        .map((name) => [name, process.env[name]]),
    ),
  };
}

test('streamNativeRefresh accepts a checksum-verified zero-event v1 patch', async () => {
  const seen = [];
  const result = await providers.streamNativeRefresh(request, options('refresh-valid'), {
    async accept(event) {
      seen.push(event.type);
    },
  });
  assert.deepEqual(seen, ['REFRESH_STARTED']);
  assert.equal(result.terminal.type, 'REFRESH_COMPLETED');
  assert.equal(result.terminal.payload.outcome, 'SUCCEEDED');
});

test('streamNativeRefresh rejects a corrupt terminal without applicable result', async () => {
  for (const [scenario, code] of [
    ['refresh-bad-checksum', 'CHECKSUM_MISMATCH'],
    ['refresh-bad-count', 'PROTOCOL_VIOLATION'],
    ['refresh-post-terminal', 'PROTOCOL_VIOLATION'],
  ]) {
    await assert.rejects(
      providers.streamNativeRefresh(request, options(scenario), { async accept() {} }),
      (error) => error instanceof providers.NativeClientError && error.code === code,
      scenario,
    );
  }
});

test('streamNativeRefresh reports a validated PARTIAL as non-applicable', async () => {
  const result = await providers.streamNativeRefresh(request, options('refresh-partial'), {
    async accept() {},
  });
  assert.equal(result.terminal.payload.outcome, 'PARTIAL');
});

test('streamNativeRefresh enforces context, sequence and bounded output', async () => {
  for (const scenario of ['refresh-wrong-context', 'refresh-sequence-drift']) {
    await assert.rejects(
      providers.streamNativeRefresh(request, options(scenario), { async accept() {} }),
      (error) =>
        error instanceof providers.NativeClientError && error.code === 'PROTOCOL_VIOLATION',
      scenario,
    );
  }
  await assert.rejects(
    providers.streamNativeRefresh(
      request,
      {
        ...options('refresh-valid'),
        limits: { maxEvents: 1 },
      },
      { async accept() {} },
    ),
    (error) =>
      error instanceof providers.NativeClientError && error.code === 'OUTPUT_LIMIT_EXCEEDED',
  );
});

test('streamNativeRefresh awaits a slow sink before delivering the next event', async () => {
  let active = 0;
  let maxActive = 0;
  const seen = [];
  await providers.streamNativeRefresh(request, options('refresh-burst'), {
    async accept(event) {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen.push(event.type);
      active--;
    },
  });
  assert.equal(maxActive, 1);
  assert.deepEqual(seen, ['REFRESH_STARTED', 'DIAGNOSTIC', 'DIAGNOSTIC']);
});

test('normalizeStagedPatch reuses canonical normalizers and persists original support candidates', async () => {
  const analysis = JSON.parse(
    await readFile(
      new URL(
        '../../../fixtures/normalization/canonical-normalization/inputs/result.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryPatchStage(db, (group) => group[0].canonical);
  try {
    const sourceFiles = analysis.events.filter((event) => event.type === 'SOURCE_FILE');
    const nodes = analysis.events.filter((event) => event.type === 'NODE');
    const edges = analysis.events.filter((event) => event.type === 'EDGE');
    for (const event of [...edges, ...nodes, ...sourceFiles]) {
      await stage.accept({
        ...event,
        type:
          event.type === 'NODE'
            ? 'UPSERT_NODE'
            : event.type === 'EDGE'
              ? 'UPSERT_EDGE'
              : event.type,
      });
    }
    const completed = structuredClone(analysis.terminal);
    completed.type = 'REFRESH_COMPLETED';
    completed.payload.counts = {
      sourceFiles: sourceFiles.length,
      upsertedNodes: nodes.length,
      removedNodes: 0,
      upsertedEdges: edges.length,
      removedEdges: 0,
      coverage: 0,
      diagnostics: 0,
    };
    stage.confirmSucceeded(completed);
    const patchRequest = {
      ...analysis.request,
      type: 'REFRESH',
      payload: {
        ...analysis.request.payload,
        baseRevisionId: analysis.request.payload.revision.id,
        baseRevisionFingerprint: 'old-worktree-fingerprint',
        targetRevision: analysis.request.payload.revision,
        changes: { added: [], modified: analysis.request.payload.sourceFiles, deleted: [] },
      },
    };
    delete patchRequest.payload.revision;
    delete patchRequest.payload.sourceFiles;
    const snapshot = {
      id: patchRequest.payload.providerSnapshotId,
      repositoryId: patchRequest.payload.repository.id,
      providerId: 'native',
      providerVersion: '1',
      runtimeVersion: '1',
      requestedRevisionId: patchRequest.payload.targetRevision.id,
      requestedRevisionFingerprint: patchRequest.payload.targetRevision.contentFingerprint,
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      capabilities: completed.payload.capabilities,
      diagnostics: [],
      outcome: 'SUCCEEDED',
    };
    providers.normalizeStagedPatch(stage, patchRequest, snapshot);
    const expected = providers.normalizeNativeAnalysis(analysis);
    assert.deepEqual([...stage.readNormalizedNodes()], expected.nodes);
    assert.deepEqual([...stage.readNormalizedEdges()], expected.edges);
    const supports = [...stage.readSupports()];
    assert.equal(supports.length, nodes.length + edges.length);
    assert.ok(
      supports.every((support) => support.canonical.id === support.binding.canonicalFact.id),
    );
  } finally {
    stage.close();
    db.close();
  }
});

test('normalizeStagedPatch resolves an upserted edge against retained active Provider nodes', async () => {
  const analysis = JSON.parse(
    await readFile(
      new URL(
        '../../../fixtures/normalization/canonical-normalization/inputs/result.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const normalized = providers.normalizeNativeAnalysis(analysis);
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE evidence (id TEXT PRIMARY KEY, repository_id TEXT, revision_id TEXT, status TEXT);
    CREATE TABLE provider_fact_bindings (evidence_id TEXT, fact_type TEXT, provider_id TEXT, provider_fact_id TEXT);
    CREATE TABLE active_support_candidates (evidence_id TEXT, candidate_json TEXT);
  `);
  const insertEvidence = db.prepare('INSERT INTO evidence VALUES (?, ?, ?, ?)');
  const insertBinding = db.prepare('INSERT INTO provider_fact_bindings VALUES (?, ?, ?, ?)');
  const insertCandidate = db.prepare('INSERT INTO active_support_candidates VALUES (?, ?)');
  for (const [index, node] of normalized.nodes.entries()) {
    const id = `old-evidence-${index}`;
    insertEvidence.run(id, node.canonical.repositoryId, node.canonical.revisionId, 'ACTIVE');
    insertBinding.run(id, 'NODE', node.provider.providerId, node.provider.providerFactId);
    insertCandidate.run(id, JSON.stringify(node.canonical));
  }
  const stage = new RepositoryPatchStage(db, (group) => group[0].canonical);
  try {
    const files = analysis.events.filter((event) => event.type === 'SOURCE_FILE');
    const edges = analysis.events.filter((event) => event.type === 'EDGE');
    for (const event of [...edges, ...files]) {
      await stage.accept({ ...event, type: event.type === 'EDGE' ? 'UPSERT_EDGE' : event.type });
    }
    const completed = structuredClone(analysis.terminal);
    completed.type = 'REFRESH_COMPLETED';
    completed.payload.counts = {
      sourceFiles: files.length,
      upsertedNodes: 0,
      removedNodes: 0,
      upsertedEdges: edges.length,
      removedEdges: 0,
      coverage: 0,
      diagnostics: 0,
    };
    stage.confirmSucceeded(completed);
    const patchRequest = {
      ...analysis.request,
      type: 'REFRESH',
      payload: {
        ...analysis.request.payload,
        baseRevisionId: analysis.request.payload.revision.id,
        baseRevisionFingerprint: 'old-worktree-fingerprint',
        targetRevision: analysis.request.payload.revision,
        changes: { added: [], modified: analysis.request.payload.sourceFiles, deleted: [] },
      },
    };
    delete patchRequest.payload.revision;
    delete patchRequest.payload.sourceFiles;
    const snapshot = {
      id: patchRequest.payload.providerSnapshotId,
      repositoryId: patchRequest.payload.repository.id,
      providerId: 'native',
      providerVersion: '1',
      runtimeVersion: '1',
      requestedRevisionId: patchRequest.payload.targetRevision.id,
      requestedRevisionFingerprint: patchRequest.payload.targetRevision.contentFingerprint,
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      capabilities: completed.payload.capabilities,
      diagnostics: [],
      outcome: 'SUCCEEDED',
    };
    providers.normalizeStagedPatch(stage, patchRequest, snapshot);
    assert.deepEqual([...stage.readNormalizedEdges()], normalized.edges);
    assert.equal([...stage.readNormalizedNodes()].length, 0);
  } finally {
    stage.close();
    db.close();
  }
});

test('normalizeStagedPatch requires the exact changed SOURCE_FILE event, not a persisted fallback', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE source_files (
    revision_id TEXT, id TEXT, repository_id TEXT, path TEXT, content_fingerprint TEXT,
    role TEXT, provenance TEXT, content_kind TEXT, language_hint TEXT, sensitivity TEXT
  )`);
  const file = request.payload.changes.modified[0];
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
  const stage = new RepositoryPatchStage(db, (group) => group[0].canonical);
  try {
    await stage.accept({
      type: 'SOURCE_FILE',
      payload: { ...file, id: 'unexpected', path: 'src/Unexpected.java' },
    });
    stage.confirmSucceeded({
      type: 'REFRESH_COMPLETED',
      payload: {
        providerSnapshotId: request.payload.providerSnapshotId,
        repositoryId: request.payload.repository.id,
        revisionId: request.payload.targetRevision.id,
        revisionFingerprint: request.payload.targetRevision.contentFingerprint,
        outcome: 'SUCCEEDED',
        counts: {
          sourceFiles: 1,
          upsertedNodes: 0,
          removedNodes: 0,
          upsertedEdges: 0,
          removedEdges: 0,
          coverage: 0,
          diagnostics: 0,
        },
      },
    });
    const snapshot = {
      id: request.payload.providerSnapshotId,
      repositoryId: request.payload.repository.id,
      providerId: 'native',
      providerVersion: '1',
      runtimeVersion: '1',
      requestedRevisionId: request.payload.targetRevision.id,
      requestedRevisionFingerprint: request.payload.targetRevision.contentFingerprint,
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      capabilities: [],
      diagnostics: [],
      outcome: 'SUCCEEDED',
    };
    assert.throws(() => providers.normalizeStagedPatch(stage, request, snapshot), /Changed source/);
  } finally {
    stage.close();
    db.close();
  }
});

test('normalizeStagedPatch rejects a removal from a different Provider', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE evidence (id TEXT, repository_id TEXT, revision_id TEXT, status TEXT);
    CREATE TABLE provider_fact_bindings (evidence_id TEXT, fact_type TEXT, provider_id TEXT, provider_fact_id TEXT);
    INSERT INTO evidence VALUES ('old-evidence', 'repo-a', 'rev-b', 'ACTIVE');
    INSERT INTO provider_fact_bindings VALUES ('old-evidence', 'NODE', 'other', 'old-node');
  `);
  const stage = new RepositoryPatchStage(db, (group) => group[0].canonical);
  try {
    await stage.accept({ type: 'SOURCE_FILE', payload: request.payload.changes.modified[0] });
    await stage.accept({
      type: 'REMOVE_NODE',
      payload: { factType: 'NODE', providerId: 'other', providerFactId: 'old-node' },
    });
    stage.confirmSucceeded({
      type: 'REFRESH_COMPLETED',
      payload: {
        providerSnapshotId: request.payload.providerSnapshotId,
        repositoryId: 'repo-a',
        revisionId: 'rev-b',
        revisionFingerprint: 'rev-fp-b',
        outcome: 'SUCCEEDED',
        counts: {
          sourceFiles: 1,
          upsertedNodes: 0,
          removedNodes: 1,
          upsertedEdges: 0,
          removedEdges: 0,
          coverage: 0,
          diagnostics: 0,
        },
      },
    });
    const snapshot = {
      id: request.payload.providerSnapshotId,
      repositoryId: 'repo-a',
      providerId: 'native',
      providerVersion: '1',
      runtimeVersion: '1',
      requestedRevisionId: 'rev-b',
      requestedRevisionFingerprint: 'rev-fp-b',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      capabilities: [],
      diagnostics: [],
      outcome: 'SUCCEEDED',
    };
    assert.throws(
      () => providers.normalizeStagedPatch(stage, request, snapshot),
      /Mixed Providers/,
    );
  } finally {
    stage.close();
    db.close();
  }
});
