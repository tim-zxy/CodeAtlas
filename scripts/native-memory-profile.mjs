import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  memoryCases,
  corpusRevision,
} from '../packages/runtime/test/helpers/native-metadata-corpus.mjs';
import { transportMemoryCases } from '../packages/providers/test/helpers/native-full-v3-memory-corpus.mjs';

export const memoryPolicyRevision = 'p05-native-memory-high-water-range-v1';
export const requiredMemoryCases = { READ_SEAL: memoryCases, FULL_TRANSPORT: transportMemoryCases };
const sha = (value) => createHash('sha256').update(value).digest('hex');
const positive = (value) =>
  assert.ok(Number.isSafeInteger(value) && value > 0, 'Invalid memory bytes');
function keys(value, required, optional = []) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Expected object');
  assert.ok(
    required.every((key) => Object.hasOwn(value, key)),
    'Missing field',
  );
  assert.ok(
    Object.keys(value).every((key) => [...required, ...optional].includes(key)),
    'Unknown field',
  );
}
function environment(value) {
  keys(value, [
    'node',
    'v8',
    'platform',
    'arch',
    'zodVersion',
    'implementationDigest',
    'corpusRevision',
  ]);
  for (const field of ['node', 'v8', 'platform', 'arch', 'zodVersion', 'corpusRevision'])
    assert.ok(typeof value[field] === 'string' && value[field].length > 0);
  assert.match(value.implementationDigest, /^[a-f0-9]{64}$/);
}
export function calculateNativeMemoryReservation(groups, previousApprovedBytes = null) {
  assert.ok(Array.isArray(groups) && groups.length > 0);
  const seen = new Set();
  let observedPeakBytes = 0,
    fluctuationAllowanceBytes = 0;
  for (const group of groups) {
    assert.ok(typeof group.key === 'string' && group.key.length && !seen.has(group.key));
    seen.add(group.key);
    positive(group.low);
    positive(group.high);
    assert.ok(group.low <= group.high);
    observedPeakBytes = Math.max(observedPeakBytes, group.high);
    fluctuationAllowanceBytes = Math.max(fluctuationAllowanceBytes, group.high - group.low);
  }
  const measured = observedPeakBytes + fluctuationAllowanceBytes;
  positive(measured);
  if (previousApprovedBytes !== null) positive(previousApprovedBytes);
  return {
    observedPeakBytes,
    fluctuationAllowanceBytes,
    priorApprovalFloorBytes: previousApprovedBytes,
    reservationBytes: Math.max(measured, previousApprovedBytes ?? 0),
  };
}
export async function currentMemoryCorpora() {
  const lists = {
    READ_SEAL: [
      'packages/runtime/test/helpers/native-metadata-corpus.mjs',
      'packages/runtime/test/helpers/native-metadata-worker.mjs',
      'scripts/bench-native-metadata-memory.mjs',
    ],
    FULL_TRANSPORT: [
      'scripts/bench-native-full-v3-memory.mjs',
      'packages/providers/test/helpers/native-full-v3-memory-worker.mjs',
      'packages/providers/test/helpers/native-full-v3-memory-corpus.mjs',
      'packages/providers/test/fixtures/native-full-v3-memory-child.mjs',
      'packages/runtime/test/helpers/native-metadata-corpus.mjs',
    ],
  };
  const result = {};
  for (const [workspace, files] of Object.entries(lists)) {
    const hash = createHash('sha256');
    for (const file of files) hash.update(await readFile(new URL('../' + file, import.meta.url)));
    result[workspace] = {
      revision: workspace === 'READ_SEAL' ? corpusRevision : 'p05-native-full-v3-memory-v1',
      digest: hash.digest('hex'),
    };
  }
  return result;
}
export function validateNativeMemoryObservation(row, workspace, expectedEnvironment) {
  const shared = ['name', 'environment', 'samples', 'peakResidentBytes', 'peakMethod', 'peakUnits'];
  const specific =
    workspace === 'READ_SEAL'
      ? [
          'serializedBytes',
          'retainedReadSqlBytes',
          'retainedSealSqlBytes',
          'retainedReadStringChargeBytes',
          'retainedSealStringChargeBytes',
          'corpusPayloadDigest',
          'preparationMs',
          'readMs',
          'sealMs',
          'readOutcome',
          'sealOutcome',
          'peakSourceUnits',
          'persistentStateUnchanged',
          'transactionClosed',
        ]
      : ['outcome', 'accepted', 'maximumOverlap', 'counts', 'requestHeaderBytes', 'scope'];
  keys(row, [...shared, ...specific], ['repetition']);
  assert.ok(requiredMemoryCases[workspace]?.includes(row?.name), 'Unknown memory case');
  environment(row.environment);
  assert.deepEqual(row.environment, expectedEnvironment);
  positive(row.peakResidentBytes);
  assert.equal(row.peakMethod, 'resourceUsage.maxRSS');
  assert.equal(row.peakUnits, 'bytes');
  assert.ok(Array.isArray(row.samples));
  for (const sample of row.samples) {
    keys(sample, ['phase', 'memory', 'peakKiB'], ['elapsedMs']);
    assert.ok(typeof sample.phase === 'string' && sample.phase.length);
    positive(sample.peakKiB);
    keys(sample.memory, ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers']);
    assert.ok(Object.values(sample.memory).every((n) => Number.isSafeInteger(n) && n >= 0));
  }
  if (workspace === 'READ_SEAL') {
    assert.equal(row.persistentStateUnchanged, true);
    assert.equal(row.transactionClosed, true);
    assert.match(row.corpusPayloadDigest, /^[a-f0-9]{64}$/);
    const invalid = ['duplicate-metadata', 'foreign-metadata', 'deep-unknown-input'];
    const exhausted = ['oversized-sql-column', 'oversized-staged-fact'];
    const outcome = invalid.includes(row.name)
      ? 'INVALID'
      : exhausted.includes(row.name)
        ? 'RESOURCE_LIMIT_EXCEEDED'
        : 'AVAILABLE';
    assert.equal(row.readOutcome, row.name === 'oversized-staged-fact' ? 'AVAILABLE' : outcome);
    assert.equal(row.sealOutcome, row.name === 'oversized-sql-column' ? 'AVAILABLE' : outcome);
    assert.equal(row.retainedReadStringChargeBytes, 2 * row.retainedReadSqlBytes);
    assert.equal(row.retainedSealStringChargeBytes, 2 * row.retainedSealSqlBytes);
  } else {
    keys(
      row.counts,
      [],
      [
        'ANALYSIS_STARTED',
        'SOURCE_FILE',
        'NODE',
        'EDGE',
        'COVERAGE',
        'DIAGNOSTIC',
        'ANALYSIS_SUMMARY',
        'failureMessage',
      ],
    );
    const outcome =
      {
        'duplicate-metadata': 'PROTOCOL_VIOLATION',
        'foreign-metadata': 'PROTOCOL_VIOLATION',
        'deep-unknown-input': 'PROTOCOL_VIOLATION',
        'oversized-staged-fact': 'OUTPUT_LIMIT_EXCEEDED',
      }[row.name] ?? 'SUCCEEDED';
    assert.equal(row.outcome, outcome);
    assert.equal(row.maximumOverlap, 1);
  }
  return row;
}
async function confined(root, relative) {
  assert.ok(typeof relative === 'string' && relative.length && !path.isAbsolute(relative));
  const lexical = path.resolve(root, relative),
    rel = path.relative(root, lexical);
  assert.ok(rel && !rel.startsWith('..') && !path.isAbsolute(rel), 'Report outside fixture root');
  const resolved = await realpath(lexical),
    final = path.relative(root, resolved);
  assert.ok(
    final && !final.startsWith('..') && !path.isAbsolute(final),
    'Report symlink outside fixture root',
  );
  return resolved;
}
export async function buildNativeMemoryCandidate(manifestPath, fixtureRoot) {
  const root = await realpath(fixtureRoot),
    rawManifest = await readFile(manifestPath),
    manifest = JSON.parse(rawManifest);
  keys(manifest, [
    'schemaVersion',
    'policyRevision',
    'environment',
    'corpora',
    'requiredCases',
    'reports',
    'priorApprovals',
  ]);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.policyRevision, memoryPolicyRevision);
  environment(manifest.environment);
  assert.deepEqual(manifest.corpora, await currentMemoryCorpora());
  assert.deepEqual(manifest.requiredCases, requiredMemoryCases);
  assert.ok(Array.isArray(manifest.reports) && Array.isArray(manifest.priorApprovals));
  const records = [],
    paths = new Set(),
    digests = new Set();
  for (const entry of manifest.reports) {
    keys(
      entry,
      ['path', 'sha256', 'workspace', 'purpose', 'command', 'collectionConditions'],
      ['caseName', 'corpusPayloadDigest', 'parentCalibrationSha256'],
    );
    assert.ok(Object.hasOwn(requiredMemoryCases, entry.workspace));
    assert.ok(['calibration', 'diagnostic', 'verification'].includes(entry.purpose));
    assert.ok(
      typeof entry.command === 'string' &&
        entry.command.length &&
        typeof entry.collectionConditions === 'string' &&
        entry.collectionConditions.length,
    );
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    const file = await confined(root, entry.path);
    assert.ok(!paths.has(file) && !digests.has(entry.sha256), 'Duplicate report');
    paths.add(file);
    digests.add(entry.sha256);
    const bytes = await readFile(file);
    assert.equal(sha(bytes), entry.sha256, 'Raw hash mismatch');
    const report = JSON.parse(bytes),
      workspace = entry.workspace;
    if (entry.purpose === 'verification')
      throw Error('Verification cannot select its own candidate');
    let rows;
    if (entry.purpose === 'calibration') {
      assert.equal(report.schemaVersion, 1);
      assert.equal(report.status, 'PROVISIONAL_REVIEW_REQUIRED');
      assert.deepEqual(report.environment, manifest.environment);
      assert.equal(report.corpusRevision, manifest.corpora[workspace].revision);
      assert.equal(report.corpusDigest, manifest.corpora[workspace].digest);
      assert.equal(report.repetitions, 5);
      assert.deepEqual(report.cases, requiredMemoryCases[workspace]);
      rows = report.observations;
      assert.ok(Array.isArray(rows));
      assert.equal(rows.length, 5 * report.cases.length);
      for (const name of report.cases)
        assert.deepEqual(
          rows
            .filter((row) => row.name === name)
            .map((row) => row.repetition)
            .sort(),
          [1, 2, 3, 4, 5],
        );
      assert.equal(report.reservationBytes, Math.max(...rows.map((row) => row.peakResidentBytes)));
      if (workspace === 'READ_SEAL')
        for (const name of report.cases) {
          assert.equal(
            new Set(rows.filter((row) => row.name === name).map((row) => row.corpusPayloadDigest))
              .size,
            1,
            'Calibration input changed within case',
          );
        }
    } else {
      assert.equal(workspace, 'READ_SEAL');
      assert.ok(Array.isArray(report) && report.length > 0);
      assert.ok(requiredMemoryCases.READ_SEAL.includes(entry.caseName));
      assert.match(entry.corpusPayloadDigest ?? '', /^[a-f0-9]{64}$/);
      assert.match(entry.parentCalibrationSha256 ?? '', /^[a-f0-9]{64}$/);
      rows = report;
      for (const row of rows) {
        assert.equal(row.name, entry.caseName);
        assert.equal(row.corpusPayloadDigest, entry.corpusPayloadDigest);
      }
    }
    rows.forEach((row) => validateNativeMemoryObservation(row, workspace, manifest.environment));
    records.push({ entry, rows });
  }
  for (const workspace of Object.keys(requiredMemoryCases))
    assert.ok(
      records.some((r) => r.entry.workspace === workspace && r.entry.purpose === 'calibration'),
      'Missing calibration workspace',
    );
  // Refuse selective manifests that leave a compatible raw high-water report
  // beside the declared evidence. Verification/candidate/index files are not
  // raw calibration or diagnostic observations and never select a candidate.
  for (const name of await readdir(root)) {
    if (!name.endsWith('.json')) continue;
    const bytes = await readFile(await confined(root, name));
    let existing;
    try {
      existing = JSON.parse(bytes);
    } catch {
      continue;
    }
    const rows = Array.isArray(existing) ? existing : existing?.observations;
    const rawReport = Array.isArray(existing)
      ? rows.length > 0 && rows.every((row) => row?.readOutcome !== undefined)
      : existing?.corpusRevision && existing?.status === 'PROVISIONAL_REVIEW_REQUIRED';
    if (
      rawReport &&
      rows?.length &&
      rows.every((row) => isDeepStrictEqual(row.environment, manifest.environment))
    )
      assert.ok(digests.has(sha(bytes)), 'Omitted compatible raw history');
  }
  for (const { entry, rows } of records.filter((r) => r.entry.purpose === 'diagnostic')) {
    const parent = records.find(
      (r) =>
        r.entry.sha256 === entry.parentCalibrationSha256 &&
        r.entry.purpose === 'calibration' &&
        r.entry.workspace === entry.workspace,
    );
    assert.ok(
      parent?.rows.some(
        (row) =>
          row.name === entry.caseName && row.corpusPayloadDigest === rows[0].corpusPayloadDigest,
      ),
      'Diagnostic parent/payload missing',
    );
  }
  const groups = new Map();
  for (const { entry, rows } of records)
    for (const row of rows) {
      const inputIdentity =
        entry.workspace === 'READ_SEAL'
          ? row.corpusPayloadDigest
          : manifest.corpora[entry.workspace].digest;
      const key = JSON.stringify([entry.workspace, row.name, inputIdentity]);
      const g = groups.get(key) ?? {
        key,
        workspace: entry.workspace,
        caseName: row.name,
        inputIdentity,
        count: 0,
        low: row.peakResidentBytes,
        high: row.peakResidentBytes,
      };
      g.count++;
      g.low = Math.min(g.low, row.peakResidentBytes);
      g.high = Math.max(g.high, row.peakResidentBytes);
      g.range = g.high - g.low;
      groups.set(key, g);
    }
  let floor = null;
  for (const approval of manifest.priorApprovals) {
    keys(approval, ['environment', 'reservationBytes', 'status', 'approvalReference']);
    assert.deepEqual(approval.environment, manifest.environment);
    positive(approval.reservationBytes);
    assert.ok(
      ['approved', 'withdrawn'].includes(approval.status) &&
        typeof approval.approvalReference === 'string' &&
        approval.approvalReference.length,
    );
    floor = Math.max(floor ?? 0, approval.reservationBytes);
  }
  const sorted = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key, 'en'));
  return {
    schemaVersion: 1,
    status: 'PROVISIONAL_REVIEW_REQUIRED',
    policyRevision: memoryPolicyRevision,
    environment: manifest.environment,
    corpora: manifest.corpora,
    manifestDigest: sha(rawManifest),
    reportDigests: records.map((r) => r.entry.sha256).sort(),
    groups: sorted,
    ...calculateNativeMemoryReservation(sorted, floor),
  };
}
export async function loadNativeMemoryCandidate(candidatePath) {
  const file = await realpath(candidatePath),
    root = path.dirname(file),
    raw = await readFile(file);
  const candidate = JSON.parse(raw);
  assert.match(candidate.manifestDigest ?? '', /^[a-f0-9]{64}$/);
  let manifestPath;
  for (const name of await readdir(root)) {
    if (!name.endsWith('.json')) continue;
    const sibling = await confined(root, name);
    if (sha(await readFile(sibling)) === candidate.manifestDigest) manifestPath = sibling;
  }
  assert.ok(manifestPath, 'Candidate manifest missing');
  assert.deepEqual(
    candidate,
    await buildNativeMemoryCandidate(manifestPath, root),
    'Candidate differs from frozen evidence',
  );
  return { candidate, digest: sha(raw) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv[2], 'candidate');
    assert.equal(process.argv.length, 5);
    console.log(
      JSON.stringify(await buildNativeMemoryCandidate(process.argv[3], process.argv[4]), null, 2),
    );
  } catch {
    console.error('Native memory evidence validation failed');
    process.exitCode = 1;
  }
}
