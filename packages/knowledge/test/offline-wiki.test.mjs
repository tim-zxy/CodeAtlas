import test from 'node:test';
import { createHash } from 'node:crypto';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const baseline = JSON.parse(
  readFileSync(new URL('./offline-wiki.expected.json', import.meta.url), 'utf8'),
);
const vectors = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/phase1/knowledge-identity/inputs.json', import.meta.url),
    'utf8',
  ),
).subjects;
const control = (changes = {}) => ({
  maxItems: 1000000,
  maxDepth: 100,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
  ...changes,
});
function fixture() {
  const records = vectors.map((v, i) => {
    const r = structuredClone(v.existing);
    delete r.stateBinding;
    delete r.fingerprintPolicyRef;
    r.itemEnvelope.payload.id = 'item:' + i;
    r.itemEnvelope.payload.publishedRevisionId = 'revision:' + i;
    r.revisionEnvelope.payload.id = 'revision:' + i;
    r.revisionEnvelope.payload.itemId = 'item:' + i;
    return {
      ...r,
      coverage: structuredClone(v.candidate.candidateEnvelope.payload.coverage),
      provenance: {
        attemptId: 'attempt:' + i,
        runId: r.revisionEnvelope.payload.compilationRunId,
        snapshotId: r.revisionEnvelope.payload.inputSnapshotRef.id,
        revisionSetId: r.revisionEnvelope.payload.revisionSetId,
        evaluationId: r.revisionEnvelope.payload.evaluationRef.id,
      },
      currentHeadRevisionId: 'revision:' + i,
      isCurrentHead: true,
      warnings: ['LIVE_SOURCE_NOT_OBSERVED'],
    };
  });
  const request = {
    workspaceId: 'workspace:one',
    repositoryIds: ['repo:one'],
    selectedPublishedRevisionRefs: records.map((r) => ({
      itemId: r.itemEnvelope.payload.id,
      revisionId: r.revisionEnvelope.payload.id,
    })),
    customizationPolicy: 'LOCKED',
    allowPartial: false,
  };
  const knowledge = {
    kind: 'OWNED_TEST_PUBLICATION',
    workspaceId: 'workspace:one',
    selectionDigest: createHash('sha256')
      .update(
        'codeatlas.offline-knowledge.selection.v1\0' +
          canonicalCompilationJson(
            { workspaceId: request.workspaceId, refs: request.selectedPublishedRevisionRefs },
            control(),
          ),
      )
      .digest('hex'),
    records,
    productionQuery: 'NOT_AUTHORIZED',
    quality: 'NOT_EVALUABLE',
  };
  return { request, knowledge };
}
const seal = (f) => {
  f.knowledge.selectionDigest = createHash('sha256')
    .update(
      'codeatlas.offline-knowledge.selection.v1\0' +
        canonicalCompilationJson(
          { workspaceId: f.request.workspaceId, refs: f.request.selectedPublishedRevisionRefs },
          control(),
        ),
    )
    .digest('hex');
  return f;
};
const api = () => import('../dist/offline-wiki.js');
test('fixed profile renders supplied published content with pinned provenance and stable ordering', async () => {
  const { projectOwnedWiki } = await api(),
    f = fixture(),
    before = structuredClone(f),
    r = projectOwnedWiki(f.request, f.knowledge, control());
  assert.equal(r.status, 'COMPLETE');
  assert.equal(r.canMaterialize, true);
  assert.equal(r.profile.profileVersion, baseline.profileVersion);
  assert.equal(r.profile.profileId, baseline.profileId);
  assert.deepEqual(
    r.sections.filter((s) => !s.required).map((s) => s.sectionId),
    baseline.optionalSections,
  );
  assert.equal(r.sections.length, 7);
  assert.deepEqual(
    r.sections.filter((s) => s.required).map((s) => s.sectionId),
    baseline.requiredSections,
  );
  assert.equal(r.productionPublication, 'NOT_AUTHORIZED');
  assert.equal(r.quality, 'NOT_EVALUABLE');
  assert.ok(r.markdown.includes('Item service'));
  assert.equal(r.provenance.knowledgeRevisionRefs.length, 5);
  assert.ok(r.markdown.includes('Phase 1'));
  assert.ok(Object.isFrozen(r));
  assert.deepEqual(f, before);
  const reversed = structuredClone(f);
  reversed.request.selectedPublishedRevisionRefs.reverse();
  reversed.knowledge.records.reverse();
  assert.equal(
    projectOwnedWiki(reversed.request, reversed.knowledge, control()).contentFingerprint,
    r.contentFingerprint,
  );
});
test('required and optional absences retain distinct diagnostics without filler', async () => {
  const { projectOwnedWiki } = await api(),
    f = fixture();
  f.knowledge.records = [];
  f.request.selectedPublishedRevisionRefs = [];
  seal(f);
  let r = projectOwnedWiki(f.request, f.knowledge, control());
  assert.equal(r.status, 'MISSING_DATA');
  assert.equal(r.canMaterialize, false);
  assert.equal(r.diagnostics.filter((x) => x.code === 'REQUIRED_SECTION_MISSING').length, 2);
  assert.equal(r.diagnostics.filter((x) => x.code === 'OPTIONAL_SECTION_MISSING').length, 5);
  const one = fixture();
  one.knowledge.records = one.knowledge.records.slice(0, 1);
  one.request.selectedPublishedRevisionRefs = one.request.selectedPublishedRevisionRefs.slice(0, 1);
  seal(one);
  r = projectOwnedWiki(one.request, one.knowledge, control());
  assert.equal(r.status, 'PARTIAL');
  assert.equal(r.canMaterialize, false);
  one.request.allowPartial = true;
  assert.equal(projectOwnedWiki(one.request, one.knowledge, control()).canMaterialize, true);
});
test('mixed status precedence preserves every diagnosis and partial permission never clears a blocker', async () => {
  const { projectOwnedWiki } = await api(),
    f = fixture();
  f.request.allowPartial = true;
  f.knowledge.records[0].itemEnvelope.payload.sourceFreshness = 'STALE';
  f.knowledge.records[1].coverage = {
    status: 'PARTIAL',
    limitations: ['fixture gap'],
    unverifiedRefs: [],
  };
  let r = projectOwnedWiki(f.request, f.knowledge, control());
  assert.equal(r.status, 'STALE');
  assert.equal(r.canMaterialize, false);
  assert.ok(r.diagnostics.some((d) => d.status === 'PARTIAL'));
  assert.ok(r.diagnostics.some((d) => d.status === 'STALE'));
  f.knowledge.records[2].coverage = {
    status: 'UNSUPPORTED',
    limitations: ['not supported'],
    unverifiedRefs: [],
  };
  r = projectOwnedWiki(f.request, f.knowledge, control());
  assert.equal(r.status, 'MISSING_DATA');
  assert.ok(r.diagnostics.some((d) => d.status === 'STALE'));
  f.knowledge.records[3].itemEnvelope.payload.compilationCurrency = 'OUTDATED_WORKFLOW';
  r = projectOwnedWiki(f.request, f.knowledge, control());
  assert.equal(r.status, 'REVIEW_REQUIRED');
  assert.equal(r.canMaterialize, false);
  for (const status of ['REVIEW_REQUIRED', 'MISSING_DATA', 'STALE', 'PARTIAL'])
    assert.ok(r.diagnostics.some((d) => d.status === status));
});
test('scope, publication, selected membership and provenance cannot be substituted', async () => {
  const { projectOwnedWiki } = await api();
  for (const mutate of [
    (f) => (f.request.repositoryIds = ['repo:other']),
    (f) => (f.knowledge.workspaceId = 'foreign'),
    (f) => (f.knowledge.records[0].revisionEnvelope.payload.publicationState = 'CANDIDATE'),
    (f) => (f.knowledge.records[0].provenance.snapshotId = 'substitute'),
    (f) => f.knowledge.records.pop(),
    (f) => f.knowledge.records.push(f.knowledge.records[0]),
    (f) => (f.knowledge.records[0].itemEnvelope.payload.type = 'CAPABILITY'),
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => projectOwnedWiki(f.request, f.knowledge, control()));
  }
});
test('locked policy and malformed caller data refuse without invoking a getter', async () => {
  const { projectOwnedWiki } = await api();
  const f = fixture();
  f.request.customizationPolicy = 'DECLARATIVE_SPEC';
  assert.throws(() => projectOwnedWiki(f.request, f.knowledge, control()), {
    code: 'WIKI_POLICY_DENIED',
  });
  const g = fixture();
  let called = false;
  Object.defineProperty(g.request, 'allowPartial', {
    enumerable: true,
    get() {
      called = true;
      return true;
    },
  });
  assert.throws(() => projectOwnedWiki(g.request, g.knowledge, control()));
  assert.equal(called, false);
  const abort = new AbortController();
  abort.abort();
  assert.throws(() =>
    projectOwnedWiki(fixture().request, fixture().knowledge, control({ signal: abort.signal })),
  );
  assert.throws(() =>
    projectOwnedWiki(fixture().request, fixture().knowledge, control({ maxItems: 1 })),
  );
});
test('literal Markdown protects caller text and backtick fences', async () => {
  const { projectOwnedWiki } = await api(),
    f = fixture();
  f.knowledge.records[0].revisionEnvelope.payload.structuredContent.title =
    '[click](https://example.invalid) <script>evil</script> ' + String.fromCharCode(96).repeat(4);
  const r = projectOwnedWiki(f.request, f.knowledge, control());
  assert.ok(!r.markdown.includes('### [click]'));
  assert.ok(r.markdown.includes('\\[click\\]'));
  assert.match(r.contentFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(r.status, 'COMPLETE');
});

test('selection digest and consumed workspace/document support basis stay in the selected scope', async () => {
  const { projectOwnedWiki } = await api();
  const bad = fixture();
  bad.knowledge.selectionDigest = '0'.repeat(64);
  assert.throws(() => projectOwnedWiki(bad.request, bad.knowledge, control()), {
    code: 'WIKI_QUERY_MISMATCH',
  });
  for (const document of [false, true]) {
    const f = fixture(),
      r = f.knowledge.records[0];
    const entity = {
      kind: document ? 'DOCUMENT_SECTION' : 'SERVICE',
      id: 'foreign:support',
      revisionId: 'foreign:revision',
    };
    const support = {
      basis: document
        ? {
            documentId: 'foreign:document',
            documentRevisionId: entity.revisionId,
            contentFingerprint: 'foreign:content',
          }
        : {
            workspaceId: 'foreign:workspace',
            revisionSetId: entity.revisionId,
            workspaceActivationDigest: 'a'.repeat(64),
          },
      entity,
      valueDigest: 'b'.repeat(64),
    };
    r.revisionEnvelope.payload.supportRefs.push(support);
    r.referenceContext.availableSupports.push(support);
    r.referenceContext.availableEntities.push({
      scope: 'WORKSPACE',
      workspaceId: 'foreign:workspace',
      entity,
    });
    assert.throws(() => projectOwnedWiki(f.request, f.knowledge, control()), {
      code: 'WIKI_SCOPE_DENIED',
    });
  }
});
