import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import * as ir from '../dist/index.js';

const fixtureRoot = new URL('../../../fixtures/ir/source-revision-v1/', import.meta.url);
const parsers = {
  REPOSITORY: (input) => ir.parseIr(ir.RepositorySchema, input),
  REPOSITORY_RELATIVE_PATH: (input) => ir.parseIr(ir.RepositoryRelativePathSchema, input),
  REVISION: (input) => ir.parseIr(ir.RevisionSchema, input),
  REVISION_TRANSITION: (input) => ir.validateRevisionTransition(input.previous, input.next),
  SOURCE_FILE: (input) => ir.parseIr(ir.SourceFileSchema, input),
};
const validCases = JSON.parse(await readFile(new URL('valid/cases.json', fixtureRoot), 'utf8'));
const invalidCases = JSON.parse(await readFile(new URL('invalid/cases.json', fixtureRoot), 'utf8'));

function parserFor(target) {
  const parser = parsers[target];
  assert.ok(parser, `fixture target ${target} must have an explicit parser`);
  return parser;
}

function fixtureCategory(fixture) {
  if (fixture.target === 'REPOSITORY') {
    return 'repository';
  }

  if (fixture.target === 'REVISION') {
    return 'revision';
  }

  if (fixture.target === 'REVISION_TRANSITION') {
    return 'revision transition';
  }

  if (fixture.target === 'SOURCE_FILE') {
    return 'source file';
  }

  return 'relative path';
}

function assertIrError(callback, code, expectedPath) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof ir.IrContractError);
    assert.equal(error.code, code);

    if (expectedPath !== undefined) {
      assert.ok(error instanceof ir.IrValidationError);
      assert.ok(
        error.issues.some((issue) => JSON.stringify(issue.path) === JSON.stringify(expectedPath)),
      );
    }

    return true;
  });
}

for (const fixture of validCases) {
  test(`valid ${fixtureCategory(fixture)} fixture ${fixture.id} preserves a JSON round-trip`, () => {
    const parser = parserFor(fixture.target);
    const first = parser(fixture.input);
    const roundTripped = JSON.parse(JSON.stringify(first));
    const second =
      fixture.target === 'REVISION_TRANSITION'
        ? ir.parseIr(ir.RevisionSchema, roundTripped)
        : parser(roundTripped);

    if (fixture.target === 'REVISION_TRANSITION') {
      assert.deepEqual(first, fixture.input.next, `${fixture.id} returns the next revision`);
    }

    assert.deepEqual(second, first, fixture.id);
  });
}

for (const fixture of invalidCases) {
  test(`invalid ${fixtureCategory(fixture)} fixture ${fixture.id} exposes its typed code and path`, () => {
    assertIrError(() => parserFor(fixture.target)(fixture.input), fixture.errorCode, fixture.path);
  });
}

test('repository rejects unknown keys rather than stripping them', () => {
  assertIrError(
    () =>
      ir.parseIr(ir.RepositorySchema, {
        id: 'entity:repo-01',
        rootPath: 'D:/workspace/project',
        extra: true,
      }),
    'IR_VALIDATION_FAILED',
    [],
  );
});

test('source file identity remains stable while revision and content fingerprint change', () => {
  const earlier = validCases.find(
    (fixture) => fixture.id === 'source-file-logical-identity-earlier-revision',
  );
  const later = validCases.find(
    (fixture) => fixture.id === 'source-file-logical-identity-later-revision',
  );

  assert.ok(earlier);
  assert.ok(later);

  const earlierFile = parserFor(earlier.target)(earlier.input);
  const laterFile = parserFor(later.target)(later.input);

  assert.equal(earlierFile.id, laterFile.id);
  assert.equal(earlierFile.path, laterFile.path);
  assert.notEqual(earlierFile.revisionId, laterFile.revisionId);
  assert.notEqual(earlierFile.contentFingerprint, laterFile.contentFingerprint);
});

test('source file language hint rejects explicit undefined', () => {
  assertIrError(
    () =>
      ir.parseIr(ir.SourceFileSchema, {
        id: 'entity:file-src-main',
        repositoryId: 'entity:repo-01',
        revisionId: 'entity:revision-worktree',
        path: 'src/main.ts',
        contentFingerprint: 'sha256:file-main-v1',
        classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
        languageHint: undefined,
        sensitivity: 'INTERNAL',
      }),
    'IR_VALIDATION_FAILED',
    ['languageHint'],
  );
});
