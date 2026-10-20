import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as inspection from '../dist/analysis/evaluation-state.js';
import { RepositorySourceStateStore, readNativeAnalysisState } from '../dist/index.js';
import { validateNativeStateCandidate } from '../../providers/dist/index.js';
import { emptyNativePatch } from './helpers/native-refresh-patch-fixture.mjs';
import { baseCase } from '../../providers/test/helpers/native-full-v3-corpus.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// These are low-level component limits, not an admitted Runtime resource profile.
const limits = { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 16 * 1024 * 1024 };
const control = () => ({
  checkpoint: async () => {},
  reserveText() {},
  chargeMetadataRow() {},
});

async function fixture(t, databasePath = ':memory:', populated = false) {
  const value = await emptyNativePatch(t, true, false, populated ? [] : null, databasePath);
  value.stage.close();
  const sourceFiles = baseCase(populated ? 'shared' : 'empty').bundle.summaries.map(
    (s) => s.sourceFile,
  );
  const binding = {
    expected: value.context.baseline.expected,
    snapshotId: 'snap',
    token: value.token,
    sourceFiles,
    limits,
  };
  const source = new RepositorySourceStateStore(value.db);
  if (populated) {
    const initial = source.load('r');
    source.replace(initial, {
      revision: { ...initial.revision, contentFingerprint: 'base' },
      files: sourceFiles,
    });
  }
  value.db.exec('PRAGMA query_only=1');
  const before = await inspection.readEvaluationStateRows(value.db, 'r', control());
  value.db.exec('PRAGMA query_only=0');
  const old = source.load('r');
  source.replace(old, {
    revision: { ...old.revision, contentFingerprint: 'target' },
    files: old.files.map((f) => ({ ...f, classification: { ...f.classification, role: 'TEST' } })),
  });
  value.db.exec('PRAGMA query_only=1');
  return { ...value, binding, before };
}

test('retained inspection separates advanced Source from the old indexed publication', async (t) => {
  const { db, binding } = await fixture(t);
  await assert.rejects(inspection.readEvaluationStateRows(db, 'r', control()));
  const rows = await inspection.readEvaluationRetainedStateRows(db, 'r', control(), binding);
  assert.equal(rows.revisions[0].content_fingerprint, 'target');
  assert.equal(rows.source_files[0].role, 'TEST');
  assert.equal(rows.repository_state[0].indexed_content_fingerprint, 'base');
  assert.equal(rows.provider_snapshots[0].requested_revision_fingerprint, 'base');
  assert.equal(rows.native_analysis_state[0].content_fingerprint, 'base');
  assert.equal(db.isTransaction, false);
  await assert.rejects(inspection.readEvaluationStateRows(db, 'r', control()));
});

for (const [name, change] of [
  ['repository', (b) => (b.expected.repositoryId = 'other')],
  ['fingerprint', (b) => (b.expected.contentFingerprint = 'target')],
  ['snapshot', (b) => (b.snapshotId = 'other')],
  ['token', (b) => (b.token.committedSnapshotCount = 99)],
  ['summary token', (b) => (b.token.states[0].summaryDigest = '0'.repeat(64))],
  ['Source owner', (b) => (b.sourceFiles[0].repositoryId = 'other')],
  ['language', (b) => (b.expected.language.grammarVersion = 'other')],
  ['policy', (b) => (b.expected.policyFingerprint = 'other')],
  ['capabilities', (b) => (b.expected.requestedCapabilities = ['CALL'])],
]) {
  test(`retained inspection rejects a wrong original ${name} binding`, async (t) => {
    const { db, binding } = await fixture(t);
    const wrong = structuredClone(binding);
    change(wrong);
    await assert.rejects(
      async () => inspection.readEvaluationRetainedStateRows(db, 'r', control(), wrong),
      /Evaluation stored state unavailable or invalid/,
    );
    assert.equal(db.isTransaction, false);
  });
}

test('retained inspection propagates budget refusal without ending a borrowed transaction', async (t) => {
  const { db, binding } = await fixture(t);
  const refusal = new Error('component text budget exhausted');
  db.exec('BEGIN');
  await assert.rejects(
    async () =>
      inspection.readEvaluationRetainedStateRows(
        db,
        'r',
        {
          ...control(),
          reserveText() {
            throw refusal;
          },
        },
        binding,
      ),
    (error) => error === refusal,
  );
  assert.equal(db.isTransaction, true);
  db.exec('ROLLBACK');
});

test('retained row inspection enforces its own memory bound before fetching TEXT', async (t) => {
  const { db, binding } = await fixture(t);
  const wrong = { ...binding, limits: { ...limits, memoryBudgetBytes: 1 } };
  let fetchedText = false;
  await assert.rejects(
    async () =>
      inspection.readEvaluationRetainedStateRows(
        db,
        'r',
        {
          ...control(),
          reserveText() {
            fetchedText = true;
          },
        },
        wrong,
      ),
    /Evaluation stored state unavailable or invalid/,
  );
  assert.equal(fetchedText, false);
});

test('retained Native inspection validates old summaries against the original Source inventory', async (t) => {
  const { db, binding } = await fixture(t);
  const result = await inspection.readEvaluationRetainedNativeState(
    db,
    binding,
    control(),
    validateNativeStateCandidate,
  );
  assert.equal(result.kind, 'RETAINED_PUBLICATION_ONLY');
  assert.equal(result.state.expected.contentFingerprint, 'base');
  assert.equal(
    JSON.parse(result.state.files[0].summaryJson).sourceFile.classification.role,
    'SOURCE',
  );
  assert.deepEqual(result.token, binding.token);
  await assert.rejects(inspection.readEvaluationStateRows(db, 'r', control()));
  assert.equal(db.isTransaction, false);
});

test('retained Native inspection rejects target metadata substituted for original Source', async (t) => {
  const { db, binding } = await fixture(t);
  const wrong = structuredClone(binding);
  wrong.sourceFiles[0].classification.role = 'TEST';
  await assert.rejects(async () =>
    inspection.readEvaluationRetainedNativeState(
      db,
      wrong,
      control(),
      validateNativeStateCandidate,
    ),
  );
});

test('reopened retained publication preserves nonempty graph and all provenance without publishing', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-retained-evaluation-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'repository.sqlite');
  const { db, binding, before } = await fixture(t, databasePath, true);
  assert.ok(before.canonical_nodes.length > 0);
  assert.ok(before.evidence.length > 0);
  db.close();
  const reader = new DatabaseSync(databasePath, { readOnly: true });
  try {
    reader.exec('PRAGMA query_only=1; BEGIN');
    const rows = await inspection.readEvaluationRetainedStateRows(reader, 'r', control(), binding);
    for (const table of Object.keys(before).filter(
      (key) => !['revisions', 'source_files'].includes(key),
    ))
      assert.deepEqual(rows[table], before[table], table);
    const native = await inspection.readEvaluationRetainedNativeState(
      reader,
      binding,
      control(),
      validateNativeStateCandidate,
    );
    assert.equal(native.state.files.length, 2);
    assert.equal(reader.isTransaction, true);
    await assert.rejects(inspection.readEvaluationStateRows(reader, 'r', control()));
    assert.equal(reader.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 1);
    reader.exec('ROLLBACK');
  } finally {
    reader.close();
  }
});

test('Native validation loses twice the retained SQL image bytes from its available memory', async (t) => {
  const { db, binding } = await fixture(t);
  let baselineMemory;
  const direct = readNativeAnalysisState(
    db,
    binding.expected,
    (input) => {
      baselineMemory = input.memoryBudgetBytes;
      return validateNativeStateCandidate(input);
    },
    limits,
  );
  assert.equal(direct.status, 'AVAILABLE');
  const image = await inspection.readEvaluationRetainedStateRows(db, 'r', control(), binding);
  const imageBytes = Object.values(image)
    .flat()
    .reduce(
      (sum, row) =>
        sum +
        Object.values(row).reduce(
          (bytes, value) => bytes + (typeof value === 'string' ? Buffer.byteLength(value) : 0),
          0,
        ),
      0,
    );
  let actualMemory;
  await inspection.readEvaluationRetainedNativeState(db, binding, control(), (input) => {
    actualMemory = input.memoryBudgetBytes;
    return validateNativeStateCandidate(input);
  });
  assert.equal(actualMemory, baselineMemory - 2 * imageBytes);
});

for (const borrowed of [false, true]) {
  test(`Native inspection preserves validator failure and ${borrowed ? 'borrows' : 'closes'} its read transaction`, async (t) => {
    const { db, binding } = await fixture(t);
    const failure = new Error('component validator refusal');
    if (borrowed) db.exec('BEGIN');
    await assert.rejects(
      async () =>
        inspection.readEvaluationRetainedNativeState(db, binding, control(), () => {
          throw failure;
        }),
      (error) => error === failure,
    );
    assert.equal(db.isTransaction, borrowed);
    assert.equal(db.isOpen, true);
    if (borrowed) db.exec('ROLLBACK');
  });
}

test('Native inspection refuses corrupt historical summaries without publishing or leaving a transaction', async (t) => {
  const { db, binding } = await fixture(t);
  db.exec('PRAGMA query_only=0');
  // Fault injection into derived state only, never a Canonical publication seed.
  db.prepare('UPDATE native_analysis_file SET summary_json=?').run('{}');
  db.exec('PRAGMA query_only=1');
  await assert.rejects(
    async () =>
      inspection.readEvaluationRetainedNativeState(
        db,
        binding,
        control(),
        validateNativeStateCandidate,
      ),
    /Evaluation stored state unavailable or invalid/,
  );
  assert.equal(db.isTransaction, false);
  assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 1);
});

test('retained inspection refuses writable sessions', async (t) => {
  const { db, binding } = await fixture(t);
  db.exec('PRAGMA query_only=0');
  await assert.rejects(
    async () =>
      inspection.readEvaluationRetainedNativeState(
        db,
        binding,
        control(),
        validateNativeStateCandidate,
      ),
    /Evaluation stored state unavailable or invalid/,
  );
  assert.equal(db.isTransaction, false);
});
