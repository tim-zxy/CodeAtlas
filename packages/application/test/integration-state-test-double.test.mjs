import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompilationInputSnapshot } from '../dist/compilation-input-contract.js';
import { runCapturedIntegrationStateTestDouble } from '../dist/integration-state-test-double.js';
import { reconcileKnowledge } from '../../knowledge/dist/index.js';
import {
  fixture,
  account,
  control,
  options,
  wr,
  rr,
  hash,
  canonical,
} from './helpers/captured-integration-fixture.mjs';
const claimOptions = () => ({
  promptRef: 'offline:claim',
  modelPolicyRef: 'offline:model',
  invocationBudget: { maxInputBytes: 200000, maxOutputBytes: 20000 },
});
function setup(change = () => {}) {
  const f = fixture(),
    snapshot = createCompilationInputSnapshot(f.raw, control()),
    a = account();
  let calls = 0;
  const events = [];
  a.reserveCall = () => {
    calls++;
  };
  a.chargeUsage = (usage) => {
    events.push(usage);
  };
  const identity = { providerId: 'fixture', modelId: 'local-double', adapterVersion: 'fixture-v1' };
  const port = {
    evidenceKind: 'TEST_DOUBLE',
    identity,
    capabilities: { outputMode: 'NATIVE_JSON_SCHEMA' },
    async generate(request) {
      const claim = {
        schema: 'codeatlas.claim',
        version: 1,
        payload: {
          id: 'generated-claim',
          subject: wr('SERVICE', 's1'),
          predicate: 'state',
          value: { kind: 'LITERAL', value: true },
          scope: snapshot.scope,
          stateIntent: 'CURRENT',
          claimKind: 'DECLARED',
          evidenceRefs: [f.support],
          confidence: { score: 1, method: 'fixture', reasons: ['literal'] },
          authority: 'DECLARED',
        },
      };
      const out = {
        structuredOutput: claim,
        identity,
        usage: { inputTokens: 2, outputTokens: 1 },
        finishReason: 'STOP',
        warnings: [],
        outputDigest: hash(canonical(claim)),
      };
      change(out, request);
      return out;
    },
  };
  return {
    f,
    snapshot,
    a,
    port,
    events,
    get calls() {
      return calls;
    },
    run: (c = control(), s = snapshot) =>
      runCapturedIntegrationStateTestDouble(s, options(), claimOptions(), port, c, a),
  };
}
const reconcile = (subject) =>
  reconcileKnowledge({
    subjects: [subject],
    existingItems: [],
    policyRef: 'knowledge-exact-reference-v1',
    intents: [],
    disappearedItemIds: [],
    control: control(),
  });
test('actual same-invocation local Claim binds candidate and existing reconciliation without publication', async () => {
  const f = setup(),
    r = await f.run();
  assert.equal(f.calls, 1);
  assert.equal(f.events.length, 1);
  assert.equal(r.binding.capturedInputDigest, f.snapshot.inputDigest);
  assert.match(r.binding.requestInputDigest, /^[a-f0-9]{64}$/);
  assert.equal(
    r.binding.claimOutputDigest,
    hash(canonical(r.reconciliationSubject.stateBinding.claims[0])),
  );
  assert.equal(r.evidenceKind, 'TEST_DOUBLE');
  assert.equal(r.confidence, 'NOT_VERIFIED');
  assert.equal(r.contextAuthorization, 'NOT_ESTABLISHED');
  assert.equal(r.publicationEffect, 'NOT_ATTEMPTED');
  assert.ok(Object.isFrozen(r.reconciliationSubject.stateBinding));
  const p = reconcile(r.reconciliationSubject);
  assert.equal(p.actions[0].operation, 'NEW');
  assert.equal(p.actions[0].retainedItemId, null);
  assert.equal(p.actions[0].revisionIntent, 'NEW_ITEM');
});
test('same snapshot id with different actual content produces distinct binding digests', async () => {
  const f = setup(),
    s = structuredClone(f.snapshot);
  delete s.inputDigest;
  s.workspaceCapture.entities.find(
    (e) => e.valueSchemaRef === 'Service@1',
  ).value.logicalServiceKey = 'other';
  const other = createCompilationInputSnapshot(s, control());
  const first = await f.run();
  const second = await setup().run(control(), other);
  assert.equal(
    first.candidate.payload.inputSnapshotRef.id,
    second.candidate.payload.inputSnapshotRef.id,
  );
  assert.notEqual(first.binding.capturedInputDigest, second.binding.capturedInputDigest);
  assert.notEqual(first.binding.requestInputDigest, second.binding.requestInputDigest);
});
test('malformed hash/scope/support output refuses and usage settles once', async () => {
  for (const mutate of [
    (o) => (o.outputDigest = '0'.repeat(64)),
    (o) => {
      o.structuredOutput.payload.scope = { kind: 'WORKSPACE', workspaceId: 'foreign' };
      o.outputDigest = hash(canonical(o.structuredOutput));
    },
    (o) => {
      o.structuredOutput.payload.evidenceRefs[0].valueDigest = 'f'.repeat(64);
      o.outputDigest = hash(canonical(o.structuredOutput));
    },
  ]) {
    const f = setup(mutate);
    await assert.rejects(f.run());
    assert.equal(f.calls, 1);
    assert.equal(f.events.length, 1);
  }
});
test('unrelated and conflicting actual generated state remains review-only', async () => {
  const f = setup((o) => {
    o.structuredOutput.payload.subject = rr('SOURCE_FILE', 'f');
    o.outputDigest = hash(canonical(o.structuredOutput));
  });
  const unrelated = await f.run();
  assert.deepEqual(reconcile(unrelated.reconciliationSubject).actions[0].reasons, [
    'STATE_SUBJECT_UNRELATED',
  ]);
  const one = await setup().run();
  const two = await setup((o) => {
    o.structuredOutput.payload.id = 'second';
    o.structuredOutput.payload.stateIntent = 'TARGET';
    o.outputDigest = hash(canonical(o.structuredOutput));
  }).run();
  const subject = structuredClone(one.reconciliationSubject);
  subject.stateBinding.claims.push(two.reconciliationSubject.stateBinding.claims[0]);
  assert.deepEqual(reconcile(subject).actions[0].reasons, ['STATE_EVIDENCE_CONFLICT']);
});
test('cancellation/budget/unknown invalidation never issue a bound subject or double invalidate', async () => {
  const c = new AbortController();
  c.abort();
  await assert.rejects(setup().run(control({ signal: c.signal })));
  await assert.rejects(setup().run(control({ maxItems: 1 })));
  const f = setup();
  let invalidations = 0;
  f.a.invalidate = () => {
    invalidations++;
    throw Error('unsettled');
  };
  f.port.generate = async () => {
    throw Object.assign(Error('unknown'), { cleanupState: 'UNKNOWN' });
  };
  await assert.rejects(f.run(), { cleanupState: 'UNKNOWN' });
  assert.equal(invalidations, 1);
});

test('raw control getters and proxies are refused without executing traps', async () => {
  for (const proxy of [false, true]) {
    let calls = 0;
    const c = control();
    Object.defineProperty(c, 'maxItems', {
      enumerable: true,
      get() {
        calls++;
        return 1000000;
      },
    });
    const raw = proxy
      ? new Proxy(c, {
          get() {
            calls++;
            throw Error('trap');
          },
        })
      : c;
    await assert.rejects(setup().run(raw));
    assert.equal(calls, 0);
  }
});
test('actual repository metadata Claim remains a state-review alternative', async () => {
  const f = setup((o) => {
    o.structuredOutput.payload.subject = rr('REPOSITORY', 'r');
    o.outputDigest = hash(canonical(o.structuredOutput));
  });
  const result = await f.run();
  assert.deepEqual(reconcile(result.reconciliationSubject).actions[0].reasons, [
    'STATE_SUBJECT_UNRELATED',
  ]);
});

test('signal proxy is refused before instanceof can invoke its prototype trap', async () => {
  let calls = 0;
  const signal = new Proxy(new AbortController().signal, {
    getPrototypeOf() {
      calls++;
      throw Error('trap');
    },
  });
  await assert.rejects(setup().run(control({ signal })));
  assert.equal(calls, 0);
});
