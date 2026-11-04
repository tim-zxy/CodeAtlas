import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseSyntaxObservationRequest } from '../dist/index.js';
const request = JSON.parse(
  await readFile(
    new URL(
      '../../../fixtures/phase1/syntax-budget-contract/inputs/python-initial-request.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
test('current Syntax request carries explicit traversal allowance independent of event count', () => {
  const r = structuredClone(request);
  r.payload.resourceBudget.maxItems = 1;
  r.payload.resourceBudget.maxEvents = 20;
  assert.equal(parseSyntaxObservationRequest(r).payload.resourceBudget.maxItems, 1);
});
for (const value of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
  test('missing or invalid traversal allowance ' + String(value) + ' refuses', () => {
    const r = structuredClone(request);
    if (value === undefined) delete r.payload.resourceBudget.maxItems;
    else r.payload.resourceBudget.maxItems = value;
    assert.throws(
      () => parseSyntaxObservationRequest(r),
      (e) => e.code === 'INVALID_REQUEST',
    );
  });
test('old unpublished owner-binding bytes remain history and have no implicit traversal default', async () => {
  const old = JSON.parse(
    await readFile(
      new URL(
        '../../../fixtures/phase1/syntax-owner-binding/inputs/python-initial-request.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  assert.throws(
    () => parseSyntaxObservationRequest(old),
    (e) => e.code === 'INVALID_REQUEST',
  );
});
