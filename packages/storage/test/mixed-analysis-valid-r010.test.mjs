import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { emptyNativePatch, nativePatchLimits } from './helpers/native-refresh-patch-fixture.mjs';
import {
  prefixPlan,
  installComponentManifest,
  historyLimits,
  referenceCanonical,
} from './helpers/r011-history-fixture.mjs';
import { applyMigrationPlan } from '../dist/migrations/runner.js';
import { readNativeAnalysisState, readNativeRefreshBaseline } from '../dist/index.js';
import { validateNativeStateCandidate } from '../../providers/dist/index.js';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { MixedAnalysisStore } from '../dist/analysis/mixed-analysis-store.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
const x = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../fixtures/phase1/mixed-analysis-store/valid-r010-clearing-context.json',
        import.meta.url,
      ),
    ),
  ),
  order = (rows) =>
    rows
      .map((r) => ({ ...r }))
      .sort((a, b) =>
        referenceCanonical(a) < referenceCanonical(b)
          ? -1
          : referenceCanonical(a) > referenceCanonical(b)
            ? 1
            : 0,
      );
test('genuine validated R010 baseline is cleared atomically by mixed Store and old readers require bootstrap', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixed-valid-r010-')),
    file = path.join(dir, 'repository.sqlite'),
    c = await emptyNativePatch(t, false, false, null, file),
    db = c.db;
  c.stage.close();
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 10);
  assert.equal(
    readNativeAnalysisState(db, c.expected, validateNativeStateCandidate, nativePatchLimits).status,
    'AVAILABLE',
  );
  assert.equal(db.prepare('SELECT count(*) n FROM native_analysis_state').get().n, 1);
  applyMigrationPlan(db, await prefixPlan(11));
  assert.deepEqual(await installComponentManifest(db, x.oldManifest), x.oldManifest);
  assert.equal(
    readNativeRefreshBaseline(db, c.expected, validateNativeStateCandidate, nativePatchLimits)
      .status,
    'AVAILABLE',
  );
  const before = allRows(db),
    h = captureActivationContext(db, 'r', historyLimits);
  assert.equal(h.view.status, 'AVAILABLE');
  assert.deepEqual(h.view.history, x.oldManifest);
  const stage = new MixedAnalysisStage(
    db,
    h.handle,
    'FULL',
    historyLimits,
    createMixedAnalysisRules(),
  );
  t.after(() => stage.close());
  const owner = stage.prepareOwner(null, x.preparation);
  assert.equal(owner.stageDigest, x.owner.stageDigest);
  stage.acceptObservation(owner.ownerHandle, {
    metadata: x.raw.metadata,
    requestBytes: Buffer.from(x.raw.requestText),
    outputBytes: Buffer.from(x.raw.outputText),
  });
  const token = stage.freeze();
  assert.deepEqual(allRows(db), before);
  assert.equal(
    new MixedAnalysisStore(db).apply(token.lease, historyLimits),
    x.expected.activationId,
  );
  const target = { ...before, ...x.expectedTables };
  const readonly = new DatabaseSync(file, { readOnly: true });
  try {
    for (const conn of [db, readonly]) {
      const actual = allRows(conn);
      for (const [table, expected] of Object.entries(target))
        assert.deepEqual(order(actual[table]), order(expected), table);
      assert.deepEqual(
        readNativeAnalysisState(conn, c.expected, validateNativeStateCandidate, nativePatchLimits),
        { status: 'UNAVAILABLE', reason: 'MISSING' },
      );
      assert.deepEqual(
        readNativeRefreshBaseline(
          conn,
          c.expected,
          validateNativeStateCandidate,
          nativePatchLimits,
        ),
        { status: 'UNAVAILABLE', reason: 'MISSING' },
      );
      assert.deepEqual(
        captureActivationContext(conn, 'r', historyLimits).view.history,
        x.expected.manifest,
      );
    }
  } finally {
    readonly.close();
  }
});
