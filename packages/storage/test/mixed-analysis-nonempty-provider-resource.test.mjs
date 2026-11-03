import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { composeDeclaredFullRawSupportCandidate } from '../../providers/dist/declared-delta-raw-support-candidate.js';
import { readComponentReference as read } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
import { modelNonemptyFullProvider } from '../../../fixtures/phase1/mixed-analysis-stage/independent-nonempty-provider-resource-model.mjs';
const ref = JSON.parse(
    fs.readFileSync(
      'fixtures/phase1/mixed-analysis-stage/nonempty-provider-resource-reference.json',
    ),
  ),
  sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
for (const c of ref.cases)
  test('independent nonempty full Provider complete exact and one-below ' + c.id, () => {
    assert.equal(sha(fs.readFileSync(ref.manifestPath)), ref.manifestSha256);
    for (const s of [
      ...ref.models,
      ...c.sources.map((s) => ({ path: s.assetPath, sha256: s.assetSha256 })),
    ])
      assert.equal(sha(fs.readFileSync(s.path)), s.sha256);
    for (const s of c.sources) assert.equal(sha(read(s.path)), s.sha256);
    const old = JSON.parse(read(c.sources[0].path));
    assert.deepEqual(c.raw.metadata, old.metadata);
    assert.deepEqual(c.target, {
      source: old.metadata.targetSource,
      repositoryLocatorDigest: old.expected.body.repositoryLocatorDigest,
      inventory: old.metadata.inventory,
      contracts: old.preparation.contracts,
    });
    assert.equal(c.raw.requestText, read(c.sources[1].path).toString());
    assert.equal(c.raw.outputText, read(c.sources[2].path).toString());
    assert.deepEqual(modelNonemptyFullProvider(c.target, c.raw), c.expected);
    const before = structuredClone({ target: c.target, raw: c.raw }),
      rb = Buffer.from(c.raw.requestText),
      ob = Buffer.from(c.raw.outputText),
      limits = {
        maxSerializedBytes: c.expected.cost.serializedBytes,
        maxItems: c.expected.cost.items,
        maxDepth: c.expected.cost.maxDepth,
      },
      run = (l, prior = { serializedBytes: 0, items: 0 }) => {
        const context = { limits: l, budget: { ...prior } },
          result = composeDeclaredFullRawSupportCandidate(
            c.target,
            c.raw.metadata,
            rb,
            ob,
            context,
          );
        return { result, budget: context.budget };
      };
    const exact = run(limits);
    assert.deepEqual(exact.result, c.expected.result);
    assert.deepEqual(exact.budget, {
      serializedBytes: limits.maxSerializedBytes,
      items: limits.maxItems,
    });
    for (const key of Object.keys(limits))
      assert.throws(
        () => run({ ...limits, [key]: limits[key] - 1 }),
        (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
        key,
      );
    const prior = { serializedBytes: rb.length + ob.length, items: c.sources.length },
      cumulative = {
        ...limits,
        maxSerializedBytes: limits.maxSerializedBytes + prior.serializedBytes,
        maxItems: limits.maxItems + prior.items,
      };
    assert.deepEqual(run(cumulative, prior), {
      result: c.expected.result,
      budget: { serializedBytes: cumulative.maxSerializedBytes, items: cumulative.maxItems },
    });
    for (const key of ['maxSerializedBytes', 'maxItems'])
      assert.throws(
        () => run({ ...cumulative, [key]: cumulative[key] - 1 }, prior),
        (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
        key + ' continued',
      );
    assert.deepEqual({ target: c.target, raw: c.raw }, before);
    assert.equal(rb.toString(), c.raw.requestText);
    assert.equal(ob.toString(), c.raw.outputText);
    for (const key of ['serializedBytes', 'items'])
      assert.equal(
        c.expected.ledger.reduce((n, s) => n + s[key], 0),
        c.expected.cost[key],
      );
    assert.ok(c.expected.result.activeSupports.length > 0);
    assert.deepEqual(
      c.expected.result.observation.units.map((u) => u.id).sort(),
      old.expected.body.scope.unitIds,
    );
  });
