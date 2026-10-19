import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, realpath } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { types, isDeepStrictEqual } from 'node:util';
import {
  SourceFileSchema,
  ProviderSnapshotDiagnosticSchema,
  validateEvidenceTransition,
} from '../packages/ir/dist/index.js';
import { parseIndexConfiguration } from '../packages/application/dist/index.js';
import {
  bindPhase05SourceIdentity,
  evaluatePhase05LayeredReport,
  PHASE05_CASE_POLICY,
  parseFixtureManifest,
} from '../packages/evaluation/dist/index.js';
import { resolveNativeWorkerConfig } from '../packages/runtime/dist/index.js';
import { nativeMetadataEnvironment } from '../packages/runtime/dist/native-metadata-admission.js';
import {
  executeNativeRequest,
  JAVA_NORMALIZER_VERSION,
  NativeCapabilityCoverageV2Schema,
} from '../packages/providers/dist/index.js';
import {
  capturePhase05PinnedInputs,
  copyPhase05ClosedSeed,
  persistPhase05Report,
  preparePhase05PerformanceRepository,
  preparePhase05PinnedRepository,
  preparePhase05JavaOracle,
  runPhase05PinnedContract,
  runPhase05PinnedSqliteContract,
  preparePhase05SourceSeed,
  readPhase05PublishedState,
  readPhase05RetainedPublication,
  inspectPhase05FailedTrialBeforeRestore,
  runPhase05IndexTrial,
  preparePhase05DeclaredMetadataTarget,
  runPhase05DeclaredMetadataTrial,
  preparePhase05RestorePoint,
} from './helpers/phase05-evaluation-fixture.mjs';
import {
  comparePhase05PublishedStates,
  comparePhase05RetainedPublications,
} from './helpers/phase05-published-comparison.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const expectedFixture = path.join(repository, 'fixtures/evaluation/phase05-code-intelligence');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const performanceScenarios = ['COLD', 'INCREMENTAL_1', 'INCREMENTAL_5', 'INCREMENTAL_50'];
const stageNames = [
  'scan',
  'parse',
  'resolve',
  'ipc',
  'normalize',
  'merge',
  'dbApply',
  'dbLock',
  'total',
];
class EvaluationControlError extends Error {
  constructor() {
    super('Invalid Phase05 Evaluation controls or destination.');
  }
}
const controlError = () => {
  throw new EvaluationControlError();
};

function controls(value) {
  const visit = (item, active = new Set()) => {
    if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) return;
    if (typeof item !== 'object' || types.isProxy(item) || active.has(item)) controlError();
    active.add(item);
    const array = Array.isArray(item);
    if (Object.getPrototypeOf(item) !== (array ? Array.prototype : Object.prototype))
      controlError();
    const keys = Reflect.ownKeys(item);
    if (array && keys.length !== item.length + 1) controlError();
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
        controlError();
      visit(descriptor.value, active);
    }
    active.delete(item);
  };
  visit(value);
  const fields = [
    'fixtureDirectory',
    'outputDirectory',
    'nativeExecutablePath',
    'configuration',
    'repetitions',
  ];
  if (
    !value ||
    Object.keys(value).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))
  )
    controlError();
  for (const field of ['fixtureDirectory', 'outputDirectory', 'nativeExecutablePath'])
    if (
      typeof value[field] !== 'string' ||
      !path.isAbsolute(value[field]) ||
      value[field].includes('\0')
    )
      controlError();
  if (!Number.isSafeInteger(value.repetitions) || value.repetitions <= 0) controlError();
  return { ...structuredClone(value), configuration: parseIndexConfiguration(value.configuration) };
}

// Original checked-handle bytes; checks are point-in-time, not filesystem leases.
// Stream executable/code hashing so binary size cannot become a retained Buffer.
async function captureFile(filename, maxBytes, retain = true) {
  const original = await lstat(filename, { bigint: true });
  const same = (info) =>
    info.isFile() &&
    !info.isSymbolicLink() &&
    info.nlink === 1n &&
    ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every((key) => info[key] === original[key]);
  if (
    !same(original) ||
    original.size > BigInt(maxBytes) ||
    (await realpath(filename)) !== filename
  )
    controlError();
  const read = async () => {
    if (!same(await lstat(filename, { bigint: true })) || (await realpath(filename)) !== filename)
      controlError();
    const fd = await open(filename, 'r');
    try {
      if (!same(await fd.stat({ bigint: true }))) controlError();
      const digest = createHash('sha256'),
        parts = [];
      const buffer = Buffer.alloc(64 * 1024);
      let position = 0;
      while (position < Number(original.size)) {
        const { bytesRead } = await fd.read(
          buffer,
          0,
          Math.min(buffer.length, Number(original.size) - position),
          position,
        );
        if (!bytesRead) controlError();
        digest.update(buffer.subarray(0, bytesRead));
        if (retain) parts.push(Buffer.from(buffer.subarray(0, bytesRead)));
        position += bytesRead;
      }
      if (
        (await fd.read(buffer, 0, 1, position)).bytesRead ||
        !same(await fd.stat({ bigint: true })) ||
        !same(await lstat(filename, { bigint: true }))
      )
        controlError();
      return { sha256: digest.digest('hex'), bytes: retain ? Buffer.concat(parts) : null };
    } finally {
      await fd.close();
    }
  };
  const initial = await read();
  return {
    ...initial,
    async assertUnchanged() {
      if ((await read()).sha256 !== initial.sha256) controlError();
    },
  };
}

const failure = (code) => ({
  code,
  message: 'Trial did not complete; inspect controlled evidence.',
});

function unobserved(runKey, sourceDigest, code) {
  const recorded = runKey.executionKind === 'RECORDED_PROVIDER_SQLITE';
  const fields = recorded
    ? runKey.fixtureId === 'canonical-normalization'
      ? [
          'pairGolden',
          'persistedGolden',
          'supportCandidates',
          'sourceActivation',
          'coverage',
          'reopenedImages',
          'receipts',
        ]
      : [
          'fullGolden',
          'oneGolden',
          'zeroGolden',
          'reverseOrder',
          'supportCandidates',
          'evidenceHistory',
          'sourceActivation',
          'coverage',
          'reopenedImages',
          'rejectedPatchRecovery',
          'receipts',
        ]
    : runKey.executionKind === 'DECLARED_SOURCE_NATIVE'
      ? [
          'sourceMetadataTransition',
          'originalRelations',
          'fullRefreshAgreement',
          'nativeStateCoactivation',
          'activeSupportHistory',
          'restart',
          'rawOperations',
          'receipts',
        ]
      : null;
  return {
    runKey,
    status: 'NOT_RUN',
    effectiveWorkers: null,
    nativeOutcome: null,
    workerUnavailableReason: recorded
      ? 'NOT_APPLICABLE_RECORDED_PROVIDER'
      : 'NO_QUALIFIED_NATIVE_RESULT',
    componentChecks: fields ? Object.fromEntries(fields.map((name) => [name, null])) : null,
    sourceDigest,
    artifactDigests: {},
    facts: null,
    graphEqual: null,
    coverageEqual: null,
    supportEqual: null,
    staleBindings: null,
    closure: { transactionClosed: null, tempClosed: null, childClosed: null },
    timings: Object.fromEntries(
      stageNames.map((name) => [
        name,
        { value: null, unavailableReason: 'Measured indexing not invoked.' },
      ]),
    ),
    peak: {
      value: null,
      units: 'bytes',
      method: 'resourceUsage.maxRSS',
      scope: 'NODE_PROCESS_LIFETIME_EXCLUDES_NATIVE_CHILD',
      unavailableReason: 'Measured indexing not invoked.',
    },
    failure: failure(code),
  };
}

// Slot names/counts come from the independently authored performance Fixture.
// They constrain reference semantics without enlarging critical accuracy scopes.
function performanceScope(image, golden, scenario) {
  const nodes = image.supports.facts.nodes,
    edges = image.supports.facts.edges;
  const classes = nodes.filter((node) => node.kind === 'TYPE' && node.typeKind === 'CLASS');
  const methods = nodes.filter((node) => node.kind === 'SYMBOL' && node.symbolKind === 'METHOD');
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const calls = edges.filter((edge) => edge.kind === 'CALL');
  if (
    classes.length !== golden.classes ||
    methods.length !== golden.methods ||
    calls.length !== golden.resolvedRunCalls
  )
    throw new Error('Independent performance reference does not match declared Java semantics.');
  for (let unit = 0; unit < golden.fileCount; unit++) {
    const prefix = `evaluation.performance.Unit${String(unit).padStart(2, '0')}`;
    if (
      classes.filter((node) => node.qualifiedName === prefix).length !== 1 ||
      ['first', 'second', 'run'].some(
        (name) => methods.filter((node) => node.qualifiedName === `${prefix}.${name}`).length !== 1,
      )
    )
      throw new Error('Independent performance reference does not match declared Java semantics.');
    const target =
      unit < golden.scenarios[scenario].secondTargets ? 'second' : golden.baselineRunTarget;
    const selected = calls.filter(
      (edge) => byId.get(edge.source.id)?.qualifiedName === `${prefix}.run`,
    );
    if (
      selected.length !== 1 ||
      selected[0].target.state !== 'RESOLVED' ||
      byId.get(selected[0].target.target.id)?.qualifiedName !== `${prefix}.${target}`
    )
      throw new Error('Independent performance reference does not match declared Java semantics.');
  }
  // Benchmark slots are not additions to the frozen critical accuracy scopes.
}

// Pure semantic projection, not an independent complete graph, live closure,
// parsed-file census or proof of shared UPSERT/REMOVE operation counts.
export function verifyPhase05TransitionProjection(recipe, view) {
  if (recipe.outcome !== 'SUCCEEDED' || recipe.classificationChange) return false;
  const sorted = (values) => [...values].sort();
  if (
    JSON.stringify(sorted(view.sourcePaths)) !== JSON.stringify(sorted(Object.keys(recipe.target)))
  )
    return false;
  const kinds = new Set(['java.call', 'java.import.normal', 'java.inheritance']);
  for (const expected of recipe.relations) {
    if (!kinds.has(expected.kind)) return false;
    const matches = view.relations.filter(
      (edge) => edge.file === expected.file && edge.kind === expected.kind,
    );
    if (matches.length !== expected.count) return false;
    for (const edge of matches) {
      if (
        edge.resolution !== expected.resolution ||
        JSON.stringify(sorted(edge.targets)) !== JSON.stringify(sorted(expected.targets)) ||
        (expected.hint && edge.hint !== expected.hint) ||
        (expected.resolution === 'AMBIGUOUS' &&
          new Set(edge.candidateIds).size !== expected.targets.length)
      )
        return false;
    }
  }
  return (
    !recipe.shared ||
    view.sharedPackages.filter((name) => name === recipe.shared.name).length === recipe.shared.count
  );
}

export function verifyPhase05TransitionSources(pins, recipe, state, role) {
  if (!['baseline', 'target'].includes(role)) return false;
  const declared = recipe[role];
  if (
    state.files.length !== Object.keys(declared).length ||
    new Set(state.files.map((file) => file.id)).size !== state.files.length ||
    new Set(state.files.map((file) => file.path)).size !== state.files.length
  )
    return false;
  return Object.entries(declared).every(([filename, asset]) => {
    const file = state.files.find((file) => file.path === filename);
    return (
      file &&
      file.repositoryId === state.revision.repositoryId &&
      file.revisionId === state.revision.id &&
      file.contentFingerprint ===
        `sha256:${hash(pins.readFile('p05-native-refresh-producer-v1', `source/${asset}`))}` &&
      file.classification.role ===
        (role === 'target' && recipe.classificationChange
          ? recipe.classificationChange
          : 'SOURCE') &&
      file.classification.provenance === 'AUTHORED' &&
      file.classification.contentKind === 'TEXT' &&
      file.languageHint === 'java'
    );
  });
}

// Pure comparisons only. Authentic execution still requires the owned trial
// receipt, guarded Runtime branch, independent Source pins and retained image.
export function verifyPhase05PartialSites(recipe, proof, source) {
  const codes = {
    'syntax-partial-retained-restart': 'SYNTAX_ERROR',
    'unsupported-recognized-region-retained-restart': 'UNSUPPORTED_RELATION_SOURCE',
  };
  try {
    if (
      !Object.hasOwn(codes, recipe.id) ||
      recipe.outcome !== 'PARTIAL' ||
      proof?.validatedPartialBranch !== true ||
      proof.terminalCaptureFailed !== false ||
      source.files.length !== 1 ||
      !Array.isArray(proof.siteEvents)
    )
      return false;
    const file = SourceFileSchema.parse(source.files[0]);
    if (
      recipe.changed.length !== 1 ||
      recipe.changed[0] !== file.path ||
      !Object.hasOwn(recipe.target, file.path)
    )
      return false;
    const sources = [],
      coverage = [],
      diagnostics = [];
    for (const event of proof.siteEvents) {
      if (event.protocolVersion !== 3 || event.requestId !== proof.terminal.requestId) return false;
      if (event.type === 'SOURCE_FILE') sources.push(SourceFileSchema.parse(event.payload));
      else if (event.type === 'COVERAGE')
        coverage.push(NativeCapabilityCoverageV2Schema.parse(event.payload));
      else if (event.type === 'DIAGNOSTIC')
        diagnostics.push(ProviderSnapshotDiagnosticSchema.parse(event.payload));
      else return false;
    }
    const capabilities = ['CALL', 'IMPORT', 'INHERITANCE', 'REFERENCE', 'SYMBOL'];
    if (
      sources.length !== 1 ||
      !isDeepStrictEqual(sources[0], file) ||
      diagnostics.length !== 1 ||
      diagnostics[0].code !== codes[recipe.id] ||
      diagnostics[0].severity !== 'WARNING' ||
      diagnostics[0].sourceRange?.sourceFileId !== file.id ||
      !isDeepStrictEqual(coverage.map((c) => c.capability).sort(), capabilities) ||
      coverage.some(
        (c) => c.sourceFileId !== file.id || c.coverage !== 'PARTIAL' || c.support !== 'SUPPORTED',
      )
    )
      return false;
    const counts = proof.terminal.payload.counts;
    if (
      counts.sourceFiles !== sources.length ||
      counts.coverage !== coverage.length ||
      counts.diagnostics !== diagnostics.length
    )
      return false;
    if (recipe.unsupported) {
      const expected = recipe.unsupported;
      const actual = coverage.find((c) => c.capability === expected.capability);
      if (
        file.path !== expected.file ||
        !actual ||
        ['eligibleSites', 'unsupportedSites', 'coveredSites'].some(
          (key) => actual.statistics[key] !== expected[key],
        )
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function phase05ObservedClosure(evidence) {
  const sql = evidence?.sqlLifetime;
  const checked =
    evidence?.scope === 'OBSERVED_CHILD_AND_CONSUMED_WIRE_ONLY' &&
    sql?.scope === 'REPOSITORY_INDEX_SESSION_LIFETIME_ONLY' &&
    sql.openedConnections === 1 &&
    sql.closedConnections === 1 &&
    sql.connectionClosed === true &&
    sql.captureFailed === false;
  return {
    transactionClosed: checked ? sql.transactionClosed : null,
    tempClosed: checked ? sql.tempClosed : null,
    childClosed:
      evidence?.scope === 'OBSERVED_CHILD_AND_CONSUMED_WIRE_ONLY' ? evidence.childClosed : null,
  };
}

// Wire deliveries/operations only, NOT parser invocation or completion-order
// telemetry. Callers separately qualify receipts, Source, graph and D5 proofs.
export function verifyPhase05ParseObservation({ record, source, baseline, recipe, capabilities }) {
  try {
    const evidence = record.nativeObservation,
      proof = evidence?.parseObservation;
    const nativeChildren = evidence?.children?.filter((child) => child.executableMatches) ?? [];
    const full = record.operation === 'FULL';
    const terminal = evidence?.nativeStream?.terminal;
    const partial = !full && evidence?.partialRefresh?.validatedPartialBranch === true;
    if (
      (!full && record.operation !== 'INCREMENTAL') ||
      (!partial && (record.outcome !== 'SUCCEEDED' || !record.result)) ||
      evidence?.scope !== 'OBSERVED_CHILD_AND_CONSUMED_WIRE_ONLY' ||
      evidence.childClosed !== true ||
      !nativeChildren.length ||
      nativeChildren.some((c) => c.exitCode !== 0 || c.signal !== null) ||
      evidence.nativeStream.captureFailed !== false ||
      evidence.nativeStream.terminalCount !== 1 ||
      terminal?.protocolVersion !== 3 ||
      terminal.type !== (full ? 'ANALYSIS_COMPLETED' : 'REFRESH_COMPLETED') ||
      terminal.payload.outcome !== (partial ? 'PARTIAL' : 'SUCCEEDED') ||
      terminal.payload.repositoryId !== source.revision.repositoryId ||
      terminal.payload.revisionId !== source.revision.id ||
      terminal.payload.revisionFingerprint !== source.revision.contentFingerprint ||
      proof?.scope !== 'CONSUMED_NATIVE_PARSE_DIAGNOSTICS_ONLY' ||
      proof.complete !== true ||
      proof.captureFailed !== false ||
      proof.operation !== (full ? 'ANALYZE' : 'REFRESH') ||
      proof.requestRefSha256 !==
        hash(`codeatlas-parse-request-v1\0${terminal.protocolVersion}\0${terminal.requestId}`) ||
      (!partial && proof.workerLimit !== record.result.workers.effectiveCount) ||
      !Array.isArray(capabilities) ||
      !capabilities.includes('SYMBOL') ||
      new Set(capabilities).size !== capabilities.length ||
      capabilities.some(
        (c) => !['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'].includes(c),
      )
    )
      return false;
    const files = source.files.map((file) => SourceFileSchema.parse(file));
    if (new Set(files.map((f) => f.id)).size !== files.length || (!full && !baseline)) return false;
    const prior = new Map((baseline?.supports.sourceFiles ?? []).map((f) => [f.id, f]));
    const selected = files.filter((f) => full || !isDeepStrictEqual(f, prior.get(f.id)));
    if (
      !full &&
      recipe &&
      !isDeepStrictEqual(selected.map((f) => f.path).sort(), [...recipe.changed].sort())
    )
      return false;
    const multiplicity = full && capabilities.some((c) => c !== 'SYMBOL') ? 2 : 1;
    const expected = new Map(
      selected.map((f) => [hash(`codeatlas-parse-source-v1\0${f.id}`), multiplicity]),
    );
    const count = selected.length * multiplicity;
    if (
      proof.started !== count ||
      proof.finished !== count ||
      proof.invocations.length !== count ||
      proof.completionOrder.length !== count
    )
      return false;
    const ordinals = new Set();
    for (const invocation of proof.invocations) {
      const remaining = expected.get(invocation.sourceRefSha256);
      if (
        !remaining ||
        !Number.isSafeInteger(invocation.slot) ||
        invocation.slot < 0 ||
        invocation.slot >= proof.workerLimit ||
        !Number.isSafeInteger(invocation.startOrdinal) ||
        !Number.isSafeInteger(invocation.finishOrdinal) ||
        invocation.startOrdinal < 1 ||
        invocation.finishOrdinal <= invocation.startOrdinal ||
        invocation.finishOrdinal > count * 2 ||
        ordinals.has(invocation.startOrdinal) ||
        ordinals.has(invocation.finishOrdinal) ||
        invocation.outcome !== (partial ? 'PARTIAL' : 'SUCCEEDED')
      )
        return false;
      ordinals.add(invocation.startOrdinal);
      ordinals.add(invocation.finishOrdinal);
      expected.set(invocation.sourceRefSha256, remaining - 1);
    }
    return (
      [...expected.values()].every((n) => n === 0) &&
      isDeepStrictEqual(
        proof.completionOrder,
        [...proof.invocations]
          .sort((a, b) => a.finishOrdinal - b.finishOrdinal)
          .map((i) => i.sourceRefSha256),
      )
    );
  } catch {
    return false;
  }
}

// Pure agreement only. Owned runner receipts and immutable input guards are
// still required; these scalar/hash checks do not authenticate caller objects.
export function verifyPhase05WorkerPair({ members, source, capabilities, comparison }) {
  try {
    if (
      !Array.isArray(members) ||
      members.length !== 2 ||
      source.files.length !== 50 ||
      !isDeepStrictEqual([...capabilities].sort(), [
        'CALL',
        'IMPORT',
        'INHERITANCE',
        'REFERENCE',
        'SYMBOL',
      ]) ||
      !['graphEqual', 'nativeStateEqual', 'supportEqual', 'coverageEqual'].every(
        (key) => comparison[key] === true,
      ) ||
      comparison.staleBindings !== 0
    )
      return false;
    const ordered = [1, 2].map((count) =>
      members.find((member) => member.runKey.requestedWorkers === count),
    );
    if (ordered.some((member) => !member)) return false;
    const [left, right] = ordered;
    const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
    if (
      !digest(left.sourceSeedSha256) ||
      !digest(left.sourceDigest) ||
      left.sourceSeedSha256 !== right.sourceSeedSha256 ||
      left.sourceDigest !== right.sourceDigest ||
      left.runKey.repetition !== right.runKey.repetition ||
      !Number.isSafeInteger(left.runKey.repetition) ||
      left.runKey.repetition < 1 ||
      left.receiptSha256 === right.receiptSha256
    )
      return false;
    const configurations = ordered.map((member) => parseIndexConfiguration(member.configuration));
    if (
      !isDeepStrictEqual(configurations[0], {
        ...configurations[1],
        indexing: configurations[0].indexing,
      })
    )
      return false;
    for (const [index, member] of ordered.entries()) {
      const count = index + 1,
        key = member.runKey;
      const policy = PHASE05_CASE_POLICY.find(
        (row) => row.completionOrderId === `REQUIRED_WORKER_ORDER_${count}`,
      );
      if (
        !policy ||
        Object.entries(policy).some(([field, value]) => key[field] !== value) ||
        key.expectedEffectiveWorkers !== count ||
        !digest(member.receiptSha256) ||
        configurations[index].indexing.nativeAnalyzer.parseWorkers !== count ||
        member.record.result?.workers.requested !== count ||
        member.record.result.workers.effectiveCount !== count ||
        !verifyPhase05ParseObservation({ record: member.record, source, capabilities })
      )
        return false;
      const proof = member.record.nativeObservation.parseObservation;
      const events = proof.invocations
        .flatMap((invocation) => [
          { ordinal: invocation.startOrdinal, start: true, slot: invocation.slot },
          { ordinal: invocation.finishOrdinal, start: false, slot: invocation.slot },
        ])
        .sort((a, b) => a.ordinal - b.ordinal);
      const active = new Set(),
        exercised = new Set();
      let maximum = 0;
      for (const event of events) {
        if (event.start) {
          if (active.has(event.slot)) return false;
          active.add(event.slot);
          exercised.add(event.slot);
          maximum = Math.max(maximum, active.size);
        } else if (!active.delete(event.slot)) return false;
      }
      if (active.size || exercised.size !== count || maximum !== count) return false;
    }
    return !isDeepStrictEqual(
      left.record.nativeObservation.parseObservation.completionOrder,
      right.record.nativeObservation.parseObservation.completionOrder,
    );
  } catch {
    return false;
  }
}

export function verifyPhase05ConsumedNativeRecords({ record, source, baseline, recipe }) {
  try {
    const evidence = record.nativeObservation;
    const nativeChildren = evidence?.children?.filter((child) => child.executableMatches) ?? [];
    const stream = evidence?.nativeStream;
    const terminal = stream?.terminal;
    const full = record.operation === 'FULL';
    if (
      record.outcome !== 'SUCCEEDED' ||
      !record.result ||
      (!full && record.operation !== 'INCREMENTAL') ||
      evidence?.scope !== 'OBSERVED_CHILD_AND_CONSUMED_WIRE_ONLY' ||
      evidence.childClosed !== true ||
      nativeChildren.length === 0 ||
      nativeChildren.some((child) => child.exitCode !== 0 || child.signal !== null) ||
      stream?.scope !== 'CONSUMED_NATIVE_RECORDS_ONLY' ||
      stream.captureFailed !== false ||
      stream.terminalCount !== 1 ||
      terminal?.protocolVersion !== 3 ||
      terminal.type !== (full ? 'ANALYSIS_COMPLETED' : 'REFRESH_COMPLETED')
    )
      return false;
    const p = terminal.payload;
    if (
      p.outcome !== 'SUCCEEDED' ||
      p.repositoryId !== source.revision.repositoryId ||
      p.revisionId !== source.revision.id ||
      p.revisionFingerprint !== source.revision.contentFingerprint
    )
      return false;
    const prior = new Map((baseline?.supports.sourceFiles ?? []).map((file) => [file.id, file]));
    if (!full && !baseline) return false;
    const expected = source.files.filter(
      (file) => full || !isDeepStrictEqual(prior.get(file.id), file),
    );
    const delivered = stream.siteEvents.filter((event) => event.type === 'SOURCE_FILE');
    if (
      delivered.length !== expected.length ||
      p.counts.sourceFiles !== delivered.length ||
      new Set(delivered.map((event) => event.payload.id)).size !== delivered.length ||
      delivered.some(
        (event) =>
          !isDeepStrictEqual(
            SourceFileSchema.parse(event.payload),
            expected.find((file) => file.id === event.payload.id),
          ),
      )
    )
      return false;
    if (
      recipe &&
      !full &&
      !isDeepStrictEqual(expected.map((file) => file.path).sort(), [...recipe.changed].sort())
    )
      return false;
    for (const [type, key] of [
      ['COVERAGE', 'coverage'],
      ['DIAGNOSTIC', 'diagnostics'],
    ])
      if (stream.siteEvents.filter((event) => event.type === type).length !== p.counts[key])
        return false;
    const counters = full
      ? { NODE: 'nodes', EDGE: 'edges' }
      : {
          UPSERT_NODE: 'upsertedNodes',
          UPSERT_EDGE: 'upsertedEdges',
          REMOVE_NODE: 'removedNodes',
          REMOVE_EDGE: 'removedEdges',
        };
    if (
      [...stream.siteEvents, ...stream.operations].some(
        (event) => event.protocolVersion !== 3 || event.requestId !== terminal.requestId,
      )
    )
      return false;
    const identities = new Set();
    for (const event of stream.operations) {
      if (
        !Object.hasOwn(counters, event.type) ||
        typeof event.payload.providerFactId !== 'string' ||
        event.payload.providerId !== 'native'
      )
        return false;
      const key = `${event.type.endsWith('NODE') ? 'NODE' : 'EDGE'}\0${event.payload.providerFactId}`;
      if (identities.has(key)) return false;
      identities.add(key);
    }
    for (const [type, key] of Object.entries(counters)) {
      const ids = stream.operations
        .filter((event) => event.type === type)
        .map((event) => event.payload.providerFactId);
      if (ids.length !== p.counts[key]) return false;
      if (
        !full &&
        ids.some(
          (id, index) =>
            index > 0 && Buffer.compare(Buffer.from(ids[index - 1]), Buffer.from(id)) >= 0,
        )
      )
        return false;
      if (recipe?.id === 'cross-file-operation-order' && ids.length < 2) return false;
    }
    if (recipe?.shared && !full) {
      const sharedIds = new Set(
        baseline.nativeBaseline.state.files.flatMap((file) =>
          JSON.parse(file.summaryJson)
            .emittedFacts.filter((fact) => fact.factType === 'NODE' && fact.ownership === 'SHARED')
            .map((fact) => fact.providerFactId),
        ),
      );
      const anchors = new Set(
        baseline.supports.candidates
          .filter(
            ({ candidate }) =>
              candidate.kind === 'PACKAGE' &&
              candidate.name === recipe.shared.name &&
              candidate.sourceRange === null,
          )
          .flatMap(({ evidenceId }) =>
            baseline.supports.bindings
              .filter(
                (binding) =>
                  binding.evidenceId === evidenceId &&
                  binding.providerFact.factType === 'NODE' &&
                  binding.providerFact.providerId === 'native' &&
                  sharedIds.has(binding.providerFact.providerFactId),
              )
              .map((binding) => binding.providerFact.providerFactId),
          ),
      );
      if (anchors.size !== 1) return false;
      const operations = stream.operations.filter(
        (event) => event.type.endsWith('NODE') && anchors.has(event.payload.providerFactId),
      );
      if (
        operations.length !== recipe.shared.operations ||
        (recipe.shared.count === 0 && operations.some((event) => event.type !== 'REMOVE_NODE'))
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Differential roles have no registered critical accuracy scope. Preserve ALL
// graph differences and ordinary comparison counts; do not let benchmark calls
// dilute the original Java accuracy numerator/denominator. Selected scopes refuse.
export function phase05DifferentialMetrics(metrics) {
  if (
    metrics.criticalFailures.length ||
    metrics.symbol.tp ||
    metrics.symbol.fp ||
    metrics.symbol.fn ||
    metrics.directCall.tp ||
    metrics.directCall.fn
  )
    throw new Error('Cannot discard a selected critical scope');
  return {
    ...structuredClone(metrics),
    symbol: { tp: 0, fp: 0, fn: 0, recall: null },
    directCall: { tp: 0, fp: 0, fn: 0, precision: null, recall: null },
  };
}

function transitionProjection(image) {
  const supports = image.supports;
  const files = new Map(supports.sourceFiles.map((file) => [file.id, file.path]));
  const nodes = new Map(supports.facts.nodes.map((node) => [node.id, node]));
  const sourceBindings = new Map(
    supports.bindings
      .filter(
        (binding) =>
          binding.providerFact.providerId === 'native' && binding.canonicalFact.factType === 'NODE',
      )
      .map((binding) => [binding.canonicalFact.id, binding.providerFact.providerFactId]),
  );
  const summaries = image.nativeBaseline.state.files.map((file) => JSON.parse(file.summaryJson));
  const relations = supports.facts.edges.map((edge) => {
    const references =
      edge.target.state === 'RESOLVED' ? [edge.target.target] : edge.target.candidates;
    let kind = { CALL: 'java.call', INHERITANCE: 'java.inheritance', REFERENCE: 'java.reference' }[
      edge.kind
    ];
    if (edge.kind === 'IMPORT') {
      const summary = summaries.find(
        (summary) => summary.sourceFile.id === edge.sourceRange.sourceFileId,
      );
      const range = edge.sourceRange;
      const sites = summary?.relationSites.filter(
        (site) =>
          site.kind === 'IMPORT' &&
          site.sourceFactId === sourceBindings.get(edge.source.id) &&
          ['startLine', 'startColumn', 'endLine', 'endColumn'].every(
            (field) => site.span[field] === range[field],
          ),
      );
      if (sites?.length !== 1) throw new Error('Transition import variant is unproved');
      kind = `java.import.${sites[0].variant}`;
    }
    return {
      file: files.get(edge.sourceRange.sourceFileId),
      kind,
      resolution: edge.target.resolution,
      targets: references.map((ref) => nodes.get(ref.id)?.qualifiedName),
      candidateIds: references.map((ref) => ref.id),
      hint: edge.target.state === 'UNRESOLVED' ? edge.target.originalHint : null,
    };
  });
  const active = new Set(
    supports.evidence
      .filter(
        (evidence) => evidence.status === 'ACTIVE' && evidence.providerFact.providerId === 'native',
      )
      .map((evidence) => evidence.id),
  );
  return {
    sourcePaths: [...files.values()],
    relations,
    sharedPackages: supports.candidates
      .filter(
        (row) =>
          active.has(row.evidenceId) &&
          row.candidate.kind === 'PACKAGE' &&
          row.candidate.sourceRange === null,
      )
      .map((row) => row.candidate.name),
  };
}

export async function runPhase05Evaluation(value) {
  let acquired = false;
  try {
    const input = controls(value);
    const output = path.resolve(input.outputDirectory);
    if (
      path.resolve(input.fixtureDirectory) !== expectedFixture ||
      (await realpath(input.fixtureDirectory)) !== expectedFixture ||
      (await realpath(path.dirname(output))) !== path.dirname(output)
    )
      controlError();
    const native = await captureFile(
      path.resolve(input.nativeExecutablePath),
      Number.MAX_SAFE_INTEGER,
      false,
    );
    const captures = [],
      ownFiles = new Map();
    const manifestCapture = await captureFile(
      path.join(expectedFixture, 'fixture.json'),
      input.configuration.transportLimits.maxStdinBytes,
    );
    captures.push(manifestCapture);
    const manifest = parseFixtureManifest(JSON.parse(manifestCapture.bytes));
    if (manifest.id !== 'p05-code-intelligence-evaluation-v1') controlError();
    for (const relative of [
      ...new Set([...Object.values(manifest.inputs), ...Object.values(manifest.expected)]),
    ].sort()) {
      const captured = await captureFile(
        path.join(expectedFixture, relative),
        input.configuration.transportLimits.maxStdinBytes,
      );
      captures.push(captured);
      ownFiles.set(relative, captured);
    }
    const pins = await capturePhase05PinnedInputs({ repositoryRoot: repository });
    // Additive diagnostics are part of this corpus, not a ninth original pin
    // or a new policy row. Reuse the same checked-handle immutability guards.
    const diagnosticRoot = path.join(repository, 'fixtures/evaluation/native-parse-observation');
    const diagnosticManifest = await captureFile(
      path.join(diagnosticRoot, 'fixture.json'),
      input.configuration.transportLimits.maxStdinBytes,
    );
    captures.push(diagnosticManifest);
    const diagnosticDefinition = parseFixtureManifest(JSON.parse(diagnosticManifest.bytes));
    if (diagnosticDefinition.id !== 'p05-native-parse-observation-v1') controlError();
    const diagnosticFixture = [{ path: 'fixture.json', sha256: diagnosticManifest.sha256 }];
    for (const relative of new Set([
      ...Object.values(diagnosticDefinition.inputs),
      ...Object.values(diagnosticDefinition.expected),
    ])) {
      const captured = await captureFile(
        path.join(diagnosticRoot, relative),
        input.configuration.transportLimits.maxStdinBytes,
        false,
      );
      captures.push(captured);
      diagnosticFixture.push({ path: relative, sha256: captured.sha256 });
    }
    diagnosticFixture.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const scenarios = JSON.parse(ownFiles.get('inputs/scenarios.json').bytes);
    const golden = JSON.parse(ownFiles.get('expected/performance.json').bytes);
    const transitions = JSON.parse(
      pins.readFile('p05-native-refresh-producer-v1', 'expected/transitions.json'),
    ).cases;
    const environment = nativeMetadataEnvironment();
    const codeRows = [];
    for (const name of [
      'ir',
      'storage',
      'source',
      'application',
      'providers',
      'runtime',
      'evaluation',
    ]) {
      const walk = async (directory) => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const filename = path.join(directory, entry.name);
          if (entry.isDirectory()) await walk(filename);
          else if (entry.isFile() && entry.name.endsWith('.js')) {
            const captured = await captureFile(filename, Number.MAX_SAFE_INTEGER, false);
            captures.push(captured);
            codeRows.push({
              path: path.relative(repository, filename).split(path.sep).join('/'),
              sha256: captured.sha256,
            });
          }
        }
      };
      await walk(path.join(repository, 'packages', name, 'dist'));
    }
    for (const relative of [
      'scripts/evaluate-phase05.mjs',
      'scripts/helpers/phase05-evaluation-fixture.mjs',
      'scripts/helpers/phase05-published-comparison.mjs',
      'packages/runtime/test/helpers/native-refresh-wire-probe.mjs',
    ]) {
      const captured = await captureFile(
        path.join(repository, relative),
        Number.MAX_SAFE_INTEGER,
        false,
      );
      captures.push(captured);
      codeRows.push({ path: relative, sha256: captured.sha256 });
    }
    codeRows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    let effectiveWorkers;
    try {
      effectiveWorkers = resolveNativeWorkerConfig(
        input.configuration,
        input.configuration.resourceBudget,
        availableParallelism(),
        16 * 1024 * 1024,
      ).effectiveCount;
    } catch {
      throw new Error('Evaluation worker configuration cannot exercise a baseline worker.');
    }
    const definitions = performanceScenarios.map((scenario) => ({
      fixtureId: manifest.id,
      scenario,
      requestedWorkers: input.configuration.indexing.nativeAnalyzer.parseWorkers,
      expectedEffectiveWorkers: effectiveWorkers,
      completionOrderId: null,
      sourceDigest: golden.scenarios[scenario].targetDigest,
    }));
    const declaredInputDigest = (pin) => {
      const sourceManifest = parseFixtureManifest(
        JSON.parse(pins.readFile(pin.fixtureId, 'fixture.json')),
      );
      const roots = Object.values(sourceManifest.inputs);
      const records = pins
        .filePaths(pin.fixtureId)
        .filter((filename) =>
          roots.some(
            (root) => filename === root || (root.endsWith('/') && filename.startsWith(root)),
          ),
        )
        .map((filename) => ({
          path: filename,
          sha256: hash(pins.readFile(pin.fixtureId, filename)),
        }));
      if (roots.length && !records.length) controlError();
      return hash(JSON.stringify(records));
    };
    for (const pin of scenarios.fixtures) {
      if (pin.fixtureId === 'p05-native-refresh-producer-v1')
        for (const transition of transitions) {
          const digest = hash(
            JSON.stringify(
              ['baseline', 'target'].map((role) =>
                Object.entries(transition[role])
                  .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
                  .map(([filename, asset]) => ({
                    path: filename,
                    sha256: hash(pins.readFile(pin.fixtureId, `source/${asset}`)),
                  })),
              ),
            ),
          );
          definitions.push({
            fixtureId: `${pin.fixtureId}/${transition.id}`,
            scenario: 'TRANSITION',
            requestedWorkers: input.configuration.indexing.nativeAnalyzer.parseWorkers,
            expectedEffectiveWorkers: effectiveWorkers,
            completionOrderId: null,
            sourceDigest: digest,
          });
        }
      else
        definitions.push({
          fixtureId: pin.fixtureId,
          scenario: pin.fixtureId === 'two-provider-same-call' ? 'PROVIDER_MERGE' : 'GOLDEN',
          requestedWorkers: input.configuration.indexing.nativeAnalyzer.parseWorkers,
          expectedEffectiveWorkers: effectiveWorkers,
          completionOrderId: null,
          sourceDigest: declaredInputDigest(pin),
        });
    }
    for (const count of [1, 2])
      definitions.push({
        fixtureId: manifest.id,
        scenario: 'WORKER_CONSISTENCY',
        requestedWorkers: count,
        expectedEffectiveWorkers: count,
        completionOrderId: `REQUIRED_WORKER_ORDER_${count}`,
        sourceDigest: golden.baselineDigest,
      });
    // Applicability comes exclusively from the reviewed closed policy. Source
    // digests still come from independently captured original inputs above.
    if (definitions.length !== PHASE05_CASE_POLICY.length) controlError();
    for (const definition of definitions) {
      const matches = PHASE05_CASE_POLICY.filter(
        (policy) =>
          policy.fixtureId === definition.fixtureId &&
          policy.scenario === definition.scenario &&
          policy.completionOrderId === definition.completionOrderId,
      );
      if (matches.length !== 1) controlError();
      const policy = matches[0];
      definition.executionKind = policy.executionKind;
      definition.expectedOutcome = policy.expectedOutcome;
      if (policy.executionKind === 'RECORDED_PROVIDER_SQLITE') {
        definition.requestedWorkers = null;
        definition.expectedEffectiveWorkers = null;
      }
    }
    if (
      input.repetitions >
      Math.floor(input.configuration.resourceBudget.maxEvents / definitions.length)
    )
      controlError();
    const items = definitions.flatMap(({ sourceDigest, ...definition }) =>
      Array.from({ length: input.repetitions }, (_, index) => ({
        key: { ...definition, repetition: index + 1 },
        sourceDigest,
      })),
    );
    const identity = {
      implementationDigest: hash(
        JSON.stringify({ native: environment.implementationDigest, codeRows }),
      ),
      nativeExecutableSha256: native.sha256,
      fixtureDigest: hash(
        JSON.stringify(
          [['fixture.json', manifestCapture], ...ownFiles].map(([relative, captured]) => ({
            path: relative,
            sha256: captured.sha256,
          })),
        ),
      ),
      configDigest: hash(JSON.stringify(input.configuration)),
      corpusDigest: hash(
        JSON.stringify({
          fixtures: scenarios.fixtures,
          policy: PHASE05_CASE_POLICY,
          requiredRuns: items.map((item) => item.key),
          diagnosticFixture,
        }),
      ),
      environment: {
        node: process.version,
        v8: process.versions.v8,
        platform: process.platform,
        arch: process.arch,
      },
    };
    const data = {
      schemaVersion: 2,
      identity,
      requiredRuns: items.map((item) => item.key),
      observations: [],
    };
    // Validate the immutable inventory before acquiring output, not after successes.
    evaluatePhase05LayeredReport(data);
    const assertInputs = async () => {
      await native.assertUnchanged();
      for (const captured of captures) await captured.assertUnchanged();
      await pins.assertUnchanged();
    };
    await assertInputs();
    await mkdir(output);
    acquired = true;
    const owned = await lstat(output, { bigint: true });
    const assertOwned = async () => {
      const current = await lstat(output, { bigint: true });
      if (
        !current.isDirectory() ||
        current.isSymbolicLink() ||
        current.dev !== owned.dev ||
        current.ino !== owned.ino ||
        (await realpath(output)) !== output
      )
        throw new Error('Evaluation output ownership changed.');
    };
    const persist = async (filename, bytes) => {
      await assertOwned();
      const fd = await open(path.join(output, filename), 'wx');
      try {
        await fd.writeFile(bytes);
        await fd.sync();
      } finally {
        await fd.close();
      }
    };
    await persist('required-runs.json', JSON.stringify(data.requiredRuns, null, 2) + '\n');
    const inventory = await captureFile(
      path.join(output, 'required-runs.json'),
      input.configuration.transportLimits.maxStdoutBytes,
    );
    const receipts = [],
      workerPairs = new Map();
    // Keep the immutable inventory/case indices, but settle worker peers next
    // to each other so repeated trials do not retain every prior pair's images.
    const executionItems = items.map((item, caseIndex) => ({ ...item, caseIndex }));
    executionItems.sort((a, b) =>
      a.key.scenario === 'WORKER_CONSISTENCY' && b.key.scenario === 'WORKER_CONSISTENCY'
        ? a.key.repetition - b.key.repetition || a.key.requestedWorkers - b.key.requestedWorkers
        : a.caseIndex - b.caseIndex,
    );
    for (const { caseIndex, key, sourceDigest } of executionItems) {
      const observation = unobserved(
        key,
        sourceDigest,
        key.scenario === 'WORKER_CONSISTENCY'
          ? 'WORKER_ORDER_UNPROVED'
          : 'CLASS_EXECUTION_UNPROVED',
      );
      data.observations.push(observation);
      const performance = performanceScenarios.includes(key.scenario);
      const worker = key.scenario === 'WORKER_CONSISTENCY';
      const javaGolden = key.scenario === 'GOLDEN' && key.fixtureId.startsWith('java-');
      const cold = key.scenario === 'COLD' || javaGolden || worker;
      const transition =
        key.scenario === 'TRANSITION'
          ? transitions.find(
              (item) => key.fixtureId === `p05-native-refresh-producer-v1/${item.id}`,
            )
          : null;
      const successTransition =
        transition?.outcome === 'SUCCEEDED' && !transition.classificationChange;
      if (['canonical-normalization', 'two-provider-same-call'].includes(key.fixtureId)) {
        try {
          await assertOwned();
          await assertInputs();
          await inventory.assertUnchanged();
          for (const receipt of receipts) await receipt.assertUnchanged();
          const contract = runPhase05PinnedContract({
            pinnedInputs: pins,
            fixtureId: key.fixtureId,
          });
          const filename = `contract-${String(caseIndex + 1).padStart(4, '0')}-${key.repetition}.json`;
          const bytes =
            JSON.stringify(
              { identity: data.identity, runKey: key, sourceDigest, contract },
              null,
              2,
            ) + '\n';
          if (
            Buffer.byteLength(bytes) >
            Math.min(
              input.configuration.transportLimits.maxStdoutBytes,
              input.configuration.resourceBudget.maxMemoryBytes,
            )
          )
            throw new Error('Contract receipt exceeds caller bounds');
          await persist(filename, bytes);
          const receipt = await captureFile(
            path.join(output, filename),
            input.configuration.transportLimits.maxStdoutBytes,
          );
          receipts.push(receipt);
          await receipt.assertUnchanged();
          observation.artifactDigests.PURE_CONTRACT_RECEIPT = receipt.sha256;
          if (!contract.matches) {
            observation.status = 'FAILED';
            observation.failure = failure('PINNED_CONTRACT_MISMATCH');
            continue;
          }
          const sqliteDirectory = path.join(
            output,
            `contract-${String(caseIndex + 1).padStart(4, '0')}-${key.repetition}`,
          );
          const sqliteContract = await runPhase05PinnedSqliteContract({
            directory: sqliteDirectory,
            pinnedInputs: pins,
            fixtureId: key.fixtureId,
            configuration: input.configuration,
          });
          for (const phase of sqliteContract.phases) {
            const image = await captureFile(
              path.join(sqliteDirectory, `${phase.role}.sqlite`),
              input.configuration.resourceBudget.maxMemoryBytes,
              false,
            );
            if (image.sha256 !== phase.databaseSha256)
              throw new Error('Recorded phase image changed');
            receipts.push(image);
            observation.artifactDigests[`SQLITE_${phase.role.toUpperCase()}_IMAGE`] = image.sha256;
          }
          const sqliteFilename = `sqlite-${filename}`;
          const sqliteBytes =
            JSON.stringify(
              { identity: data.identity, runKey: key, sourceDigest, contract: sqliteContract },
              null,
              2,
            ) + '\n';
          if (
            Buffer.byteLength(sqliteBytes) >
            Math.min(
              input.configuration.transportLimits.maxStdoutBytes,
              input.configuration.resourceBudget.maxMemoryBytes,
            )
          )
            throw new Error('SQLite receipt exceeds caller bounds');
          await persist(sqliteFilename, sqliteBytes);
          const sqliteReceipt = await captureFile(
            path.join(output, sqliteFilename),
            input.configuration.transportLimits.maxStdoutBytes,
          );
          receipts.push(sqliteReceipt);
          await sqliteReceipt.assertUnchanged();
          observation.artifactDigests.SQLITE_CONTRACT_RECEIPT = sqliteReceipt.sha256;
          observation.artifactDigests.receipt = sqliteReceipt.sha256;
          const phases = sqliteContract.phases;
          const all = (name) => phases.length > 0 && phases.every((phase) => phase[name] === true);
          const phaseGolden = (role) =>
            phases.some((phase) => phase.role === role && phase.graphEqual === true);
          const common = {
            supportCandidates: all('supportCandidatesEqual') && all('supportEqual'),
            sourceActivation: all('sourceEqual'),
            coverage: all('coverageEqual'),
            reopenedImages: sqliteContract.matches && phases.length > 0,
            receipts: true,
          };
          observation.componentChecks =
            key.fixtureId === 'canonical-normalization'
              ? { pairGolden: contract.matches, persistedGolden: phaseGolden('full'), ...common }
              : {
                  fullGolden: phaseGolden('full'),
                  oneGolden: phaseGolden('one'),
                  zeroGolden: phaseGolden('zero'),
                  reverseOrder: contract.checks.reverse,
                  ...common,
                  evidenceHistory: all('historyEqual'),
                  rejectedPatchRecovery:
                    Array.isArray(sqliteContract.rejectedPatches) &&
                    sqliteContract.rejectedPatches.length === 2 &&
                    sqliteContract.rejectedPatches.every(
                      (recovery, index) =>
                        recovery.kind === ['DANGLING_NODE_REMOVAL', 'STALE_BASE'][index] &&
                        recovery.errorCode === ['INVALID_PATCH', 'BASE_REVISION_MISMATCH'][index] &&
                        /^[a-f0-9]{64}$/.test(recovery.beforeImageDigest) &&
                        recovery.afterImageDigest === recovery.beforeImageDigest &&
                        recovery.closure.transactionClosed === true &&
                        recovery.closure.tempClosed === true &&
                        recovery.closure.connectionClosed === true,
                    ),
                };
          observation.graphEqual = all('graphEqual');
          observation.supportEqual =
            all('supportEqual') && all('supportCandidatesEqual') && all('historyEqual');
          observation.coverageEqual = all('coverageEqual');
          observation.staleBindings = all('supportEqual') ? 0 : null;
          observation.closure.transactionClosed = sqliteContract.closure.transactionClosed;
          observation.closure.tempClosed = sqliteContract.closure.tempClosed;
          const matches =
            contract.matches &&
            sqliteContract.matches &&
            Object.values(observation.componentChecks).every((value) => value === true) &&
            Object.values(sqliteContract.closure).every((value) => value === true);
          // This layer proves component publication, never Native extraction.
          observation.status = matches ? 'PASSED' : 'FAILED';
          observation.failure = matches ? null : failure('COMPONENT_CHECK_UNPROVED');
        } catch {
          observation.status = 'FAILED';
          observation.failure = failure('EVALUATION_INTEGRITY_FAILED');
        }
        continue;
      }
      if (!performance && !javaGolden && !transition && !worker) continue;
      try {
        await assertOwned();
        await assertInputs();
        await inventory.assertUnchanged();
        for (const receipt of receipts) await receipt.assertUnchanged();
        // Inventory position keeps owned paths short on Windows. Original full
        // Fixture identity remains in the immutable inventory/report, not a path.
        const caseName = worker
          ? 'WORKER_CONSISTENCY'
          : performance
            ? key.scenario
            : `${key.scenario}-${String(caseIndex + 1).padStart(4, '0')}`;
        const directory = path.join(output, `${caseName}-${key.repetition}`);
        let pair = worker ? workerPairs.get(key.repetition) : null;
        let prepared;
        if (pair) prepared = pair.prepared;
        else if (performance || worker)
          prepared = await preparePhase05PerformanceRepository({
            directory,
            scenario: worker ? 'COLD' : key.scenario,
          });
        else {
          const files = (mapping) =>
            Object.fromEntries(
              Object.entries(mapping).map(([filename, asset]) => [
                filename,
                pins.readFile('p05-native-refresh-producer-v1', `source/${asset}`),
              ]),
            );
          let baseline, target;
          if (transition) {
            baseline = files(transition.baseline);
            target = files(transition.target);
          } else {
            const sourceManifest = parseFixtureManifest(
              JSON.parse(pins.readFile(key.fixtureId, 'fixture.json')),
            );
            const sourceRoot = sourceManifest.inputs.source;
            if (sourceRoot !== 'source/') throw new Error('Unsupported Golden source layout');
            baseline = Object.fromEntries(
              pins
                .filePaths(key.fixtureId)
                .filter((filename) => filename.startsWith(sourceRoot))
                .map((filename) => [
                  filename.slice(sourceRoot.length),
                  pins.readFile(key.fixtureId, filename),
                ]),
            );
            target = baseline;
          }
          prepared = await preparePhase05PinnedRepository({ directory, baseline, target });
        }
        const repositoryId = `phase05-${caseName}-${key.repetition}`;
        const sourceSeed = path.join(directory, 'source-seed.sqlite');
        let expectedSource =
          pair?.source ??
          (
            await preparePhase05SourceSeed({
              databasePath: sourceSeed,
              repositoryRoot: prepared.repositoryRoot,
              repositoryId,
              initialize: true,
              configuration: input.configuration,
            })
          ).state;
        if (
          transition &&
          !verifyPhase05TransitionSources(pins, transition, expectedSource, 'baseline')
        )
          throw new Error('Independent transition baseline Source differs');
        const seed =
          pair?.seed ??
          (await captureFile(sourceSeed, input.configuration.resourceBudget.maxMemoryBytes, false));
        observation.artifactDigests.SOURCE_ONLY_SEED = seed.sha256;
        if (worker && !pair) {
          pair = { prepared, source: expectedSource, seed, members: [] };
          workerPairs.set(key.repetition, pair);
        }
        let configuration = input.configuration;
        if (worker) {
          configuration = parseIndexConfiguration({
            ...input.configuration,
            indexing: { nativeAnalyzer: { parseWorkers: key.requestedWorkers } },
          });
          try {
            const resolved = resolveNativeWorkerConfig(
              configuration,
              configuration.resourceBudget,
              availableParallelism(),
              16 * 1024 * 1024,
            );
            if (resolved.effectiveCount !== key.requestedWorkers)
              throw new Error('Worker count differs');
          } catch {
            observation.status = 'FAILED';
            observation.failure = failure('WORKER_CONFIGURATION_UNAVAILABLE');
            continue;
          }
        }
        if (transition)
          observation.artifactDigests.ORIGINAL_TRANSITION_RECIPE = hash(JSON.stringify(transition));
        const javaOracle = javaGolden
          ? await preparePhase05JavaOracle({
              pinnedInputs: pins,
              fixtureId: key.fixtureId,
              sourceState: expectedSource,
            })
          : null;
        if (javaOracle) observation.artifactDigests.REGISTERED_JAVA_ORACLE = javaOracle.sha256;
        const databasePath = path.join(
          directory,
          worker ? `working-${key.requestedWorkers}.sqlite` : 'working.sqlite',
        );
        await copyPhase05ClosedSeed({
          directory,
          sourcePath: sourceSeed,
          targetPath: databasePath,
          maxBytes: input.configuration.resourceBudget.maxMemoryBytes,
        });
        const request = {
          schemaVersion: 1,
          operation: 'FULL',
          databasePath,
          repositoryId,
          repositoryRoot: prepared.repositoryRoot,
          nativeExecutablePath: input.nativeExecutablePath,
          initialize: false,
          configuration,
        };
        let descriptor;
        const invoke = async (request, role, priorReceipts = [], failureInspection = {}) => {
          await assertOwned();
          await assertInputs();
          await inventory.assertUnchanged();
          await seed.assertUnchanged();
          const ownedRole = worker ? `worker-${key.requestedWorkers}-${role}` : role;
          const replayPath = path.join(directory, `${ownedRole}-replay.sqlite`);
          await copyPhase05ClosedSeed({
            directory,
            sourcePath: request.databasePath,
            targetPath: replayPath,
            maxBytes: input.configuration.resourceBudget.maxMemoryBytes,
          });
          const replayInput = await captureFile(
            replayPath,
            input.configuration.resourceBudget.maxMemoryBytes,
            false,
          );
          receipts.push(replayInput);
          const restorePoint = await preparePhase05RestorePoint({
            directory,
            sourcePath: replayPath,
            targetPath: request.databasePath,
            maxBytes: input.configuration.resourceBudget.maxMemoryBytes,
          });
          const trial = failureInspection.metadataTarget
            ? runPhase05DeclaredMetadataTrial
            : runPhase05IndexTrial;
          const saved = await trial({
            request,
            receiptDirectory: path.join(directory, `${ownedRole}-receipt`),
            priorReceipts,
            expectedNativeOutcome: failureInspection.expectedNativeOutcome,
            ...(failureInspection.metadataTarget
              ? { metadataTarget: failureInspection.metadataTarget }
              : {}),
          });
          receipts.push(saved);
          await saved.assertUnchanged();
          observation.artifactDigests.receipt = saved.sha256;
          const record = JSON.parse(await readFile(saved.receiptPath));
          await saved.assertUnchanged();
          let inspection = null;
          if (record.outcome === 'FAILED') {
            await replayInput.assertUnchanged();
            let restored;
            if (failureInspection.beforeRestore) {
              const captured = await inspectPhase05FailedTrialBeforeRestore({
                receipt: saved,
                restorePoint,
                inspect: () => failureInspection.beforeRestore(record),
              });
              inspection = captured.inspection;
              restored = captured.restored;
            } else restored = await restorePoint.restore({ receipt: saved });
            const image = await captureFile(
              request.databasePath,
              input.configuration.resourceBudget.maxMemoryBytes,
              false,
            );
            const archive = await captureFile(
              path.join(directory, restored.archivePath),
              input.configuration.resourceBudget.maxMemoryBytes,
              false,
            );
            if (restored.sha256 !== replayInput.sha256 || image.sha256 !== replayInput.sha256)
              throw new Error('Evaluation replay restoration differs');
            receipts.push(image, archive);
            const filename = `restore-${caseIndex + 1}-${key.repetition}-${role}.json`;
            await persist(
              filename,
              JSON.stringify(
                {
                  identity: data.identity,
                  runKey: key,
                  scope: 'OWNED_CLOSED_FILE_REPLAY_ONLY',
                  trialReceiptSha256: saved.sha256,
                  restored,
                  retainedFailureSha256: archive.sha256,
                },
                null,
                2,
              ) + '\n',
            );
            const replayReceipt = await captureFile(
              path.join(output, filename),
              input.configuration.transportLimits.maxStdoutBytes,
            );
            receipts.push(replayReceipt);
            const prefix = role.toUpperCase();
            observation.artifactDigests[`${prefix}_REPLAY_INPUT`] = replayInput.sha256;
            observation.artifactDigests[`${prefix}_RESTORED_IMAGE`] = image.sha256;
            observation.artifactDigests[`${prefix}_RETAINED_FAILURE_IMAGE`] = archive.sha256;
            observation.artifactDigests[`${prefix}_RESTORE_RECEIPT`] = replayReceipt.sha256;
          }
          const parseProof = record.nativeObservation?.parseObservation;
          if (parseProof) {
            const filename = `parse-observation-${caseIndex + 1}-${key.repetition}-${role}.json`;
            const bytes =
              JSON.stringify(
                {
                  identity: data.identity,
                  runKey: key,
                  sourceDigest,
                  sourceSeedSha256: seed.sha256,
                  trialReceiptSha256: saved.sha256,
                  configurationSha256: hash(JSON.stringify(request.configuration)),
                  observation: parseProof,
                },
                null,
                2,
              ) + '\n';
            if (Buffer.byteLength(bytes) > input.configuration.transportLimits.maxStdoutBytes)
              throw new Error('Parse observation receipt exceeds caller bounds');
            await persist(filename, bytes);
            const captured = await captureFile(
              path.join(output, filename),
              input.configuration.transportLimits.maxStdoutBytes,
            );
            receipts.push(captured);
            await captured.assertUnchanged();
            observation.artifactDigests[`PARSE_${role.toUpperCase()}`] = captured.sha256;
          }
          return { saved, record, inspection };
        };
        let reference, baselineReceipt, incrementalBaseline;
        if (cold) reference = await invoke(request, 'reference');
        else {
          const baseline = await invoke(request, 'baseline');
          baselineReceipt = baseline.saved;
          observation.artifactDigests.PREREQUISITE_RECEIPT = baseline.saved.sha256;
          if (baseline.record.outcome !== 'SUCCEEDED') {
            observation.status = 'FAILED';
            observation.failure = failure(baseline.record.error.code);
            continue;
          }
          incrementalBaseline = await readImage(databasePath);
          if (transition?.classificationChange) {
            const metadataTarget = await preparePhase05DeclaredMetadataTarget({
              pinnedInputs: pins,
              sourceState: expectedSource,
            });
            const declaredSourceSha256 = hash(
              JSON.stringify({ baseline: metadataTarget.baseline, target: metadataTarget.target }),
            );
            const declarationName = `metadata-declaration-${caseIndex + 1}-${key.repetition}.json`;
            const declarationBytes =
              JSON.stringify(
                { identity: data.identity, runKey: key, declaredSourceSha256, ...metadataTarget },
                null,
                2,
              ) + '\n';
            if (
              Buffer.byteLength(declarationBytes) >
              input.configuration.transportLimits.maxStdoutBytes
            )
              throw new Error('Metadata declaration exceeds caller bounds');
            await persist(declarationName, declarationBytes);
            const declaration = await captureFile(
              path.join(output, declarationName),
              input.configuration.transportLimits.maxStdoutBytes,
            );
            receipts.push(declaration);
            observation.artifactDigests.DECLARED_SOURCE_INPUT = declaration.sha256;
            const original = incrementalBaseline;
            expectedSource = metadataTarget.target;
            if (!verifyPhase05TransitionSources(pins, transition, expectedSource, 'target'))
              throw new Error('Original declared metadata Source differs');
            const referencePath = path.join(directory, 'metadata-full.sqlite');
            await copyPhase05ClosedSeed({
              directory,
              sourcePath: databasePath,
              targetPath: referencePath,
              maxBytes: input.configuration.resourceBudget.maxMemoryBytes,
            });
            const full = await invoke(
              { ...request, databasePath: referencePath },
              'metadata-reference',
              [baselineReceipt],
              { metadataTarget },
            );
            observation.artifactDigests.METADATA_FULL_RECEIPT = full.saved.sha256;
            if (full.record.outcome !== 'SUCCEEDED') {
              observation.failure = failure(full.record.error.code);
              continue;
            }
            const refreshed = await invoke(
              { ...request, operation: 'INCREMENTAL' },
              'metadata-refresh',
              [baselineReceipt],
              { metadataTarget },
            );
            observation.artifactDigests.METADATA_REFRESH_RECEIPT = refreshed.saved.sha256;
            if (refreshed.record.outcome !== 'SUCCEEDED') {
              observation.failure = failure(refreshed.record.error.code);
              continue;
            }
            // Both readers reopen the closed original-location images and qualify
            // current Source, active supports, coverage and complete R010 state.
            const expected = await readImage(referencePath);
            const actual = await readImage(databasePath);
            if (
              [full.record, refreshed.record].some(
                (record) =>
                  record.executionBasis !== 'DECLARED_SOURCE_IR' ||
                  record.declaredSourceSha256 !== declaredSourceSha256,
              )
            )
              throw new Error('Declared metadata receipt input differs');
            const comparison = comparePhase05PublishedStates({
              expected,
              actual,
              criticalSymbols: [],
              criticalDirectCalls: [],
            });
            const relations = verifyPhase05TransitionProjection(
              { ...transition, classificationChange: undefined },
              transitionProjection(actual),
            );
            const history = [expected, actual].every((image) =>
              original.supports.evidence.every((before) => {
                const after = image.supports.evidence.find((item) => item.id === before.id);
                if (!after) return false;
                validateEvidenceTransition(before, after);
                return true;
              }),
            );
            const fullClosure = phase05ObservedClosure(full.record.nativeObservation);
            const refreshClosure = phase05ObservedClosure(refreshed.record.nativeObservation);
            observation.closure = Object.fromEntries(
              Object.keys(fullClosure).map((key) => [
                key,
                fullClosure[key] === true && refreshClosure[key] === true
                  ? true
                  : fullClosure[key] === false || refreshClosure[key] === false
                    ? false
                    : null,
              ]),
            );
            observation.componentChecks = {
              sourceMetadataTransition: isDeepStrictEqual(
                actual.supports.sourceFiles,
                expectedSource.files,
              ),
              originalRelations: relations,
              fullRefreshAgreement:
                comparison.graphEqual && comparison.supportEqual && comparison.coverageEqual,
              nativeStateCoactivation: comparison.nativeStateEqual,
              activeSupportHistory: history,
              restart:
                expected.nativeBaseline?.status === 'AVAILABLE' &&
                actual.nativeBaseline?.status === 'AVAILABLE',
              rawOperations:
                [refreshed.record, full.record].every((record) =>
                  verifyPhase05ParseObservation({
                    record,
                    source: expectedSource,
                    baseline: original,
                    recipe: transition,
                    capabilities: ['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'],
                  }),
                ) &&
                verifyPhase05ConsumedNativeRecords({
                  record: refreshed.record,
                  source: expectedSource,
                  baseline: original,
                  recipe: transition,
                }) &&
                verifyPhase05ConsumedNativeRecords({
                  record: full.record,
                  source: expectedSource,
                  baseline: original,
                  recipe: transition,
                }),
              receipts: true,
            };
            observation.graphEqual = comparison.graphEqual && relations;
            observation.supportEqual = comparison.supportEqual;
            observation.coverageEqual = comparison.coverageEqual;
            observation.staleBindings = comparison.staleBindings;
            observation.facts = phase05DifferentialMetrics(comparison.facts);
            observation.nativeOutcome = 'SUCCEEDED';
            observation.effectiveWorkers = refreshed.record.result.workers.effectiveCount;
            observation.workerUnavailableReason = null;
            const metadataMatches =
              Object.values(observation.componentChecks).every((value) => value === true) &&
              Object.values(observation.closure).every((value) => value === true) &&
              full.record.result.workers.effectiveCount === key.expectedEffectiveWorkers &&
              observation.effectiveWorkers === key.expectedEffectiveWorkers &&
              comparison.staleBindings === 0;
            observation.status = metadataMatches ? 'PASSED' : 'FAILED';
            observation.failure = metadataMatches
              ? null
              : failure('DECLARED_METADATA_CHECK_UNPROVED');
            continue;
          }
          let retainedBinding, retainedBefore;
          const retentionRead = (binding) =>
            readPhase05RetainedPublication({
              databasePath,
              repositoryId,
              repositoryRoot: prepared.repositoryRoot,
              budget: {
                maxMetadataRows: input.configuration.resourceBudget.maxEvents,
                maxResultBytes: input.configuration.transportLimits.maxStdoutBytes,
                timeoutMs: input.configuration.resourceBudget.maxDurationMs,
              },
              binding,
            });
          if (key.expectedOutcome === 'PARTIAL_RETAINED') {
            const original = incrementalBaseline;
            // Both original PARTIAL recipes explicitly start from zero files/facts.
            if (
              transition.outcome !== 'PARTIAL' ||
              Object.keys(transition.baseline).length !== 0 ||
              expectedSource.files.length !== 0 ||
              original.supports.facts.nodes.length !== 0 ||
              original.supports.facts.edges.length !== 0 ||
              original.nativeBaseline?.status !== 'AVAILABLE'
            )
              throw new Error('Partial baseline qualification unavailable');
            comparePhase05PublishedStates({
              expected: original,
              actual: original,
              criticalSymbols: [],
              criticalDirectCalls: [],
            });
            const { state, token } = original.nativeBaseline;
            retainedBinding = {
              expected: state.expected,
              token,
              snapshotId: token.states.find((item) => item.providerId === state.expected.providerId)
                .snapshotId,
              sourceFiles: expectedSource.files,
              limits: {
                maxSerializedBytes: input.configuration.transportLimits.maxStdinBytes,
                memoryBudgetBytes: input.configuration.resourceBudget.maxMemoryBytes,
              },
            };
            retainedBefore = await retentionRead(retainedBinding);
          }
          await prepared.applyTarget();
          expectedSource = (
            await preparePhase05SourceSeed({
              databasePath,
              repositoryRoot: prepared.repositoryRoot,
              repositoryId,
              initialize: false,
              configuration: input.configuration,
            })
          ).state;
          if (
            transition &&
            !verifyPhase05TransitionSources(pins, transition, expectedSource, 'target')
          )
            throw new Error('Independent transition target Source differs');
          if (retainedBinding) {
            const partial = await invoke(
              { ...request, operation: 'INCREMENTAL' },
              'partial',
              [baselineReceipt],
              {
                expectedNativeOutcome: 'PARTIAL',
                beforeRestore: async (record) => {
                  await assertOwned();
                  await assertInputs();
                  await baselineReceipt.assertUnchanged();
                  const after = await retentionRead(retainedBinding);
                  const agreement = comparePhase05RetainedPublications({
                    expected: retainedBefore,
                    actual: after,
                    currentSource: expectedSource,
                  });
                  const filename = `partial-retention-${caseIndex + 1}-${key.repetition}.json`;
                  const bytes =
                    JSON.stringify(
                      {
                        identity: data.identity,
                        runKey: key,
                        scope: 'PERSISTED_RETENTION_BEFORE_EVALUATION_RESTORE_ONLY',
                        originalRecipeSha256: hash(JSON.stringify(transition)),
                        currentSource: expectedSource,
                        before: retainedBefore,
                        after,
                        agreement,
                        nativeObservation: record.nativeObservation,
                      },
                      null,
                      2,
                    ) + '\n';
                  if (Buffer.byteLength(bytes) > input.configuration.transportLimits.maxStdoutBytes)
                    throw new Error('Partial inspection receipt exceeds caller bounds');
                  await persist(filename, bytes);
                  const captured = await captureFile(
                    path.join(output, filename),
                    input.configuration.transportLimits.maxStdoutBytes,
                  );
                  receipts.push(captured);
                  await captured.assertUnchanged();
                  observation.artifactDigests.PARTIAL_PRE_RESTORE_INSPECTION = captured.sha256;
                  return agreement;
                },
              },
            );
            observation.status = 'FAILED';
            observation.artifactDigests.PARTIAL_TRIAL_RECEIPT = partial.saved.sha256;
            const evidence = partial.record.nativeObservation;
            const proof = evidence?.partialRefresh;
            const terminal = proof?.terminal;
            if (
              partial.record.outcome === 'FAILED' &&
              proof?.validatedPartialBranch === true &&
              terminal.payload.repositoryId === repositoryId &&
              terminal.payload.revisionId === expectedSource.revision.id &&
              terminal.payload.revisionFingerprint === expectedSource.revision.contentFingerprint &&
              terminal.payload.providerSnapshotId !== retainedBinding.snapshotId &&
              terminal.payload.counts.sourceFiles === transition.changed.length
            ) {
              observation.nativeOutcome = 'PARTIAL';
              observation.workerUnavailableReason = 'PUBLIC_REFUSAL_HAS_NO_WORKER_RESULT';
              observation.closure = phase05ObservedClosure(evidence);
              if (
                partial.inspection?.freshness === 'STALE' &&
                partial.inspection.currentSourceEqual
              ) {
                observation.graphEqual = partial.inspection.publicationEqual;
                observation.supportEqual = partial.inspection.publicationEqual;
                observation.coverageEqual = partial.inspection.publicationEqual;
                if (partial.inspection.publicationEqual && partial.inspection.nativeStateEqual)
                  observation.staleBindings = 0;
              }
              const sitesMatch = verifyPhase05PartialSites(transition, proof, expectedSource);
              const retained =
                observation.graphEqual === true &&
                observation.supportEqual === true &&
                observation.coverageEqual === true &&
                observation.staleBindings === 0;
              const closed = Object.values(observation.closure).every((value) => value === true);
              const parsesMatch = verifyPhase05ParseObservation({
                record: partial.record,
                source: expectedSource,
                baseline: incrementalBaseline,
                recipe: transition,
                capabilities: ['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'],
              });
              if (sitesMatch && retained && closed && parsesMatch) {
                observation.status = 'PASSED';
                observation.failure = null;
              } else
                observation.failure = failure(
                  !parsesMatch
                    ? 'PARTIAL_PARSE_OBSERVATION_UNPROVED'
                    : !sitesMatch
                      ? 'PARTIAL_SITES_DIFFER'
                      : !retained
                        ? 'PARTIAL_RETENTION_UNPROVED'
                        : 'RESOURCE_CLOSURE_UNPROVED',
                );
            } else observation.failure = failure('VALIDATED_PARTIAL_UNPROVED');
            continue;
          }
          const referencePath = path.join(directory, 'reference.sqlite');
          await copyPhase05ClosedSeed({
            directory,
            sourcePath: databasePath,
            targetPath: referencePath,
            maxBytes: input.configuration.resourceBudget.maxMemoryBytes,
          });
          reference = await invoke({ ...request, databasePath: referencePath }, 'reference', [
            baselineReceipt,
          ]);
        }
        observation.artifactDigests.PREREQUISITE_RECEIPT = reference.saved.sha256;
        if (reference.record.outcome !== 'SUCCEEDED') {
          observation.status = 'FAILED';
          observation.failure = failure(reference.record.error.code);
          continue;
        }
        if (!performance && !javaGolden && !successTransition && !worker) {
          // Real qualified prerequisites are not parser-accuracy proof. Original
          // Provider goldens/transition semantics must bind before any trial.
          observation.failure = failure('REGISTERED_JAVA_ORACLE_UNPROVED');
          continue;
        }
        async function readImage(databasePath) {
          if (!descriptor) {
            const handshake = await executeNativeRequest(
              {
                protocolVersion: 1,
                requestId: 'phase05-evaluation-describe',
                type: 'DESCRIBE',
                payload: { clientProtocolVersions: [1], clientIrSchemaVersions: [1] },
              },
              {
                executablePath: input.nativeExecutablePath,
                timeoutMs: input.configuration.resourceBudget.maxDurationMs,
                limits: input.configuration.transportLimits,
                allowedEnvironment: Object.fromEntries(
                  ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
                    .filter((name) => process.env[name] !== undefined)
                    .map((name) => [name, process.env[name]]),
                ),
              },
            );
            if (handshake.terminal.type !== 'DESCRIBE_COMPLETED')
              throw new Error('Evaluation descriptor unavailable.');
            descriptor = handshake.terminal.payload;
          }
          const budget = {
            maxMetadataRows: input.configuration.resourceBudget.maxEvents,
            maxResultBytes: input.configuration.transportLimits.maxStdoutBytes,
            timeoutMs: input.configuration.resourceBudget.maxDurationMs,
          };
          const scalar = await readPhase05PublishedState({
            databasePath,
            repositoryId,
            repositoryRoot: prepared.repositoryRoot,
            budget,
          });
          const mapping = bindPhase05SourceIdentity(
            expectedSource.files,
            scalar.supports.sourceFiles,
          );
          if (
            JSON.stringify(scalar.revision) !== JSON.stringify(expectedSource.revision) ||
            [...mapping].some(([left, right]) => left !== right)
          )
            throw new Error('Independent Source seed differs from stored result.');
          return readPhase05PublishedState({
            databasePath,
            repositoryId,
            repositoryRoot: prepared.repositoryRoot,
            budget,
            native: {
              expected: {
                repositoryId,
                providerId: descriptor.providerId,
                providerVersion: descriptor.providerVersion,
                revisionId: expectedSource.revision.id,
                contentFingerprint: expectedSource.revision.contentFingerprint,
                language: descriptor.languages.find((language) => language.languageId === 'java'),
                resolverVersion: '1',
                normalizerVersion: JAVA_NORMALIZER_VERSION,
                policyFingerprint: 'sha256:' + hash(JSON.stringify(input.configuration.source)),
                requestedCapabilities: ['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'],
              },
              limits: {
                maxSerializedBytes: input.configuration.transportLimits.maxStdinBytes,
                memoryBudgetBytes: input.configuration.resourceBudget.maxMemoryBytes,
              },
            },
          });
        }
        const referencePath = cold ? databasePath : path.join(directory, 'reference.sqlite');
        const expected = await readImage(referencePath);
        if (performance || worker)
          performanceScope(expected, golden, worker ? 'COLD' : key.scenario);
        else if (javaGolden && !javaOracle.evaluate(expected.supports).matches) {
          observation.status = 'FAILED';
          observation.failure = failure('REGISTERED_JAVA_REFERENCE_MISMATCH');
          continue;
        } else if (
          successTransition &&
          !verifyPhase05TransitionProjection(transition, transitionProjection(expected))
        ) {
          observation.status = 'FAILED';
          observation.failure = failure('REGISTERED_TRANSITION_REFERENCE_MISMATCH');
          continue;
        }
        const trialPath = path.join(
          directory,
          worker ? `trial-${key.requestedWorkers}.sqlite` : 'trial.sqlite',
        );
        await copyPhase05ClosedSeed({
          directory,
          sourcePath: cold ? sourceSeed : databasePath,
          targetPath: trialPath,
          maxBytes: input.configuration.resourceBudget.maxMemoryBytes,
        });
        const trial = await invoke(
          {
            ...request,
            operation: cold ? 'FULL' : 'INCREMENTAL',
            databasePath: trialPath,
          },
          'trial',
          baselineReceipt ? [baselineReceipt, reference.saved] : [reference.saved],
        );
        observation.artifactDigests.TRIAL_RECEIPT = trial.saved.sha256;
        observation.timings.total = { value: trial.record.totalMs, unavailableReason: null };
        observation.peak = { ...trial.record.peak, unavailableReason: null };
        if (trial.record.outcome !== 'SUCCEEDED') {
          observation.status = 'FAILED';
          observation.failure = failure(trial.record.error.code);
          continue;
        }
        const actual = await readImage(trialPath);
        const comparison = comparePhase05PublishedStates({
          expected,
          actual,
          criticalSymbols: [],
          criticalDirectCalls: [],
        });
        // Java counts use the independently pinned original scopes. Benchmark
        // slots never dilute the original critical accuracy gates.
        const goldenResult = javaOracle?.evaluate(actual.supports);
        observation.facts = goldenResult
          ? goldenResult.facts
          : phase05DifferentialMetrics(comparison.facts);
        observation.graphEqual =
          comparison.graphEqual &&
          comparison.nativeStateEqual &&
          (goldenResult?.matches ?? true) &&
          (!successTransition ||
            verifyPhase05TransitionProjection(transition, transitionProjection(actual)));
        observation.supportEqual = comparison.supportEqual;
        observation.coverageEqual = comparison.coverageEqual;
        observation.staleBindings = comparison.staleBindings;
        observation.effectiveWorkers = trial.record.result.workers.effectiveCount;
        observation.workerUnavailableReason = null;
        observation.nativeOutcome = 'SUCCEEDED';
        for (const [stage, field] of Object.entries({
          scan: 'scanMs',
          ipc: 'transportMs',
          normalize: 'normalizeMs',
          merge: 'mergeMs',
          dbApply: 'dbApplyMs',
          dbLock: 'dbLockMs',
        }))
          observation.timings[stage] = {
            value: trial.record.result.timings[field],
            unavailableReason:
              trial.record.result.timings[field] === null
                ? 'Index operation does not expose this stage.'
                : null,
          };
        const trialClosure = phase05ObservedClosure(trial.record.nativeObservation);
        const referenceClosure = phase05ObservedClosure(reference.record.nativeObservation);
        observation.closure = Object.fromEntries(
          Object.keys(trialClosure).map((key) => [
            key,
            trialClosure[key] === true && referenceClosure[key] === true
              ? true
              : trialClosure[key] === false || referenceClosure[key] === false
                ? false
                : null,
          ]),
        );
        const raw =
          verifyPhase05ConsumedNativeRecords({
            record: trial.record,
            source: expectedSource,
            baseline: incrementalBaseline,
            recipe: transition,
          }) &&
          verifyPhase05ConsumedNativeRecords({
            record: reference.record,
            source: expectedSource,
            baseline: incrementalBaseline,
            recipe: transition,
          });
        const matches =
          raw &&
          [trial.record, reference.record].every((record) =>
            verifyPhase05ParseObservation({
              record,
              source: expectedSource,
              baseline: incrementalBaseline,
              recipe: transition,
              capabilities: ['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'],
            }),
          ) &&
          observation.graphEqual &&
          comparison.nativeStateEqual &&
          observation.supportEqual &&
          observation.coverageEqual &&
          observation.staleBindings === 0 &&
          observation.effectiveWorkers === key.expectedEffectiveWorkers &&
          Object.values(observation.closure).every((value) => value === true);
        observation.status = matches ? 'PASSED' : 'FAILED';
        observation.failure = matches
          ? null
          : failure(!raw ? 'CONSUMED_NATIVE_RECORDS_DIFFER' : 'INDEX_CHECK_UNPROVED');
        observation.artifactDigests.CANONICAL = hash(
          JSON.stringify({
            nodes: actual.supports.facts.nodes,
            edges: actual.supports.facts.edges,
          }),
        );
        if (worker) {
          // Neither independently successful row qualifies until its original
          // peer and real callback order/overlap have been checked below.
          pair.members.push({
            runKey: key,
            sourceSeedSha256: seed.sha256,
            sourceDigest,
            configuration,
            receiptSha256: trial.saved.sha256,
            record: trial.record,
            observation,
            individuallyQualified: matches,
            image: actual,
            saved: trial.saved,
          });
          observation.status = 'FAILED';
          observation.failure = failure('WORKER_PAIR_UNPROVED');
        }
      } catch {
        observation.status = 'FAILED';
        observation.failure = failure('EVALUATION_INTEGRITY_FAILED');
      } finally {
        if (worker && key.requestedWorkers === 2) {
          const pair = workerPairs.get(key.repetition);
          if (pair) await finalizeWorkerPair(pair);
          workerPairs.delete(key.repetition);
        }
      }
    }
    async function finalizeWorkerPair(pair) {
      const { members } = pair;
      if (members.length !== 2) return;
      try {
        await assertOwned();
        await assertInputs();
        await inventory.assertUnchanged();
        await pair.seed.assertUnchanged();
        for (const member of members) await member.saved.assertUnchanged();
        const comparison = comparePhase05PublishedStates({
          expected: members[0].image,
          actual: members[1].image,
          criticalSymbols: [],
          criticalDirectCalls: [],
        });
        const qualified =
          verifyPhase05WorkerPair({
            members,
            source: pair.source,
            capabilities: ['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'],
            comparison,
          }) &&
          members.every(
            (member) =>
              member.individuallyQualified === true &&
              Object.values(member.observation.closure).every((value) => value === true) &&
              member.observation.graphEqual === true &&
              member.observation.supportEqual === true &&
              member.observation.coverageEqual === true &&
              member.observation.staleBindings === 0,
          );
        const filename = `worker-pair-${members[0].runKey.repetition}.json`;
        const bytes =
          JSON.stringify(
            {
              identity: data.identity,
              sourceSeedSha256: pair.seed.sha256,
              sourceDeclarationSha256: hash(JSON.stringify(pair.source)),
              sourceDigest: members[0].sourceDigest,
              members: members.map((member) => ({
                runKey: member.runKey,
                receiptSha256: member.saved.sha256,
                configurationSha256: hash(JSON.stringify(member.configuration)),
                traceReceiptSha256: member.observation.artifactDigests.PARSE_TRIAL ?? null,
              })),
              comparison,
              qualified,
            },
            null,
            2,
          ) + '\n';
        if (Buffer.byteLength(bytes) > input.configuration.transportLimits.maxStdoutBytes)
          throw new Error('Worker receipt exceeds bounds');
        await persist(filename, bytes);
        const captured = await captureFile(
          path.join(output, filename),
          input.configuration.transportLimits.maxStdoutBytes,
        );
        receipts.push(captured);
        await captured.assertUnchanged();
        for (const member of members) {
          member.observation.artifactDigests.WORKER_PAIR_RECEIPT = captured.sha256;
          member.observation.artifactDigests.receipt = member.saved.sha256;
          member.observation.artifactDigests.canonical =
            member.observation.artifactDigests.CANONICAL;
          member.observation.artifactDigests['completion-order'] = hash(
            JSON.stringify(member.record.nativeObservation.parseObservation.completionOrder),
          );
          member.observation.status = qualified ? 'PASSED' : 'FAILED';
          member.observation.failure = qualified ? null : failure('WORKER_PAIR_UNPROVED');
        }
      } catch {
        for (const member of members) {
          member.observation.status = 'FAILED';
          member.observation.failure = failure('WORKER_PAIR_UNPROVED');
        }
      }
    }
    try {
      await assertInputs();
      await inventory.assertUnchanged();
      for (const receipt of receipts) await receipt.assertUnchanged();
    } catch {
      for (const observation of data.observations) {
        observation.status = 'FAILED';
        observation.failure = failure('EVALUATION_INTEGRITY_FAILED');
      }
    }
    for (const observation of data.observations)
      observation.artifactDigests = Object.fromEntries(
        Object.entries(observation.artifactDigests).sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0,
        ),
      );
    await assertOwned();
    const reportPath = await persistPhase05Report({
      directory: path.join(output, 'report'),
      input: data,
    });
    const report = evaluatePhase05LayeredReport(data);
    return { reportPath, exitCode: report.overall === 'PASS' ? 0 : 1 };
  } catch (error) {
    if (!acquired) controlError();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let input;
  try {
    const names = ['--fixture', '--output', '--native', '--config', '--repetitions'];
    const arguments_ = process.argv.slice(2),
      values = new Map();
    if (arguments_.length !== names.length * 2) controlError();
    for (let index = 0; index < arguments_.length; index += 2) {
      const name = arguments_[index],
        value = arguments_[index + 1];
      if (!names.includes(name) || values.has(name) || !value || value.startsWith('--'))
        controlError();
      values.set(name, value);
    }
    if (!/^[1-9][0-9]*$/.test(values.get('--repetitions'))) controlError();
    const config = await captureFile(path.resolve(values.get('--config')), 1_000_000);
    input = controls({
      fixtureDirectory: path.resolve(values.get('--fixture')),
      outputDirectory: path.resolve(values.get('--output')),
      nativeExecutablePath: path.resolve(values.get('--native')),
      configuration: JSON.parse(config.bytes),
      repetitions: Number(values.get('--repetitions')),
    });
    await config.assertUnchanged();
  } catch {
    process.stderr.write('Invalid Phase05 Evaluation controls or destination.\n');
    process.exitCode = 2;
  }
  if (input) {
    try {
      const result = await runPhase05Evaluation(input);
      process.stdout.write(JSON.stringify(result) + '\n');
      process.exitCode = result.exitCode;
    } catch (error) {
      process.stderr.write(
        error instanceof EvaluationControlError
          ? 'Invalid Phase05 Evaluation controls or destination.\n'
          : 'Phase05 Evaluation did not complete; controlled evidence may be retained.\n',
      );
      process.exitCode = error instanceof EvaluationControlError ? 2 : 1;
    }
  }
}
