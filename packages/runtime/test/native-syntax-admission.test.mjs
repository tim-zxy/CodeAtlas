import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import * as runtime from '../dist/index.js';
import * as profiles from '../dist/native-metadata-profiles.js';
const unavailable = (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED';
test('Syntax catalog is empty and does not borrow old numeric entries', () => {
  assert.ok(Array.isArray(profiles.nativeSyntaxObservationProfiles));
  assert.ok(Object.isFrozen(profiles.nativeSyntaxObservationProfiles));
  assert.equal(profiles.nativeSyntaxObservationProfiles.length, 0);
  assert.ok(profiles.nativeMetadataProfiles.length > 0);
});
test('missing profile refuses before lazy prepare getter and nonexistent executable access', async () => {
  assert.equal(typeof runtime.observeAdmittedNativeSyntax, 'function');
  let reads = 0;
  const input = {
    memoryBudgetBytes: 1000000000,
    maxItems: 1000,
    executablePath: path.resolve('never-exists', 'native.exe'),
    get prepare() {
      reads++;
      throw Error('must not execute');
    },
  };
  await assert.rejects(() => runtime.observeAdmittedNativeSyntax(input), unavailable);
  assert.equal(reads, 0);
});
test('missing profile refuses before request/context/options factory can cause effects', async () => {
  assert.equal(typeof runtime.observeAdmittedNativeSyntax, 'function');
  let prepared = 0;
  await assert.rejects(
    () =>
      runtime.observeAdmittedNativeSyntax({
        memoryBudgetBytes: 1000000000,
        maxItems: 1000,
        executablePath: process.execPath,
        prepare: () => {
          prepared++;
          throw Error('unsafe factory');
        },
      }),
    unavailable,
  );
  assert.equal(prepared, 0);
});
for (const memoryBudgetBytes of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
  test(
    'invalid trusted budget ' + String(memoryBudgetBytes) + ' refuses before preparation',
    async () => {
      assert.equal(typeof runtime.observeAdmittedNativeSyntax, 'function');
      await assert.rejects(
        () =>
          runtime.observeAdmittedNativeSyntax({
            memoryBudgetBytes,
            maxItems: 1000,
            executablePath: process.execPath,
            prepare: () => {
              throw Error('must not execute');
            },
          }),
        (e) => e.code === 'INVALID_CONFIGURATION',
      );
    },
  );
test('caller profile/token cannot install a synthetic approval or waive the catalog', async () => {
  assert.equal(typeof runtime.observeAdmittedNativeSyntax, 'function');
  await assert.rejects(
    () =>
      runtime.observeAdmittedNativeSyntax({
        memoryBudgetBytes: 1000000000,
        maxItems: 1000,
        executablePath: process.execPath,
        profile: { status: 'APPROVED', reservationBytes: 1 },
        prepare: () => {
          throw Error('must not execute');
        },
      }),
    (e) => e.code === 'INVALID_CONFIGURATION',
  );
});

test('prepared request cannot enlarge the trusted operation traversal allowance', async () => {
  assert.equal(typeof runtime.validateSyntaxOperationBudget, 'function');
  const { readFile } = await import('node:fs/promises');
  const r = JSON.parse(
    await readFile(
      new URL(
        '../../../fixtures/phase1/syntax-budget-contract/inputs/python-initial-request.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  assert.equal(
    runtime.validateSyntaxOperationBudget(r, 1000).payload.resourceBudget.maxItems,
    1000,
  );
  assert.throws(
    () => runtime.validateSyntaxOperationBudget(r, 999),
    (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
  );
  for (const maxItems of [0, -1, NaN, Infinity])
    assert.throws(
      () => runtime.validateSyntaxOperationBudget(r, maxItems),
      (e) => e.code === 'INVALID_CONFIGURATION',
    );
});
