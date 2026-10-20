// Source-backed diagnostic preparation; never a product/admitted/calibration entry.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sourceAt, sizeRetainedSitesBoundary } from './native-refresh-retained-sites-boundary.mjs';
import { frameSourceRefreshBoundary } from './native-refresh-source-input-boundary.mjs';
import { preparedSourceRefresh } from './native-refresh-source-fixture.mjs';
import { requestBytes } from '../../../providers/test/helpers/native-refresh-v3-corpus.mjs';
import { NATIVE_CLIENT_HARD_LIMITS } from '../../../providers/dist/index.js';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const id = 'source-dense-remove-boundary';
function transition(count) {
  return {
    id,
    baseline: { 'Sites.java': 'baseline.java' },
    target: { 'Sites.java': 'target.java' },
    generatedSources: { 'baseline.java': sourceAt(count), 'target.java': sourceAt(0) },
  };
}
function frame(template, summary, memberCount) {
  const value = frameSourceRefreshBoundary(template, [summary]);
  const file = { ...summary.sourceFile, contentFingerprint: 'sha256:' + sha(sourceAt(0)) };
  value.request.requestId = `source-refresh-${id}`;
  value.request.payload.targetSourceFiles = [file];
  value.request.payload.targetRevision.contentFingerprint = 'sha256:' + sha(JSON.stringify([file]));
  value.request.payload.changes = {
    added: [],
    modified: memberCount === 0 ? [] : [file],
    deleted: [],
  };
  value.bytes = requestBytes(value.request, value.baseline);
  const lines = value.bytes.toString('utf8').slice(0, -1).split('\n');
  Object.assign(value.metrics, {
    memberCount,
    symbolSites: summary.symbols.length,
    sourceBytes: Buffer.byteLength(sourceAt(memberCount)),
    sourceSha256: sha(sourceAt(memberCount)),
    inputBytes: value.bytes.length,
    inputRecords: lines.length,
    largestLineBytes: Math.max(...lines.map((line) => Buffer.byteLength(line))),
    payloadDigest: sha(value.bytes),
  });
  return value;
}
export async function preparedDenseRemoveBoundary(t, onReadDiagnostic, replayRoot, dContext) {
  const pair = JSON.parse(
    await readFile(
      new URL('./native-refresh-retained-sites-preparation.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(pair.status, 'GENERATED_SOURCE_PREPARATION_ONLY');
  assert.equal(pair.calibrationEligible, false);
  assert.equal(pair.next.memberCount, pair.accepted.memberCount + 1);
  for (const item of [pair.accepted, pair.next]) {
    const raw = Buffer.from(sourceAt(item.memberCount));
    assert.equal(raw.length, item.sourceBytes);
    assert.equal(sha(raw), item.sourceSha256);
  }
  // The adjacent predecessor is a derived source-family seed, not a new cap.
  // Prove it fits this modified-file request before advancing one field at a time.
  const lowerSeed = pair.accepted.memberCount - 1;
  function* counts() {
    for (let count = lowerSeed; ; count++) yield count;
  }
  const boundFrame = (template, summary, count) =>
    frame(
      replayRoot === undefined
        ? template
        : {
            ...template,
            payload: {
              ...template.payload,
              repository: { ...template.payload.repository, rootPath: replayRoot },
            },
          },
      summary,
      count,
    );
  let { accepted, next } = await sizeRetainedSitesBoundary(
    t,
    counts(),
    boundFrame,
    onReadDiagnostic,
    dContext,
  );
  assert.ok(accepted.metrics.memberCount >= lowerSeed);
  assert.equal(next.metrics.memberCount, accepted.metrics.memberCount + 1);
  const row = transition(accepted.metrics.memberCount);
  const fixture = await preparedSourceRefresh(t, row, 1, onReadDiagnostic, replayRoot, dContext);
  assert.deepEqual(fixture.prepared.baseline.summaries, accepted.baseline.summaries);
  accepted = frame(
    fixture.prepared.request,
    fixture.prepared.baseline.summaries[0],
    accepted.metrics.memberCount,
  );
  next = frame(fixture.prepared.request, next.baseline.summaries[0], next.metrics.memberCount);
  assert.deepEqual(accepted.request, fixture.prepared.request);
  assert.ok(accepted.metrics.inputBytes <= NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes);
  assert.ok(next.metrics.inputBytes > NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes);
  assert.ok(next.metrics.largestLineBytes + 1 <= NATIVE_CLIENT_HARD_LIMITS.maxLineBytes);
  return { fixture, transition: row, accepted, next };
}
