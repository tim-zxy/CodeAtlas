// Offline source corpus preparation only; no product API or admission profile.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  NATIVE_CLIENT_HARD_LIMITS,
  streamNativeFullAnalysisV3,
} from '../../../providers/dist/index.js';
import { preparedSourceRefresh } from './native-refresh-source-fixture.mjs';
import { frameSourceRefreshBoundary } from './native-refresh-source-input-boundary.mjs';

const id = 'source-field-sites-boundary';
export const sourceAt = (count) =>
  'class Sites {\n' +
  Array.from({ length: count }, (_, i) => `  int f${String(i).padStart(6, '0')};\n`).join('') +
  '}\n';
function transition(count) {
  return {
    id,
    baseline: { 'Sites.java': 'generated-sites.java' },
    target: { 'Sites.java': 'generated-sites.java' },
    generatedSources: { 'generated-sites.java': sourceAt(count) },
  };
}
function measured(template, summary, memberCount) {
  const value = frameSourceRefreshBoundary(template, [summary]);
  value.metrics.memberCount = memberCount;
  value.metrics.symbolSites = summary.symbols.length;
  value.metrics.sourceBytes = Buffer.byteLength(sourceAt(memberCount));
  return value;
}
export async function sizeRetainedSitesBoundary(
  t,
  counts,
  frame = measured,
  onReadDiagnostic,
  dContext,
) {
  const seed = await preparedSourceRefresh(
    t,
    transition(0),
    1,
    (diagnostic) => onReadDiagnostic?.(diagnostic, 'GENERATOR_SEED'),
    undefined,
    dContext,
  );
  const template = seed.prepared.request;
  let accepted = frame(template, seed.prepared.baseline.summaries[0], 0);
  let next;
  // ponytail: offline O(n²) parse/framing growth, never final measured worker
  // setup; freeze generated source/summary artifacts before calibration.
  for (const count of counts) {
    const raw = Buffer.from(sourceAt(count));
    await writeFile(join(template.payload.repository.rootPath, 'Sites.java'), raw);
    const file = {
      ...seed.prepared.baseline.summaries[0].sourceFile,
      contentFingerprint: 'sha256:' + createHash('sha256').update(raw).digest('hex'),
    };
    const { payload } = template;
    let summary;
    const { terminal } = await streamNativeFullAnalysisV3(
      {
        protocolVersion: 3,
        requestId: 'd5-sites-sizing',
        sequence: 0,
        type: 'ANALYZE',
        payload: {
          irSchemaVersion: 1,
          providerSnapshotId: 'snapshot-source-bootstrap',
          repository: payload.repository,
          revision: payload.targetRevision,
          sourceFiles: [file],
          requestedCapabilities: payload.requestedCapabilities,
          deadlineEpochMs: null,
          resourceBudget: payload.resourceBudget,
          analysisStateContext: payload.analysisStateContext,
          baselineState: null,
        },
      },
      seed.options,
      {
        async accept(event) {
          if (event.type === 'ANALYSIS_SUMMARY') {
            assert.equal(summary, undefined);
            summary = event.payload;
          }
        },
      },
    );
    assert.equal(terminal.payload.outcome, 'SUCCEEDED');
    assert.deepEqual(summary.sourceFile, file);
    assert.equal(summary.symbols.length, count + 1);
    next = frame(template, summary, count);
    if (
      next.metrics.inputBytes > NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes ||
      next.metrics.largestLineBytes + 1 > NATIVE_CLIENT_HARD_LIMITS.maxLineBytes
    )
      break;
    accepted = next;
  }
  assert.ok(next.metrics.inputBytes > NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes);
  return { accepted, next };
}
// Explicit offline regeneration; never repeat this growth inside measured workers.
export async function generateRetainedSitesBoundary(t, dContext) {
  function* counts() {
    for (let count = 1; ; count++) yield count;
  }
  return sizeRetainedSitesBoundary(t, counts(), measured, undefined, dContext);
}
export async function preparedRetainedSitesBoundary(t, onReadDiagnostic, replayRoot, dContext) {
  const pair = JSON.parse(
    await readFile(
      new URL('./native-refresh-retained-sites-preparation.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(pair.status, 'GENERATED_SOURCE_PREPARATION_ONLY');
  assert.equal(pair.calibrationEligible, false);
  assert.equal(pair.next.memberCount, pair.accepted.memberCount + 1);
  for (const entry of [pair.accepted, pair.next]) {
    const raw = Buffer.from(sourceAt(entry.memberCount));
    assert.equal(raw.length, entry.sourceBytes);
    assert.equal(createHash('sha256').update(raw).digest('hex'), entry.sourceSha256);
  }
  const size = (counts) =>
    sizeRetainedSitesBoundary(
      t,
      counts,
      (template, summary, count) => {
        const value = frameSourceRefreshBoundary(template, [summary], [], replayRoot);
        value.metrics.memberCount = count;
        value.metrics.symbolSites = summary.symbols.length;
        value.metrics.sourceBytes = Buffer.byteLength(sourceAt(count));
        return value;
      },
      onReadDiagnostic,
      dContext,
    );
  let accepted, next;
  if (dContext === undefined) {
    ({ accepted, next } = await size([pair.accepted.memberCount, pair.next.memberCount]));
    assert.equal(accepted.metrics.memberCount, pair.accepted.memberCount);
    assert.equal(next.metrics.memberCount, pair.next.memberCount);
  } else {
    // Checked source bytes are only a starting point, not a portable wire boundary.
    // A longer root may reject that seed; lower by one field until legal, then
    // grow by one actual parse until the original inherited cap refuses.
    for (let start = pair.accepted.memberCount; start > 0; start--) {
      function* counts() {
        for (let count = start; ; count++) yield count;
      }
      ({ accepted, next } = await size(counts()));
      if (accepted.metrics.memberCount > 0) break;
    }
    assert.ok(accepted.metrics.memberCount > 0, 'D fixture context has no legal source seed');
    assert.equal(next.metrics.memberCount, accepted.metrics.memberCount + 1);
  }
  const row = transition(accepted.metrics.memberCount);
  const fixture = await preparedSourceRefresh(t, row, 1, onReadDiagnostic, replayRoot, dContext);
  assert.deepEqual(fixture.prepared.baseline.summaries, accepted.baseline.summaries);
  accepted = measured(
    fixture.prepared.request,
    fixture.prepared.baseline.summaries[0],
    accepted.metrics.memberCount,
  );
  next = measured(fixture.prepared.request, next.baseline.summaries[0], next.metrics.memberCount);
  assert.ok(accepted.metrics.inputBytes <= NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes);
  assert.ok(next.metrics.inputBytes > NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes);
  return { fixture, transition: row, accepted, next };
}
