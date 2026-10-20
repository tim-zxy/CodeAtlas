import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import * as storage from '../../../storage/dist/index.js';
import * as providers from '../../../providers/dist/index.js';
import { applyFullAnalysis, parseFullAnalysisSnapshot } from '../../../application/dist/index.js';
import { createNativeRefreshPreparation } from '../../dist/native-refresh-preparation.js';
import { snapshotDRefreshFixtureContext } from './native-refresh-d-context.mjs';

const sourceRoot = fileURLToPath(
  new URL('../../../../fixtures/native/java-refresh-producer/', import.meta.url),
);
const manifest = JSON.parse(await readFile(join(sourceRoot, 'fixture.json'), 'utf8'));
export const sourceTransitions = JSON.parse(
  await readFile(join(sourceRoot, 'expected/transitions.json'), 'utf8'),
).cases;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const context = {
  providerId: 'native',
  providerVersion: '0.0.0',
  language: {
    languageId: 'java',
    grammarVersion: '0.23.5',
    analyzerVersion: '0.0.0',
    compatibilityVersion: '1',
  },
  resolverVersion: '1',
  normalizerVersion: '2',
  policyFingerprint: 'fixture-policy',
};

// Test-only offline composition, not an alternate admitted product bootstrap.
// Every graph, support, snapshot and R010 write still uses Application/Store.
export function observeRefreshBaselineRead(
  db,
  expected,
  limits,
  validate = providers.validateNativeStateCandidate,
) {
  let checkpoints = 0,
    readSqlBytes = null;
  const ownership = {
    scope: 'REFRESH_READ_SQL_OWNERSHIP_ONLY',
    checkpoints: 0,
    phaseCounts: {},
    retainedSqlBytes: 0,
    retainedSqlStringChargeBytes: 0,
    returnedSqlBytes: null,
  };
  let value = null,
    error = null;
  try {
    value = storage.readNativeRefreshBaseline(
      db,
      expected,
      validate,
      limits,
      undefined,
      (bytes) => {
        assert.ok(Number.isSafeInteger(bytes) && bytes >= 0);
        assert.ok(readSqlBytes === null || bytes >= readSqlBytes);
        checkpoints++;
        readSqlBytes = bytes;
      },
      (record) => {
        assert.equal(record.scope, ownership.scope);
        ownership.checkpoints++;
        ownership.phaseCounts[record.phase] = (ownership.phaseCounts[record.phase] ?? 0) + 1;
        ownership.retainedSqlBytes = Math.max(ownership.retainedSqlBytes, record.retainedSqlBytes);
        ownership.retainedSqlStringChargeBytes = Math.max(
          ownership.retainedSqlStringChargeBytes,
          record.retainedSqlStringChargeBytes,
        );
        if (record.phase === 'RETURN') ownership.returnedSqlBytes = record.retainedSqlBytes;
      },
    );
  } catch (failure) {
    error = failure;
  }
  Object.freeze(ownership.phaseCounts);
  Object.freeze(ownership);
  return {
    value,
    error,
    diagnostic: Object.freeze({
      scope: 'REFRESH_READ_DIAGNOSTIC_ONLY',
      status: value?.status ?? 'THREW',
      reason: value?.status === 'UNAVAILABLE' ? value.reason : null,
      sqlReadFields: Object.freeze({
        scope: 'REFRESH_READ_SQL_FIELDS_ONLY',
        checkpoints,
        readSqlBytes,
      }),
      sqlReadOwnership: ownership.checkpoints ? ownership : null,
    }),
  };
}
export async function preparedSourceRefresh(
  t,
  row,
  workers = 1,
  onReadDiagnostic,
  replayRoot,
  dContext,
) {
  const fixtureContext =
    dContext === undefined ? undefined : snapshotDRefreshFixtureContext(dContext);
  let directory;
  if (replayRoot === undefined)
    directory = await mkdtemp(
      join(fixtureContext?.allowedEnvironment.TEMP ?? tmpdir(), 'codeatlas-refresh-source-'),
    );
  else {
    assert.ok(
      typeof replayRoot === 'string' &&
        isAbsolute(replayRoot) &&
        resolve(replayRoot) === replayRoot,
      'Replay root must be a canonical absolute path',
    );
    assert.equal(
      await realpath(dirname(replayRoot)),
      dirname(replayRoot),
      'Replay root parent must be a real canonical path',
    );
    // Acquire ownership exclusively; never adopt or remove a pre-existing directory.
    await mkdir(replayRoot);
    directory = replayRoot;
  }
  const databasePath = join(directory, 'repository.sqlite');
  let db;
  t.after(async () => {
    if (db?.isOpen) db.close();
    // An explicitly bound replay root belongs to its acquiring artifact owner.
    // Settle handles, but retain its seed/result evidence for that owner.
    if (replayRoot === undefined) await rm(directory, { recursive: true, force: true });
  });
  // Offline corpus owners may retain a failed generator without retaining an
  // open connection. Ordinary TestContext cleanup is unchanged.
  t.ownRefreshFixture?.({
    directory,
    close: () => {
      if (db?.isOpen) db.close();
    },
  });
  await storage.runMigrations({
    databasePath,
    databaseKind: 'REPOSITORY',
    manifestUrl: new URL('../../../storage/migrations/repository/manifest.json', import.meta.url),
  });
  db = new DatabaseSync(databasePath);
  db.prepare('INSERT INTO repository(slot,id,root_path) VALUES(1,?,?)').run(
    'repo-fixture',
    directory,
  );
  db.prepare('INSERT INTO repository_state(repository_id) VALUES(?)').run('repo-fixture');
  const options = {
    executablePath:
      fixtureContext?.executablePath ??
      fileURLToPath(
        new URL(
          `../../../../target/debug/codeatlas-native-analyzer${process.platform === 'win32' ? '.exe' : ''}`,
          import.meta.url,
        ),
      ),
    arguments: ['--parse-workers', String(workers)],
    timeoutMs: 10_000,
    allowedEnvironment:
      fixtureContext?.allowedEnvironment ??
      Object.fromEntries(
        ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
          .filter((key) => process.env[key] !== undefined)
          .map((key) => [key, process.env[key]]),
      ),
  };
  const describe = JSON.parse(
    await readFile(
      new URL('../../../../fixtures/ipc/handshake-v1/describe-v1/request.jsonl', import.meta.url),
      'utf8',
    ),
  );
  const handshake = await providers.executeNativeRequest(describe, { ...options, arguments: [] });
  const descriptor = handshake.terminal.payload;
  async function inventory(entries, role = 'SOURCE') {
    const files = [];
    for (const [name, artifact] of Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) {
      const input = join(sourceRoot, 'source', artifact);
      const generated = row.generatedSources?.[artifact];
      const raw = generated === undefined ? await readFile(input) : Buffer.from(generated);
      if (generated === undefined) await cp(input, join(directory, name));
      else await writeFile(join(directory, name), raw);
      files.push({
        id: name,
        repositoryId: 'repo-fixture',
        revisionId: 'rev-fixture',
        path: name,
        contentFingerprint: `sha256:${sha(raw)}`,
        classification: { role, provenance: 'AUTHORED', contentKind: 'TEXT' },
        languageHint: 'java',
        sensitivity: 'PUBLIC',
      });
    }
    return files;
  }
  const revisionFor = (files) => ({
    id: 'rev-fixture',
    repositoryId: 'repo-fixture',
    kind: 'WORKTREE',
    baseRevisionId: null,
    contentFingerprint: `sha256:${sha(JSON.stringify(files))}`,
  });
  const sourceStore = new storage.RepositorySourceStateStore(db);
  const files = await inventory(row.baseline);
  const revision = revisionFor(files);
  sourceStore.replace(sourceStore.load('repo-fixture'), { revision, files });
  // C defaults stay exact. Explicit D caller input is not a measured reservation.
  const resourceBudget = {
    maxDurationMs: 10_000,
    maxMemoryBytes: fixtureContext?.memoryBudgetBytes ?? 256 * 1024 * 1024,
    maxEvents: 10_000,
  };
  const limits = {
    maxSerializedBytes: 1_000_000,
    memoryBudgetBytes: resourceBudget.maxMemoryBytes,
  };
  const request = {
    protocolVersion: 3,
    requestId: 'source-bootstrap',
    sequence: 0,
    type: 'ANALYZE',
    payload: {
      irSchemaVersion: 1,
      providerSnapshotId: 'snapshot-source-bootstrap',
      repository: { id: 'repo-fixture', rootPath: directory },
      revision,
      sourceFiles: files,
      requestedCapabilities: manifest.capabilities,
      deadlineEpochMs: null,
      resourceBudget,
      analysisStateContext: context,
      baselineState: null,
    },
  };
  const expected = {
    ...context,
    repositoryId: 'repo-fixture',
    revisionId: revision.id,
    contentFingerprint: revision.contentFingerprint,
    requestedCapabilities: manifest.capabilities,
  };
  const token = storage.captureNativeActivationToken(db, expected.repositoryId);
  const full = new storage.RepositoryAnalysisStage(db, limits);
  try {
    await applyFullAnalysis(expected, {
      observeAndStage: async () => {
        const startedAt = new Date().toISOString();
        const { terminal } = await providers.streamNativeFullAnalysisV3(request, options, {
          async accept(event) {
            if (event.type === 'ANALYSIS_SUMMARY') await full.acceptNativeSummary(event.payload);
            else await full.accept(event);
          },
        });
        const snapshot = parseFullAnalysisSnapshot({
          id: request.payload.providerSnapshotId,
          repositoryId: expected.repositoryId,
          providerId: descriptor.providerId,
          providerVersion: descriptor.providerVersion,
          runtimeVersion: descriptor.runtimeVersion,
          requestedRevisionId: revision.id,
          requestedRevisionFingerprint: revision.contentFingerprint,
          startedAt,
          completedAt: new Date().toISOString(),
          capabilities: terminal.payload.capabilities,
          diagnostics: [...full.readDiagnostics()],
          outcome: terminal.payload.outcome,
        });
        assert.equal(snapshot.outcome, 'SUCCEEDED');
        full.confirmSucceeded(terminal);
        const {
          analysisStateContext: _context,
          baselineState: _baseline,
          ...payload
        } = request.payload;
        providers.normalizeStagedAnalysis(full, {
          protocolVersion: 2,
          requestId: request.requestId,
          type: 'ANALYZE',
          payload,
        });
        providers.mergeStagedAnalysis(full, snapshot);
        full.sealNativeState(
          JSON.stringify(terminal.payload.analysisState),
          expected,
          providers.validateNativeStateCandidate,
          limits,
        );
        return { outcome: snapshot.outcome, snapshot, stage: full };
      },
      factStore: {
        applyAnalysisBatch(candidate, expectedAnalysis) {
          new storage.RepositoryCanonicalFactStore(db).applyNativeAnalysisBatch(
            candidate,
            expectedAnalysis,
            token,
          );
        },
      },
    });
  } finally {
    full.close();
  }
  const baselineRelations = row.baselineRelations;
  assertSourceRelations(db, baselineRelations);
  const oldEvidence = db.prepare('SELECT * FROM evidence ORDER BY id').all();
  const targetFiles = await inventory(row.target, row.classificationChange);
  // Remove only source files owned by this generated fixture, never the workspace.
  for (const file of files) if (!row.target[file.path]) await rm(join(directory, file.path));
  const targetRevision = revisionFor(targetFiles);
  sourceStore.replace(sourceStore.load(expected.repositoryId), {
    revision: targetRevision,
    files: targetFiles,
  });
  // Reopen before preparation to prove there is no process-local bootstrap cache.
  db.close();
  db = new DatabaseSync(databasePath);
  const trustedContext = { ...expected, contentFingerprint: targetRevision.contentFingerprint };
  // Capture this one read's scalar diagnostic before preparation can throw.
  // Generated seed fixtures keep their own independent observations.
  const observed = observeRefreshBaselineRead(db, trustedContext, limits);
  const sqlReadDiagnostic = observed.diagnostic;
  onReadDiagnostic?.(sqlReadDiagnostic);
  if (observed.value === null) throw observed.error;
  const baseline = observed.value;
  const sqlReadOwnership = sqlReadDiagnostic.sqlReadOwnership;
  const invocation = {
    requestId: `source-refresh-${row.id}`,
    descriptor,
    trustedContext,
    payload: {
      irSchemaVersion: 1,
      providerSnapshotId: 'snapshot-source-refresh',
      repository: request.payload.repository,
      targetRevision,
      requestedCapabilities: manifest.capabilities,
      deadlineEpochMs: null,
      resourceBudget,
      analysisStateContext: context,
    },
  };
  const prepared = createNativeRefreshPreparation(
    invocation,
    baseline,
    resourceBudget.maxMemoryBytes,
    options,
  );
  return {
    db,
    databasePath,
    prepared,
    options,
    oldEvidence,
    targetFiles,
    targetRevision,
    sqlReadOwnership,
    sqlReadDiagnostic,
  };
}

export function assertSourceRelations(db, relations) {
  for (const want of relations ?? []) {
    const edges = db
      .prepare(
        `SELECT e.*, n.qualified_name AS target_name, u.original_hint, u.candidates_json
      FROM canonical_edges e LEFT JOIN canonical_nodes n ON n.id=e.target_node_id AND n.revision_id=e.revision_id
      LEFT JOIN unresolved_targets u ON u.edge_id=e.id AND u.revision_id=e.revision_id
      WHERE e.kind=? AND json_extract(e.source_range_json,'$.sourceFileId')=?`,
      )
      .all(want.kind.split('.')[1].toUpperCase(), want.file);
    assert.equal(edges.length, want.count);
    for (const edge of edges) {
      assert.equal(edge.resolution, want.resolution);
      if (want.hint) assert.equal(edge.original_hint, want.hint);
      const targets =
        edge.target_state === 'RESOLVED'
          ? [edge.target_name]
          : JSON.parse(edge.candidates_json).map(
              (ref) =>
                db
                  .prepare(
                    'SELECT qualified_name FROM canonical_nodes WHERE revision_id=? AND id=?',
                  )
                  .get(edge.revision_id, ref.id)?.qualified_name,
            );
      assert.deepEqual(targets.sort(), [...want.targets].sort());
    }
  }
}

export function activationImage(db) {
  return Object.fromEntries(
    [
      'canonical_nodes',
      'canonical_edges',
      'unresolved_targets',
      'evidence',
      'fact_evidence',
      'provider_fact_bindings',
      'active_support_candidates',
      'provider_snapshots',
      'analysis_coverage',
      'analysis_diagnostics',
      'native_analysis_state',
      'native_analysis_file',
      'repository_state',
    ].map((table) => [
      table,
      db
        .prepare(`SELECT * FROM ${table}`)
        .all()
        .map((row) => JSON.stringify(row))
        .sort(),
    ]),
  );
}
