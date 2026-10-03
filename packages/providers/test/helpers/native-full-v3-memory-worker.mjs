import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { RepositoryAnalysisStage } from '../../../storage/dist/index.js';
import { streamNativeFullAnalysisV3, validateNativeStateCandidate } from '../../dist/index.js';
import { nativeMetadataEnvironment } from '../../../runtime/dist/native-metadata-admission.js';
import { corpusExpected } from '../../../runtime/test/helpers/native-metadata-corpus.mjs';
import { transportMemoryValue } from './native-full-v3-memory-corpus.mjs';

const name = process.argv[2],
  start = performance.now(),
  samples = [];
function sample(phase) {
  const point = {
    phase,
    elapsedMs: performance.now() - start,
    memory: process.memoryUsage(),
    peakKiB: process.resourceUsage().maxRSS,
  };
  const index = samples.findIndex((s) => s.phase === phase);
  if (index === -1) samples.push(point);
  else if (point.memory.heapUsed > samples[index].memory.heapUsed) samples[index] = point;
}
sample('startup');
const environment = nativeMetadataEnvironment();
const { request } = transportMemoryValue(name);
sample('input-preparation');
const db = new DatabaseSync(':memory:');
const stage = new RepositoryAnalysisStage(db, {
  maxSerializedBytes: 1_000_000,
  memoryBudgetBytes: request.payload.resourceBudget.maxMemoryBytes,
});
let outcome = 'SUCCEEDED',
  accepted = 0,
  maximumOverlap = 0,
  inFlight = 0;
const counts = {};
try {
  // Provisional calibration composition only: pure Provider port, no Store/Apply,
  // no production admission bypass or persistent graph publication.
  const result = await streamNativeFullAnalysisV3(
    request,
    {
      executablePath: process.execPath,
      timeoutMs: 60_000,
      arguments: [
        fileURLToPath(new URL('../fixtures/native-full-v3-memory-child.mjs', import.meta.url)),
        name,
      ],
      allowedEnvironment: Object.fromEntries(
        ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
          .filter((key) => process.env[key] !== undefined)
          .map((key) => [key, process.env[key]]),
      ),
    },
    {
      async accept(event) {
        inFlight++;
        maximumOverlap = Math.max(maximumOverlap, inFlight);
        accepted++;
        counts[event.type] = (counts[event.type] ?? 0) + 1;
        if (event.type === 'ANALYSIS_SUMMARY') await stage.acceptNativeSummary(event.payload);
        else await stage.accept(event);
        if (name === 'slow-sink') await new Promise((resolve) => setImmediate(resolve));
        sample(event.type);
        inFlight--;
      },
    },
  );
  sample('transport-complete');
  stage.confirmSucceeded(result.terminal);
  stage.sealNativeState(
    JSON.stringify(result.terminal.payload.analysisState),
    corpusExpected,
    validateNativeStateCandidate,
    {
      maxSerializedBytes: 1_000_000,
      memoryBudgetBytes: request.payload.resourceBudget.maxMemoryBytes,
    },
  );
  sample('seal-complete');
} catch (error) {
  outcome = error.code ?? error.nativeStateReason ?? 'UNEXPECTED';
  counts.failureMessage = error.message;
  sample('refused');
} finally {
  stage.close();
  db.close();
}
const expected =
  {
    'duplicate-metadata': 'PROTOCOL_VIOLATION',
    'foreign-metadata': 'PROTOCOL_VIOLATION',
    'deep-unknown-input': 'PROTOCOL_VIOLATION',
    'oversized-staged-fact': 'OUTPUT_LIMIT_EXCEEDED',
  }[name] ?? 'SUCCEEDED';
assert.equal(outcome, expected, name + ': ' + (counts.failureMessage ?? ''));
assert.ok(maximumOverlap <= 1);
console.log(
  JSON.stringify({
    name,
    environment,
    outcome,
    accepted,
    maximumOverlap,
    counts,
    samples,
    requestHeaderBytes: Buffer.byteLength(JSON.stringify(request)) + 1,
    peakResidentBytes: process.resourceUsage().maxRSS * 1024,
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    scope:
      'Node transport + awaited TEMP staging + pure Provider seal; child peak excluded; no Apply',
  }),
);
