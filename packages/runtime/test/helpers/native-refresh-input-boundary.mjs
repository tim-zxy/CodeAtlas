// Contract generator preparation only. Not a source-backed D calibration recipe.
import { createHash } from 'node:crypto';
import { NATIVE_CLIENT_HARD_LIMITS } from '../../../providers/dist/index.js';
import { baseCase, stateDigest } from '../../../providers/test/helpers/native-full-v3-corpus.mjs';
import {
  buildRefreshCase,
  requestBytes,
} from '../../../providers/test/helpers/native-refresh-v3-corpus.mjs';

const seed = buildRefreshCase('zero-target');
const template = baseCase('empty').bundle.summaries[0];
function inputCase(fileCount) {
  const summaries = Array.from({ length: fileCount }, (_, index) => {
    const summary = structuredClone(template);
    const suffix = String(index).padStart(6, '0');
    summary.sourceFile.id = `f-${suffix}`;
    summary.sourceFile.path = `src/File${suffix}.java`;
    summary.sourceFile.contentFingerprint = `fp-${suffix}`;
    for (const coverage of summary.coverage) coverage.sourceFileId = summary.sourceFile.id;
    return summary;
  });
  const header = {
    ...seed.baseline.header,
    sourceFileCount: fileCount,
    summaryDigest: stateDigest(summaries),
  };
  const baseline = { header, summaries };
  const request = structuredClone(seed.request);
  request.payload.baselineState = header;
  request.payload.targetSourceFiles = summaries.map((summary) => summary.sourceFile);
  request.payload.resourceBudget.maxEvents = NATIVE_CLIENT_HARD_LIMITS.maxEvents;
  const bytes = requestBytes(request, baseline);
  const lines = bytes.toString('utf8').slice(0, -1).split('\n');
  return {
    request,
    baseline,
    bytes,
    metrics: {
      fileCount,
      inputBytes: bytes.length,
      inputRecords: lines.length,
      largestLineBytes: Math.max(...lines.map((line) => Buffer.byteLength(line))),
      summaryBytes: summaries.reduce(
        (total, summary) => total + Buffer.byteLength(JSON.stringify(summary)),
        0,
      ),
      payloadDigest: createHash('sha256').update(bytes).digest('hex'),
    },
  };
}
export function buildRefreshInputBoundary() {
  let accepted = inputCase(0);
  // ponytail: bounded offline O(n²) reconstruction; incremental sizing only if
  // generator cost warrants it. Never part of product scheduling or measured RSS.
  for (let count = 1; ; count++) {
    const next = inputCase(count);
    if (
      next.metrics.inputBytes > NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes ||
      next.metrics.largestLineBytes + 1 > NATIVE_CLIENT_HARD_LIMITS.maxLineBytes
    ) {
      return {
        status: 'CONTRACT_PREPARATION_ONLY',
        calibrationEligible: false,
        recipe: 'zero-declaration-contract-records-v1',
        accepted,
        next,
      };
    }
    accepted = next;
  }
}
