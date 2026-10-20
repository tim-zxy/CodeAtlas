import { isDeepStrictEqual, types } from 'node:util';
import { WorktreeRevisionSchema, SourceFileSchema } from '../../packages/ir/dist/index.js';
import {
  JAVA_NORMALIZER_VERSION,
  NativeAnalysisStateBundleV1Schema,
} from '../../packages/providers/dist/index.js';
import { bindPhase05SourceIdentity } from '../../packages/evaluation/dist/index.js';
import {
  comparePhase05ActiveSupports,
  comparePhase05SourceBoundFacts,
} from './phase05-evaluation-fixture.mjs';

function invalid() {
  throw new Error('Published comparison integrity unavailable or invalid.');
}

function exact(value, fields) {
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))
  )
    invalid();
}

function plain(value, seen = new Set(), sqlRows = false) {
  if (value === null || typeof value !== 'object') return;
  if (types.isProxy(value) || seen.has(value)) invalid();
  seen.add(value);
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (
    prototype !== (array ? Array.prototype : Object.prototype) &&
    !(sqlRows && !array && prototype === null)
  )
    invalid();
  const keys = Reflect.ownKeys(value);
  if (array && keys.length !== value.length + 1) invalid();
  for (const key of keys) {
    if (array && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
      invalid();
    plain(descriptor.value, seen, sqlRows);
  }
  seen.delete(value);
}

// Pure retention agreement only. The owned runner still must authenticate the
// baseline/receipt, actual PARTIAL branch and capture-before-restore ordering.
export function comparePhase05RetainedPublications(input) {
  try {
    // node:sqlite returns own-data rows with a null prototype. Keep the current
    // publication comparator's stricter input contract unchanged.
    plain(input, new Set(), true);
    exact(input, ['expected', 'actual', 'currentSource']);
    const source = (value) => {
      exact(value, ['revision', 'files']);
      const revision = WorktreeRevisionSchema.parse(value.revision);
      const files = value.files.map((file) => SourceFileSchema.parse(file));
      if (
        files.some(
          (file) => file.repositoryId !== revision.repositoryId || file.revisionId !== revision.id,
        ) ||
        new Set(files.map((file) => file.id)).size !== files.length ||
        new Set(files.map((file) => file.path)).size !== files.length
      )
        invalid();
      files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      return { revision, files };
    };
    const project = (image, original) => {
      exact(image, ['kind', 'currentSource', 'publicationRows', 'nativeInspection']);
      if (image.kind !== 'RETAINED_PUBLICATION_ONLY') invalid();
      exact(image.publicationRows, [
        'repository_state',
        'canonical_nodes',
        'canonical_edges',
        'unresolved_targets',
        'evidence',
        'fact_evidence',
        'provider_fact_bindings',
        'active_support_candidates',
        'provider_snapshots',
        'provider_capabilities',
        'analysis_coverage',
        'analysis_diagnostics',
        'native_analysis_state',
      ]);
      if (Object.values(image.publicationRows).some((rows) => !Array.isArray(rows))) invalid();
      exact(image.nativeInspection, ['kind', 'state', 'token']);
      if (image.nativeInspection.kind !== 'RETAINED_PUBLICATION_ONLY') invalid();
      const { state, token } = image.nativeInspection;
      exact(state, ['expected', 'headerJson', 'summaryDigest', 'files']);
      exact(token, [
        'committedSnapshotCount',
        'indexedRevisionId',
        'indexedContentFingerprint',
        'states',
      ]);
      const bundle = NativeAnalysisStateBundleV1Schema.parse({
        header: JSON.parse(state.headerJson),
        summaries: state.files.map((file) => {
          exact(file, ['sourceFileId', 'sourcePath', 'contentFingerprint', 'summaryJson']);
          const summary = JSON.parse(file.summaryJson);
          if (
            file.sourceFileId !== summary.sourceFile.id ||
            file.sourcePath !== summary.sourceFile.path ||
            file.contentFingerprint !== summary.sourceFile.contentFingerprint
          )
            invalid();
          return summary;
        }),
      });
      const { schemaVersion, sourceFileCount, summaryDigest, ...context } = bundle.header;
      const currentSource = source(image.currentSource);
      if (
        !isDeepStrictEqual(state.expected, context) ||
        context.normalizerVersion !== JAVA_NORMALIZER_VERSION ||
        state.summaryDigest !== summaryDigest ||
        !Number.isSafeInteger(token.committedSnapshotCount) ||
        token.committedSnapshotCount < 1 ||
        token.indexedRevisionId !== context.revisionId ||
        token.indexedContentFingerprint !== context.contentFingerprint ||
        context.repositoryId !== currentSource.revision.repositoryId ||
        context.revisionId !== currentSource.revision.id
      )
        invalid();
      const providers = new Set();
      for (const item of token.states) {
        exact(item, ['providerId', 'snapshotId', 'summaryDigest']);
        if (providers.has(item.providerId)) invalid();
        providers.add(item.providerId);
      }
      const selected = token.states.find((item) => item.providerId === context.providerId);
      if (!selected || selected.summaryDigest !== summaryDigest) invalid();
      const pointer = image.publicationRows.repository_state;
      if (
        pointer.length !== 1 ||
        pointer[0].repository_id !== context.repositoryId ||
        pointer[0].indexed_revision_id !== token.indexedRevisionId ||
        pointer[0].indexed_content_fingerprint !== token.indexedContentFingerprint
      )
        invalid();
      const oldSource = {
        revision: { ...currentSource.revision, contentFingerprint: context.contentFingerprint },
        files: bundle.summaries.map((summary) => summary.sourceFile),
      };
      if (
        (original || currentSource.revision.contentFingerprint === context.contentFingerprint) &&
        !isDeepStrictEqual(currentSource, source(oldSource))
      )
        invalid();
      return { currentSource, context };
    };
    const expected = project(input.expected, true),
      actual = project(input.actual, false);
    const target = source(input.currentSource);
    if (
      !isDeepStrictEqual(expected.context, actual.context) ||
      target.revision.id !== expected.context.revisionId ||
      target.revision.repositoryId !== expected.context.repositoryId
    )
      invalid();
    return {
      publicationEqual: isDeepStrictEqual(
        input.expected.publicationRows,
        input.actual.publicationRows,
      ),
      nativeStateEqual: isDeepStrictEqual(
        input.expected.nativeInspection,
        input.actual.nativeInspection,
      ),
      currentSourceEqual: isDeepStrictEqual(target, actual.currentSource),
      freshness:
        actual.currentSource.revision.contentFingerprint === actual.context.contentFingerprint
          ? 'CURRENT'
          : 'STALE',
    };
  } catch {
    invalid();
  }
}

// Pure agreement of independently captured images. Only the actual runner can
// prove receipt/input provenance; synthetic records are never Native evidence.
export function comparePhase05PublishedStates(input) {
  try {
    plain(input);
    exact(input, ['expected', 'actual', 'criticalSymbols', 'criticalDirectCalls']);
    const project = (image) => {
      exact(image, ['revision', 'indexed', 'supports', 'coverage', 'nativeBaseline']);
      const revision = WorktreeRevisionSchema.parse(image.revision);
      exact(image.indexed, ['revisionId', 'contentFingerprint']);
      if (
        image.indexed.revisionId !== revision.id ||
        image.indexed.contentFingerprint !== revision.contentFingerprint
      )
        invalid();
      for (const file of image.supports.sourceFiles)
        if (file.repositoryId !== revision.repositoryId || file.revisionId !== revision.id)
          invalid();
      exact(image.coverage, ['observations', 'nativeStates', 'baseline']);
      if (image.coverage.baseline !== 'PRESENT_UNVERIFIED') invalid();
      exact(image.nativeBaseline, ['status', 'state', 'token']);
      if (image.nativeBaseline.status !== 'AVAILABLE') invalid();
      const { state, token } = image.nativeBaseline;
      exact(state, ['expected', 'headerJson', 'summaryDigest', 'files']);
      exact(token, [
        'committedSnapshotCount',
        'indexedRevisionId',
        'indexedContentFingerprint',
        'states',
      ]);
      if (
        !Number.isSafeInteger(token.committedSnapshotCount) ||
        token.committedSnapshotCount < 1 ||
        token.indexedRevisionId !== revision.id ||
        token.indexedContentFingerprint !== revision.contentFingerprint
      )
        invalid();
      const bundle = NativeAnalysisStateBundleV1Schema.parse({
        header: JSON.parse(state.headerJson),
        summaries: state.files.map((file) => {
          exact(file, ['sourceFileId', 'sourcePath', 'contentFingerprint', 'summaryJson']);
          const summary = JSON.parse(file.summaryJson);
          if (
            file.sourceFileId !== summary.sourceFile.id ||
            file.sourcePath !== summary.sourceFile.path ||
            file.contentFingerprint !== summary.sourceFile.contentFingerprint
          )
            invalid();
          return summary;
        }),
      });
      const { schemaVersion, sourceFileCount, summaryDigest, ...context } = bundle.header;
      if (
        !isDeepStrictEqual(state.expected, context) ||
        context.normalizerVersion !== JAVA_NORMALIZER_VERSION ||
        state.summaryDigest !== summaryDigest ||
        context.repositoryId !== revision.repositoryId ||
        context.revisionId !== revision.id ||
        context.contentFingerprint !== revision.contentFingerprint
      )
        invalid();
      const mapping = bindPhase05SourceIdentity(
        bundle.summaries.map((summary) => summary.sourceFile),
        image.supports.sourceFiles,
      );
      if ([...mapping].some(([left, right]) => left !== right)) invalid();
      const active = new Map(
        image.supports.bindings
          .filter((binding) => binding.providerFact.providerId === context.providerId)
          .map((binding) => [
            JSON.stringify([binding.providerFact.factType, binding.providerFact.providerFactId]),
            binding,
          ]),
      );
      const candidates = new Map(
        image.supports.candidates.map((row) => [row.evidenceId, row.candidate]),
      );
      const emitted = new Set();
      for (const summary of bundle.summaries)
        for (const fact of summary.emittedFacts) {
          const key = JSON.stringify([fact.factType, fact.providerFactId]);
          const binding = active.get(key),
            candidate = binding && candidates.get(binding.evidenceId);
          if (
            !candidate ||
            (fact.ownership === 'FILE' &&
              candidate.sourceRange !== null &&
              candidate.sourceRange.sourceFileId !== summary.sourceFile.id)
          )
            invalid();
          emitted.add(key);
        }
      if (emitted.size !== active.size || [...active.keys()].some((key) => !emitted.has(key)))
        invalid();
      // Exactly one selected Native provider is supported by this Java runner.
      // Other providers' supports are still compared by the full closure check.
      if (image.coverage.nativeStates.length !== 1) invalid();
      const pointer = image.coverage.nativeStates[0];
      exact(pointer, ['providerId', 'providerSnapshotId', 'revisionId', 'contentFingerprint']);
      if (
        pointer.providerId !== context.providerId ||
        pointer.revisionId !== revision.id ||
        pointer.contentFingerprint !== revision.contentFingerprint
      )
        invalid();
      const selected = image.supports.snapshots.find(
        (snapshot) => snapshot.id === pointer.providerSnapshotId,
      );
      if (
        !selected ||
        selected.providerId !== context.providerId ||
        selected.providerVersion !== context.providerVersion ||
        selected.requestedRevisionId !== revision.id ||
        selected.requestedRevisionFingerprint !== revision.contentFingerprint ||
        selected.outcome !== 'SUCCEEDED'
      )
        invalid();
      const selectedToken = token.states.filter((row) => row.providerId === context.providerId);
      for (const row of token.states) exact(row, ['providerId', 'snapshotId', 'summaryDigest']);
      if (
        token.states.length !== 1 ||
        selectedToken.length !== 1 ||
        selectedToken[0].snapshotId !== selected.id ||
        selectedToken[0].summaryDigest !== summaryDigest
      )
        invalid();
      if (
        !isDeepStrictEqual(
          selected.capabilities.map((capability) => capability.name).sort(),
          [...context.requestedCapabilities].sort(),
        )
      )
        invalid();
      const snapshots = new Map(
        image.supports.snapshots.map((snapshot) => [snapshot.id, snapshot]),
      );
      const coverage = new Map();
      for (const row of image.coverage.observations) {
        exact(row, ['providerSnapshotId', 'capability', 'sourceFileId', 'coverage']);
        const parent = snapshots.get(row.providerSnapshotId);
        if (
          !parent?.capabilities.some((capability) => capability.name === row.capability) ||
          !['COMPLETE', 'PARTIAL', 'NONE', 'UNKNOWN'].includes(row.coverage)
        )
          invalid();
        if (row.providerSnapshotId !== selected.id) continue;
        const key = JSON.stringify([row.sourceFileId, row.capability]);
        if (coverage.has(key)) invalid();
        coverage.set(key, row.coverage);
      }
      const required = bundle.summaries.flatMap((summary) => summary.coverage);
      if (
        coverage.size !== required.length ||
        required.some(
          (row) =>
            coverage.get(JSON.stringify([row.sourceFileId, row.capability])) !== row.coverage,
        )
      )
        invalid();
      return {
        context,
        summaryDigest,
        coverage: required.map((row) => JSON.stringify(row)).sort(),
        capabilities: selected.capabilities.map((row) => JSON.stringify(row)).sort(),
      };
    };
    const facts = comparePhase05SourceBoundFacts({
      expected: input.expected.supports,
      actual: input.actual.supports,
      criticalSymbols: input.criticalSymbols,
      criticalDirectCalls: input.criticalDirectCalls,
    });
    const support = comparePhase05ActiveSupports({
      expected: input.expected.supports,
      actual: input.actual.supports,
    });
    const expected = project(input.expected),
      actual = project(input.actual);
    if (!isDeepStrictEqual(expected.context, actual.context)) invalid();
    return {
      facts,
      graphEqual: facts.comparison.entries.every(
        (entry) => entry.classification === null && entry.differences.length === 0,
      ),
      ...support,
      coverageEqual:
        isDeepStrictEqual(expected.coverage, actual.coverage) &&
        isDeepStrictEqual(expected.capabilities, actual.capabilities),
      coverageScope: 'SELECTED_NATIVE_R010_SNAPSHOT',
      nativeStateEqual: expected.summaryDigest === actual.summaryDigest,
    };
  } catch {
    invalid();
  }
}
