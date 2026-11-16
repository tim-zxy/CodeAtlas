// Self-owned Source bytes + actual Storage capture. Git transport and semantic facts
// are declared substitutes; this does not authenticate a parser or production quality.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mergeStagedAnalysis } from '../../../providers/dist/index.js';
import { encodeHistoryValue } from '../../../storage/dist/analysis/activation-history-format.js';
import { DatabaseSync } from 'node:sqlite';
import { setup, makeAccount } from '../../../source/test/fixtures/mixed-source-git-double.mjs';
import {
  openR010FixtureDatabase,
  prefixPlan,
  installComponentManifest,
} from '../../../storage/test/helpers/r011-history-fixture.mjs';
import { applyMigrationPlan } from '../../../storage/dist/migrations/runner.js';
import { loadMigrationPlan } from '../../../storage/dist/migrations/manifest.js';
import {
  RepositoryAnalysisStage,
  RepositoryCanonicalFactStore,
} from '../../../storage/dist/index.js';
import { RuntimeFactStore } from '../../../storage/dist/runtime/runtime-fact-store.js';
import { ContractStore } from '../../../storage/dist/runtime/contract-store.js';
import { HistoryReadBudget } from '../../../storage/dist/analysis/activation-history-format.js';
import { reference } from '../../../../fixtures/phase1/code-context-capture/authoring.mjs';
import { prepareCompilationSource } from '../../../application/dist/compilation-source.js';
import { createOwnedCompilationInputPorts } from '../../dist/compilation-input.js';
import { createCompilationInputSnapshot } from '../../../application/dist/compilation-input-contract.js';
import { evaluateCandidateRecord } from '../../../application/dist/evaluation-record.js';
import { OfflinePublicationPreparer } from '../../../application/dist/offline-publication.js';
import { initializeOfflinePublicationStore } from '../../../storage/dist/knowledge/offline-publication-store.js';
import { limits, approve } from '../../../storage/test/helpers/offline-publication-fixture.mjs';

export async function withFreshnessPublication(t, callback) {
  const f = await setup(t),
    workspaceId = 'w',
    repoId = f.request.repositoryId;
  const source = await openR010FixtureDatabase(':memory:', repoId, f.root);
  const sourceDb = source.database;
  const ws = new DatabaseSync(':memory:'),
    offlineDb = new DatabaseSync(':memory:');
  t.after(() => {
    source.close();
    if (ws.isOpen) ws.close();
    if (offlineDb.isOpen) offlineDb.close();
  });
  const policy = {
    operation: 'INDEX',
    phase: 'PRIMARY',
    scope: { workspaceId, repositoryId: repoId },
    callerCapabilities: ['INDEX', 'READ_SOURCE'],
    permissionContext: {
      workspaceId,
      repositoryIds: [repoId],
      allowedOperations: ['INDEX', 'READ_SOURCE'],
    },
    source: {
      path: null,
      classification: 'INTERNAL',
      form: 'DERIVED',
      secretDetected: false,
      policyBlocked: false,
      derivedAccessAllowed: true,
    },
    destination: 'LOCAL',
    settings: {
      localOnly: true,
      remoteLlmEnabled: false,
      remoteEmbeddingEnabled: false,
      allowRemoteFallback: false,
      allowSensitiveRemote: false,
      allowRawSourceRemote: false,
    },
  };
  const prepared = await prepareCompilationSource({
    request: f.request,
    policy,
    sourceState: source.sourceState,
    account: makeAccount(f.control.signal).account,
    control: f.control,
  });
  const state = source.sourceState.load(repoId),
    revision = state.revision,
    files = state.files;
  applyMigrationPlan(sourceDb, await prefixPlan(13));
  const node = {
    id: 'node:owned',
    repositoryId: repoId,
    revisionId: revision.id,
    factKey: 'owned-node',
    kind: 'SYMBOL',
    symbolKind: 'FUNCTION',
    name: 'owned',
    qualifiedName: 'owned',
    sourceRange: {
      sourceFileId: files[0].id,
      startLine: 1,
      startColumn: 0,
      endLine: 1,
      endColumn: 1,
    },
    confidence: { score: 1, method: 'SYNTHETIC_DECLARATION', reasons: ['NOT_PARSER_QUALITY'] },
  };
  const snapshot = {
    id: 'provider:owned',
    repositoryId: repoId,
    providerId: 'owned',
    providerVersion: '1',
    runtimeVersion: '1',
    requestedRevisionId: revision.id,
    requestedRevisionFingerprint: revision.contentFingerprint,
    startedAt: '2026-11-16T00:00:00.000Z',
    completedAt: '2026-11-16T00:00:01.000Z',
    capabilities: [{ name: 'SYMBOL', support: 'SUPPORTED', coverage: 'COMPLETE' }],
    diagnostics: [],
    outcome: 'SUCCEEDED',
  };
  const stage = new RepositoryAnalysisStage(sourceDb);
  for (const file of files) await stage.accept({ type: 'SOURCE_FILE', payload: file });
  await stage.accept({
    type: 'COVERAGE',
    payload: {
      providerSnapshotId: snapshot.id,
      capability: 'SYMBOL',
      sourceFileId: null,
      coverage: 'COMPLETE',
    },
  });
  const provider = { factType: 'NODE', providerId: 'owned', providerFactId: 'declared:owned' };
  stage.putNormalizedNode({ provider, canonical: node });
  mergeStagedAnalysis(stage, snapshot);
  const evidence = [...stage.readMergedRows('EVIDENCE')][0].value;
  const binding = [...stage.readMergedRows('BINDING')][0].value;
  const factEvidence = [...stage.readMergedRows('FACT_EVIDENCE')][0].value;
  const historySupport = {
    factType: 'NODE',
    canonical: node,
    evidence,
    binding,
    factEvidence,
    dependencyUnitIds: ['unit:owned'],
    valueDigest: createHash('sha256')
      .update(
        encodeHistoryValue(
          { kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate: node },
          new HistoryReadBudget(limits),
        ),
      )
      .digest('hex'),
  };
  stage.confirmSucceeded({
    type: 'ANALYSIS_COMPLETED',
    payload: {
      repositoryId: repoId,
      revisionId: revision.id,
      revisionFingerprint: revision.contentFingerprint,
      providerSnapshotId: snapshot.id,
      outcome: 'SUCCEEDED',
      capabilities: snapshot.capabilities,
      counts: { sourceFiles: files.length, nodes: 0, edges: 0, coverage: 1, diagnostics: 0 },
    },
  });
  new RepositoryCanonicalFactStore(sourceDb).applyAnalysisBatch(stage, {
    repositoryId: repoId,
    revisionId: revision.id,
    contentFingerprint: revision.contentFingerprint,
    snapshot,
  });
  stage.close();
  const sample = {
    repository: { id: repoId, rootPath: f.root },
    revision,
    files,
    activeRunIndexes: [0],
    runs: [
      {
        snapshot,
        nodes: [{ provider, canonical: node }],
        edges: [],
        coverage: [{ capability: 'SYMBOL', sourceFileId: null, coverage: 'COMPLETE' }],
      },
    ],
    canonicalNodes: [node],
    canonicalEdges: [],
  };
  const code = reference(sample).view;
  await installComponentManifest(sourceDb, {
    schemaVersion: 1,
    parent: null,
    observation: null,
    transitions: null,
    syntaxMembers: [],
    state: {
      basis: code.activeBasis,
      repositoryLocatorDigest: code.repositoryLocatorDigest,
      inventory: files,
      snapshots: [snapshot],
      contracts: [
        { providerId: 'owned', extractor: '1', normalizer: '1', policy: '1', contract: '1' },
      ],
      units: [
        {
          id: 'unit:owned',
          providerId: 'owned',
          kind: 'PROVIDER_SCOPE',
          sourceFileIds: files.map((f) => f.id).sort(),
        },
      ],
      coverage: [
        {
          unitId: 'unit:owned',
          originSnapshotId: snapshot.id,
          facet: 'SYMBOL',
          coverage: 'COMPLETE',
        },
      ],
      nodes: [node],
      edges: [],
      supports: [historySupport],
      syntaxOrigins: [],
    },
  });
  const repository = new RuntimeFactStore(sourceDb, repoId);
  applyMigrationPlan(
    ws,
    await loadMigrationPlan(
      new URL('../../../storage/migrations/workspace/manifest.json', import.meta.url),
      'WORKSPACE',
    ),
  );
  ws.prepare('INSERT INTO workspace VALUES(1,?,?)').run(workspaceId, f.root);
  ws.prepare('INSERT INTO repositories VALUES(?,?,?)').run(repoId, workspaceId, f.root);
  ws.prepare('INSERT INTO revision_sets VALUES(?,?,0,0)').run('rs', workspaceId);
  ws.prepare('INSERT INTO revision_set_items VALUES(?,?,?,?)').run(
    'rs',
    repoId,
    revision.id,
    revision.contentFingerprint,
  );
  ws.prepare('UPDATE revision_sets SET frozen=1').run();
  const workspaceStore = new ContractStore(ws, workspaceId, [repository]),
    repositories = new Map([[repoId, repository]]);
  const control = () => ({
    maxItems: 1000000,
    maxDepth: 100,
    deadlineEpochMs: Date.now() + 60000,
    signal: f.controller.signal,
  });
  const inputs = createOwnedCompilationInputPorts({
    workspaceStore,
    repositories,
    budget: new HistoryReadBudget(limits),
    control: control(),
    syncCheck: () => undefined,
  });
  const frame = inputs.acquireRepository(repoId),
    ref = frame.capture.entities.find((e) => e.ref.entity.kind === 'CODE_NODE').ref;
  const policyVersions = { securityPolicyRef: 'owned:security', domainPolicyRef: 'owned:domain' };
  const request = {
    schemaVersion: 1,
    workspaceId,
    scope: { kind: 'REPOSITORY', repositoryId: repoId },
    revisionSetId: 'rs',
    repositoryIds: [repoId],
    selectedEntityRefs: frame.capture.entities.map((e) => e.ref),
    selectedDocumentRevisions: [],
    policyVersions,
  };
  const workspace = inputs.acquireWorkspace(request, [frame], false);
  const captured = createCompilationInputSnapshot(
    {
      schemaVersion: 1,
      snapshotId: 'capture:owned',
      workspaceId,
      scope: request.scope,
      revisionSetId: 'rs',
      selection: {
        repositoryIds: [repoId],
        selectedEntityRefs: frame.capture.entities.map((e) => e.ref),
        selectedDocumentRevisions: [],
      },
      repositories: [frame.capture],
      workspaceCapture: null,
      documents: [],
      policyVersions,
      captureWindow: {
        startedAt: '2026-11-16T00:00:00.000Z',
        completedAt: '2026-11-16T00:00:01.000Z',
      },
      coverage: frame.capture.coverage,
    },
    control(),
  );
  inputs.releaseWorkspace(workspace);
  inputs.releaseRepository(frame);
  const support = captured.repositories[0].supports.find((s) => s.ref.entity.id === node.id).ref;
  const candidate = {
    schema: 'codeatlas.knowledge-candidate',
    version: 1,
    payload: {
      id: 'candidate:owned',
      type: 'COMPONENT',
      scope: request.scope,
      importance: 'normal',
      structuredContent: {
        kind: 'COMPONENT',
        title: 'Owned component',
        summary: 'Synthetic declaration',
        implementationRefs: [ref],
        entryPointRefs: [],
        responsibilityClaims: [],
        relationships: [],
      },
      supportRefs: [support],
      inputSnapshotRef: { kind: 'COMPILATION_INPUT_SNAPSHOT', id: captured.snapshotId },
      generationMethod: 'PARSER_GROUNDED',
      coverage: frame.capture.coverage,
      unverifiedRelations: [],
      publicationState: 'CANDIDATE',
    },
  };
  const subject = {
    candidateEnvelope: candidate,
    referenceContext: {
      availableEntities: captured.repositories[0].entities.map((e) => e.ref),
      availableSupports: captured.repositories[0].supports.map((s) => s.ref),
    },
    stateBinding: {
      inputSnapshotRef: candidate.payload.inputSnapshotRef,
      claims: [
        {
          schema: 'codeatlas.claim',
          version: 1,
          payload: {
            id: 'claim:owned',
            subject: ref,
            predicate: 'owned-current',
            value: { kind: 'LITERAL', value: 'synthetic' },
            scope: request.scope,
            stateIntent: 'CURRENT',
            claimKind: 'DECLARED',
            evidenceRefs: [support],
            confidence: { score: 1, method: 'TEST_DECLARATION', reasons: ['NOT_QUALITY'] },
            authority: 'DECLARED',
          },
        },
      ],
    },
  };
  const input = {
    workspaceId,
    runId: 'run:owned',
    subject: { issuerNamespace: 'owned-test', subjectId: 'owned' },
    requestKey: 'owned',
    snapshot: captured,
    candidates: [candidate],
    subjects: [subject],
    evaluation: evaluateCandidateRecord(
      {
        evaluationId: 'eval:owned',
        runId: 'run:owned',
        snapshot: captured,
        candidates: [candidate],
      },
      control(),
    ),
  };
  let store;
  const preparer = new OfflinePublicationPreparer({
    lookup: (subject, key, digest, c) => store.lookup(subject, key, digest, limits, c),
    readState: (c) => store.readState(limits, c),
  });
  store = initializeOfflinePublicationStore(
    offlineDb,
    workspaceId,
    limits,
    control(),
    preparer.identity,
  );
  const ready = await preparer.prepare(input, approve, control());
  assert.equal(ready.status, 'PREPARED');
  const attempt = store.begin(ready.handle, limits, control());
  store.publish(attempt.handle, limits, control());
  const entry = ready.command.entries[0];
  return callback({
    db: offlineDb,
    store,
    workspaceId,
    repositoryIds: [repoId],
    snapshot: captured,
    knowledgeRef: {
      itemId: entry.record.itemEnvelope.payload.id,
      revisionId: entry.record.revisionEnvelope.payload.id,
    },
    control,
    limits,
    permissions: { kind: 'TEST_KNOWLEDGE_READ_NOT_AUTHORITY', check() {} },
    freshness: { ...f, source, prepared, workspaceStore, repositories, policyVersions },
  });
}
