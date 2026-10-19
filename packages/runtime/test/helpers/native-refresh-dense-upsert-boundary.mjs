// Actual producer discovery only, not a calibrated or admitted worker.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { streamNativeRefreshV3, NATIVE_CLIENT_HARD_LIMITS } from '../../../providers/dist/index.js';
import { sourceAt } from './native-refresh-retained-sites-boundary.mjs';
import { preparedSourceRefresh, activationImage } from './native-refresh-source-fixture.mjs';
import { observeNativeWire } from './native-refresh-wire-probe.mjs';

const sha = (raw) => createHash('sha256').update(raw).digest('hex');
export function denseUpsertTransition(count) {
  return {
    id: 'source-dense-upsert-boundary',
    baseline: { 'Sites.java': 'baseline.java' },
    target: { 'Sites.java': 'target.java' },
    generatedSources: { 'baseline.java': sourceAt(0), 'target.java': sourceAt(count) },
  };
}
export async function prepareDenseUpsertBoundary(t, onReadDiagnostic, dContext) {
  const pair = JSON.parse(
    await readFile(
      new URL('./native-refresh-retained-sites-preparation.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(pair.status, 'GENERATED_SOURCE_PREPARATION_ONLY');
  assert.equal(pair.calibrationEligible, false);
  const lower = pair.accepted;
  const seed = Buffer.from(sourceAt(lower.memberCount));
  assert.equal(seed.length, lower.sourceBytes);
  assert.equal(sha(seed), lower.sourceSha256);
  const fixture = await preparedSourceRefresh(
    t,
    denseUpsertTransition(lower.memberCount),
    1,
    (diagnostic) => onReadDiagnostic?.(diagnostic, 'GENERATOR_SEED'),
    undefined,
    dContext,
  );
  const before = activationImage(fixture.db);
  let accepted;
  let next;
  // The prior source family is a checked lower seed, never this output boundary.
  // One new legal field per actual Rust REFRESH; no cached Provider facts.
  for (let count = lower.memberCount; ; count++) {
    const raw = Buffer.from(sourceAt(count));
    await writeFile(join(fixture.prepared.request.payload.repository.rootPath, 'Sites.java'), raw);
    const request = structuredClone(fixture.prepared.request);
    const file = { ...fixture.targetFiles[0], contentFingerprint: 'sha256:' + sha(raw) };
    request.payload.targetSourceFiles = [file];
    request.payload.changes.modified = [file];
    request.payload.targetRevision.contentFingerprint = 'sha256:' + sha(JSON.stringify([file]));
    const entry = {
      memberCount: count,
      sourceBytes: raw.length,
      sourceSha256: sha(raw),
      outcome: null,
      upserts: 0,
      symbolSites: null,
      summaryBytes: null,
      wire: [],
    };
    let pending = Buffer.alloc(0),
      failedTerminal,
      lastRecord;
    const observed = await observeNativeWire(
      () =>
        streamNativeRefreshV3(
          request,
          fixture.prepared.baseline,
          fixture.options,
          {
            async accept(event) {
              if (event.type === 'UPSERT_NODE') entry.upserts++;
              if (event.type === 'ANALYSIS_SUMMARY') {
                assert.equal(entry.summaryBytes, null);
                entry.summaryBytes = Buffer.byteLength(JSON.stringify(event.payload));
                entry.symbolSites = event.payload.symbols.length;
              }
            },
          },
          fixture.prepared.limits.memoryBudgetBytes,
        ),
      (chunk) => {
        // Preparation-only terminal evidence. One inherited-cap-bounded line,
        // not a whole-stream buffer or an extra reader/listener.
        let at = 0;
        while (at < chunk.length) {
          const lf = chunk.indexOf(10, at);
          const end = lf < 0 ? chunk.length : lf;
          assert.ok(pending.length + end - at <= NATIVE_CLIENT_HARD_LIMITS.maxLineBytes);
          pending = Buffer.concat([pending, chunk.subarray(at, end)]);
          if (lf < 0) break;
          lastRecord = pending.toString('utf8');
          pending = Buffer.alloc(0);
          at = lf + 1;
        }
      },
    );
    if (observed.threw && observed.error?.code !== 'ANALYZER_FAILED') throw observed.error;
    if (observed.error?.code === 'ANALYZER_FAILED') {
      failedTerminal = JSON.parse(lastRecord);
      assert.equal(failedTerminal.type, 'REFRESH_FAILED');
    }
    entry.wire = observed.wire;
    entry.clientError = observed.error?.code ?? null;
    entry.outcome =
      failedTerminal?.payload.error.code ??
      observed.error?.code ??
      observed.value.terminal.payload.outcome;
    assert.deepEqual(activationImage(fixture.db), before);
    if (entry.outcome !== 'SUCCEEDED') {
      assert.ok(
        accepted,
        'Previously checked lower source seed must succeed on the actual output path',
      );
      assert.equal(entry.outcome, 'RESOURCE_LIMIT_EXCEEDED', lastRecord);
      assert.equal(entry.clientError, 'ANALYZER_FAILED');
      assert.match(
        failedTerminal.payload.error.message,
        /Summary workspace or size exceeds budget/,
      );
      entry.producerError = failedTerminal.payload.error;
      next = entry;
      break;
    }
    assert.equal(entry.symbolSites, count + 1);
    accepted = entry;
  }
  assert.equal(fixture.db.isTransaction, false);
  fixture.db.close();
  const reopened = new DatabaseSync(fixture.databasePath);
  try {
    assert.deepEqual(activationImage(reopened), before);
  } finally {
    reopened.close();
  }
  return {
    status: 'REAL_PRODUCER_BOUNDARY_PREPARATION_ONLY',
    calibrationEligible: false,
    lowerSeed: lower.memberCount,
    accepted,
    next,
    persistentStateVerified: true,
  };
}
