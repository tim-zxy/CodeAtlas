import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const fixture = JSON.parse(
  await readFile(
    new URL('../../../fixtures/storage/incremental-patch-apply/cases.json', import.meta.url),
    'utf8',
  ),
);

test('P05-W1-011 Fixture declares atomic patch, fallback and rollback boundaries', () => {
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.id, 'p05-incremental-patch-apply-v1');
  assert.equal(fixture.task, 'P05-W1-011');
  assert.ok(fixture.cases.includes('selected-support-removal-retains-second-provider'));
  assert.ok(fixture.cases.includes('changed-revision-fallback'));
  assert.ok(fixture.cases.includes('dangling-fact-evidence-link-rejection'));
  assert.ok(fixture.cases.includes('validated-refresh-composition-and-failure-retention'));
  assert.ok(fixture.cases.includes('support-retirement-and-pointer-failure-rollback'));
});
