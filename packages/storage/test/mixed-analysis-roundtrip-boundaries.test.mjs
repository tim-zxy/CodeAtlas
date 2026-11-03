import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { historyFixture, seedLiteral, historyLimits } from './helpers/r011-history-fixture.mjs';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import {
  HistoryReadBudget,
  encodeHistoryValue,
} from '../dist/analysis/activation-history-format.js';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
const root = new URL('../../../fixtures/phase1/mixed-analysis-stage/', import.meta.url),
  r = JSON.parse(fs.readFileSync(new URL('roundtrip-budget-boundary-reference.json', root))),
  ref = JSON.parse(fs.readFileSync(r.source.path)),
  x = JSON.parse(fs.readFileSync(ref.source.path)),
  sha = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  C = (v) =>
    Array.isArray(v)
      ? '[' + v.map(C).join(',') + ']'
      : v && typeof v === 'object'
        ? '{' +
          Object.keys(v)
            .sort()
            .map((k) => JSON.stringify(k) + ':' + C(v[k]))
            .join(',') +
          '}'
        : JSON.stringify(v),
  nodes = (v) =>
    1 + (v && typeof v === 'object' ? Object.values(v).reduce((n, c) => n + nodes(c), 0) : 0),
  weight = (v) =>
    typeof v === 'string'
      ? Buffer.byteLength(v)
      : v && typeof v === 'object'
        ? (Array.isArray(v) ? 0 : Object.keys(v).reduce((n, k) => n + Buffer.byteLength(k), 0)) +
          Object.values(v).reduce((n, c) => n + weight(c), 0)
        : 0,
  depth = (v) =>
    v && typeof v === 'object' ? Math.max(0, ...Object.values(v).map((c) => 1 + depth(c))) : 0;
function roundtrip(value, limits) {
  const b = new HistoryReadBudget(limits);
  b.own(value);
  return b.parse(encodeHistoryValue(value, b));
}
for (const kind of ['items', 'bytes'])
  test(
    'bound original ' +
      kind +
      '-one-below uses independent closed roundtrip cost and refuses real Stage before FROZEN publication',
    async (t) => {
      assert.equal(sha(fs.readFileSync(r.source.path)), r.source.sha256);
      const binding = r.bindings.find((v) => v.id === kind + '-one-below');
      for (const k of ['input', 'expected'])
        assert.equal(sha(fs.readFileSync(new URL(binding[k], root))), binding[k + 'Sha256']);
      const value = structuredClone(ref.cumulative.fullFrozenResult);
      assert.equal(nodes(value), r.cost.valueNodes);
      assert.equal(weight(value), r.cost.decodedStringWeight);
      assert.equal(depth(value), r.cost.depth);
      assert.equal(Buffer.byteLength(C(value)), r.cost.canonicalBytesWithZeroReceipt);
      const f = await historyFixture(t, 'available', { seed: false });
      seedLiteral(f.db, x.input);
      const before = allRows(f.db),
        h = captureActivationContext(f.db, x.input.repositoryId, historyLimits),
        real = createMixedAnalysisRules();
      let calls = 0,
        independentItems,
        independentBytes,
        roots = 0;
      const rules = Object.freeze({
        ...real,
        compose(input, limits) {
          calls++;
          assert.equal(input.mode, 'DELTA');
          assert.deepEqual(
            input.capture.history,
            JSON.parse(x.input.tables.activation_history[0].manifest_json),
          );
          if (kind === 'items') {
            independentItems = 3 * nodes(value);
            assert.ok(limits.maxItems > independentItems);
            value.usage.items = limits.maxItems - independentItems + 1;
          } else {
            for (let i = 0; i < 32; i++) {
              const next = limits.maxSerializedBytes - 2 * Buffer.byteLength(C(value)) + 1;
              assert.ok(Number.isSafeInteger(next) && next >= 0);
              if (value.usage.serializedBytes === next) break;
              value.usage.serializedBytes = next;
            }
            independentBytes = 2 * Buffer.byteLength(C(value));
            assert.equal(
              value.usage.serializedBytes,
              limits.maxSerializedBytes - independentBytes + 1,
            );
          }
          return value;
        },
      });
      const stage = new MixedAnalysisStage(f.db, h.handle, 'DELTA', historyLimits, rules),
        owner = stage.prepareOwner(null, x.preparation);
      stage.acceptObservation(owner.ownerHandle, null);
      const own = HistoryReadBudget.prototype.own;
      HistoryReadBudget.prototype.own = function (v, ...args) {
        if (
          v &&
          v.activationId === value.activationId &&
          Object.keys(v).length === Object.keys(value).length
        )
          roots++;
        return own.call(this, v, ...args);
      };
      try {
        assert.throws(
          () => stage.freeze(),
          (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
        );
      } finally {
        HistoryReadBudget.prototype.own = own;
      }
      assert.equal(calls, 1);
      assert.equal(roots, kind === 'items' ? 3 : 2);
      assert.equal(
        f.db.prepare("SELECT count(*) n FROM mixed_stage WHERE key='FROZEN'").get().n,
        0,
      );
      assert.throws(
        () => stage.freeze(),
        (e) => e.code === 'STAGE_RELEASED',
      );
      assert.deepEqual(allRows(f.db), before);
      assert.deepEqual(allRows(f.reopen(true)), before);
      stage.close();
      const exactItems = 3 * nodes(value),
        exactBytes = 2 * Buffer.byteLength(C(value)),
        exactMemory = 2 * (2 * weight(value) + exactBytes),
        limits = {
          ...historyLimits,
          maxItems: exactItems,
          maxSerializedBytes: exactBytes,
          memoryBudgetBytes: exactMemory,
          maxDepth: depth(value),
        };
      assert.deepEqual(roundtrip(value, limits), value);
      for (const key of ['maxItems', 'maxSerializedBytes', 'memoryBudgetBytes', 'maxDepth'])
        assert.throws(
          () => roundtrip(value, { ...limits, [key]: limits[key] - 1 }),
          (e) => e.code === 'HISTORY_LIMIT_EXCEEDED',
        );
      assert.equal(
        kind === 'items' ? independentItems : independentBytes,
        kind === 'items' ? exactItems : exactBytes,
      );
    },
  );
