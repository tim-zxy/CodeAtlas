import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  historyFixture,
  seedLiteral,
  historyLimits,
  referenceCanonical,
} from './helpers/r011-history-fixture.mjs';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { MixedAnalysisStore } from '../dist/analysis/mixed-analysis-store.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
const root = new URL('../../../fixtures/phase1/mixed-analysis-store/', import.meta.url),
  read = (id) => JSON.parse(fs.readFileSync(new URL('orphan-' + id + '-context.json', root))),
  sha = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  H = (d, v) => sha(d + String.fromCharCode(0) + referenceCanonical(v)),
  ordered = (rows) =>
    rows
      .map((r) => ({ ...r }))
      .sort((a, b) =>
        referenceCanonical(a) < referenceCanonical(b)
          ? -1
          : referenceCanonical(a) > referenceCanonical(b)
            ? 1
            : 0,
      );
for (const id of ['coverage-multiplicity', 'all-snapshot-census'])
  test(
    'bound original orphan full ' +
      id +
      ' uses complete immutable snapshot carrier and exact physical SQL target',
    async (t) => {
      const x = read(id);
      for (const b of x.bindings)
        for (const key of ['input', 'expected'])
          assert.equal(sha(fs.readFileSync(new URL(b[key], root))), b[key + 'Sha256']);
      const raw = {
          metadata: x.raw.metadata,
          requestBytes: Buffer.from(x.raw.requestText),
          outputBytes: Buffer.from(x.raw.outputText),
        },
        rules = createMixedAnalysisRules(),
        { usage, code, ...control } = rules.compose(
          { ...x.declaredInput, rawBundle: raw },
          historyLimits,
        );
      assert.deepEqual(
        { ...control, projections: ordered(control.projections) },
        { ...x.expected, projections: ordered(x.expected.projections) },
        'independently qualified full input must already match pure Runtime',
      );
      const f = await historyFixture(t, 'available', { seed: false });
      seedLiteral(f.db, x.input);
      const before = allRows(f.db),
        h = captureActivationContext(f.db, x.input.repositoryId, historyLimits);
      assert.equal(h.view.status, 'UNAVAILABLE');
      assert.deepEqual(h.view.activeBasis, x.owner.body.expectedOldBasis);
      const stage = new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, rules),
        owner = stage.prepareOwner(null, x.preparation);
      assert.equal(owner.stageDigest, x.owner.stageDigest);
      stage.acceptObservation(owner.ownerHandle, raw);
      const token = stage.freeze(),
        stored = JSON.parse(
          f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='FROZEN'").get().value_json,
        );
      for (const key of Object.keys(x.expected)) {
        const actual = key === 'projections' ? ordered(stored[key]) : stored[key],
          expected = key === 'projections' ? ordered(x.expected[key]) : x.expected[key];
        assert.deepEqual(actual, expected, key);
      }
      assert.deepEqual(allRows(f.db), before);
      const target = {
          ...before,
          ...Object.fromEntries(Object.entries(x.expectedTables).map(([k, v]) => [k, ordered(v)])),
        },
        store = new MixedAnalysisStore(f.db);
      assert.equal(store.apply(token.lease, historyLimits), x.expected.activationId);
      assert.deepEqual(allRows(f.db), target);
      assert.deepEqual(allRows(f.reopen(true)), target);
      assert.throws(
        () => store.apply(token.lease, historyLimits),
        (e) => e.code === 'STAGE_RELEASED',
      );
      const fresh = captureActivationContext(f.db, x.input.repositoryId, historyLimits);
      assert.equal(fresh.view.status, 'AVAILABLE');
      assert.deepEqual(fresh.view.history, x.expected.manifest);
      stage.close();
    },
  );
for (const kind of ['missing-carrier', 'incomplete-snapshot', 'different-sql-metadata'])
  test(
    'orphan snapshot recovery refuses ' + kind + ' without inventing full metadata',
    async (t) => {
      const x = read('coverage-multiplicity'),
        input = structuredClone(x.input);
      if (kind === 'missing-carrier') {
        input.tables.activation_history = [];
        input.tables.activation_syntax_members = [];
      } else {
        const row = input.tables.activation_history[0],
          m = JSON.parse(row.manifest_json),
          previous = row.id;
        if (kind === 'incomplete-snapshot') delete m.state.snapshots[0].diagnostics;
        if (kind === 'different-sql-metadata')
          m.state.snapshots[0].providerVersion += '-different-carrier';
        m.originRegistryDigest = H('codeatlas-activation-origins-v1', m.state.snapshots);
        row.manifest_json = referenceCanonical(m);
        row.manifest_digest = H('codeatlas-activation-history-v1', m);
        row.id = 'activation:' + row.manifest_digest;
        for (const member of input.tables.activation_syntax_members)
          if (member.activation_id === previous) member.activation_id = row.id;
      }
      const f = await historyFixture(t, 'available', { seed: false });
      seedLiteral(f.db, input);
      const before = allRows(f.db),
        h = captureActivationContext(f.db, input.repositoryId, historyLimits),
        stage = new MixedAnalysisStage(
          f.db,
          h.handle,
          'FULL',
          historyLimits,
          createMixedAnalysisRules(),
        ),
        owner = stage.prepareOwner(null, x.preparation);
      assert.equal(h.view.status, 'UNAVAILABLE');
      assert.throws(
        () =>
          stage.acceptObservation(owner.ownerHandle, {
            metadata: x.raw.metadata,
            requestBytes: Buffer.from(x.raw.requestText),
            outputBytes: Buffer.from(x.raw.outputText),
          }),
        (e) =>
          ['FULL_ANALYSIS_REQUIRED', 'INVALID_CANDIDATE', 'INVALID_STAGE'].includes(e.code) &&
          e.message === e.code,
      );
      assert.throws(
        () => stage.freeze(),
        (e) => e.code === 'STAGE_RELEASED',
      );
      assert.deepEqual(allRows(f.db), before);
      stage.close();
      assert.deepEqual(allRows(f.reopen(true)), before);
    },
  );
