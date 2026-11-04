import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePluginV4Context } from '../dist/plugin-context-v4.js';
import { parseRuntimeFactSet } from '../../ir/dist/index.js';
const root = new URL('../../../fixtures/phase1/ir-contract/declared-execution/', import.meta.url);
const input = JSON.parse(readFileSync(new URL('inputs.json', root))),
  expected = JSON.parse(readFileSync(new URL('expected.json', root)));
const api = () => import('../dist/framework-entry-candidate.js');
test('declared execution fixture Context preflight', () => {
  for (const x of input.cases) validatePluginV4Context(x.context);
});
for (const item of input.cases)
  test('entry ' + item.name, async () => {
    const out = (await api()).compileFrameworkEntryCandidate(
      item.context,
      item.framework,
      item.maxItems,
    );
    parseRuntimeFactSet(out.facts);
    const entries = out.facts.payload.entryPoints,
      want = expected.cases[item.name].entries;
    assert.equal(entries.length, want.length);
    for (const w of want) {
      const e = entries.find((e) => e.id === w.id);
      assert(e);
      assert.equal(e.factKey, w.factKey);
      assert.equal(e.triggerKind, w.triggerKind);
      assert.equal(e.contextKind, w.contextKind);
      assert.deepEqual(e.ownerRef, {
        scope: 'REPOSITORY',
        repositoryId: 'repo:one',
        entity: { kind: 'CODE_NODE', id: 'code:function', revisionId: 'revision:one' },
      });
      assert.equal((e.contractRef ?? e.taskRef).entity.id, w.domainId);
      assert.deepEqual(e.confidence, {
        score: 0.5,
        method: expected.policy.method,
        reasons: ['CURRENT_INPUT_BASIS', 'DECLARATION_EXECUTION_DERIVED', 'ENTRY_BINDING'],
      });
      assert.equal(e.resolution, 'HEURISTIC');
      assert(e.supportRefs.length > 0);
      const domain = [...out.facts.payload.contracts, ...out.facts.payload.tasks].find(
        (r) => r.id === w.domainId,
      );
      assert.deepEqual(e.supportRefs, domain.supportRefs);
      assert.deepEqual(e.sourceRange, domain.sourceRange);
      assert.equal(
        out.provenance.find((p) => p.entityId === e.id).policyVersion,
        expected.policy.method,
      );
    }
    assert.equal(out.coverage.status, 'PARTIAL');
    assert(out.coverage.limitations.includes('DECLARATION_ENTRIES_ONLY'));
    assert(!out.coverage.limitations.includes('DOMAIN_RECORDS_ONLY'));
    assert(Object.isFrozen(out.facts.payload));
  });
test('entry budget exactly sufficient and one below fails; invalid maxItems fails', async () => {
  const item = input.cases[0],
    run = (await api()).compileFrameworkEntryCandidate,
    out = run(item.context, item.framework, 10000),
    p = out.facts.payload;
  const rs = [...p.entryPoints, ...p.contracts, ...p.tasks, ...p.dataResources];
  const n =
    rs.reduce((n, r) => n + 1 + r.supportRefs.length, 0) +
    p.externalRefs.length +
    p.supportInventory.length +
    out.coverage.limitations.length +
    out.coverage.unverifiedRefs.length +
    out.provenance.reduce(
      (n, p) => n + p.draftKeys.length + p.ruleIds.length + p.syntaxIds.length,
      0,
    );
  assert.deepEqual(run(item.context, item.framework, n), out);
  for (const max of [n - 1, 0, -1, NaN, 10001])
    assert.throws(() => run(item.context, item.framework, max), { code: 'IR_VALIDATION_FAILED' });
});
test('entry removes contributions and refuses inappropriate support policy', async () => {
  const run = (await api()).compileFrameworkEntryCandidate,
    item = input.cases[0];
  const c = structuredClone(item.context);
  c.syntaxEvidence[0].confidence.method = 'other';
  assert.equal(run(c, item.framework, 10000).facts.payload.entryPoints.length, 0);
  const x = {
    ...item.context,
    syntaxEvidence: item.context.syntaxEvidence.filter((s) => s.id !== 'syntax:site'),
  };
  assert.equal(run(x, item.framework, 10000).facts.payload.entryPoints.length, 0);
});
