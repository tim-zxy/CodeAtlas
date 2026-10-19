import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';

const metadata = new WeakMap();
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const failureText = (error) => (error instanceof Error ? error.message : inspect(error));
const startup = {
  phase: 'startup',
  memory: process.memoryUsage(),
  peakKiB: process.resourceUsage().maxRSS,
};

// Scalar-only metadata is handed off separately, never accepted as a final row.
export function refreshReplayWorkerMetadata(receipt) {
  assert.ok(metadata.has(receipt), 'Original worker receipt required');
  return metadata.get(receipt);
}

export async function runRefreshTransportReplayWorker(
  mode,
  workloadCase,
  repetition,
  provenance,
  dContext,
) {
  assert.ok(['offline', 'actual'].includes(mode));
  assert.ok(Number.isSafeInteger(repetition) && repetition >= 0);
  assert.match(provenance.caseDigest, /^[a-f0-9]{64}$/);
  assert.equal(provenance.corpus.revision, 'p05-native-refresh-transport-memory-v1');
  assert.match(provenance.corpus.digest, /^[a-f0-9]{64}$/);
  const samples = [startup];
  const sample = (phase) =>
    samples.push({
      phase,
      memory: process.memoryUsage(),
      peakKiB: process.resourceUsage().maxRSS,
    });
  const { executeRefreshTransportReplayCase, captureRefreshSourceLifetime } =
    await import('./native-refresh-transport-worker.mjs');
  const { nativeMetadataEnvironment } = await import('../../dist/native-metadata-admission.js');
  let closure = {
    transactionClosed: false,
    tempClosed: false,
    admitted: false,
    cleanupFailureText: null,
  };
  const capture = await captureRefreshSourceLifetime(
    () =>
      executeRefreshTransportReplayCase(workloadCase, {
        mode,
        sample,
        dContext,
        settled: (value) => {
          closure = value;
        },
      }),
    workloadCase.coverage.map((entry) =>
      mode === 'actual' && workloadCase.name === 'd-sql-preflight'
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
  );
  sample('finished');
  const result = capture.value;
  const receipt = Object.freeze({
    ...(workloadCase.schemaVersion === 2 ? { schemaVersion: 2 } : {}),
    name: workloadCase.name,
    repetition,
    mode,
    caseDigest: provenance.caseDigest,
    environment: nativeMetadataEnvironment(),
    corpus: provenance.corpus,
    physical: result?.physical ?? null,
    sqlLifetime: capture.evidence,
    samples,
    peakResidentBytes: Math.max(...samples.map((entry) => entry.peakKiB)) * 1024,
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    observedOutcome:
      result?.observedOutcome ??
      capture.error?.code ??
      capture.error?.nativeStateReason ??
      'WORKER_EXCEPTION',
    operationThrew: capture.threw || result?.operationThrew === true,
    operationFailureText: capture.threw
      ? failureText(capture.error)
      : (result?.operationFailureText ?? null),
    captureFailed:
      capture.captureFailed ||
      !result ||
      result.snapshotMetadata === null ||
      closure.cleanupFailureText !== null,
    transactionClosed: closure.transactionClosed,
    tempClosed: closure.tempClosed,
    admitted: closure.admitted,
    workspacePath: workloadCase.workspacePath,
    artifactPaths: [],
  });
  metadata.set(
    receipt,
    Object.freeze({
      ...(workloadCase.schemaVersion === 2
        ? { schemaVersion: 2, wireEvidence: result?.wireEvidence ?? null }
        : {}),
      snapshotMetadata: result?.snapshotMetadata ?? null,
      mainApplyCalls: result?.mainApplyCalls ?? null,
      competitorCommits: result?.competitorCommits ?? null,
      cleanupFailureText: closure.cleanupFailureText,
    }),
  );
  return receipt;
}

async function main(args) {
  assert.ok(
    args.length === 6 || args.length === 7,
    'Expected replay arguments and optional D context',
  );
  const [mode, capsulePath, capsuleSha256, caseDigest, corpusDigest, repeat] = args;
  assert.equal(await realpath(capsulePath), capsulePath);
  assert.match(capsuleSha256, /^[a-f0-9]{64}$/);
  const bytes = await readFile(capsulePath);
  assert.equal(sha(bytes), capsuleSha256, 'Replay capsule hash changed');
  const { decodeRefreshReplayJson, encodeRefreshReplayJson } =
    await import('./native-refresh-transport-replay.mjs');
  const capsule = decodeRefreshReplayJson(bytes);
  const root = path.resolve(path.dirname(capsulePath), '../..');
  const resolve = (relative) => {
    assert.equal(typeof relative, 'string');
    const file = path.resolve(root, relative);
    assert.ok(!path.relative(root, file).startsWith('..') && !path.isAbsolute(relative));
    return file;
  };
  const workloadCase = {
    ...capsule,
    inputContract: { ...capsule.inputContract, corpusPayloadDigest: caseDigest },
    workload: {
      ...capsule.workload,
      invocationPath: resolve(capsule.workload.invocationPath),
      optionsPath: resolve(capsule.workload.optionsPath),
    },
  };
  assert.match(repeat, /^(0|[1-9][0-9]*)$/);
  const receipt = await runRefreshTransportReplayWorker(
    mode,
    workloadCase,
    Number(repeat),
    {
      caseDigest,
      corpus: { revision: 'p05-native-refresh-transport-memory-v1', digest: corpusDigest },
    },
    args[6] === undefined ? undefined : JSON.parse(args[6]),
  );
  // Serialization is after the finished checkpoint; retain the actual actor
  // metadata in an immutable sidecar, not additional observation fields.
  const sidecarPath = path.join(await realpath(process.cwd()), 'metadata.json');
  const sidecarBytes = encodeRefreshReplayJson(refreshReplayWorkerMetadata(receipt));
  const writer = await open(sidecarPath, 'wx');
  try {
    await writer.writeFile(sidecarBytes);
    await writer.sync();
  } finally {
    await writer.close();
  }
  process.stdout.write(
    encodeRefreshReplayJson({
      pid: process.pid,
      processIdentity: (await import('./native-refresh-transport-worker.mjs'))
        .refreshReplayProcessIdentity,
      receipt: { ...receipt, artifactPaths: [sidecarPath] },
      sidecar: { path: sidecarPath, sha256: sha(sidecarBytes) },
    }),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main(process.argv.slice(2));
