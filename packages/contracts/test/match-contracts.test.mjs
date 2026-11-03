import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../../../fixtures/phase1/contract-matching/', import.meta.url);
const v = JSON.parse(readFileSync(new URL('matching-inputs.json', root)));
const e = JSON.parse(readFileSync(new URL('matching-expected.json', root)));
const api = () => import('../dist/match-contracts.js');
const control = (extra = {}) => ({
  maxItems: 10000,
  maxDepth: 10,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
  ...extra,
});
for (const item of v.cases)
  test('matching ' + item.name, async () => {
    const out = (await api()).matchContracts(item.input, control());
    assert.equal(out.matches.length, 1);
    const m = out.matches[0].payload;
    assert.equal(m.status, e.cases.find((x) => x.name === item.name).status);
    assert.equal(m.confidence.method, e.method);
    assert.equal(m.confidence.score, e.score);
    assert.equal(m.selectedProviderRef !== null, m.status === 'MATCHED');
    if (m.status === 'AMBIGUOUS') assert.equal(m.candidateProviderRefs.length, 2);
    const x = structuredClone(item.input);
    x.contractRefs.reverse();
    x.repositoryBindings.reverse();
    x.catalog.services.reverse();
    x.catalog.contractBindings.reverse();
    assert.deepEqual((await api()).matchContracts(x, control()), out);
  });
test('matcher rejects changed frozen source identity and cooperatively stops', async () => {
  const run = (await api()).matchContracts,
    x = structuredClone(v.cases[0].input);
  x.repositoryBindings[0].repoBasis.codeActivationDigest = '9'.repeat(64);
  assert.throws(() => run(x, control()));
  const y = structuredClone(v.cases[0].input);
  y.catalog.entries[0].key = 'different';
  assert.throws(() => run(y, control()));
  const a = new AbortController();
  a.abort();
  const stopped = run(v.cases[0].input, control({ signal: a.signal }));
  assert.equal(stopped.termination, 'CANCELLED');
  assert.equal(stopped.matches.length, 0);
  assert(stopped.frontier.length);
  assert.equal(run(v.cases[0].input, control({ deadlineEpochMs: 0 })).termination, 'DEADLINE');
  assert.throws(() => run(v.cases[0].input, control({ maxItems: 0 })));
});
