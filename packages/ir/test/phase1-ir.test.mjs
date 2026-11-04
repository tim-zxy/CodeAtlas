import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as ir from '../dist/index.js';
import { discoverFixtures } from '../../evaluation/dist/index.js';
const root = new URL('../../../fixtures/phase1/ir-contract/', import.meta.url);
const vectors = JSON.parse(await readFile(new URL('inputs/vectors.json', root), 'utf8'));
const expected = JSON.parse(await readFile(new URL('expected/contract.json', root), 'utf8'));
const copy = (name) => structuredClone(vectors[name]);
const context = () => copy('referenceContext');
const names = {
  runtime: ['parseRuntimeFactSet', 'codeatlas.runtime-fact-set'],
  flow: ['parseRuntimeFlow', 'codeatlas.runtime-flow'],
  syntax: ['parseSyntaxEvidence', 'codeatlas.syntax-evidence'],
  documents: ['parseDocumentBundle', 'codeatlas.document-bundle'],
  claim: ['parseClaim', 'codeatlas.claim'],
  candidate: ['parseKnowledgeCandidate', 'codeatlas.knowledge-candidate'],
  item: ['parseKnowledgeItem', 'codeatlas.knowledge-item'],
  revision: ['parseKnowledgeRevision', 'codeatlas.knowledge-revision'],
};
function parse(name, payload = copy(name), extra = context()) {
  const [fn, schema] = names[name];
  assert.equal(typeof ir[fn], 'function', 'Missing ' + fn);
  return ir[fn]({ schema, version: 1, payload }, extra);
}
function bad(name, change) {
  const x = copy(name);
  change(x);
  assert.throws(
    () => parse(name, x),
    (e) => e.code === 'IR_VALIDATION_FAILED',
  );
}
for (const name of Object.keys(names))
  test('literal ' + name + ' envelope preserves payload', () =>
    assert.deepEqual(parse(name), { schema: names[name][1], version: 1, payload: vectors[name] }),
  );
test('independent expected schema inventory', () =>
  assert.deepEqual(
    Object.values(names).map((x) => x[1]),
    expected.schemas,
  ));
test('unknown-schema-version-is-refused', () => {
  assert.equal(typeof ir.parseRuntimeFactSet, 'function');
  assert.throws(
    () =>
      ir.parseRuntimeFactSet({
        schema: 'codeatlas.runtime-fact-set',
        version: 2,
        payload: vectors.runtime,
      }),
    (e) => e.code === 'UNSUPPORTED_SCHEMA_VERSION',
  );
});
test('schema mismatch precedes payload validation', () => {
  assert.equal(typeof ir.parseRuntimeFactSet, 'function');
  assert.throws(
    () => ir.parseRuntimeFactSet({ schema: 'other', version: 1, payload: {} }),
    (e) => e.code === 'SCHEMA_MISMATCH',
  );
});
test('cross-basis-support-is-invalid', () =>
  bad('runtime', (x) => (x.entryPoints[0].supportRefs[0].basis.contentFingerprint = 'other')));
test('cross repository owner refused', () =>
  bad('runtime', (x) => (x.entryPoints[0].ownerRef.repositoryId = 'repo:other')));
test('dangling runtime reference refused', () =>
  bad('runtime', (x) => (x.nodes[0].contextRef.entity.id = 'absent')));
test('duplicate runtime identity refused', () =>
  bad('runtime', (x) => x.nodes.push(structuredClone(x.nodes[0]))));
test('runtime-step-without-support-is-invalid', () =>
  bad('flow', (x) => (x.steps[0].supportRefs = [])));
test('missing outgoing flow step refused', () =>
  bad('flow', (x) => (x.steps[0].outgoingStepKeys = ['absent'])));
test('duplicate flow ordinal refused', () =>
  bad('flow', (x) => x.steps.push({ ...structuredClone(x.steps[0]), stepKey: 'step:two' })));
test('business-flow-is-not-execution-fact', () =>
  bad('runtime', (x) => (x.nodes[0].kind = 'BUSINESS_FLOW')));
test('sparse arrays and unknown strict fields refused', () => {
  bad('runtime', (x) => delete x.nodes[0]);
  bad('candidate', (x) => (x.unsafe = 'secret'));
});
test('support absent from supplied inventory refused', () => {
  const c = context();
  c.availableSupports = [];
  assert.throws(
    () => parse('candidate', copy('candidate'), c),
    (e) => e.code === 'IR_VALIDATION_FAILED',
  );
});
test('invented implementation ref refused', () =>
  bad('candidate', (x) => (x.structuredContent.implementationRefs[0].entity.id = 'invented')));
test('candidate cannot declare itself published', () =>
  bad('candidate', (x) => (x.publicationState = 'PUBLISHED')));
test('knowledge type must match content', () =>
  bad('candidate', (x) => (x.type = 'BUSINESS_FLOW')));
test('document cannot use Code source-file range', () =>
  bad('documents', (x) => (x.blocks[0].sourceRange = vectors.runtime.entryPoints[0].sourceRange)));
test('document cross revision and dangling chunk refused', () => {
  bad('documents', (x) => (x.blocks[0].documentRevisionId = 'other'));
  bad('documents', (x) => (x.chunks[0].blockRefs[0].id = 'absent'));
});
test('duplicate section ordinal refused', () =>
  bad('documents', (x) =>
    x.sections.push({ ...structuredClone(x.sections[0]), id: 'section:two' }),
  ));
test('revision document mismatch refused', () =>
  bad('documents', (x) => (x.revision.documentId = 'doc:other')));
test('claim without evidence refused', () => bad('claim', (x) => (x.evidenceRefs = [])));
test('target state remains distinct', () => {
  const x = copy('claim');
  x.stateIntent = 'TARGET';
  assert.equal(parse('claim', x).payload.stateIntent, 'TARGET');
});
test('syntax owner must be known', () => bad('syntax', (x) => (x.owner.entity.id = 'missing')));
test('dynamic syntax value explicit unknown', () => {
  const x = copy('syntax');
  x.payload.arguments[0].value = { kind: 'UNKNOWN', reason: 'DYNAMIC_EXPRESSION' };
  assert.equal(parse('syntax', x).payload.payload.arguments[0].value.kind, 'UNKNOWN');
});
test('syntax payload strict', () => bad('syntax', (x) => (x.payload.extra = 'no')));
test('nullable cannot become undefined', () =>
  bad('runtime', (x) => (x.entryPoints[0].contractRef = undefined)));
test('accessor refused without invoking it', () => {
  const x = copy('candidate');
  let called = false;
  Object.defineProperty(x, 'unsafe', {
    enumerable: true,
    get() {
      called = true;
      throw Error('secret');
    },
  });
  assert.throws(
    () => parse('candidate', x),
    (e) => e.code === 'IR_VALIDATION_FAILED',
  );
  assert.equal(called, false);
});
test('negative zero ordinals and ranges refused', () => {
  bad('flow', (x) => (x.steps[0].ordinal = -0));
  bad('documents', (x) => (x.blocks[0].sourceRange.startLine = -0));
});
test('envelope payload not mutated', () => {
  const x = copy('runtime');
  parse('runtime', x);
  assert.deepEqual(x, vectors.runtime);
});
test('Fixture discovered independently', async () => {
  const [f] = await discoverFixtures(fileURLToPath(root));
  assert.equal(f.manifest.id, 'p1-ir-contract-v1');
});

test('unique participants cannot be simulated by repeating the same ref', () => {
  const x = copy('candidate'),
    c = context();
  const a = {
    scope: 'WORKSPACE',
    workspaceId: 'workspace:one',
    entity: { kind: 'COMPONENT', id: 'component:a' },
  };
  const b = {
    scope: 'WORKSPACE',
    workspaceId: 'workspace:one',
    entity: { kind: 'COMPONENT', id: 'component:b' },
  };
  const match = {
    scope: 'WORKSPACE',
    workspaceId: 'workspace:one',
    entity: { kind: 'CONTRACT_MATCH', id: 'match:one' },
  };
  c.availableEntities.push(a, b, match);
  x.type = 'INTEGRATION';
  x.structuredContent = {
    kind: 'INTEGRATION',
    title: 'Integration',
    summary: 'Two participants',
    participantRefs: [a, b],
    contractMatchRefs: [match],
    boundaryRefs: [],
    limitations: [],
  };
  assert.doesNotThrow(() => parse('candidate', x, c));
  x.structuredContent.participantRefs[1] = a;
  assert.throws(
    () => parse('candidate', x, c),
    (e) => e.code === 'IR_VALIDATION_FAILED',
  );
});
test('parent execution contexts cannot form a cycle', () =>
  bad('runtime', (x) => {
    const second = structuredClone(x.contexts[0]);
    second.id = 'runtime:context:two';
    second.factKey = 'key:context:two';
    second.parentContextRef = structuredClone(vectors.referenceContext.availableEntities[3]);
    x.contexts[0].parentContextRef = {
      scope: 'REPOSITORY',
      repositoryId: 'repo:one',
      entity: { kind: 'EXECUTION_CONTEXT', id: second.id, revisionId: 'revision:worktree' },
    };
    x.contexts.push(second);
  }));
test('edge context must match its source node context', () =>
  bad('runtime', (x) => {
    const second = structuredClone(x.contexts[0]);
    second.id = 'runtime:context:two';
    second.factKey = 'key:context:two';
    x.contexts.push(second);
    x.edges.push({
      ...structuredClone(x.nodes[0]),
      id: 'runtime:edge',
      factKey: 'key:edge',
      contextRef: {
        scope: 'REPOSITORY',
        repositoryId: 'repo:one',
        entity: { kind: 'EXECUTION_CONTEXT', id: second.id, revisionId: 'revision:worktree' },
      },
      sourceRef: vectors.referenceContext.availableEntities[4],
      target: { state: 'RESOLVED', target: vectors.referenceContext.availableEntities[4] },
      transitionKind: 'CALL',
      guard: null,
      boundaryRef: null,
    });
    delete x.edges[0].kind;
    delete x.edges[0].targetRef;
  }));
test('exact syntax reference requires one grounded candidate', () =>
  bad('syntax', (x) => {
    x.payload.arguments[0].value = {
      kind: 'REFERENCE',
      name: 'handler',
      resolution: 'EXACT',
      candidates: [],
    };
  }));
test('new document bundle permits unactivated null pointer', () => {
  const x = copy('documents');
  x.document.currentRevisionId = null;
  assert.equal(parse('documents', x).payload.document.currentRevisionId, null);
});
test('workspace document basis cannot name another document', () =>
  bad('documents', (x) => {
    x.document.repositoryId = null;
    x.revision.sourceBasis = {
      documentId: 'doc:other',
      documentRevisionId: x.revision.id,
      contentFingerprint: x.revision.sourceFingerprint,
    };
  }));
test('active knowledge item needs a published pointer', () =>
  bad('item', (x) => (x.lifecycleState = 'ACTIVE')));

test('known code entity cannot masquerade as a RuntimeFlow support', () => {
  const x = copy('candidate'),
    c = context();
  const service = {
    scope: 'WORKSPACE',
    workspaceId: 'workspace:one',
    entity: { kind: 'SERVICE', id: 'service:one' },
  };
  c.availableEntities.push(service);
  x.type = 'BUSINESS_FLOW';
  x.structuredContent = {
    kind: 'BUSINESS_FLOW',
    title: 'Flow',
    goal: 'Goal',
    participants: [service],
    steps: [{ stepKey: 'step:one', action: 'Act', supportRefs: x.supportRefs, nextStepKeys: [] }],
    runtimeFlowRefs: [vectors.referenceContext.availableEntities[5]],
    limitations: [],
  };
  assert.doesNotThrow(() => parse('candidate', x, c));
  x.structuredContent.runtimeFlowRefs = [vectors.referenceContext.availableEntities[0]];
  assert.throws(
    () => parse('candidate', x, c),
    (e) => e.code === 'IR_VALIDATION_FAILED',
  );
});
test('synchronous CALL cannot silently cross execution contexts', () =>
  bad('runtime', (x) => {
    const c = structuredClone(x.contexts[0]);
    c.id = 'runtime:context:two';
    c.factKey = 'key:context:two';
    x.contexts.push(c);
    const target = structuredClone(x.nodes[0]);
    target.id = 'runtime:node:two';
    target.factKey = 'key:node:two';
    target.contextRef = {
      scope: 'REPOSITORY',
      repositoryId: 'repo:one',
      entity: { kind: 'EXECUTION_CONTEXT', id: c.id, revisionId: 'revision:worktree' },
    };
    x.nodes.push(target);
    const e = {
      ...structuredClone(x.nodes[0]),
      id: 'runtime:edge',
      factKey: 'key:edge',
      sourceRef: vectors.referenceContext.availableEntities[4],
      target: {
        state: 'RESOLVED',
        target: {
          scope: 'REPOSITORY',
          repositoryId: 'repo:one',
          entity: { kind: 'EXECUTION_NODE', id: target.id, revisionId: 'revision:worktree' },
        },
      },
      transitionKind: 'CALL',
      guard: null,
      boundaryRef: null,
    };
    delete e.kind;
    delete e.targetRef;
    x.edges.push(e);
  }));

function workspaceSupportCase() {
  const x = copy('candidate'),
    c = context();
  const a = {
    scope: 'WORKSPACE',
    workspaceId: 'workspace:one',
    entity: { kind: 'COMPONENT', id: 'component:a' },
  };
  const b = {
    scope: 'WORKSPACE',
    workspaceId: 'workspace:one',
    entity: { kind: 'SERVICE', id: 'service:b' },
  };
  const match = {
    scope: 'WORKSPACE',
    workspaceId: 'workspace:one',
    entity: { kind: 'CONTRACT_MATCH', id: 'match:one', revisionId: 'revision-set:one' },
  };
  const support = {
    basis: {
      workspaceId: 'workspace:one',
      revisionSetId: 'revision-set:one',
      workspaceActivationDigest: 'c'.repeat(64),
    },
    entity: match.entity,
    valueDigest: 'd'.repeat(64),
  };
  c.availableEntities.push(a, b, match);
  c.availableSupports.push(support);
  x.type = 'INTEGRATION';
  x.scope = { kind: 'WORKSPACE', workspaceId: 'workspace:one' };
  x.supportRefs = [support];
  x.structuredContent = {
    kind: 'INTEGRATION',
    title: 'Integration',
    summary: 'Matched boundary',
    participantRefs: [a, b],
    contractMatchRefs: [match],
    boundaryRefs: [],
    limitations: [],
  };
  return { x, c };
}
test('workspace contract support is representable without fake repository provenance', () => {
  const { x, c } = workspaceSupportCase();
  assert.doesNotThrow(() => parse('candidate', x, c));
});
test('workspace support cannot cross its owning workspace', () => {
  const { x, c } = workspaceSupportCase();
  assert.doesNotThrow(() => parse('candidate', x, c));
  x.supportRefs[0].basis.workspaceId = 'workspace:other';
  assert.throws(
    () => parse('candidate', x, c),
    (e) => e.code === 'IR_VALIDATION_FAILED',
  );
});
