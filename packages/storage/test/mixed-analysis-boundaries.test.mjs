import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { cases, loadCase } from '../../../fixtures/phase1/mixed-analysis-stage/corpus.mjs';
import { readComponentReference } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
import { observationFixture, ownerFixture } from './helpers/mixed-analysis-fixture.mjs';
import { allRows, stageOnConnection } from './helpers/mixed-analysis-store-fixture.mjs';
import { historyFixture, seedLiteral, historyLimits } from './helpers/r011-history-fixture.mjs';
import {
  captureActivationContext,
  releaseActivationContext,
} from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { MixedAnalysisStore } from '../dist/analysis/mixed-analysis-store.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
const root = new URL('../../../fixtures/phase1/mixed-analysis-stage/', import.meta.url),
  bindings = JSON.parse(fs.readFileSync(new URL('boundary-execution-bindings.json', root)));
const safeError = (e) => typeof e.code === 'string' && e.message === e.code;
for (const binding of bindings.cases)
  test('bound original boundary ' + binding.id, async (t) => {
    const c = cases.find((c) => c.id === binding.id),
      { input, expected } = loadCase(c);
    assert.equal(input.scenario, binding.id);
    assert.equal(expected.persistentRows, 'EXACT_LITERAL_BASE');
    assert.equal(expected.noPublication, true);
    for (const key of ['input', 'expected'])
      assert.equal(
        crypto
          .createHash('sha256')
          .update(fs.readFileSync(new URL(c[key], root)))
          .digest('hex'),
        binding[key + 'Sha256'],
      );
    let f,
      ctx,
      s,
      owner,
      token,
      closed = false;
    if (binding.id === 'foreign-full-refused') {
      const literal = JSON.parse(fs.readFileSync(new URL('base-input.json', root)));
      for (const row of literal.tables.source_files) row.language_hint = 'python';
      literal.tables.active_history_pointer = [];
      f = await historyFixture(t, 'available', { seed: false });
      seedLiteral(f.db, literal);
      const before = allRows(f.db),
        h = captureActivationContext(f.db, literal.repositoryId, historyLimits);
      assert.equal(h.view.status, 'UNAVAILABLE');
      s = new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, createMixedAnalysisRules());
      assert.throws(
        () =>
          s.prepareOwner(
            null,
            JSON.parse(readComponentReference('owner-scope-independent/full-python.json'))
              .preparation,
          ),
        (e) => e.code === 'OTHER_PROVIDER_REVALIDATION_REQUIRED',
      );
      s.close();
      assert.deepEqual(allRows(f.db), before);
      assert.deepEqual(allRows(f.reopen(true)), before);
      return;
    }
    if (binding.id === 'delete-only-null') {
      f = await ownerFixture(t, 'delta-delete-only');
      const before = allRows(f.db),
        h = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
      s = new MixedAnalysisStage(
        f.db,
        h.handle,
        'DELTA',
        historyLimits,
        createMixedAnalysisRules(),
      );
      owner = s.prepareOwner(null, f.preparation);
      s.acceptObservation(owner.ownerHandle, null);
      token = s.freeze();
      const result = JSON.parse(
        f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='FROZEN'").get().value_json,
      );
      assert.equal(result.manifest.observation, null);
      assert.equal(result.manifest.transitions.kind, 'TRANSITION_DRAFT');
      assert.deepEqual(result.origins, []);
      assert.deepEqual(result.projections, []);
      s.close();
      assert.deepEqual(allRows(f.db), before);
      assert.deepEqual(allRows(f.reopen(true)), before);
      return;
    }
    f = await observationFixture(t, 'mixed');
    const before = allRows(f.db);
    ctx = stageOnConnection(f.db);
    s = ctx.stage;
    const prepare = () => (owner = s.prepareOwner(ctx.javaRows, ctx.preparation)),
      accept = () => s.acceptObservation(owner.ownerHandle, ctx.observationForOwner(owner));
    if (binding.id === 'second-stage') {
      const h = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
      assert.throws(
        () =>
          new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, createMixedAnalysisRules()),
        (e) => e.code === 'INVALID_STAGE',
      );
      prepare();
      accept();
      token = s.freeze();
    } else if (binding.id === 'cross-db-owner') {
      prepare();
      const g = await observationFixture(t, 'mixed'),
        other = stageOnConnection(g.db),
        foreign = other.stage.prepareOwner(other.javaRows, other.preparation),
        otherBefore = allRows(g.db);
      assert.throws(
        () => s.acceptObservation(foreign.ownerHandle, other.observationForOwner(foreign)),
        (e) => e.code === 'INVALID_CANDIDATE',
      );
      assert.throws(accept, (e) => e.code === 'STAGE_RELEASED');
      other.stage.close();
      assert.deepEqual(allRows(g.db), otherBefore);
    } else if (binding.id === 'clone-owner') {
      prepare();
      assert.throws(
        () =>
          s.acceptObservation(structuredClone(owner.ownerHandle), ctx.observationForOwner(owner)),
        (e) => e.code === 'INVALID_CANDIDATE',
      );
      assert.throws(accept, (e) => e.code === 'STAGE_RELEASED');
    } else if (binding.id === 'clone-lease') {
      prepare();
      accept();
      token = s.freeze();
      assert.throws(
        () => new MixedAnalysisStore(f.db).apply(structuredClone(token.lease), historyLimits),
        (e) => e.code === 'INVALID_STAGE',
      );
    } else if (binding.id === 'reopen') {
      prepare();
      f.db.close();
      f.db.open();
      assert.throws(accept, safeError);
    } else if (binding.id === 'released-capture') {
      s.close();
      closed = true;
      const h = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
      releaseActivationContext(f.db, h.handle);
      assert.throws(
        () =>
          new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, createMixedAnalysisRules()),
        safeError,
      );
    } else if (binding.id === 'temp-tamper') {
      prepare();
      f.db.prepare("UPDATE mixed_stage SET value_json='{}' WHERE key='OWNER'").run();
      assert.throws(accept, (e) => e.code === 'STAGE_CHANGED');
    } else if (binding.id === 'raw-mutation') {
      prepare();
      const raw = ctx.observationForOwner(owner);
      s.acceptObservation(owner.ownerHandle, raw);
      raw.requestBytes.fill(0);
      raw.outputBytes.fill(0);
      raw.metadata.snapshot.id = 'mutated-after-owned-copy';
      token = s.freeze();
      const actual = JSON.parse(
          f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='FROZEN'").get().value_json,
        ),
        ref = JSON.parse(readComponentReference('stage-freeze-independent/mixed.json'));
      for (const key of ['manifest', 'origins', 'projections', 'members', 'basis', 'activationId'])
        assert.deepEqual(actual[key], ref[key]);
    } else if (binding.id === 'port-twice') {
      s.close();
      const h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
        real = createMixedAnalysisRules();
      let calls = 0;
      s = new MixedAnalysisStage(
        f.db,
        h.handle,
        'FULL',
        historyLimits,
        Object.freeze({
          ...real,
          compose(...args) {
            calls++;
            return real.compose(...args);
          },
        }),
      );
      prepare();
      accept();
      token = s.freeze();
      assert.throws(
        () => s.freeze(),
        (e) => e.code === 'INVALID_STAGE',
      );
      assert.equal(calls, 1);
    } else {
      const p = structuredClone(ctx.preparation);
      let traps = 0;
      if (binding.id === 'scope-tamper') p.unitIds = [];
      if (binding.id === 'unsafe-getter')
        Object.defineProperty(p, 'contracts', {
          enumerable: true,
          get() {
            traps++;
            throw Error('getter executed');
          },
        });
      if (binding.id === 'unsafe-cycle') p.qualificationRef = p;
      if (binding.id === 'unsafe-sparse') {
        p.contracts.length = 2;
        delete p.contracts[0];
      }
      const value =
        binding.id === 'unsafe-proxy'
          ? new Proxy(p, {
              getPrototypeOf() {
                traps++;
                throw Error('proxy executed');
              },
              get() {
                traps++;
                throw Error('proxy executed');
              },
              ownKeys() {
                traps++;
                throw Error('proxy executed');
              },
            })
          : p;
      assert.throws(() => s.prepareOwner(ctx.javaRows, value), safeError);
      assert.equal(traps, 0);
      assert.throws(prepare, (e) => e.code === 'STAGE_RELEASED');
    }
    assert.deepEqual(allRows(f.db), before);
    if (!closed) s.close();
    assert.deepEqual(allRows(f.reopen(true)), before);
    assert.equal(f.db.isTransaction, false);
    if (token)
      assert.throws(
        () => new MixedAnalysisStore(f.db).apply(token.lease, historyLimits),
        (e) => e.code === 'STAGE_RELEASED',
      );
  });
