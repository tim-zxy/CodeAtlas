import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseRuntimeFactSet } from '@codeatlas/ir';
import { validatePluginV4Context } from '../dist/plugin-context-v4.js';
import { contextFor, canonical, range } from './helpers/framework-binding-fixture.mjs';
const root = new URL('../../../fixtures/phase1/plugin-context/runtime-candidate/', import.meta.url);
const input = JSON.parse(readFileSync(new URL('inputs.json', root)));
const expected = JSON.parse(readFileSync(new URL('expected.json', root)));
const api = () => import('../dist/framework-runtime-candidate.js');
const hash = (text) => createHash('sha256').update(text).digest('hex');
const setup = (name) => {
  const item = input.cases.find((x) => x.name === name);
  const c = contextFor(item);
  for (const s of c.syntaxEvidence)
    s.confidence = {
      score: 0.5,
      method: 'syntax-surface-support-v1',
      reasons: ['DECLARED_SYNTAX'],
    };
  return c;
};
const records = (out) =>
  [
    ...out.facts.payload.contracts,
    ...out.facts.payload.tasks,
    ...out.facts.payload.dataResources,
  ].sort((a, b) => (a.id < b.id ? -1 : 1));
const supportKey = (s) => canonical(s.entity);
function supportFor(c, ids) {
  const values = new Map();
  for (const id of ids) {
    const s = c.syntaxEvidence.find((x) => x.id === 'syntax:' + id);
    for (const r of s.supportRefs) values.set(supportKey(r), r);
    const r = {
      basis: c.basis,
      entity: { kind: 'SYNTAX_EVIDENCE', id: s.id, revisionId: c.basis.revisionId },
      valueDigest: hash(
        'runtime-syntax-support-v1\0' +
          canonical({ schema: 'codeatlas.syntax-evidence', version: 3, payload: s }),
      ),
    };
    values.set(supportKey(r), r);
  }
  return [...values.values()].sort((a, b) => (supportKey(a) < supportKey(b) ? -1 : 1));
}
function expectedEnvelope(c, w) {
  const supports = supportFor(c, w.support);
  const base = {
    repositoryId: c.basis.repositoryId,
    revisionId: c.basis.revisionId,
    basis: c.basis,
    sourceRange: c.syntaxEvidence.find((x) => x.id === 'syntax:site')?.sourceRange,
    confidence: { score: 0.5, method: expected.policy.method, reasons: [] },
    resolution: 'HEURISTIC',
    supportRefs: supports,
  };
  const payload = {
    basis: c.basis,
    externalRefs: supports.map((s) => ({
      scope: 'REPOSITORY',
      repositoryId: c.basis.repositoryId,
      entity: s.entity,
    })),
    supportInventory: supports,
    entryPoints: [],
    tasks: [],
    dataResources: [],
    triggers: [],
    contracts: [],
    contexts: [],
    nodes: [],
    edges: [],
    flows: [],
  };
  for (const r of w.records)
    payload[
      r.kind === 'CONTRACT' ? 'contracts' : r.kind === 'DATA_RESOURCE' ? 'dataResources' : 'tasks'
    ].push({ ...base, id: r.id, factKey: r.factKey, ...r.fields });
  return { schema: 'codeatlas.runtime-fact-set', version: 1, payload };
}
test('fixture preflight: independent expected Runtime envelopes and current contexts', () => {
  for (const item of input.cases) {
    const c = setup(item.name),
      w = expected.cases[item.name];
    validatePluginV4Context(c);
    parseRuntimeFactSet(expectedEnvelope(c, w));
  }
});
for (const item of input.cases)
  test('runtime candidate: ' + item.name, async () => {
    const c = setup(item.name),
      w = expected.cases[item.name];
    const out = (await api()).compileFrameworkRuntimeCandidate(c, item.framework);
    const actual = records(out),
      want = [...w.records].sort((a, b) => (a.id < b.id ? -1 : 1));
    assert.equal(actual.length, want.length);
    for (let i = 0; i < want.length; i++) {
      const { kind, scope, semantic, fields, ...identity } = want[i];
      for (const [key, value] of Object.entries({ ...fields, ...identity }))
        assert.deepEqual(actual[i][key], value, key);
      assert.equal(actual[i].confidence.score, 0.5);
      assert.equal(actual[i].confidence.method, expected.policy.method);
      assert.equal(actual[i].resolution, 'HEURISTIC');
      const reasons = [
        'CURRENT_INPUT_BASIS',
        'FRAMEWORK_DECLARATION_BOUND',
        'RULE_FIELDS_VALIDATED',
        kind === 'DATA_RESOURCE' ? 'RESOURCE_SCOPE_PROVED' : 'IMPLEMENTATION_DECLARED',
      ];
      if (kind === 'DATA_RESOURCE' || fields.protocol === 'MESSAGE')
        reasons.push('NAMESPACE_UNKNOWN');
      if (kind === 'DATA_RESOURCE' || fields.protocol) reasons.push('SCHEMA_UNKNOWN');
      assert.deepEqual(actual[i].confidence.reasons, reasons);
      assert.deepEqual(actual[i].supportRefs, supportFor(c, w.support));
      assert.deepEqual(
        actual[i].sourceRange,
        c.syntaxEvidence.find((s) => s.id === 'syntax:site').sourceRange,
      );
      assert.deepEqual(actual[i].basis, c.basis);
      const p = out.provenance.find((p) => p.entityId === actual[i].id);
      assert.equal(p.policyVersion, expected.policy.method);
      assert.deepEqual(p.syntaxIds, w.support.map((id) => 'syntax:' + id).sort());
      for (const key of ['draftKeys', 'ruleIds', 'syntaxIds'])
        assert.deepEqual(p[key], [...new Set(p[key])].sort());
    }
    for (const key of ['entryPoints', 'triggers', 'contexts', 'nodes', 'edges', 'flows'])
      assert.deepEqual(out.facts.payload[key], []);
    assert.deepEqual(
      out.facts.payload.supportInventory,
      want.length ? supportFor(c, w.support) : [],
    );
    assert.deepEqual(
      out.facts.payload.externalRefs,
      out.facts.payload.supportInventory.map((s) => ({
        scope: 'REPOSITORY',
        repositoryId: c.basis.repositoryId,
        entity: s.entity,
      })),
    );
    assert.equal(out.coverage.status, 'PARTIAL');
    assert(out.coverage.limitations.includes('DOMAIN_RECORDS_ONLY'));
    assert.deepEqual(out.coverage.unverifiedRefs, []);
    if (item.framework === 'mongo' && actual.length)
      assert(out.coverage.limitations.includes('DATA_OPERATION_REQUIRES_CONTEXT'));
    assert.deepEqual(
      out,
      (await api()).compileFrameworkRuntimeCandidate(
        {
          ...c,
          nodes: [...c.nodes].reverse(),
          supportInventory: [...c.supportInventory].reverse(),
          syntaxEvidence: [...c.syntaxEvidence].reverse(),
        },
        item.framework,
      ),
    );
    assert(Object.isFrozen(out));
    assert(Object.isFrozen(out.facts.payload));
    parseRuntimeFactSet(out.facts);
  });
for (const [name, mutate] of [
  [
    'low Code',
    (c) => {
      c.nodes[0].confidence.score = 0.4;
    },
  ],
  [
    'unknown Syntax method',
    (c) => {
      c.syntaxEvidence[0].confidence.method = 'other';
    },
  ],
  [
    'altered Syntax score',
    (c) => {
      c.syntaxEvidence[0].confidence.score = 0.6;
    },
  ],
])
  test('policy inapplicable: ' + name, async () => {
    const c = setup('spring-route');
    mutate(c);
    validatePluginV4Context(c);
    const out = (await api()).compileFrameworkRuntimeCandidate(c, 'spring');
    assert.equal(records(out).length, 0);
    assert(out.coverage.limitations.includes('DECLARATION_SUPPORT_POLICY_INAPPLICABLE'));
  });
test('strict rejection of foreign basis, duplicate digest and caller policy field', async () => {
  const run = (await api()).compileFrameworkRuntimeCandidate,
    c = setup('spring-route');
  for (const mutate of [
    (c) => {
      c.syntaxEvidence[0].supportRefs[0].basis.revisionId = 'foreign';
    },
    (c) => {
      c.nodes[1].factKey = c.nodes[0].factKey;
    },
    (c) => {
      c.basis.revisionId = 'foreign';
    },
    (c) => {
      c.supportInventory.push({ ...c.supportInventory[0], valueDigest: 'f'.repeat(64) });
    },
    (c) => {
      c.score = 1;
    },
  ]) {
    const bad = structuredClone(c);
    mutate(bad);
    assert.throws(() => run(bad, 'spring'), { code: 'IR_VALIDATION_FAILED' });
  }
  assert.throws(() => run(c, 'other'), { code: 'IR_VALIDATION_FAILED' });
});
test('removal recomputes rather than retaining stale candidates', async () => {
  const run = (await api()).compileFrameworkRuntimeCandidate,
    c = setup('fastapi-direct');
  for (const id of ['syntax:import', 'syntax:app-assign', 'syntax:site']) {
    const x = { ...c, syntaxEvidence: c.syntaxEvidence.filter((s) => s.id !== id) };
    assert.equal(records(run(x, 'fastapi')).length, 0);
  }
  const empty = { ...c, syntaxEvidence: [] };
  assert.equal(records(run(empty, 'fastapi')).length, 0);
});
function addMongoSite(c, { receiver = 'template', otherMethod = false, line = 70 } = {}) {
  const site = structuredClone(c.syntaxEvidence.find((s) => s.id === 'syntax:site'));
  site.id = 'syntax:site:' + line;
  site.syntaxKey = 'key:site:' + line;
  site.sourceRange = range(line);
  site.payload.callee.name = receiver + '.find';
  site.payload.receiver.name = receiver;
  for (const a of site.payload.arguments) a.sourceRange = range(line);
  if (receiver !== 'template') {
    const d = structuredClone(c.syntaxEvidence.find((s) => s.id === 'syntax:decl'));
    d.id = 'syntax:decl:' + receiver;
    d.syntaxKey = 'key:decl:' + receiver;
    d.payload.declaredName = receiver;
    d.sourceRange = range(26);
    c.syntaxEvidence.push(d);
  }
  if (otherMethod) {
    const n = structuredClone(c.nodes.find((n) => n.id === 'code:function'));
    n.id = 'code:other';
    n.factKey = 'code-key:other';
    n.sourceRange = range(110, 150);
    c.nodes.push(n);
    const r = {
      scope: 'REPOSITORY',
      repositoryId: c.basis.repositoryId,
      entity: { kind: 'CODE_NODE', id: n.id, revisionId: c.basis.revisionId },
    };
    site.owner = r;
    site.lexicalScope = r;
    site.sourceRange = range(120);
    for (const a of site.payload.arguments) a.sourceRange = range(120);
    const s = structuredClone(c.syntaxEvidence.find((s) => s.id === 'syntax:scope:function'));
    s.id = 'syntax:scope:other';
    s.syntaxKey = 'key:scope:other';
    s.owner = r;
    s.lexicalScope = r;
    s.sourceRange = range(110, 150, 0, 20);
    s.payload.scopeRef = r;
    c.syntaxEvidence.push(s);
    const sup = { basis: c.basis, entity: r.entity, valueDigest: hash(JSON.stringify(n)) };
    c.supportInventory.push(sup);
    for (const s of [...c.syntaxEvidence, site]) s.supportRefs.push(structuredClone(sup));
  }
  c.syntaxEvidence.push(site);
}
test('unknown namespaces isolate two receivers of the same collection', async () => {
  const c = setup('mongo-read');
  addMongoSite(c, { receiver: 'second' });
  const out = (await api()).compileFrameworkRuntimeCandidate(c, 'mongo');
  assert.equal(out.facts.payload.dataResources.length, 2);
  assert.equal(new Set(out.facts.payload.dataResources.map((r) => r.factKey)).size, 2);
});
test('same receiver across methods merges; removing one support retains other', async () => {
  const c = setup('mongo-read');
  addMongoSite(c, { otherMethod: true });
  const run = (await api()).compileFrameworkRuntimeCandidate;
  const out = run(c, 'mongo');
  assert.equal(out.facts.payload.dataResources.length, 1);
  assert.deepEqual(out.facts.payload.dataResources[0].sourceRange, range(50));
  assert.deepEqual(out, run({ ...c, syntaxEvidence: [...c.syntaxEvidence].reverse() }, 'mongo'));
  assert(out.provenance[0].syntaxIds.includes('syntax:site'));
  assert(out.provenance[0].syntaxIds.includes('syntax:site:70'));
  const x = { ...c, syntaxEvidence: c.syntaxEvidence.filter((s) => s.id !== 'syntax:site') },
    remaining = run(x, 'mongo');
  assert.equal(remaining.facts.payload.dataResources[0].id, out.facts.payload.dataResources[0].id);
  assert(!remaining.provenance[0].syntaxIds.includes('syntax:site'));
  assert.equal(
    records(
      run(
        { ...x, syntaxEvidence: x.syntaxEvidence.filter((s) => s.id !== 'syntax:site:70') },
        'mongo',
      ),
    ).length,
    0,
  );
});
test('provider observation labels do not enter runtime identity', async () => {
  const c = setup('fastapi-direct'),
    run = (await api()).compileFrameworkRuntimeCandidate,
    a = run(c, 'fastapi');
  for (const s of c.syntaxEvidence) {
    s.id = 'new:' + s.id;
    s.syntaxKey = 'new:' + s.syntaxKey;
    s.extractionVersion = 'another-provider';
  }
  const b = run(c, 'fastapi');
  assert.deepEqual(
    records(a).map((r) => [r.id, r.factKey]),
    records(b).map((r) => [r.id, r.factKey]),
  );
  assert.notDeepEqual(a.provenance, b.provenance);
});
test('cumulative output budget permits exactly 10000 units and rejects one extra limitation', async () => {
  const c = setup('kafka-listener'),
    site = c.syntaxEvidence.find((s) => s.id === 'syntax:site');
  site.payload.arguments[0].value = {
    kind: 'ARRAY',
    items: Array.from({ length: 665 }, (_, i) => ({ kind: 'STRING', value: 'topic:' + i })),
  };
  const duplicate = structuredClone(site);
  duplicate.id = 'syntax:duplicate';
  duplicate.syntaxKey = 'key:duplicate';
  duplicate.sourceRange = range(46);
  duplicate.payload.arguments[0].sourceRange = range(46);
  duplicate.payload.arguments[0].value.items = duplicate.payload.arguments[0].value.items.slice(
    0,
    2,
  );
  c.syntaxEvidence.push(duplicate);
  const run = (await api()).compileFrameworkRuntimeCandidate,
    out = run(c, 'kafka');
  const units =
    records(out).reduce((n, r) => n + 1 + r.supportRefs.length, 0) +
    out.coverage.limitations.length +
    out.facts.payload.externalRefs.length +
    out.facts.payload.supportInventory.length +
    out.provenance.reduce(
      (n, p) => n + p.draftKeys.length + p.ruleIds.length + p.syntaxIds.length,
      0,
    );
  assert.equal(units, 10000);
  const unsupported = structuredClone(site);
  unsupported.id = 'syntax:unsupported';
  unsupported.syntaxKey = 'key:unsupported';
  unsupported.sourceRange = range(47);
  unsupported.payload.callee.name = 'Unknown';
  c.syntaxEvidence.push(unsupported);
  assert.throws(() => run(c, 'kafka'), { code: 'IR_VALIDATION_FAILED' });
});
