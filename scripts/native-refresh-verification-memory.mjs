import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, realpath, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  calculateNativeMemoryReservation,
  memoryPolicyRevision,
} from './native-memory-profile.mjs';
import { nativeMetadataEnvironment } from '../packages/runtime/dist/native-metadata-admission.js';
import { nativeRefreshVerificationProfiles } from '../packages/runtime/dist/native-metadata-profiles.js';
import {
  buildVerificationCase,
  verificationCases,
  verificationFixtureBudget,
} from '../packages/runtime/test/helpers/native-refresh-verification-corpus.mjs';
import { verificationCorpusIdentity } from '../packages/runtime/test/helpers/native-refresh-verification-identity.mjs';

const workspace = 'REFRESH_VERIFY';
const sha = (b) => createHash('sha256').update(b).digest('hex');
function keys(value, required) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Expected object');
  assert.deepEqual(Object.keys(value).sort(), [...required].sort(), 'Missing or unknown fields');
}
const positive = (n) => assert.ok(Number.isSafeInteger(n) && n > 0, 'Invalid positive bytes');
const nonnegative = (n) => assert.ok(Number.isSafeInteger(n) && n >= 0, 'Invalid finite counter');
function header(value, identity) {
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.workspace, workspace);
  assert.deepEqual(value.environment, identity.environment, 'Build environment mismatch');
  assert.deepEqual(value.corpus, identity.corpus, 'Worker/corpus mismatch');
}
export async function verificationEvidenceIdentity() {
  const inputs = {};
  for (const name of verificationCases) {
    const c = buildVerificationCase(name, verificationFixtureBudget);
    inputs[name] = {
      corpusPayloadDigest: c.corpusPayloadDigest,
      expectedOutcome: c.expectedOutcome,
      ...c.sizes,
    };
  }
  return {
    environment: nativeMetadataEnvironment(),
    corpus: await verificationCorpusIdentity(),
    inputs,
  };
}
export function validateVerificationObservation(row, identity, scope = 'OFFLINE_CALIBRATION_ONLY') {
  keys(row, [
    'name',
    'repetition',
    'environment',
    'corpus',
    'scope',
    'opened',
    'corpusPayloadDigest',
    'expectedOutcome',
    'observedOutcome',
    'inputBytes',
    'largestLineBytes',
    'outputBytes',
    'eventCount',
    'summaryBytes',
    'maximumSinkInFlight',
    'maximumPendingBytes',
    'samples',
    'peakResidentBytes',
    'peakMethod',
    'peakUnits',
  ]);
  assert.ok(verificationCases.includes(row.name));
  assert.deepEqual(row.environment, identity.environment);
  assert.deepEqual(row.corpus, identity.corpus);
  assert.equal(row.scope, scope);
  assert.equal(row.opened, 1);
  for (const [key, value] of Object.entries(identity.inputs[row.name]))
    assert.equal(row[key], value, `Changed input ${key}`);
  assert.equal(row.observedOutcome, row.expectedOutcome, 'Unexpected worker outcome');
  nonnegative(row.repetition);
  nonnegative(row.maximumSinkInFlight);
  assert.ok(row.maximumSinkInFlight <= 1);
  nonnegative(row.maximumPendingBytes);
  assert.ok(row.maximumPendingBytes <= row.outputBytes);
  if (row.name === 'burst-output-buffer') assert.equal(row.maximumPendingBytes, row.outputBytes);
  if (row.name === 'slow-sink') assert.equal(row.maximumSinkInFlight, 1);
  positive(row.peakResidentBytes);
  assert.equal(row.peakMethod, 'resourceUsage.maxRSS');
  assert.equal(row.peakUnits, 'bytes');
  assert.ok(Array.isArray(row.samples) && row.samples.length > 0);
  assert.equal(row.samples[0].phase, 'startup', 'Startup must be included');
  for (const sample of row.samples) {
    keys(sample, ['phase', 'memory', 'peakKiB']);
    assert.ok(typeof sample.phase === 'string' && sample.phase.length);
    positive(sample.peakKiB);
    keys(sample.memory, ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers']);
    Object.values(sample.memory).forEach(nonnegative);
  }
  assert.equal(
    row.peakResidentBytes,
    Math.max(...row.samples.map((s) => s.peakKiB * 1024)),
    'Wrong maxRSS unit conversion',
  );
}
function validateReport(report, identity) {
  keys(report, ['schemaVersion', 'workspace', 'environment', 'corpus', 'observations', 'failures']);
  header(report, identity);
  assert.ok(
    Array.isArray(report.failures) && report.failures.length === 0,
    'Report contains failures',
  );
  assert.ok(Array.isArray(report.observations));
  assert.equal(report.observations.length, verificationCases.length * 5, 'Missing coverage');
  for (const name of verificationCases)
    assert.deepEqual(
      report.observations
        .filter((r) => r.name === name)
        .map((r) => r.repetition)
        .sort(),
      [0, 1, 2, 3, 4],
      'Missing class/repetition',
    );
  report.observations.forEach((row) => validateVerificationObservation(row, identity));
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
  const found = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) found.push(...(await jsonFiles(root, relative)));
    else if (entry.name.endsWith('.json')) found.push(await confined(root, relative));
  }
  return found;
}
export async function buildVerificationCandidate(manifestPath, fixtureRoot, identity = null) {
  identity ??= await verificationEvidenceIdentity();
  const root = await realpath(fixtureRoot);
  const file = await confined(root, path.relative(root, path.resolve(manifestPath)));
  const bytes = await readFile(file),
    manifest = JSON.parse(bytes);
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
    const reportPath = await confined(root, entry.path),
      raw = await readFile(reportPath);
    assert.equal(sha(raw), entry.sha256, 'Report hash mismatch');
    assert.ok(!digests.has(entry.sha256) && !files.has(reportPath), 'Duplicate report');
    digests.add(entry.sha256);
    files.add(reportPath);
    records.push({ entry, report: JSON.parse(raw) });
  }
  // Even a failed compatible report with valid high rows must not be omitted.
  // Holdouts are explicitly candidate-pinned and never select their candidate.
  const evidenceFiles = await jsonFiles(root);
  for (const reportPath of evidenceFiles) {
    const raw = await readFile(reportPath);
    let old;
    try {
      old = JSON.parse(raw);
    } catch {
      continue;
    }
    if (
      old?.schemaVersion === 1 &&
      old.workspace === workspace &&
      Array.isArray(old.observations) &&
      isDeepStrictEqual(old.environment, identity.environment) &&
      isDeepStrictEqual(old.corpus, identity.corpus)
    ) {
      if (!Object.hasOwn(old, 'candidateSha256')) {
        assert.ok(digests.has(sha(raw)), 'Omitted compatible raw history');
        continue;
      }
      // An extra field is not proof that raw calibration is a holdout.
      keys(old, [
        'schemaVersion',
        'workspace',
        'candidateSha256',
        'environment',
        'corpus',
        'observations',
        'failures',
      ]);
      assert.match(old.candidateSha256 ?? '', /^[a-f0-9]{64}$/, 'Holdout candidate hash missing');
      assert.ok(Array.isArray(old.failures));
      assert.ok(
        old.failures.every((f) =>
          ['CANDIDATE_INVALID', 'WORKER_OR_PEAK_FAILED', 'CANDIDATE_CHANGED'].includes(f?.code),
        ),
        'Unknown holdout failure',
      );
      assert.ok(
        old.observations.length <= verificationCases.length,
        'Holdout has calibration-sized coverage',
      );
      if (old.failures.length === 0)
        assert.equal(old.observations.length, verificationCases.length, 'Holdout coverage missing');
      assert.equal(
        new Set(old.observations.map((r) => r.name)).size,
        old.observations.length,
        'Duplicate holdout class',
      );
      for (const row of old.observations) {
        validateVerificationObservation(row, identity);
        assert.equal(row.repetition, 0, 'Holdout repetition changed');
      }
      let parent;
      for (const file of evidenceFiles) {
        const bytes = await readFile(file);
        if (sha(bytes) === old.candidateSha256) {
          parent = JSON.parse(bytes);
          break;
        }
      }
      assert.ok(parent, 'Frozen holdout parent missing');
      header(parent, identity);
      assert.equal(parent.policyRevision, memoryPolicyRevision);
      positive(parent.reservationBytes);
      assert.ok(
        Array.isArray(parent.groups) && parent.groups.length === verificationCases.length,
        'Holdout parent groups missing',
      );
    }
  }
  records.forEach(({ report }) => validateReport(report, identity));
  const grouped = new Map();
  for (const { report } of records)
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
      group.count++;
      grouped.set(key, group);
    }
  let floor = null;
  for (const prior of manifest.priorApprovals) {
    keys(prior, ['reservationBytes', 'candidatePath', 'candidateSha256']);
    positive(prior.reservationBytes);
    const priorRaw = await readFile(await confined(root, prior.candidatePath));
    assert.equal(sha(priorRaw), prior.candidateSha256);
    const old = JSON.parse(priorRaw);
    header(old, identity);
    assert.equal(old.reservationBytes, prior.reservationBytes);
    // Only an already installed reviewed exact-purpose entry proves a genuine
    // prior approval. A provisional candidate or another workspace is no floor.
    assert.ok(
      nativeRefreshVerificationProfiles.some(
        (p) =>
          Object.entries(identity.environment).every(([k, v]) => p[k] === v) &&
          p.workspace === workspace &&
          p.verificationCorpusDigest === identity.corpus.digest &&
          p.memoryCandidateEvidenceDigest === prior.candidateSha256 &&
          p.reservationBytes === prior.reservationBytes,
      ),
      'Prior floor lacks installed exact-purpose approval',
    );
    floor = Math.max(floor ?? 0, prior.reservationBytes);
  }
  const groups = [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key, 'en'));
  return {
    schemaVersion: 1,
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
async function loadCandidate(candidatePath, identity) {
  const raw = await readFile(candidatePath),
    candidate = JSON.parse(raw),
    root = await realpath(path.dirname(candidatePath));
  assert.match(candidate.manifest?.sha256 ?? '', /^[a-f0-9]{64}$/);
  const manifestPath = await confined(root, candidate.manifest.path);
  assert.equal(sha(await readFile(manifestPath)), candidate.manifest.sha256);
  assert.deepEqual(
    candidate,
    await buildVerificationCandidate(manifestPath, root, identity),
    'Frozen candidate differs from evidence',
  );
  return { candidate, digest: sha(raw) };
}
export function runPinnedVerificationWorker(name, repetition, mode = 'offline') {
  const child = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          '../packages/runtime/test/helpers/native-refresh-verification-worker.mjs',
          import.meta.url,
        ),
      ),
      mode,
      name,
      String(repetition),
    ],
    { encoding: 'utf8', timeout: 60_000, maxBuffer: 10_000_000, windowsHide: true },
  );
  return {
    status: child.status,
    stdout: child.stdout ?? '',
    stderr: child.stderr ?? '',
    error: child.error?.message ?? null,
  };
}
const save = async (file, value, exclusive = false) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: exclusive ? 'wx' : 'w' });
};
export async function benchVerificationMemory(
  rawReportPath,
  runWorker = runPinnedVerificationWorker,
) {
  const identity = await verificationEvidenceIdentity();
  const report = {
    schemaVersion: 1,
    workspace,
    environment: identity.environment,
    corpus: identity.corpus,
    observations: [],
    failures: [],
  };
  await save(rawReportPath, report, true);
  for (const name of verificationCases)
    for (let repetition = 0; repetition < 5; repetition++) {
      let child;
      try {
        child = await runWorker(name, repetition);
        const row = JSON.parse(child.stdout);
        // Preserve parsed rows before validation, including malformed diagnostics.
        report.observations.push(row);
        assert.equal(child.status, 0);
        assert.equal(child.stderr, '');
        assert.equal(row.name, name);
        assert.equal(row.repetition, repetition);
        validateVerificationObservation(row, identity);
      } catch (error) {
        report.failures.push({
          name,
          repetition,
          code: 'WORKER_OR_EVIDENCE_FAILED',
          message: String(error.message),
          child: child ?? null,
        });
      }
      await save(rawReportPath, report);
    }
  return report;
}
export async function collectVerificationObservations(
  candidatePath,
  artifactDir,
  holdoutPath,
  runWorker = runPinnedVerificationWorker,
  identity = null,
) {
  assert.notEqual(
    path.resolve(candidatePath),
    path.resolve(holdoutPath),
    'Holdout must not overwrite candidate',
  );
  const holdout = {
    schemaVersion: 1,
    workspace,
    candidateSha256: null,
    environment: null,
    corpus: null,
    observations: [],
    failures: [],
  };
  await mkdir(artifactDir, { recursive: true });
  await save(holdoutPath, holdout, true);
  const persist = () => save(holdoutPath, holdout);
  let loaded;
  try {
    identity ??= await verificationEvidenceIdentity();
    holdout.environment = identity.environment;
    holdout.corpus = identity.corpus;
    loaded = await loadCandidate(candidatePath, identity);
    holdout.candidateSha256 = loaded.digest;
  } catch (error) {
    holdout.failures.push({ code: 'CANDIDATE_INVALID', message: String(error.message) });
    await persist();
    return holdout;
  }
  await persist();
  for (const name of verificationCases) {
    let child, row;
    try {
      child = await runWorker(name, 0);
      await save(path.join(artifactDir, name + '.json'), child);
      assert.equal(child.status, 0);
      assert.equal(child.stderr, '');
      row = JSON.parse(child.stdout);
      validateVerificationObservation(row, identity);
      assert.equal(row.name, name);
      assert.equal(row.repetition, 0);
      holdout.observations.push(row);
      assert.ok(
        row.peakResidentBytes <= loaded.candidate.reservationBytes,
        'Peak exceeds frozen candidate',
      );
    } catch (error) {
      holdout.failures.push({
        name,
        code: 'WORKER_OR_PEAK_FAILED',
        message: String(error.message),
        child: child ?? null,
      });
      await save(path.join(artifactDir, name + '.json'), {
        child: child ?? null,
        failure: String(error.message),
      });
    }
    await persist();
  }
  if (sha(await readFile(candidatePath)) !== loaded.digest) {
    holdout.failures.push({ code: 'CANDIDATE_CHANGED' });
    await persist();
  }
  return holdout;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, a, b, c] = process.argv.slice(2);
    if (command === 'bench') {
      assert.equal(process.argv.length, 4);
      const report = await benchVerificationMemory(a);
      if (report.failures.length) process.exitCode = 1;
    } else if (command === 'candidate') {
      assert.equal(process.argv.length, 6);
      const root = await realpath(b);
      assert.equal(
        path.dirname(path.resolve(c)),
        root,
        'Candidate must be beside evidence manifest',
      );
      await save(c, await buildVerificationCandidate(a, root), true);
    } else if (command === 'collect') {
      assert.equal(process.argv.length, 6);
      const report = await collectVerificationObservations(a, b, c);
      if (report.failures.length) process.exitCode = 1;
    } else throw Error('Expected bench, candidate or collect');
  } catch (error) {
    process.stderr.write('REFRESH_VERIFY evidence refused: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
