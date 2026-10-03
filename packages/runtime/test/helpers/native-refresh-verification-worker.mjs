import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { decodeNativeRefreshV3 } from '../../../providers/dist/index.js';
import { nativeMetadataEnvironment } from '../../dist/native-metadata-admission.js';
import { verifyNativeRefreshObservation } from '../../dist/native-refresh-verification.js';
import { nativeRefreshVerificationProfiles } from '../../dist/native-metadata-profiles.js';
import {
  buildVerificationCase,
  verificationCases,
  verificationFixtureBudget,
} from './native-refresh-verification-corpus.mjs';
import { verificationCorpusIdentity } from './native-refresh-verification-identity.mjs';

export async function runVerificationWorker(mode, name, repetition) {
  assert.ok(['offline', 'actual'].includes(mode));
  assert.ok(verificationCases.includes(name));
  assert.ok(Number.isSafeInteger(repetition) && repetition >= 0);
  const samples = [];
  const sample = (phase) =>
    samples.push({ phase, memory: process.memoryUsage(), peakKiB: process.resourceUsage().maxRSS });
  sample('startup');
  const environment = nativeMetadataEnvironment();
  const corpus = await verificationCorpusIdentity();
  const row = {
    name,
    repetition,
    environment,
    corpus,
    scope: mode === 'offline' ? 'OFFLINE_CALIBRATION_ONLY' : 'ACTUAL_PRIVATE_PORT',
    opened: 0,
    corpusPayloadDigest: null,
    expectedOutcome: null,
    observedOutcome: null,
    inputBytes: 0,
    largestLineBytes: 0,
    outputBytes: 0,
    eventCount: 0,
    summaryBytes: 0,
    maximumSinkInFlight: 0,
    maximumPendingBytes: 0,
    samples,
    peakResidentBytes: 0,
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
  };
  let reads = 0,
    inFlight = 0;
  const open = () => {
    row.opened++;
    const c = buildVerificationCase(name, verificationFixtureBudget);
    Object.assign(row, c.sizes, {
      corpusPayloadDigest: c.corpusPayloadDigest,
      expectedOutcome: c.expectedOutcome,
    });
    sample('prepared');
    const lines = (async function* () {
      const step = ['burst-output-buffer', 'oversized-output'].includes(name)
        ? c.eventBytes.length
        : 4096;
      for (let start = 0; start < c.eventBytes.length; start += step) {
        reads++;
        const chunk = c.eventBytes.subarray(start, start + step);
        // Caller-owned outstanding transport chunk, not hidden decoder line buffers.
        row.maximumPendingBytes = Math.max(row.maximumPendingBytes, chunk.length);
        yield chunk;
      }
    })();
    let first = true;
    const sink = {
      async accept() {
        inFlight++;
        row.maximumSinkInFlight = Math.max(row.maximumSinkInFlight, inFlight);
        assert.equal(inFlight, 1);
        if (first) {
          first = false;
          sample('first-accept-source-and-chunk-retained');
          if (name === 'slow-sink') {
            const before = reads;
            // A controlled unresolved accept spans an event-loop turn.
            await new Promise((resolve) => setImmediate(resolve));
            assert.equal(reads, before, 'backpressure must suspend chunk requests');
            assert.equal(inFlight, 1);
            sample('blocked-sink');
          }
        }
        inFlight--;
      },
    };
    return { requestBytes: c.requestBytes, lines, sink, limits: c.limits };
  };
  let failure = null;
  try {
    const terminal =
      mode === 'actual'
        ? await verifyNativeRefreshObservation(verificationFixtureBudget, open)
        : await (async () => {
            const input = open();
            return decodeNativeRefreshV3(
              input.requestBytes,
              input.lines,
              input.sink,
              input.limits,
              verificationFixtureBudget,
            );
          })();
    row.observedOutcome = terminal.terminal.type;
  } catch (error) {
    row.observedOutcome = error.code ?? error.nativeStateReason ?? 'WORKER_EXCEPTION';
    if (row.opened === 0 || row.observedOutcome !== row.expectedOutcome)
      failure = String(error.message);
  }
  sample('finished');
  row.peakResidentBytes = Math.max(...samples.map((s) => s.peakKiB * 1024));
  if (mode === 'actual' && !failure) {
    const profile = nativeRefreshVerificationProfiles.find((p) =>
      Object.entries(environment).every(([key, value]) => p[key] === value),
    );
    if (
      !profile ||
      profile.verificationCorpusDigest !== corpus.digest ||
      row.peakResidentBytes > profile.reservationBytes
    )
      failure = 'Profile corpus mismatch or actual absolute peak exceeds reviewed reservation';
  }
  return { row, failure };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { row, failure } = await runVerificationWorker(
      process.argv[2],
      process.argv[3],
      Number(process.argv[4]),
    );
    process.stdout.write(JSON.stringify(row) + '\n');
    process.exitCode = failure ? 1 : 0;
  } catch (error) {
    process.stdout.write(
      JSON.stringify({ workspace: 'REFRESH_VERIFY', failure: String(error.message) }) + '\n',
    );
    process.exitCode = 1;
  }
}
