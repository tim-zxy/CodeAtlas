import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as storage from '../dist/index.js';
import { RepositoryPatchStage } from '../dist/index.js';
import {
  mergeStagedAnalysis,
  normalizeStagedAnalysis,
  normalizeStagedPatch,
  normalizeNativeAnalysis,
  validateNativeStateCandidate,
  validateNativeRefreshOverlay,
} from '../../providers/dist/index.js';
import { selectMergedGroup } from '../../providers/dist/fact-merger-selection.js';
import { normalizeJavaNode } from '../../providers/dist/java-node-normalizer.js';
import * as patchNormalization from '../../providers/dist/staged-patch.js';
import { baseCase, stateDigest } from '../../providers/test/helpers/native-full-v3-corpus.mjs';

const limits = { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 16 * 1024 * 1024 };
// Mechanical Storage retention checks only. Provider semantic/overlay acceptance
// must validate the complete summary contract at the separate seal port.
const summary = (id, path) => ({
  schemaVersion: 1,
  sourceFile: { id, path, contentFingerprint: 'file-fp' },
  symbols: [],
  relationSites: [],
  diagnostics: [],
  coverage: [],
  emittedFacts: [],
});
function setup(t, budget = limits) {
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryPatchStage(db, (group) => group[0].canonical, budget);
  t.after(() => {
    stage.close();
    db.close();
  });
  return { db, stage };
}
function complete(stage) {
  stage.confirmSucceeded({
    type: 'REFRESH_COMPLETED',
    payload: {
      outcome: 'SUCCEEDED',
      repositoryId: 'repo',
      revisionId: 'worktree',
      revisionFingerprint: 'fp',
      providerSnapshotId: 'snapshot',
      counts: {
        sourceFiles: 0,
        upsertedNodes: 0,
        removedNodes: 0,
        upsertedEdges: 0,
        removedEdges: 0,
        coverage: 0,
        diagnostics: 0,
      },
    },
  });
}

test('complete summary retention is independent of changed SOURCE_FILE events', async (t) => {
  const { db, stage } = setup(t);
  const retained = summary('unchanged', 'A.java'),
    empty = summary('empty', 'Empty.java');
  await stage.acceptNativeSummary(retained);
  await stage.acceptNativeSummary(empty);
  retained.sourceFile.path = 'caller-mutation.java';
  assert.equal(db.prepare('SELECT count(*) AS n FROM temp.patch_event').get().n, 0);
  const rows = db
    .prepare('SELECT source_path, summary_json FROM temp.patch_native_summary ORDER BY source_path')
    .all();
  assert.deepEqual(
    rows.map((r) => r.source_path),
    ['A.java', 'Empty.java'],
  );
  assert.deepEqual(JSON.parse(rows[1].summary_json).emittedFacts, []);
  assert.equal(JSON.parse(rows[0].summary_json).sourceFile.path, 'A.java');
});

test('native summaries require owned valid limits and cannot activate through legacy Apply', async (t) => {
  const { db, stage } = setup(t);
  const legacyDb = new DatabaseSync(':memory:');
  const legacy = new RepositoryPatchStage(legacyDb, (group) => group[0].canonical);
  t.after(() => {
    legacy.close();
    legacyDb.close();
  });
  await assert.rejects(legacy.acceptNativeSummary(summary('file', 'A.java')), /limits/i);
  complete(stage);
  assert.throws(
    () =>
      stage.assertApplicable(db, {
        repositoryId: 'repo',
        revisionId: 'worktree',
        contentFingerprint: 'fp',
        snapshotId: 'snapshot',
      }),
    /seal/i,
  );
  await assert.rejects(stage.acceptNativeSummary(summary('late', 'Late.java')), /complete/i);
});

test('summary byte equality passes and one byte over or duplicate source refuses without retention', async (t) => {
  const value = summary('file', 'A.java');
  const bytes = Buffer.byteLength(JSON.stringify(value));
  const ownedLimits = { ...limits, maxSerializedBytes: bytes };
  const { db, stage } = setup(t, ownedLimits);
  ownedLimits.maxSerializedBytes = 1_000_000;
  await stage.acceptNativeSummary(value);
  await assert.rejects(stage.acceptNativeSummary(summary('other', 'Other.java')), /resource/i);
  const other = setup(t, { ...limits, maxSerializedBytes: bytes - 1 });
  await assert.rejects(other.stage.acceptNativeSummary(value), /resource/i);
  assert.equal(other.db.prepare('SELECT count(*) AS n FROM temp.patch_native_summary').get().n, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM temp.patch_native_summary').get().n, 1);
  const duplicate = setup(t);
  await duplicate.stage.acceptNativeSummary(value);
  await assert.rejects(duplicate.stage.acceptNativeSummary(value), /UNIQUE/i);
  await assert.rejects(
    duplicate.stage.acceptNativeSummary({
      ...value,
      sourceFile: { ...value.sourceFile, id: 'other' },
    }),
    /UNIQUE/i,
  );
  assert.equal(
    duplicate.db.prepare('SELECT count(*) AS n FROM temp.patch_native_summary').get().n,
    1,
  );
});

test('unknown summaries refuse before accessors, unbounded strings and insufficient retained-string budget', async (t) => {
  const { db, stage } = setup(t);
  let calls = 0;
  const accessor = {
    get sourceFile() {
      calls++;
      throw Error('getter must not execute');
    },
  };
  const cyclic = {};
  cyclic.self = cyclic;
  for (const value of [accessor, cyclic, { x: undefined }, new Date()])
    await assert.rejects(stage.acceptNativeSummary(value), /JSON/i);
  await assert.rejects(stage.acceptNativeSummary({ unknown: 'x'.repeat(1_000_001) }), /resource/i);
  assert.equal(calls, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM temp.patch_native_summary').get().n, 0);
  const value = summary('file', 'A.java');
  const small = setup(t, {
    ...limits,
    memoryBudgetBytes: 2 * Buffer.byteLength(JSON.stringify(value)),
  });
  await assert.rejects(small.stage.acceptNativeSummary(value), /resource/i);
  assert.equal(small.db.prepare('SELECT count(*) AS n FROM temp.patch_native_summary').get().n, 0);
});

test('legacy categorical coverage remains strict instead of accepting v3 statistics', async (t) => {
  const { stage } = setup(t);
  const coverage = {
    capability: 'SYMBOL',
    sourceFileId: null,
    support: 'SUPPORTED',
    coverage: 'COMPLETE',
  };
  await assert.rejects(
    stage.accept({
      type: 'COVERAGE',
      payload: {
        ...coverage,
        statistics: {
          eligibleSites: 0,
          coveredSites: 0,
          unsupportedSites: 0,
          partialSites: 0,
          resolutionCounts: { EXACT: 0, HEURISTIC: 0, AMBIGUOUS: 0, UNRESOLVED: 0, UNSUPPORTED: 0 },
        },
      },
    }),
    /coverage/i,
  );
  await stage.accept({ type: 'COVERAGE', payload: coverage });
  assert.deepEqual([...stage.readCoverage()], [coverage]);
});

const nativeCoverage = () => ({
  capability: 'SYMBOL',
  sourceFileId: 'file',
  support: 'SUPPORTED',
  coverage: 'COMPLETE',
  statistics: {
    eligibleSites: 1,
    coveredSites: 1,
    unsupportedSites: 0,
    partialSites: 0,
    resolutionCounts: { EXACT: 0, HEURISTIC: 0, AMBIGUOUS: 0, UNRESOLVED: 0, UNSUPPORTED: 0 },
  },
});

test('separate native observation path retains owned statistics without weakening legacy coverage', async (t) => {
  const { stage } = setup(t);
  assert.equal(typeof stage.acceptNativeEvent, 'function');
  const coverage = nativeCoverage();
  await stage.acceptNativeEvent({ type: 'COVERAGE', payload: coverage });
  coverage.statistics.coveredSites = 999;
  assert.deepEqual([...stage.readNativeCoverage()], [nativeCoverage()]);
  assert.throws(() => [...stage.readCoverage()], /coverage/i);
  for (const mutate of [
    (c) => delete c.statistics,
    (c) => (c.statistics.eligibleSites = 2),
    (c) => (c.statistics.resolutionCounts.EXACT = -1),
    (c) => (c.statistics.resolutionCounts.extra = 0),
    (c) => (c.statistics.extra = 0),
    (c) => (c.extra = 0),
  ]) {
    const bad = nativeCoverage();
    mutate(bad);
    await assert.rejects(
      stage.acceptNativeEvent({ type: 'COVERAGE', payload: bad }),
      /coverage|statistics/i,
    );
  }
});

test('native event admission refuses before accessors and oversized payload retention', async (t) => {
  const { db, stage } = setup(t);
  assert.equal(typeof stage.acceptNativeEvent, 'function');
  let calls = 0;
  await assert.rejects(
    stage.acceptNativeEvent({
      type: 'DIAGNOSTIC',
      get payload() {
        calls++;
        throw Error('getter');
      },
    }),
    /JSON/i,
  );
  await assert.rejects(
    stage.acceptNativeEvent({
      type: 'DIAGNOSTIC',
      payload: {
        code: 'NOTICE',
        severity: 'INFO',
        message: 'x'.repeat(1_000_001),
        sourceRange: null,
      },
    }),
    /resource/i,
  );
  assert.equal(calls, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM temp.patch_event').get().n, 0);
});

test('native stage accounts duplicated SQL columns and summary/event overlap before insert', async (t) => {
  const retained = summary('file', 'A.java');
  const summaryBytes =
    Buffer.byteLength(JSON.stringify(retained)) + Buffer.byteLength('fileA.javafile-fp');
  const diagnostic = { code: 'N', severity: 'INFO', message: 'bounded', sourceRange: null };
  const eventBytes =
    Buffer.byteLength(JSON.stringify(diagnostic)) + Buffer.byteLength('DIAGNOSTIC');
  const exact = setup(t, { ...limits, memoryBudgetBytes: 2 * (summaryBytes + eventBytes) });
  assert.equal(typeof exact.stage.acceptNativeEvent, 'function');
  await exact.stage.acceptNativeSummary(retained);
  await exact.stage.acceptNativeEvent({ type: 'DIAGNOSTIC', payload: diagnostic });
  assert.equal(exact.stage.preflightNativeRows().retainedSqlBytes, summaryBytes + eventBytes);
  const short = setup(t, { ...limits, memoryBudgetBytes: 2 * (summaryBytes + eventBytes) - 1 });
  await short.stage.acceptNativeSummary(retained);
  await assert.rejects(
    short.stage.acceptNativeEvent({ type: 'DIAGNOSTIC', payload: diagnostic }),
    /resource/i,
  );
  assert.equal(short.db.prepare('SELECT count(*) AS n FROM temp.patch_event').get().n, 0);
});

test('native SQL preflight refuses corrupt oversized TEXT before a reader fetches payloads', async (t) => {
  const { db, stage } = setup(t);
  assert.equal(typeof stage.preflightNativeRows, 'function');
  db.prepare('INSERT INTO temp.patch_event (kind,payload) VALUES (?,?)').run(
    'DIAGNOSTIC',
    'x'.repeat(1_000_001),
  );
  const prepare = db.prepare.bind(db),
    seen = [];
  db.prepare = (sql) => {
    seen.push(sql);
    return prepare(sql);
  };
  assert.throws(() => [...stage.readDiagnostics()], /resource/i);
  assert.ok(seen.some((sql) => /length\(CAST\(payload AS BLOB\)\)/.test(sql)));
  assert.ok(!seen.some((sql) => /^SELECT payload FROM/.test(sql)));
});

test('native preflight bounds every retained SQL column independently before TEXT reads', async (t) => {
  for (const [table, column, payload] of [
    ['patch_event', 'provider_fact_id', 'payload'],
    ['patch_normalized', 'provider_fact_id', 'payload'],
    ['patch_support', 'fact_key', 'payload'],
    ['patch_native_summary', 'source_path', 'summary_json'],
  ]) {
    await t.test(table, async (t) => {
      const { db, stage } = setup(t);
      const required = {
        patch_event: { kind: 'DIAGNOSTIC', payload: '{}' },
        patch_normalized: { fact_type: 'NODE', provider_fact_id: 'n', payload: '{}' },
        patch_support: { fact_type: 'NODE', fact_key: 'key', evidence_id: 'e', payload: '{}' },
        patch_native_summary: {
          source_file_id: 'f',
          source_path: 'A.java',
          content_fingerprint: 'fp',
          summary_json: '{}',
        },
      }[table];
      required[column] = 'x'.repeat(1_000_000);
      const columns = Object.keys(required);
      db.prepare(
        `INSERT INTO temp.${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
      ).run(...Object.values(required));
      // Indexed duplicates may make the row larger than one record: the limit
      // applies to each retained column, not the sum of all columns in a row.
      assert.ok(stage.preflightNativeRows().retainedSqlBytes > 1_000_000);
      db.prepare(`UPDATE temp.${table} SET ${column}=?`).run('x'.repeat(1_000_001));
      const seen = [],
        prepare = db.prepare.bind(db);
      db.prepare = (sql) => {
        seen.push(sql);
        return prepare(sql);
      };
      assert.throws(() => [...stage.readDiagnostics()], /resource/i);
      assert.equal(
        seen.some((sql) => new RegExp(`^SELECT ${payload} FROM`).test(sql)),
        false,
      );
    });
  }
});

test('native point lookups and completion preflight before fetching staged TEXT', async (t) => {
  const { db, stage } = setup(t);
  db.prepare('INSERT INTO temp.patch_event (kind,payload) VALUES (?,?)').run(
    'DIAGNOSTIC',
    'x'.repeat(1_000_001),
  );
  for (const read of [
    () => stage.getProviderNode('n'),
    () => stage.getChangedSourceFile('f'),
    () => stage.getSourceFileByPath('A.java'),
    () => stage.getNormalizedNode('n'),
    () => complete(stage),
  ])
    assert.throws(read, /resource/i);
});

test('native numeric row ceiling admits equality and refuses excess before TEXT materialization', async (t) => {
  const { db, stage } = setup(t);
  // Deliberately injected TEMP rows test numeric admission, not valid wire
  // observations; the real decoder separately accounts start/terminal events.
  db.exec(`WITH RECURSIVE rows(i) AS (
    VALUES(1) UNION ALL SELECT i+1 FROM rows WHERE i<10000
  ) INSERT INTO temp.patch_event(kind,payload) SELECT 'DIAGNOSTIC','{}' FROM rows`);
  assert.equal(stage.preflightNativeRows().retainedSqlBytes, 120_000);
  db.prepare('INSERT INTO temp.patch_event(kind,payload) VALUES (?,?)').run('DIAGNOSTIC', '{}');
  const prepare = db.prepare.bind(db),
    seen = [];
  db.prepare = (sql) => {
    seen.push(sql);
    return prepare(sql);
  };
  assert.throws(() => [...stage.readDiagnostics()], /resource/i);
  assert.equal(
    seen.some((sql) => /^SELECT payload FROM/.test(sql)),
    false,
  );
});

// Component-only real Storage/Provider composition, not admitted Runtime or
// actual Rust production acceptance. Bootstrap uses the existing validated
// full Store workflow; no SQL seeds graph, summaries or indexed pointers.
async function emptyNativePatch(t, withSource = false, twoSources = false, retiredOwners = null) {
  const db = new DatabaseSync(':memory:');
  const plan = await storage.loadMigrationPlan(
    new URL('../migrations/repository/manifest.json', import.meta.url),
    'REPOSITORY',
  );
  for (const migration of plan.migrations) db.exec(migration.sql);
  db.exec('PRAGMA user_version=10');
  db.prepare('INSERT INTO repository (slot,id,root_path) VALUES (1,?,?)').run('r', '/r');
  db.prepare('INSERT INTO repository_state (repository_id) VALUES (?)').run('r');
  db.prepare(
    'INSERT INTO revisions (id,repository_id,kind,content_fingerprint) VALUES (?,?,?,?)',
  ).run('rev', 'r', 'WORKTREE', 'base');
  const fixture = baseCase(retiredOwners ? 'shared' : withSource ? 'empty' : 'zero-file');
  const bundle = fixture.bundle;
  // Component-only corpus: its deliberately nullable synthetic CU facts are
  // excluded from this owned test copy, just as in the Provider overlay suite.
  // Frozen corpus helpers/goldens and production normalizers stay unchanged.
  const nodes = retiredOwners
    ? fixture.nodes.filter((n) => n.providerKind !== 'java.compilation_unit')
    : [];
  if (retiredOwners) {
    for (const s of bundle.summaries)
      s.emittedFacts = s.emittedFacts.filter(
        (f) => !f.providerFactId.startsWith('java-compilation-unit-v1:'),
      );
    bundle.header.summaryDigest = stateDigest(bundle.summaries);
  }
  if (twoSources) {
    const second = structuredClone(bundle.summaries[0]);
    second.sourceFile.id = 'f-1';
    second.sourceFile.path = 'src/1.java';
    second.sourceFile.contentFingerprint = 'fp-1';
    second.coverage[0].sourceFileId = 'f-1';
    bundle.summaries.push(second);
    bundle.header.sourceFileCount = 2;
    bundle.header.summaryDigest = stateDigest(bundle.summaries);
  }
  const { schemaVersion, sourceFileCount, summaryDigest, ...expected } = bundle.header;
  const oldSnapshot = {
    id: 'snap',
    repositoryId: 'r',
    providerId: 'native',
    providerVersion: '0.0.0',
    runtimeVersion: '0.0.0',
    requestedRevisionId: 'rev',
    requestedRevisionFingerprint: 'base',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
    capabilities: [{ name: 'SYMBOL', support: 'SUPPORTED', coverage: 'COMPLETE' }],
    diagnostics: [],
    outcome: 'SUCCEEDED',
  };
  for (const s of bundle.summaries) {
    const f = s.sourceFile;
    db.prepare(
      `INSERT INTO source_files (revision_id,id,repository_id,path,content_fingerprint,role,provenance,content_kind,language_hint,sensitivity)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      f.revisionId,
      f.id,
      f.repositoryId,
      f.path,
      f.contentFingerprint,
      f.classification.role,
      f.classification.provenance,
      f.classification.contentKind,
      f.languageHint,
      f.sensitivity,
    );
  }
  const fullStage = new storage.RepositoryAnalysisStage(db, limits);
  const initialToken = storage.captureNativeActivationToken(db, 'r');
  try {
    for (const s of bundle.summaries) {
      await fullStage.accept({ type: 'SOURCE_FILE', payload: s.sourceFile });
      for (const coverage of s.coverage)
        await fullStage.accept({ type: 'COVERAGE', payload: coverage });
      await fullStage.acceptNativeSummary(s);
    }
    for (const node of nodes) {
      await fullStage.accept({ type: 'NODE', payload: node });
      fullStage.putNormalizedNode({
        provider: {
          factType: 'NODE',
          providerId: node.providerId,
          providerFactId: node.providerFactId,
        },
        canonical: normalizeJavaNode(node, new Map(fixture.sources.map((f) => [f.id, f]))),
      });
    }
    if (nodes.length) mergeStagedAnalysis(fullStage, oldSnapshot);
    fullStage.confirmSucceeded({
      type: 'ANALYSIS_COMPLETED',
      payload: {
        outcome: 'SUCCEEDED',
        repositoryId: 'r',
        revisionId: 'rev',
        revisionFingerprint: 'base',
        providerSnapshotId: 'snap',
        capabilities: oldSnapshot.capabilities,
        counts: {
          sourceFiles: bundle.summaries.length,
          nodes: nodes.length,
          edges: 0,
          coverage: bundle.summaries.length,
          diagnostics: 0,
        },
      },
    });
    fullStage.sealNativeState(
      JSON.stringify(bundle.header),
      expected,
      validateNativeStateCandidate,
      limits,
    );
    new storage.RepositoryCanonicalFactStore(db).applyNativeAnalysisBatch(
      fullStage,
      {
        repositoryId: 'r',
        revisionId: 'rev',
        contentFingerprint: 'base',
        snapshot: oldSnapshot,
      },
      initialToken,
    );
  } finally {
    fullStage.close();
  }
  const baseline = storage.readNativeAnalysisState(
    db,
    expected,
    validateNativeStateCandidate,
    limits,
  );
  assert.equal(baseline.status, 'AVAILABLE');
  const target = structuredClone(bundle);
  const removedNodes = [];
  if (retiredOwners) {
    target.summaries = target.summaries.filter((s) => !retiredOwners.includes(s.sourceFile.id));
    target.header.contentFingerprint = 'target';
    target.header.sourceFileCount = target.summaries.length;
    target.header.summaryDigest = stateDigest(target.summaries);
    for (const owner of retiredOwners) db.prepare('DELETE FROM source_files WHERE id=?').run(owner);
    db.prepare('UPDATE revisions SET content_fingerprint=? WHERE id=?').run('target', 'rev');
    const retainedIds = new Set(
      target.summaries.flatMap((s) => s.emittedFacts.map((f) => f.providerFactId)),
    );
    for (const node of nodes)
      if (!retainedIds.has(node.providerFactId))
        removedNodes.push({
          factType: 'NODE',
          providerId: 'native',
          providerFactId: node.providerFactId,
        });
  }
  const context = {
    baseline: structuredClone(baseline.state),
    targetSourceFiles: target.summaries.map((s) => s.sourceFile),
  };
  const stage = new RepositoryPatchStage(
    db,
    (group) => selectMergedGroup(group).fact,
    limits,
    context,
  );
  t.after(() => {
    stage.close();
    db.close();
  });
  const snapshot = {
    ...oldSnapshot,
    id: 'snap-next',
    requestedRevisionFingerprint: target.header.contentFingerprint,
  };
  const terminal = {
    type: 'REFRESH_COMPLETED',
    payload: {
      outcome: 'SUCCEEDED',
      repositoryId: 'r',
      revisionId: 'rev',
      revisionFingerprint: target.header.contentFingerprint,
      providerSnapshotId: snapshot.id,
      capabilities: snapshot.capabilities,
      counts: {
        sourceFiles: 0,
        upsertedNodes: 0,
        removedNodes: removedNodes.length,
        upsertedEdges: 0,
        removedEdges: 0,
        coverage: target.summaries.length,
        diagnostics: 0,
      },
      summaryRecords: target.summaries.length,
      analysisState: target.header,
    },
  };
  for (const removal of removedNodes)
    await stage.acceptNativeEvent({ type: 'REMOVE_NODE', payload: removal });
  for (const s of target.summaries) {
    await stage.acceptNativeSummary(s);
    for (const coverage of s.coverage)
      await stage.acceptNativeEvent({ type: 'COVERAGE', payload: coverage });
  }
  return {
    db,
    stage,
    context,
    snapshot,
    terminal,
    expected: { ...expected, contentFingerprint: target.header.contentFingerprint },
    token: baseline.token,
  };
}

test('actual support-chain seal preserves old shared Evidence after nonlast owner deletion', async (t) => {
  const { db, stage, context, snapshot, terminal, expected, token } = await emptyNativePatch(
    t,
    true,
    false,
    ['f-0'],
  );
  const tables = [
    'canonical_nodes',
    'evidence',
    'fact_evidence',
    'provider_fact_bindings',
    'active_support_candidates',
    'provider_snapshots',
    'native_analysis_state',
    'native_analysis_file',
    'repository_state',
  ];
  const image = () =>
    tables.map((name) => db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all());
  const before = image();
  const support = storage.readNativePatchActiveSupports(db, expected, limits).supports;
  assert.equal(support.length, 3);
  const shared = support.find((s) =>
    s.binding.providerFact.providerFactId.startsWith('java-package-container-v1:'),
  );
  assert.ok(shared);
  assert.equal(shared.evidence.providerSnapshotId, 'snap');
  assert.equal(context.targetSourceFiles.length, 1);
  stage.confirmNativeSucceeded(terminal, snapshot);
  let observed;
  stage.sealNativePatchState(expected, token, (input) => {
    observed = [...input.activeSupports];
    return validateNativeRefreshOverlay({ ...input, activeSupports: observed });
  });
  assert.deepEqual(observed, support);
  const sealed = stage.readSealedNativeState();
  assert.deepEqual(
    sealed.files.map((f) => f.sourceFileId),
    ['f-1'],
  );
  assert.equal(JSON.parse(sealed.headerJson).contentFingerprint, 'target');
  const ledger = JSON.parse(sealed.files[0].summaryJson).emittedFacts;
  assert.equal(ledger.length, 2);
  assert.ok(ledger.some((f) => f.providerFactId === shared.binding.providerFact.providerFactId));
  assert.deepEqual(image(), before);
  assert.deepEqual(storage.readNativePatchActiveSupports(db, expected, limits).supports, support);
  assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 1);
});

test('actual support-chain seal permits final owner deletion without retiring persistent history', async (t) => {
  const { db, stage, snapshot, terminal, expected, token } = await emptyNativePatch(
    t,
    true,
    false,
    ['f-0', 'f-1'],
  );
  const before = storage.readNativePatchActiveSupports(db, expected, limits).supports;
  assert.equal(before.length, 3);
  stage.confirmNativeSucceeded(terminal, snapshot);
  stage.sealNativePatchState(expected, token, validateNativeRefreshOverlay);
  assert.deepEqual(stage.readSealedNativeState().files, []);
  assert.deepEqual(storage.readNativePatchActiveSupports(db, expected, limits).supports, before);
  assert.equal(db.prepare('SELECT count(*) AS n FROM evidence').get().n, 3);
});

test('native context normalization resolves a dependent upsert through real retained candidates', async (t) => {
  const { db, stage, snapshot, terminal, expected } = await emptyNativePatch(t, true, false, []);
  const before = storage.readNativePatchActiveSupports(db, expected, limits).supports;
  const shared = before.find((s) =>
    s.binding.providerFact.providerFactId.startsWith('java-package-container-v1:'),
  );
  const caller = before.find((s) => s.binding.providerFact.providerFactId === 'package-1');
  await stage.acceptNativeEvent({
    type: 'UPSERT_EDGE',
    payload: {
      providerId: 'native',
      providerFactId: 'dependent-call',
      providerSnapshotId: snapshot.id,
      repositoryId: 'r',
      revisionId: 'rev',
      providerKind: 'java.call',
      source: { factType: 'NODE', providerId: 'native', providerFactId: 'package-1' },
      target: { state: 'RESOLVED', resolution: 'EXACT', target: shared.evidence.providerFact },
      sourceRange: { sourceFileId: 'f-1', startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 },
      confidence: { score: 1, method: 'parser', reasons: [] },
    },
  });
  terminal.payload.counts.upsertedEdges = 1;
  stage.confirmNativeSucceeded(terminal, snapshot);
  const context = {
    repositoryId: 'r',
    revisionId: 'rev',
    contentFingerprint: 'target',
    snapshotId: snapshot.id,
    changedSourceFiles: [],
  };
  assert.throws(
    () =>
      patchNormalization.normalizeNativeStagedPatch(
        stage,
        { ...context, contentFingerprint: 'wrong' },
        snapshot,
      ),
    /Snapshot differs/i,
  );
  assert.equal([...stage.readSupports()].length, 0);
  patchNormalization.normalizeNativeStagedPatch(stage, context, snapshot);
  const pairs = [...stage.readNormalizedEdges()];
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].canonical.source.id, caller.canonical.id);
  assert.equal(pairs[0].canonical.target.target.id, shared.canonical.id);
  const supports = [...stage.readSupports()];
  assert.equal(supports.length, 1);
  assert.equal(supports[0].evidence.providerSnapshotId, snapshot.id);
  assert.deepEqual(storage.readNativePatchActiveSupports(db, expected, limits).supports, before);
  // Normalization is provisional: this deliberately has no matching target
  // ledger and therefore cannot be sealed or applied as a successful patch.
  assert.throws(
    () =>
      stage.sealNativePatchState(
        expected,
        storage.captureNativeActivationToken(db, 'r'),
        validateNativeRefreshOverlay,
      ),
    (error) => error.nativeStateReason === 'INVALID',
  );
});

test('native normalization context refuses accessors and oversized extensions before stage observation', async (t) => {
  const { db, stage, snapshot } = await emptyNativePatch(t);
  let calls = 0;
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    calls++;
    return prepare(sql);
  };
  let getterCalls = 0;
  assert.throws(
    () =>
      patchNormalization.normalizeNativeStagedPatch(
        stage,
        {
          get repositoryId() {
            getterCalls++;
            return 'r';
          },
        },
        snapshot,
      ),
    /JSON/i,
  );
  assert.throws(
    () =>
      patchNormalization.normalizeNativeStagedPatch(
        stage,
        {
          repositoryId: 'r',
          revisionId: 'rev',
          contentFingerprint: 'base',
          snapshotId: snapshot.id,
          changedSourceFiles: [],
          extension: 'x'.repeat(1_000_001),
        },
        snapshot,
      ),
    /resource/i,
  );
  assert.equal(getterCalls, 0);
  assert.equal(calls, 0);
});

test('native seal requires completed observations and retries rejection without persistent writes', async (t) => {
  const { db, stage, expected, token, snapshot, terminal } = await emptyNativePatch(t);
  assert.equal(typeof stage.sealNativePatchState, 'function');
  assert.throws(() => stage.readSealedNativeState(), /seal/i);
  assert.throws(
    () => stage.sealNativePatchState(expected, token, validateNativeRefreshOverlay),
    /complete/i,
  );
  stage.confirmNativeSucceeded(terminal, snapshot);
  assert.throws(() => stage.sealNativePatchState(expected, token, undefined), /port/i);
  assert.throws(
    () =>
      stage.sealNativePatchState(expected, token, () => {
        throw Error('controlled validation refusal');
      }),
    /controlled/,
  );
  assert.throws(() => stage.readSealedNativeState(), /seal/i);
  stage.sealNativePatchState(expected, token, validateNativeRefreshOverlay);
  assert.equal(stage.readSealedNativeState().files.length, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 1);
  assert.equal(
    db.prepare('SELECT indexed_content_fingerprint AS fp FROM repository_state').get().fp,
    'base',
  );
});

test('successful native seal detaches state and refuses every stage mutator', async (t) => {
  const { db, stage, context, snapshot, terminal, expected, token } = await emptyNativePatch(t);
  assert.equal(typeof stage.sealNativePatchState, 'function');
  context.baseline.headerJson = 'caller mutation';
  stage.confirmNativeSucceeded(terminal, snapshot);
  stage.sealNativePatchState(expected, token, validateNativeRefreshOverlay);
  const sealed = stage.readSealedNativeState();
  assert.ok(Object.isFrozen(sealed.expected.language));
  assert.throws(() => {
    sealed.expected.contentFingerprint = 'forged';
  }, TypeError);
  await assert.rejects(stage.accept({ type: 'DIAGNOSTIC', payload: {} }), /seal/i);
  await assert.rejects(
    stage.acceptNativeEvent({ type: 'COVERAGE', payload: nativeCoverage() }),
    /seal/i,
  );
  await assert.rejects(stage.acceptNativeSummary(summary('late', 'Late.java')), /seal/i);
  for (const mutate of [
    () => stage.putNormalizedNode({}),
    () => stage.putNormalizedEdge({}),
    () => stage.appendSupport({}),
    () => stage.confirmSucceeded(terminal),
    () => stage.confirmNativeSucceeded(terminal, snapshot),
    () => stage.sealNativePatchState(expected, token, validateNativeRefreshOverlay),
  ])
    assert.throws(mutate, /seal/i);
  assert.throws(
    () =>
      stage.assertApplicable(db, {
        repositoryId: 'r',
        revisionId: 'rev',
        contentFingerprint: 'base',
        snapshotId: 'snap-next',
      }),
    /native|seal/i,
  );
  stage.close();
  stage.close();
  assert.equal(
    db
      .prepare(
        "SELECT count(*) AS n FROM sqlite_temp_master WHERE type='table' AND name LIKE 'patch_%'",
      )
      .get().n,
    0,
  );
  assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 1);
});

test('native seal refuses stale token and changed baseline header before calling the Provider port', async (t) => {
  const { db, stage, snapshot, terminal, expected, token } = await emptyNativePatch(t);
  assert.equal(typeof stage.sealNativePatchState, 'function');
  stage.confirmNativeSucceeded(terminal, snapshot);
  let calls = 0;
  const validate = (input) => {
    calls++;
    return validateNativeRefreshOverlay(input);
  };
  assert.throws(
    () => stage.sealNativePatchState(expected, { ...token, committedSnapshotCount: 2 }, validate),
    /token/i,
  );
  assert.equal(calls, 0);
  db.prepare('UPDATE native_analysis_state SET header_json=?').run('{}');
  assert.throws(() => stage.sealNativePatchState(expected, token, validate), /baseline|token/i);
  assert.equal(calls, 0);
});

test('native seal binds complete unchanged zero-fact inventory and refuses classification drift', async (t) => {
  const { db, stage, snapshot, terminal, expected, token } = await emptyNativePatch(t, true);
  assert.equal([...stage.readSourceFiles()].length, 0);
  stage.confirmNativeSucceeded(terminal, snapshot);
  let calls = 0;
  const validate = (input) => {
    calls++;
    return validateNativeRefreshOverlay(input);
  };
  db.prepare("UPDATE source_files SET sensitivity='INTERNAL'").run();
  assert.throws(() => stage.sealNativePatchState(expected, token, validate), /inventory/i);
  assert.equal(calls, 0);
  db.prepare("UPDATE source_files SET sensitivity='PUBLIC'").run();
  db.exec('BEGIN');
  stage.sealNativePatchState(expected, token, validate);
  assert.equal(db.isTransaction, true);
  db.exec('ROLLBACK');
  assert.equal(stage.readSealedNativeState().files.length, 1);
  assert.equal([...stage.readNativeCoverage()][0].statistics.eligibleSites, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 1);
});

test('native validation callback cannot change rows while its overlay is being sealed', async (t) => {
  const { db, stage, snapshot, terminal, expected, token } = await emptyNativePatch(t);
  const pair = normalizeNativeAnalysis(full).nodes[0];
  stage.confirmNativeSucceeded(terminal, snapshot);
  assert.throws(
    () =>
      stage.sealNativePatchState(expected, token, () => {
        stage.putNormalizedNode(pair);
      }),
    /seal|validat/i,
  );
  assert.equal(db.prepare('SELECT count(*) AS n FROM temp.patch_normalized').get().n, 0);
  stage.sealNativePatchState(expected, token, validateNativeRefreshOverlay);
});

test('native seal rejects a validation result that duplicates one target and omits another', async (t) => {
  const { stage, snapshot, terminal, expected, token } = await emptyNativePatch(t, true, true);
  stage.confirmNativeSucceeded(terminal, snapshot);
  assert.throws(
    () =>
      stage.sealNativePatchState(expected, token, (input) => {
        const result = validateNativeRefreshOverlay(input);
        return { ...result, files: [result.files[0], result.files[0]] };
      }),
    /differs from stage/i,
  );
  assert.throws(() => stage.readSealedNativeState(), /seal/i);
  stage.sealNativePatchState(expected, token, validateNativeRefreshOverlay);
  assert.deepEqual(
    stage
      .readSealedNativeState()
      .files.map((f) => f.sourceFileId)
      .sort(),
    ['f-0', 'f-1'],
  );
});

test('native validation result is bounded and detached before freezing', async (t) => {
  const { stage, snapshot, terminal, expected, token } = await emptyNativePatch(t);
  stage.confirmNativeSucceeded(terminal, snapshot);
  let calls = 0;
  assert.throws(
    () =>
      stage.sealNativePatchState(expected, token, (input) => ({
        ...validateNativeRefreshOverlay(input),
        get extension() {
          calls++;
          return 'accessor';
        },
      })),
    /JSON/i,
  );
  assert.equal(calls, 0);
  assert.throws(
    () =>
      stage.sealNativePatchState(expected, token, (input) => ({
        ...validateNativeRefreshOverlay(input),
        extension: 'x'.repeat(limits.memoryBudgetBytes),
      })),
    /resource/i,
  );
  assert.throws(() => stage.readSealedNativeState(), /seal/i);
  stage.sealNativePatchState(expected, token, validateNativeRefreshOverlay);
});

// A real validated full Apply supplies the support chains. Direct SQL below is
// limited to deliberate corruption and reconciliation simulations, not activation.
const full = JSON.parse(
  await readFile(
    new URL(
      '../../../fixtures/normalization/canonical-normalization/inputs/result.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
async function activeDatabase(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const plan = await storage.loadMigrationPlan(
    new URL('../migrations/repository/manifest.json', import.meta.url),
    'REPOSITORY',
  );
  for (const migration of plan.migrations) db.exec(migration.sql);
  db.exec('PRAGMA foreign_keys=ON');
  const request = full.request,
    repo = request.payload.repository,
    revision = request.payload.revision;
  db.prepare('INSERT INTO repository (slot,id,root_path) VALUES (1,?,?)').run(
    repo.id,
    repo.rootPath,
  );
  db.prepare('INSERT INTO repository_state (repository_id) VALUES (?)').run(repo.id);
  db.prepare(
    'INSERT INTO revisions (id,repository_id,kind,content_fingerprint) VALUES (?,?,?,?)',
  ).run(revision.id, repo.id, revision.kind, revision.contentFingerprint);
  const source = db.prepare(`INSERT INTO source_files
    (revision_id,id,repository_id,path,content_fingerprint,role,provenance,content_kind,language_hint,sensitivity)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  for (const f of request.payload.sourceFiles)
    source.run(
      f.revisionId,
      f.id,
      f.repositoryId,
      f.path,
      f.contentFingerprint,
      f.classification.role,
      f.classification.provenance,
      f.classification.contentKind,
      f.languageHint,
      f.sensitivity,
    );
  const stage = new storage.RepositoryAnalysisStage(db);
  try {
    for (const event of full.events)
      if (['SOURCE_FILE', 'NODE', 'EDGE', 'COVERAGE', 'DIAGNOSTIC'].includes(event.type))
        await stage.accept(event);
    normalizeStagedAnalysis(stage, request);
    const snapshot = {
      id: request.payload.providerSnapshotId,
      repositoryId: repo.id,
      providerId: 'native',
      providerVersion: '1',
      runtimeVersion: '1',
      requestedRevisionId: revision.id,
      requestedRevisionFingerprint: revision.contentFingerprint,
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      capabilities: full.terminal.payload.capabilities,
      diagnostics: [],
      outcome: 'SUCCEEDED',
    };
    mergeStagedAnalysis(stage, snapshot);
    stage.confirmSucceeded(full.terminal);
    new storage.RepositoryCanonicalFactStore(db).applyAnalysisBatch(stage, {
      repositoryId: repo.id,
      revisionId: revision.id,
      contentFingerprint: revision.contentFingerprint,
      snapshot,
    });
  } finally {
    stage.close();
  }
  return { db, expected: { repositoryId: repo.id, revisionId: revision.id } };
}

test('bounded ACTIVE support view retains exact per-support candidates and historical provenance', async (t) => {
  const { db, expected } = await activeDatabase(t);
  assert.equal(typeof storage.readNativePatchActiveSupports, 'function');
  const before = db.prepare('SELECT * FROM active_support_candidates ORDER BY evidence_id').all();
  // The selected representative can differ: the reader must never use its payload.
  db.prepare('UPDATE canonical_nodes SET name=?').run('Other Provider representative');
  const result = storage.readNativePatchActiveSupports(db, expected, limits);
  assert.equal(result.supports.length, before.length);
  for (const support of result.supports) {
    const stored = before.find((r) => r.evidence_id === support.evidence.id);
    assert.deepEqual(support.canonical, JSON.parse(stored.candidate_json));
    assert.equal(support.snapshot.id, support.evidence.providerSnapshotId);
    assert.equal(
      support.snapshot.requestedRevisionFingerprint,
      full.request.payload.revision.contentFingerprint,
    );
    assert.equal(support.binding.evidenceId, support.factEvidence.evidenceId);
    assert.equal(support.evidence.status, 'ACTIVE');
  }
  assert.ok(Object.isFrozen(result.supports[0].canonical.confidence));
  assert.equal(db.isTransaction, false);
});

test('provisional Native retained-node lookup bounds candidate SQL before TEXT decoding', async (t) => {
  const { db, expected } = await activeDatabase(t);
  const stage = new RepositoryPatchStage(db, selectMergedGroup, limits);
  try {
    const candidate = db
      .prepare(
        "SELECT candidate_json FROM active_support_candidates WHERE fact_type='NODE' LIMIT 1",
      )
      .get();
    const value = JSON.parse(candidate.candidate_json);
    value.name = 'x'.repeat(1_000_001);
    db.prepare("UPDATE active_support_candidates SET candidate_json=? WHERE fact_type='NODE'").run(
      JSON.stringify(value),
    );
    stage.confirmSucceeded({
      type: 'REFRESH_COMPLETED',
      payload: {
        outcome: 'SUCCEEDED',
        repositoryId: expected.repositoryId,
        revisionId: expected.revisionId,
        revisionFingerprint: full.request.payload.revision.contentFingerprint,
        providerSnapshotId: 'next',
        counts: {
          sourceFiles: 0,
          upsertedNodes: 0,
          removedNodes: 0,
          upsertedEdges: 0,
          removedEdges: 0,
          coverage: 0,
          diagnostics: 0,
        },
      },
    });
    const fact = db
      .prepare("SELECT provider_fact_id FROM provider_fact_bindings WHERE fact_type='NODE' LIMIT 1")
      .get();
    const prepare = db.prepare.bind(db),
      seen = [];
    db.prepare = (sql) => {
      seen.push(sql);
      return prepare(sql);
    };
    assert.throws(
      () => stage.getRetainedCanonicalNode('native', fact.provider_fact_id),
      /resource/i,
    );
    assert.ok(!seen.some((sql) => /^SELECT candidate.candidate_json/.test(sql)));
  } finally {
    stage.close();
  }
});

test('ACTIVE support numeric preflight precedes TEXT and exact twice-SQL boundary is enforced', async (t) => {
  const { db, expected } = await activeDatabase(t);
  const measured = storage.readNativePatchActiveSupports(db, expected, limits);
  assert.ok(measured.retainedSqlBytes > 0);
  // SQL support rows are not one serialized summary bundle. Aggregate retained
  // strings consume the declared memory budget; each row remains byte bounded.
  assert.doesNotThrow(() =>
    storage.readNativePatchActiveSupports(db, expected, {
      ...limits,
      maxSerializedBytes: measured.retainedSqlBytes - 1,
    }),
  );
  assert.doesNotThrow(() =>
    storage.readNativePatchActiveSupports(db, expected, {
      ...limits,
      memoryBudgetBytes: 2 * measured.retainedSqlBytes,
    }),
  );
  assert.throws(
    () =>
      storage.readNativePatchActiveSupports(db, expected, {
        ...limits,
        memoryBudgetBytes: 2 * measured.retainedSqlBytes - 1,
      }),
    /resource/i,
  );
  db.prepare(
    'UPDATE active_support_candidates SET candidate_json=? WHERE evidence_id=(SELECT evidence_id FROM active_support_candidates LIMIT 1)',
  ).run(JSON.stringify({ invalid: '😀'.repeat(250_001) }));
  const queries = [],
    prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    queries.push(sql);
    return prepare(sql);
  };
  assert.throws(() => storage.readNativePatchActiveSupports(db, expected, limits), /resource/i);
  assert.ok(queries.some((sql) => /sum\(/i.test(sql) && /AS BLOB/i.test(sql)));
  assert.equal(
    queries.some((sql) => /SELECT\s+e\.id\s+AS/i.test(sql)),
    false,
  );
  assert.equal(db.isTransaction, false);
});

test('missing, forged, orphan and mixed snapshot support chains refuse without writes', async (t) => {
  const corruptions = [
    ['missing candidate', 'DELETE FROM active_support_candidates'],
    ['orphan Evidence', 'DELETE FROM provider_fact_bindings'],
    ['missing link', 'DELETE FROM fact_evidence'],
    [
      'extra link',
      `INSERT INTO fact_evidence SELECT 'NODE','missing-node',id FROM evidence LIMIT 1`,
    ],
    [
      'forged candidate',
      `UPDATE active_support_candidates SET candidate_json=json_set(candidate_json,'$.id','forged')`,
    ],
    ['mixed Provider', `UPDATE provider_fact_bindings SET provider_id='forged'`],
    ['mixed snapshot', `UPDATE provider_snapshots SET provider_id='forged'`],
    ['failed snapshot', `UPDATE provider_snapshots SET outcome='PARTIAL'`],
  ];
  for (const [name, sql] of corruptions)
    await t.test(name, async (t) => {
      const { db, expected } = await activeDatabase(t);
      db.exec(sql);
      const before = db.prepare('SELECT * FROM evidence ORDER BY id').all();
      assert.throws(
        () => storage.readNativePatchActiveSupports(db, expected, limits),
        /invalid.*support/i,
      );
      assert.deepEqual(db.prepare('SELECT * FROM evidence ORDER BY id').all(), before);
      assert.equal(db.isTransaction, false);
    });
});

test('historical ranges are returned for later retirement checks, never relabeled to target', async (t) => {
  const { db, expected } = await activeDatabase(t);
  const before = storage.readNativePatchActiveSupports(db, expected, limits);
  db.exec('DELETE FROM source_files');
  db.prepare('UPDATE revisions SET content_fingerprint=?').run('reconciled-target');
  assert.deepEqual(storage.readNativePatchActiveSupports(db, expected, limits), before);
  // This reader attests history, not target applicability: D3 overlay/D4 must
  // refuse retaining these ranges and only allow declared Native retirement.
});

test('real other-Provider Apply does not replace the Native per-support candidate in the view', async (t) => {
  const { db, expected } = await activeDatabase(t);
  const before = storage.readNativePatchActiveSupports(db, expected, limits);
  const original = full.events.find((e) => e.type === 'NODE').payload;
  const target = full.request.payload.revision;
  const snapshot = {
    id: 'other-provider-snapshot',
    repositoryId: expected.repositoryId,
    providerId: 'alpha',
    providerVersion: '1',
    runtimeVersion: '1',
    requestedRevisionId: expected.revisionId,
    requestedRevisionFingerprint: target.contentFingerprint,
    startedAt: '2026-01-02T00:00:00.000Z',
    completedAt: '2026-01-02T00:00:01.000Z',
    capabilities: [],
    diagnostics: [],
    outcome: 'SUCCEEDED',
  };
  const request = {
    protocolVersion: 1,
    requestId: 'other-provider-refresh',
    type: 'REFRESH',
    payload: {
      ...full.request.payload,
      providerSnapshotId: snapshot.id,
      baseRevisionId: target.id,
      baseRevisionFingerprint: target.contentFingerprint,
      targetRevision: target,
      changes: { added: [], modified: [], deleted: [] },
    },
  };
  delete request.payload.revision;
  delete request.payload.sourceFiles;
  const stage = new RepositoryPatchStage(db, (group) => selectMergedGroup(group).fact);
  try {
    await stage.accept({
      type: 'UPSERT_NODE',
      payload: {
        ...original,
        providerId: 'alpha',
        providerSnapshotId: snapshot.id,
        confidence: { ...original.confidence, score: 0.7, method: 'alpha' },
      },
    });
    stage.confirmSucceeded({
      type: 'REFRESH_COMPLETED',
      payload: {
        outcome: 'SUCCEEDED',
        repositoryId: expected.repositoryId,
        revisionId: target.id,
        revisionFingerprint: target.contentFingerprint,
        providerSnapshotId: snapshot.id,
        counts: {
          sourceFiles: 0,
          upsertedNodes: 1,
          removedNodes: 0,
          upsertedEdges: 0,
          removedEdges: 0,
          coverage: 0,
          diagnostics: 0,
        },
      },
    });
    normalizeStagedPatch(stage, request, snapshot);
    new storage.RepositoryCanonicalFactStore(db).applyAnalysisPatch(stage, {
      repositoryId: expected.repositoryId,
      baseRevisionId: target.id,
      baseContentFingerprint: target.contentFingerprint,
      targetRevisionId: target.id,
      targetContentFingerprint: target.contentFingerprint,
      snapshot,
    });
  } finally {
    stage.close();
  }
  const after = storage.readNativePatchActiveSupports(db, expected, limits);
  assert.deepEqual(
    after.supports.filter((s) => s.evidence.providerFact.providerId === 'native'),
    before.supports,
  );
  const other = after.supports.find((s) => s.evidence.providerFact.providerId === 'alpha');
  assert.equal(other.snapshot.id, snapshot.id);
  assert.equal(
    db.prepare('SELECT confidence_score FROM canonical_nodes WHERE id=?').get(other.canonical.id)
      .confidence_score,
    0.7,
  );
  const native = before.supports.find((s) => s.canonical.id === other.canonical.id);
  assert.notEqual(native.canonical.confidence.score, 0.7);
});

test('support reads respect caller transactions and operational SQLite failures propagate', async (t) => {
  const { db, expected } = await activeDatabase(t);
  db.exec('BEGIN');
  storage.readNativePatchActiveSupports(db, expected, limits);
  assert.equal(db.isTransaction, true);
  db.exec('DELETE FROM active_support_candidates');
  assert.throws(
    () => storage.readNativePatchActiveSupports(db, expected, limits),
    /invalid.*support/i,
  );
  assert.equal(db.isTransaction, true);
  db.exec('ROLLBACK');
  assert.ok(storage.readNativePatchActiveSupports(db, expected, limits).supports.length);
  const broken = new DatabaseSync(':memory:');
  try {
    assert.throws(
      () => storage.readNativePatchActiveSupports(broken, expected, limits),
      /no such table/i,
    );
    assert.equal(broken.isTransaction, false);
  } finally {
    broken.close();
  }
});
