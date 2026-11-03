import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRuntimeFactSet, parseFrameworkBindingSet } from '../../ir/dist/index.js';
const names = {
  spring: 'createSpringPluginV4',
  mongo: 'createMongoPluginV4',
  kafka: 'createKafkaPluginV4',
  fastapi: 'createFastApiPluginV4',
};
for (const [framework, name] of Object.entries(names)) {
  const v = JSON.parse(
    readFileSync(
      new URL('../../../fixtures/phase1/' + framework + '/inputs.json', import.meta.url),
    ),
  );
  const e = JSON.parse(
    readFileSync(
      new URL('../../../fixtures/phase1/' + framework + '/expected.json', import.meta.url),
    ),
  );
  for (const item of v.cases)
    test('V4 ' + item.name, async () => {
      const api = await import('../dist/' + framework + '.js'),
        plugin = api[name]();
      const d = plugin.describe();
      assert.equal(d.contextVersion, 4);
      assert.equal(d.syntaxSchemaVersion, 3);
      const detection = await plugin.detect(item.context);
      assert.equal(detection.matched, true);
      const output = [];
      for await (const c of plugin.extract({ ...item.context, detection, maxItems: 10000 }))
        output.push(c);
      assert.equal(output.length, 2);
      const runtime = output.find((c) => c.capability === 'RUNTIME_FACT_SET'),
        binding = output.find((c) => c.capability === 'FRAMEWORK_BINDING_SET');
      const facts = parseRuntimeFactSet(runtime.value).payload,
        b = parseFrameworkBindingSet(binding.value, runtime.value).payload;
      const expected = e.cases.find((x) => x.name === item.name);
      assert.deepEqual(
        [...facts.contracts, ...facts.tasks, ...facts.dataResources].map((r) => r.id).sort(),
        expected.domainIds,
      );
      assert.equal(facts.entryPoints.length, expected.entries);
      assert.deepEqual(
        b.bindings
          .map((r) => ({
            kind: r.kind,
            targetId: (r.contractRef ?? r.resourceRef ?? r.taskRef ?? r.dependencyRef).entity.id,
            factKey: r.factKey,
            id: r.id,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        expected.bindings.toSorted((a, b) => a.id.localeCompare(b.id)),
      );
      for (const r of b.bindings) {
        assert.equal(r.ownerRef.entity.id, 'code:function');
        assert(r.sourceRange);
        assert(r.supportRefs.length);
        assert.equal(r.confidence.method, e.policy);
        assert.equal(r.confidence.score, 0.5);
      }
      assert.equal(runtime.coverage.status, 'PARTIAL');
      assert(Object.isFrozen(binding.value.payload));
      assert(Object.isFrozen(runtime));
      const reordered = structuredClone(item.context);
      reordered.syntaxEvidence.reverse();
      const reverse = [];
      for await (const r of plugin.extract({ ...reordered, detection, maxItems: 10000 }))
        reverse.push(r);
      assert.deepEqual(reverse, output);
    });
}
test('factory rejects stale evidence and bounded output rather than silently dropping facts', async () => {
  const { createKafkaPluginV4 } = await import('../dist/kafka.js'),
    p = createKafkaPluginV4();
  const v = JSON.parse(
    readFileSync(new URL('../../../fixtures/phase1/kafka/inputs.json', import.meta.url)),
  ).cases.find((x) => x.name === 'kafka-send');
  const detection = await p.detect(v.context);
  const collect = async (c) => {
    const out = [];
    for await (const r of p.extract(c)) out.push(r);
    return out;
  };
  await assert.rejects(() => collect({ ...v.context, detection, maxItems: 1 }));
  const c = structuredClone(v.context);
  c.syntaxEvidence.find((s) => s.id === 'syntax:site').confidence.method = 'other';
  const out = await collect({ ...c, detection, maxItems: 10000 });
  assert.equal(out[1].value.payload.bindings.length, 0);
  assert(out[1].coverage.limitations.includes('DECLARATION_SUPPORT_POLICY_INAPPLICABLE'));
  const removed = {
    ...v.context,
    syntaxEvidence: v.context.syntaxEvidence.filter((s) => s.id !== 'syntax:site'),
  };
  assert.equal(
    (await collect({ ...removed, detection, maxItems: 10000 }))[1].value.payload.bindings.length,
    0,
  );
});

test('V4 Feign requires current imported client proof and leaves old private APIs unchanged', async () => {
  const { compileFrameworkEntryCandidate } = await import('../dist/framework-entry-candidate.js');
  const p = (await import('../dist/spring.js')).createSpringPluginV4();
  const c = JSON.parse(
    readFileSync(new URL('../../../fixtures/phase1/spring/inputs.json', import.meta.url)),
  ).cases.find((x) => x.name === 'spring-feign').context;
  assert.equal(
    compileFrameworkEntryCandidate(c, 'spring', 10000).facts.payload.contracts.length,
    0,
  );
  for (const mutate of [
    (x) =>
      (x.syntaxEvidence.find((s) => s.id === 'syntax:feign-import').payload.qualifiedName =
        'fake.FeignClient'),
    (x) =>
      (x.syntaxEvidence.find((s) => s.id === 'syntax:feign-type').payload.arguments[0].value = {
        kind: 'UNKNOWN',
        reason: 'DYNAMIC',
      }),
  ]) {
    const x = structuredClone(c);
    mutate(x);
    const d = await p.detect(x),
      out = [];
    for await (const value of p.extract({ ...x, detection: d, maxItems: 10000 })) out.push(value);
    assert.equal(out[0].value.payload.contracts.length, 0);
    assert.equal(out[1].value.payload.bindings.length, 0);
  }
});

test('mixed Mongo sites retain unassembled diagnostic when one site has no accepted support policy', async () => {
  const p = (await import('../dist/mongo.js')).createMongoPluginV4();
  const c = JSON.parse(
    readFileSync(new URL('../../../fixtures/phase1/mongo/inputs.json', import.meta.url)),
  ).cases.find((x) => x.name === 'mongo-read').context;
  const extra = structuredClone(c.syntaxEvidence.find((s) => s.id === 'syntax:site'));
  extra.id = 'syntax:other-site';
  extra.syntaxKey = 'syntax:other-site-key';
  extra.sourceRange.startLine = extra.sourceRange.endLine = 70;
  for (const a of extra.payload.arguments) a.sourceRange = structuredClone(extra.sourceRange);
  extra.confidence.method = 'unapproved';
  c.syntaxEvidence.push(extra);
  const detection = await p.detect(c),
    out = [];
  for await (const v of p.extract({ ...c, detection, maxItems: 10000 })) out.push(v);
  assert.equal(out[1].value.payload.bindings.length, 1);
  assert(out[1].coverage.limitations.includes('DATA_OPERATION_REQUIRES_CONTEXT'));
});
