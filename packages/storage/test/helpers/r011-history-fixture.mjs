import { mixedAnalysisTestRoot } from '../../../../scripts/mixed-analysis-test-root.mjs';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { loadMigrationPlan, RepositorySourceStateStore } from '../../dist/index.js';
import { applyMigrationPlan } from '../../dist/migrations/runner.js';
export const historyRoot = new URL(
  '../../../../fixtures/phase1/r011-history-capture/',
  import.meta.url,
);
export const historyCases = JSON.parse(readFileSync(new URL('cases.json', historyRoot), 'utf8'));
export const loadHistoryCase = (id) => {
  const c = historyCases.find((c) => c.id === id);
  if (!c) throw Error('Unknown literal case');
  return {
    ...c,
    input: JSON.parse(readFileSync(new URL(c.input, historyRoot))),
    expected: JSON.parse(readFileSync(new URL(c.expected, historyRoot))),
  };
};
export const historyLimits = {
  maxRows: Number.MAX_SAFE_INTEGER,
  maxSerializedBytes: Number.MAX_SAFE_INTEGER,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxDepth: Number.MAX_SAFE_INTEGER,
  memoryBudgetBytes: Number.MAX_SAFE_INTEGER,
};
export async function prefixPlan(version) {
  const p = await loadMigrationPlan(
    new URL('../../migrations/repository/manifest.json', import.meta.url),
    'REPOSITORY',
  );
  assert.ok(p.migrations.length >= version);
  return { ...p, latestVersion: version, migrations: p.migrations.slice(0, version) };
}
export async function openR010FixtureDatabase(databasePath, repositoryId, rootPath) {
  const database = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
  try {
    applyMigrationPlan(database, await prefixPlan(10));
    database.exec('BEGIN');
    database
      .prepare('INSERT INTO repository(slot,id,root_path)VALUES(1,?,?)')
      .run(repositoryId, rootPath);
    database.prepare('INSERT INTO repository_state(repository_id)VALUES(?)').run(repositoryId);
    database.exec('COMMIT');
    return {
      database,
      sourceState: new RepositorySourceStateStore(database),
      close() {
        if (database.isOpen) database.close();
      },
    };
  } catch (e) {
    database.close();
    throw e;
  }
}
const tables = [
  'repository',
  'repository_state',
  'revisions',
  'source_files',
  'provider_snapshots',
  'provider_capabilities',
  'canonical_nodes',
  'canonical_edges',
  'unresolved_targets',
  'evidence',
  'fact_evidence',
  'provider_fact_bindings',
  'active_support_candidates',
  'analysis_coverage',
  'activation_history',
  'syntax_origins',
  'syntax_projections',
  'activation_syntax_members',
  'active_history_pointer',
];
export function seedLiteral(db, input, version = 11) {
  db.exec('BEGIN');
  try {
    for (const table of tables) {
      if (version === 10 && tables.indexOf(table) >= 14) continue;
      for (const row of input.tables[table] ?? []) {
        const cols = Object.keys(row);
        assert.ok(cols.every((c) => /^[a-z_]+$/.test(c)));
        db.prepare(
          'INSERT INTO ' +
            table +
            '(' +
            cols.join(',') +
            ')VALUES(' +
            cols.map(() => '?').join(',') +
            ')',
        ).run(...Object.values(row));
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
export async function historyFixture(t, id = 'available', options = {}) {
  const value = loadHistoryCase(id);
  // Test-owned DBs must be inside the same approved root enforced by the crash worker.
  const testRoot = resolve(mixedAnalysisTestRoot(process.cwd()));
  await mkdir(testRoot, { recursive: true });
  const directory = await mkdtemp(join(testRoot, 'codeatlas-r011-'));
  const databasePath = join(directory, 'fixture.sqlite');
  let db;
  const connections = [];
  t.after(async () => {
    for (const c of connections) if (c.isOpen) c.close();
    assert.equal(resolve(dirname(directory)), testRoot);
    assert.ok(basename(directory).startsWith('codeatlas-r011-'));
    await rm(directory, { recursive: true, force: true });
  });
  db = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
  connections.push(db);
  applyMigrationPlan(db, await prefixPlan(options.version ?? 11));
  if (options.seed !== false) seedLiteral(db, value.input, options.version ?? 11);
  return {
    ...value,
    db,
    directory,
    databasePath,
    connections,
    reopen(readOnly = false) {
      const next = new DatabaseSync(databasePath, { readOnly, enableForeignKeyConstraints: true });
      connections.push(next);
      return next;
    },
  };
}
export function persistentRows(db) {
  return Object.fromEntries(
    tables.map((table) => [table, db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()]),
  );
}
// Independent resealing for negative declarations, never graph expected generation.
export function referenceCanonical(v) {
  if (Array.isArray(v)) return '[' + v.map(referenceCanonical).join(',') + ']';
  if (v !== null && typeof v === 'object')
    return (
      '{' +
      Object.keys(v)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map((k) => JSON.stringify(k) + ':' + referenceCanonical(v[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(v);
}
export async function mutateHistoryFixture(t, mutate, id = 'available') {
  const f = await historyFixture(t, id, { seed: false });
  await mutate(f.input);
  seedLiteral(f.db, f.input);
  return f;
}
export async function resealManifest(input, mutate) {
  const { createHash } = await import('node:crypto');
  const row = input.tables.activation_history.at(-1),
    oldId = row.id,
    m = JSON.parse(row.manifest_json);
  mutate(m);
  row.manifest_json = referenceCanonical(m);
  row.manifest_digest = createHash('sha256')
    .update('codeatlas-activation-history-v1\0' + row.manifest_json)
    .digest('hex');
  row.id = 'activation:' + row.manifest_digest;
  for (const p of input.tables.active_history_pointer)
    if (p.activation_id === oldId) p.activation_id = row.id;
  for (const p of input.tables.activation_syntax_members)
    if (p.activation_id === oldId) p.activation_id = row.id;
}
export async function nativeEmptyHistoryInput() {
  const { createHash } = await import('node:crypto');
  const { cases, reference } =
    await import('../../../../fixtures/phase1/code-context-capture/authoring.mjs');
  const sample = structuredClone(cases.find((c) => c.id === 'empty-code-with-coverage')),
    input = loadHistoryCase('empty-code-complete').input,
    row = input.tables.activation_history[0],
    m = JSON.parse(row.manifest_json),
    file = m.state.inventory[0];
  file.languageHint = 'python';
  sample.files[0].languageHint = 'python';
  const snap = m.state.snapshots[0];
  snap.providerId = 'native';
  snap.capabilities = ['FRAMEWORK_SYNTAX_OBSERVATION_V1', 'PYTHON_SYNTAX_CODE_V1'].map((name) => ({
    name,
    support: 'SUPPORTED',
    coverage: 'COMPLETE',
  }));
  sample.runs[0].snapshot = structuredClone(snap);
  sample.runs[0].coverage = snap.capabilities.map((c) => ({
    capability: c.name,
    sourceFileId: file.id,
    coverage: 'COMPLETE',
  }));
  const basis = reference(sample).view.activeBasis;
  m.state.basis = basis;
  m.codeIdentity = basis.codeActivationDigest;
  m.state.contracts[0].providerId = 'native';
  m.state.units = [
    { id: 'py:one', providerId: 'native', kind: 'PYTHON_FILE', sourceFileIds: [file.id] },
  ];
  m.state.coverage = snap.capabilities.map((c) => ({
    unitId: 'py:one',
    facet: c.name,
    originSnapshotId: snap.id,
    coverage: 'COMPLETE',
  }));
  const H = (domain, v) =>
    createHash('sha256')
      .update(domain + '\0' + referenceCanonical(v))
      .digest('hex');
  m.sourceIdentity = H('codeatlas-activation-source-v1', m.state.inventory);
  m.originRegistryDigest = H('codeatlas-activation-origins-v1', m.state.snapshots);
  input.tables.source_files[0].language_hint = 'python';
  input.tables.provider_snapshots[0].provider_id = 'native';
  input.tables.provider_capabilities = snap.capabilities.map((c) => ({
    snapshot_id: snap.id,
    ...c,
  }));
  input.tables.analysis_coverage = sample.runs[0].coverage.map((c) => ({
    provider_snapshot_id: snap.id,
    capability_name: c.capability,
    source_file_id: c.sourceFileId,
    status: c.coverage,
  }));
  row.manifest_json = referenceCanonical(m);
  row.manifest_digest = H('codeatlas-activation-history-v1', m);
  row.id = 'activation:' + row.manifest_digest;
  input.tables.active_history_pointer[0].activation_id = row.id;
  return input;
}
// Declared component transition reference. No Provider composer or run qualification.
export async function declaredDelta(input) {
  const { createHash } = await import('node:crypto');
  const parentRow = input.tables.activation_history[0],
    parent = JSON.parse(parentRow.manifest_json),
    current = JSON.parse(input.tables.activation_history.at(-1).manifest_json);
  const oldRecord = { activationId: parentRow.id, parent: parent.parent, state: parent.state };
  const draft = {
    kind: 'TRANSITION_DRAFT',
    activationId: parentRow.id,
    oldBasis: parent.state.basis,
    targetSource: {
      repositoryId: current.state.basis.repositoryId,
      revisionId: current.state.basis.revisionId,
      contentFingerprint: current.state.basis.contentFingerprint,
    },
    historyDigest: createHash('sha256').update(referenceCanonical(oldRecord)).digest('hex'),
    ledgerDigest: createHash('sha256')
      .update(referenceCanonical({ componentOnly: true, oldRecord, target: current.state }))
      .digest('hex'),
    diff: current.state.inventory.map((f) => ({ kind: 'UNCHANGED', before: f, after: f })),
    supportDecisions: [],
    addedEvidenceIds: [],
    survivingFactKeys: [],
    coverageOrigins: [],
    syntaxRequirements: [],
  };
  await resealManifest(input, (m) => {
    m.transitions = draft;
  });
}
// Test-only immutable row seed; caller must prove AVAILABLE via the real capture API.
// This never authenticates a producer, full revalidation, Runtime, or Native execution.
export async function installComponentManifest(db, manifest) {
  const { createHash } = await import('node:crypto'),
    m = structuredClone(manifest),
    H = (d, v) =>
      createHash('sha256')
        .update(d + '\0' + referenceCanonical(v))
        .digest('hex');
  m.codeIdentity = m.state.basis.codeActivationDigest;
  m.sourceIdentity = H('codeatlas-activation-source-v1', m.state.inventory);
  m.originRegistryDigest = H('codeatlas-activation-origins-v1', m.state.snapshots);
  const digest = H('codeatlas-activation-history-v1', m),
    id = 'activation:' + digest;
  db.exec('BEGIN');
  try {
    db.prepare(
      'INSERT INTO activation_history(id,repository_id,revision_id,parent_id,manifest_digest,manifest_json)VALUES(?,?,?,?,?,?)',
    ).run(
      id,
      m.state.basis.repositoryId,
      m.state.basis.revisionId,
      m.parent?.activationId ?? null,
      digest,
      referenceCanonical(m),
    );
    db.prepare('INSERT INTO active_history_pointer(repository_id,activation_id)VALUES(?,?)').run(
      m.state.basis.repositoryId,
      id,
    );
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return m;
}
