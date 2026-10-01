import {
  buildMemoryCase,
  memoryCases,
} from '../../../runtime/test/helpers/native-metadata-corpus.mjs';

export const transportMemoryCases = [
  ...memoryCases.filter((name) => name !== 'oversized-sql-column'),
  'large-request',
  'slow-sink',
];
export function transportMemoryValue(name) {
  const value = buildMemoryCase(
    ['large-request', 'slow-sink'].includes(name) ? 'empty-file' : name,
  );
  const {
    repositoryId,
    revisionId,
    contentFingerprint,
    requestedCapabilities,
    schemaVersion: _schema,
    sourceFileCount: _count,
    summaryDigest: _digest,
    ...analysisStateContext
  } = value.header;
  const request = {
    protocolVersion: 3,
    requestId: 'req',
    sequence: 0,
    type: 'ANALYZE',
    payload: {
      irSchemaVersion: 1,
      providerSnapshotId: 'snapshot',
      repository: { id: repositoryId, rootPath: '/calibration' },
      revision: {
        id: revisionId,
        repositoryId,
        kind: 'WORKTREE',
        contentFingerprint,
        baseRevisionId: null,
      },
      sourceFiles: [
        ...new Map(
          value.summaries.map((s) => [s.sourceFile.id, { ...s.sourceFile, repositoryId }]),
        ).values(),
      ],
      requestedCapabilities,
      deadlineEpochMs: null,
      resourceBudget: { maxDurationMs: 60_000, maxMemoryBytes: 1_000_000_000, maxEvents: 10_000 },
      analysisStateContext,
      baselineState: null,
    },
  };
  if (name === 'large-request') {
    request.payload.repository.rootPath = '';
    const completion = {
      protocolVersion: 3,
      requestId: 'req',
      sequence: 1,
      type: 'REQUEST_COMPLETED',
      payload: { summaryRecords: 0, integrityChecksum: '0'.repeat(64) },
    };
    request.payload.repository.rootPath =
      '/' +
      'x'.repeat(
        1_000_000 -
          Buffer.byteLength(JSON.stringify(request)) -
          Buffer.byteLength(JSON.stringify(completion)) -
          3,
      );
  }
  return { value, request };
}
