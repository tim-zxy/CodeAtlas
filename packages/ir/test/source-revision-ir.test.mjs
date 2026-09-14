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
  PROVIDER_SNAPSHOT: (input) => ir.parseIr(ir.ProviderSnapshotSchema, input),
  PROVIDER_SNAPSHOT_REVISION: (input) =>
    ir.validateProviderSnapshotRevision(input.snapshot, input.revision),
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

  if (fixture.target === 'PROVIDER_SNAPSHOT') {
    return 'provider snapshot';
  }

  if (fixture.target === 'PROVIDER_SNAPSHOT_REVISION') {
    return 'requested revision';
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
      fixture.target === 'REVISION_TRANSITION' || fixture.target === 'PROVIDER_SNAPSHOT_REVISION'
        ? fixture.target === 'REVISION_TRANSITION'
          ? ir.parseIr(ir.RevisionSchema, roundTripped)
          : ir.parseIr(ir.ProviderSnapshotSchema, roundTripped)
        : parser(roundTripped);

    if (fixture.target === 'REVISION_TRANSITION') {
      assert.deepEqual(first, fixture.input.next, `${fixture.id} returns the next revision`);
    }

    if (fixture.target === 'PROVIDER_SNAPSHOT_REVISION') {
      assert.deepEqual(
        first,
        fixture.input.snapshot,
        `${fixture.id} returns the validated snapshot`,
      );
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

test('provider snapshot rejects explicit undefined rather than stripping it', () => {
  assertIrError(
    () =>
      ir.parseIr(ir.ProviderSnapshotSchema, {
        id: 'entity:snapshot-undefined',
        repositoryId: 'entity:repo-01',
        providerId: 'provider:typescript',
        providerVersion: 'version:1.0.0',
        runtimeVersion: 'runtime:1.0.0',
        requestedRevisionId: 'entity:revision-commit-01',
        requestedRevisionFingerprint: 'fingerprint:commit-01',
        startedAt: '2026-09-14T00:00:00.000Z',
        completedAt: '2026-09-14T00:00:01.000Z',
        capabilities: [],
        diagnostics: undefined,
        outcome: 'SUCCEEDED',
      }),
    'IR_VALIDATION_FAILED',
    ['diagnostics'],
  );
});

test('provider snapshot reports every duplicate capability after the first', () => {
  assert.throws(
    () =>
      ir.parseIr(ir.ProviderSnapshotSchema, {
        id: 'entity:snapshot-duplicate-every-occurrence',
        repositoryId: 'entity:repo-01',
        providerId: 'provider:typescript',
        providerVersion: 'version:1.0.0',
        runtimeVersion: 'runtime:1.0.0',
        requestedRevisionId: 'entity:revision-commit-01',
        requestedRevisionFingerprint: 'fingerprint:commit-01',
        startedAt: '2026-09-14T00:00:00.000Z',
        completedAt: '2026-09-14T00:00:01.000Z',
        capabilities: [
          { name: 'symbols', support: 'SUPPORTED', coverage: 'COMPLETE' },
          { name: 'symbols', support: 'SUPPORTED', coverage: 'COMPLETE' },
          { name: 'symbols', support: 'UNSUPPORTED', coverage: 'NONE' },
        ],
        diagnostics: [],
        outcome: 'SUCCEEDED',
      }),
    (error) => {
      assert.ok(error instanceof ir.IrValidationError);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        [
          ['capabilities', 1, 'name'],
          ['capabilities', 2, 'name'],
        ],
      );
      return true;
    },
  );
});
