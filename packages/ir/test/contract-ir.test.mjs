import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as ir from '../dist/index.js';
const v = JSON.parse(
  readFileSync(new URL('../../../fixtures/phase1/contract-matching/inputs.json', import.meta.url)),
);
const e = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/phase1/contract-matching/expected.json', import.meta.url),
  ),
);
const copy = (x) => structuredClone(x);
test('binding candidate strict closure and supplied domain target', () => {
  assert.equal(typeof ir.parseFrameworkBindingSet, 'function');
  const out = ir.parseFrameworkBindingSet(v.bindings, v.runtime);
  assert.deepEqual(out, v.bindings);
});
for (const match of v.matches)
  test('contract match ' + match.payload.status, () => {
    assert.equal(typeof ir.parseContractMatch, 'function');
    assert.deepEqual(ir.parseContractMatch(match, v.context), match);
  });
test('workspace execution keeps repository runtime reference', () => {
  assert.equal(typeof ir.parseWorkspaceExecution, 'function');
  assert.deepEqual(ir.parseWorkspaceExecution(v.workspace, v.context), v.workspace);
  assert.equal(v.workspace.payload.nodes[0].repositoryRuntimeRef.entity.id, e.nodeRef);
});
test('binding rejects foreign owner, basis, wrong target and same ID conflicts', () => {
  assert.equal(typeof ir.parseFrameworkBindingSet, 'function');
  for (const change of [
    (x) => (x.payload.bindings[0].ownerRef.repositoryId = 'foreign'),
    (x) => (x.payload.bindings[0].basis.codeActivationDigest = 'f'.repeat(64)),
    (x) => (x.payload.bindings[0].contractRef.entity.kind = 'CODE_NODE'),
    (x) => x.payload.bindings.push({ ...x.payload.bindings[0], factKey: 'other' }),
    (x) => (x.payload.bindings[0].supportRefs[0].valueDigest = 'f'.repeat(64)),
    (x) => (x.payload.bindings[0].sourceRange.sourceFileId = 'foreign'),
  ]) {
    const x = copy(v.bindings);
    change(x);
    assert.throws(() => ir.parseFrameworkBindingSet(x, v.runtime));
  }
});
test('match selection and reference closure cannot be claimed by status alone', () => {
  assert.equal(typeof ir.parseContractMatch, 'function');
  for (const change of [
    (x) => (x.payload.selectedProviderRef = null),
    (x) => (x.payload.status = 'UNRESOLVED'),
    (x) => x.payload.candidateProviderRefs.push(v.matches[1].payload.candidateProviderRefs[1]),
    (x) => (x.payload.consumerRef.repositoryId = 'foreign'),
    (x) => (x.payload.basisRefs[0].codeActivationDigest = 'f'.repeat(64)),
    (x) => (x.payload.supportRefs[0].valueDigest = 'f'.repeat(64)),
  ]) {
    const x = copy(v.matches[0]);
    change(x);
    assert.throws(() => ir.parseContractMatch(x, v.context));
  }
});
test('workspace refuses dangling edges, foreign frozen basis and duplicate entity IDs', () => {
  assert.equal(typeof ir.parseWorkspaceExecution, 'function');
  for (const change of [
    (x) => (x.payload.nodes[0].repositoryRuntimeRef.repositoryId = 'foreign'),
    (x) => (x.payload.repositoryBindings[0].repoBasis.revisionId = 'other'),
    (x) => x.payload.nodes.push(copy(x.payload.nodes[0])),
    (x) => (x.payload.supportInventory[0].basis.codeActivationDigest = 'f'.repeat(64)),
  ]) {
    const x = copy(v.workspace);
    change(x);
    assert.throws(() => ir.parseWorkspaceExecution(x, v.context));
  }
});
test('new version boundaries never widen Runtime v1', () => {
  assert.equal(typeof ir.parseContractMatch, 'function');
  assert.throws(() => ir.parseContractMatch({ ...v.matches[0], version: 2 }, v.context), {
    code: 'UNSUPPORTED_SCHEMA_VERSION',
  });
  assert.throws(() => ir.parseRuntimeFactSet(v.workspace), { code: 'SCHEMA_MISMATCH' });
  assert.throws(() =>
    ir.parseContractMatch(
      { ...v.matches[0], payload: { ...v.matches[0].payload, extra: true } },
      v.context,
    ),
  );
});

test('binding targets must be actual candidate domain entities, not external ref placeholders', () => {
  for (const [kind, field, targetKind] of [
    ['DATA_READ', 'resourceRef', 'DATA_RESOURCE'],
    ['TASK_CREATE', 'taskRef', 'TASK_DEFINITION'],
  ]) {
    const x = copy(v.bindings),
      runtime = copy(v.runtime),
      b = x.payload.bindings[0];
    b.kind = kind;
    delete b.contractRef;
    b[field] = {
      scope: 'REPOSITORY',
      repositoryId: runtime.payload.basis.repositoryId,
      entity: {
        kind: targetKind,
        id: 'external:placeholder',
        revisionId: runtime.payload.basis.revisionId,
      },
    };
    runtime.payload.externalRefs.push(b[field]);
    x.payload.externalRefs.push(b[field]);
    assert.throws(() => ir.parseFrameworkBindingSet(x, runtime));
  }
});
