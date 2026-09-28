import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CanonicalNodeSchema } from '../../ir/dist/index.js';
import { CanonicalNormalizationError, normalizeJavaNode } from '../dist/java-node-normalizer.js';

const confidence = { score: 1, method: 'parser', reasons: [] };
const range = {
  sourceFileId: 'file-A.java',
  startLine: 3,
  startColumn: 6,
  endLine: 3,
  endColumn: 7,
};
const sourceFiles = new Map([
  [
    'file-A.java',
    {
      id: 'file-A.java',
      repositoryId: 'repo-fixture',
      revisionId: 'rev-fixture',
      path: 'src/A.java',
      contentFingerprint: 'sha256:source-A',
      classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
      languageHint: 'java',
      sensitivity: 'PUBLIC',
    },
  ],
]);

function providerNode(providerKind, overrides = {}) {
  return {
    providerId: 'native',
    providerFactId: 'fact-a',
    providerSnapshotId: 'snapshot-fixture',
    repositoryId: 'repo-fixture',
    revisionId: 'rev-fixture',
    providerKind,
    name: 'A',
    qualifiedName: 'demo.A',
    sourceRange: range,
    confidence,
    ...overrides,
  };
}

function failure(code, path) {
  return (error) =>
    error instanceof CanonicalNormalizationError &&
    error.code === code &&
    JSON.stringify(error.path) === JSON.stringify(path);
}

test('package declaration and synthetic container retain separate support with one identity', () => {
  const declaration = normalizeJavaNode(
    providerNode('java.package', { name: 'demo', qualifiedName: 'demo' }),
    sourceFiles,
  );
  const container = normalizeJavaNode(
    providerNode('java.package_container', {
      providerFactId: 'package-container',
      name: 'demo',
      qualifiedName: 'demo',
      sourceRange: null,
    }),
    sourceFiles,
  );
  assert.equal(declaration.kind, 'PACKAGE');
  assert.equal(declaration.factKey, container.factKey);
  assert.equal(declaration.id, container.id);
  assert.deepEqual(declaration.sourceRange, range);
  assert.equal(container.sourceRange, null);
  CanonicalNodeSchema.parse(declaration);
  CanonicalNodeSchema.parse(container);
});

test('compilation unit is a file-scoped MODULE, not a build-system module', () => {
  const module = normalizeJavaNode(
    providerNode('java.compilation_unit', {
      name: 'src/A.java',
      qualifiedName: 'src/A.java',
      sourceRange: null,
    }),
    sourceFiles,
  );
  assert.equal(module.kind, 'MODULE');
  assert.equal(module.name, 'src/A.java');
  assert.equal(module.qualifiedName, 'src/A.java');
  assert.equal(module.sourceRange, null);
  CanonicalNodeSchema.parse(module);
});

test('Java type and symbol kinds map to strict language-neutral subkinds', () => {
  const examples = [
    ['java.class', 'TYPE', 'typeKind', 'CLASS'],
    ['java.interface', 'TYPE', 'typeKind', 'INTERFACE'],
    ['java.method', 'SYMBOL', 'symbolKind', 'METHOD'],
    ['java.constructor', 'SYMBOL', 'symbolKind', 'CONSTRUCTOR'],
    ['java.field', 'SYMBOL', 'symbolKind', 'FIELD'],
  ];
  for (const [providerKind, kind, subkindField, subkind] of examples) {
    const canonical = normalizeJavaNode(providerNode(providerKind), sourceFiles);
    assert.equal(canonical.kind, kind);
    assert.equal(canonical[subkindField], subkind);
    assert.deepEqual(canonical.confidence, confidence);
    CanonicalNodeSchema.parse(canonical);
  }
});

test('same-name overloads keep distinct source-grounded keys but Provider identity is irrelevant', () => {
  const first = normalizeJavaNode(providerNode('java.method'), sourceFiles);
  const moved = normalizeJavaNode(
    providerNode('java.method', {
      sourceRange: { ...range, startLine: 4, endLine: 4 },
    }),
    sourceFiles,
  );
  const otherProvider = normalizeJavaNode(
    providerNode('java.method', {
      providerId: 'secondary',
      providerFactId: 'other-id',
      providerSnapshotId: 'other-snapshot',
    }),
    sourceFiles,
  );
  assert.notEqual(first.factKey, moved.factKey);
  assert.equal(first.factKey, otherProvider.factKey);
  assert.equal(first.id, otherProvider.id);
});

test('unknown Java kind and missing required source facts fail with controlled paths', () => {
  assert.throws(
    () => normalizeJavaNode(providerNode('java.record'), sourceFiles),
    failure('UNSUPPORTED_KIND', ['providerKind']),
  );
  assert.throws(
    () => normalizeJavaNode(providerNode('java.method', { qualifiedName: null }), sourceFiles),
    failure('INVALID_FACT', ['qualifiedName']),
  );
  assert.throws(
    () =>
      normalizeJavaNode(providerNode('java.method', { qualifiedName: ' demo.A ' }), sourceFiles),
    failure('INVALID_FACT', ['qualifiedName']),
  );
  assert.throws(
    () =>
      normalizeJavaNode(
        providerNode('java.package_container', {
          qualifiedName: 'demo.\ud800',
          sourceRange: null,
        }),
        sourceFiles,
      ),
    failure('INVALID_FACT', ['qualifiedName']),
  );
  assert.throws(
    () => normalizeJavaNode(providerNode('java.method', { sourceRange: null }), sourceFiles),
    failure('INVALID_FACT', ['sourceRange']),
  );
  assert.throws(
    () => normalizeJavaNode(providerNode('java.package_container'), sourceFiles),
    failure('INVALID_FACT', ['sourceRange']),
  );
  assert.throws(
    () =>
      normalizeJavaNode(
        providerNode('java.method', { sourceRange: { ...range, endLine: 2 } }),
        sourceFiles,
      ),
    failure('INVALID_FACT', ['sourceRange', 'endLine']),
  );
});

test('source location must refer to the requested repository revision', () => {
  assert.throws(
    () =>
      normalizeJavaNode(
        providerNode('java.class', {
          sourceRange: { ...range, sourceFileId: 'absent' },
        }),
        sourceFiles,
      ),
    failure('MISSING_REFERENCE', ['sourceRange', 'sourceFileId']),
  );
  const crossRevision = new Map([
    ['file-A.java', { ...sourceFiles.get('file-A.java'), revisionId: 'other-rev' }],
  ]);
  assert.throws(
    () => normalizeJavaNode(providerNode('java.class'), crossRevision),
    failure('INVALID_CONTEXT', ['sourceRange', 'sourceFileId']),
  );
  assert.throws(
    () =>
      normalizeJavaNode(
        providerNode('java.compilation_unit', {
          name: 'src/Missing.java',
          qualifiedName: 'src/Missing.java',
          sourceRange: null,
        }),
        sourceFiles,
      ),
    failure('MISSING_REFERENCE', ['qualifiedName']),
  );
});
