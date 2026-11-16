import { randomUUID } from 'node:crypto';
import {
  issueReceiptWikiArtifact,
  parseReceiptWikiArtifact,
  receiptWikiDigest,
  historicalReceiptWikiMarkdown,
  type ReceiptWikiArtifact,
} from '../../ir/dist/receipt-wiki-artifact-contract.js';
export type { RuntimeRequestControl } from '@codeatlas/ir';
export { parseOwnedWikiRequest } from '../../knowledge/dist/offline-wiki.js';
import { types } from 'node:util';
import type { RuntimeRequestControl } from '@codeatlas/ir';
import {
  canonicalCompilationJson,
  parseCompilationInputSnapshot,
  type CompilationInputSnapshot,
} from './compilation-input-contract.js';
import { publicationDigest } from '../../ir/dist/offline-publication-contract.js';
import {
  issueOwnedFreshnessCommand,
  releaseOwnedFreshnessCommand,
} from '../../ir/dist/owned-freshness-contract.js';
import {
  verifyCompilationSource,
  releaseCompilationSource,
  type CompilationSourceIdentity,
} from './compilation-source.js';
import { parseOwnedWikiRequest } from '../../knowledge/dist/offline-wiki.js';
import { projectSchema11Wiki } from './offline-wiki.js';
import type {
  RepositoryCapture,
  WorkspaceCapture,
  CompilationCaptureRequest,
} from './compilation-input-contract.js';
import type { CompilationSelectionView } from './capture-compilation-input.js';

type RepoFrame = { handle: object; capture: RepositoryCapture };
type WorkspaceFrame = {
  handle: object;
  selection: CompilationSelectionView;
  workspaceCapture: WorkspaceCapture | null;
  documents: unknown[];
};
export class OwnedFreshnessError extends Error {
  constructor(
    readonly code: string,
    readonly commitState: 'NOT_ATTEMPTED' | 'COMMITTED' | 'UNKNOWN',
    readonly cleanupState: 'SETTLED' | 'UNKNOWN',
  ) {
    super(code);
  }
}
type CompletedObservation = {
  source: ReceiptWikiArtifact['source'];
  startedAt: string;
  completedAt: string;
  basisDigest: string;
};
const completedObservations = new WeakMap<object, CompletedObservation>();
const preparedObservationArtifacts = new WeakMap<object, ReceiptWikiArtifact>();
/** Only genuine completed operations; files preserve history, not an executable observation. */
export class ReceiptWikiArtifactPreparer {
  readonly identity = Object.freeze({});
  prepare(result: object, c: RuntimeRequestControl) {
    const observed =
      result && !types.isProxy(result) ? completedObservations.get(result) : undefined;
    if (!observed) throw Error('RECEIPT_WIKI_OBSERVATION_UNAVAILABLE');
    let artifact = preparedObservationArtifacts.get(result);
    if (!artifact) {
      const projection = (result as { projection: Record<string, unknown> }).projection;
      const profile = projection.profile as { specId: string };
      artifact = parseReceiptWikiArtifact(
        {
          kind: 'SCHEMA11_RECEIPT_WIKI_ARTIFACT',
          version: 2,
          artifactId: receiptWikiDigest(
            'codeatlas.receipt-wiki.artifact.v2',
            {
              workspaceId: observed.source.workspaceId,
              repositoryIds: observed.source.repositoryIds,
              specId: profile.specId,
              audience: 'OWNED_RECEIPT_HISTORICAL',
            },
            c,
          ),
          artifactRevisionId: randomUUID(),
          createdAt: new Date().toISOString(),
          projection,
          markdown: historicalReceiptWikiMarkdown(projection.markdown as string),
          source: observed.source,
          observation: {
            ruleVersion: 'owned-one-shot-freshness@1',
            scope: 'SELECTED_CAPTURED_BASES_ONLY',
            state: 'HISTORICAL_MATCHED_WINDOW',
            validity: 'ENDED',
            currentFreshness: 'UNASSESSED',
            startedAt: observed.startedAt,
            completedAt: observed.completedAt,
            basisDigest: observed.basisDigest,
            sourceDigest: receiptWikiDigest('codeatlas.receipt-wiki.source.v2', observed.source, c),
            projectionDigest: receiptWikiDigest(
              'codeatlas.receipt-wiki.projection.v2',
              projection,
              c,
            ),
          },
        },
        c,
      );
      preparedObservationArtifacts.set(result, artifact);
    }
    return Object.freeze({ handle: issueReceiptWikiArtifact(this.identity, artifact, c) });
  }
}
/** Trusted composition seams only. Runtime supplies genuine Store/Source owners.
 * Borrowed Source/capture owners and the anonymous memory connection are transferred for this one operation. */
export async function reconcileOwnedFreshnessWiki(
  requestInput: unknown,
  ports: {
    issuer: object;
    workspaceId: string;
    sources: ReadonlyMap<string, object>;
    assertPermission: () => unknown;
    currentPolicyVersions: () => unknown;
    readBasis: () => { projection: unknown; snapshots: unknown[] };
    reconcile: (handle: object) => { commitState: 'COMMITTED' };
    read: (
      refs: readonly { itemId: string; revisionId: string }[],
      c: RuntimeRequestControl,
    ) => Promise<unknown>;
    inputs: {
      acquireRepository: (id: string) => RepoFrame;
      acquireWorkspace: (
        request: CompilationCaptureRequest,
        frames: readonly RepoFrame[],
        includeRuntime: boolean,
      ) => WorkspaceFrame;
      repositorySourceIdentity: (frame: RepoFrame) => CompilationSourceIdentity;
      recheckRepository: (frame: RepoFrame) => void;
      recheckWorkspace: (frame: WorkspaceFrame) => void;
      releaseRepository: (frame: RepoFrame) => void;
      releaseWorkspace: (frame: WorkspaceFrame) => void;
    };
    close: () => void;
  },
  c: RuntimeRequestControl,
) {
  const observationStartedAt = new Date().toISOString();
  let completedObservation: CompletedObservation | undefined;
  let live = true,
    command: object | undefined;
  let commitState: 'NOT_ATTEMPTED' | 'COMMITTED' | 'UNKNOWN' = 'NOT_ATTEMPTED';
  let cleanupState: 'SETTLED' | 'UNKNOWN' = 'SETTLED';
  const frames: RepoFrame[] = [],
    workspaces: WorkspaceFrame[] = [];
  const sources = new Map(ports.sources);
  const json = (v: unknown) => canonicalCompilationJson(v, c);
  const need = (v: unknown, code = 'FRESHNESS_BASIS_MISMATCH') => {
    if (!v) throw Error(code);
  };
  const check = () => {
    need(live, 'FRESHNESS_HANDLE_UNAVAILABLE');
    json(null);
    const value = ports.assertPermission();
    if (types.isPromise(value)) void value.catch(() => undefined);
    need(value === undefined, 'FRESHNESS_PERMISSION_INVALID');
  };
  let result: Awaited<ReturnType<typeof projectSchema11Wiki>> | undefined;
  let admittedPolicies: unknown[] = [];
  let failure: unknown;
  try {
    check();
    const request = parseOwnedWikiRequest(requestInput, c);
    need(
      request.workspaceId === ports.workspaceId && request.selectedPublishedRevisionRefs.length > 0,
      'FRESHNESS_SCOPE_DENIED',
    );
    const basis = JSON.parse(json(ports.readBasis())) as ReturnType<typeof ports.readBasis>;
    const snapshots = basis.snapshots.map((s) => parseCompilationInputSnapshot(s, c));
    admittedPolicies = snapshots.map((s) => s.policyVersions);
    const repositories = new Map<string, RepoFrame>();
    for (const snapshot of snapshots) {
      need(
        snapshot.workspaceId === request.workspaceId &&
          snapshot.documents.length === 0 &&
          snapshot.selection.selectedDocumentRevisions.length === 0,
        'FRESHNESS_DOCUMENT_UNAVAILABLE',
      );
      need(
        json(ports.currentPolicyVersions()) === json(snapshot.policyVersions),
        'FRESHNESS_POLICY_CHANGED',
      );
      need(
        snapshot.selection.repositoryIds.every((id) => request.repositoryIds.includes(id)),
        'FRESHNESS_SCOPE_DENIED',
      );
      for (const captured of snapshot.repositories) {
        const id = captured.repoBasis.repositoryId;
        if (!repositories.has(id)) {
          check();
          const frame = ports.inputs.acquireRepository(id);
          frames.push(frame);
          repositories.set(id, frame);
        }
        const actual = repositories.get(id)!.capture;
        need(
          json(actual.repoBasis) === json(captured.repoBasis) &&
            actual.runtimeActivationDigest === captured.runtimeActivationDigest,
        );
        compareInventory(captured, actual);
      }
      const captureRequest: CompilationCaptureRequest = {
        schemaVersion: 1,
        workspaceId: snapshot.workspaceId,
        scope: snapshot.scope,
        revisionSetId: snapshot.revisionSetId,
        repositoryIds: snapshot.selection.repositoryIds,
        selectedEntityRefs: snapshot.selection.selectedEntityRefs,
        selectedDocumentRevisions: [],
        policyVersions: snapshot.policyVersions,
      };
      const workspace = ports.inputs.acquireWorkspace(
        captureRequest,
        snapshot.repositories.map((r) => repositories.get(r.repoBasis.repositoryId)!),
        snapshot.workspaceCapture !== null,
      );
      workspaces.push(workspace);
      need(
        workspace.selection.workspaceId === snapshot.workspaceId &&
          workspace.selection.revisionSetId === snapshot.revisionSetId &&
          workspace.documents.length === 0,
      );
      for (const r of snapshot.repositories) {
        need(
          workspace.selection.revisionSetEntries.some(
            (v) =>
              v.repositoryId === r.repoBasis.repositoryId &&
              v.revisionId === r.repoBasis.revisionId &&
              v.revisionFingerprint === r.repoBasis.contentFingerprint,
          ),
        );
      }
      if (snapshot.workspaceCapture) {
        need(
          workspace.workspaceCapture &&
            json(snapshot.workspaceCapture.workspaceBasis) ===
              json(workspace.workspaceCapture.workspaceBasis),
        );
        compareInventory(snapshot.workspaceCapture, workspace.workspaceCapture!);
        need(
          json(snapshot.workspaceCapture.contractBindings ?? []) ===
            json(workspace.workspaceCapture!.contractBindings ?? []),
        );
      }
    }
    need(
      repositories.size === request.repositoryIds.length && snapshots.length > 0,
      'FRESHNESS_SCOPE_DENIED',
    );
    async function observe() {
      check();
      for (const snapshot of snapshots)
        need(
          json(ports.currentPolicyVersions()) === json(snapshot.policyVersions),
          'FRESHNESS_POLICY_CHANGED',
        );
      for (const frame of frames) {
        const identity = ports.inputs.repositorySourceIdentity(frame);
        const source = sources.get(identity.repoBasis.repositoryId);
        need(source, 'FRESHNESS_SOURCE_UNAVAILABLE');
        await verifyCompilationSource(source!, identity, ports.workspaceId);
        check();
        ports.inputs.recheckRepository(frame);
      }
      for (const workspace of workspaces) {
        check();
        ports.inputs.recheckWorkspace(workspace);
      }
      for (const snapshot of snapshots)
        need(
          json(ports.currentPolicyVersions()) === json(snapshot.policyVersions),
          'FRESHNESS_POLICY_CHANGED',
        );
      check();
    }
    await observe();
    command = issueOwnedFreshnessCommand(
      ports.issuer,
      {
        ruleVersion: 'owned-one-shot-freshness@1',
        workspaceId: request.workspaceId,
        selected: request.selectedPublishedRevisionRefs,
        expectedProjection: basis.projection,
        snapshots,
        basisDigest: publicationDigest('codeatlas.owned-freshness.basis.v1', snapshots, c),
      },
      check,
      c,
    );
    commitState = ports.reconcile(command).commitState;
    await observe();
    const expectedFresh = JSON.parse(json(basis));
    for (const row of expectedFresh.projection.records)
      row.itemEnvelope.payload.sourceFreshness = 'FRESH';
    need(json(ports.readBasis()) === json(expectedFresh), 'FRESHNESS_CAS_CONFLICT');
    result = await projectSchema11Wiki(
      request,
      { workspaceId: ports.workspaceId, read: ports.read },
      c,
    );
    await observe();
    need(json(ports.readBasis()) === json(expectedFresh), 'FRESHNESS_CAS_CONFLICT');
    check();
    completedObservation = {
      startedAt: observationStartedAt,
      completedAt: new Date().toISOString(),
      basisDigest: publicationDigest('codeatlas.owned-freshness.basis.v1', snapshots, c),
      source: {
        kind: 'SCHEMA11_RECEIPT',
        version: 1,
        workspaceId: request.workspaceId,
        repositoryIds: [...request.repositoryIds],
        records: expectedFresh.projection.records.map((row: any) => ({
          itemId: row.itemEnvelope.payload.id,
          revisionId: row.revisionEnvelope.payload.id,
          publicationId: row.publicationId,
          candidateId: row.candidateId,
          ...row.provenance,
          inputDigest: snapshots.find((s) => s.snapshotId === row.provenance.snapshotId)!
            .inputDigest,
        })),
      },
    };
  } catch (error) {
    failure = error;
    const code =
      error && typeof error === 'object'
        ? Object.getOwnPropertyDescriptor(error, 'code')?.value
        : undefined;
    if (code === 'FRESHNESS_COMMIT_UNKNOWN') commitState = 'UNKNOWN';
    if (
      error &&
      typeof error === 'object' &&
      Object.getOwnPropertyDescriptor(error, 'cleanupState')?.value === 'UNKNOWN'
    )
      cleanupState = 'UNKNOWN';
  } finally {
    live = false;
    if (command) releaseOwnedFreshnessCommand(command);
    for (const cleanup of [
      ...workspaces.reverse().map((f) => () => ports.inputs.releaseWorkspace(f)),
      ...frames.reverse().map((f) => () => ports.inputs.releaseRepository(f)),
      ...[...new Set(sources.values())].map((handle) => () => releaseCompilationSource(handle)),
      ports.close,
    ]) {
      try {
        const returned: unknown = cleanup();
        if (returned !== undefined) {
          if (types.isPromise(returned)) void returned.catch(() => undefined);
          cleanupState = 'UNKNOWN';
        }
      } catch {
        cleanupState = 'UNKNOWN';
      }
    }
  }
  if (!failure && cleanupState === 'SETTLED') {
    try {
      json(null);
      const permission = ports.assertPermission();
      if (types.isPromise(permission)) void permission.catch(() => undefined);
      need(permission === undefined, 'FRESHNESS_PERMISSION_INVALID');
      for (const policy of admittedPolicies)
        need(json(ports.currentPolicyVersions()) === json(policy), 'FRESHNESS_POLICY_CHANGED');
    } catch (error) {
      failure = error;
    }
  }
  if (failure || cleanupState !== 'SETTLED')
    throw new OwnedFreshnessError('FRESHNESS_DELIVERY_REFUSED', commitState, cleanupState);
  const completed = Object.freeze({
    ruleVersion: 'owned-one-shot-freshness@1' as const,
    commitState,
    cleanupState,
    projection: result!,
    observationScope: 'SELECTED_CAPTURED_BASES_ONLY' as const,
    quality: 'NOT_EVALUABLE' as const,
    productionAccess: 'CLOSED' as const,
  });
  completedObservations.set(completed, completedObservation!);
  return completed;

  function compareInventory(
    expected: CompilationInputSnapshot['repositories'][number] | WorkspaceCapture,
    actual: RepositoryCapture | WorkspaceCapture,
  ) {
    for (const field of ['entities', 'supports'] as const) {
      const values = new Set(actual[field].map((v) => json(v)));
      for (const value of expected[field]) need(values.has(json(value)));
    }
  }
}
