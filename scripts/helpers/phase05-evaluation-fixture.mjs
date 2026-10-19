import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { availableParallelism } from 'node:os';
import {
  lstat,
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  writeFile,
  unlink,
  rename,
} from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual, promisify, types } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import {
  parseIndexRequest,
  parseIndexConfiguration,
  CodeQueryError,
  createQueryControl,
  IndexCommandError,
  applyFullAnalysis,
  applyAnalysisPatch,
} from '../../packages/application/dist/index.js';
import { reconcileObservedGitWorktree } from '../../packages/application/dist/reconcile-worktree.js';
import { observeGitWorktree } from '../../packages/source/dist/index.js';
import { fingerprintInventory } from '../../packages/source/dist/fingerprint.js';
import {
  openRepositoryIndexSession,
  RepositoryAnalysisStage,
  RepositoryPatchStage,
  RepositoryCanonicalFactStore,
} from '../../packages/storage/dist/index.js';
import {
  readEvaluationStateRows,
  readEvaluationRetainedStateRows,
  readEvaluationRetainedNativeState,
} from '../../packages/storage/dist/analysis/evaluation-state.js';
import {
  runIndexCommand,
  readNativeFullBaseline,
  createNativeStateValidationPort,
  resolveNativeWorkerConfig,
  nativeLaunchArguments,
} from '../../packages/runtime/dist/index.js';
import {
  assertNativeMetadataAdmission,
  assertNativeRefreshTransportAdmission,
} from '../../packages/runtime/dist/native-metadata-admission.js';
import { applyNativeFullBootstrap } from '../../packages/runtime/dist/native-full-bootstrap.js';
import { applyNativeRefreshAnalysisV3 } from '../../packages/runtime/dist/native-refresh-composition.js';
import {
  JAVA_NORMALIZER_VERSION,
  executeNativeRequest,
  NativeStateValidationError,
  NativeAnalysisStateHeaderV1Schema,
  NATIVE_CLIENT_HARD_LIMITS,
  normalizeNativeAnalysis,
  mergeCanonicalObservations,
  mergeStagedAnalysis,
} from '../../packages/providers/dist/index.js';
import { collectMergeSupports } from '../../packages/providers/dist/fact-merger-input.js';
import { observeNativeWire } from '../../packages/runtime/test/helpers/native-refresh-wire-probe.mjs';
import {
  observeNativeRefreshCompletionSql,
  observeNativeRefreshNormalizationSql,
} from '../../packages/runtime/dist/native-refresh-workspace.js';
import { observeNativeSqlLifetime } from '../../packages/storage/dist/analysis/native-apply-sql-observation.js';
import { observeRepositoryIndexSessionLifetime } from '../../packages/storage/dist/indexing/repository-index-session.js';
import { selectMergedGroup } from '../../packages/providers/dist/fact-merger-selection.js';
import { normalizeJavaNode } from '../../packages/providers/dist/java-node-normalizer.js';
import { normalizeJavaEdge } from '../../packages/providers/dist/canonical-normalizer.js';
import {
  bindPhase05SourceIdentity,
  evaluatePhase05Facts,
  evaluatePhase05Report,
  evaluatePhase05LayeredReport,
  compareCanonicalFacts,
} from '../../packages/evaluation/dist/index.js';
import {
  CanonicalNodeSchema,
  CanonicalEdgeSchema,
  SourceFileSchema,
  EntityIdSchema,
  CanonicalFactRefSchema,
  EvidenceSchema,
  FactEvidenceSchema,
  ProviderFactBindingSchema,
  ProviderSnapshotSchema,
  ProviderNodeSchema,
  ProviderEdgeSchema,
  WorktreeRevisionSchema,
  ContentFingerprintSchema,
  ProviderCoverageStatusSchema,
  epochMillisecondsToUtcInstant,
} from '../../packages/ir/dist/index.js';

const execute = promisify(execFile);
const fixture = new URL('../../fixtures/evaluation/phase05-code-intelligence/', import.meta.url);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const trialReceipts = new WeakSet();
// One current restore capability per owned target; older snapshots remain evidence.
const restorePointOwners = new Map();
const trialReceiptTargets = new WeakMap();
let trialSequence = 0;
const capturedFixturePins = new WeakSet();
const declaredMetadataTargets = new WeakMap();

function plainEvaluationControls(value, invalid, seen = new Set()) {
  if (value === null || typeof value !== 'object') return;
  if (types.isProxy(value) || seen.has(value)) invalid();
  seen.add(value);
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) invalid();
  const keys = Reflect.ownKeys(value);
  if (array && keys.length !== value.length + 1) invalid();
  for (const key of keys) {
    if (array && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
      invalid();
    plainEvaluationControls(descriptor.value, invalid, seen);
  }
  seen.delete(value);
}

function exactEvaluationControls(value, fields, invalid) {
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))
  )
    invalid();
}

function parseEvaluationNativeControls(native, repositoryId) {
  const invalid = () => {
    throw new Error('Invalid Evaluation Native controls');
  };
  try {
    plainEvaluationControls(native, invalid);
    exactEvaluationControls(native, ['expected', 'limits'], invalid);
    exactEvaluationControls(native.limits, ['maxSerializedBytes', 'memoryBudgetBytes'], invalid);
    exactEvaluationControls(
      native.expected,
      [
        'repositoryId',
        'providerId',
        'providerVersion',
        'revisionId',
        'contentFingerprint',
        'language',
        'resolverVersion',
        'normalizerVersion',
        'policyFingerprint',
        'requestedCapabilities',
      ],
      invalid,
    );
    // Schema-only validation, never a stored state or compatibility authority.
    NativeAnalysisStateHeaderV1Schema.parse({
      schemaVersion: 1,
      ...native.expected,
      sourceFileCount: 0,
      summaryDigest: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
    });
    if (
      native.expected.repositoryId !== repositoryId ||
      native.expected.normalizerVersion !== JAVA_NORMALIZER_VERSION ||
      !Number.isSafeInteger(native.limits.maxSerializedBytes) ||
      native.limits.maxSerializedBytes <= 0 ||
      native.limits.maxSerializedBytes > 1_000_000 ||
      !Number.isSafeInteger(native.limits.memoryBudgetBytes) ||
      native.limits.memoryBudgetBytes <= 0
    )
      invalid();
    return structuredClone(native);
  } catch {
    invalid();
  }
}

// Private Evaluation inspection, not a current Native baseline or Apply capability.
export async function readPhase05RetainedPublication({
  databasePath,
  repositoryId,
  repositoryRoot,
  budget,
  binding,
}) {
  const request = parseIndexRequest({
    schemaVersion: 1,
    operation: 'STATUS',
    databasePath,
    repositoryId,
    budget,
  });
  const invalid = () => {
    throw new Error('Invalid Evaluation retained controls');
  };
  let bound;
  try {
    plainEvaluationControls(binding, invalid);
    exactEvaluationControls(
      binding,
      ['expected', 'snapshotId', 'token', 'sourceFiles', 'limits'],
      invalid,
    );
    const native = parseEvaluationNativeControls(
      { expected: binding.expected, limits: binding.limits },
      request.repositoryId,
    );
    const token = binding.token;
    exactEvaluationControls(
      token,
      ['committedSnapshotCount', 'indexedRevisionId', 'indexedContentFingerprint', 'states'],
      invalid,
    );
    EntityIdSchema.parse(binding.snapshotId);
    if (
      !Number.isSafeInteger(token.committedSnapshotCount) ||
      token.committedSnapshotCount < 1 ||
      token.indexedRevisionId !== native.expected.revisionId ||
      token.indexedContentFingerprint !== native.expected.contentFingerprint ||
      !Array.isArray(token.states) ||
      !Array.isArray(binding.sourceFiles) ||
      binding.sourceFiles.length > request.budget.maxMetadataRows
    )
      invalid();
    const providers = new Set();
    for (const state of token.states) {
      exactEvaluationControls(state, ['providerId', 'snapshotId', 'summaryDigest'], invalid);
      EntityIdSchema.parse(state.providerId);
      EntityIdSchema.parse(state.snapshotId);
      if (!/^[a-f0-9]{64}$/.test(state.summaryDigest) || providers.has(state.providerId)) invalid();
      providers.add(state.providerId);
    }
    if (
      !token.states.some(
        (state) =>
          state.providerId === native.expected.providerId &&
          state.snapshotId === binding.snapshotId,
      )
    )
      invalid();
    const files = binding.sourceFiles.map((file) => SourceFileSchema.parse(file));
    if (
      files.some(
        (file) =>
          file.repositoryId !== request.repositoryId ||
          file.revisionId !== native.expected.revisionId,
      ) ||
      new Set(files.map((file) => file.id)).size !== files.length ||
      new Set(files.map((file) => file.path)).size !== files.length
    )
      invalid();
    bound = {
      ...native,
      token: structuredClone(token),
      snapshotId: binding.snapshotId,
      sourceFiles: files,
    };
  } catch {
    invalid();
  }
  // No filesystem acquisition/SQL TEXT before exact-build Runtime admission.
  assertNativeMetadataAdmission(bound.limits.memoryBudgetBytes, 'READ_SEAL');
  const control = createQueryControl({
    ...request.budget,
    maxNodes: request.budget.maxMetadataRows,
    maxEdges: request.budget.maxMetadataRows,
  });
  const session = await openRepositoryIndexSession(
    {
      databasePath: request.databasePath,
      repositoryId: request.repositoryId,
      repositoryRoot,
      initialize: false,
      readOnly: true,
    },
    control,
  );
  const ownedSnapshot = !session.database.isTransaction;
  try {
    if (ownedSnapshot) session.database.exec('BEGIN');
    let imageBytes = 0;
    const rows = await readEvaluationRetainedStateRows(
      session.database,
      request.repositoryId,
      {
        ...control,
        reserveText(bytes) {
          control.reserveText(bytes);
          imageBytes += bytes;
        },
      },
      bound,
    );
    const remaining = bound.limits.memoryBudgetBytes - 2 * imageBytes;
    assertNativeMetadataAdmission(remaining, 'READ_SEAL');
    const nativeInspection = await readEvaluationRetainedNativeState(
      session.database,
      { ...bound, limits: { ...bound.limits, memoryBudgetBytes: remaining } },
      control,
      createNativeStateValidationPort(),
    );
    const r = rows.revisions[0];
    const revision = WorktreeRevisionSchema.parse({
      id: r.id,
      repositoryId: r.repository_id,
      kind: r.kind,
      contentFingerprint: r.content_fingerprint,
      baseRevisionId: r.base_revision_id,
    });
    const files = rows.source_files.map((row) =>
      SourceFileSchema.parse({
        id: row.id,
        repositoryId: row.repository_id,
        revisionId: row.revision_id,
        path: row.path,
        contentFingerprint: row.content_fingerprint,
        classification: {
          role: row.role,
          provenance: row.provenance,
          contentKind: row.content_kind,
        },
        languageHint: row.language_hint,
        sensitivity: row.sensitivity,
      }),
    );
    const publicationRows = Object.fromEntries(
      Object.entries(rows).filter(([table]) => !['revisions', 'source_files'].includes(table)),
    );
    await control.checkpoint();
    if (ownedSnapshot) session.database.exec('COMMIT');
    return {
      kind: 'RETAINED_PUBLICATION_ONLY',
      currentSource: { revision, files },
      publicationRows,
      nativeInspection,
    };
  } finally {
    if (ownedSnapshot && session.database.isTransaction) session.database.exec('ROLLBACK');
    session.close();
  }
}

// A qualified persisted image, not current-worktree observation or Native state
// compatibility. R010 header/summary admission and validation remain separate.
export async function readPhase05PublishedState({
  databasePath,
  repositoryId,
  repositoryRoot,
  budget,
  native,
}) {
  const request = parseIndexRequest({
    schemaVersion: 1,
    operation: 'STATUS',
    databasePath,
    repositoryId,
    budget,
  });
  const control = createQueryControl({
    ...request.budget,
    maxNodes: request.budget.maxMetadataRows,
    maxEdges: request.budget.maxMetadataRows,
  });
  let nativeControls;
  if (native !== undefined) {
    nativeControls = parseEvaluationNativeControls(native, request.repositoryId);
    // Before acquiring the bound connection or reading any SQL TEXT.
    assertNativeMetadataAdmission(nativeControls.limits.memoryBudgetBytes, 'READ_SEAL');
  }
  const session = await openRepositoryIndexSession(
    {
      databasePath: request.databasePath,
      repositoryId: request.repositoryId,
      repositoryRoot,
      initialize: false,
      readOnly: true,
    },
    control,
  );
  let ownedSnapshot = false;
  try {
    if (nativeControls && !session.database.isTransaction) {
      session.database.exec('BEGIN');
      ownedSnapshot = true;
    }
    let retainedImageBytes = 0;
    const tables = await readEvaluationStateRows(session.database, request.repositoryId, {
      ...control,
      reserveText(bytes) {
        control.reserveText(bytes);
        retainedImageBytes += bytes;
      },
    });
    const r = tables.revisions[0];
    const revision = WorktreeRevisionSchema.parse({
      id: r.id,
      repositoryId: r.repository_id,
      kind: r.kind,
      contentFingerprint: r.content_fingerprint,
      baseRevisionId: r.base_revision_id,
    });
    const state = tables.repository_state[0];
    const indexed = {
      revisionId: EntityIdSchema.parse(state.indexed_revision_id),
      contentFingerprint: ContentFingerprintSchema.parse(state.indexed_content_fingerprint),
    };
    const sourceFiles = tables.source_files.map((row) =>
      SourceFileSchema.parse({
        id: row.id,
        repositoryId: row.repository_id,
        revisionId: row.revision_id,
        path: row.path,
        contentFingerprint: row.content_fingerprint,
        classification: {
          role: row.role,
          provenance: row.provenance,
          contentKind: row.content_kind,
        },
        languageHint: row.language_hint,
        sensitivity: row.sensitivity,
      }),
    );
    const confidence = (row) => ({
      score: row.confidence_score,
      method: row.confidence_method,
      reasons: JSON.parse(row.confidence_reasons_json),
    });
    const range = (row) =>
      row.source_range_json === null ? null : JSON.parse(row.source_range_json);
    const ref = (row) => ({ factType: row.fact_type, id: row.canonical_fact_id });
    const providerFact = (row) => ({
      factType: row.fact_type,
      providerId: row.provider_id,
      providerFactId: row.provider_fact_id,
    });
    const unresolved = new Map(tables.unresolved_targets.map((row) => [row.edge_id, row]));
    const nodes = tables.canonical_nodes.map((row) => {
      if (
        (row.kind !== 'TYPE' && row.type_kind !== null) ||
        (row.kind !== 'SYMBOL' && row.symbol_kind !== null)
      )
        throw new Error('Invalid node discriminator');
      return CanonicalNodeSchema.parse({
        id: row.id,
        factKey: row.fact_key,
        repositoryId: row.repository_id,
        revisionId: row.revision_id,
        kind: row.kind,
        ...(row.kind === 'TYPE'
          ? { typeKind: row.type_kind }
          : row.kind === 'SYMBOL'
            ? { symbolKind: row.symbol_kind }
            : {}),
        name: row.name,
        qualifiedName: row.qualified_name,
        sourceRange: range(row),
        confidence: confidence(row),
      });
    });
    const edges = tables.canonical_edges.map((row) => {
      if (
        !['RESOLVED', 'UNRESOLVED'].includes(row.target_state) ||
        (row.target_state === 'UNRESOLVED' && row.target_node_id !== null)
      )
        throw new Error('Invalid target discriminator');
      const target = unresolved.get(row.id);
      return CanonicalEdgeSchema.parse({
        id: row.id,
        factKey: row.fact_key,
        repositoryId: row.repository_id,
        revisionId: row.revision_id,
        kind: row.kind,
        source: { factType: 'NODE', id: row.source_node_id },
        target:
          row.target_state === 'RESOLVED'
            ? {
                state: 'RESOLVED',
                resolution: row.resolution,
                target: { factType: 'NODE', id: row.target_node_id },
              }
            : {
                state: 'UNRESOLVED',
                resolution: row.resolution,
                originalHint: target?.original_hint,
                candidates: target ? JSON.parse(target.candidates_json) : undefined,
              },
        sourceRange: range(row),
        confidence: confidence(row),
      });
    });
    if (
      unresolved.size !== tables.unresolved_targets.length ||
      unresolved.size !== edges.filter((edge) => edge.target.state === 'UNRESOLVED').length ||
      [...unresolved.keys()].some(
        (id) => !edges.some((edge) => edge.id === id && edge.target.state === 'UNRESOLVED'),
      )
    )
      throw new Error('Invalid unresolved state');
    const snapshotIds = new Set(tables.provider_snapshots.map((row) => row.id));
    if (
      tables.provider_capabilities.some((row) => !snapshotIds.has(row.snapshot_id)) ||
      tables.analysis_diagnostics.some((row) => !snapshotIds.has(row.provider_snapshot_id))
    )
      throw new Error('Invalid snapshot child');
    const snapshots = tables.provider_snapshots.map((row) =>
      ProviderSnapshotSchema.parse({
        id: row.id,
        repositoryId: row.repository_id,
        providerId: row.provider_id,
        providerVersion: row.provider_version,
        runtimeVersion: row.runtime_version,
        requestedRevisionId: row.requested_revision_id,
        requestedRevisionFingerprint: row.requested_revision_fingerprint,
        startedAt: epochMillisecondsToUtcInstant(row.started_at),
        completedAt: epochMillisecondsToUtcInstant(row.completed_at),
        outcome: row.outcome,
        capabilities: tables.provider_capabilities
          .filter((c) => c.snapshot_id === row.id)
          .map((c) => ({ name: c.name, support: c.support, coverage: c.coverage })),
        diagnostics: tables.analysis_diagnostics
          .filter((d) => d.provider_snapshot_id === row.id)
          .map((d) => ({
            code: d.code,
            severity: d.severity,
            message: d.message,
            sourceRange: range(d),
          })),
      }),
    );
    const supports = {
      sourceFiles,
      facts: { nodes, edges },
      snapshots,
      evidence: tables.evidence.map((row) =>
        EvidenceSchema.parse({
          id: row.id,
          repositoryId: row.repository_id,
          revisionId: row.revision_id,
          providerSnapshotId: row.provider_snapshot_id,
          providerFact: providerFact(row),
          status: row.status,
        }),
      ),
      bindings: tables.provider_fact_bindings.map((row) =>
        ProviderFactBindingSchema.parse({
          providerFact: providerFact(row),
          providerSnapshotId: row.provider_snapshot_id,
          canonicalFact: ref(row),
          evidenceId: row.evidence_id,
        }),
      ),
      factEvidence: tables.fact_evidence.map((row) =>
        FactEvidenceSchema.parse({ fact: ref(row), evidenceId: row.evidence_id }),
      ),
      candidates: tables.active_support_candidates.map((row) => ({
        fact: ref(row),
        evidenceId: row.evidence_id,
        candidate: JSON.parse(row.candidate_json),
      })),
    };
    // Self-validation checks closure, not agreement with an independent oracle.
    comparePhase05ActiveSupports({ expected: supports, actual: supports });
    const bySnapshot = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
    const fileIds = new Set(sourceFiles.map((file) => file.id));
    const observations = tables.analysis_coverage.map((row) => {
      const snapshot = bySnapshot.get(row.provider_snapshot_id);
      if (!snapshot?.capabilities.some((c) => c.name === row.capability_name))
        throw new Error('Invalid coverage context');
      if (
        snapshot.requestedRevisionFingerprint === indexed.contentFingerprint &&
        row.source_file_id !== null &&
        !fileIds.has(row.source_file_id)
      )
        throw new Error('Invalid current coverage source');
      return {
        providerSnapshotId: snapshot.id,
        capability: row.capability_name,
        sourceFileId: row.source_file_id === null ? null : EntityIdSchema.parse(row.source_file_id),
        coverage: ProviderCoverageStatusSchema.parse(row.status),
      };
    });
    const nativeStates = tables.native_analysis_state.map((row) => {
      const snapshot = bySnapshot.get(row.provider_snapshot_id);
      if (
        !snapshot ||
        snapshot.outcome !== 'SUCCEEDED' ||
        snapshot.providerId !== row.provider_id ||
        row.revision_id !== revision.id ||
        row.content_fingerprint !== indexed.contentFingerprint ||
        snapshot.requestedRevisionFingerprint !== indexed.contentFingerprint
      )
        throw new Error('Invalid Native pointer');
      return {
        providerId: snapshot.providerId,
        providerSnapshotId: snapshot.id,
        revisionId: revision.id,
        contentFingerprint: indexed.contentFingerprint,
      };
    });
    let nativeBaseline;
    if (nativeControls) {
      if (
        nativeControls.expected.revisionId !== revision.id ||
        nativeControls.expected.contentFingerprint !== revision.contentFingerprint
      )
        throw new Error('Native context differs from current Source');
      const remaining = nativeControls.limits.memoryBudgetBytes - 2 * retainedImageBytes;
      assertNativeMetadataAdmission(remaining, 'READ_SEAL');
      await control.checkpoint();
      nativeBaseline = readNativeFullBaseline(session.database, nativeControls.expected, {
        maxSerializedBytes: Math.min(
          nativeControls.limits.maxSerializedBytes,
          request.budget.maxResultBytes - retainedImageBytes,
        ),
        memoryBudgetBytes: remaining,
      });
      if (nativeBaseline.status === 'AVAILABLE') {
        control.reserveText(Buffer.byteLength(nativeBaseline.state.headerJson));
        for (const file of nativeBaseline.state.files) {
          control.chargeMetadataRow();
          control.reserveText(Buffer.byteLength(file.summaryJson));
        }
      }
      await control.checkpoint();
      if (ownedSnapshot) {
        session.database.exec('COMMIT');
        ownedSnapshot = false;
      }
    }
    return {
      revision,
      indexed,
      supports,
      coverage: {
        observations,
        nativeStates,
        baseline: nativeStates.length ? 'PRESENT_UNVERIFIED' : 'MISSING',
      },
      ...(nativeBaseline === undefined ? {} : { nativeBaseline }),
    };
  } catch (error) {
    if (ownedSnapshot && session.database.isTransaction) session.database.exec('ROLLBACK');
    if (error instanceof CodeQueryError) throw error;
    throw new Error('Evaluation stored state unavailable or invalid.');
  } finally {
    session.close();
  }
}

// Source preparation is outside measurement and never activates a graph.
export async function preparePhase05SourceSeed({
  databasePath,
  repositoryRoot,
  repositoryId,
  initialize,
  configuration: value,
}) {
  const configuration = parseIndexConfiguration(value);
  const id = EntityIdSchema.parse(repositoryId);
  if (
    typeof initialize !== 'boolean' ||
    typeof repositoryRoot !== 'string' ||
    !path.isAbsolute(repositoryRoot) ||
    typeof databasePath !== 'string' ||
    !path.isAbsolute(databasePath)
  )
    throw new Error('Invalid Source seed controls');
  const root = await realpath(repositoryRoot);
  if (root !== path.resolve(repositoryRoot)) throw new Error('Source seed root must be canonical');
  if (path.dirname(path.resolve(databasePath)) !== path.dirname(root))
    throw new Error('Source seed database must be confined to the trial parent');
  const control = createQueryControl({
    maxMetadataRows: configuration.resourceBudget.maxEvents,
    maxNodes: configuration.resourceBudget.maxEvents,
    maxEdges: configuration.resourceBudget.maxEvents,
    maxResultBytes: configuration.transportLimits.maxStdoutBytes,
    timeoutMs: configuration.resourceBudget.maxDurationMs,
  });
  const openSession = () =>
    openRepositoryIndexSession(
      { databasePath, repositoryId: id, repositoryRoot: root, initialize, readOnly: false },
      control,
    );
  let session;
  try {
    let previous = null;
    if (!initialize) {
      session = await openSession();
      previous = session.sourceState.load(id);
    }
    await control.checkpoint();
    const observation = await observeGitWorktree({
      repositoryId: id,
      startingPath: root,
      workspaceRoot: root,
      config: configuration.source,
    });
    await control.checkpoint();
    if ((await realpath(observation.rootPath)) !== root)
      throw new Error('Source seed Git root mismatch');
    if (observation.files.length > configuration.resourceBudget.maxEvents)
      throw new Error('Source seed file inventory exceeds explicit budget');
    if (!session) session = await openSession();
    reconcileObservedGitWorktree(observation, session.sourceState, previous);
    const state = session.sourceState.load(id);
    if (!state) throw new Error('Source seed state missing');
    return { preparation: 'SOURCE_ONLY_OUTSIDE_MEASUREMENT', state };
  } finally {
    session?.close();
  }
}

// One actual public operation; no injected Native/composition or restore path.
// A failure receipt is evidence of refusal, never successful Native acceptance.
// Development-only parsed diagnostics. Physical ownership is qualified by the
// trial owner, never by this pure record agreement or a hash alone.
export function createPhase05ParseCapture({ transportLimits, resourceBudget }) {
  const byteLimit = Math.min(transportLimits.maxStderrBytes, 1_000_000);
  const requestedLineLimit = Math.min(transportLimits.maxLineBytes, byteLimit);
  const rowLimit = Math.min(transportLimits.maxEvents, resourceBudget.maxEvents, 10_000);
  const memoryLimit = resourceBudget.maxMemoryBytes;
  const outputLimit = transportLimits.maxStdoutBytes;
  if (
    ![byteLimit, requestedLineLimit, rowLimit, memoryLimit, outputLimit].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    )
  )
    throw new Error('Invalid parse observation limits');
  let buffer,
    used = 0,
    bytes = 0,
    records = 0,
    childOwner,
    ended = false,
    failed = false,
    saw = false;
  let retainedBytes = 0,
    finalized = false,
    finalSummary;
  const active = new Map();
  const result = {
    scope: 'CONSUMED_NATIVE_PARSE_DIAGNOSTICS_ONLY',
    requestRefSha256: null,
    operation: null,
    workerLimit: null,
    started: 0,
    finished: 0,
    complete: false,
    captureFailed: false,
    invocations: [],
    completionOrder: [],
    maximumActiveSlots: 0,
  };
  const hash = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  const integer = (value) => Number.isSafeInteger(value) && value >= 0;
  const fail = () => {
    failed = true;
    result.complete = false;
    result.captureFailed = true;
  };
  // Exact maximum fixed summary envelope; variable arrays are charged separately.
  const reserve = Buffer.byteLength(
    JSON.stringify({
      ...result,
      requestRefSha256: '0'.repeat(64),
      operation: 'ANALYZE',
      workerLimit: Number.MAX_SAFE_INTEGER,
      started: Number.MAX_SAFE_INTEGER,
      finished: Number.MAX_SAFE_INTEGER,
      maximumActiveSlots: Number.MAX_SAFE_INTEGER,
    }),
  );
  // One caller ceiling covers both the line storage and retained evidence.
  // Unaffordable observation stays unavailable without replacing the operation.
  const lineLimit = Math.min(requestedLineLimit, Math.max(0, memoryLimit - reserve));
  const retainedLimit = Math.min(outputLimit, memoryLimit - lineLimit);
  const unavailable = lineLimit === 0 || reserve > retainedLimit;
  const charge = (n) => {
    retainedBytes += n;
    if (retainedBytes + reserve > retainedLimit) throw new Error('capture limit');
  };
  function line(raw, child) {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
    if (text.startsWith('\ufeff')) throw new Error('BOM');
    let row;
    try {
      row = JSON.parse(text);
    } catch {
      if (text.includes('NATIVE_PARSE_OBSERVATION') || text.startsWith('{'))
        throw new Error('Malformed diagnostic');
      return;
    }
    if (row?.kind !== 'NATIVE_PARSE_OBSERVATION') return;
    saw = true;
    if (ended || !child || records >= rowLimit) throw new Error('Late or excessive diagnostic');
    if (childOwner === undefined) childOwner = child;
    if (childOwner !== child) throw new Error('Foreign child');
    const common = ['diagnosticSchema', 'kind', 'requestRefSha256', 'ordinal', 'event'];
    const variants = {
      BEGIN: ['operation', 'workerLimit'],
      PARSE_STARTED: ['sourceRefSha256', 'slot'],
      PARSE_FINISHED: ['sourceRefSha256', 'slot', 'outcome'],
      END: ['started', 'finished', 'complete', 'reason'],
    };
    if (!Object.hasOwn(variants, row.event)) throw new Error('Unknown variant');
    const keys = [...common, ...variants[row.event]];
    if (
      Object.keys(row).length !== keys.length ||
      !keys.every((k) => Object.hasOwn(row, k)) ||
      row.diagnosticSchema !== 1 ||
      !hash(row.requestRefSha256) ||
      row.ordinal !== records
    )
      throw new Error('Invalid schema/ordinal');
    records++;
    if (row.event === 'BEGIN') {
      if (
        records !== 1 ||
        !['ANALYZE', 'REFRESH'].includes(row.operation) ||
        !integer(row.workerLimit) ||
        row.workerLimit === 0
      )
        throw new Error('Invalid begin');
      result.requestRefSha256 = row.requestRefSha256;
      result.operation = row.operation;
      result.workerLimit = row.workerLimit;
      charge(0);
      return;
    }
    if (result.requestRefSha256 !== row.requestRefSha256) throw new Error('Foreign request');
    if (row.event === 'END') {
      ended = true;
      if (
        !integer(row.started) ||
        !integer(row.finished) ||
        row.started !== result.started ||
        row.finished !== result.finished ||
        active.size ||
        row.complete !== true ||
        row.reason !== null
      )
        throw new Error('Incomplete observation');
      result.complete = true;
      return;
    }
    if (!hash(row.sourceRefSha256) || !integer(row.slot) || row.slot >= result.workerLimit)
      throw new Error('Invalid source/slot');
    if (row.event === 'PARSE_STARTED') {
      if (active.has(row.slot) || result.invocations.length >= rowLimit)
        throw new Error('Occupied slot');
      const invocation = {
        sourceRefSha256: row.sourceRefSha256,
        slot: row.slot,
        startOrdinal: row.ordinal,
        finishOrdinal: null,
        outcome: null,
      };
      // Finish ordinal/outcome may grow; charge their maximum encoding now.
      charge(
        Buffer.byteLength(
          JSON.stringify({
            ...invocation,
            finishOrdinal: Number.MAX_SAFE_INTEGER,
            outcome: 'SUCCEEDED',
          }),
        ) + 1,
      );
      result.invocations.push(invocation);
      active.set(row.slot, invocation);
      result.started++;
      result.maximumActiveSlots = Math.max(result.maximumActiveSlots, active.size);
    } else {
      const invocation = active.get(row.slot);
      if (
        !invocation ||
        invocation.sourceRefSha256 !== row.sourceRefSha256 ||
        !['SUCCEEDED', 'PARTIAL', 'FAILED'].includes(row.outcome)
      )
        throw new Error('Unpaired finish');
      charge(Buffer.byteLength(JSON.stringify(row.sourceRefSha256)) + 1);
      invocation.finishOrdinal = row.ordinal;
      invocation.outcome = row.outcome;
      active.delete(row.slot);
      result.finished++;
      result.completionOrder.push(row.sourceRefSha256);
    }
  }
  return {
    accept(chunk, child) {
      if (failed || finalized || unavailable) return;
      try {
        if (chunk.byteLength) {
          if (!child) throw new Error('Missing original child');
          if (childOwner === undefined) childOwner = child;
          if (childOwner !== child) throw new Error('Foreign child chunk');
        }
        bytes += chunk.byteLength;
        if (bytes > byteLimit) throw new Error('Stderr limit');
        buffer ??= Buffer.alloc(lineLimit);
        for (const byte of chunk) {
          if (byte === 10) {
            line(buffer.subarray(0, used), child);
            used = 0;
          } else {
            if (used >= lineLimit) throw new Error('Line limit');
            buffer[used++] = byte;
          }
        }
      } catch {
        fail();
      }
    },
    finish() {
      if (finalized) return finalSummary;
      finalized = true;
      if (unavailable) return (finalSummary = null);
      if (used || !ended) {
        if (saw || bytes) fail();
      }
      if (!saw && !failed) return (finalSummary = null);
      result.complete = result.complete && !failed;
      for (const row of result.invocations) Object.freeze(row);
      Object.freeze(result.invocations);
      Object.freeze(result.completionOrder);
      return (finalSummary = Object.freeze(result));
    },
  };
}

export async function observePhase05NativeOperation(
  { executablePath, observeOutputChunk, observationConfiguration },
  operation,
) {
  if (typeof executablePath !== 'string' || !path.isAbsolute(executablePath))
    throw new Error('Invalid observed Native executable');
  const children = [];
  let sqlLifetime = null;
  const capture = phase05NativeCapture();
  const parseCapture = observationConfiguration
    ? createPhase05ParseCapture(observationConfiguration)
    : null;
  // Reuse the serial test-only pass-through probe: no data listener, second
  // reader, transcript buffer, new production hook or process-owner replacement.
  const observed = await observeNativeWire(
    async () => {
      const captured = await observeRepositoryIndexSessionLifetime(operation);
      sqlLifetime = captured.evidence;
      if (captured.threw) throw captured.error;
      return captured.value;
    },
    (chunk) => {
      capture.observeOutputChunk(chunk);
      observeOutputChunk?.(chunk);
    },
    (child) => {
      const item = { child, closeObserved: false, exitCode: null, signal: null };
      children.push(item);
      child.once('close', (exitCode, signal) =>
        Object.assign(item, { closeObserved: true, exitCode, signal }),
      );
    },
    parseCapture ? (chunk, child) => parseCapture.accept(chunk, child) : undefined,
    (child) =>
      typeof child.spawnfile === 'string' &&
      path.resolve(child.spawnfile) === path.resolve(executablePath),
  );
  const settled = children.map(({ child, closeObserved, exitCode, signal }) => ({
    executableMatches:
      typeof child.spawnfile === 'string' &&
      path.resolve(child.spawnfile) === path.resolve(executablePath),
    closeObserved,
    exitCode,
    signal,
    stdinClosed: child.stdin.closed,
    stdoutClosed: child.stdout.closed,
    stderrClosed: child.stderr?.closed === true,
  }));
  return {
    value: observed.value,
    error: observed.error,
    threw: observed.threw,
    evidence: {
      scope: 'OBSERVED_CHILD_AND_CONSUMED_WIRE_ONLY',
      children: settled,
      childClosed: settled.some((child) => child.executableMatches)
        ? settled.every(
            (child) =>
              child.closeObserved && child.stdinClosed && child.stdoutClosed && child.stderrClosed,
          )
        : null,
      wire: observed.wire,
      sqlLifetime,
      nativeStream: capture.finish(),
      ...(parseCapture ? { parseObservation: parseCapture.finish() } : {}),
    },
  };
}

function phase05NativeCapture() {
  let line,
    used = 0,
    terminal = null,
    terminalCount = 0,
    terminalCaptureFailed = false;
  const siteEvents = [];
  const operations = [];
  let siteBytes = 0;
  // One existing hard-capped line, never a transcript or a second stream reader.
  const observeOutputChunk = (chunk) => {
    if (terminalCaptureFailed) return;
    line ??= Buffer.allocUnsafe(NATIVE_CLIENT_HARD_LIMITS.maxLineBytes);
    for (let start = 0; start < chunk.length;) {
      const lf = chunk.indexOf(10, start);
      const end = lf === -1 ? chunk.length : lf;
      const bytes = end - start;
      if (bytes > line.length - used) {
        terminalCaptureFailed = true;
        return;
      }
      chunk.copy(line, used, start, end);
      used += bytes;
      if (lf === -1) break;
      try {
        const event = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(line.subarray(0, used)),
        );
        const operation = [
          'NODE',
          'EDGE',
          'UPSERT_NODE',
          'UPSERT_EDGE',
          'REMOVE_NODE',
          'REMOVE_EDGE',
        ].includes(event.type);
        const site = ['SOURCE_FILE', 'COVERAGE', 'DIAGNOSTIC'].includes(event.type);
        const completed = ['ANALYSIS_COMPLETED', 'REFRESH_COMPLETED'].includes(event.type);
        if (operation || site || completed) {
          siteBytes += used;
          if (
            siteEvents.length + operations.length + terminalCount >=
              NATIVE_CLIENT_HARD_LIMITS.maxEvents ||
            siteBytes > NATIVE_CLIENT_HARD_LIMITS.maxStdoutBytes
          ) {
            terminalCaptureFailed = true;
            return;
          }
        }
        if (completed) {
          terminalCount++;
          if (terminalCount === 1) terminal = event;
          else terminalCaptureFailed = true;
        }
        if (site) siteEvents.push(event);
        if (operation)
          operations.push({
            protocolVersion: event.protocolVersion,
            requestId: event.requestId,
            sequence: event.sequence,
            type: event.type,
            payload: {
              providerId: event.payload.providerId,
              providerFactId: event.payload.providerFactId,
            },
          });
      } catch {
        terminalCaptureFailed = true;
      }
      used = 0;
      start = lf + 1;
    }
  };
  return {
    observeOutputChunk,
    finish: () => ({
      scope: 'CONSUMED_NATIVE_RECORDS_ONLY',
      terminal,
      terminalCount,
      siteEvents,
      operations,
      captureFailed: terminalCaptureFailed || used !== 0,
    }),
  };
}

// Reuse guarded production branch/source instrumentation, not a wire hash or an
// arbitrary failed public result. No new production observation/admission hook.
export async function observePhase05PartialRefreshOperation(
  { executablePath, observationConfiguration },
  operation,
) {
  let completion, normalization;
  const lifetime = await observeNativeSqlLifetime(async () => {
    completion = await observeNativeRefreshCompletionSql(
      async () => {
        normalization = await observeNativeRefreshNormalizationSql(
          () =>
            observePhase05NativeOperation({ executablePath, observationConfiguration }, operation),
          () => {},
        );
        if (normalization.threw) throw normalization.error;
        return normalization.value;
      },
      () => {},
    );
    if (completion.threw) throw completion.error;
    return completion.value;
  }, [
    ...['BASELINE_READ', 'PREPARATION', 'COMPLETION'].map((family) => ({
      family,
      role: 'MAIN',
      disposition: 'OBSERVED',
    })),
    ...['NORMALIZE', 'SEAL', 'APPLY'].map((family) => ({
      family,
      role: 'MAIN',
      disposition: 'PROVEN_NOT_REACHED',
    })),
  ]);
  if (lifetime.threw) throw lifetime.error;
  const observed = lifetime.value;
  const {
    terminal,
    terminalCount,
    siteEvents,
    captureFailed: terminalCaptureFailed,
  } = observed.evidence.nativeStream;
  const causes = {
    NORMALIZE: 'PARTIAL snapshot skips normalization',
    SEAL: 'PARTIAL snapshot skips overlay seal',
    APPLY: 'Application refused PARTIAL before the Store port',
  };
  const validatedPartialBranch =
    observed.threw &&
    observed.evidence.childClosed === true &&
    !terminalCaptureFailed &&
    terminalCount === 1 &&
    terminal?.protocolVersion === 3 &&
    terminal?.type === 'REFRESH_COMPLETED' &&
    terminal?.payload?.outcome === 'PARTIAL' &&
    observed.evidence.children.some((child) => child.executableMatches) &&
    observed.evidence.children
      .filter((child) => child.executableMatches)
      .every((child) => child.exitCode === 0 && child.signal === null) &&
    !lifetime.captureFailed &&
    !completion.captureFailed &&
    !normalization.captureFailed &&
    lifetime.evidence.coverageComplete &&
    completion.completionCalls === 1 &&
    normalization.normalizationCalls === 0 &&
    Object.entries(causes).every(([family, cause]) =>
      lifetime.evidence.coverage.some(
        (item) =>
          item.family === family &&
          item.role === 'MAIN' &&
          item.disposition === 'PROVEN_NOT_REACHED' &&
          item.cause === cause,
      ),
    );
  return {
    ...observed,
    evidence: {
      ...observed.evidence,
      partialRefresh: {
        scope: 'VALIDATED_REFRESH_PARTIAL_BRANCH_ONLY',
        validatedPartialBranch,
        completionCalls: completion.completionCalls,
        normalizationCalls: normalization.normalizationCalls,
        sourceLifetime: lifetime.evidence,
        terminal,
        terminalCaptureFailed,
        siteEvents,
      },
    },
  };
}

export async function runPhase05IndexTrial(input) {
  return runPhase05OwnedTrial(input);
}

export async function runPhase05DeclaredMetadataTrial(input) {
  if (input.signal !== undefined || input.expectedNativeOutcome !== undefined)
    throw new IndexCommandError('INVALID_REQUEST');
  const declared = declaredMetadataTargets.get(input.metadataTarget);
  plainEvaluationControls(input.metadataTarget, () => {
    throw new Error('Invalid declared metadata target');
  });
  if (!declared || !isDeepStrictEqual(input.metadataTarget, declared.visible))
    throw new Error('Unowned declared metadata target');
  const request = parseIndexRequest(input.request);
  if (
    !['FULL', 'INCREMENTAL'].includes(request.operation) ||
    request.initialize ||
    request.repositoryId !== declared.baseline.revision.repositoryId
  )
    throw new IndexCommandError('INVALID_REQUEST');
  await declared.pinnedInputs.assertUnchanged();
  return runPhase05OwnedTrial(input, declared);
}

// A closed original recipe, not a general Source-role override or public API.
export async function preparePhase05DeclaredMetadataTarget({ pinnedInputs, sourceState }) {
  if (!capturedFixturePins.has(pinnedInputs)) throw new Error('Unowned Fixture reader');
  const invalid = () => {
    throw new Error('Invalid original metadata Source');
  };
  plainEvaluationControls(sourceState, invalid);
  exactEvaluationControls(sourceState, ['revision', 'files'], invalid);
  if (!Array.isArray(sourceState.files) || sourceState.files.length !== 1) invalid();
  const revision = WorktreeRevisionSchema.parse(sourceState.revision);
  const file = SourceFileSchema.parse(sourceState.files[0]);
  const raw = pinnedInputs.readFile('p05-native-refresh-producer-v1', 'source/Caller.java');
  const fingerprint = (files) =>
    fingerprintInventory(files.map((item) => ({ ...item, sizeBytes: raw.length })));
  if (
    file.path !== 'Caller.java' ||
    file.contentFingerprint !== `sha256:${hash(raw)}` ||
    file.repositoryId !== revision.repositoryId ||
    file.revisionId !== revision.id ||
    file.classification.role !== 'SOURCE' ||
    file.classification.provenance !== 'AUTHORED' ||
    file.classification.contentKind !== 'TEXT' ||
    file.languageHint !== 'java' ||
    fingerprint([file]) !== revision.contentFingerprint
  )
    invalid();
  const baseline = { revision, files: [file] };
  const target = structuredClone(baseline);
  target.files[0].classification.role = 'TEST';
  target.revision.contentFingerprint = fingerprint(target.files);
  await pinnedInputs.assertUnchanged();
  const visible = {
    basis: 'DECLARED_SOURCE_IR',
    baseline: structuredClone(baseline),
    target: structuredClone(target),
  };
  const handle = structuredClone(visible);
  declaredMetadataTargets.set(handle, { pinnedInputs, baseline, target, visible });
  return Object.freeze(handle);
}

async function runDeclaredMetadataOperation(request, declared) {
  const config = request.configuration;
  // The same production admission precedes opening SQL, changing Source or spawn.
  if (request.operation === 'FULL')
    assertNativeMetadataAdmission(config.resourceBudget.maxMemoryBytes, 'FULL_TRANSPORT');
  else assertNativeRefreshTransportAdmission(config.resourceBudget.maxMemoryBytes);
  const effective = resolveNativeWorkerConfig(
    config,
    config.resourceBudget,
    availableParallelism(),
    16 * 1024 * 1024,
  );
  const launch = {
    executablePath: request.nativeExecutablePath,
    timeoutMs: config.resourceBudget.maxDurationMs,
    arguments: nativeLaunchArguments(effective),
    limits: config.transportLimits,
    allowedEnvironment: Object.fromEntries(
      ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
        .filter((key) => process.env[key] !== undefined)
        .map((key) => [key, process.env[key]]),
    ),
  };
  const handshake = await executeNativeRequest(
    {
      protocolVersion: 1,
      requestId: randomUUID(),
      type: 'DESCRIBE',
      payload: { clientProtocolVersions: [1], clientIrSchemaVersions: [1] },
    },
    { ...launch, arguments: [] },
  );
  if (handshake.terminal.type !== 'DESCRIBE_COMPLETED')
    throw new Error('Missing Native descriptor');
  const descriptor = handshake.terminal.payload;
  const requestedCapabilities = ['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'];
  const context = {
    providerId: descriptor.providerId,
    providerVersion: descriptor.providerVersion,
    language: descriptor.languages.find((language) => language.languageId === 'java'),
    resolverVersion: '1',
    normalizerVersion: JAVA_NORMALIZER_VERSION,
    policyFingerprint: `sha256:${hash(JSON.stringify(config.source))}`,
  };
  const control = createQueryControl({
    maxMetadataRows: config.resourceBudget.maxEvents,
    maxNodes: config.resourceBudget.maxEvents,
    maxEdges: config.resourceBudget.maxEvents,
    maxResultBytes: config.transportLimits.maxStdoutBytes,
    timeoutMs: config.resourceBudget.maxDurationMs,
  });
  const session = await openRepositoryIndexSession(
    {
      databasePath: request.databasePath,
      repositoryId: request.repositoryId,
      repositoryRoot: request.repositoryRoot,
      initialize: false,
      readOnly: false,
    },
    control,
  );
  try {
    await declared.pinnedInputs.assertUnchanged();
    if (!isDeepStrictEqual(session.sourceState.load(request.repositoryId), declared.baseline))
      throw new Error('Declared metadata baseline changed');
    session.sourceState.replace(declared.baseline, declared.target);
    const target = declared.target;
    const trustedContext = {
      ...context,
      repositoryId: request.repositoryId,
      revisionId: target.revision.id,
      contentFingerprint: target.revision.contentFingerprint,
      requestedCapabilities,
    };
    const common = {
      irSchemaVersion: 1,
      providerSnapshotId: randomUUID(),
      repository: { id: request.repositoryId, rootPath: request.repositoryRoot },
      requestedCapabilities,
      deadlineEpochMs: null,
      resourceBudget: config.resourceBudget,
      analysisStateContext: context,
    };
    const measurement =
      request.operation === 'FULL'
        ? await applyNativeFullBootstrap(
            session.database,
            {
              protocolVersion: 3,
              requestId: randomUUID(),
              sequence: 0,
              type: 'ANALYZE',
              payload: {
                ...common,
                revision: target.revision,
                sourceFiles: target.files,
                baselineState: null,
              },
            },
            launch,
            descriptor,
            trustedContext,
          )
        : await applyNativeRefreshAnalysisV3(
            session.database,
            config.resourceBudget.maxMemoryBytes,
            () => ({
              requestId: randomUUID(),
              descriptor,
              trustedContext,
              payload: { ...common, targetRevision: target.revision },
            }),
            launch,
          );
    return {
      basis: 'DECLARED_SOURCE_IR',
      operation: request.operation,
      measurement,
      workers: { requested: effective.requested, effectiveCount: effective.effectiveCount },
    };
  } finally {
    session.close();
  }
}

async function runPhase05OwnedTrial(
  { request: value, receiptDirectory, priorReceipts = [], signal, expectedNativeOutcome },
  declared,
) {
  const request = parseIndexRequest(value);
  if (request.operation === 'STATUS') throw new IndexCommandError('INVALID_REQUEST');
  if (
    expectedNativeOutcome !== undefined &&
    (expectedNativeOutcome !== 'PARTIAL' || request.operation !== 'INCREMENTAL')
  )
    throw new IndexCommandError('INVALID_REQUEST');
  const sequence = ++trialSequence;
  const prerequisiteError = () => {
    throw new Error('Trial prerequisite receipt integrity invalid');
  };
  if (
    !Array.isArray(priorReceipts) ||
    types.isProxy(priorReceipts) ||
    Object.getPrototypeOf(priorReceipts) !== Array.prototype ||
    Reflect.ownKeys(priorReceipts).length !== priorReceipts.length + 1
  )
    prerequisiteError();
  const prerequisites = [];
  for (let index = 0; index < priorReceipts.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(priorReceipts, String(index));
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, 'value') ||
      !trialReceipts.has(descriptor.value)
    )
      prerequisiteError();
    prerequisites.push(descriptor.value);
  }
  for (const receipt of prerequisites) await receipt.assertUnchanged();
  if (
    typeof receiptDirectory !== 'string' ||
    !path.isAbsolute(receiptDirectory) ||
    receiptDirectory.includes('\0')
  )
    throw new Error('Invalid trial receipt destination');
  const destination = path.resolve(receiptDirectory);
  const root = path.dirname(destination);
  if ((await realpath(root)) !== root) throw new Error('Trial parent must be canonical');
  for (const filename of [request.databasePath, request.repositoryRoot]) {
    const relative = path.relative(root, path.resolve(filename));
    if (
      relative === '' ||
      relative === '..' ||
      relative.startsWith('..' + path.sep) ||
      path.isAbsolute(relative)
    )
      throw new Error('Trial paths not confined');
  }
  await mkdir(destination);
  const owned = await lstat(destination);
  const rootIdentity = await lstat(root, { bigint: true });
  const receiptPath = path.join(destination, 'receipt.json');
  const writer = await open(receiptPath, 'wx');
  let record, bytes, receiptIdentity;
  try {
    const started = performance.now();
    let result = null,
      error = null,
      nativeObservation = null;
    try {
      const observe =
        expectedNativeOutcome === 'PARTIAL'
          ? observePhase05PartialRefreshOperation
          : observePhase05NativeOperation;
      const observed = await observe(
        {
          executablePath: request.nativeExecutablePath,
          observationConfiguration: request.configuration,
        },
        () =>
          declared
            ? runDeclaredMetadataOperation(request, declared)
            : runIndexCommand(request, { signal }),
      );
      nativeObservation = observed.evidence;
      if (observed.threw) throw observed.error;
      result = observed.value;
    } catch (failure) {
      const controlled =
        failure instanceof IndexCommandError
          ? failure
          : declared &&
              failure instanceof NativeStateValidationError &&
              failure.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED'
            ? new IndexCommandError('RESOURCE_LIMIT_EXCEEDED')
            : new IndexCommandError('INDEX_DATA_INVALID');
      error = { code: controlled.code, message: controlled.message, effects: controlled.effects };
    }
    record = {
      schemaVersion: 1,
      operation: request.operation,
      ...(declared
        ? {
            executionBasis: 'DECLARED_SOURCE_IR',
            declaredSourceSha256: hash(
              JSON.stringify({ baseline: declared.baseline, target: declared.target }),
            ),
          }
        : {}),
      requestSha256: hash(JSON.stringify(request)),
      outcome: error ? 'FAILED' : 'SUCCEEDED',
      result,
      error,
      nativeObservation,
      totalMs: performance.now() - started,
      peak: {
        value: process.resourceUsage().maxRSS * 1024,
        units: 'bytes',
        method: 'resourceUsage.maxRSS',
        scope: 'NODE_PROCESS_LIFETIME_EXCLUDES_NATIVE_CHILD',
      },
    };
    bytes = Buffer.from(JSON.stringify(record, null, 2) + '\n');
    await writer.writeFile(bytes);
    await writer.sync();
    receiptIdentity = await writer.stat({ bigint: true });
  } finally {
    await writer.close();
  }
  const current = await lstat(destination);
  if (
    !current.isDirectory() ||
    current.isSymbolicLink() ||
    current.dev !== owned.dev ||
    current.ino !== owned.ino ||
    (await realpath(destination)) !== destination
  )
    throw new Error('Trial receipt ownership changed');
  const sha256 = hash(bytes);
  const receiptLength = bytes.length;
  bytes = undefined;
  const guard = async () => {
    const parent = await lstat(root, { bigint: true });
    const directory = await lstat(destination);
    if (
      parent.dev !== rootIdentity.dev ||
      parent.ino !== rootIdentity.ino ||
      parent.isSymbolicLink() ||
      !parent.isDirectory() ||
      (await realpath(root)) !== root ||
      directory.dev !== owned.dev ||
      directory.ino !== owned.ino ||
      directory.isSymbolicLink() ||
      !directory.isDirectory() ||
      (await realpath(destination)) !== destination
    )
      prerequisiteError();
    const named = await lstat(receiptPath, { bigint: true });
    const matches = (info) =>
      info.isFile() &&
      !info.isSymbolicLink() &&
      info.nlink === 1n &&
      ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(
        (field) => info[field] === receiptIdentity[field],
      );
    if (!matches(named) || (await realpath(receiptPath)) !== receiptPath) prerequisiteError();
    const reader = await open(receiptPath, 'r');
    try {
      if (!matches(await reader.stat({ bigint: true }))) prerequisiteError();
      const retained = Buffer.alloc(receiptLength);
      let offset = 0;
      while (offset < retained.length) {
        const { bytesRead } = await reader.read(retained, offset, retained.length - offset, offset);
        if (!bytesRead) prerequisiteError();
        offset += bytesRead;
      }
      if (
        (await reader.read(Buffer.alloc(1), 0, 1, offset)).bytesRead !== 0 ||
        hash(retained) !== sha256 ||
        !matches(await reader.stat({ bigint: true })) ||
        !matches(await lstat(receiptPath, { bigint: true })) ||
        (await realpath(receiptPath)) !== receiptPath
      )
        prerequisiteError();
    } finally {
      await reader.close();
    }
  };
  const saved = Object.freeze({
    receiptPath,
    sha256,
    async assertUnchanged() {
      // Same-process owned prerequisites, not rehydrated cross-process proof.
      try {
        for (const receipt of prerequisites) await receipt.assertUnchanged();
        await guard();
      } catch {
        prerequisiteError();
      }
    },
  });
  await saved.assertUnchanged();
  trialReceipts.add(saved);
  trialReceiptTargets.set(saved, { databasePath: request.databasePath, sequence });
  return saved;
}

// Evaluation-only replay of a closed, exclusively owned file. This is not a
// production rollback, Canonical writer or filesystem lease against competitors.
// A sequencing guard around the existing owned restore, never another restore
// engine or a statement that the failed invocation was Native PARTIAL.
export async function inspectPhase05FailedTrialBeforeRestore({ receipt, inspect, restorePoint }) {
  if (!trialReceipts.has(receipt) || typeof inspect !== 'function')
    throw new Error('Failed-trial inspection requires an owned receipt');
  await receipt.assertUnchanged();
  const record = JSON.parse(await readFile(receipt.receiptPath, 'utf8'));
  if (record.outcome !== 'FAILED') throw new Error('Failed-trial inspection requires failure');
  const inspection = await inspect();
  await receipt.assertUnchanged();
  const restored = await restorePoint.restore({ receipt });
  return { inspection, restored };
}

export async function preparePhase05RestorePoint({ directory, sourcePath, targetPath, maxBytes }) {
  const root = path.resolve(directory);
  if (
    [directory, sourcePath, targetPath].some(
      (value) => typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0'),
    ) ||
    path.dirname(sourcePath) !== root ||
    path.dirname(targetPath) !== root ||
    sourcePath === targetPath ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    (await realpath(root)) !== root
  )
    throw new Error('Invalid restore ownership controls');
  const rootInfo = await lstat(root, { bigint: true });
  const sourceInfo = await lstat(sourcePath, { bigint: true });
  const targetInfo = await lstat(targetPath, { bigint: true });
  const regular = (info) => info.isFile() && !info.isSymbolicLink() && info.nlink === 1n;
  if (
    !rootInfo.isDirectory() ||
    rootInfo.isSymbolicLink() ||
    !regular(sourceInfo) ||
    !regular(targetInfo)
  )
    throw new Error('Invalid restore files');
  const same = (a, b, fields) => fields.every((field) => a[field] === b[field]);
  const stable = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'];
  const guard = async () => {
    const currentRoot = await lstat(root, { bigint: true });
    const currentSource = await lstat(sourcePath, { bigint: true });
    const currentTarget = await lstat(targetPath, { bigint: true });
    if (
      !currentRoot.isDirectory() ||
      currentRoot.isSymbolicLink() ||
      !same(currentRoot, rootInfo, ['dev', 'ino']) ||
      !regular(currentSource) ||
      !same(currentSource, sourceInfo, stable) ||
      !regular(currentTarget) ||
      !same(currentTarget, targetInfo, ['dev', 'ino']) ||
      (await realpath(root)) !== root ||
      (await realpath(sourcePath)) !== sourcePath ||
      (await realpath(targetPath)) !== targetPath
    )
      throw new Error('Restore ownership changed');
    for (const filename of [sourcePath, targetPath])
      for (const suffix of ['-wal', '-shm', '-journal']) {
        try {
          await lstat(filename + suffix);
        } catch (error) {
          if (error.code === 'ENOENT') continue;
          throw error;
        }
        throw new Error('Restore requires closed SQLite files');
      }
  };
  await guard();
  const location = await mkdtemp(path.join(root, `restore-${path.basename(targetPath)}-`));
  const owned = await lstat(location, { bigint: true });
  const seedPath = path.join(location, 'seed.sqlite');
  const seed = await copyPhase05ClosedSeed({
    directory: root,
    sourcePath,
    targetPath: seedPath,
    maxBytes,
  });
  const seedInfo = await lstat(seedPath, { bigint: true });
  // Validate the initial target as a closed SQLite image; retain it for audit.
  const initial = await copyPhase05ClosedSeed({
    directory: root,
    sourcePath: targetPath,
    targetPath: path.join(location, 'initial.sqlite'),
    maxBytes,
  });
  if (initial.sha256 !== seed.sha256) throw new Error('Restore seed differs from original image');
  await guard();
  const capturedSequence = trialSequence;
  const owner = Symbol();
  restorePointOwners.set(targetPath, owner);
  let used = false;
  return Object.freeze({
    async restore({ receipt }) {
      const issued = trialReceiptTargets.get(receipt);
      if (
        used ||
        restorePointOwners.get(targetPath) !== owner ||
        !trialReceipts.has(receipt) ||
        issued?.databasePath !== targetPath ||
        issued.sequence <= capturedSequence
      )
        throw new Error('Restore requires its original trial receipt');
      await receipt.assertUnchanged();
      await guard();
      const current = await lstat(location, { bigint: true });
      const currentSeed = await lstat(seedPath, { bigint: true });
      if (
        !current.isDirectory() ||
        current.isSymbolicLink() ||
        !same(current, owned, ['dev', 'ino']) ||
        (await realpath(location)) !== location ||
        !regular(currentSeed) ||
        !same(currentSeed, seedInfo, stable)
      )
        throw new Error('Restore snapshot ownership changed');
      const archivePath = path.join(location, 'interrupted.sqlite');
      try {
        await lstat(archivePath);
        throw new Error('Restore archive already exists');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      // The failure receipt is durable and authenticated before any relocation.
      // Preserve the original file, even if the following exclusive copy fails.
      await receipt.assertUnchanged();
      await guard();
      if (restorePointOwners.get(targetPath) !== owner)
        throw new Error('Restore ownership superseded');
      used = true;
      restorePointOwners.delete(targetPath);
      await rename(targetPath, archivePath);
      const archived = await lstat(archivePath, { bigint: true });
      if (!regular(archived) || !same(archived, targetInfo, ['dev', 'ino']))
        throw new Error('Restore archive ownership changed');
      const restored = await copyPhase05ClosedSeed({
        directory: root,
        sourcePath: seedPath,
        targetPath,
        maxBytes,
      });
      if (restored.sha256 !== seed.sha256) throw new Error('Restore snapshot digest changed');
      await receipt.assertUnchanged();
      return Object.freeze({
        restored: true,
        path: restored.path,
        sha256: restored.sha256,
        archivePath: path.relative(root, archivePath).split(path.sep).join('/'),
      });
    },
  });
}

// Copies a closed SQLite input, not an accepted Canonical/reference workflow.
// The caller still proves seed provenance and owns later restore/publication.
export async function copyPhase05ClosedSeed({ directory, sourcePath, targetPath, maxBytes }) {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    [directory, sourcePath, targetPath].some(
      (value) => typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0'),
    )
  )
    throw new Error('Invalid closed seed control');
  const root = path.resolve(directory);
  const source = path.resolve(sourcePath),
    target = path.resolve(targetPath);
  const inside = (filename) => {
    const relative = path.relative(root, filename);
    return (
      relative !== '' &&
      relative !== '..' &&
      !relative.startsWith('..' + path.sep) &&
      !path.isAbsolute(relative)
    );
  };
  if (
    !inside(source) ||
    !inside(target) ||
    source === target ||
    (await realpath(root)) !== root ||
    (await realpath(source)) !== source ||
    (await realpath(path.dirname(target))) !== path.dirname(target)
  )
    throw new Error('Closed seed path not confined');
  const owned = await lstat(root),
    original = await lstat(source);
  if (
    !owned.isDirectory() ||
    owned.isSymbolicLink() ||
    !original.isFile() ||
    original.isSymbolicLink() ||
    original.nlink !== 1 ||
    original.size > maxBytes
  )
    throw new Error('Closed seed file invalid');
  const guard = async () => {
    const current = await lstat(root),
      named = await lstat(source);
    if (
      current.dev !== owned.dev ||
      current.ino !== owned.ino ||
      current.isSymbolicLink() ||
      (await realpath(root)) !== root ||
      named.dev !== original.dev ||
      named.ino !== original.ino ||
      named.size !== original.size ||
      named.mtimeMs !== original.mtimeMs ||
      named.ctimeMs !== original.ctimeMs ||
      named.nlink !== 1 ||
      named.isSymbolicLink() ||
      (await realpath(source)) !== source ||
      (await realpath(path.dirname(target))) !== path.dirname(target)
    )
      throw new Error('Closed seed ownership changed');
    for (const filename of [source, target])
      for (const suffix of ['-wal', '-shm', '-journal']) {
        try {
          await lstat(filename + suffix);
        } catch (error) {
          if (error.code === 'ENOENT') continue;
          throw error;
        }
        throw new Error('Closed seed sidecar present');
      }
  };
  await guard();
  const reader = await open(source, 'r');
  let bytes;
  try {
    const info = await reader.stat();
    if (
      info.dev !== original.dev ||
      info.ino !== original.ino ||
      info.nlink !== 1 ||
      info.size > maxBytes
    )
      throw new Error('Closed seed ownership changed');
    // Fix the allocation/read extent to the checked size. A growing file
    // cannot make readFile allocate beyond the explicit caller budget.
    bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await reader.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) throw new Error('Closed seed truncated');
      offset += bytesRead;
    }
    const end = await reader.read(Buffer.alloc(1), 0, 1, offset);
    if (end.bytesRead !== 0) throw new Error('Closed seed grew');
    if (
      bytes.length > maxBytes ||
      bytes.subarray(0, 16).toString() !== 'SQLite format 3\0' ||
      bytes[18] !== 1 ||
      bytes[19] !== 1
    )
      throw new Error('Closed seed requires rollback-journal SQLite');
    await guard();
  } finally {
    await reader.close();
  }
  const database = new DatabaseSync(source, { readOnly: true });
  try {
    database.exec('PRAGMA query_only = ON');
    const result = database.prepare('PRAGMA quick_check').get();
    if (result?.quick_check !== 'ok') throw new Error('Closed seed SQLite invalid');
  } finally {
    database.close();
  }
  await guard();
  const writer = await open(target, 'wx');
  let written;
  try {
    await writer.writeFile(bytes);
    await writer.sync();
    written = await writer.stat();
  } finally {
    await writer.close();
  }
  await guard();
  const named = await lstat(target);
  if (
    !named.isFile() ||
    named.isSymbolicLink() ||
    named.nlink !== 1 ||
    named.dev !== written.dev ||
    named.ino !== written.ino ||
    (await realpath(target)) !== target
  )
    throw new Error('Closed seed output changed');
  return Object.freeze({
    path: path.relative(root, target).split(path.sep).join('/'),
    sha256: hash(bytes),
    byteLength: bytes.length,
  });
}

// Reference/trial facts must come from the same validated Source seed.
// This guard never rewrites a FactKey, revision or semantic payload to align it.
export function comparePhase05SourceBoundFacts({
  expected,
  actual,
  criticalSymbols,
  criticalDirectCalls,
}) {
  const bindings = bindPhase05SourceIdentity(expected.sourceFiles, actual.sourceFiles);
  for (const [reference, observed] of bindings)
    if (reference !== observed)
      throw new Error('Phase05 comparison requires shared Source identities');
  const validate = (image) => {
    const sourceFiles = SourceFileSchema.array().parse(image.sourceFiles);
    const files = new Map(sourceFiles.map((file) => [file.id, file]));
    const contexts = new Set(
      sourceFiles.map((file) => JSON.stringify([file.repositoryId, file.revisionId])),
    );
    if (contexts.size > 1) throw new Error('Phase05 Source context mismatch');
    const nodes = CanonicalNodeSchema.array().parse(image.facts.nodes);
    const edges = CanonicalEdgeSchema.array().parse(image.facts.edges);
    const nodeIds = new Set(nodes.map((node) => node.id));
    for (const fact of [...nodes, ...edges]) {
      if (!contexts.has(JSON.stringify([fact.repositoryId, fact.revisionId])))
        throw new Error('Phase05 fact context mismatch');
      if (fact.sourceRange && !files.has(fact.sourceRange.sourceFileId))
        throw new Error('Phase05 fact Source reference missing');
    }
    for (const edge of edges) {
      const targets =
        edge.target.state === 'RESOLVED' ? [edge.target.target] : edge.target.candidates;
      if (!nodeIds.has(edge.source.id) || targets.some((target) => !nodeIds.has(target.id)))
        throw new Error('Phase05 fact node reference missing');
    }
    return { nodes, edges };
  };
  return evaluatePhase05Facts({
    expected: validate(expected),
    actual: validate(actual),
    criticalSymbols,
    criticalDirectCalls,
  });
}

// FULL and REFRESH have different immutable Evidence/snapshot histories. Compare
// active support semantics only after independently checking every stored link.
// This proves neither coverage nor activation/Native/receipt authenticity.
export function comparePhase05ActiveSupports(input) {
  const refuse = () => {
    throw new Error('Phase05 active support integrity invalid');
  };
  const plain = (value, seen = new Set()) => {
    if (value === null || typeof value !== 'object') return;
    if (types.isProxy(value) || seen.has(value)) refuse();
    seen.add(value);
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) refuse();
    const keys = Reflect.ownKeys(value);
    if (array && keys.length !== value.length + 1) refuse();
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
        refuse();
      plain(descriptor.value, seen);
    }
    seen.delete(value);
  };
  const exact = (value, fields) => {
    if (
      !value ||
      Array.isArray(value) ||
      Object.keys(value).length !== fields.length ||
      fields.some((field) => !Object.hasOwn(value, field))
    )
      refuse();
  };
  const unique = (rows, key) => {
    const result = new Map();
    for (const row of rows) {
      const id = key(row);
      if (result.has(id)) refuse();
      result.set(id, row);
    }
    return result;
  };
  const refKey = (ref) => JSON.stringify([ref.factType, ref.id]);
  const signature = (image) => {
    exact(image, [
      'sourceFiles',
      'facts',
      'snapshots',
      'evidence',
      'bindings',
      'factEvidence',
      'candidates',
    ]);
    exact(image.facts, ['nodes', 'edges']);
    const files = SourceFileSchema.array().parse(image.sourceFiles);
    const filesById = unique(files, (file) => file.id);
    const contexts = new Set(
      files.map((file) => JSON.stringify([file.repositoryId, file.revisionId])),
    );
    const facts = unique(
      [
        ...CanonicalNodeSchema.array()
          .parse(image.facts.nodes)
          .map((candidate) => ({ factType: 'NODE', candidate })),
        ...CanonicalEdgeSchema.array()
          .parse(image.facts.edges)
          .map((candidate) => ({ factType: 'EDGE', candidate })),
      ],
      (row) => refKey({ factType: row.factType, id: row.candidate.id }),
    );
    const snapshots = unique(
      ProviderSnapshotSchema.array().parse(image.snapshots),
      (snapshot) => snapshot.id,
    );
    const evidence = unique(EvidenceSchema.array().parse(image.evidence), (item) => item.id);
    const bindings = unique(
      ProviderFactBindingSchema.array().parse(image.bindings),
      (binding) => binding.evidenceId,
    );
    const links = unique(
      FactEvidenceSchema.array().parse(image.factEvidence),
      (link) => link.evidenceId,
    );
    if (!Array.isArray(image.candidates)) refuse();
    const candidates = unique(
      image.candidates.map((row) => {
        exact(row, ['fact', 'evidenceId', 'candidate']);
        const fact = CanonicalFactRefSchema.parse(row.fact);
        return {
          fact,
          evidenceId: EntityIdSchema.parse(row.evidenceId),
          candidate: (fact.factType === 'NODE' ? CanonicalNodeSchema : CanonicalEdgeSchema).parse(
            row.candidate,
          ),
        };
      }),
      (row) => row.evidenceId,
    );
    const active = new Set(),
      supported = new Set(),
      providerFacts = new Set(),
      result = [];
    for (const item of evidence.values()) {
      const snapshot = snapshots.get(item.providerSnapshotId);
      if (
        !snapshot ||
        snapshot.repositoryId !== item.repositoryId ||
        snapshot.requestedRevisionId !== item.revisionId ||
        snapshot.providerId !== item.providerFact.providerId
      )
        refuse();
      if (item.status !== 'ACTIVE') continue;
      if (
        snapshot.outcome !== 'SUCCEEDED' ||
        !contexts.has(JSON.stringify([item.repositoryId, item.revisionId]))
      )
        refuse();
      const binding = bindings.get(item.id),
        link = links.get(item.id),
        row = candidates.get(item.id);
      if (
        !binding ||
        !link ||
        !row ||
        binding.providerSnapshotId !== item.providerSnapshotId ||
        !isDeepStrictEqual(binding.providerFact, item.providerFact) ||
        !isDeepStrictEqual(binding.canonicalFact, link.fact) ||
        !isDeepStrictEqual(binding.canonicalFact, row.fact)
      )
        refuse();
      const fact = facts.get(refKey(row.fact));
      if (
        !fact ||
        row.candidate.id !== row.fact.id ||
        row.candidate.factKey !== fact.candidate.factKey ||
        row.candidate.kind !== fact.candidate.kind ||
        row.candidate.repositoryId !== item.repositoryId ||
        row.candidate.revisionId !== item.revisionId ||
        (row.candidate.sourceRange && !filesById.has(row.candidate.sourceRange.sourceFileId))
      )
        refuse();
      if (row.fact.factType === 'EDGE') {
        const targets =
          row.candidate.target.state === 'RESOLVED'
            ? [row.candidate.target.target]
            : row.candidate.target.candidates;
        if (
          !facts.has(refKey(row.candidate.source)) ||
          targets.some((target) => !facts.has(refKey(target)))
        )
          refuse();
      }
      const providerKey = JSON.stringify([
        item.providerFact.factType,
        item.providerFact.providerId,
        item.providerFact.providerFactId,
      ]);
      if (providerFacts.has(providerKey)) refuse();
      providerFacts.add(providerKey);
      active.add(item.id);
      supported.add(refKey(row.fact));
      result.push({
        providerFact: item.providerFact,
        fact: row.fact,
        candidate: row.candidate,
        providerVersion: snapshot.providerVersion,
        runtimeVersion: snapshot.runtimeVersion,
      });
    }
    if (
      [bindings, links, candidates].some(
        (rows) => rows.size !== active.size || [...rows.keys()].some((id) => !active.has(id)),
      ) ||
      [...facts.keys()].some((key) => !supported.has(key))
    )
      refuse();
    // IR parsing gives canonical property order; sorting changes no payload.
    return result.map((row) => JSON.stringify(row)).sort();
  };
  try {
    plain(input);
    exact(input, ['expected', 'actual']);
    comparePhase05SourceBoundFacts({ ...input, criticalSymbols: [], criticalDirectCalls: [] });
    return {
      supportEqual: isDeepStrictEqual(signature(input.expected), signature(input.actual)),
      staleBindings: 0,
    };
  } catch {
    refuse();
  }
}

// Persists validated report data only; this does not authenticate trial evidence.
export async function persistPhase05Report({ directory, input }) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || directory.includes('\0'))
    throw new Error('Invalid report destination');
  if (!input || typeof input !== 'object' || types.isProxy(input))
    throw new Error('Invalid report version');
  const version = Object.getOwnPropertyDescriptor(input, 'schemaVersion');
  if (!version || !Object.hasOwn(version, 'value')) throw new Error('Invalid report version');
  const evaluate =
    version.value === 1
      ? evaluatePhase05Report
      : version.value === 2
        ? evaluatePhase05LayeredReport
        : null;
  if (!evaluate) throw new Error('Invalid report version');
  const report = evaluate(input);
  const destination = path.resolve(directory);
  if ((await realpath(path.dirname(destination))) !== path.dirname(destination))
    throw new Error('Report parent must be canonical');
  await mkdir(destination);
  const owned = await lstat(destination);
  const assertOwned = async () => {
    const current = await lstat(destination);
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.dev !== owned.dev ||
      current.ino !== owned.ino ||
      (await realpath(destination)) !== destination
    )
      throw new Error('Report ownership changed');
  };
  await assertOwned();
  const reportPath = path.join(destination, 'report.json');
  const handle = await open(reportPath, 'wx');
  try {
    await handle.writeFile(JSON.stringify(report, null, 2) + '\n');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await assertOwned();
  return reportPath;
}

// Snapshot original fixture bytes, not measured output. Revalidation is a
// point-in-time guard, not a filesystem lease or Native admission proof.
export async function capturePhase05PinnedInputs({ repositoryRoot }) {
  if (
    typeof repositoryRoot !== 'string' ||
    !path.isAbsolute(repositoryRoot) ||
    repositoryRoot.includes('\0')
  )
    throw new Error('Pinned fixture root invalid');
  const root = path.resolve(repositoryRoot);
  if ((await realpath(root)) !== root) throw new Error('Pinned fixture root must be canonical');
  const catalog = JSON.parse(await readFile(new URL('inputs/scenarios.json', fixture), 'utf8'));
  const capture = async () => {
    const bytes = new Map();
    for (const pin of catalog.fixtures) {
      const directory = path.join(root, pin.directory);
      if ((await realpath(directory)) !== directory)
        throw new Error('Pinned fixture directory linked');
      const records = [];
      const walk = async (base, prefix = '') => {
        for (const entry of await readdir(base, { withFileTypes: true })) {
          const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
          const filename = path.join(base, entry.name);
          const before = await lstat(filename);
          if (before.isSymbolicLink() || (await realpath(filename)) !== filename)
            throw new Error('Pinned fixture path linked');
          if (before.isDirectory()) await walk(filename, relative);
          else {
            if (!before.isFile() || before.nlink !== 1)
              throw new Error('Pinned fixture file invalid');
            const handle = await open(filename, 'r');
            let content;
            try {
              const opened = await handle.stat();
              if (
                opened.dev !== before.dev ||
                opened.ino !== before.ino ||
                opened.nlink !== 1 ||
                !opened.isFile()
              )
                throw new Error('Pinned fixture file changed');
              content = await handle.readFile();
              const after = await handle.stat();
              const named = await lstat(filename);
              if (
                after.dev !== opened.dev ||
                after.ino !== opened.ino ||
                after.size !== opened.size ||
                after.mtimeMs !== opened.mtimeMs ||
                after.ctimeMs !== opened.ctimeMs ||
                after.nlink !== 1 ||
                named.dev !== opened.dev ||
                named.ino !== opened.ino ||
                named.isSymbolicLink() ||
                (await realpath(filename)) !== filename
              )
                throw new Error('Pinned fixture file changed');
            } finally {
              await handle.close();
            }
            records.push({ path: relative, sha256: hash(content) });
            bytes.set(`${pin.fixtureId}\0${relative}`, content);
          }
        }
      };
      await walk(directory);
      records.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      if (records.length !== pin.fileCount || hash(JSON.stringify(records)) !== pin.sha256)
        throw new Error('Pinned fixture digest mismatch');
      const manifest = JSON.parse(bytes.get(`${pin.fixtureId}\0fixture.json`).toString('utf8'));
      if (manifest.id !== pin.fixtureId) throw new Error('Pinned fixture identity mismatch');
    }
    return bytes;
  };
  const bytes = await capture();
  const pinned = Object.freeze({
    fixtures: Object.freeze(catalog.fixtures.map((pin) => Object.freeze({ ...pin }))),
    filePaths(fixtureId) {
      if (!catalog.fixtures.some((pin) => pin.fixtureId === fixtureId))
        throw new Error('Pinned fixture identity not declared');
      return [...bytes.keys()]
        .filter((key) => key.startsWith(`${fixtureId}\0`))
        .map((key) => key.slice(fixtureId.length + 1))
        .sort();
    },
    readFile(fixtureId, relative) {
      const content = bytes.get(`${fixtureId}\0${relative}`);
      if (!content) throw new Error('Pinned fixture file not declared');
      return Buffer.from(content);
    },
    async assertUnchanged() {
      await capture();
    },
  });
  capturedFixturePins.add(pinned);
  return pinned;
}

// Original pure Fixture contracts. This deliberately does not certify Native
// extraction, SQLite activation/removal, coverage or resource closure.
export function comparePhase05PinnedContractResult({ pinnedInputs, fixtureId, actual }) {
  if (!capturedFixturePins.has(pinnedInputs)) throw new Error('Unowned Fixture reader');
  const read = (id, name) => JSON.parse(pinnedInputs.readFile(id, name));
  let checks, observedCounts;
  if (fixtureId === 'canonical-normalization') {
    checks = {
      nodes: isDeepStrictEqual(actual.nodes, read(fixtureId, 'expected/nodes.json')),
      edges: isDeepStrictEqual(actual.edges, read(fixtureId, 'expected/edges.json')),
    };
    observedCounts = { nodes: actual.nodes.length, edges: actual.edges.length };
  } else if (fixtureId === 'two-provider-same-call') {
    const expected = read(fixtureId, 'expected/lifetimes.json');
    const summary = (result) => ({
      nodes: result.nodes.map((value) => value.id),
      edges: result.edges.map((value) => value.id),
      evidence: result.evidence.map((value) => value.id),
      bindings: result.bindings.map((value) => value.evidenceId),
      confidence: result.edges.map((value) => value.confidence),
    });
    checks = Object.fromEntries(
      ['full', 'one', 'zero'].map((role) => [
        role,
        isDeepStrictEqual(summary(actual[role]), expected[role]) &&
          hash(JSON.stringify(actual[role])) === expected[`${role}Digest`],
      ]),
    );
    checks.reverse = isDeepStrictEqual(actual.full, actual.reverse);
    observedCounts = Object.fromEntries(
      ['full', 'one', 'zero'].map((role) => [
        role,
        Object.fromEntries(
          ['nodes', 'edges', 'evidence', 'bindings'].map((field) => [
            field,
            actual[role][field].length,
          ]),
        ),
      ]),
    );
  } else throw new Error('Unsupported pure Fixture contract');
  return {
    schemaVersion: 1,
    kind: 'PHASE05_PINNED_CONTRACT',
    fixtureId,
    evidenceScope: 'PURE_PROVIDER_CONTRACT_ONLY',
    matches: Object.values(checks).every(Boolean),
    checks,
    observedCounts,
    actualDigest: hash(JSON.stringify(actual)),
  };
}

function executePhase05PinnedContract({ pinnedInputs, fixtureId }, capture) {
  if (!capturedFixturePins.has(pinnedInputs)) throw new Error('Unowned Fixture reader');
  const original = JSON.parse(
    pinnedInputs.readFile('canonical-normalization', 'inputs/result.json'),
  );
  let actual;
  if (fixtureId === 'canonical-normalization') {
    const normalized = normalizeNativeAnalysis(original);
    actual = { nodes: normalized.nodes, edges: normalized.edges };
    capture?.({ original, observations: [], streams: [] });
  } else if (fixtureId === 'two-provider-same-call') {
    const recipe = JSON.parse(pinnedInputs.readFile(fixtureId, 'inputs/analysis.json'));
    if (recipe.sourceFixture !== 'canonical-normalization')
      throw new Error('Unsupported merge source');
    const streams = [];
    const observations = recipe.observations.map((item) => {
      const stream = structuredClone(original);
      // The registered recipe retags Provider/snapshot/request identity only;
      // Source, revision, locations and graph relationships stay literal.
      const rewrite = (value) => {
        if (!value || typeof value !== 'object') return;
        for (const [key, nested] of Object.entries(value)) {
          if (key === 'providerId') value[key] = item.providerId;
          else if (key === 'providerSnapshotId') value[key] = item.snapshot.id;
          else if (key === 'requestId') value[key] = `merge-${item.providerId}`;
          else rewrite(nested);
        }
      };
      rewrite(stream);
      const isFact = (event) => ['NODE', 'EDGE'].includes(event.type);
      const facts = stream.events.filter(isFact);
      if (item.eventOrder === 'REVERSE') facts.reverse();
      else if (item.eventOrder !== 'FORWARD') throw new Error('Unsupported event order');
      let cursor = 0;
      stream.events = stream.events.map((event) => (isFact(event) ? facts[cursor++] : event));
      stream.events.forEach((event, sequence) => {
        event.sequence = sequence;
      });
      stream.events.at(-1).payload.integrityChecksum = `sha256:${hash(
        stream.events
          .slice(0, -1)
          .map((event) => `${JSON.stringify(event)}\n`)
          .join(''),
      )}`;
      stream.terminal = structuredClone(stream.events.at(-1));
      const normalized = normalizeNativeAnalysis(stream);
      streams.push(stream);
      const selected = (field, ids) => {
        const pairs = normalized[field].filter((pair) =>
          ids.includes(pair.provider.providerFactId),
        );
        if (pairs.length !== ids.length) throw new Error('Merge recipe support missing');
        return pairs.map((pair) => ({
          ...pair,
          canonical: {
            ...pair.canonical,
            confidence: { score: item.score, method: item.providerId, reasons: [] },
          },
        }));
      };
      return {
        snapshot: item.snapshot,
        nodes: selected('nodes', item.nodeFactIds),
        edges: selected('edges', item.edgeFactIds),
      };
    });
    const merge = (selected) =>
      mergeCanonicalObservations({
        repositoryId: recipe.repositoryId,
        revisionId: recipe.revisionId,
        observations: selected,
      });
    actual = {
      full: merge(observations),
      one: merge([observations[0]]),
      zero: merge([]),
      reverse: merge([...observations].reverse()),
    };
    capture?.({ original, observations, streams });
  } else throw new Error('Unsupported pure Fixture contract');
  return comparePhase05PinnedContractResult({ pinnedInputs, fixtureId, actual });
}

export function runPhase05PinnedContract(input) {
  return executePhase05PinnedContract(input);
}

// Replay recorded Provider inputs through real Application/Store publication.
// Their declared Source inventory is fixture data, not a Git/Native observation.
export async function runPhase05PinnedSqliteContract({
  directory,
  pinnedInputs,
  fixtureId,
  configuration: value,
}) {
  if (
    !capturedFixturePins.has(pinnedInputs) ||
    !['canonical-normalization', 'two-provider-same-call'].includes(fixtureId)
  )
    throw new Error('Unowned SQLite contract inputs');
  const configuration = parseIndexConfiguration(value);
  let inputs;
  if (
    !executePhase05PinnedContract({ pinnedInputs, fixtureId }, (captured) => {
      inputs = captured;
    }).matches
  )
    throw new Error('Original pure contract does not match');
  const { original, observations, streams } = inputs;
  if (
    original.events.length > configuration.resourceBudget.maxEvents ||
    Buffer.byteLength(JSON.stringify(inputs)) >
      Math.min(
        configuration.resourceBudget.maxMemoryBytes,
        configuration.transportLimits.maxStdoutBytes,
      )
  )
    throw new Error('Recorded contract exceeds caller bounds');
  await pinnedInputs.assertUnchanged();
  if (
    typeof directory !== 'string' ||
    !path.isAbsolute(directory) ||
    path.resolve(directory) !== directory ||
    (await realpath(path.dirname(directory))) !== path.dirname(directory)
  )
    throw new Error('SQLite contract destination must be canonical');
  await mkdir(directory);
  const owned = await lstat(directory, { bigint: true });
  const assertOwned = async () => {
    const current = await lstat(directory, { bigint: true });
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.dev !== owned.dev ||
      current.ino !== owned.ino ||
      (await realpath(directory)) !== directory
    )
      throw new Error('SQLite contract ownership changed');
    await pinnedInputs.assertUnchanged();
  };
  const request = original.request.payload;
  const databasePath = path.join(directory, 'working.sqlite');
  const budget = {
    maxMetadataRows: configuration.resourceBudget.maxEvents,
    maxResultBytes: Math.min(
      configuration.transportLimits.maxStdoutBytes,
      configuration.resourceBudget.maxMemoryBytes,
    ),
    timeoutMs: configuration.resourceBudget.maxDurationMs,
  };
  const control = createQueryControl({
    ...budget,
    maxNodes: budget.maxMetadataRows,
    maxEdges: budget.maxMetadataRows,
  });
  let session;
  const phases = [];
  const rejectedPatches = [];
  const closure = { transactionClosed: true, tempClosed: true, connectionClosed: true };
  const acquire = async (initialize) => {
    await assertOwned();
    await control.checkpoint();
    session = await openRepositoryIndexSession(
      {
        databasePath,
        repositoryId: request.repository.id,
        repositoryRoot: directory,
        initialize,
        readOnly: false,
      },
      control,
    );
  };
  const close = () => {
    if (!session) return;
    const db = session.database;
    closure.transactionClosed &&= !db.isTransaction;
    closure.tempClosed &&=
      db
        .prepare("SELECT count(*) AS n FROM sqlite_temp_schema WHERE name NOT LIKE 'sqlite_%'")
        .get().n === 0;
    session.close();
    closure.connectionClosed &&= !db.isOpen;
    session = undefined;
  };
  const read = (role) =>
    readPhase05PublishedState({
      databasePath: path.join(directory, `${role}.sqlite`),
      repositoryId: request.repository.id,
      repositoryRoot: directory,
      budget,
    });
  const nodePairs = JSON.parse(
    pinnedInputs.readFile('canonical-normalization', 'expected/nodes.json'),
  );
  const edgePairs = JSON.parse(
    pinnedInputs.readFile('canonical-normalization', 'expected/edges.json'),
  );
  const golden =
    fixtureId === 'two-provider-same-call'
      ? JSON.parse(pinnedInputs.readFile(fixtureId, 'expected/lifetimes.json'))
      : null;
  const checkImage = (image, role) => {
    const { supports } = image;
    let expected;
    if (golden) {
      expected = Object.fromEntries(
        ['nodes', 'edges'].map((field) => [
          field,
          (field === 'nodes' ? nodePairs : edgePairs)
            .filter((pair) => golden[role][field].includes(pair.canonical.id))
            .map((pair) => ({ ...pair.canonical, confidence: golden[role].confidence[0] })),
        ]),
      );
    } else {
      // The original three Package candidates share one key. The approved
      // source-backed, Provider-Fact tie selects pkg-a, with minimum confidence.
      expected = {
        nodes: nodePairs
          .filter((pair) => !['pkg-b', 'pkg-container'].includes(pair.provider.providerFactId))
          .map((pair) =>
            pair.provider.providerFactId === 'pkg-a'
              ? {
                  ...pair.canonical,
                  confidence: {
                    score: 1,
                    method: 'fact-merger-min-v1',
                    reasons: ['minimum active support score'],
                  },
                }
              : pair.canonical,
          ),
        edges: edgePairs.map((pair) => pair.canonical),
      };
    }
    const comparison = compareCanonicalFacts({ expected, actual: supports.facts });
    const graphEqual = comparison.entries.every(
      (entry) => entry.classification === null && entry.differences.length === 0,
    );
    const active = supports.evidence.filter((row) => row.status === 'ACTIVE');
    const expectedPairs = golden
      ? [...nodePairs, ...edgePairs].filter((pair) =>
          golden.full[pair.provider.factType === 'NODE' ? 'nodes' : 'edges'].includes(
            pair.canonical.id,
          ),
        )
      : [...nodePairs, ...edgePairs];
    const supportCandidatesEqual = supports.candidates.every((row) => {
      const evidence = active.find((item) => item.id === row.evidenceId);
      const pair = expectedPairs.find(
        (item) =>
          item.provider.factType === evidence?.providerFact.factType &&
          item.provider.providerFactId === evidence.providerFact.providerFactId,
      );
      if (!pair) return false;
      const observation = observations.find(
        (item) => item.snapshot.providerId === evidence.providerFact.providerId,
      );
      if (golden ? !observation : evidence.providerFact.providerId !== 'native') return false;
      const candidate = observation
        ? { ...pair.canonical, confidence: observation.nodes[0].canonical.confidence }
        : pair.canonical;
      return isDeepStrictEqual(row.candidate, candidate);
    });
    const activeIds = active.map((item) => item.id).sort();
    const supportEqual = golden
      ? isDeepStrictEqual(activeIds, golden[role].evidence) &&
        isDeepStrictEqual(
          supports.bindings.map((item) => item.evidenceId).sort(),
          golden[role].bindings,
        )
      : active.length === nodePairs.length + edgePairs.length &&
        supports.bindings.length === active.length;
    const historyEqual = golden
      ? isDeepStrictEqual(supports.evidence.map((item) => item.id).sort(), golden.full.evidence) &&
        supports.evidence.every(
          (item) =>
            item.status === (golden[role].evidence.includes(item.id) ? 'ACTIVE' : 'INVALIDATED'),
        )
      : supports.evidence.every((item) => item.status === 'ACTIVE');
    const sourceEqual =
      isDeepStrictEqual(image.revision, request.revision) &&
      isDeepStrictEqual(image.indexed, {
        revisionId: request.revision.id,
        contentFingerprint: request.revision.contentFingerprint,
      }) &&
      isDeepStrictEqual(
        [...supports.sourceFiles].sort((a, b) => a.path.localeCompare(b.path)),
        [...request.sourceFiles].sort((a, b) => a.path.localeCompare(b.path)),
      );
    const expectedCoverage = golden
      ? []
      : original.events
          .filter((event) => event.type === 'COVERAGE')
          .map((event) => ({
            providerSnapshotId: request.providerSnapshotId,
            capability: event.payload.capability,
            sourceFileId: event.payload.sourceFileId,
            coverage: event.payload.coverage,
          }));
    const coverageEqual = isDeepStrictEqual(
      [...image.coverage.observations].sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b)),
      ),
      expectedCoverage.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
    return {
      graphEqual,
      supportCandidatesEqual,
      supportEqual,
      historyEqual,
      sourceEqual,
      coverageEqual,
      counts: {
        nodes: supports.facts.nodes.length,
        edges: supports.facts.edges.length,
        activeSupports: active.length,
      },
      imageDigest: hash(JSON.stringify(image)),
    };
  };
  const save = async (role) => {
    close();
    if (!Object.values(closure).every(Boolean)) throw new Error('SQLite contract did not close');
    await assertOwned();
    const copied = await copyPhase05ClosedSeed({
      directory,
      sourcePath: databasePath,
      targetPath: path.join(directory, `${role}.sqlite`),
      maxBytes: configuration.resourceBudget.maxMemoryBytes,
    });
    const image = await read(role);
    const checked = checkImage(image, role);
    if (image.coverage.baseline !== 'MISSING')
      throw new Error('Recorded fixture fabricated Native baseline');
    phases.push({ role, databaseSha256: copied.sha256, ...checked });
    await control.checkpoint();
  };
  const verifyRejectedPatches = async () => {
    // The one-support image is independently checked against the original
    // golden before either refusal. No Canonical-row setup or repair is used.
    const before = await read('one');
    for (const staleBase of [false, true]) {
      await acquire(false);
      const stage = new RepositoryPatchStage(
        session.database,
        (group) => selectMergedGroup(group).fact,
      );
      const snapshot = {
        ...observations[0].snapshot,
        id: staleBase ? 'phase05-rejected-stale-base' : 'phase05-rejected-dangling-node',
        requestedRevisionFingerprint: request.revision.contentFingerprint,
      };
      const expectedCode = staleBase ? 'BASE_REVISION_MISMATCH' : 'INVALID_PATCH';
      let errorCode;
      try {
        await stage.accept({
          type: 'REMOVE_NODE',
          payload: { factType: 'NODE', providerId: 'alpha', providerFactId: 'method-run' },
        });
        stage.confirmSucceeded({
          type: 'REFRESH_COMPLETED',
          payload: {
            repositoryId: snapshot.repositoryId,
            revisionId: snapshot.requestedRevisionId,
            revisionFingerprint: snapshot.requestedRevisionFingerprint,
            providerSnapshotId: snapshot.id,
            outcome: 'SUCCEEDED',
            counts: {
              sourceFiles: 0,
              upsertedNodes: 0,
              removedNodes: 1,
              upsertedEdges: 0,
              removedEdges: 0,
              coverage: 0,
              diagnostics: 0,
            },
          },
        });
        try {
          await applyAnalysisPatch(
            {
              repositoryId: snapshot.repositoryId,
              baseRevisionId: snapshot.requestedRevisionId,
              baseContentFingerprint: staleBase
                ? 'phase05-wrong-base'
                : snapshot.requestedRevisionFingerprint,
              targetRevisionId: snapshot.requestedRevisionId,
              targetContentFingerprint: snapshot.requestedRevisionFingerprint,
            },
            {
              observeAndStage: async () => ({ outcome: 'SUCCEEDED', snapshot, stage }),
              factStore: new RepositoryCanonicalFactStore(session.database),
            },
          );
        } catch (error) {
          if (error.code !== expectedCode) throw error;
          errorCode = error.code;
        }
        if (errorCode !== expectedCode)
          throw new Error('Recorded invalid patch unexpectedly published');
      } finally {
        stage.close();
        close();
      }
      await assertOwned();
      const after = await read('working');
      if (!isDeepStrictEqual(after, before) || !Object.values(closure).every(Boolean))
        throw new Error('Recorded refusal did not preserve closed publication');
      rejectedPatches.push({
        kind: staleBase ? 'STALE_BASE' : 'DANGLING_NODE_REMOVAL',
        errorCode,
        beforeImageDigest: hash(JSON.stringify(before)),
        afterImageDigest: hash(JSON.stringify(after)),
        closure: { ...closure },
      });
    }
  };
  const publish = async (observation, stream, full, remove = false) => {
    const snapshot = {
      ...observation.snapshot,
      requestedRevisionFingerprint: request.revision.contentFingerprint,
    };
    const stage = full
      ? new RepositoryAnalysisStage(session.database)
      : new RepositoryPatchStage(session.database, (group) => selectMergedGroup(group).fact);
    try {
      const counts = full
        ? { sourceFiles: 0, nodes: 0, edges: 0, coverage: 0, diagnostics: 0 }
        : {
            sourceFiles: 0,
            upsertedNodes: 0,
            removedNodes: 0,
            upsertedEdges: 0,
            removedEdges: 0,
            coverage: 0,
            diagnostics: 0,
          };
      if (full)
        for (const file of request.sourceFiles) {
          await stage.accept({ type: 'SOURCE_FILE', payload: file });
          counts.sourceFiles++;
        }
      for (const [field, type] of [
        ['nodes', 'NODE'],
        ['edges', 'EDGE'],
      ])
        for (const pair of observation[field]) {
          if (remove) {
            await stage.accept({ type: `REMOVE_${type}`, payload: pair.provider });
            counts[type === 'NODE' ? 'removedNodes' : 'removedEdges']++;
          } else {
            const payload = stream.events.find(
              (event) =>
                event.type === type &&
                event.payload.providerFactId === pair.provider.providerFactId,
            )?.payload;
            if (!payload) throw new Error('Recorded Provider payload missing');
            await stage.accept({ type: full ? type : `UPSERT_${type}`, payload });
            stage[type === 'NODE' ? 'putNormalizedNode' : 'putNormalizedEdge'](pair);
            counts[full ? field : type === 'NODE' ? 'upsertedNodes' : 'upsertedEdges']++;
          }
        }
      if (full && !golden)
        for (const event of original.events.filter((event) =>
          ['COVERAGE', 'DIAGNOSTIC'].includes(event.type),
        )) {
          await stage.accept(event);
          counts[event.type === 'COVERAGE' ? 'coverage' : 'diagnostics']++;
        }
      if (full) mergeStagedAnalysis(stage, snapshot);
      else if (!remove)
        for (const support of collectMergeSupports({
          repositoryId: snapshot.repositoryId,
          revisionId: snapshot.requestedRevisionId,
          observations: [{ snapshot, nodes: observation.nodes, edges: observation.edges }],
        }))
          stage.appendSupport(support);
      stage.confirmSucceeded({
        type: full ? 'ANALYSIS_COMPLETED' : 'REFRESH_COMPLETED',
        payload: {
          providerSnapshotId: snapshot.id,
          repositoryId: snapshot.repositoryId,
          revisionId: snapshot.requestedRevisionId,
          revisionFingerprint: snapshot.requestedRevisionFingerprint,
          outcome: 'SUCCEEDED',
          capabilities: snapshot.capabilities,
          counts,
        },
      });
      const common = { repositoryId: snapshot.repositoryId };
      const ports = {
        observeAndStage: async () => ({ outcome: 'SUCCEEDED', snapshot, stage }),
        factStore: new RepositoryCanonicalFactStore(session.database),
      };
      await assertOwned();
      if (full)
        await applyFullAnalysis(
          {
            ...common,
            revisionId: snapshot.requestedRevisionId,
            contentFingerprint: snapshot.requestedRevisionFingerprint,
          },
          ports,
        );
      else
        await applyAnalysisPatch(
          {
            ...common,
            baseRevisionId: snapshot.requestedRevisionId,
            baseContentFingerprint: snapshot.requestedRevisionFingerprint,
            targetRevisionId: snapshot.requestedRevisionId,
            targetContentFingerprint: snapshot.requestedRevisionFingerprint,
          },
          ports,
        );
    } finally {
      stage.close();
    }
  };
  try {
    await acquire(true);
    session.sourceState.replace(null, { revision: request.revision, files: request.sourceFiles });
    if (golden) {
      await publish(observations[0], streams[0], true);
      await publish(observations[1], streams[1], false);
      await save('full');
      await acquire(false);
      await publish(
        {
          ...observations[1],
          snapshot: { ...observations[1].snapshot, id: 'phase05-remove-beta' },
        },
        null,
        false,
        true,
      );
      await save('one');
      await verifyRejectedPatches();
      await acquire(false);
      await publish(
        {
          ...observations[0],
          snapshot: { ...observations[0].snapshot, id: 'phase05-remove-alpha' },
        },
        null,
        false,
        true,
      );
      await save('zero');
    } else {
      const normalized = normalizeNativeAnalysis(original);
      const snapshot = {
        id: request.providerSnapshotId,
        repositoryId: request.repository.id,
        providerId: 'native',
        providerVersion: '1',
        runtimeVersion: '1',
        requestedRevisionId: request.revision.id,
        requestedRevisionFingerprint: request.revision.contentFingerprint,
        startedAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:00:01.000Z',
        capabilities: original.terminal.payload.capabilities,
        diagnostics: original.events
          .filter((event) => event.type === 'DIAGNOSTIC')
          .map((event) => event.payload),
        outcome: 'SUCCEEDED',
      };
      await publish({ snapshot, nodes: normalized.nodes, edges: normalized.edges }, original, true);
      await save('full');
    }
    await assertOwned();
    return {
      schemaVersion: 1,
      kind: 'PHASE05_PINNED_SQLITE_CONTRACT',
      fixtureId,
      evidenceScope: 'RECORDED_PROVIDER_SQLITE_CONTRACT_ONLY',
      matches: phases.every(
        (phase) =>
          phase.graphEqual &&
          phase.supportCandidatesEqual &&
          phase.supportEqual &&
          phase.historyEqual &&
          phase.sourceEqual &&
          phase.coverageEqual,
      ),
      phases,
      rejectedPatches,
      closure,
    };
  } finally {
    close();
  }
}

// Instantiate immutable Provider goldens in an independently prepared Source
// context BEFORE analysis. Never adopt context or semantic fields from a result.
// Candidate checks retain namespace support payloads; critical counts use only
// declared symbol/CALL scopes, not benchmark slots or merged Package ties.
export async function preparePhase05JavaOracle({ pinnedInputs, fixtureId, sourceState }) {
  if (
    !capturedFixturePins.has(pinnedInputs) ||
    ![
      'java-basic-symbol',
      'java-call-basic',
      'java-overload',
      'java-inheritance',
      'java-unresolved-call',
    ].includes(fixtureId)
  )
    throw new Error('Java oracle inputs unavailable');
  const plain = (value, active = new Set()) => {
    if (value === null || typeof value !== 'object') return;
    if (types.isProxy(value) || active.has(value)) throw new Error('Java oracle data invalid');
    active.add(value);
    const array = Array.isArray(value);
    if (
      Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype) ||
      (array && Reflect.ownKeys(value).length !== value.length + 1)
    )
      throw new Error('Java oracle data invalid');
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
        throw new Error('Java oracle data invalid');
      plain(descriptor.value, active);
    }
    active.delete(value);
  };
  plain(sourceState);
  const revision = WorktreeRevisionSchema.parse(sourceState.revision);
  const sourceFiles = SourceFileSchema.array().parse(sourceState.files);
  bindPhase05SourceIdentity(sourceFiles, sourceFiles); // uniqueness, not provenance
  const names = pinnedInputs.filePaths(fixtureId).filter((name) => name.startsWith('source/'));
  if (sourceFiles.length !== names.length) throw new Error('Java oracle Source inventory mismatch');
  const byOriginalId = new Map();
  for (const name of names) {
    const relative = name.slice('source/'.length);
    const file = sourceFiles.find((file) => file.path === relative);
    if (
      !file ||
      file.repositoryId !== revision.repositoryId ||
      file.revisionId !== revision.id ||
      file.contentFingerprint !== `sha256:${hash(pinnedInputs.readFile(fixtureId, name))}` ||
      !isDeepStrictEqual(file.classification, {
        role: 'SOURCE',
        provenance: 'AUTHORED',
        contentKind: 'TEXT',
      }) ||
      file.languageHint !== 'java'
    )
      throw new Error('Java oracle Source inventory mismatch');
    const originalId =
      fixtureId === 'java-basic-symbol' ? 'file-basic' : `file-${path.posix.basename(relative)}`;
    if (byOriginalId.has(originalId)) throw new Error('Java oracle Source identity ambiguous');
    byOriginalId.set(originalId, file.id);
  }
  const files = new Map(sourceFiles.map((file) => [file.id, file]));
  const manifest = JSON.parse(pinnedInputs.readFile(fixtureId, 'fixture.json'));
  const originalNodes = ProviderNodeSchema.array().parse(
    JSON.parse(pinnedInputs.readFile(fixtureId, manifest.expected.nodes)),
  );
  const originalEdges = manifest.expected.edges
    ? ProviderEdgeSchema.array().parse(
        JSON.parse(pinnedInputs.readFile(fixtureId, manifest.expected.edges)),
      )
    : [];
  const parameterize = (fact) => {
    if (
      fact.repositoryId !== 'repo-fixture' ||
      fact.revisionId !== 'rev-fixture' ||
      fact.providerId !== 'native' ||
      fact.providerSnapshotId !== 'snapshot-fixture'
    )
      throw new Error('Java oracle template context invalid');
    if (fact.sourceRange && !byOriginalId.has(fact.sourceRange.sourceFileId))
      throw new Error('Java oracle Source reference missing');
    return {
      ...fact,
      repositoryId: revision.repositoryId,
      revisionId: revision.id,
      sourceRange: fact.sourceRange
        ? { ...fact.sourceRange, sourceFileId: byOriginalId.get(fact.sourceRange.sourceFileId) }
        : null,
    };
  };
  const expectedNodes = originalNodes.map((fact) => ({
    provider: {
      factType: 'NODE',
      providerId: fact.providerId,
      providerFactId: fact.providerFactId,
    },
    canonical: normalizeJavaNode(parameterize(fact), files),
  }));
  const nodeLookup = new Map(
    expectedNodes.map((pair) => [pair.provider.providerFactId, pair.canonical]),
  );
  const expectedEdges = originalEdges.map((fact) => ({
    provider: {
      factType: 'EDGE',
      providerId: fact.providerId,
      providerFactId: fact.providerFactId,
    },
    canonical: normalizeJavaEdge(parameterize(fact), nodeLookup, files),
  }));
  const declarations = (node) => node.kind === 'TYPE' || node.kind === 'SYMBOL';
  const facts = {
    nodes: expectedNodes.map((pair) => pair.canonical).filter(declarations),
    edges: expectedEdges.map((pair) => pair.canonical).filter((edge) => edge.kind === 'CALL'),
  };
  const criticalBytes = await readFile(new URL('expected/critical.json', fixture));
  const critical = JSON.parse(criticalBytes).fixtures.find((item) => item.fixtureId === fixtureId);
  if (!critical) throw new Error('Java oracle critical scope missing');
  const criticalKeys = (ids, pairs) =>
    ids.map((id) => {
      const matches = pairs.filter((pair) => pair.provider.providerFactId === id);
      if (matches.length !== 1) throw new Error('Java oracle critical identity ambiguous');
      return matches[0].canonical.factKey;
    });
  const criticalSymbols = criticalKeys(critical.symbols, expectedNodes);
  const criticalDirectCalls = criticalKeys(critical.directCalls, expectedEdges);
  evaluatePhase05Facts({ expected: facts, actual: facts, criticalSymbols, criticalDirectCalls });
  const key = (ref) => JSON.stringify([ref.factType, ref.providerId, ref.providerFactId]);
  const expectedPairs = new Map(
    [...expectedNodes, ...expectedEdges].map((pair) => [key(pair.provider), pair.canonical]),
  );
  if (expectedPairs.size !== expectedNodes.length + expectedEdges.length)
    throw new Error('Java oracle duplicate Provider fact');
  await pinnedInputs.assertUnchanged();
  return Object.freeze({
    sha256: hash(
      JSON.stringify({
        fixtureId,
        revision,
        sourceFiles,
        expectedNodes,
        expectedEdges,
        criticalDigest: hash(criticalBytes),
      }),
    ),
    evaluate(actual) {
      comparePhase05ActiveSupports({ expected: actual, actual });
      const sourceMapping = bindPhase05SourceIdentity(sourceFiles, actual.sourceFiles);
      if ([...sourceMapping].some(([left, right]) => left !== right))
        throw new Error('Java oracle requires shared prepared Source IDs');
      const actualFacts = {
        nodes: actual.facts.nodes.filter(declarations),
        edges: manifest.capabilities.includes('CALL')
          ? actual.facts.edges.filter((edge) => edge.kind === 'CALL')
          : [],
      };
      const metrics = comparePhase05SourceBoundFacts({
        expected: { sourceFiles, facts },
        actual: { sourceFiles: actual.sourceFiles, facts: actualFacts },
        criticalSymbols,
        criticalDirectCalls,
      });
      const candidates = new Map(
        actual.candidates.map((candidate) => [candidate.evidenceId, candidate.candidate]),
      );
      const observed = new Map();
      for (const evidence of actual.evidence.filter((evidence) => evidence.status === 'ACTIVE')) {
        if (evidence.providerFact.providerId !== 'native')
          throw new Error('Java oracle foreign Provider');
        observed.set(key(evidence.providerFact), candidates.get(evidence.id));
      }
      const exactGoldens = [...expectedPairs].every(([id, fact]) =>
        isDeepStrictEqual(fact, observed.get(id)),
      );
      const scoped = (fact) =>
        declarations(fact) ||
        (fact.kind === 'PACKAGE' && fact.sourceRange !== null) ||
        manifest.capabilities.includes(
          { CALL: 'CALL', IMPORT: 'IMPORT', INHERITANCE: 'INHERITANCE', REFERENCE: 'REFERENCE' }[
            fact.kind
          ],
        );
      const noExtras = [...observed].every(([id, fact]) => !scoped(fact) || expectedPairs.has(id));
      const semanticAgreement = metrics.comparison.entries.every(
        (entry) => entry.classification === null && entry.differences.length === 0,
      );
      return { facts: metrics, matches: exactGoldens && noExtras && semanticAgreement };
    },
  });
}

// Prepares inputs only. This does not publish facts, admit Native execution,
// produce measured Canonical goldens or assert benchmark performance.
export async function preparePhase05PinnedRepository({ directory, baseline, target }) {
  const snapshot = (files) => {
    if (!files || types.isProxy(files) || Object.getPrototypeOf(files) !== Object.prototype)
      throw new Error('Invalid pinned source map');
    return Object.fromEntries(
      Reflect.ownKeys(files).map((filename) => {
        const descriptor = Object.getOwnPropertyDescriptor(files, filename);
        if (
          typeof filename !== 'string' ||
          !descriptor.enumerable ||
          !Object.hasOwn(descriptor, 'value') ||
          !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.java$/.test(filename) ||
          filename
            .split('/')
            .some((part) => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) ||
          !Buffer.isBuffer(descriptor.value)
        )
          throw new Error('Invalid pinned source entry');
        return [filename, Buffer.from(descriptor.value)];
      }),
    );
  };
  const before = snapshot(baseline),
    after = snapshot(target);
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || directory.includes('\0'))
    throw new Error('Invalid pinned source destination');
  const destination = path.resolve(directory);
  if ((await realpath(path.dirname(destination))) !== path.dirname(destination))
    throw new Error('Pinned source parent must be canonical');
  await mkdir(destination);
  const owned = await lstat(destination, { bigint: true });
  const repositoryRoot = path.join(destination, 'repository');
  const controlRoot = path.join(destination, '.control');
  await mkdir(repositoryRoot);
  await mkdir(controlRoot);
  const ownedRepository = await lstat(repositoryRoot, { bigint: true });
  const hooks = path.join(controlRoot, 'hooks'),
    template = path.join(controlRoot, 'template');
  await mkdir(hooks);
  await mkdir(template);
  const globalConfig = path.join(controlRoot, 'global-config');
  await writeFile(globalConfig, '', { flag: 'wx' });
  const assertOwned = async () => {
    const current = await lstat(destination, { bigint: true });
    const currentRepository = await lstat(repositoryRoot, { bigint: true });
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.dev !== owned.dev ||
      current.ino !== owned.ino ||
      !currentRepository.isDirectory() ||
      currentRepository.isSymbolicLink() ||
      currentRepository.dev !== ownedRepository.dev ||
      currentRepository.ino !== ownedRepository.ino ||
      (await realpath(destination)) !== destination ||
      (await realpath(repositoryRoot)) !== repositoryRoot
    )
      throw new Error('Pinned source ownership changed');
  };
  const put = async (filename, bytes, flag) => {
    await assertOwned();
    const absolute = path.join(repositoryRoot, filename);
    await mkdir(path.dirname(absolute), { recursive: true });
    if ((await realpath(path.dirname(absolute))) !== path.dirname(absolute))
      throw new Error('Pinned source parent changed');
    await writeFile(absolute, bytes, { flag });
  };
  for (const [filename, bytes] of Object.entries(before)) await put(filename, bytes, 'wx');
  const environment = Object.fromEntries(
    ['PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
  Object.assign(environment, {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_COUNT: '0',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
    GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
  });
  const git = async (args) => {
    await assertOwned();
    await execute(
      'git',
      [
        '-c',
        'core.autocrlf=false',
        '-c',
        `core.hooksPath=${hooks}`,
        '-c',
        'commit.gpgSign=false',
        '-c',
        'user.name=Phase05 Fixture',
        '-c',
        'user.email=fixture@example.test',
        '-C',
        repositoryRoot,
        ...args,
      ],
      { env: environment, windowsHide: true },
    );
    await assertOwned();
  };
  await git(['init', '-b', 'main', `--template=${template}`]);
  await git(['add', '--all']);
  await git(['commit', '--allow-empty', '-m', 'Independent Phase05 pinned baseline']);
  let applied = false;
  return {
    repositoryRoot,
    async applyTarget() {
      await assertOwned();
      if (applied) throw new Error('Pinned transition already applied');
      // Authenticate every baseline before any destructive per-file change.
      for (const [filename, bytes] of Object.entries(before)) {
        const absolute = path.join(repositoryRoot, filename),
          info = await lstat(absolute);
        if (
          !info.isFile() ||
          info.nlink !== 1 ||
          (await realpath(absolute)) !== absolute ||
          !(await readFile(absolute)).equals(bytes)
        )
          throw new Error('Pinned source baseline changed');
      }
      for (const filename of Object.keys(after).filter((name) => !Object.hasOwn(before, name))) {
        try {
          await lstat(path.join(repositoryRoot, filename));
        } catch (error) {
          if (error.code === 'ENOENT') continue;
          throw error;
        }
        throw new Error('Pinned target already exists');
      }
      applied = true;
      for (const filename of Object.keys(before).filter((name) => !Object.hasOwn(after, name))) {
        await assertOwned();
        await unlink(path.join(repositoryRoot, filename));
      }
      for (const [filename, bytes] of Object.entries(after))
        await put(filename, bytes, Object.hasOwn(before, filename) ? 'w' : 'wx');
      await assertOwned();
    },
  };
}

export async function preparePhase05PerformanceRepository({ directory, scenario }) {
  const recipe = JSON.parse(await readFile(new URL('inputs/performance.json', fixture), 'utf8'));
  const expected = JSON.parse(
    await readFile(new URL('expected/performance.json', fixture), 'utf8'),
  );
  if (
    !['COLD', 'INCREMENTAL_1', 'INCREMENTAL_5', 'INCREMENTAL_50'].includes(scenario) ||
    typeof directory !== 'string' ||
    !path.isAbsolute(directory) ||
    directory.includes('\0') ||
    recipe.schemaVersion !== 1 ||
    recipe.fileCount !== 50 ||
    expected.schemaVersion !== 1 ||
    typeof recipe.template !== 'string'
  )
    throw new Error('Invalid performance fixture control');
  const changedCount = recipe.scenarios[scenario];
  if (
    changedCount !== { COLD: 0, INCREMENTAL_1: 1, INCREMENTAL_5: 5, INCREMENTAL_50: 50 }[scenario]
  )
    throw new Error('Invalid performance fixture control');
  const source = (index, changed) =>
    recipe.template
      .replace('{{unit}}', String(index).padStart(2, '0'))
      .replace('{{target}}', index < changed ? 'second' : 'first');
  const filePath = (index) => `src/Unit${String(index).padStart(2, '0')}.java`;
  const digest = (changed) =>
    hash(
      JSON.stringify(
        Array.from({ length: 50 }, (_, index) => ({
          path: filePath(index),
          sha256: hash(source(index, changed)),
        })),
      ),
    );
  const baselineDigest = digest(0),
    targetDigest = digest(changedCount);
  if (
    baselineDigest !== expected.baselineDigest ||
    targetDigest !== expected.scenarios[scenario]?.targetDigest
  )
    throw new Error('Performance fixture source digest mismatch');
  const destination = path.resolve(directory);
  if ((await realpath(path.dirname(destination))) !== path.dirname(destination))
    throw new Error('Performance fixture parent must be canonical');
  // Atomic mkdir acquires only a new destination. Never adopt/delete old data.
  await mkdir(destination);
  const owned = await lstat(destination);
  const repositoryRoot = path.join(destination, 'repository');
  const controls = path.join(destination, '.control');
  const hooks = path.join(controls, 'hooks');
  const template = path.join(controls, 'template');
  await mkdir(repositoryRoot);
  await mkdir(path.join(repositoryRoot, 'src'));
  await mkdir(controls);
  await mkdir(hooks);
  await mkdir(template);
  const globalConfig = path.join(controls, 'global-config');
  await writeFile(globalConfig, '', { flag: 'wx' });
  const assertOwned = async () => {
    const current = await lstat(destination);
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.dev !== owned.dev ||
      current.ino !== owned.ino ||
      (await realpath(destination)) !== destination ||
      (await realpath(repositoryRoot)) !== repositoryRoot
    )
      throw new Error('Performance fixture ownership changed');
  };
  const environment = Object.fromEntries(
    ['PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
  Object.assign(environment, {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_COUNT: '0',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
    GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
  });
  const git = async (args) => {
    await assertOwned();
    await execute(
      'git',
      [
        '-c',
        'core.autocrlf=false',
        '-c',
        `core.hooksPath=${hooks}`,
        '-c',
        'commit.gpgSign=false',
        '-c',
        'user.name=Phase05 Fixture',
        '-c',
        'user.email=fixture@example.test',
        '-C',
        repositoryRoot,
        ...args,
      ],
      { env: environment, windowsHide: true },
    );
    await assertOwned();
  };
  for (let index = 0; index < 50; index++)
    await writeFile(path.join(repositoryRoot, filePath(index)), source(index, 0), { flag: 'wx' });
  await git(['init', '-b', 'main', `--template=${template}`]);
  await git(['add', '--', 'src']);
  await git(['commit', '-m', 'Independent Phase05 source baseline']);
  return {
    repositoryRoot,
    baselineDigest,
    targetDigest,
    async applyTarget() {
      await assertOwned();
      // Refuse altered source before applying the declared transition.
      for (let index = 0; index < 50; index++) {
        const filename = path.join(repositoryRoot, filePath(index));
        const info = await lstat(filename);
        if (
          !info.isFile() ||
          info.nlink !== 1 ||
          (await realpath(filename)) !== filename ||
          (await readFile(filename, 'utf8')) !== source(index, 0)
        )
          throw new Error('Performance fixture baseline changed');
      }
      for (let index = 0; index < changedCount; index++)
        await writeFile(path.join(repositoryRoot, filePath(index)), source(index, changedCount));
      await assertOwned();
    },
  };
}
