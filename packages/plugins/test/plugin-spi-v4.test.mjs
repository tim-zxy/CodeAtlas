import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as ir from '../../ir/dist/index.js';
const v = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/phase1/ir-contract/declared-execution/inputs.json', import.meta.url),
  ),
);
const c = v.cases[0].context;
const descriptor = {
  pluginId: 'spring',
  pluginVersion: '1.0.0',
  languages: ['java'],
  frameworks: ['spring'],
  requiredProviderCapabilities: [],
  producedSemanticCapabilities: ['RUNTIME_FACT_SET', 'FRAMEWORK_BINDING_SET'],
  configurationSchema: { schema: 'codeatlas.plugin.spring', version: 1 },
  trustClass: 'BUILT_IN',
  contextVersion: 4,
  syntaxSchemaVersion: 3,
};
const api = () => import('../dist/plugin-spi-v4.js');
test('V4 descriptor version and context stay explicit', async () => {
  const p = await api();
  assert.deepEqual(p.validatePluginDescriptorV4(descriptor), descriptor);
  assert.throws(() => p.validatePluginDescriptorV4({ ...descriptor, contextVersion: 2 }));
  assert.throws(() => p.validatePluginDescriptorV4({ ...descriptor, syntaxSchemaVersion: 2 }));
});
test('V4 detection binds current canonical support and source diagnostics', async () => {
  const p = await api(),
    d = {
      matched: true,
      support: [{ kind: 'CANONICAL', ref: { factType: 'NODE', id: c.nodes[0].id } }],
      diagnostics: [],
    };
  assert.deepEqual(p.validatePluginV4Detection(c, d), d);
  assert.throws(() => p.validatePluginV4Detection(c, { ...d, matched: false }));
  assert.throws(() =>
    p.validatePluginV4Detection(c, { ...d, support: [{ kind: 'SYNTAX', id: 'foreign' }] }),
  );
  assert.throws(() => p.validatePluginV4Detection({ ...c, contextVersion: 2 }, d));
});
test('V4 output capability and support digest are authenticated to context', async () => {
  const p = await api(),
    { compileFrameworkEntryCandidate } = await import('../dist/framework-entry-candidate.js');
  const facts = compileFrameworkEntryCandidate(c, 'spring', 10000).facts;
  const d = {
    matched: true,
    support: [{ kind: 'CANONICAL', ref: { factType: 'NODE', id: c.nodes[0].id } }],
    diagnostics: [],
  };
  const extraction = { ...c, detection: d, maxItems: 10000 };
  const candidate = {
    capability: 'RUNTIME_FACT_SET',
    value: facts,
    support: d.support,
    coverage: { status: 'PARTIAL', limitations: ['DECLARATION_ENTRIES_ONLY'], unverifiedRefs: [] },
  };
  assert.deepEqual(p.validatePluginV4Candidate(extraction, descriptor, candidate), candidate);
  const x = structuredClone(candidate);
  x.value.payload.supportInventory[0].valueDigest = 'f'.repeat(64);
  assert.throws(() => p.validatePluginV4Candidate(extraction, descriptor, x));
  assert.throws(() =>
    p.validatePluginV4Candidate(extraction, descriptor, { ...candidate, capability: 'other' }),
  );
  assert.throws(() => p.validatePluginV4ExtractionContext({ ...extraction, maxItems: 0 }));
  assert.throws(() => ir.parseRuntimeFactSet({ ...facts, version: 2 }));
});
