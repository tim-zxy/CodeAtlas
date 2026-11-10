// Owned integration fixture only. Semantic declarations and review remain NOT_EVALUABLE.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { withOwnedStructureFixture, structureControl } from './owned-structure-fixture.mjs';
import {
  createCompilationInputSnapshot,
  compilationCaptureValueDigest,
} from '../../dist/compilation-input-contract.js';
import { evaluateCandidateRecord } from '../../dist/evaluation-record.js';
import { OfflinePublicationPreparer } from '../../dist/offline-publication.js';
import { initializeOfflinePublicationStore } from '../../../storage/dist/knowledge/offline-publication-store.js';
import { limits, approve } from '../../../storage/test/helpers/offline-publication-fixture.mjs';
import { canonicalRuntimeJson } from '../../../ir/dist/index.js';

export async function withOwnedBusinessPublication(t, callback) {
  return withOwnedStructureFixture(t, async (runtimeSeed) => {
    const workspaceId = 'w',
      revisionSetId = 'owned-business:revision-set',
      snapshotId = 'owned-business:snapshot';
    const control = () => structureControl();
    const basis = runtimeSeed.snapshot.identity.codeBasis;
    const rr = (kind, id) => ({
      scope: 'REPOSITORY',
      repositoryId: basis.repositoryId,
      entity: { kind, id, revisionId: basis.revisionId },
    });
    const sourceFiles = runtimeSeed.expected.targetInventory;
    const codeNodes = runtimeSeed.expected.history.state.nodes;
    const supports = [
      ...sourceFiles.map((value) => ['SourceFile@1', 'SOURCE_FILE', value]),
      ...codeNodes.map((value) => ['CanonicalNode@1', 'CODE_NODE', value]),
    ].map(([valueSchemaRef, kind, value]) => ({
      ref: {
        basis,
        entity: rr(kind, value.id).entity,
        valueDigest: createHash('sha256')
          .update('codeatlas-phase1-support-value-v1\0' + canonicalRuntimeJson(value))
          .digest('hex'),
      },
      valueSchemaRef,
      value,
      capturedValueDigest: compilationCaptureValueDigest(valueSchemaRef, value, control()),
    }));
    const facts = runtimeSeed.candidate.facts.payload;
    const groups = [
      ['entryPoints', 'EntryPoint@1', 'ENTRY_POINT'],
      ['tasks', 'TaskDefinition@1', 'TASK_DEFINITION'],
      ['dataResources', 'DataResource@1', 'DATA_RESOURCE'],
      ['triggers', 'DataChangeTrigger@1', 'DATA_CHANGE_TRIGGER'],
      ['contracts', 'Contract@1', 'CONTRACT'],
      ['contexts', 'ExecutionContext@1', 'EXECUTION_CONTEXT'],
      ['nodes', 'ExecutionNode@1', 'EXECUTION_NODE'],
      ['edges', 'ExecutionEdge@1', 'EXECUTION_EDGE'],
      ['flows', 'RuntimeFlow@1', 'RUNTIME_FLOW'],
    ];
    const entities = groups.flatMap(([group, valueSchemaRef, kind]) =>
      facts[group].map((value) => ({ ref: rr(kind, value.id), valueSchemaRef, value })),
    );
    for (const value of runtimeSeed.expected.history.state.edges ?? [])
      entities.push({ ref: rr('CODE_EDGE', value.id), valueSchemaRef: 'CanonicalEdge@1', value });
    const serviceRef = {
      scope: 'WORKSPACE',
      workspaceId,
      entity: { kind: 'SERVICE', id: 'owned-business:service', revisionId: revisionSetId },
    };
    const service = {
      id: serviceRef.entity.id,
      factKey: 'owned-business:service-key',
      logicalServiceKey: 'owned-business:declared-service',
      location: 'WORKSPACE',
      repositoryRef: rr('REPOSITORY', basis.repositoryId),
      supportRefs: [supports[0].ref],
    };
    const coverage = {
      status: 'PARTIAL',
      limitations: ['OWNED_DECLARATION_NOT_OBSERVED_EXECUTION'],
      unverifiedRefs: [],
    };
    const rawSnapshotInput = {
      schemaVersion: 1,
      snapshotId,
      workspaceId,
      scope: { kind: 'WORKSPACE', workspaceId },
      revisionSetId,
      selection: {
        repositoryIds: [basis.repositoryId],
        selectedEntityRefs: [
          ...entities.map((e) => e.ref),
          ...supports.map((s) => rr(s.ref.entity.kind, s.ref.entity.id)),
          serviceRef,
        ],
        selectedDocumentRevisions: [],
      },
      repositories: [
        {
          repoBasis: basis,
          runtimeActivationDigest: runtimeSeed.snapshot.identity.candidateDigest,
          entities,
          supports,
          coverage,
        },
      ],
      workspaceCapture: {
        workspaceBasis: {
          workspaceId,
          revisionSetId,
          workspaceActivationDigest: createHash('sha256')
            .update(canonicalRuntimeJson(service))
            .digest('hex'),
        },
        entities: [{ ref: serviceRef, valueSchemaRef: 'Service@1', value: service }],
        supports: [],
        coverage,
      },
      documents: [],
      policyVersions: {
        securityPolicyRef: 'owned-business:security',
        domainPolicyRef: 'owned-business:domain',
      },
      captureWindow: {
        startedAt: '2026-11-10T00:00:00.000Z',
        completedAt: '2026-11-10T00:00:01.000Z',
      },
      coverage,
    };
    const snapshot = createCompilationInputSnapshot(rawSnapshotInput, control());
    const flow = facts.flows[0],
      candidate = {
        schema: 'codeatlas.knowledge-candidate',
        version: 1,
        payload: {
          id: 'owned-business:candidate',
          type: 'BUSINESS_FLOW',
          scope: snapshot.scope,
          importance: 'normal',
          structuredContent: {
            kind: 'BUSINESS_FLOW',
            title: 'Owned declared business path',
            goal: 'Traverse declared owned steps',
            participants: [serviceRef],
            steps: flow.steps.map((s) => ({
              stepKey: s.stepKey,
              action: 'Owned declared action ' + s.stepKey,
              supportRefs: s.supportRefs,
              nextStepKeys: s.outgoingStepKeys,
            })),
            runtimeFlowRefs: [rr('RUNTIME_FLOW', flow.id)],
            limitations: ['SYNTHETIC_SEMANTIC_DECLARATION_NOT_MODEL_QUALITY'],
          },
          supportRefs: facts.supportInventory,
          inputSnapshotRef: { kind: 'COMPILATION_INPUT_SNAPSHOT', id: snapshot.snapshotId },
          generationMethod: 'PARSER_GROUNDED',
          coverage,
          unverifiedRelations: [],
          publicationState: 'CANDIDATE',
        },
      };
    const referenceContext = {
      availableEntities: [
        ...snapshot.repositories.flatMap((r) => r.entities.map((e) => e.ref)),
        ...supports.map((s) => rr(s.ref.entity.kind, s.ref.entity.id)),
        serviceRef,
      ],
      availableSupports: supports.map((s) => s.ref),
    };
    const stateBinding = {
      inputSnapshotRef: candidate.payload.inputSnapshotRef,
      claims: [
        {
          schema: 'codeatlas.claim',
          version: 1,
          payload: {
            id: 'owned-business:state',
            subject: serviceRef,
            predicate: 'owned-test-declares-current',
            value: { kind: 'LITERAL', value: 'synthetic current declaration' },
            scope: snapshot.scope,
            stateIntent: 'CURRENT',
            claimKind: 'DECLARED',
            evidenceRefs: [supports[0].ref],
            confidence: {
              score: 1,
              method: 'TEST_DECLARATION',
              reasons: ['SYNTHETIC_NOT_AUTHORITY'],
            },
            authority: 'DECLARED',
          },
        },
      ],
    };
    const input = {
      workspaceId,
      runId: 'owned-business:run',
      subject: { issuerNamespace: 'owned-test', subjectId: 'owned-business' },
      requestKey: 'owned-business:request',
      snapshot,
      candidates: [candidate],
      subjects: [{ candidateEnvelope: candidate, referenceContext, stateBinding }],
      evaluation: evaluateCandidateRecord(
        {
          evaluationId: 'owned-business:eval',
          runId: 'owned-business:run',
          snapshot,
          candidates: [candidate],
        },
        control(),
      ),
    };
    const db = new DatabaseSync(':memory:');
    let store;
    const preparer = new OfflinePublicationPreparer({
      lookup: (subject, key, digest, c) => store.lookup(subject, key, digest, limits, c),
      readState: (c) => store.readState(limits, c),
    });
    try {
      store = initializeOfflinePublicationStore(
        db,
        workspaceId,
        limits,
        control(),
        preparer.identity,
      );
      const ready = await preparer.prepare(input, approve, control());
      assert.equal(ready.status, 'PREPARED');
      const attempt = store.begin(ready.handle, limits, control());
      const publication = store.publish(attempt.handle, limits, control());
      assert.equal(publication.status, 'COMMITTED');
      assert.equal(publication.cleanupState, 'SETTLED');
      const selected = ready.command.entries[0].record;
      const knowledgeRef = {
        itemId: selected.itemEnvelope.payload.id,
        revisionId: selected.revisionEnvelope.payload.id,
      };
      let denied = false;
      const permissions = {
        kind: 'TEST_KNOWLEDGE_READ_NOT_AUTHORITY',
        check() {
          if (denied) throw Error('OWNED_READ_DENIED');
        },
      };
      const readKnowledge = async (request, c) => {
        assert.equal(request.workspaceId, workspaceId);
        assert.deepEqual(request.repositoryIds, [basis.repositoryId]);
        return store.readPublishedKnowledge(
          request.selectedPublishedRevisionRefs,
          permissions,
          limits,
          c,
        );
      };
      const history = () =>
        ['offline_attempts', 'offline_revisions', 'offline_receipts', 'offline_heads'].map(
          (table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
        );
      const startStepKey = flow.steps[0].stepKey;
      return await callback({
        db,
        store,
        knowledgeRef,
        workspaceId,
        repositoryIds: [basis.repositoryId],
        startStepKey,
        control,
        limits,
        publication,
        snapshot,
        rawSnapshotInput,
        runtimeSeed,
        expectedStepKeys: ['step:one', 'step:three', 'step:two'],
        runtimeFlowId: flow.id,
        permissions,
        readKnowledge,
        history,
        setDenied(value) {
          denied = value;
        },
        traceRequest: () => ({
          kind: 'BUSINESS',
          workspaceId,
          repositoryIds: [basis.repositoryId],
          knowledgeRef,
          startStepKey,
          direction: 'FORWARD',
          maxDepth: 10,
          maxSteps: 20,
          maxEdges: 20,
          maxResultBytes: 1000000,
        }),
      });
    } finally {
      if (db.isOpen) db.close();
    }
  });
}
