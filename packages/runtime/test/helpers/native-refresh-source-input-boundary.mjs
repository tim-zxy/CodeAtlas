// Offline corpus preparation, never a measured worker or a product entry point.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NATIVE_CLIENT_HARD_LIMITS,
  streamNativeFullAnalysisV3,
} from '../../../providers/dist/index.js';
import { stateDigest } from '../../../providers/test/helpers/native-full-v3-corpus.mjs';
import { requestBytes } from '../../../providers/test/helpers/native-refresh-v3-corpus.mjs';
import { preparedSourceRefresh, sourceTransitions } from './native-refresh-source-fixture.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const nameAt = (index) => `File${String(index).padStart(6, '0')}.java`;
function transition(count, artifact, transitionId) {
  const files = Object.fromEntries(Array.from({ length: count }, (_, i) => [nameAt(i), artifact]));
  return { id: transitionId, baseline: files, target: files };
}
export function frameSourceRefreshBoundary(
  requestTemplate,
  summaries,
  targetOverrides = [],
  replayRoot,
) {
  const request = structuredClone(requestTemplate);
  if (replayRoot !== undefined) request.payload.repository.rootPath = replayRoot;
  const files = summaries.map((summary) => summary.sourceFile);
  const fingerprint = `sha256:${sha(JSON.stringify(files))}`;
  const header = {
    ...request.payload.baselineState,
    contentFingerprint: fingerprint,
    sourceFileCount: files.length,
    summaryDigest: stateDigest(summaries),
  };
  request.payload.baselineState = header;
  request.payload.baseRevisionFingerprint = fingerprint;
  const overrides = new Map(targetOverrides.map((file) => [file.id, file]));
  const targetFiles = files.map((file) => overrides.get(file.id) ?? file);
  request.payload.targetRevision.contentFingerprint = `sha256:${sha(JSON.stringify(targetFiles))}`;
  request.payload.targetSourceFiles = targetFiles;
  const baseline = { header, summaries: [...summaries] };
  const bytes = requestBytes(request, baseline);
  const lines = bytes.toString('utf8').slice(0, -1).split('\n');
  return {
    request,
    baseline,
    bytes,
    metrics: {
      fileCount: files.length,
      inputBytes: bytes.length,
      inputRecords: lines.length,
      largestLineBytes: Math.max(...lines.map((line) => Buffer.byteLength(line))),
      summaryBytes: summaries.reduce(
        (n, summary) => n + Buffer.byteLength(JSON.stringify(summary)),
        0,
      ),
      payloadDigest: sha(bytes),
    },
  };
}

export async function preparedSourceInputBoundary(t, onReadDiagnostic, replayRoot, dContext) {
  return preparedFileBoundary(
    t,
    'Empty.java',
    'source-empty-input-boundary',
    undefined,
    onReadDiagnostic,
    replayRoot,
    dContext,
  );
}

export async function preparedSharedOwnersBoundary(t, onReadDiagnostic, replayRoot, dContext) {
  return preparedFileBoundary(
    t,
    'SharedA.java',
    'source-shared-owners-boundary',
    undefined,
    onReadDiagnostic,
    replayRoot,
    dContext,
  );
}

export async function preparedCompleteCoverageBoundary(t, onReadDiagnostic, replayRoot, dContext) {
  return preparedFileBoundary(
    t,
    'Empty.java',
    'source-complete-coverage-boundary',
    sourceTransitions.find((row) => row.id === 'add-method-unknown-to-resolved'),
    onReadDiagnostic,
    replayRoot,
    dContext,
  );
}

async function preparedFileBoundary(
  t,
  artifact,
  transitionId,
  base = { baseline: {}, target: {} },
  onReadDiagnostic,
  replayRoot,
  dContext,
) {
  const rowAt = (count) => {
    const row = transition(count, artifact, transitionId);
    return {
      ...base,
      ...row,
      baseline: { ...base.baseline, ...row.baseline },
      target: { ...base.target, ...row.target },
    };
  };
  const frame = (template, summaries) =>
    frameSourceRefreshBoundary(
      template,
      [...summaries].sort((a, b) => a.sourceFile.path.localeCompare(b.sourceFile.path)),
      template.payload.targetSourceFiles,
      replayRoot,
    );
  const seed = await preparedSourceRefresh(
    t,
    rowAt(1),
    1,
    (diagnostic) => onReadDiagnostic?.(diagnostic, 'GENERATOR_SEED'),
    undefined,
    dContext,
  );
  const template = seed.prepared.request;
  const summaries = [...seed.prepared.baseline.summaries];
  let accepted = frame(template, summaries);
  let next;
  // ponytail: bounded offline repeated parsing/framing; freeze these corpus artifacts
  // before calibration rather than adding speculative sizing or fake fact identities.
  for (let index = 1; ; index++) {
    const path = nameAt(index);
    await cp(
      fileURLToPath(
        new URL(
          '../../../../fixtures/native/java-refresh-producer/source/' + artifact,
          import.meta.url,
        ),
      ),
      join(template.payload.repository.rootPath, path),
    );
    const file = {
      ...summaries.find((summary) => summary.sourceFile.id === nameAt(0)).sourceFile,
      id: path,
      path,
    };
    const { payload } = template;
    let summary;
    const { terminal } = await streamNativeFullAnalysisV3(
      {
        protocolVersion: 3,
        requestId: 'd5-source-sizing',
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
    summaries.push(summary);
    next = frame(template, summaries);
    if (
      next.metrics.inputBytes > NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes ||
      next.metrics.largestLineBytes + 1 > NATIVE_CLIENT_HARD_LIMITS.maxLineBytes
    )
      break;
    accepted = next;
  }
  // Real multi-file bootstrap + Store publication + close/reopen + D1 preparation.
  const row = rowAt(accepted.metrics.fileCount - Object.keys(base.baseline).length);
  const fixture = await preparedSourceRefresh(t, row, 1, onReadDiagnostic, replayRoot, dContext);
  assert.deepEqual(fixture.prepared.baseline.summaries, accepted.baseline.summaries);
  accepted = frame(fixture.prepared.request, fixture.prepared.baseline.summaries);
  assert.deepEqual(accepted.request, fixture.prepared.request);
  next = frame(fixture.prepared.request, summaries);
  assert.ok(accepted.metrics.inputBytes <= NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes);
  assert.ok(next.metrics.inputBytes > NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes);
  assert.equal(next.metrics.fileCount, accepted.metrics.fileCount + 1);
  return { fixture, transition: row, accepted, next };
}
