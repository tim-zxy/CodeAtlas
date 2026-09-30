import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SourceFileSchema, WorktreeRevisionSchema } from '../../ir/dist/index.js';
import { detectWorktreeChanges } from '../dist/change-detector.js';

const repositoryId = 'change-detector-repository';
const revisionId = 'change-detector-worktree';
const classification = { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' };

function state(fingerprint, files) {
  return {
    revision: WorktreeRevisionSchema.parse({
      id: revisionId,
      repositoryId,
      kind: 'WORKTREE',
      contentFingerprint: fingerprint,
      baseRevisionId: null,
    }),
    files: files.map((file) =>
      SourceFileSchema.parse({
        id: `id-${file.path}`,
        repositoryId,
        revisionId,
        path: file.path,
        contentFingerprint: file.contentFingerprint ?? 'fingerprint:one',
        classification: file.classification ?? classification,
        languageHint: file.languageHint ?? 'java',
        sensitivity: file.sensitivity ?? 'INTERNAL',
      }),
    ),
  };
}

test('initial inventory yields sorted additions without a refresh base', () => {
  const next = state('fingerprint:initial', [{ path: 'src/Z.java' }, { path: 'src/A.java' }]);
  const changes = detectWorktreeChanges(null, next);
  assert.equal(changes.baseRevisionId, null);
  assert.equal(changes.baseContentFingerprint, null);
  assert.deepEqual(
    changes.added.map((file) => file.path),
    ['src/A.java', 'src/Z.java'],
  );
  assert.deepEqual(changes.modified, []);
  assert.deepEqual(changes.deleted, []);
  assert.deepEqual(detectWorktreeChanges(null, state('fingerprint:empty', [])).added, []);
});

test('same-path content and analysis metadata changes retain the file ID', () => {
  const before = state('fingerprint:before', [{ path: 'src/A.java' }]);
  const variants = [
    { contentFingerprint: 'fingerprint:two' },
    { languageHint: 'kotlin' },
    { classification: { ...classification, role: 'TEST' } },
    { classification: { ...classification, provenance: 'GENERATED' } },
    { classification: { ...classification, contentKind: 'BINARY' } },
    { sensitivity: 'SENSITIVE' },
  ];
  for (const variant of variants) {
    const after = state('fingerprint:after', [{ path: 'src/A.java', ...variant }]);
    const changes = detectWorktreeChanges(before, after);
    assert.deepEqual(changes.added, []);
    assert.deepEqual(changes.modified, after.files);
    assert.deepEqual(changes.deleted, []);
    assert.equal(changes.modified[0].id, before.files[0].id);
    assert.equal(changes.baseRevisionId, revisionId);
    assert.equal(changes.baseContentFingerprint, 'fingerprint:before');
  }
});

test('unchanged files are omitted regardless of input ordering or revision fingerprint', () => {
  const before = state('fingerprint:before', [{ path: 'src/Z.java' }, { path: 'src/A.java' }]);
  const after = state('fingerprint:after', [{ path: 'src/A.java' }, { path: 'src/Z.java' }]);
  const changes = detectWorktreeChanges(before, after);
  assert.deepEqual(changes.added, []);
  assert.deepEqual(changes.modified, []);
  assert.deepEqual(changes.deleted, []);
});

test('rename is separate deletion and addition with prior deletion identity', () => {
  const before = state('fingerprint:before', [
    { path: 'src/Z.java', contentFingerprint: 'fingerprint:same' },
    { path: 'src/B.java', contentFingerprint: 'fingerprint:same' },
  ]);
  const after = state('fingerprint:after', [
    { path: 'src/C.java', contentFingerprint: 'fingerprint:same' },
    { path: 'src/A.java', contentFingerprint: 'fingerprint:same' },
  ]);
  const changes = detectWorktreeChanges(before, after);
  assert.deepEqual(
    changes.added.map((file) => file.path),
    ['src/A.java', 'src/C.java'],
  );
  assert.deepEqual(changes.modified, []);
  assert.deepEqual(changes.deleted, [
    {
      id: 'id-src/B.java',
      path: 'src/B.java',
      previousContentFingerprint: 'fingerprint:same',
    },
    {
      id: 'id-src/Z.java',
      path: 'src/Z.java',
      previousContentFingerprint: 'fingerprint:same',
    },
  ]);
  assert.ok(changes.added.every((file) => !changes.deleted.some((old) => old.path === file.path)));
});
