import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareDeclaredDeltaRawObservation } from '../../providers/dist/declared-delta-raw-observation.js';
import { modelDeltaRawAdmission } from '../../../fixtures/phase1/mixed-analysis-stage/independent-delta-raw-resource-model.mjs';
const ref = JSON.parse(
    fs.readFileSync('fixtures/phase1/mixed-analysis-stage/delta-raw-resource-reference.json'),
  ),
  sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
test('independent partial Python DELTA raw admission cumulative exact and one-below', () => {
  for (const s of [ref.source, ...ref.models]) assert.equal(sha(s.path), s.sha256, s.path);
  assert.deepEqual(modelDeltaRawAdmission(ref.packet, ref.raw), ref.expected);
  const x = JSON.parse(fs.readFileSync(ref.source.path));
  assert.deepEqual(ref.raw, x.raw);
  const before = structuredClone({ packet: ref.packet, raw: ref.raw }),
    rb = Buffer.from(ref.raw.requestText),
    ob = Buffer.from(ref.raw.outputText),
    cost = ref.expected.cost,
    l = { maxSerializedBytes: cost.serializedBytes, maxItems: cost.items, maxDepth: cost.maxDepth },
    run = (l) => prepareDeclaredDeltaRawObservation(ref.packet, ref.raw.metadata, rb, ob, l),
    actual = run(l),
    { limits, budget, ...value } = actual;
  assert.deepEqual(value, ref.expected.result);
  assert.deepEqual(budget, { serializedBytes: cost.serializedBytes, items: cost.items });
  for (const key of Object.keys(l))
    assert.throws(
      () => run({ ...l, [key]: l[key] - 1 }),
      (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
      key,
    );
  assert.deepEqual({ packet: ref.packet, raw: ref.raw }, before);
  assert.equal(rb.toString(), ref.raw.requestText);
  assert.equal(ob.toString(), ref.raw.outputText);
  assert.equal(actual.scope.requiredUnits[0].previousUnitId, 'legacy:opaque:py:A');
  assert.equal(actual.raw.metadata.inventory.length, 5);
  assert.equal(actual.raw.codeSyntax.request.payload.sourceFiles.length, 1);
});
import provider from '../../providers/dist/declared-delta-raw-support-candidate.js';
import { modelDeltaRawProvider } from '../../../fixtures/phase1/mixed-analysis-stage/independent-delta-raw-resource-model.mjs';
test('independent complete partial DELTA raw Provider exact and cumulative one-below', () => {
  for (const s of [ref.source, ...ref.models]) assert.equal(sha(s.path), s.sha256, s.path);
  assert.deepEqual(modelDeltaRawProvider(ref.packet, ref.raw), ref.provider);
  const e = ref.provider,
    cost = e.cost,
    l = { maxSerializedBytes: cost.serializedBytes, maxItems: cost.items, maxDepth: cost.maxDepth },
    rb = Buffer.from(ref.raw.requestText),
    ob = Buffer.from(ref.raw.outputText),
    run = (l, prior = { serializedBytes: 0, items: 0 }) => {
      const context = { limits: l, budget: { ...prior } },
        result = provider(ref.packet, ref.raw.metadata, rb, ob, context);
      return { result, budget: context.budget };
    };
  assert.deepEqual(run(l), {
    result: e.result,
    budget: { serializedBytes: cost.serializedBytes, items: cost.items },
  });
  for (const key of Object.keys(l))
    assert.throws(
      () => run({ ...l, [key]: l[key] - 1 }),
      (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
      key,
    );
  const prior = {
      serializedBytes: ref.expected.cost.serializedBytes,
      items: ref.expected.cost.items,
    },
    continued = {
      ...l,
      maxSerializedBytes: l.maxSerializedBytes + prior.serializedBytes,
      maxItems: l.maxItems + prior.items,
    };
  assert.deepEqual(run(continued, prior), {
    result: e.result,
    budget: { serializedBytes: continued.maxSerializedBytes, items: continued.maxItems },
  });
  for (const key of ['maxSerializedBytes', 'maxItems'])
    assert.throws(
      () => run({ ...continued, [key]: continued[key] - 1 }, prior),
      (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
      key + ' cumulative',
    );
  const x = JSON.parse(fs.readFileSync(ref.source.path));
  assert.deepEqual(e.result.candidate.transition, x.expected.manifest.transitions);
  assert.deepEqual(
    e.result.candidate.activeSupports.map(({ snapshotId, ...v }) => v),
    x.expected.manifest.state.supports,
  );
  assert.ok(
    e.result.candidate.activeSupports.some((v) => v.binding.providerFact.providerId === 'external'),
  );
  assert.ok(e.result.candidate.dependencyUnits.some((v) => v.id === 'legacy:opaque:py:A'));
});
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
import { modelDeltaComposition } from '../../../fixtures/phase1/mixed-analysis-stage/independent-delta-runtime-resource-model.mjs';
test('independent complete partial DELTA Runtime composition five-budget contract', () => {
  for (const s of [ref.source, ...ref.models]) assert.equal(sha(s.path), s.sha256, s.path);
  const e = ref.composition;
  assert.deepEqual(modelDeltaComposition(e.input, ref.raw), e);
  const input = {
      ...e.input,
      rawBundle: {
        metadata: ref.raw.metadata,
        requestBytes: Buffer.from(ref.raw.requestText),
        outputBytes: Buffer.from(ref.raw.outputText),
      },
    },
    before = structuredClone(e.input),
    l = {
      maxRows: 1,
      maxSerializedBytes: e.cost.serializedBytes,
      maxItems: e.cost.items,
      maxDepth: e.cost.maxDepth,
      memoryBudgetBytes: e.cost.memoryBudgetBytes,
    },
    run = (l) => createMixedAnalysisRules().compose(input, l);
  assert.deepEqual(run(l), e.result);
  for (const key of ['maxSerializedBytes', 'maxItems', 'maxDepth', 'memoryBudgetBytes'])
    assert.throws(
      () => run({ ...l, [key]: l[key] - 1 }),
      (e) => ['HISTORY_LIMIT_EXCEEDED', 'RESOURCE_LIMIT_EXCEEDED'].includes(e.code),
      key,
    );
  assert.equal(e.cost.rows, 0);
  for (const field of ['serializedBytes', 'items', 'retainedLogicalBytes'])
    assert.equal(
      e.ledger.reduce((n, v) => n + v[field], 0),
      e.cost[field],
    );
  assert.deepEqual(e.input, before);
  const { usage, ...value } = e.result;
  assert.deepEqual(value, JSON.parse(fs.readFileSync(ref.source.path)).expected);
});
import { modelDeltaValidation } from '../../../fixtures/phase1/mixed-analysis-stage/independent-delta-validation-resource-model.mjs';
test('independent complete partial DELTA Runtime early validation resource', () => {
  const e = ref.validation;
  for (const s of [ref.source, ...ref.models]) assert.equal(sha(s.path), s.sha256, s.path);
  assert.deepEqual(
    modelDeltaValidation(e.input.target, e.input.capture, e.input.owner.stageDigest, ref.raw),
    e,
  );
  const input = {
      ...e.input,
      rawBundle: {
        metadata: ref.raw.metadata,
        requestBytes: Buffer.from(ref.raw.requestText),
        outputBytes: Buffer.from(ref.raw.outputText),
      },
    },
    l = {
      maxRows: 1,
      maxSerializedBytes: e.cost.serializedBytes,
      maxItems: e.cost.items,
      maxDepth: e.cost.maxDepth,
      memoryBudgetBytes: e.cost.memoryBudgetBytes,
    },
    run = (l) => createMixedAnalysisRules().validateObservation(input, l);
  assert.deepEqual(run(l), e.result);
  for (const key of ['maxSerializedBytes', 'maxItems', 'maxDepth', 'memoryBudgetBytes'])
    assert.throws(
      () => run({ ...l, [key]: l[key] - 1 }),
      (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
      key,
    );
  assert.equal(e.cost.rows, 0);
  for (const field of ['serializedBytes', 'items', 'retainedLogicalBytes'])
    assert.equal(
      e.ledger.reduce((n, v) => n + v[field], 0),
      e.cost[field],
    );
});

import { modelDeclaredHistoryScope } from '../../../fixtures/phase1/mixed-analysis-stage/independent-delta-history-resource-model.mjs';
import { measures } from '../../../fixtures/phase1/mixed-analysis-stage/independent-code-resource-model.mjs';

test('independent review IR2 admits complete Unicode inventories in their own orders for partial DELTA', () => {
  const packet = structuredClone(ref.packet),
    metadata = structuredClone(ref.raw.metadata),
    template = packet.target.inventory.find((f) => f.classification.role === 'OTHER'),
    compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    nativeOrder = (a, b) =>
      Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)) ||
      Buffer.compare(Buffer.from(a.id), Buffer.from(b.id));
  assert.ok(template);
  for (const [id, path] of [
    ['unicode:bmp', '\uE000.md'],
    ['unicode:astral', '\u{10000}.md'],
  ])
    packet.target.inventory.push({ ...structuredClone(template), id, path });
  packet.target.inventory.sort((a, b) => compare(a.path, b.path) || compare(a.id, b.id));
  metadata.inventory = structuredClone(packet.target.inventory).sort(nativeOrder);
  assert.notDeepEqual(metadata.inventory, packet.target.inventory);
  const run = (m = metadata, p = packet) =>
    provider(p, m, Buffer.from(ref.raw.requestText), Buffer.from(ref.raw.outputText), {
      limits: {
        maxSerializedBytes: Number.MAX_SAFE_INTEGER,
        maxItems: Number.MAX_SAFE_INTEGER,
        maxDepth: Number.MAX_SAFE_INTEGER,
      },
      budget: { serializedBytes: 0, items: 0 },
    });
  assert.deepEqual(run().raw.metadata.inventory, metadata.inventory);
  const wrongOrder = structuredClone(metadata);
  wrongOrder.inventory.reverse();
  assert.throws(
    () => run(wrongOrder),
    (e) => e.code === 'INVALID_CONTEXT',
  );
  const changed = structuredClone(metadata);
  changed.inventory[0].contentFingerprint += ':wrong';
  assert.throws(
    () => run(changed),
    (e) => e.code === 'INVALID_CONTEXT',
  );
  const wrongHistoryOrder = structuredClone(packet);
  wrongHistoryOrder.target.inventory.reverse();
  assert.throws(
    () => run(metadata, wrongHistoryOrder),
    (e) => e.code === 'INVALID_HISTORY',
  );
});

for (const kind of ['scope-schema', 'metadata-context'])
  test('independent review IR3 preserves failed DELTA prefix in continuing budget ' + kind, () => {
    const packet = structuredClone(ref.packet),
      metadata = structuredClone(ref.raw.metadata),
      scope = modelDeclaredHistoryScope(packet),
      prior = { serializedBytes: scope.cost.serializedBytes, items: scope.cost.items },
      context = {
        limits: {
          maxSerializedBytes: Number.MAX_SAFE_INTEGER,
          maxItems: Number.MAX_SAFE_INTEGER,
          maxDepth: Number.MAX_SAFE_INTEGER,
        },
        budget: { ...prior },
      };
    let expected;
    if (kind === 'scope-schema') {
      packet.unexpected = true;
      expected = {
        serializedBytes: Buffer.byteLength(JSON.stringify(packet)),
        items: Number(measures(packet).nodes),
      };
    } else {
      metadata.targetSource.contentFingerprint += ':wrong';
      expected = {
        serializedBytes:
          scope.cost.serializedBytes + 3 * Buffer.byteLength(JSON.stringify(metadata)),
        items: scope.cost.items + 3 * Number(measures(metadata).nodes),
      };
    }
    assert.throws(
      () =>
        provider(
          packet,
          metadata,
          Buffer.from(ref.raw.requestText),
          Buffer.from(ref.raw.outputText),
          context,
        ),
      (e) => e.code === (kind === 'scope-schema' ? 'INVALID_HISTORY' : 'INVALID_CONTEXT'),
    );
    assert.deepEqual(context.budget, {
      serializedBytes: prior.serializedBytes + expected.serializedBytes,
      items: prior.items + expected.items,
    });
  });

test('independent review IR3 preserves complete terminal-checksum failure prefix', () => {
  const events = ref.raw.outputText.trimEnd().split('\n').map(JSON.parse),
    last = events.at(-1);
  assert.equal(last.type, 'OBSERVATION_COMPLETED');
  last.payload.checksum =
    (last.payload.checksum[0] === '0' ? '1' : '0') + last.payload.checksum.slice(1);
  const output = events.map((v) => JSON.stringify(v)).join('\n') + '\n';
  assert.equal(Buffer.byteLength(output), Buffer.byteLength(ref.raw.outputText));
  const ledger = ref.expected.ledger.slice(
      0,
      ref.expected.ledger.findIndex((v) => v.label === 'decoder all events'),
    ),
    prefix = {
      serializedBytes: ledger.reduce((n, v) => n + v.serializedBytes, 0),
      items: ledger.reduce((n, v) => n + v.items, 0),
    },
    prior = modelDeclaredHistoryScope(ref.packet).cost,
    context = {
      limits: {
        maxSerializedBytes: Number.MAX_SAFE_INTEGER,
        maxItems: Number.MAX_SAFE_INTEGER,
        maxDepth: Number.MAX_SAFE_INTEGER,
      },
      budget: { serializedBytes: prior.serializedBytes, items: prior.items },
    };
  assert.ok(ledger.length > 0);
  assert.throws(
    () =>
      provider(
        ref.packet,
        ref.raw.metadata,
        Buffer.from(ref.raw.requestText),
        Buffer.from(output),
        context,
      ),
    (e) => e.code === 'PROTOCOL_CORRUPTION',
  );
  assert.deepEqual(context.budget, {
    serializedBytes: prior.serializedBytes + prefix.serializedBytes,
    items: prior.items + prefix.items,
  });
});

import { mixedAnalysisFailureUsage } from '../dist/analysis/mixed-analysis-state.js';
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';
import { historyFixture, seedLiteral, historyLimits } from './helpers/r011-history-fixture.mjs';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { captureActivationContext } from '../dist/analysis/activation-history.js';

test('independent review IR3 Runtime imports full failed DELTA prefix and Stage remains permanently invalid', async (t) => {
  const f = await historyFixture(t, 'available', { seed: false });
  seedLiteral(f.db, ref.input);
  const before = allRows(f.db),
    cap = captureActivationContext(f.db, ref.input.repositoryId, historyLimits),
    scope = modelDeclaredHistoryScope(ref.packet),
    prefix = ref.composition.ledger.slice(
      0,
      ref.composition.ledger.findIndex((v) => v.label === 'complete raw DELTA Provider'),
    ),
    rawCost = {
      serializedBytes:
        scope.cost.serializedBytes + 3 * Buffer.byteLength(JSON.stringify(ref.raw.metadata)),
      items: scope.cost.items + 3 * Number(measures(ref.raw.metadata).nodes),
    },
    expected = {
      rows: 0,
      serializedBytes: prefix.reduce((n, v) => n + v.serializedBytes, 0) + rawCost.serializedBytes,
      items: prefix.reduce((n, v) => n + v.items, 0) + rawCost.items,
      retainedLogicalBytes:
        prefix.reduce((n, v) => n + v.retainedLogicalBytes, 0) + rawCost.serializedBytes,
    },
    original = HistoryReadBudget.prototype.add,
    real = createMixedAnalysisRules();
  let budget, atCall, failure, stage;
  const values = (b) => ({
    rows: b.rows,
    serializedBytes: b.serializedBytes,
    items: b.items,
    retainedLogicalBytes: b.retainedLogicalBytes,
  });
  HistoryReadBudget.prototype.add = function (...args) {
    if ((new Error().stack.split('\n')[2] ?? '').includes('at new MixedAnalysisStage'))
      budget = this;
    return original.apply(this, args);
  };
  try {
    stage = new MixedAnalysisStage(
      f.db,
      cap.handle,
      'DELTA',
      historyLimits,
      Object.freeze({
        ...real,
        compose(input, limits) {
          atCall = values(budget);
          const changed = {
              ...input,
              rawBundle: {
                ...input.rawBundle,
                metadata: structuredClone(input.rawBundle.metadata),
              },
            },
            source = changed.rawBundle.metadata.targetSource;
          source.contentFingerprint =
            (source.contentFingerprint[0] === 'x' ? 'y' : 'x') + source.contentFingerprint.slice(1);
          try {
            return real.compose(changed, limits);
          } catch (e) {
            failure = mixedAnalysisFailureUsage(e);
            throw e;
          }
        },
      }),
    );
    const owner = stage.prepareOwner(null, ref.preparation);
    stage.acceptObservation(owner.ownerHandle, {
      metadata: ref.raw.metadata,
      requestBytes: Buffer.from(ref.raw.requestText),
      outputBytes: Buffer.from(ref.raw.outputText),
    });
    assert.throws(
      () => stage.freeze(),
      (e) => e.code === 'INVALID_CANDIDATE',
    );
    assert.deepEqual(failure, expected);
    assert.deepEqual(
      values(budget),
      Object.fromEntries(Object.keys(expected).map((k) => [k, atCall[k] + expected[k]])),
    );
    assert.throws(
      () => stage.freeze(),
      (e) => e.code === 'STAGE_RELEASED',
    );
    stage.close();
  } finally {
    HistoryReadBudget.prototype.add = original;
  }
  assert.deepEqual(allRows(f.db), before);
  assert.deepEqual(allRows(f.reopen(true)), before);
});
