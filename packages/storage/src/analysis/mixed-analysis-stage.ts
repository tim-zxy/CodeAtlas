import type { CanonicalNode, CanonicalEdge, SupportRef, SyntaxEvidenceV4 } from '@codeatlas/ir';
import {
  borrowMixedSourceBudget,
  prepareMixedSourceBudget,
  bindMixedSourceBudget,
  invalidateMixedSourceBudget,
  type SourceAccountControl,
} from './mixed-source-account.js';
export { MixedSourceAccountError } from './mixed-source-account.js';
import { predictCodeActivation } from './code-identity.js';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { types, isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import {
  ProviderIdSchema,
  ProviderNodeSchema,
  CanonicalNodeSchema,
  CanonicalEdgeSchema,
  parseSyntaxEvidenceV4,
  validateSyntaxSurfaceClosure,
  SupportRefSchema,
  SourceFileSchema,
  ProviderSnapshotSchema,
  RepoBasisSchema,
  type RepoBasis,
  type SourceFile,
} from '@codeatlas/ir';
import readMixedAnalysisCapture, {
  recheckMixedAnalysisCaptureLocked,
  releaseActivationContext,
} from './activation-history.js';
import {
  HistoryReadBudget,
  HistoryCaptureError,
  checkedHistoryLimits,
  exact,
  record,
  array,
  text,
  historyCompare,
  encodeHistoryValue,
  historyDigest,
  validateHistoryManifest,
  validateSyntaxPair,
  validateSyntaxProjectionClosure,
  type HistoryReadLimits,
} from './activation-history-format.js';
import {
  MixedAnalysisError,
  MixedAnalysisRulesFailure,
  mixedAnalysisFailureUsage,
  requireMixedAnalysis as check,
  type MixedAnalysisRulesPort,
} from './mixed-analysis-state.js';
type OwnedStage = {
  db: DatabaseSync;
  marker: StatementSync;
  tempVersion: number;
  cleanupPrepaid: boolean;
  epoch: { changes: number; dataVersion: number };
  capture: ReturnType<typeof readMixedAnalysisCapture>;
  captureHandle: object;
  budget: HistoryReadBudget;
  mode: 'FULL' | 'DELTA';
  rules: MixedAnalysisRulesPort;
  status:
    'PREPARING' | 'OWNER_FROZEN' | 'OBSERVED' | 'FROZEN' | 'APPLYING' | 'CONSUMED' | 'INVALID';
  busy?: boolean;
  frozen?: {
    lease: object;
    basis: Readonly<RepoBasis>;
    result: Record<string, unknown>;
    seal: string;
  };
  observation?: { metadata: unknown; requestBytes: Uint8Array; outputBytes: Uint8Array } | null;
  observationDeclaration?: unknown;
  tempRows: Map<string, string>;
  owner?: PreparedOwner;
};

type Contract = {
  providerId: string;
  extractor: string;
  normalizer: string;
  contract: string;
  policy: string;
};
type Unit = {
  id: string;
  providerId: string;
  kind: 'JAVA_GROUP' | 'PYTHON_FILE' | 'PROVIDER_SCOPE';
  sourceFileIds: readonly string[];
};
type PreparedOwner = {
  ownerHandle: object;
  stageDigest: string;
  body: unknown;
  contracts: Contract[];
  qualificationRef: string;
  java: { metadata: unknown; nodes: unknown[] } | null;
  units: Unit[];
  removedSourceFileIds: string[];
};

const leases = new WeakMap<object, { stage: object; owned: OwnedStage }>();
const closed = new WeakSet<object>(),
  stages = new WeakMap<object, OwnedStage>(),
  connections = new WeakMap<DatabaseSync, object>();
const version = (db: DatabaseSync) => {
  const value = db.prepare('PRAGMA temp.schema_version').get()?.schema_version;
  check(typeof value === 'number' && Number.isSafeInteger(value));
  return value;
};
function databaseEpoch(db: DatabaseSync): { changes: number; dataVersion: number } {
  const changes = db.prepare('SELECT total_changes() AS n').get()?.n;
  const dataVersion = db.prepare('PRAGMA data_version').get()?.data_version;
  check(
    typeof changes === 'number' && Number.isSafeInteger(changes) && changes >= 0,
    'STAGE_CHANGED',
  );
  check(
    typeof dataVersion === 'number' && Number.isSafeInteger(dataVersion) && dataVersion >= 0,
    'STAGE_CHANGED',
  );
  return { changes, dataVersion };
}
function liveTable(s: OwnedStage): boolean {
  try {
    if (!s.db.isOpen) return false;
    s.marker.setReadBigInts(false);
  } catch {
    return false;
  }
  // The first read spends its reserved credit; a retry must be funded before SQL.
  if (s.cleanupPrepaid) s.cleanupPrepaid = false;
  else s.budget.add('rows', 1);
  return version(s.db) === s.tempVersion;
}
function stageFailure(error: unknown): never {
  if (error instanceof MixedAnalysisError) throw error;
  if (error instanceof HistoryCaptureError) {
    if (error.code === 'HISTORY_LIMIT_EXCEEDED')
      throw new MixedAnalysisError('STAGE_LIMIT_EXCEEDED');
    if (error.code === 'HISTORY_CHANGED') throw new MixedAnalysisError('HISTORY_CHANGED');
    if (error.code === 'HISTORY_RELEASED') throw new MixedAnalysisError('STAGE_RELEASED');
  }
  throw new MixedAnalysisError('INVALID_STAGE');
}

function checkStageContext(s: OwnedStage, locked = false, budget = s.budget): void {
  check(s.db.isOpen, 'STAGE_RELEASED');
  check(locked ? s.db.isTransaction && s.status === 'APPLYING' : !s.db.isTransaction);
  s.marker.setReadBigInts(false);
  budget.add('rows', 1);
  check(version(s.db) === s.tempVersion, 'STAGE_CHANGED');
  const b = budget;
  b.add('rows', 2);
  b.own({ changes: 0, dataVersion: 0 });
  const epoch = databaseEpoch(s.db);
  b.own(epoch, false);
  check(isDeepStrictEqual(epoch, s.epoch), 'STAGE_CHANGED');
  b.add('rows', 1);
  const pre = s.db
    .prepare(
      'SELECT count(*) AS n,coalesce(sum(length(CAST(key AS BLOB))+length(CAST(value_json AS BLOB))),0) AS bytes FROM temp.mixed_stage',
    )
    .get();
  check(pre && pre.n === s.tempRows.size, 'STAGE_CHANGED');
  const n = pre.n as number,
    bytes = pre.bytes;
  check(typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes >= 0, 'STAGE_CHANGED');
  check(
    n <= Math.floor((b.limits.maxRows - b.rows) / 2) &&
      bytes <= b.limits.maxSerializedBytes - b.serializedBytes &&
      bytes <= Math.floor(b.limits.memoryBudgetBytes / 2) - b.retainedLogicalBytes,
    'STAGE_LIMIT_EXCEEDED',
  );
  const rows = s.db
    .prepare(
      'SELECT rowid AS locator,length(CAST(key AS BLOB))+length(CAST(value_json AS BLOB)) AS bytes FROM temp.mixed_stage ORDER BY key',
    )
    .iterate();
  try {
    for (const loc of rows) {
      b.add('rows', 1);
      check(
        typeof loc.bytes === 'number' && Number.isSafeInteger(loc.bytes) && loc.bytes >= 0,
        'STAGE_CHANGED',
      );
      b.add('serializedBytes', loc.bytes);
      b.pin(loc.bytes);
      b.add('rows', 1);
      const row = s.db
        .prepare('SELECT key,value_json FROM temp.mixed_stage WHERE rowid=?')
        .get(loc.locator as number);
      check(
        row && typeof row.key === 'string' && typeof row.value_json === 'string',
        'STAGE_CHANGED',
      );
      check(
        Buffer.byteLength(row.key) + Buffer.byteLength(row.value_json) === loc.bytes &&
          s.tempRows.get(row.key) === row.value_json,
        'STAGE_CHANGED',
      );
      b.own(row, false);
    }
  } finally {
    rows.return?.();
  }
  // Import only this reread's delta; all Stage/TEMP pins stay live. The adapter's absolute
  // limits reserve the Stage work that it cannot otherwise see, before any allocation.
  const previous = s.capture.usage,
    rem = b.remaining(),
    fresh = (locked ? recheckMixedAnalysisCaptureLocked : readMixedAnalysisCapture)(
      s.db,
      s.captureHandle,
      {
        maxRows: previous.rows + rem.maxRows,
        maxSerializedBytes: previous.serializedBytes + rem.maxSerializedBytes,
        maxItems: previous.items + rem.maxItems,
        maxDepth: rem.maxDepth,
        memoryBudgetBytes: 2 * previous.retainedLogicalBytes + rem.memoryBudgetBytes,
      },
    );
  b.add('rows', fresh.usage.rows - previous.rows);
  b.add('serializedBytes', fresh.usage.serializedBytes - previous.serializedBytes);
  b.add('items', fresh.usage.items - previous.items);
  b.pin(fresh.usage.retainedLogicalBytes - previous.retainedLogicalBytes);
  check(fresh.identity === s.capture.identity, 'STAGE_CHANGED');
  s.capture = fresh;
}
function tempWrite(s: OwnedStage, key: string, value: unknown): void {
  const b = s.budget,
    encoded = encodeHistoryValue(value, b),
    row = { key, value_json: encoded };
  b.own(row);
  const bytes = Buffer.byteLength(key) + Buffer.byteLength(encoded);
  b.add('serializedBytes', bytes);
  b.pin(bytes);
  b.add('rows', 1);
  check(Number.isSafeInteger(s.epoch.changes + 1), 'STAGE_CHANGED');
  s.db.prepare('INSERT INTO mixed_stage(key,value_json)VALUES(?,?)').run(key, encoded);
  s.epoch.changes++;
  s.tempRows.set(key, encoded);
}
function nativeUnitId(fields: string[], b: HistoryReadBudget): string {
  const domain = 'history-native-unit-v1';
  b.own(fields);
  const size =
    Buffer.byteLength(domain) +
    1 +
    fields.reduce((n, f) => {
      const bytes = Buffer.byteLength(f);
      return n + String(bytes).length + 1 + bytes;
    }, 0);
  b.add('serializedBytes', size);
  b.pin(size);
  b.pin(64 + domain.length + 1);
  const hash = createHash('sha256').update(domain + '\0');
  for (const f of fields) {
    const raw = Buffer.from(f);
    hash.update(String(raw.length) + ':').update(raw);
  }
  return domain + ':' + hash.digest('hex');
}
function prepareScope(
  s: OwnedStage,
  contracts: Contract[],
): { units: Unit[]; removedSourceFileIds: string[] } {
  const b = s.budget,
    view = s.capture.data.view,
    target = view.targetSource,
    inventory = view.targetInventory,
    old = view.history?.state,
    projected = (f: SourceFile) =>
      f.classification.role === 'SOURCE' || f.classification.role === 'TEST';
  check(
    inventory.every(
      (f) =>
        !projected(f) ||
        (f.classification.contentKind === 'TEXT' &&
          f.sensitivity !== 'SECRET' &&
          ['java', 'python'].includes(f.languageHint ?? '')),
    ),
    'FULL_ANALYSIS_REQUIRED',
  );
  const oldUnits = old?.units ?? [],
    required: { kind: 'JAVA_GROUP' | 'PYTHON_FILE'; ids: string[]; previousId: string | null }[] =
      [],
    removed: string[] = [];
  if (s.mode === 'FULL') {
    check(
      !(s.capture.data.entries.EVIDENCE ?? []).some(
        (v) => record(record(v).providerFact).providerId !== 'native',
      ) && !oldUnits.some((u) => u.providerId !== 'native'),
      'OTHER_PROVIDER_REVALIDATION_REQUIRED',
    );
    const java = inventory
      .filter((f) => projected(f) && f.languageHint === 'java')
      .map((f) => String(f.id))
      .sort(historyCompare);
    if (java.length) required.push({ kind: 'JAVA_GROUP', ids: java, previousId: null });
    for (const f of inventory.filter((f) => projected(f) && f.languageHint === 'python'))
      required.push({ kind: 'PYTHON_FILE', ids: [String(f.id)], previousId: null });
  } else {
    check(old, 'FULL_ANALYSIS_REQUIRED');
    check(
      old.basis.repositoryId === target.repositoryId &&
        old.basis.revisionId === target.revisionId &&
        old.repositoryLocatorDigest === s.capture.data.repositoryLocatorDigest,
      'FULL_ANALYSIS_REQUIRED',
    );
    b.own([old.inventory, inventory, old.contracts, contracts, old.units]);
    const changed = new Set<string>(),
      paths = new Map(inventory.map((f) => [f.path, f]));
    for (const f of old.inventory) {
      const after = inventory.find((v) => v.id === f.id);
      check(!paths.has(f.path) || paths.get(f.path)!.id === f.id, 'FULL_ANALYSIS_REQUIRED');
      if (!after) {
        changed.add(f.id);
        removed.push(f.id);
      } else {
        check(
          isDeepStrictEqual(after.classification, f.classification) &&
            after.languageHint === f.languageHint,
          'FULL_ANALYSIS_REQUIRED',
        );
        if (!isDeepStrictEqual(after, f)) changed.add(f.id);
      }
    }
    for (const f of inventory) if (!old.inventory.some((v) => v.id === f.id)) changed.add(f.id);
    const contractChanged = (id: string) =>
        !isDeepStrictEqual(
          old.contracts.find((c) => c.providerId === id),
          contracts.find((c) => c.providerId === id),
        ),
      javaAdded = inventory.some(
        (f) =>
          projected(f) && f.languageHint === 'java' && !old.inventory.some((v) => v.id === f.id),
      ),
      unitChanged = (u: (typeof old.units)[number]) =>
        contractChanged(u.providerId) ||
        u.sourceFileIds.some((id) => changed.has(id)) ||
        (u.kind === 'JAVA_GROUP' && javaAdded);
    for (const u of old.units)
      if (u.providerId !== 'native') check(!unitChanged(u), 'OTHER_PROVIDER_REVALIDATION_REQUIRED');
    for (const support of old.supports)
      if (support.binding.providerFact.providerId !== 'native')
        check(
          support.dependencyUnitIds !== null &&
            support.dependencyUnitIds.every((id) => {
              const u = old.units.find((v) => v.id === id);
              return u && !unitChanged(u);
            }) &&
            !contractChanged(support.binding.providerFact.providerId),
          'OTHER_PROVIDER_REVALIDATION_REQUIRED',
        );
    const java = inventory
        .filter((f) => projected(f) && f.languageHint === 'java')
        .map((f) => String(f.id))
        .sort(historyCompare),
      javaOld = old.units.find((u) => u.providerId === 'native' && u.kind === 'JAVA_GROUP');
    if (
      java.length &&
      (contractChanged('native') ||
        !isDeepStrictEqual(javaOld?.sourceFileIds ?? [], java) ||
        Boolean(javaOld && unitChanged(javaOld)))
    )
      required.push({ kind: 'JAVA_GROUP', ids: java, previousId: javaOld?.id ?? null });
    for (const f of inventory.filter((f) => projected(f) && f.languageHint === 'python')) {
      const prior = old.units.find(
        (u) => u.providerId === 'native' && u.kind === 'PYTHON_FILE' && u.sourceFileIds[0] === f.id,
      );
      if (!prior || unitChanged(prior))
        required.push({ kind: 'PYTHON_FILE', ids: [String(f.id)], previousId: prior?.id ?? null });
    }
    if (required.length === 0) {
      const unchanged =
        changed.size === 0 &&
        isDeepStrictEqual(contracts, old.contracts) &&
        target.contentFingerprint === old.basis.contentFingerprint;
      check(!unchanged, 'INVALID_STAGE');
      check(removed.length > 0, 'FULL_ANALYSIS_REQUIRED');
    }
  }
  b.own(required);
  const units = required.map((r) => ({
    id:
      r.previousId ??
      nativeUnitId(
        [
          target.repositoryId,
          target.revisionId,
          s.capture.data.repositoryLocatorDigest,
          'native',
          r.kind,
          ...(r.kind === 'PYTHON_FILE' ? r.ids : []),
        ],
        b,
      ),
    providerId: 'native',
    kind: r.kind,
    sourceFileIds: r.ids,
  }));
  units.sort((a, c) => historyCompare(a.id, c.id));
  removed.sort(historyCompare);
  b.own([units, removed]);
  return { units, removedSourceFileIds: removed };
}

function readPreparationContracts(value: unknown): Contract[] {
  const contracts = array(value).map((value) => {
    const c = exact(value, ['providerId', 'extractor', 'normalizer', 'contract', 'policy']);
    return {
      providerId: String(ProviderIdSchema.parse(c.providerId)),
      extractor: text(c.extractor),
      normalizer: text(c.normalizer),
      contract: text(c.contract),
      policy: text(c.policy),
    };
  });
  for (let i = 1; i < contracts.length; i++)
    check(
      historyCompare(contracts[i - 1]!.providerId, contracts[i]!.providerId) < 0,
      'INCOMPATIBLE_CONTRACT',
    );
  check(
    contracts.some((c) => c.providerId === 'native'),
    'INCOMPATIBLE_CONTRACT',
  );
  return contracts;
}

function importUsage(s: OwnedStage, value: unknown): void {
  const u = exact(value, ['rows', 'serializedBytes', 'items', 'retainedLogicalBytes']);
  for (const n of Object.values(u))
    check(typeof n === 'number' && Number.isSafeInteger(n) && n >= 0, 'INVALID_CANDIDATE');
  check(u.rows === 0, 'INVALID_CANDIDATE');
  s.budget.add('serializedBytes', u.serializedBytes as number);
  s.budget.add('items', u.items as number);
  s.budget.pin(u.retainedLogicalBytes as number);
}
function invokeRule(
  s: OwnedStage,
  method: 'prepareJavaOwner' | 'validateObservation' | 'compose',
  input: unknown,
): Record<string, unknown> {
  check(!s.busy);
  if (method !== 'prepareJavaOwner') {
    const packet = record(input);
    if (packet.rawBundle === null) s.budget.own(input);
    else {
      const raw = record(packet.rawBundle);
      s.budget.own({ ...packet, rawBundle: { metadata: raw.metadata } });
    }
  } else s.budget.own(input);
  let value: unknown;
  s.busy = true;
  try {
    value = s.rules[method](input, s.budget.remaining());
  } catch (error) {
    if (error instanceof MixedAnalysisRulesFailure) {
      importUsage(s, error.usage);
      throw new MixedAnalysisError(error.code);
    }
    const usage = mixedAnalysisFailureUsage(error);
    if (usage) {
      importUsage(s, usage);
      if (error instanceof HistoryCaptureError) throw error;
      const code =
        error !== null && typeof error === 'object'
          ? Object.getOwnPropertyDescriptor(error, 'code')?.value
          : null;
      throw new MixedAnalysisError(
        code === 'RESOURCE_LIMIT_EXCEEDED' ? 'STAGE_LIMIT_EXCEEDED' : 'INVALID_CANDIDATE',
      );
    }
    throw error;
  } finally {
    s.busy = false;
  }
  check(s.status !== 'INVALID' && s.status !== 'CONSUMED', 'STAGE_RELEASED');
  const r = exact(
    value,
    method === 'prepareJavaOwner'
      ? ['metadata', 'nodes', 'usage']
      : method === 'validateObservation'
        ? ['raw', 'usage']
        : [
            'manifest',
            'activationId',
            'origins',
            'projections',
            'members',
            'basis',
            'code',
            'usage',
          ],
  );
  importUsage(s, r.usage);
  s.budget.own(value);
  return record(s.budget.parse(encodeHistoryValue(value, s.budget)));
}
function target(s: OwnedStage, contracts: Contract[]) {
  return {
    source: s.capture.data.view.targetSource,
    repositoryLocatorDigest: s.capture.data.repositoryLocatorDigest,
    inventory: s.capture.data.view.targetInventory,
    contracts,
  };
}
function controlledJava(
  s: OwnedStage,
  owned: unknown,
  result: Record<string, unknown>,
  units: Unit[],
): { metadata: unknown; nodes: unknown[] } {
  const b = s.budget,
    m = exact(
      result.metadata,
      record(owned).kind === 'SETTLED_JAVA_OWNER'
        ? ['kind', 'schemaVersion', 'targetSource', 'inventory', 'snapshot', 'tool', 'java']
        : ['targetSource', 'inventory', 'snapshot', 'tool', 'java', 'codeSyntax'],
    );
  check(isDeepStrictEqual(m, owned), 'INVALID_CANDIDATE');
  check(isDeepStrictEqual(m.targetSource, s.capture.data.view.targetSource), 'INVALID_CANDIDATE');
  const files = array(m.inventory).map((f) => {
    b.own(f);
    return SourceFileSchema.parse(f);
  });
  const byId = (a: readonly SourceFile[]) => [...a].sort((a, c) => historyCompare(a.id, c.id));
  b.own([files, s.capture.data.view.targetInventory]);
  check(
    isDeepStrictEqual(byId(files), byId(s.capture.data.view.targetInventory)),
    'INVALID_CANDIDATE',
  );
  const java = record(m.java),
    snap = record(m.snapshot),
    events = array(java.events),
    rawNodes = events.filter((e) => record(e).type === 'NODE').map((e) => record(e).payload),
    nodes = array(result.nodes),
    seen = new Set<string>();
  check(rawNodes.length === nodes.length, 'INVALID_CANDIDATE');
  let previous: string[] | null = null;
  for (const value of nodes) {
    const row = exact(value, ['providerNode', 'canonicalNode', 'sourceFileId']);
    b.own(row);
    b.own(row);
    const p = ProviderNodeSchema.parse(row.providerNode),
      c = CanonicalNodeSchema.parse(row.canonicalNode),
      key = [String(p.providerId), String(p.providerFactId)];
    check(
      p.providerId === 'native' &&
        p.providerSnapshotId === snap.id &&
        p.repositoryId === s.capture.data.view.targetSource.repositoryId &&
        p.revisionId === s.capture.data.view.targetSource.revisionId &&
        c.repositoryId === p.repositoryId &&
        c.revisionId === p.revisionId,
      'INVALID_CANDIDATE',
    );
    check(
      rawNodes.some((n) => isDeepStrictEqual(n, p)) && !seen.has(JSON.stringify(key)),
      'INVALID_CANDIDATE',
    );
    seen.add(JSON.stringify(key));
    if (previous)
      check(
        historyCompare(previous[0]!, key[0]!) < 0 ||
          (previous[0] === key[0] && historyCompare(previous[1]!, key[1]!) < 0),
        'INVALID_CANDIDATE',
      );
    previous = key;
    const sourceId =
      p.sourceRange?.sourceFileId ??
      files.find((f) => String(f.path) === String(p.qualifiedName))?.id ??
      null;
    check(
      row.sourceFileId === sourceId &&
        (sourceId === null ||
          units.some((u) => u.kind === 'JAVA_GROUP' && u.sourceFileIds.includes(sourceId))),
      'INVALID_CANDIDATE',
    );
    check(
      c.name === p.name &&
        c.qualifiedName === p.qualifiedName &&
        isDeepStrictEqual(c.sourceRange, p.sourceRange) &&
        isDeepStrictEqual(c.confidence, p.confidence),
      'INVALID_CANDIDATE',
    );
  }
  return { metadata: m, nodes };
}
function javaDigest(value: { metadata: unknown; nodes: unknown[] }, b: HistoryReadBudget): string {
  const m = record(value.metadata),
    raw = encodeHistoryValue({ snapshot: m.snapshot, java: m.java, nodes: value.nodes }, b),
    n = Buffer.byteLength(raw);
  b.add('serializedBytes', n);
  b.pin(n);
  b.pin(64);
  const hash = createHash('sha256');
  if (m.kind === 'SETTLED_JAVA_OWNER') {
    const prefix = 'codeatlas-settled-java-owner-v1\0';
    b.add('serializedBytes', Buffer.byteLength(prefix));
    hash.update(prefix);
  }
  return hash.update(raw).digest('hex');
}
function compositionCapture(s: OwnedStage): Record<string, unknown> {
  const data = s.capture.data,
    b = s.budget,
    current = data.view.history,
    revision = data.view.targetSource.revisionId,
    rows = data.snapshotRows.filter((r) => r.requested_revision_id === revision),
    registry = new Map<string, unknown>();
  for (const manifest of data.archive)
    for (const snap of manifest.state.snapshots) {
      const prior = registry.get(snap.id);
      check(!prior || isDeepStrictEqual(prior, snap), 'INVALID_CANDIDATE');
      registry.set(snap.id, snap);
    }
  // Full rebuild may reuse complete immutable snapshot metadata without reviving old history authority.
  if (s.mode === 'FULL' && rows.some((row) => !registry.has(String(row.id)))) {
    const carriers = new Map<string, ReturnType<typeof validateHistoryManifest>>();
    for (const row of data.historyRows) {
      const encoded = text(row.manifest_json),
        parsed = b.parse(encoded);
      check(encoded === encodeHistoryValue(parsed, b), 'INVALID_CANDIDATE');
      const manifest = validateHistoryManifest(parsed, b),
        digest = historyDigest('codeatlas-activation-history-v1', manifest, b);
      check(
        row.id === 'activation:' + digest &&
          row.manifest_digest === digest &&
          row.repository_id === data.view.targetSource.repositoryId &&
          manifest.state.basis.repositoryId === row.repository_id &&
          manifest.state.basis.revisionId === row.revision_id &&
          row.parent_id === (manifest.parent?.activationId ?? null),
        'INVALID_CANDIDATE',
      );
      b.own(manifest);
      carriers.set(String(row.id), manifest);
    }
    for (const [id, manifest] of carriers) {
      const seen = new Set<string>();
      let currentId = id,
        child = manifest;
      while (child.parent !== null) {
        b.own(currentId);
        check(!seen.has(currentId), 'INVALID_CANDIDATE');
        seen.add(currentId);
        const parent = carriers.get(child.parent.activationId);
        check(
          parent &&
            child.parent.repositoryId === parent.state.basis.repositoryId &&
            child.parent.revisionId === parent.state.basis.revisionId,
          'INVALID_CANDIDATE',
        );
        if (child.transitions !== null)
          check(
            isDeepStrictEqual(record(child.transitions).oldBasis, parent.state.basis),
            'INVALID_CANDIDATE',
          );
        currentId = child.parent.activationId;
        child = parent;
      }
      for (const snapshot of manifest.state.snapshots) {
        const prior = registry.get(snapshot.id);
        check(!prior || isDeepStrictEqual(prior, snapshot), 'INVALID_CANDIDATE');
        registry.set(snapshot.id, snapshot);
      }
    }
  }
  const snapshots = rows
    .map((row) => {
      const full = registry.get(String(row.id));
      check(full, 'FULL_ANALYSIS_REQUIRED');
      b.own(full);
      const snap = ProviderSnapshotSchema.parse(full),
        { diagnostics, ...projection } = snap;
      void diagnostics;
      const actual = {
        id: row.id,
        repositoryId: row.repository_id,
        providerId: row.provider_id,
        providerVersion: row.provider_version,
        runtimeVersion: row.runtime_version,
        requestedRevisionId: row.requested_revision_id,
        requestedRevisionFingerprint: row.requested_revision_fingerprint,
        startedAt: new Date(row.started_at as number).toISOString(),
        completedAt: new Date(row.completed_at as number).toISOString(),
        capabilities: data.capabilityRows
          .filter((c) => c.snapshot_id === row.id)
          .map((c) => ({ name: c.name, support: c.support, coverage: c.coverage }))
          .sort((a, c) => historyCompare(String(a.name), String(c.name))),
        outcome: row.outcome,
      };
      b.own(actual);
      check(
        isDeepStrictEqual(
          {
            ...projection,
            capabilities: [...projection.capabilities].sort((a, c) =>
              historyCompare(a.name, c.name),
            ),
          },
          actual,
        ),
        'INVALID_CANDIDATE',
      );
      return snap;
    })
    .sort((a, c) => historyCompare(a.id, c.id));
  const parent = current
      ? {
          activationId:
            'activation:' + historyDigest('codeatlas-activation-history-v1', current, b),
          repositoryId: current.state.basis.repositoryId,
          revisionId: current.state.basis.revisionId,
        }
      : null,
    ids = new Set(rows.map((r) => r.id)),
    coverage = data.coverageRows
      .filter((r) => ids.has(r.provider_snapshot_id))
      .map((r) => ({
        providerSnapshotId: r.provider_snapshot_id,
        capabilityName: r.capability_name,
        sourceFileId: r.source_file_id,
        status: r.status,
      })),
    activeProviderIds = [
      ...new Set(
        (data.entries.EVIDENCE ?? []).map((e) => String(record(record(e).providerFact).providerId)),
      ),
    ].sort(historyCompare),
    capture = {
      parent,
      snapshotIds: data.snapshotIds,
      snapshots,
      coverage,
      activeProviderIds,
      ...(s.mode === 'DELTA'
        ? {
            history: current,
            ancestors: data.archive.slice(1),
            origins: data.origins,
            projections: data.projections,
          }
        : {}),
    };
  b.own(capture);
  return capture;
}
function copyStageBytes(value: unknown, b: HistoryReadBudget): Uint8Array {
  check(
    value !== null &&
      typeof value === 'object' &&
      !types.isProxy(value) &&
      types.isUint8Array(value) &&
      (Object.getPrototypeOf(value) === Buffer.prototype ||
        Object.getPrototypeOf(value) === Uint8Array.prototype),
    'INVALID_CANDIDATE',
  );
  const n = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(Uint8Array.prototype),
    'byteLength',
  )!.get!.call(value) as number;
  b.add('serializedBytes', n);
  b.pin(n);
  check(Reflect.ownKeys(value).length === n, 'INVALID_CANDIDATE');
  b.add('serializedBytes', n);
  b.pin(n);
  return Buffer.from(value as Uint8Array);
}

function declaredJSONLines(bytes: Uint8Array, b: HistoryReadBudget): unknown[] {
  // Generic JSON consistency only; the sole v5 state machine remains in Providers.
  const n = bytes.byteLength;
  b.add('serializedBytes', n);
  b.pin(n);
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let lines = 1;
  for (const c of bytes) if (c === 10) lines++;
  b.add('items', lines);
  b.pin(lines * 8);
  b.pin(n);
  const parts = raw.split('\n');
  if (parts.at(-1) === '') parts.pop();
  check(parts.length > 0, 'INVALID_CANDIDATE');
  return parts.map((line) => {
    check(line.trim().length > 0, 'INVALID_CANDIDATE');
    return b.parse(line);
  });
}

function base64(bytes: Uint8Array, b: HistoryReadBudget): string {
  const size = 4 * Math.ceil(bytes.byteLength / 3);
  b.add('serializedBytes', size);
  b.pin(size);
  return Buffer.prototype.toString.call(bytes, 'base64');
}

function rowMultiset(value: unknown, b: HistoryReadBudget): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of array(value)) {
    const key = encodeHistoryValue(row, b);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}
function validateFrozenResult(
  s: OwnedStage,
  result: Record<string, unknown>,
  capture: Record<string, unknown>,
): Readonly<RepoBasis> {
  const b = s.budget,
    owner = s.owner!;
  const manifest = validateHistoryManifest(result.manifest, b),
    state = manifest.state,
    basis = RepoBasisSchema.parse(result.basis),
    code = record(result.code);
  check(
    isDeepStrictEqual(manifest.parent, capture.parent) &&
      isDeepStrictEqual(state.basis, basis) &&
      isDeepStrictEqual(state.inventory, s.capture.data.view.targetInventory) &&
      isDeepStrictEqual(state.contracts, owner.contracts) &&
      state.repositoryLocatorDigest === s.capture.data.repositoryLocatorDigest,
    'INVALID_CANDIDATE',
  );
  check(
    s.mode === 'FULL' ? manifest.transitions === null : manifest.transitions !== null,
    'INVALID_CANDIDATE',
  );
  if (s.mode === 'DELTA')
    check(
      isDeepStrictEqual(
        record(manifest.transitions).oldBasis,
        s.capture.data.view.history!.state.basis,
      ),
      'INVALID_CANDIDATE',
    );
  check(isDeepStrictEqual(predictCodeActivation(code, b), basis), 'INVALID_CANDIDATE');
  // Compare already-owned complete values without allocating a second normalized graph.
  for (const kind of ['nodes', 'edges'] as const) {
    const rows = array(code[kind]);
    check(
      rows.length === state[kind].length &&
        state[kind].every((value) => rows.some((row) => isDeepStrictEqual(row, value))),
      'INVALID_CANDIDATE',
    );
  }
  const evidence = array(code.evidence),
    bindings = array(code.bindings),
    facts = array(code.factEvidence),
    candidates = array(code.candidates);
  check(
    evidence.length === state.supports.length &&
      bindings.length === state.supports.length &&
      facts.length === state.supports.length &&
      candidates.length === state.supports.length,
    'INVALID_CANDIDATE',
  );
  for (const support of state.supports) {
    check(
      evidence.some((v) => isDeepStrictEqual(v, support.evidence)) &&
        bindings.some((v) => isDeepStrictEqual(v, support.binding)) &&
        facts.some((v) => isDeepStrictEqual(v, support.factEvidence)) &&
        candidates.some((value) => {
          const v = record(value);
          return (
            v.evidenceId === support.evidence.id &&
            v.factType === support.factType &&
            v.canonicalFactId === support.canonical.id &&
            isDeepStrictEqual(v.candidate, support.canonical)
          );
        }),
      'INVALID_CANDIDATE',
    );
  }
  check(
    result.activationId ===
      'activation:' + historyDigest('codeatlas-activation-history-v1', manifest, b),
    'INVALID_CANDIDATE',
  );
  const raw = s.observationDeclaration === null ? null : record(s.observationDeclaration),
    metadata = raw ? record(raw.metadata) : null,
    snapshot = metadata ? record(metadata.snapshot) : null,
    previous = s.capture.data.view.history,
    oldState = previous?.state,
    affected = (u: { id: string; sourceFileIds: readonly string[] }) =>
      owner.units.some((v) => v.id === u.id) ||
      u.sourceFileIds.some((id) => owner.removedSourceFileIds.includes(id));
  const retained =
    s.mode === 'DELTA'
      ? (oldState?.supports ?? []).filter(
          (v) =>
            v.dependencyUnitIds !== null &&
            v.dependencyUnitIds.every((id) => {
              const u = oldState!.units.find((u) => u.id === id);
              return u && !affected(u);
            }),
        )
      : [];
  for (const support of retained)
    check(
      state.supports.some((v) => isDeepStrictEqual(v, support)),
      'INVALID_CANDIDATE',
    );
  for (const support of state.supports)
    if (!snapshot || support.evidence.providerSnapshotId !== snapshot.id)
      check(
        retained.some((v) => isDeepStrictEqual(v, support)),
        'INVALID_CANDIDATE',
      );
  const expectedUnits = [
    ...(s.mode === 'DELTA' ? (oldState?.units ?? []).filter((u) => !affected(u)) : []),
    ...owner.units,
  ].sort((a, c) => historyCompare(a.id, c.id));
  b.own(expectedUnits);
  check(isDeepStrictEqual(state.units, expectedUnits), 'INVALID_CANDIDATE');
  let freshSnapshot: unknown = null;
  if (raw && metadata && snapshot) {
    const cs = record(raw.codeSyntax),
      java = raw.java === null ? null : record(raw.java),
      codeEvents = array(cs.events).map(record),
      javaEvents = java ? array(java.events).map(record) : [],
      events = [...javaEvents, ...codeEvents],
      facts = events.filter((e) => e.type === 'NODE' || e.type === 'EDGE'),
      freshSupports = state.supports.filter((v) => v.evidence.providerSnapshotId === snapshot.id);
    b.own([events, facts]);
    check(facts.length === freshSupports.length, 'INVALID_CANDIDATE');
    for (const event of facts) {
      const p = record(event.payload);
      check(
        freshSupports.filter(
          (v) =>
            v.factType === event.type &&
            v.binding.providerFact.providerId === p.providerId &&
            v.binding.providerFact.providerFactId === p.providerFactId,
        ).length === 1,
        'INVALID_CANDIDATE',
      );
    }
    const names = [
        ...(java ? ['JAVA_CODE_V2'] : []),
        ...(owner.units.some((u) => u.kind === 'PYTHON_FILE') ? ['PYTHON_SYNTAX_CODE_V1'] : []),
        'FRAMEWORK_SYNTAX_OBSERVATION_V1',
      ],
      data = {
        ...snapshot,
        repositoryId: state.basis.repositoryId,
        requestedRevisionId: state.basis.revisionId,
        requestedRevisionFingerprint: state.basis.contentFingerprint,
        capabilities: names.map((name) => ({ name, support: 'SUPPORTED', coverage: 'COMPLETE' })),
        diagnostics: events.filter((e) => e.type === 'DIAGNOSTIC').map((e) => e.payload),
        outcome: 'SUCCEEDED',
      };
    b.own(data);
    freshSnapshot = ProviderSnapshotSchema.parse(data);
    const obs = exact(manifest.observation, [
        'snapshotId',
        'requestIdentity',
        'outputIdentity',
        'javaProvenance',
        'scope',
        'qualificationRef',
      ]),
      scope = exact(obs.scope, ['unitIds', 'removedSourceFileIds']),
      proof = record(raw.provenance);
    check(
      obs.snapshotId === snapshot.id &&
        obs.requestIdentity === proof.requestIdentity &&
        obs.outputIdentity === proof.outputIdentity &&
        obs.qualificationRef === owner.qualificationRef &&
        isDeepStrictEqual(
          scope.unitIds,
          owner.units.map((u) => u.id),
        ) &&
        isDeepStrictEqual(scope.removedSourceFileIds, owner.removedSourceFileIds),
      'INVALID_CANDIDATE',
    );
    check(
      isDeepStrictEqual(
        obs.javaProvenance,
        java
          ? {
              kind: 'PARSED_V2',
              requestId: record(java.request).requestId,
              startedAt: java.startedAt,
              settledAt: java.settledAt,
            }
          : null,
      ),
      'INVALID_CANDIDATE',
    );
  } else check(manifest.observation === null, 'INVALID_CANDIDATE');
  const snapshots = [...array(capture.snapshots), ...(freshSnapshot ? [freshSnapshot] : [])].sort(
    (a, c) => historyCompare(text(record(a).id), text(record(c).id)),
  );
  b.own(snapshots);
  check(
    isDeepStrictEqual(state.snapshots, snapshots) &&
      isDeepStrictEqual(code.snapshots, snapshots) &&
      code.committedSnapshotCount === s.capture.data.snapshotIds.length + (freshSnapshot ? 1 : 0),
    'INVALID_CANDIDATE',
  );
  const expectedCoverage = [...array(capture.coverage)];
  if (snapshot)
    for (const unit of owner.units)
      for (const facet of [
        'FRAMEWORK_SYNTAX_OBSERVATION_V1',
        unit.kind === 'JAVA_GROUP' ? 'JAVA_CODE_V2' : 'PYTHON_SYNTAX_CODE_V1',
      ])
        for (const sourceFileId of unit.sourceFileIds)
          expectedCoverage.push({
            providerSnapshotId: snapshot.id,
            capabilityName: facet,
            sourceFileId,
            status: 'COMPLETE',
          });
  b.own(expectedCoverage);
  check(
    isDeepStrictEqual(rowMultiset(code.coverage, b), rowMultiset(expectedCoverage, b)),
    'INVALID_CANDIDATE',
  );
  const origins = array(result.origins).map(record),
    projections = array(result.projections).map(record);
  check(
    isDeepStrictEqual(result.members, manifest.syntaxMembers) &&
      origins.length === manifest.syntaxMembers.length &&
      projections.length === manifest.syntaxMembers.length &&
      new Set(origins.map((v) => v.id)).size === origins.length &&
      new Set(projections.map((v) => v.id)).size === projections.length,
    'INVALID_CANDIDATE',
  );
  const requiredOld =
    s.mode === 'DELTA'
      ? (oldState?.syntaxOrigins ?? []).filter((v) => {
          const u = oldState!.units.find((u) => u.id === v.unitId);
          return u && !affected(u);
        })
      : [];
  for (const old of requiredOld) {
    check(
      state.syntaxOrigins.some((v) => isDeepStrictEqual(v, old)),
      'INVALID_CANDIDATE',
    );
    const prior = s.capture.data.origins.find((v) => v.id === old.id);
    check(prior, 'INVALID_CANDIDATE');
    const original = { ...prior };
    b.own(original);
    check(
      origins.some((v) => isDeepStrictEqual(v, original)),
      'INVALID_CANDIDATE',
    );
  }
  let freshOrigins = 0;
  const syntaxEnvelopes: Record<string, unknown>[] = [];
  for (const origin of origins) {
    const member = manifest.syntaxMembers.find((v) => v.originId === origin.id),
      projection = projections.find((v) => v.origin_id === origin.id),
      meta = state.syntaxOrigins.find((v) => v.id === origin.id);
    check(member && projection && meta, 'INVALID_CANDIDATE');
    syntaxEnvelopes.push(
      validateSyntaxPair(
        origin,
        projection,
        meta,
        member.unitId,
        manifest,
        [manifest, ...s.capture.data.archive],
        b,
      ),
    );
    if (!requiredOld.some((v) => v.id === origin.id)) {
      check(raw && snapshot && meta.originSnapshotId === snapshot.id, 'INVALID_CANDIDATE');
      const body = record(b.parse(text(origin.origin_json))),
        cs = record(raw.codeSyntax);
      const request = record(cs.request),
        envelope = record(body.envelope);
      check(
        envelope.version ===
          (request.protocolVersion === 8
            ? 4
            : request.protocolVersion === 7
              ? 3
              : request.protocolVersion === 6
                ? 2
                : 1),
        'INVALID_CANDIDATE',
      );
      check(
        array(cs.events).some((e) => {
          const event = record(e);
          return (
            event.type === 'SYNTAX_OBSERVATION' &&
            record(event.payload).providerSyntaxId === body.providerSyntaxId
          );
        }),
        'INVALID_CANDIDATE',
      );
      freshOrigins++;
    }
  }
  validateSyntaxProjectionClosure(syntaxEnvelopes, manifest.state, b);
  check(
    freshOrigins ===
      (raw
        ? array(record(raw.codeSyntax).events).filter(
            (e) => record(e).type === 'SYNTAX_OBSERVATION',
          ).length
        : 0),
    'INVALID_CANDIDATE',
  );
  return Object.freeze(basis);
}

/** Internal same-connection owned Stage; the Store is the sole lease consumer. */
export class MixedAnalysisStage {
  constructor(
    db: DatabaseSync,
    captureHandle: object,
    mode: 'FULL' | 'DELTA',
    input: HistoryReadLimits,
    rules: MixedAnalysisRulesPort,
    sourceBudget?: HistoryReadBudget,
  ) {
    let created = false,
      cleanupPrepaid = false,
      ownedVersion: number | undefined;
    try {
      check(!types.isProxy(db) && db instanceof DatabaseSync && db.isOpen && !db.isTransaction);
      check(mode === 'FULL' || mode === 'DELTA');
      check(!connections.has(db));
      const limits = checkedHistoryLimits(input),
        port = exact(rules, ['prepareJavaOwner', 'validateObservation', 'compose']);
      for (const method of ['prepareJavaOwner', 'validateObservation', 'compose'])
        check(
          typeof port[method] === 'function' &&
            !types.isProxy(port[method]) &&
            !types.isAsyncFunction(port[method]) &&
            !types.isGeneratorFunction(port[method]) &&
            Object.isFrozen(rules),
        );
      // Reserve five setup rows and the first cleanup read before allocating TEMP.
      check(limits.maxRows > 6, 'STAGE_LIMIT_EXCEEDED');
      check(
        db.prepare("SELECT count(*) AS n FROM sqlite_temp_schema WHERE name='mixed_stage'").get()
          ?.n === 0,
      );
      if (sourceBudget) prepareMixedSourceBudget(sourceBudget, limits);
      const budget = sourceBudget ?? new HistoryReadBudget(limits);
      const available = sourceBudget ? budget.remaining() : limits;
      check(available.maxRows > 6, 'STAGE_LIMIT_EXCEEDED');
      const capture = readMixedAnalysisCapture(db, captureHandle, {
        ...available,
        maxRows: available.maxRows - 6,
      });
      budget.add('rows', capture.usage.rows);
      budget.add('serializedBytes', capture.usage.serializedBytes);
      budget.add('items', capture.usage.items);
      budget.pin(capture.usage.retainedLogicalBytes);
      budget.add('rows', 6);
      cleanupPrepaid = true;
      budget.own({ changes: 0, dataVersion: 0 });
      const row = { key: 'CAPTURE', value_json: capture.identity };
      budget.own(row);
      const bytes = Buffer.byteLength(row.key) + Buffer.byteLength(row.value_json);
      budget.add('serializedBytes', bytes);
      budget.pin(bytes);
      db.exec(
        'CREATE TEMP TABLE mixed_stage (key TEXT PRIMARY KEY,value_json TEXT NOT NULL) STRICT',
      );
      created = true;
      ownedVersion = version(db);
      db.prepare('INSERT INTO mixed_stage(key,value_json)VALUES(?,?)').run(row.key, row.value_json);
      const entry: OwnedStage = {
        db,
        marker: db.prepare('SELECT 1 WHERE 0'),
        tempVersion: ownedVersion,
        cleanupPrepaid,
        epoch: databaseEpoch(db),
        capture,
        captureHandle,
        budget,
        mode,
        rules,
        status: 'PREPARING',
        tempRows: new Map([['CAPTURE', capture.identity]]),
      };
      stages.set(this, entry);
      connections.set(db, this);
      bindMixedSourceBudget(
        budget,
        () => {
          check(
            stages.get(this) === entry && entry.db.isOpen && connections.get(entry.db) === this,
            'STAGE_RELEASED',
          );
          check(!entry.db.isTransaction);
          check(
            ['PREPARING', 'OWNER_FROZEN', 'OBSERVED', 'FROZEN'].includes(entry.status),
            'STAGE_RELEASED',
          );
          entry.marker.setReadBigInts(false);
        },
        () => {
          if (entry.status !== 'CONSUMED') entry.status = 'INVALID';
        },
      );
    } catch (error) {
      if (sourceBudget) invalidateMixedSourceBudget(sourceBudget);
      // A name alone never authorizes cleanup after a DDL/connection incarnation change.
      if (created && ownedVersion !== undefined && cleanupPrepaid)
        try {
          if (db.isOpen && !db.isTransaction) {
            cleanupPrepaid = false;
            if (version(db) === ownedVersion) db.exec('DROP TABLE temp.mixed_stage');
          }
        } catch {
          /* Preserve uncertain TEMP ownership. */
        }
      stageFailure(error);
    }
  }
  prepareOwner(javaRows: unknown, scope: unknown): { ownerHandle: object; stageDigest: string } {
    const s = stages.get(this);
    check(s, closed.has(this) ? 'STAGE_RELEASED' : 'INVALID_STAGE');
    check(s.status !== 'INVALID' && s.status !== 'CONSUMED', 'STAGE_RELEASED');
    if (s.busy) {
      s.status = 'INVALID';
      throw new MixedAnalysisError('INVALID_STAGE');
    }
    check(s.status === 'PREPARING');
    try {
      const b = s.budget;
      b.own(javaRows);
      b.own(scope);
      const config = exact(b.parse(encodeHistoryValue(scope, b)), [
          'contracts',
          'qualificationRef',
        ]),
        qualificationRef = text(config.qualificationRef),
        contracts = readPreparationContracts(config.contracts);
      checkStageContext(s);
      const derived = prepareScope(s, contracts);
      let java: { metadata: unknown; nodes: unknown[] } | null = null;
      if (derived.units.some((u) => u.kind === 'JAVA_GROUP')) {
        check(javaRows !== null, 'INVALID_CANDIDATE');
        const owned = b.parse(encodeHistoryValue(javaRows, b)),
          result = invokeRule(s, 'prepareJavaOwner', {
            target: target(s, contracts),
            scope: { units: derived.units, removedSourceFileIds: derived.removedSourceFileIds },
            javaRows: owned,
          });
        java = controlledJava(s, owned, result, derived.units);
        checkStageContext(s);
      } else check(javaRows === null, 'INVALID_CANDIDATE');
      const history = s.capture.data.view.history,
        expectedActivationId = history
          ? 'activation:' + historyDigest('codeatlas-activation-history-v1', history, b)
          : null,
        inventoryDigest = s.capture.data.sourceInventoryDigest;
      check(typeof inventoryDigest === 'string' && /^[a-f0-9]{64}$/.test(inventoryDigest));
      const body = {
          schemaVersion: 1,
          repositoryLocatorDigest: s.capture.data.repositoryLocatorDigest,
          expectedActivationId,
          expectedOldBasis: s.capture.data.view.activeBasis,
          targetSource: s.capture.data.view.targetSource,
          inventoryDigest,
          contracts,
          scope: {
            unitIds: derived.units.map((u) => u.id),
            removedSourceFileIds: derived.removedSourceFileIds,
            ownerSourceFileIds: java
              ? [
                  ...new Set(
                    java.nodes
                      .map((n) => record(n).sourceFileId)
                      .filter((id): id is string => typeof id === 'string'),
                  ),
                ].sort(historyCompare)
              : [],
          },
          javaRowsDigest: java ? javaDigest(java, b) : null,
        },
        stageDigest = historyDigest('codeatlas-provisional-owner-stage-v1', body, b),
        ownerHandle = Object.freeze({});
      tempWrite(s, 'OWNER', body);
      s.owner = { ownerHandle, stageDigest, body, contracts, qualificationRef, java, ...derived };
      s.status = 'OWNER_FROZEN';
      return Object.freeze({ ownerHandle, stageDigest });
    } catch (error) {
      s.status = 'INVALID';
      if (error instanceof HistoryCaptureError && error.code === 'INVALID_HISTORY')
        throw new MixedAnalysisError('INVALID_CANDIDATE');
      return stageFailure(error);
    }
  }

  acceptObservation(ownerHandle: object, rawBundle: unknown): void {
    const s = stages.get(this);
    check(s, closed.has(this) ? 'STAGE_RELEASED' : 'INVALID_STAGE');
    check(s.status !== 'INVALID' && s.status !== 'CONSUMED', 'STAGE_RELEASED');
    if (s.busy) {
      s.status = 'INVALID';
      throw new MixedAnalysisError('INVALID_STAGE');
    }
    check(s.status === 'OWNER_FROZEN');
    try {
      check(s.owner && ownerHandle === s.owner.ownerHandle, 'INVALID_CANDIDATE');
      checkStageContext(s);
      const b = s.budget,
        owner = s.owner;
      if (owner.units.length === 0 && s.mode === 'DELTA') {
        check(
          s.mode === 'DELTA' && owner.removedSourceFileIds.length > 0 && rawBundle === null,
          'INVALID_CANDIDATE',
        );
        tempWrite(s, 'OBSERVATION', null);
        s.observation = null;
        s.observationDeclaration = null;
        s.status = 'OBSERVED';
        return;
      }
      const r = exact(rawBundle, ['metadata', 'requestBytes', 'outputBytes']);
      b.own(r.metadata);
      const metadata = b.parse(encodeHistoryValue(r.metadata, b)),
        raw = {
          metadata,
          requestBytes: copyStageBytes(r.requestBytes, b),
          outputBytes: copyStageBytes(r.outputBytes, b),
        },
        capture = compositionCapture(s),
        result = invokeRule(s, 'validateObservation', {
          mode: s.mode,
          target: target(s, owner.contracts),
          capture,
          scope: { units: owner.units, removedSourceFileIds: owner.removedSourceFileIds },
          owner: { stageDigest: owner.stageDigest, java: owner.java },
          rawBundle: raw,
        }),
        validated = exact(result.raw, ['kind', 'metadata', 'java', 'codeSyntax', 'provenance']);
      check(isDeepStrictEqual(validated.metadata, metadata), 'INVALID_CANDIDATE');
      const m = record(metadata);
      check(isDeepStrictEqual(validated.java, m.java), 'INVALID_CANDIDATE');
      const code = record(validated.codeSyntax),
        requests = declaredJSONLines(raw.requestBytes, b),
        events = declaredJSONLines(raw.outputBytes, b);
      check(
        requests.length === 1 &&
          isDeepStrictEqual(requests[0], code.request) &&
          isDeepStrictEqual(events, code.events),
        'INVALID_CANDIDATE',
      );
      const request = record(code.request),
        payload = record(request.payload),
        binding = record(payload.ownerBinding);
      const selectedContract = owner.contracts.find((c) => c.providerId === 'native')?.contract;
      const bindingV8 = selectedContract === 'SYNTAX_BINDING_V4';
      const bindingV7 = selectedContract === 'SYNTAX_BINDING_V3';
      const bindingV6 = selectedContract === 'SYNTAX_BINDING_V2';
      check(
        request.protocolVersion === (bindingV8 ? 8 : bindingV7 ? 7 : bindingV6 ? 6 : 5) &&
          (!bindingV6 || payload.syntaxContract === 'SYNTAX_BINDING_V2') &&
          (!bindingV7 || payload.syntaxContract === 'SYNTAX_BINDING_V3') &&
          (!bindingV8 ||
            (payload.syntaxContract === 'SYNTAX_BINDING_V4' &&
              payload.extractorVersion === 'syntax-v2')),
        'INVALID_CANDIDATE',
      );
      check(
        binding.kind === 'PROVISIONAL_CODE' &&
          binding.stageDigest === owner.stageDigest &&
          isDeepStrictEqual(payload.targetSource, s.capture.data.view.targetSource) &&
          isDeepStrictEqual(
            payload.expectedActivationBasis,
            s.mode === 'FULL' ? null : record(owner.body).expectedOldBasis,
          ),
        'INVALID_CANDIDATE',
      );
      const files = array(payload.sourceFiles).map((f) => SourceFileSchema.parse(f)),
        scopeIds = new Set(owner.units.flatMap((u) => u.sourceFileIds));
      check(
        files.length === scopeIds.size &&
          files.every(
            (f) =>
              scopeIds.has(f.id) &&
              s.capture.data.view.targetInventory.some((x) => isDeepStrictEqual(x, f)),
          ),
        'INVALID_CANDIDATE',
      );
      const nativeOwners = array(payload.owners);
      for (const o of nativeOwners) {
        const row = exact(o, ['sourceFileId', 'providerNodeRef', 'canonicalRef']),
          ref = record(row.providerNodeRef),
          canonical = record(row.canonicalRef),
          entity = record(canonical.entity);
        check(
          owner.java &&
            owner.java.nodes.some((n) => {
              const node = record(n),
                p = record(node.providerNode),
                c = record(node.canonicalNode);
              return (
                row.sourceFileId === node.sourceFileId &&
                ref.factType === 'NODE' &&
                ref.providerId === p.providerId &&
                ref.providerFactId === p.providerFactId &&
                canonical.scope === 'REPOSITORY' &&
                canonical.repositoryId === p.repositoryId &&
                entity.kind === 'CODE_NODE' &&
                entity.id === c.id &&
                entity.revisionId === p.revisionId
              );
            }),
          'INVALID_CANDIDATE',
        );
      }
      const proof = exact(validated.provenance, ['kind', 'requestIdentity', 'outputIdentity']);
      check(proof.kind === 'DECLARED_INPUT', 'INVALID_CANDIDATE');
      for (const [bytes, digest] of [
        [raw.requestBytes, proof.requestIdentity],
        [raw.outputBytes, proof.outputIdentity],
      ] as const) {
        b.add('serializedBytes', bytes.byteLength);
        b.pin(64);
        check(createHash('sha256').update(bytes).digest('hex') === digest, 'INVALID_CANDIDATE');
      }
      checkStageContext(s);
      tempWrite(s, 'OBSERVATION', {
        metadata,
        requestBase64: base64(raw.requestBytes, b),
        outputBase64: base64(raw.outputBytes, b),
        validated,
      });
      s.observation = raw;
      s.observationDeclaration = validated;
      s.status = 'OBSERVED';
    } catch (error) {
      s.status = 'INVALID';
      if (error instanceof HistoryCaptureError && error.code === 'INVALID_HISTORY')
        throw new MixedAnalysisError('INVALID_CANDIDATE');
      return stageFailure(error);
    }
  }

  freeze(): { lease: object; basis: Readonly<RepoBasis> } {
    const s = stages.get(this);
    check(s, closed.has(this) ? 'STAGE_RELEASED' : 'INVALID_STAGE');
    check(s.status !== 'INVALID' && s.status !== 'CONSUMED', 'STAGE_RELEASED');
    if (s.busy) {
      s.status = 'INVALID';
      throw new MixedAnalysisError('INVALID_STAGE');
    }
    check(s.status === 'OBSERVED');
    try {
      checkStageContext(s);
      check(s.owner);
      const capture = compositionCapture(s),
        result = invokeRule(s, 'compose', {
          mode: s.mode,
          target: target(s, s.owner.contracts),
          capture,
          rawBundle: s.observation ?? null,
          qualificationRef: s.owner.qualificationRef,
        }),
        basis = validateFrozenResult(s, result, capture);
      checkStageContext(s);
      tempWrite(s, 'FROZEN', result);
      checkStageContext(s);
      const raw = encodeHistoryValue([...s.tempRows], s.budget);
      s.budget.add('serializedBytes', Buffer.byteLength(raw));
      s.budget.pin(64);
      const seal = createHash('sha256').update(raw).digest('hex'),
        lease = Object.freeze({});
      s.frozen = { lease, basis, result, seal };
      s.status = 'FROZEN';
      leases.set(lease, { stage: this, owned: s });
      return Object.freeze({ lease, basis });
    } catch (error) {
      s.status = 'INVALID';
      if (s.frozen) {
        leases.delete(s.frozen.lease);
        releasedLeases.add(s.frozen.lease);
      }
      if (error instanceof HistoryCaptureError && error.code === 'INVALID_HISTORY')
        throw new MixedAnalysisError('INVALID_CANDIDATE');
      return stageFailure(error);
    }
  }

  close(): void {
    if (closed.has(this)) return;
    const s = stages.get(this);
    check(s);
    check(s.status !== 'APPLYING');
    if (s.busy) {
      s.status = 'INVALID';
      throw new MixedAnalysisError('INVALID_STAGE');
    }
    if (s.db.isOpen && s.db.isTransaction) {
      s.status = 'INVALID';
      throw new MixedAnalysisError('INVALID_STAGE');
    }
    try {
      if (connections.get(s.db) === this && liveTable(s)) s.db.exec('DROP TABLE temp.mixed_stage');
    } catch (error) {
      if (s.status !== 'CONSUMED') s.status = 'INVALID';
      stageFailure(error);
    }
    if (s.frozen) {
      leases.delete(s.frozen.lease);
      releasedLeases.add(s.frozen.lease);
    }
    closed.add(this);
    stages.delete(this);
    if (connections.get(s.db) === this) connections.delete(s.db);
  }
}

const releasedLeases = new WeakSet<object>();
/** Private friend of the validated Store, never exported by the package index. */
export function acquireMixedAnalysisLease(
  db: DatabaseSync,
  lease: object,
  input: HistoryReadLimits,
) {
  check(lease !== null && typeof lease === 'object' && !types.isProxy(lease));
  const entry = leases.get(lease);
  check(entry, releasedLeases.has(lease) ? 'STAGE_RELEASED' : 'INVALID_STAGE');
  const s = entry.owned;
  check(s.db === db);
  check(s.status !== 'INVALID' && s.status !== 'CONSUMED', 'STAGE_RELEASED');
  check(s.status === 'FROZEN' && s.frozen);
  s.status = 'APPLYING';
  try {
    check(db.isOpen && !db.isTransaction);
    const requested = checkedHistoryLimits(input),
      old = s.budget;
    const limits = Object.fromEntries(
      Object.entries(old.limits).map(([key, value]) => [
        key,
        Math.min(value, requested[key as keyof HistoryReadLimits]),
      ]),
    );
    const budget = new HistoryReadBudget(checkedHistoryLimits(limits));
    budget.add('rows', old.rows);
    budget.add('serializedBytes', old.serializedBytes);
    budget.add('items', old.items);
    budget.pin(old.retainedLogicalBytes);
    s.budget = budget;
    const result = s.frozen.result;
    const freeze = (v: unknown): void => {
      if (v && typeof v === 'object') {
        for (const x of Object.values(v)) freeze(x);
        Object.freeze(v);
      }
    };
    budget.own(result, false);
    freeze(result);
    let settled = false;
    return Object.freeze({
      result,
      budget,
      capture: s.capture.data,
      expectedIdentity: s.capture.identity,
      recheck() {
        check(!settled && s.status === 'APPLYING' && db.isTransaction);
        checkStageContext(s, true);
        const raw = encodeHistoryValue([...s.tempRows], budget);
        budget.add('serializedBytes', Buffer.byteLength(raw));
        budget.pin(64);
        check(createHash('sha256').update(raw).digest('hex') === s.frozen!.seal, 'STAGE_CHANGED');
      },
      settle(committed: boolean) {
        check(!settled && s.status === 'APPLYING');
        settled = true;
        leases.delete(lease);
        releasedLeases.add(lease);
        s.status = committed ? 'CONSUMED' : 'INVALID';
        releaseActivationContext(db, s.captureHandle);
      },
      close() {
        MixedAnalysisStage.prototype.close.call(entry.stage);
      },
    });
  } catch (error) {
    s.status = 'INVALID';
    leases.delete(lease);
    releasedLeases.add(lease);
    return stageFailure(error);
  }
}

export function borrowMixedSourceAccount(stage: MixedAnalysisStage, control: SourceAccountControl) {
  const s = stages.get(stage);
  check(s, 'STAGE_RELEASED');
  return borrowMixedSourceBudget(s.budget, control);
}

interface MixedJavaPreparation {
  mode: 'FULL' | 'DELTA';
  targetSource: { repositoryId: string; revisionId: string; contentFingerprint: string };
  repositoryLocatorDigest: string;
  javaSourceFiles: readonly SourceFile[];
}
interface MixedCodeSyntaxPreparation {
  mode: 'FULL' | 'DELTA';
  targetSource: MixedJavaPreparation['targetSource'];
  repositoryLocatorDigest: string;
  expectedActivationBasis: RepoBasis | null;
  inventory: readonly SourceFile[];
  units: readonly Unit[];
  sourceFiles: readonly SourceFile[];
  removedSourceFiles: readonly { id: string; path: string; previousContentFingerprint: string }[];
  owners: readonly {
    sourceFileId: string;
    providerNodeRef: { factType: 'NODE'; providerId: string; providerFactId: string };
    canonicalRef: {
      scope: 'REPOSITORY';
      repositoryId: string;
      entity: { kind: 'CODE_NODE'; id: string; revisionId: string };
    };
  }[];
  stageDigest: string;
}

/** Private data projections; neither snapshot grants a Stage lease or Runtime admission. */
function readPreparation<T>(
  stage: MixedAnalysisStage,
  status: OwnedStage['status'],
  read: (s: OwnedStage) => T,
): Readonly<T> {
  const s = stages.get(stage);
  check(s, closed.has(stage) ? 'STAGE_RELEASED' : 'INVALID_STAGE');
  try {
    check(!s.busy && s.status === status, 'INVALID_STAGE');
    checkStageContext(s);
    const value = read(s),
      b = s.budget;
    b.own(value);
    const result = b.parse(encodeHistoryValue(value, b)) as T;
    const freeze = (v: unknown): void => {
      if (v !== null && typeof v === 'object') {
        for (const child of Object.values(v)) freeze(child);
        Object.freeze(v);
      }
    };
    freeze(result);
    return result;
  } catch (error) {
    s.status = 'INVALID';
    return stageFailure(error);
  }
}

export function readMixedJavaPreparation(stage: MixedAnalysisStage, contractsValue: unknown) {
  return readPreparation<MixedJavaPreparation>(stage, 'PREPARING', (s) => {
    const b = s.budget;
    b.own(contractsValue);
    const contracts = readPreparationContracts(b.parse(encodeHistoryValue(contractsValue, b)));
    const scope = prepareScope(s, contracts),
      ids = new Set(
        scope.units.filter((u) => u.kind === 'JAVA_GROUP').flatMap((u) => u.sourceFileIds),
      );
    b.own([...ids]);
    return {
      mode: s.mode,
      targetSource: s.capture.data.view.targetSource,
      repositoryLocatorDigest: s.capture.data.repositoryLocatorDigest,
      javaSourceFiles: s.capture.data.view.targetInventory.filter((f) => ids.has(f.id)),
    };
  });
}

export function readMixedCodeSyntaxPreparation(stage: MixedAnalysisStage, ownerHandle: object) {
  return readPreparation<MixedCodeSyntaxPreparation>(stage, 'OWNER_FROZEN', (s) => {
    check(s.owner && ownerHandle === s.owner.ownerHandle, 'INVALID_CANDIDATE');
    const owner = s.owner,
      view = s.capture.data.view,
      ids = new Set(owner.units.flatMap((u) => u.sourceFileIds));
    s.budget.own([...ids]);
    const owners = (owner.java?.nodes ?? []).flatMap((value) => {
      const n = record(value),
        p = record(n.providerNode),
        c = record(n.canonicalNode);
      const surfaceModule =
        owner.contracts.some(
          (contract) =>
            contract.providerId === 'native' && contract.contract === 'SYNTAX_BINDING_V4',
        ) &&
        p.sourceRange === null &&
        p.providerKind === 'java.compilation_unit' &&
        c.kind === 'MODULE' &&
        view.targetInventory.some(
          (file) =>
            file.id === n.sourceFileId &&
            String(file.path) === p.qualifiedName &&
            String(file.path) === c.qualifiedName,
        );
      return (p.sourceRange !== null || surfaceModule) &&
        typeof n.sourceFileId === 'string' &&
        ids.has(n.sourceFileId)
        ? [
            {
              sourceFileId: n.sourceFileId,
              providerNodeRef: {
                factType: 'NODE' as const,
                providerId: p.providerId as string,
                providerFactId: p.providerFactId as string,
              },
              canonicalRef: {
                scope: 'REPOSITORY' as const,
                repositoryId: p.repositoryId as string,
                entity: {
                  kind: 'CODE_NODE' as const,
                  id: c.id as string,
                  revisionId: p.revisionId as string,
                },
              },
            },
          ]
        : [];
    });
    return {
      mode: s.mode,
      targetSource: view.targetSource,
      repositoryLocatorDigest: s.capture.data.repositoryLocatorDigest,
      expectedActivationBasis: s.mode === 'FULL' ? null : view.history!.state.basis,
      inventory: view.targetInventory,
      units: owner.units,
      sourceFiles: view.targetInventory.filter((f) => ids.has(f.id)),
      removedSourceFiles: (view.history?.state.inventory ?? [])
        .filter(
          (f) =>
            owner.removedSourceFileIds.includes(f.id) &&
            (f.classification.role === 'SOURCE' || f.classification.role === 'TEST') &&
            (f.languageHint === 'java' || f.languageHint === 'python'),
        )
        .map((f) => ({ id: f.id, path: f.path, previousContentFingerprint: f.contentFingerprint })),
      owners,
      stageDigest: owner.stageDigest,
    };
  });
}

/** Authenticated PREPARING read only; no owner, publication lease or inferred fallback. */
export function readMixedNoOpBasis(stage: MixedAnalysisStage, contractsValue: unknown) {
  return readPreparation<{ basis: Readonly<RepoBasis>; activationId: string } | null>(
    stage,
    'PREPARING',
    (s) => {
      check(s.mode === 'DELTA');
      const view = s.capture.data.view,
        h = view.history;
      check(h, 'FULL_ANALYSIS_REQUIRED');
      const b = s.budget;
      b.own(contractsValue);
      const contracts = readPreparationContracts(b.parse(encodeHistoryValue(contractsValue, b)));
      const old = h.state,
        t = view.targetSource;
      if (
        old.basis.repositoryId !== t.repositoryId ||
        old.basis.revisionId !== t.revisionId ||
        old.basis.contentFingerprint !== t.contentFingerprint ||
        old.repositoryLocatorDigest !== s.capture.data.repositoryLocatorDigest ||
        !isDeepStrictEqual(old.inventory, view.targetInventory) ||
        !isDeepStrictEqual(old.contracts, contracts)
      )
        return null;
      return {
        basis: old.basis,
        activationId: 'activation:' + historyDigest('codeatlas-activation-history-v1', h, b),
      };
    },
  );
}

export interface FrozenFrameworkInputsV2 {
  basis: RepoBasis;
  nodes: CanonicalNode[];
  edges: CanonicalEdge[];
  sourceFiles: SourceFile[];
  syntaxEvidence: SyntaxEvidenceV4[];
  supportInventory: SupportRef[];
  providerCapabilities: string[];
  syntaxMembershipDigest: string;
  syntaxActivationId: string;
}
/** Private precommit view; consumes the live Stage ledger and never grants another lease. */
export function readFrozenFrameworkInputsV2(
  stage: MixedAnalysisStage,
  lease: object,
  input: HistoryReadLimits,
): FrozenFrameworkInputsV2 {
  const s = stages.get(stage),
    entry = leases.get(lease);
  check(s && entry && entry.stage === stage && entry.owned === s, 'INVALID_STAGE');
  check(!s.busy && s.status === 'FROZEN' && s.frozen && s.frozen.lease === lease, 'STAGE_RELEASED');
  const original = s.budget;
  let child: HistoryReadBudget | undefined,
    seeded = false;
  const before = {
    rows: original.rows,
    serializedBytes: original.serializedBytes,
    items: original.items,
    retainedLogicalBytes: original.retainedLogicalBytes,
  };
  try {
    const requested = checkedHistoryLimits(input),
      limits = checkedHistoryLimits(
        Object.fromEntries(
          Object.entries(original.limits).map(([key, v]) => [
            key,
            Math.min(v, requested[key as keyof HistoryReadLimits]),
          ]),
        ),
      );
    child = new HistoryReadBudget(limits);
    child.add('rows', before.rows);
    child.add('serializedBytes', before.serializedBytes);
    child.add('items', before.items);
    child.pin(before.retainedLogicalBytes);
    seeded = true;
    const b = child;
    checkStageContext(s, false, b);
    const result = record(s.frozen.result);
    check(encodeHistoryValue(result, b) === s.tempRows.get('FROZEN'), 'STAGE_CHANGED');
    check(
      s.owner?.contracts.some(
        (c) => c.providerId === 'native' && c.contract === 'SYNTAX_BINDING_V4',
      ),
      'INCOMPATIBLE_CONTRACT',
    );
    const manifest = record(result.manifest),
      state = record(manifest.state),
      basis = RepoBasisSchema.parse(state.basis);
    const nodes = array(state.nodes).map((v) => CanonicalNodeSchema.parse(v)),
      edges = array(state.edges).map((v) => CanonicalEdgeSchema.parse(v)),
      sourceFiles = array(state.inventory).map((v) => SourceFileSchema.parse(v));
    const supportInventory = [];
    for (const [kind, values] of [
      ['CODE_NODE', nodes],
      ['CODE_EDGE', edges],
      ['SOURCE_FILE', sourceFiles],
    ] as const)
      for (const value of values)
        supportInventory.push(
          SupportRefSchema.parse({
            basis,
            entity: { kind, id: value.id, revisionId: basis.revisionId },
            valueDigest: historyDigest('codeatlas-phase1-support-value-v1', value, b),
          }),
        );
    const references = {
      availableEntities: supportInventory.map((s) => ({
        scope: 'REPOSITORY',
        repositoryId: basis.repositoryId,
        entity: s.entity,
      })),
      availableSupports: supportInventory,
    };
    const context = { references, codeNodes: nodes, codeEdges: edges, sourceFiles };
    b.own(context);
    const projections = array(result.projections).map(record);
    const syntaxEvidence = projections.map((p) => {
      const envelope = record(b.parse(text(p.envelope_json)));
      check(envelope.version === 4, 'INCOMPATIBLE_CONTRACT');
      return parseSyntaxEvidenceV4(envelope, context).payload;
    });
    b.own(syntaxEvidence);
    validateSyntaxSurfaceClosure(syntaxEvidence, context);
    const membership = {
      members: manifest.syntaxMembers,
      projections: projections
        .map((p) => ({ id: p.id, digest: p.projection_digest }))
        .sort((a, c) => String(a.id).localeCompare(String(c.id))),
    };
    const syntaxMembershipDigest = historyDigest('runtime-syntax-membership-v1', membership, b);
    const providerCapabilities = [
      ...new Set(
        array(state.snapshots).flatMap((s) =>
          array(record(s).capabilities)
            .filter((c) => record(c).support === 'SUPPORTED')
            .map((c) => text(record(c).name)),
        ),
      ),
    ].sort();
    const value = {
      basis,
      nodes,
      edges,
      sourceFiles,
      syntaxEvidence,
      supportInventory,
      providerCapabilities,
      syntaxMembershipDigest,
      syntaxActivationId: text(result.activationId),
    };
    b.own(value);
    const view = b.parse(encodeHistoryValue(value, b)) as typeof value;
    const freeze = (v: unknown): void => {
      if (v !== null && typeof v === 'object') {
        for (const x of Object.values(v)) freeze(x);
        Object.freeze(v);
      }
    };
    freeze(view);
    checkStageContext(s, false, b);
    return view;
  } catch (error) {
    s.status = 'INVALID';
    leases.delete(lease);
    releasedLeases.add(lease);
    return stageFailure(error);
  } finally {
    if (child && seeded) {
      original.add('rows', child.rows - before.rows);
      original.add('serializedBytes', child.serializedBytes - before.serializedBytes);
      original.add('items', child.items - before.items);
      original.pin(child.retainedLogicalBytes - before.retainedLogicalBytes);
    }
  }
}
