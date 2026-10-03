import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { RepositoryAnalysisStage, readNativeAnalysisState } from '../../../storage/dist/index.js';
import { validateNativeStateCandidate } from '../../../providers/dist/index.js';
import { nativeMetadataEnvironment } from '../../dist/native-metadata-admission.js';
import { buildMemoryCase, caseJsonFiles, corpusExpected } from './native-metadata-corpus.mjs';

const name = process.argv[2];
const started = performance.now();
const samples = [
  { phase: 'start', memory: process.memoryUsage(), peakKiB: process.resourceUsage().maxRSS },
];
const environment = nativeMetadataEnvironment();
const value = buildMemoryCase(name);
// Provisional measurement-only composition. No Canonical Store, Apply or
// production Runtime port: it cannot publish facts or establish admission.
const limits = {
  maxSerializedBytes: 1_000_000,
  memoryBudgetBytes: name.includes('oversized') ? 16 * 1024 * 1024 : Number.MAX_SAFE_INTEGER,
};
const db = new DatabaseSync(':memory:');
const manifestUrl = new URL(
  '../../../storage/migrations/repository/manifest.json',
  import.meta.url,
);
const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
for (const entry of manifest.migrations)
  db.exec(readFileSync(new URL(entry.file, manifestUrl), 'utf8'));
db.exec(`PRAGMA user_version=${manifest.migrations.at(-1).version};
  INSERT INTO repository(slot,id,root_path) VALUES(1,'repo','/calibration');
  INSERT INTO revisions(id,repository_id,kind,content_fingerprint) VALUES('worktree','repo','WORKTREE','fp');
  INSERT INTO repository_state(repository_id,indexed_revision_id,indexed_content_fingerprint) VALUES('repo','worktree','fp');
  INSERT INTO provider_snapshots(id,repository_id,provider_id,provider_version,runtime_version,requested_revision_id,
    requested_revision_fingerprint,started_at,completed_at,outcome) VALUES('snapshot','repo','native','0.0.0','0.0.0','worktree','fp',1,2,'SUCCEEDED');`);
db.prepare('INSERT INTO native_analysis_state VALUES(?,?,?,?,?,?)').run(
  'repo',
  'native',
  'snapshot',
  'worktree',
  'fp',
  JSON.stringify(value.header),
);
let rows = caseJsonFiles(value);
let stage = new RepositoryAnalysisStage(db, limits);
let sealOutcome;
try {
  for (const s of value.summaries) {
    await stage.accept({ type: 'SOURCE_FILE', payload: s.sourceFile });
    for (const coverage of s.coverage) await stage.accept({ type: 'COVERAGE', payload: coverage });
  }
  for (const node of value.nodes) await stage.accept({ type: 'NODE', payload: node });
  for (const s of value.summaries) await stage.acceptNativeSummary(s);
} catch (error) {
  if (name !== 'duplicate-metadata' || !/UNIQUE/.test(error.message)) throw error;
  sealOutcome = 'INVALID';
}
if (name === 'deep-unknown-input') {
  // Replace retained metadata with the same deep unknown envelope via the
  // bounded stage API, rather than JSON.stringify recursively in the harness.
  stage.close();
  stage = new RepositoryAnalysisStage(db, limits);
  await stage.accept({ type: 'SOURCE_FILE', payload: value.summaries[0].sourceFile });
  await stage.accept({ type: 'COVERAGE', payload: value.summaries[0].coverage[0] });
  await stage.acceptNativeSummary(value.unknownSummary);
  const row = db.prepare('SELECT summary_json FROM temp.analysis_native_summary').get();
  rows[0].summaryJson = row.summary_json;
}
const insert = db.prepare('INSERT INTO native_analysis_file VALUES(?,?,?,?,?,?)');
for (const [i, row] of rows.entries()) {
  insert.run(
    'repo',
    'native',
    name === 'duplicate-metadata' && i ? `${row.sourceFileId}-duplicate` : row.sourceFileId,
    name === 'duplicate-metadata' && i ? `${row.sourcePath}.duplicate` : row.sourcePath,
    row.contentFingerprint,
    row.summaryJson,
  );
}
if (name === 'oversized-sql-column')
  db.prepare('UPDATE native_analysis_file SET source_path=?').run(
    'x'.repeat(limits.memoryBudgetBytes + 1),
  );
if (name === 'oversized-staged-fact') {
  // The legacy stage can contain arbitrary unknown event payloads. Native seal
  // must preflight that payload before any Provider iterator decodes it.
  await stage.accept({
    type: 'DIAGNOSTIC',
    payload: {
      code: 'OVERSIZED',
      severity: 'ERROR',
      message: 'x'.repeat(1_000_001),
      sourceRange: null,
    },
  });
}
const textBytes = (table, columns) =>
  db
    .prepare(
      `SELECT coalesce(sum(${columns.map((c) => `coalesce(length(CAST(${c} AS BLOB)),0)`).join('+')}),0) AS n FROM ${table}`,
    )
    .get().n;
const retainedReadSqlBytes =
  textBytes('native_analysis_state', [
    'repository_id',
    'provider_id',
    'provider_snapshot_id',
    'revision_id',
    'content_fingerprint',
    'header_json',
  ]) +
  textBytes('native_analysis_file', [
    'source_file_id',
    'source_path',
    'content_fingerprint',
    'summary_json',
  ]) +
  textBytes('repository_state', ['indexed_revision_id', 'indexed_content_fingerprint']) +
  textBytes('provider_snapshots', [
    'id',
    'repository_id',
    'provider_id',
    'provider_version',
    'requested_revision_id',
    'requested_revision_fingerprint',
    'outcome',
  ]) +
  textBytes('revisions', ['id', 'repository_id', 'kind']);
const retainedSealSqlBytes =
  Buffer.byteLength(JSON.stringify(value.header)) +
  textBytes('temp.analysis_native_summary', [
    'source_file_id',
    'source_path',
    'content_fingerprint',
    'summary_json',
  ]) +
  textBytes('temp.analysis_event', ['payload']);
// Exact persistent-value preservation is checked in SQLite, including the
// oversized TEXT column, without fetching that column into a Node assertion.
const durableTables = [
  'native_analysis_state',
  'native_analysis_file',
  'repository_state',
  'provider_snapshots',
];
for (const table of durableTables)
  db.exec(`CREATE TEMP TABLE calibration_${table} AS SELECT * FROM ${table}`);
function assertUnchanged() {
  for (const table of durableTables)
    for (const [a, b] of [
      [table, `temp.calibration_${table}`],
      [`temp.calibration_${table}`, table],
    ])
      assert.equal(
        db.prepare(`SELECT count(*) AS n FROM (SELECT * FROM ${a} EXCEPT SELECT * FROM ${b})`).get()
          .n,
        0,
      );
}
const preparationMs = performance.now() - started;
const corpusPayloadDigest = createHash('sha256')
  .update(JSON.stringify(value.header))
  .update(rows.map((r) => r.summaryJson).join('\n'))
  .digest('hex');
samples.push({
  phase: 'prepared',
  memory: process.memoryUsage(),
  peakKiB: process.resourceUsage().maxRSS,
});
const readStarted = performance.now();
const read = readNativeAnalysisState(db, corpusExpected, validateNativeStateCandidate, limits);
const readOutcome = read.status === 'AVAILABLE' ? 'AVAILABLE' : read.reason;
// A staged-fact refusal has no corresponding corrupt persistent summary.
assert.equal(readOutcome, name === 'oversized-staged-fact' ? 'AVAILABLE' : value.outcome);
assert.equal(db.isTransaction, false);
assertUnchanged();
const readMs = performance.now() - readStarted;
samples.push({
  phase: 'read',
  memory: process.memoryUsage(),
  peakKiB: process.resourceUsage().maxRSS,
});
const sealStarted = performance.now();
if (!sealOutcome) {
  const counts = {};
  for (const [key, type] of [
    ['sourceFiles', 'SOURCE_FILE'],
    ['nodes', 'NODE'],
    ['edges', 'EDGE'],
    ['coverage', 'COVERAGE'],
    ['diagnostics', 'DIAGNOSTIC'],
  ])
    counts[key] = db
      .prepare('SELECT count(*) AS n FROM temp.analysis_event WHERE type=?')
      .get(type).n;
  stage.confirmSucceeded({
    type: 'ANALYSIS_COMPLETED',
    payload: {
      outcome: 'SUCCEEDED',
      repositoryId: 'repo',
      revisionId: 'worktree',
      revisionFingerprint: 'fp',
      providerSnapshotId: 'snapshot',
      capabilities: [],
      counts,
    },
  });
  try {
    stage.sealNativeState(
      JSON.stringify(value.header),
      corpusExpected,
      validateNativeStateCandidate,
      limits,
    );
    sealOutcome = 'AVAILABLE';
  } catch (error) {
    sealOutcome =
      error.nativeStateReason ??
      (/resource/i.test(error.message) ? 'RESOURCE_LIMIT_EXCEEDED' : undefined);
    if (!sealOutcome) throw error;
  }
}
assert.equal(sealOutcome, name === 'oversized-sql-column' ? 'AVAILABLE' : value.outcome);
assertUnchanged();
const sealMs = performance.now() - sealStarted;
samples.push({
  phase: 'seal',
  memory: process.memoryUsage(),
  peakKiB: process.resourceUsage().maxRSS,
});
const serializedBytes =
  Buffer.byteLength(JSON.stringify(value.header)) +
  rows.reduce((n, row) => n + Buffer.byteLength(row.summaryJson), 0);
stage.close();
db.close();
const peakKiB = process.resourceUsage().maxRSS;
if (!Number.isSafeInteger(peakKiB) || peakKiB <= 0)
  throw Error('Peak resident measurement unavailable');
console.log(
  JSON.stringify({
    name,
    environment,
    serializedBytes,
    retainedReadSqlBytes,
    retainedSealSqlBytes,
    retainedReadStringChargeBytes: 2 * retainedReadSqlBytes,
    retainedSealStringChargeBytes: 2 * retainedSealSqlBytes,
    corpusPayloadDigest,
    preparationMs,
    readMs,
    sealMs,
    readOutcome,
    sealOutcome,
    samples,
    peakMethod: 'resourceUsage.maxRSS',
    peakSourceUnits: 'KiB',
    peakUnits: 'bytes',
    peakResidentBytes: peakKiB * 1024,
    persistentStateUnchanged: true,
    transactionClosed: true,
  }),
);
