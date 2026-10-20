import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  calculateNativeMemoryReservation,
  memoryPolicyRevision,
} from './native-memory-profile.mjs';
import { nativeRefreshTransportProfiles } from '../packages/runtime/dist/native-metadata-profiles.js';
import { assertRefreshPrefixOriginDistinct } from '../packages/runtime/test/helpers/native-refresh-cancel-prefix.mjs';

// Approved D5 class contract. Worker recipes/payloads must still be pinned before measurement.
export const refreshTransportCases = Object.freeze([
  'd-preparation-input',
  'd-retained-sites',
  'd-shared-owners',
  'd-dense-upsert',
  'd-dense-remove',
  'd-dependent-edge',
  'd-complete-coverage',
  'd-overlay-retention',
  'd-delete',
  'd-empty',
  'd-zero-fact',
  'd-sql-preflight',
  'd-slow-stdin',
  'd-slow-sink',
  'd-partial',
  'd-corrupt',
  'd-late-exit',
  'd-cancel',
  'd-source-race',
  'd-token-race',
  'd-rollback',
  'd-reopen',
]);
const workspace = 'REFRESH_TRANSPORT';
const revision = 'p05-native-refresh-transport-memory-v1';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const nonnegative = (n) => assert.ok(Number.isSafeInteger(n) && n >= 0, 'Invalid finite counter');
const positive = (n) => assert.ok(Number.isSafeInteger(n) && n > 0, 'Invalid positive bytes');
function keys(value, required) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Expected object');
  assert.deepEqual(Object.keys(value).sort(), [...required].sort(), 'Missing or unknown fields');
}
function header(value, identity) {
  assert.equal(value.schemaVersion, identityVersion(identity), 'Mixed evidence version');
  assert.equal(value.workspace, workspace);
  assert.deepEqual(value.environment, identity.environment, 'Build environment mismatch');
  assert.deepEqual(value.corpus, identity.corpus, 'Corpus mismatch');
}
const identityVersion = (identity) =>
  Object.hasOwn(identity.inputs['d-cancel'], 'outputContract') ? 2 : 1;

// Feasibility diagnostic only: never a measured reservation or admission approval.
export function checkRefreshTransportInputFeasibility(
  callerBudgetBytes,
  referenceReservationBytes,
  rows,
) {
  positive(callerBudgetBytes);
  if (referenceReservationBytes !== null) positive(referenceReservationBytes);
  assert.deepEqual(rows.map((row) => row.name).sort(), [...refreshTransportCases].sort());
  let maximumSqlChargeBytes = 0;
  for (const row of rows) {
    nonnegative(row.retainedSqlBytes);
    nonnegative(row.retainedSqlStringChargeBytes);
    assert.equal(
      row.retainedSqlStringChargeBytes,
      2 * row.retainedSqlBytes,
      'Incomplete SQL charge',
    );
    maximumSqlChargeBytes = Math.max(maximumSqlChargeBytes, row.retainedSqlStringChargeBytes);
  }
  if (referenceReservationBytes === null) {
    assert.ok(maximumSqlChargeBytes <= callerBudgetBytes, 'D caller input cannot cover SQL');
    return {
      kind: 'OFFLINE_SQL_ONLY_PENDING_CANDIDATE',
      callerBudgetBytes,
      referenceReservationBytes: null,
      maximumSqlChargeBytes,
      maximumAccountedBytes: null,
    };
  }
  const maximumAccountedBytes = referenceReservationBytes + maximumSqlChargeBytes;
  positive(maximumAccountedBytes);
  assert.ok(
    maximumAccountedBytes <= callerBudgetBytes,
    'D caller input cannot cover known reference plus SQL',
  );
  return {
    kind: 'REVIEWED_REFERENCE_DIAGNOSTIC_ONLY',
    callerBudgetBytes,
    referenceReservationBytes,
    maximumSqlChargeBytes,
    maximumAccountedBytes,
  };
}
function evidencePath(value) {
  assert.ok(
    typeof value === 'string' &&
      value.length &&
      !/[\\:\0]/.test(value) &&
      value.split('/').every((part) => part && part !== '.' && part !== '..'),
    'Invalid proof path',
  );
}
function validateIdentity(identity) {
  keys(identity, ['environment', 'corpus', 'inputs']);
  keys(identity.environment, [
    'node',
    'v8',
    'platform',
    'arch',
    'zodVersion',
    'implementationDigest',
    'corpusRevision',
  ]);
  for (const value of Object.values(identity.environment))
    assert.ok(typeof value === 'string' && value.length > 0);
  assert.match(identity.environment.implementationDigest, /^[a-f0-9]{64}$/);
  keys(identity.corpus, ['revision', 'digest']);
  assert.equal(identity.corpus.revision, revision);
  assert.match(identity.corpus.digest, /^[a-f0-9]{64}$/);
  keys(identity.inputs, refreshTransportCases);
  const version = identityVersion(identity);
  for (const [name, input] of Object.entries(identity.inputs)) {
    keys(input, [
      ...(version === 2 ? ['outputContract', 'outputReference'] : []),
      'corpusPayloadDigest',
      'expectedOutcome',
      'inputBytes',
      'largestLineBytes',
      'outputBytes',
      'eventCount',
      'summaryBytes',
    ]);
    assert.match(input.corpusPayloadDigest, /^[a-f0-9]{64}$/);
    assert.ok(typeof input.expectedOutcome === 'string' && input.expectedOutcome.length > 0);
    for (const field of [
      'inputBytes',
      'largestLineBytes',
      'outputBytes',
      'eventCount',
      'summaryBytes',
    ])
      if (!(version === 2 && name === 'd-cancel' && ['outputBytes', 'eventCount'].includes(field)))
        nonnegative(input[field]);
    if (version === 2) {
      if (name === 'd-cancel') {
        keys(input.outputContract, ['kind', 'referencePath', 'provenancePath']);
        assert.equal(input.outputContract.kind, 'CANCELLED_PREFIX');
        assert.equal(input.expectedOutcome, 'CANCELLED');
        assert.equal(input.outputBytes, null);
        assert.equal(input.eventCount, null);
        evidencePath(input.outputContract.referencePath);
        evidencePath(input.outputContract.provenancePath);
        keys(input.outputReference, ['responseSha256', 'provenanceSha256']);
        for (const hash of Object.values(input.outputReference))
          assert.match(hash, /^[a-f0-9]{64}$/);
      } else {
        keys(input.outputContract, ['kind']);
        assert.equal(input.outputContract.kind, 'EXACT');
        assert.equal(input.outputReference, null);
      }
    }
  }
}
export function validateRefreshTransportObservation(
  row,
  identity,
  scope = 'OFFLINE_CALIBRATION_ONLY',
) {
  const version = identityVersion(identity);
  keys(row, [
    ...(version === 2 ? ['outputProof'] : []),
    'name',
    'repetition',
    'workspace',
    'environment',
    'corpus',
    'scope',
    'corpusPayloadDigest',
    'expectedOutcome',
    'observedOutcome',
    'inputBytes',
    'largestLineBytes',
    'outputBytes',
    'eventCount',
    'summaryBytes',
    'persistentStateVerified',
    'transactionClosed',
    'tempClosed',
    'retainedSqlBytes',
    'retainedSqlStringChargeBytes',
    'samples',
    'peakResidentBytes',
    'peakMethod',
    'peakUnits',
  ]);
  assert.ok(refreshTransportCases.includes(row.name), 'Unknown memory class');
  assert.equal(row.workspace, workspace);
  assert.deepEqual(row.environment, identity.environment);
  assert.deepEqual(row.corpus, identity.corpus);
  assert.equal(row.scope, scope);
  const input = identity.inputs[row.name];
  for (const [key, value] of Object.entries(input)) {
    if (
      version === 2 &&
      (['outputContract', 'outputReference'].includes(key) ||
        (row.name === 'd-cancel' && ['outputBytes', 'eventCount'].includes(key)))
    )
      continue;
    assert.equal(row[key], value, `Changed input ${key}`);
  }
  nonnegative(row.outputBytes);
  nonnegative(row.eventCount);
  if (version === 2) {
    if (row.name !== 'd-cancel') assert.equal(row.outputProof, null);
    else {
      const proof = row.outputProof;
      keys(proof, [
        'kind',
        'referenceSha256',
        'provenanceSha256',
        'inputSha256',
        'outputSha256',
        'outputBytes',
        'eventCount',
        'gateVerified',
        'artifact',
      ]);
      assert.equal(proof.kind, 'CANCELLED_PREFIX');
      assert.equal(proof.gateVerified, true);
      assert.equal(proof.referenceSha256, input.outputReference.responseSha256);
      assert.equal(proof.provenanceSha256, input.outputReference.provenanceSha256);
      for (const field of ['inputSha256', 'outputSha256'])
        assert.match(proof[field], /^[a-f0-9]{64}$/);
      assert.equal(proof.outputBytes, row.outputBytes);
      assert.equal(proof.eventCount, row.eventCount);
      positive(row.outputBytes);
      keys(proof.artifact, ['path', 'sha256']);
      evidencePath(proof.artifact.path);
      assert.match(proof.artifact.sha256, /^[a-f0-9]{64}$/);
    }
  }
  assert.equal(row.observedOutcome, row.expectedOutcome, 'Unexpected worker outcome');
  nonnegative(row.repetition);
  for (const field of ['persistentStateVerified', 'transactionClosed', 'tempClosed'])
    assert.equal(row[field], true, `Unverified ${field}`);
  nonnegative(row.retainedSqlBytes);
  nonnegative(row.retainedSqlStringChargeBytes);
  nonnegative(2 * row.retainedSqlBytes);
  assert.equal(row.retainedSqlStringChargeBytes, 2 * row.retainedSqlBytes, 'Wrong SQL surcharge');
  positive(row.peakResidentBytes);
  assert.equal(row.peakMethod, 'resourceUsage.maxRSS');
  assert.equal(row.peakUnits, 'bytes');
  assert.ok(Array.isArray(row.samples) && row.samples.length > 0);
  assert.equal(row.samples[0].phase, 'startup', 'Startup must be included');
  let peak = 0;
  for (const sample of row.samples) {
    keys(sample, ['phase', 'memory', 'peakKiB']);
    assert.ok(typeof sample.phase === 'string' && sample.phase.length > 0);
    positive(sample.peakKiB);
    positive(sample.peakKiB * 1024);
    keys(sample.memory, ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers']);
    Object.values(sample.memory).forEach(nonnegative);
    peak = Math.max(peak, sample.peakKiB * 1024);
  }
  assert.equal(row.peakResidentBytes, peak, 'Wrong maxRSS unit conversion');
}

export function buildRefreshTransportFinalObservation(value, receipt, verification, repetition) {
  validateIdentity(value.identity);
  const version = identityVersion(value.identity);
  keys(receipt, [
    ...(version === 2 ? ['schemaVersion'] : []),
    'name',
    'repetition',
    'mode',
    'caseDigest',
    'environment',
    'corpus',
    'physical',
    'sqlLifetime',
    'samples',
    'peakResidentBytes',
    'peakMethod',
    'peakUnits',
    'observedOutcome',
    'operationThrew',
    'operationFailureText',
    'captureFailed',
    'transactionClosed',
    'tempClosed',
    'admitted',
    'workspacePath',
    'artifactPaths',
  ]);
  keys(verification, [
    ...(version === 2 ? ['outputProof', 'proofArtifact'] : []),
    'persistentStateVerified',
    'transactionClosed',
    'tempClosed',
    'expectedOutcomeVerified',
    'verificationDigest',
  ]);
  if (version === 2) assert.equal(receipt.schemaVersion, 2, 'Mixed measurement receipt version');
  if (version === 2 && value.name !== 'd-cancel') {
    assert.equal(verification.outputProof, null);
    assert.equal(verification.proofArtifact, null);
  }
  assert.match(verification.verificationDigest, /^[a-f0-9]{64}$/);
  for (const field of [
    'persistentStateVerified',
    'transactionClosed',
    'tempClosed',
    'expectedOutcomeVerified',
  ])
    assert.equal(verification[field], true, `Unverified ${field}`);
  assert.equal(receipt.name, value.name);
  assert.equal(receipt.repetition, repetition);
  assert.equal(receipt.caseDigest, value.caseDigest);
  assert.equal(receipt.caseDigest, value.identity.inputs[value.name].corpusPayloadDigest);
  assert.deepEqual(receipt.environment, value.identity.environment);
  assert.deepEqual(receipt.corpus, value.identity.corpus);
  assert.equal(receipt.workspacePath, value.workspacePath, 'Changed replay binding');
  assert.equal(receipt.captureFailed, false);
  assert.equal(typeof receipt.operationThrew, 'boolean');
  assert.equal(
    receipt.operationThrew,
    (receipt.mode === 'actual' && value.name === 'd-sql-preflight') ||
      !['SUCCEEDED', 'RESOURCE_LIMIT_EXCEEDED'].includes(
        value.identity.inputs[value.name].expectedOutcome,
      ),
  );
  if (receipt.operationThrew)
    assert.ok(
      typeof receipt.operationFailureText === 'string' && receipt.operationFailureText.length > 0,
    );
  else assert.equal(receipt.operationFailureText, null);
  assert.ok(['offline', 'actual'].includes(receipt.mode));
  assert.equal(receipt.admitted, receipt.mode === 'actual', 'Unadmitted actual measurement');
  assert.ok(Array.isArray(receipt.artifactPaths) && receipt.artifactPaths.length > 0);
  for (const file of receipt.artifactPaths)
    assert.ok(typeof file === 'string' && path.isAbsolute(file));
  const lifetime = receipt.sqlLifetime;
  keys(lifetime, [
    'scope',
    'coverageComplete',
    'retainedSqlBytes',
    'retainedSqlStringChargeBytes',
    'coverage',
    'reasons',
  ]);
  assert.equal(lifetime.scope, 'COMPLETE_SQL_SOURCE_LIFETIME_ONLY');
  assert.equal(lifetime.coverageComplete, true);
  assert.deepEqual(lifetime.reasons, []);
  assert.ok(Array.isArray(value.coverage) && value.coverage.length > 0);
  assert.ok(Array.isArray(lifetime.coverage));
  const domains = (entries, observed) =>
    entries
      .map((entry) => {
        keys(
          entry,
          observed ? ['family', 'role', 'disposition', 'cause'] : ['family', 'role', 'disposition'],
        );
        assert.ok(['OBSERVED', 'PROVEN_NO_TEXT', 'PROVEN_NOT_REACHED'].includes(entry.disposition));
        if (observed)
          assert.ok(
            entry.cause === null || (typeof entry.cause === 'string' && entry.cause.length > 0),
          );
        return [entry.family, entry.role, entry.disposition].join(':');
      })
      .sort();
  const expected = domains(
    value.coverage.map((entry) =>
      receipt.mode === 'actual' && value.name === 'd-sql-preflight'
        ? {
            ...entry,
            disposition:
              entry.family === 'BASELINE_READ'
                ? 'OBSERVED'
                : entry.family === 'PREPARATION'
                  ? 'PROVEN_NO_TEXT'
                  : 'PROVEN_NOT_REACHED',
          }
        : entry,
    ),
    false,
  );
  assert.equal(new Set(expected).size, expected.length, 'Duplicate source family');
  assert.deepEqual(domains(lifetime.coverage, true), expected, 'Incomplete SQL source proof');
  keys(receipt.physical, [
    'inputBytes',
    'largestLineBytes',
    'outputBytes',
    'eventCount',
    'summaryBytes',
  ]);
  assert.equal(receipt.samples.at(-1)?.phase, 'finished');
  const result = {
    ...(version === 2
      ? {
          outputProof:
            value.name === 'd-cancel'
              ? {
                  ...verification.outputProof,
                  artifact: verification.proofArtifact,
                }
              : null,
        }
      : {}),
    name: value.name,
    repetition,
    workspace,
    environment: receipt.environment,
    corpus: receipt.corpus,
    scope: receipt.mode === 'actual' ? 'ACTUAL_ADMITTED' : 'OFFLINE_CALIBRATION_ONLY',
    corpusPayloadDigest: receipt.caseDigest,
    expectedOutcome: value.identity.inputs[value.name].expectedOutcome,
    observedOutcome: receipt.observedOutcome,
    ...receipt.physical,
    persistentStateVerified: verification.persistentStateVerified,
    transactionClosed: receipt.transactionClosed,
    tempClosed: receipt.tempClosed,
    retainedSqlBytes: lifetime.retainedSqlBytes,
    retainedSqlStringChargeBytes: lifetime.retainedSqlStringChargeBytes,
    samples: receipt.samples,
    peakResidentBytes: receipt.peakResidentBytes,
    peakMethod: receipt.peakMethod,
    peakUnits: receipt.peakUnits,
  };
  validateRefreshTransportObservation(result, value.identity, result.scope);
  return Object.freeze(result);
}

async function main(args) {
  const usage =
    'Usage: bench <output-directory> | candidate <manifest> <evidence-root> <output-json> | collect <candidate|approved> <candidate-json> <output-directory>';
  assert.ok(
    (args[0] === 'bench' && args.length === 2) ||
      (args[0] === 'candidate' && args.length === 4) ||
      (args[0] === 'collect' && args.length === 4 && ['candidate', 'approved'].includes(args[1])),
    usage,
  );
  // Load the real collector only after rejecting malformed command lines.
  const { runRefreshTransportCommand } =
    await import('../packages/runtime/test/helpers/native-refresh-transport-replay.mjs');
  const report = await runRefreshTransportCommand(args);
  if (report?.failures?.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  void main(process.argv.slice(2)).catch((error) => {
    process.stderr.write('REFRESH_TRANSPORT evidence refused: ' + error.message + '\n');
    process.exitCode = 1;
  });
function validateReport(report, identity) {
  keys(report, ['schemaVersion', 'workspace', 'environment', 'corpus', 'observations', 'failures']);
  header(report, identity);
  assert.ok(
    Array.isArray(report.failures) && report.failures.length === 0,
    'Report contains failures',
  );
  assert.ok(Array.isArray(report.observations));
  assert.equal(report.observations.length, refreshTransportCases.length * 5, 'Missing coverage');
  for (const name of refreshTransportCases)
    assert.deepEqual(
      report.observations
        .filter((r) => r.name === name)
        .map((r) => r.repetition)
        .sort(),
      [0, 1, 2, 3, 4],
      'Missing class/repetition',
    );
  report.observations.forEach((row) => validateRefreshTransportObservation(row, identity));
}
async function confined(root, relative) {
  assert.ok(
    typeof relative === 'string' && relative.length && !path.isAbsolute(relative),
    'Relative evidence path required',
  );
  const file = await realpath(path.join(root, relative));
  const within = path.relative(root, file);
  assert.ok(
    within && within !== '..' && !within.startsWith('..' + path.sep) && !path.isAbsolute(within),
    'Evidence escapes root',
  );
  return file;
}
async function jsonFiles(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...(await jsonFiles(root, relative)));
    else if (entry.name.endsWith('.json')) files.push(await confined(root, relative));
  }
  return files;
}
/** Offline evidence core only; caller supplies the independently pinned worker identity.
 * No CLI, calibration, admission or automatic profile installation is provided here yet.
 */
async function candidateFromEvidence(manifestPath, root, identity, audit) {
  const file = await confined(root, path.relative(root, path.resolve(manifestPath)));
  const bytes = await readFile(file);
  const manifest = JSON.parse(bytes);
  keys(manifest, [
    'schemaVersion',
    'workspace',
    'environment',
    'corpus',
    'reports',
    'priorApprovals',
  ]);
  header(manifest, identity);
  assert.ok(Array.isArray(manifest.reports) && manifest.reports.length > 0);
  assert.ok(Array.isArray(manifest.priorApprovals));
  const records = [],
    digests = new Set(),
    files = new Set();
  for (const entry of manifest.reports) {
    keys(entry, ['path', 'sha256']);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    const reportPath = await confined(root, entry.path);
    const raw = await readFile(reportPath);
    assert.equal(sha(raw), entry.sha256, 'Report hash mismatch');
    assert.ok(!digests.has(entry.sha256) && !files.has(reportPath), 'Duplicate report');
    digests.add(entry.sha256);
    files.add(reportPath);
    records.push(JSON.parse(raw));
  }
  records.forEach((report) => validateReport(report, identity));
  if (identityVersion(identity) === 2) {
    assert.equal(typeof audit, 'function', 'Original prefix evidence audit required');
    const origins = new Set();
    for (const report of records)
      for (const row of report.observations)
        if (row.name === 'd-cancel') assertRefreshPrefixOriginDistinct(origins, await audit(row));
  }
  const grouped = new Map();
  for (const report of records)
    for (const row of report.observations) {
      const key = JSON.stringify([workspace, row.name, row.corpusPayloadDigest]);
      const group = grouped.get(key) ?? {
        key,
        low: row.peakResidentBytes,
        high: row.peakResidentBytes,
        count: 0,
      };
      group.low = Math.min(group.low, row.peakResidentBytes);
      group.high = Math.max(group.high, row.peakResidentBytes);
      group.count += 1;
      grouped.set(key, group);
    }
  let floor = null;
  for (const prior of manifest.priorApprovals) {
    keys(prior, ['reservationBytes', 'candidatePath', 'candidateSha256']);
    positive(prior.reservationBytes);
    assert.match(prior.candidateSha256, /^[a-f0-9]{64}$/);
    const raw = await readFile(await confined(root, prior.candidatePath));
    assert.equal(sha(raw), prior.candidateSha256);
    const old = JSON.parse(raw);
    header(old, identity);
    assert.equal(old.reservationBytes, prior.reservationBytes);
    assert.ok(
      nativeRefreshTransportProfiles.some(
        (p) =>
          Object.entries(identity.environment).every(([key, value]) => p[key] === value) &&
          p.workspace === workspace &&
          p.transportCorpusRevision === identity.corpus.revision &&
          p.transportCorpusDigest === identity.corpus.digest &&
          p.memoryPolicyRevision === memoryPolicyRevision &&
          p.memoryCandidateEvidenceDigest === prior.candidateSha256 &&
          p.reservationBytes === prior.reservationBytes,
      ),
      'Prior floor lacks installed exact-purpose approval',
    );
    floor = Math.max(floor ?? 0, prior.reservationBytes);
  }
  const groups = [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key, 'en'));
  return {
    schemaVersion: identityVersion(identity),
    workspace,
    status: 'PROVISIONAL_REVIEW_REQUIRED',
    environment: identity.environment,
    corpus: identity.corpus,
    policyRevision: memoryPolicyRevision,
    manifest: { path: path.relative(root, file), sha256: sha(bytes) },
    reports: manifest.reports,
    priorApprovals: manifest.priorApprovals,
    groups,
    ...calculateNativeMemoryReservation(groups, floor),
  };
}

async function calibrationPrefixOrigins(root, reports, audit) {
  const origins = new Set();
  if (!audit) return origins;
  for (const entry of reports) {
    const raw = await readFile(await confined(root, entry.path));
    assert.equal(sha(raw), entry.sha256, 'Calibration report changed');
    for (const row of JSON.parse(raw).observations)
      if (row.name === 'd-cancel') assertRefreshPrefixOriginDistinct(origins, await audit(row));
  }
  return origins;
}

export async function buildRefreshTransportCandidate(
  manifestPath,
  evidenceRoot,
  identity,
  dContext,
) {
  validateIdentity(identity);
  const root = await realpath(evidenceRoot);
  const audit =
    identityVersion(identity) === 2
      ? await (
          await import('../packages/runtime/test/helpers/native-refresh-transport-replay.mjs')
        ).createRefreshTransportPrefixAudit(root, identity, dContext)
      : null;
  const candidate = await candidateFromEvidence(manifestPath, root, identity, audit);
  const included = new Set(candidate.reports.map((r) => r.sha256));
  const history = [];
  for (const file of await jsonFiles(root)) {
    const raw = await readFile(file);
    try {
      history.push({ digest: sha(raw), value: JSON.parse(raw) });
    } catch {
      /* Unrelated non-report JSON does not select a candidate. */
    }
  }
  for (const { digest, value: old } of history) {
    if (
      old?.schemaVersion !== identityVersion(identity) ||
      old.workspace !== workspace ||
      !Array.isArray(old.observations) ||
      !isDeepStrictEqual(old.environment, identity.environment) ||
      !isDeepStrictEqual(old.corpus, identity.corpus)
    )
      continue;
    if (!Object.hasOwn(old, 'candidateSha256')) {
      assert.ok(included.has(digest), 'Omitted compatible raw history');
      continue;
    }
    keys(old, [
      'schemaVersion',
      'workspace',
      'candidateSha256',
      'environment',
      'corpus',
      'observations',
      'failures',
    ]);
    assert.match(old.candidateSha256, /^[a-f0-9]{64}$/);
    assert.ok(Array.isArray(old.failures));
    assert.ok(
      old.failures.every((f) =>
        ['CANDIDATE_INVALID', 'WORKER_OR_PEAK_FAILED', 'CANDIDATE_CHANGED'].includes(f?.code),
      ),
      'Unknown holdout failure',
    );
    assert.ok(
      old.observations.length <= refreshTransportCases.length,
      'Holdout has calibration-sized coverage',
    );
    if (old.failures.length === 0)
      assert.equal(
        old.observations.length,
        refreshTransportCases.length,
        'Missing holdout coverage',
      );
    assert.equal(
      new Set(old.observations.map((r) => r.name)).size,
      old.observations.length,
      'Duplicate holdout class',
    );
    for (const row of old.observations) {
      validateRefreshTransportObservation(row, identity);
      assert.equal(row.repetition, 0);
      if (audit && row.name === 'd-cancel') await audit(row);
    }
    const parent = history.find((h) => h.digest === old.candidateSha256)?.value;
    assert.ok(parent, 'Frozen holdout parent missing');
    assert.match(parent.manifest?.sha256 ?? '', /^[a-f0-9]{64}$/);
    const parentManifest = await confined(root, parent.manifest.path);
    assert.equal(
      sha(await readFile(parentManifest)),
      parent.manifest.sha256,
      'Holdout parent manifest hash mismatch',
    );
    assert.deepEqual(
      parent,
      await candidateFromEvidence(parentManifest, root, identity, audit),
      'Holdout parent differs from evidence',
    );
    if (audit) {
      const origins = await calibrationPrefixOrigins(root, parent.reports, audit);
      for (const row of old.observations)
        if (row.name === 'd-cancel') assertRefreshPrefixOriginDistinct(origins, await audit(row));
    }
  }
  return candidate;
}

// Offline tooling port only. Real pinned worker/identity and the CLI remain a separate D5 step.
export async function collectRefreshTransportObservations(
  candidatePath,
  artifactDir,
  holdoutPath,
  runWorker,
  identity,
  scope = 'OFFLINE_CALIBRATION_ONLY',
  dContext,
) {
  assert.ok(['OFFLINE_CALIBRATION_ONLY', 'ACTUAL_ADMITTED'].includes(scope));
  assert.notEqual(
    path.resolve(candidatePath),
    path.resolve(holdoutPath),
    'Holdout must not overwrite candidate',
  );
  const save = (file, value, exclusive = false) =>
    writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: exclusive ? 'wx' : 'w' });
  await mkdir(path.dirname(artifactDir), { recursive: true });
  // A fresh owned directory prevents overwriting earlier successful or failed workers.
  await mkdir(artifactDir);
  for (const name of refreshTransportCases)
    await save(path.join(artifactDir, name + '.json'), null, true);
  await mkdir(path.dirname(holdoutPath), { recursive: true });
  const holdout = {
    schemaVersion: identityVersion(identity),
    workspace,
    candidateSha256: null,
    environment: null,
    corpus: null,
    observations: [],
    failures: [],
  };
  await save(holdoutPath, holdout, true);
  const persist = () => save(holdoutPath, holdout);
  let candidate, digest, prefixAudit, prefixOrigins;
  try {
    validateIdentity(identity);
    holdout.environment = identity.environment;
    holdout.corpus = identity.corpus;
    const raw = await readFile(candidatePath);
    candidate = JSON.parse(raw);
    digest = sha(raw);
    const root = await realpath(path.dirname(candidatePath));
    assert.match(candidate.manifest?.sha256 ?? '', /^[a-f0-9]{64}$/);
    const manifest = await confined(root, candidate.manifest.path);
    assert.equal(
      sha(await readFile(manifest)),
      candidate.manifest.sha256,
      'Candidate manifest hash mismatch',
    );
    assert.deepEqual(
      candidate,
      await buildRefreshTransportCandidate(manifest, root, identity, dContext),
      'Frozen candidate differs from evidence',
    );
    if (identityVersion(identity) === 2)
      prefixAudit = await (
        await import('../packages/runtime/test/helpers/native-refresh-transport-replay.mjs')
      ).createRefreshTransportPrefixAudit(root, identity, dContext);
    prefixOrigins = await calibrationPrefixOrigins(root, candidate.reports, prefixAudit);
    assert.equal(typeof runWorker, 'function', 'Explicit offline worker required');
    holdout.candidateSha256 = digest;
  } catch (error) {
    holdout.failures.push({ code: 'CANDIDATE_INVALID', message: String(error.message) });
    await persist();
    return holdout;
  }
  await persist();
  for (const name of refreshTransportCases) {
    let child;
    const artifact = path.join(artifactDir, name + '.json');
    try {
      child = await runWorker(name, 0);
      await save(artifact, child);
      assert.equal(child.status, 0);
      assert.equal(child.stderr, '');
      assert.equal(child.error ?? null, null);
      const row = JSON.parse(child.stdout);
      validateRefreshTransportObservation(row, identity, scope);
      if (prefixAudit && name === 'd-cancel')
        assertRefreshPrefixOriginDistinct(prefixOrigins, await prefixAudit(row));
      assert.equal(row.name, name);
      assert.equal(row.repetition, 0);
      holdout.observations.push(row);
      assert.ok(
        row.peakResidentBytes <= candidate.reservationBytes,
        'Peak exceeds frozen candidate',
      );
    } catch (error) {
      const failure = {
        name,
        code: 'WORKER_OR_PEAK_FAILED',
        message: String(error.message),
        child: child ?? null,
      };
      holdout.failures.push(failure);
      await save(artifact, { child: failure.child, failure: failure.message });
    }
    await persist();
  }
  try {
    assert.equal(sha(await readFile(candidatePath)), digest, 'Frozen candidate changed');
  } catch (error) {
    holdout.failures.push({ code: 'CANDIDATE_CHANGED', message: String(error.message) });
    await persist();
  }
  return holdout;
}
