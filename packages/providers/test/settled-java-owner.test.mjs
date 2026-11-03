import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import * as api from '../dist/native-composition-input.js';
import { readComponentReference as read } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
const root = new URL(
  '../../../fixtures/phase1/mixed-runtime-readiness/java-owner-timing/',
  import.meta.url,
);
const expected = JSON.parse(fs.readFileSync(new URL('expected.json', root)));
for (const id of Object.keys(expected))
  test('settled Java strict known schema ' + id, () => {
    const e = expected[id],
      m = JSON.parse(read(e.finalMetadataReference)).metadata;
    assert.deepEqual(api.SettledJavaOwnerPreparationSchema.parse(e.preparation), e.preparation);
    assert.deepEqual(api.projectSettledJavaOwner(m), e.preparation);
    assert.equal(Object.hasOwn(e.preparation, 'codeSyntax'), false);
    assert.equal(Object.hasOwn(e.preparation.snapshot, 'completedAt'), false);
    assert.deepEqual(api.CompositionMetadataSchema.parse(m), m);
  });
for (const kind of [
  'completedAt',
  'codeSyntax',
  'kind',
  'version',
  'time',
  'tool',
  'providerVersion',
  'runtimeVersion',
])
  test('settled Java schema rejects ' + kind, () => {
    const p = structuredClone(expected.mixed.preparation);
    if (kind === 'completedAt') p.snapshot.completedAt = null;
    if (kind === 'codeSyntax') p.codeSyntax = null;
    if (kind === 'kind') p.kind = 'UNKNOWN';
    if (kind === 'version') p.schemaVersion = 2;
    if (kind === 'time') p.java.settledAt = '2020-01-01T00:00:00.000Z';
    if (kind === 'tool') p.java.tool = { ...p.java.tool, profile: 'different' };
    if (kind === 'providerVersion') p.java.providerVersion = '9.9.9';
    if (kind === 'runtimeVersion') p.java.runtimeVersion = 'different';
    assert.equal(typeof api.SettledJavaOwnerPreparationSchema?.safeParse, 'function');
    assert.equal(api.SettledJavaOwnerPreparationSchema.safeParse(p).success, false);
  });

test('settled projection never reads future completion or Syntax fields', () => {
  const m = JSON.parse(read(expected.mixed.finalMetadataReference)).metadata;
  Object.defineProperty(m, 'codeSyntax', {
    get() {
      throw Error('future Syntax unavailable');
    },
  });
  Object.defineProperty(m.snapshot, 'completedAt', {
    get() {
      throw Error('future completion unavailable');
    },
  });
  assert.deepEqual(api.projectSettledJavaOwner(m), expected.mixed.preparation);
});
