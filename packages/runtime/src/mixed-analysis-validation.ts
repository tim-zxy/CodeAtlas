import { composeDeclaredFrameworkSurfaceDeltaRawSupportCandidateWithBudget } from '../../providers/dist/declared-delta-raw-support-candidate.js';
import { composeDeclaredFrameworkSurfaceFullRawSupportCandidate } from '../../providers/dist/declared-delta-raw-support-candidate.js';
import {
  composeDeclaredBindingAwareFullRawSupportCandidate,
  composeDeclaredBindingAwareDeltaRawSupportCandidateWithBudget,
} from '../../providers/dist/declared-delta-raw-support-candidate.js';
import { MixedAnalysisRulesFailure } from '../../storage/dist/analysis/mixed-analysis-state.js';
import { types, isDeepStrictEqual } from 'node:util';
import {
  CompositionMetadataSchema,
  SettledJavaOwnerPreparationSchema,
  projectSettledJavaOwner,
  type SettledJavaOwnerPreparation,
  validateCompositionComponents,
  validateParsedCompositionJava,
  freezeComposition,
  type CompositionMetadata,
} from '../../providers/dist/native-composition-input.js';
import normalizeJavaNode from '../../providers/dist/java-node-normalizer.js';
import {
  SyntaxTargetSourceSchema,
  SyntaxOwnerMapInputSchema,
  computeSyntaxOwnerMapDigest,
} from '../../providers/dist/native-syntax-owner-binding.js';
import {
  historyInventory,
  historyUnits,
  historyProjected,
  historySupported,
  type HistoryDependencyUnit,
} from '../../providers/dist/history-transition-input.js';
import composeDelta, {
  composeDeclaredFullRawSupportCandidate,
  composeDeclaredBindingFullRawSupportCandidate,
  composeDeclaredBindingDeltaRawSupportCandidateWithBudget,
} from '../../providers/dist/declared-delta-raw-support-candidate.js';
import { type CodeSyntaxCompositionBudget } from '../../providers/dist/native-code-syntax-budget.js';
import { createCodeIdentityEncoder } from '../../storage/dist/analysis/code-identity.js';
import {
  HistoryReadBudget,
  checkedHistoryLimits,
  encodeHistoryValue,
  record,
  exact,
  array,
  text,
  historyCompare,
  requireHistory,
  validateHistoryManifest,
  historyDigest,
  type HistoryReadLimits,
} from '../../storage/dist/analysis/activation-history-format.js';

// Private pure validation. These declarations and receipts never confer Stage or run authority.
function validation(limits: HistoryReadLimits) {
  const b = new HistoryReadBudget(checkedHistoryLimits(limits));
  const owned = (v: unknown) => {
    b.own(v);
    return b.parse(encodeHistoryValue(v, b));
  };
  const provider = <T>(fn: (c: CodeSyntaxCompositionBudget) => T): T => {
    const rem = b.remaining(),
      cap = Math.min(rem.maxSerializedBytes, Math.floor(rem.memoryBudgetBytes / 2));
    requireHistory(cap > 0, 'HISTORY_LIMIT_EXCEEDED');
    const bytes = b.serializedBytes,
      items = b.items,
      c: CodeSyntaxCompositionBudget = {
        limits: {
          maxSerializedBytes: bytes + cap,
          maxItems: b.limits.maxItems,
          maxDepth: b.limits.maxDepth,
        },
        budget: { serializedBytes: bytes, items },
      };
    try {
      return fn(c);
    } finally {
      const delta = c.budget.serializedBytes - bytes;
      b.add('serializedBytes', delta);
      b.add('items', c.budget.items - items);
      b.pin(delta);
    }
  };
  const finish = <T extends object>(value: T) => {
    const usage = { rows: 0, serializedBytes: 0, items: 0, retainedLogicalBytes: 0 },
      r = { ...value, usage };
    b.own(r);
    Object.assign(usage, {
      rows: b.rows,
      serializedBytes: b.serializedBytes,
      items: b.items,
      retainedLogicalBytes: b.retainedLogicalBytes,
    });
    return freezeComposition(r);
  };
  const bytes = (v: unknown): Uint8Array => {
    requireHistory(
      v !== null &&
        typeof v === 'object' &&
        !types.isProxy(v) &&
        types.isUint8Array(v) &&
        (Object.getPrototypeOf(v) === Buffer.prototype ||
          Object.getPrototypeOf(v) === Uint8Array.prototype),
    );
    const n = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(Uint8Array.prototype),
      'byteLength',
    )!.get!.call(v) as number;
    b.add('serializedBytes', n);
    b.pin(n);
    requireHistory(Reflect.ownKeys(v).length === n);
    b.add('serializedBytes', n);
    b.pin(n);
    return Buffer.from(v as Uint8Array);
  };
  return { b, owned, provider, finish, bytes };
}
type Validation = ReturnType<typeof validation>;
type JavaPreparation = CompositionMetadata | SettledJavaOwnerPreparation;
function targetAndScope(target: unknown, scope: unknown, metadata: JavaPreparation, v: Validation) {
  const t = exact(target, ['source', 'repositoryLocatorDigest', 'inventory', 'contracts']),
    source = SyntaxTargetSourceSchema.parse(t.source),
    locator = text(t.repositoryLocatorDigest);
  requireHistory(/^[a-f0-9]{64}$/.test(locator));
  const targetMetadata = { ...metadata, targetSource: source, inventory: t.inventory };
  v.b.own(targetMetadata);
  const parsed =
    'kind' in metadata
      ? SettledJavaOwnerPreparationSchema.parse(targetMetadata)
      : CompositionMetadataSchema.parse(targetMetadata);
  v.b.own(parsed);
  historyInventory(parsed.inventory, source);
  requireHistory(parsed.inventory.every(historySupported));
  const keys = metadata.inventory.map((f) =>
    [f.path, f.id].map((value) => {
      const n = Buffer.byteLength(value);
      v.b.add('serializedBytes', n);
      v.b.pin(n);
      return Buffer.from(value);
    }),
  );
  v.b.own(metadata.inventory);
  for (let i = 0; i < metadata.inventory.length; i++) {
    const f = metadata.inventory[i]!;
    requireHistory(f.repositoryId === source.repositoryId && f.revisionId === source.revisionId);
    if (i)
      requireHistory(
        (Buffer.compare(keys[i - 1]![0]!, keys[i]![0]!) ||
          Buffer.compare(keys[i - 1]![1]!, keys[i]![1]!)) < 0,
      );
  }
  requireHistory(
    new Set(metadata.inventory.map((f) => f.id)).size === metadata.inventory.length &&
      new Set(metadata.inventory.map((f) => f.path)).size === metadata.inventory.length,
  );
  const contracts = array(t.contracts).map((x) => {
    const c = exact(x, ['providerId', 'extractor', 'normalizer', 'contract', 'policy']);
    SyntaxOwnerMapInputSchema.shape.providerId.parse(c.providerId);
    for (const x of Object.values(c)) text(x);
    return c;
  });
  requireHistory(contracts.some((c) => c.providerId === 'native'));
  for (let i = 1; i < contracts.length; i++)
    requireHistory(
      historyCompare(text(contracts[i - 1]!.providerId), text(contracts[i]!.providerId)) < 0,
    );
  // Each model validates its own ordering; compare complete Source records by identity.
  v.b.own([metadata.inventory, parsed.inventory]);
  const sorted = (a: CompositionMetadata['inventory']) =>
    [...a].sort((a, b) => historyCompare(a.id, b.id));
  requireHistory(
    isDeepStrictEqual(metadata.targetSource, source) &&
      isDeepStrictEqual(sorted(metadata.inventory), sorted(parsed.inventory)),
  );
  const s = exact(scope, ['units', 'removedSourceFileIds']),
    units = array(s.units).map((x) => {
      const u = exact(x, ['id', 'providerId', 'kind', 'sourceFileIds']);
      text(u.id);
      requireHistory(
        u.providerId === 'native' && (u.kind === 'JAVA_GROUP' || u.kind === 'PYTHON_FILE'),
      );
      return {
        id: text(u.id),
        providerId: 'native',
        kind: u.kind as 'JAVA_GROUP' | 'PYTHON_FILE',
        sourceFileIds: array(u.sourceFileIds).map(text),
      };
    });
  historyUnits(units, parsed.inventory, false);
  const removed = array(s.removedSourceFileIds).map(text);
  for (let i = 1; i < removed.length; i++)
    requireHistory(historyCompare(removed[i - 1]!, removed[i]!) < 0);
  requireHistory(removed.every((id) => !parsed.inventory.some((f) => f.id === id)));
  v.b.own([contracts, units, removed]);
  return {
    target: { source, repositoryLocatorDigest: locator, inventory: parsed.inventory, contracts },
    units,
    removed,
  };
}
function checkLocator(metadata: JavaPreparation, locator: string, v: Validation) {
  requireHistory(metadata.java);
  const repository = metadata.java.request.payload.repository;
  requireHistory(repository.id === metadata.targetSource.repositoryId);
  assertMixedRepositoryLocator(repository, locator, v.b);
}

export function assertMixedRepositoryLocator(
  repository: { id: string; rootPath: string },
  locator: string,
  b: HistoryReadBudget,
): void {
  // Repository's fixed schema has only ASCII keys id/rootPath; H1 and C3-A key order coincide.
  const encoder = createCodeIdentityEncoder('codeatlas-repository-locator-v1', {
    start(raw) {
      const n = Buffer.byteLength(raw);
      b.add('serializedBytes', n);
      b.pin(n);
    },
    encode(value) {
      const raw = encodeHistoryValue(value, b),
        n = Buffer.byteLength(raw),
        prefix = String(n) + ':';
      b.add('serializedBytes', prefix.length);
      b.pin(n + prefix.length);
      return raw;
    },
    remember() {},
    end() {
      b.pin(64);
    },
  });
  encoder.group('LOCATOR', 1);
  encoder.emit({ key: [repository.id], value: repository });
  requireHistory(encoder.end() === locator);
}
function javaOwner(input: unknown, v: Validation) {
  const r = exact(input, ['target', 'scope', 'javaRows']);
  v.b.own(r.javaRows);
  const m =
    record(r.javaRows).kind === 'SETTLED_JAVA_OWNER'
      ? SettledJavaOwnerPreparationSchema.parse(r.javaRows)
      : CompositionMetadataSchema.parse(r.javaRows);
  v.b.own(m);
  const t = targetAndScope(r.target, r.scope, m, v),
    javaFiles = m.inventory.filter((f) => historyProjected(f) && f.languageHint === 'java');
  requireHistory(m.java && javaFiles.length > 0 && t.units.some((u) => u.kind === 'JAVA_GROUP'));
  if (!('kind' in m)) validateCompositionComponents(m);
  checkLocator(m, t.target.repositoryLocatorDigest, v);
  const parsedJava = v.provider((c) =>
    validateParsedCompositionJava(
      m,
      javaFiles,
      m.java!.request.payload.repository,
      c.limits,
      c.budget,
    ),
  );
  v.b.own(parsedJava);
  const lookup = new Map(javaFiles.map((f) => [String(f.id), f]));
  v.b.own(javaFiles);
  const nodes = m.java.events
    .filter((e) => e.type === 'NODE')
    .map((e) => {
      requireHistory(e.type === 'NODE');
      const providerNode = e.payload,
        canonicalNode = v.provider((c) => normalizeJavaNode(providerNode, lookup, c)),
        sourceFileId =
          providerNode.sourceRange?.sourceFileId ??
          javaFiles.find((f) => String(f.path) === String(providerNode.qualifiedName))?.id ??
          null;
      return { providerNode, canonicalNode, sourceFileId };
    });
  v.b.own(nodes);
  nodes.sort(
    (a, b) =>
      historyCompare(a.providerNode.providerId, b.providerNode.providerId) ||
      historyCompare(a.providerNode.providerFactId, b.providerNode.providerFactId),
  );
  for (let i = 1; i < nodes.length; i++)
    requireHistory(
      nodes[i - 1]!.providerNode.providerId !== nodes[i]!.providerNode.providerId ||
        nodes[i - 1]!.providerNode.providerFactId !== nodes[i]!.providerNode.providerFactId,
    );
  return { metadata: m, nodes };
}
function execute(
  input: unknown,
  limits: HistoryReadLimits,
  action: (input: unknown, v: Validation) => object,
): unknown {
  const v = validation(limits);
  try {
    return v.finish(action(input, v));
  } catch (error) {
    const code =
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      ['HISTORY_LIMIT_EXCEEDED', 'RESOURCE_LIMIT_EXCEEDED'].includes(String(error.code))
        ? 'STAGE_LIMIT_EXCEEDED'
        : 'INVALID_CANDIDATE';
    throw new MixedAnalysisRulesFailure(code, {
      rows: v.b.rows,
      serializedBytes: v.b.serializedBytes,
      items: v.b.items,
      retainedLogicalBytes: v.b.retainedLogicalBytes,
    });
  }
}
export function prepareJavaOwner(input: unknown, limits: HistoryReadLimits): unknown {
  return execute(input, limits, (input, v) => javaOwner(v.owned(input), v));
}

function observation(input: unknown, v: Validation, bindingV6: boolean | 7 | 8 = false) {
  const r = exact(input, ['mode', 'target', 'capture', 'scope', 'owner', 'rawBundle']);
  requireHistory(r.mode === 'FULL' || r.mode === 'DELTA');
  const raw = exact(r.rawBundle, ['metadata', 'requestBytes', 'outputBytes']),
    owned = exact(
      v.owned({
        target: r.target,
        capture: r.capture,
        scope: r.scope,
        owner: r.owner,
        metadata: raw.metadata,
      }),
      ['target', 'capture', 'scope', 'owner', 'metadata'],
    ),
    reserved = owned.metadata;
  v.b.own(reserved);
  const m = CompositionMetadataSchema.parse(reserved);
  v.b.own(m);
  const t = targetAndScope(owned.target, owned.scope, m, v),
    owner = exact(owned.owner, ['stageDigest', 'java']),
    stageDigest = text(owner.stageDigest);
  requireHistory(/^[a-f0-9]{64}$/.test(stageDigest));
  const capture = record(owned.capture),
    requestBytes = v.bytes(raw.requestBytes),
    outputBytes = v.bytes(raw.outputBytes);
  if (t.units.some((u) => u.kind === 'JAVA_GROUP')) {
    const j = exact(owner.java, ['metadata', 'nodes']),
      prepared = javaOwner({ target: owned.target, scope: owned.scope, javaRows: j.metadata }, v);
    const settled = record(j.metadata).kind === 'SETTLED_JAVA_OWNER',
      correlated = settled ? projectSettledJavaOwner(m) : m;
    if (settled) {
      v.b.own(correlated);
      requireHistory(m.java && m.java.settledAt <= m.codeSyntax.startedAt);
    }
    requireHistory(
      isDeepStrictEqual(prepared.metadata, correlated) &&
        isDeepStrictEqual(prepared.nodes, j.nodes),
    );
  } else requireHistory(owner.java === null && m.java === null);
  let parsed:
      | ReturnType<typeof composeDeclaredFullRawSupportCandidate>['raw']
      | ReturnType<typeof composeDelta>['raw']
      | ReturnType<typeof composeDeclaredBindingDeltaRawSupportCandidateWithBudget>['raw'],
    observed: readonly HistoryDependencyUnit[],
    oldBasis: unknown = null;
  if (r.mode === 'FULL') {
    exact(capture, ['parent', 'snapshotIds', 'snapshots', 'coverage', 'activeProviderIds']);
    requireHistory(
      array(capture.activeProviderIds).every((id) => id === 'native') && t.removed.length === 0,
    );
    historyUnits(t.units, t.target.inventory, true);
    const result = v.provider((c) =>
      (bindingV6 === 8
        ? composeDeclaredFrameworkSurfaceFullRawSupportCandidate
        : bindingV6 === 7
          ? composeDeclaredBindingAwareFullRawSupportCandidate
          : bindingV6
            ? composeDeclaredBindingFullRawSupportCandidate
            : composeDeclaredFullRawSupportCandidate)(t.target, m, requestBytes, outputBytes, c),
    );
    parsed = result.raw;
    observed = result.observation.units;
  } else {
    exact(capture, [
      'parent',
      'snapshotIds',
      'snapshots',
      'coverage',
      'activeProviderIds',
      'history',
      'ancestors',
      'origins',
      'projections',
    ]);
    const history = validateHistoryManifest(capture.history, v.b),
      activationId = 'activation:' + historyDigest('codeatlas-activation-history-v1', history, v.b),
      parent = exact(capture.parent, ['activationId', 'repositoryId', 'revisionId']);
    requireHistory(
      parent.activationId === activationId &&
        parent.repositoryId === history.state.basis.repositoryId &&
        parent.revisionId === history.state.basis.revisionId,
    );
    oldBasis = history.state.basis;
    const state = {
        ...history.state,
        supports: history.state.supports.map((s) => ({
          ...s,
          snapshotId: s.evidence.providerSnapshotId,
        })),
      },
      packet = {
        history: { activationId, parent: history.parent, state },
        current: state,
        expectedActivationId: activationId,
        expectedOldBasis: history.state.basis,
        target: t.target,
        observation: null,
      };
    v.b.own(packet);
    const result = v.provider((c) =>
      (bindingV6 === 8
        ? composeDeclaredFrameworkSurfaceDeltaRawSupportCandidateWithBudget
        : bindingV6 === 7
          ? composeDeclaredBindingAwareDeltaRawSupportCandidateWithBudget
          : bindingV6
            ? composeDeclaredBindingDeltaRawSupportCandidateWithBudget
            : composeDelta)(packet, m, requestBytes, outputBytes, c),
    );
    parsed = result.raw;
    const files = parsed.codeSyntax.request.payload.sourceFiles;
    observed = result.candidate.dependencyUnits.filter(
      (u) =>
        u.providerId === 'native' && u.sourceFileIds.some((id) => files.some((f) => f.id === id)),
    );
    const removed = history.state.inventory
      .filter((f) => !t.target.inventory.some((g) => g.id === f.id))
      .map((f) => String(f.id))
      .sort(historyCompare);
    requireHistory(isDeepStrictEqual(t.removed, removed));
  }
  requireHistory(isDeepStrictEqual(t.units, observed));
  const p = parsed.codeSyntax.request.payload;
  requireHistory(
    p.ownerBinding.kind === 'PROVISIONAL_CODE' &&
      p.ownerBinding.stageDigest === stageDigest &&
      isDeepStrictEqual(p.expectedActivationBasis, oldBasis),
  );
  const binding = {
    expectedActivationBasis: p.expectedActivationBasis,
    targetSource: p.targetSource,
    ownerBinding: { kind: 'PROVISIONAL_CODE' as const, stageDigest },
    providerId: p.providerId,
    providerSnapshotId: p.providerSnapshotId,
    sourceFiles: p.sourceFiles,
    owners: p.owners,
  };
  v.b.own(binding);
  requireHistory(p.ownerBinding.ownerMapDigest === computeSyntaxOwnerMapDigest(binding));
  requireHistory(!array(capture.snapshotIds).includes(m.snapshot.id));
  return { raw: parsed };
}

export function validateObservation(input: unknown, limits: HistoryReadLimits): unknown {
  return execute(input, limits, observation);
}

export function validateBindingObservation(input: unknown, limits: HistoryReadLimits): unknown {
  return execute(input, limits, (input, v) => observation(input, v, true));
}

export function validateBindingAwareObservation(
  input: unknown,
  limits: HistoryReadLimits,
): unknown {
  return execute(input, limits, (input, v) => observation(input, v, 7));
}

export function validateFrameworkSurfaceObservation(
  input: unknown,
  limits: HistoryReadLimits,
): unknown {
  return execute(input, limits, (input, v) => observation(input, v, 8));
}
