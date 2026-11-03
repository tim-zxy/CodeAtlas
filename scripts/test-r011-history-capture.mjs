import { assertHistoricalFixturePin } from '../fixtures/phase1/syntax-contract/ci-portability/historical-inputs.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { discoverFixtures, parseFixtureManifest } from '../packages/evaluation/dist/index.js';
import { nativeSyntaxObservationProfiles } from '../packages/runtime/dist/native-metadata-profiles.js';
import {
  encodeHistoryValue,
  historyDigest,
  HistoryReadBudget,
} from '../packages/storage/dist/analysis/activation-history-format.js';
const root = 'fixtures/phase1/r011-history-capture/',
  read = (p) => readFileSync(p, 'utf8'),
  json = (p) => JSON.parse(read(p)),
  sha = (b) => createHash('sha256').update(b).digest('hex');
const cases = json(root + 'cases.json'),
  fixture = json(root + 'fixture.json'),
  provenance = json(root + 'provenance.json');
const limits = {
  maxRows: Number.MAX_SAFE_INTEGER,
  maxSerializedBytes: Number.MAX_SAFE_INTEGER,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxDepth: Number.MAX_SAFE_INTEGER,
  memoryBudgetBytes: Number.MAX_SAFE_INTEGER,
};
test('independent strict H1 manifest has31 cases in12 required families', () => {
  assert.equal(parseFixtureManifest(fixture).id, 'p1-r011-history-capture-v1');
  assert.deepEqual(fixture.qualityGates, {});
  assert.deepEqual(fixture.capabilities, ['R011_HISTORY_STORAGE_CAPTURE_ONLY']);
  assert.equal(cases.length, 31);
  assert.equal(new Set(cases.map((c) => c.id)).size, 31);
  assert.deepEqual(
    [...new Set(cases.map((c) => c.family))].sort(),
    Array.from({ length: 12 }, (_, i) => 'R' + String(i + 1).padStart(2, '0')),
  );
  for (const c of cases) {
    assert.equal(c.input, 'cases/' + c.id + '/input.json');
    assert.equal(c.expected, 'cases/' + c.id + '/expected.json');
    json(root + c.input);
    json(root + c.expected);
  }
});
test('all64 independent payloads match provenance without product regeneration', () => {
  assert.equal(provenance.kind, 'INDEPENDENT_COMPONENT_LITERAL_REFERENCE');
  assert.equal(provenance.componentOnly, true);
  const walk = (p) =>
    readdirSync(p, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(p, e.name)) : [join(p, e.name).replaceAll('\\', '/')],
    );
  const paths = walk(root)
    .map((p) => p.slice(root.length))
    .filter(
      (p) =>
        ![
          'provenance.json',
          'binding-history/inputs.json',
          'binding-history/expected.json',
        ].includes(p),
    )
    .sort();
  assert.equal(paths.length, 64);
  assert.deepEqual(Object.keys(provenance.sha256).sort(), paths);
  for (const p of paths) assertHistoricalFixturePin(root + p, provenance.sha256[p]);
});
test('independent integer-key and Unicode value encoding goldens', () => {
  const c = cases.find((c) => c.id === 'encoding'),
    input = json(root + c.input),
    expected = json(root + c.expected);
  for (let i = 0; i < input.vectors.length; i++) {
    assert.equal(
      encodeHistoryValue(input.vectors[i], new HistoryReadBudget(limits)),
      expected.encoded[i],
    );
    assert.equal(
      historyDigest(
        'codeatlas-activation-source-v1',
        input.vectors[i],
        new HistoryReadBudget(limits),
      ),
      expected.digests[i],
    );
  }
});
test('R011 SQL remains5tables4indexes8immutable33invalidation with exact legacy event coverage', () => {
  const sql = read('packages/storage/migrations/repository/011_framework_syntax.sql');
  assert.equal((sql.match(/^CREATE TABLE /gm) ?? []).length, 5);
  assert.equal((sql.match(/^CREATE INDEX /gm) ?? []).length, 4);
  assert.equal((sql.match(/^CREATE TRIGGER /gm) ?? []).length, 41);
  for (const table of [
    'activation_history',
    'syntax_origins',
    'syntax_projections',
    'activation_syntax_members',
  ])
    for (const event of ['UPDATE', 'DELETE'])
      assert.match(sql, new RegExp('BEFORE ' + event + ' ON ' + table + '\\b'));
  for (const table of [
    'canonical_nodes',
    'canonical_edges',
    'unresolved_targets',
    'evidence',
    'provider_fact_bindings',
    'fact_evidence',
    'active_support_candidates',
    'provider_snapshots',
    'provider_capabilities',
    'analysis_coverage',
    'repository_state',
  ])
    for (const event of ['INSERT', 'UPDATE', 'DELETE'])
      assert.match(sql, new RegExp('AFTER ' + event + ' ON ' + table + '\\b'));
  assert.doesNotMatch(
    sql,
    /AFTER (?:INSERT|UPDATE|DELETE) ON (?:source_files|revisions|repository)\b/,
  );
  const m = json('packages/storage/migrations/repository/manifest.json');
  // R012/R013 are tested by repository-schema; R011 remains the eleventh migration.
  assert.equal(m.migrations[10].name, 'framework_syntax');
  assert.equal(m.migrations[10].backupRequired, false);
  for (const migration of m.migrations)
    assert.equal(
      'sha256:' +
        sha(
          read('packages/storage/migrations/repository/' + migration.file).replace(/\r\n?/g, '\n'),
        ),
      migration.checksum,
    );
});
test('four new root registrations exactly once', () => {
  const command = json('package.json').scripts.test;
  for (const p of [
    'packages/storage/test/r011-history-migration.test.mjs',
    'packages/storage/test/code-context-read.test.mjs',
    'packages/storage/test/activation-history.test.mjs',
    'scripts/test-r011-history-capture.mjs',
  ])
    assert.equal(command.split(/\s+/).filter((x) => x === p).length, 1);
});
test('local Fixture registration Phase1 retains prior history fixtures and catalog0', async () => {
  const r = await discoverFixtures('fixtures');
  for (const id of [
    'p1-r011-history-capture-v1',
    'p1-code-context-capture-v1',
    'p1-history-transition-draft-v1',
    'p1-delta-support-candidate-v1',
  ])
    assert.equal(r.filter((x) => x.manifest.id === id).length, 1, id);
  assert.equal(nativeSyntaxObservationProfiles.length, 0);
});
