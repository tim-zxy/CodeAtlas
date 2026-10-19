import { createHash, randomUUID } from 'node:crypto';
import { availableParallelism } from 'node:os';
import {
  CodeQueryError,
  createQueryControl,
  executeIndexWrite,
  IndexCommandError,
  parseIndexRequest,
  parseIndexResult,
  type IndexReadBudget,
  type IndexStatusRequest,
  type IndexWriteRequest,
  type IndexWriteResult,
  type IndexStatusResult,
} from '../../application/dist/index.js';
import {
  executeNativeRequest,
  NativeAnalyzerDescriptorSchema,
  NativeStateValidationError,
  NativeClientError,
  JAVA_NORMALIZER_VERSION,
  type NativeClientOptions,
  type NativeFullAnalyzeRequestV3,
} from '../../providers/dist/index.js';
import {
  openRepositoryIndexSession,
  StorageIndexSessionError,
  AnalysisPatchError,
  type RepositoryIndexSession,
} from '../../storage/dist/index.js';
import {
  assertNativeMetadataAdmission,
  assertNativeRefreshTransportAdmission,
} from './native-metadata-admission.js';
import { resolveNativeWorkerConfig, nativeLaunchArguments } from './native-worker-config.js';
import { applyNativeFullBootstrap } from './native-full-bootstrap.js';
import { applyNativeRefreshAnalysisV3 } from './native-refresh-composition.js';

function control(budget: IndexReadBudget, signal?: AbortSignal) {
  const inner = createQueryControl(
    { ...budget, maxNodes: budget.maxMetadataRows, maxEdges: budget.maxMetadataRows },
    signal,
  );
  const refuse = (error: unknown): never => {
    if (error instanceof CodeQueryError) {
      if (error.code === 'QUERY_CANCELLED') throw new StorageIndexSessionError('CANCELLED');
      if (error.code === 'QUERY_TIMEOUT' || error.code === 'QUERY_BUDGET_EXCEEDED')
        throw new StorageIndexSessionError('RESOURCE_LIMIT_EXCEEDED');
    }
    throw error;
  };
  return {
    async checkpoint() {
      try {
        await inner.checkpoint();
      } catch (error) {
        refuse(error);
      }
    },
    reserveText(bytes: number) {
      try {
        inner.reserveText(bytes);
      } catch (error) {
        refuse(error);
      }
    },
    chargeMetadataRow() {
      try {
        inner.chargeMetadataRow();
      } catch (error) {
        refuse(error);
      }
    },
  };
}
function converted(error: unknown): IndexCommandError {
  if (error instanceof IndexCommandError) return error;
  if (error instanceof StorageIndexSessionError) return new IndexCommandError(error.code);
  if (error instanceof NativeStateValidationError)
    return new IndexCommandError(
      error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED'
        ? 'RESOURCE_LIMIT_EXCEEDED'
        : 'INDEX_DATA_INVALID',
    );
  if (error instanceof AnalysisPatchError && error.code === 'FULL_ANALYSIS_REQUIRED')
    return new IndexCommandError('FULL_ANALYSIS_REQUIRED');
  if (error instanceof NativeClientError) {
    if (error.code === 'CANCELLED') return new IndexCommandError('CANCELLED');
    if (error.code === 'OUTPUT_LIMIT_EXCEEDED')
      return new IndexCommandError('RESOURCE_LIMIT_EXCEEDED');
  }
  return new IndexCommandError('ANALYSIS_FAILED');
}

export async function runIndexCommand(
  input: IndexWriteRequest | IndexStatusRequest,
  options: { signal?: AbortSignal } = {},
): Promise<IndexWriteResult | IndexStatusResult> {
  const noWrite = {
    databaseInitialized: false,
    sourceReconciled: false,
    graphCommit: 'NOT_ATTEMPTED' as const,
  };
  let request;
  try {
    request = parseIndexRequest(input);
  } catch (error) {
    throw new IndexCommandError(converted(error).code, noWrite);
  }
  if (options.signal?.aborted)
    throw new IndexCommandError('CANCELLED', {
      databaseInitialized: false,
      sourceReconciled: false,
      graphCommit: 'NOT_ATTEMPTED',
    });
  let session: RepositoryIndexSession | undefined;
  let sourceWorkflowStarted = false;
  try {
    if (request.operation === 'STATUS') {
      session = await openRepositoryIndexSession(
        {
          databasePath: request.databasePath,
          repositoryId: request.repositoryId,
          initialize: false,
          readOnly: true,
        },
        control(request.budget, options.signal),
      );
      const result = parseIndexResult({
        schemaVersion: 1,
        kind: 'INDEX_STATUS',
        status: await session.readStatus(),
      });
      if (Buffer.byteLength(JSON.stringify(result), 'utf8') > request.budget.maxResultBytes)
        throw new IndexCommandError('RESOURCE_LIMIT_EXCEEDED');
      return result;
    }
    try {
      if (request.operation === 'FULL')
        assertNativeMetadataAdmission(
          request.configuration.resourceBudget.maxMemoryBytes,
          'FULL_TRANSPORT',
        );
      else
        assertNativeRefreshTransportAdmission(request.configuration.resourceBudget.maxMemoryBytes);
    } catch (error) {
      throw new IndexCommandError(converted(error).code, {
        databaseInitialized: false,
        sourceReconciled: false,
        graphCommit: 'NOT_ATTEMPTED',
      });
    }
    const config = request.configuration;
    const effective = resolveNativeWorkerConfig(
      config,
      config.resourceBudget,
      availableParallelism(),
      16 * 1024 * 1024,
    );
    const launch: NativeClientOptions = {
      executablePath: request.nativeExecutablePath,
      timeoutMs: config.resourceBudget.maxDurationMs,
      arguments: nativeLaunchArguments(effective),
      limits: config.transportLimits,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      allowedEnvironment: Object.fromEntries(
        ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
          .filter((key) => process.env[key] !== undefined)
          .map((key) => [key, process.env[key]!]),
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
      throw new IndexCommandError('UNSUPPORTED_NATIVE');
    const descriptor = NativeAnalyzerDescriptorSchema.parse(handshake.terminal.payload);
    const language = descriptor.languages.find((value) => value.languageId === 'java');
    const requestedCapabilities = ['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'];
    if (
      !language ||
      !descriptor.protocolVersions.includes(3) ||
      !descriptor.irSchemaVersions.includes(1) ||
      requestedCapabilities.some((name) => !descriptor.capabilities.includes(name))
    )
      throw new IndexCommandError('UNSUPPORTED_NATIVE');
    // SHA-256 produces the existing fingerprint form by construction, not from
    // an unchecked external scalar. Production request preflight still validates it.
    const policyFingerprint = ('sha256:' +
      createHash('sha256')
        .update(JSON.stringify(config.source))
        .digest(
          'hex',
        )) as NativeFullAnalyzeRequestV3['payload']['analysisStateContext']['policyFingerprint'];
    const context = {
      providerId: descriptor.providerId,
      providerVersion: descriptor.providerVersion,
      language,
      resolverVersion: '1',
      normalizerVersion: JAVA_NORMALIZER_VERSION,
      policyFingerprint,
    };
    const readControl = control(
      {
        maxMetadataRows: config.resourceBudget.maxEvents,
        maxResultBytes: config.transportLimits.maxStdoutBytes,
        timeoutMs: config.resourceBudget.maxDurationMs,
      },
      options.signal,
    );
    const openSession = (root: string) =>
      openRepositoryIndexSession(
        {
          databasePath: request.databasePath,
          repositoryId: request.repositoryId,
          repositoryRoot: root,
          initialize: request.initialize,
          readOnly: false,
        },
        readControl,
      );
    sourceWorkflowStarted = true;
    return await executeIndexWrite(
      request,
      {
        async captureSourceBase() {
          if (request.initialize) return null;
          session = await openSession(request.repositoryRoot);
          session.database.exec('BEGIN');
          try {
            return session.sourceState.load(request.repositoryId);
          } finally {
            if (session.database.isTransaction) session.database.exec('ROLLBACK');
          }
        },
        async withRepository(root, action) {
          session ??= await openSession(root);
          const owned = session;
          return action({
            initialized: owned.initialized,
            sourceState: owned.sourceState,
            readStatus: owned.readStatus,
            async analyze(state) {
              const trustedContext = {
                ...context,
                repositoryId: request.repositoryId,
                revisionId: state.revision.id,
                contentFingerprint: state.revision.contentFingerprint,
                requestedCapabilities,
              };
              // Standard-library UUID is a valid opaque ID by construction; all request
              // data still passes the production preflight, no unchecked caller cast.
              const providerSnapshotId =
                randomUUID() as NativeFullAnalyzeRequestV3['payload']['providerSnapshotId'];
              const common = {
                irSchemaVersion: 1 as const,
                providerSnapshotId,
                repository: { id: request.repositoryId, rootPath: root },
                requestedCapabilities,
                deadlineEpochMs: null,
                resourceBudget: config.resourceBudget,
                analysisStateContext: context,
              };
              try {
                const measurement =
                  request.operation === 'FULL'
                    ? await applyNativeFullBootstrap(
                        owned.database,
                        {
                          protocolVersion: 3,
                          requestId: randomUUID(),
                          sequence: 0,
                          type: 'ANALYZE',
                          payload: {
                            ...common,
                            revision: state.revision,
                            sourceFiles: [...state.files],
                            baselineState: null,
                          },
                        },
                        launch,
                        descriptor,
                        trustedContext,
                      )
                    : await applyNativeRefreshAnalysisV3(
                        owned.database,
                        config.resourceBudget.maxMemoryBytes,
                        () => ({
                          requestId: randomUUID(),
                          descriptor,
                          trustedContext,
                          payload: { ...common, targetRevision: state.revision },
                        }),
                        launch,
                      );
                const mergeMs = 'mergeMs' in measurement ? (measurement.mergeMs as number) : null;
                return {
                  timings: {
                    scanMs: null,
                    transportMs: measurement.transportMs,
                    normalizeMs: measurement.normalizeMs,
                    mergeMs,
                    dbApplyMs: measurement.dbApplyMs,
                    dbLockMs: measurement.dbLockMs,
                    totalMs: measurement.totalMs,
                    unavailableReasons: {
                      scanMs: 'Application owns observation',
                      ...(mergeMs === null ? { mergeMs: 'Included in normalize timing' } : {}),
                    },
                  },
                  workers: {
                    requested: effective.requested,
                    effectiveCount: effective.effectiveCount,
                  },
                };
              } catch (error) {
                throw converted(error);
              }
            },
          });
        },
      },
      options.signal,
    );
  } catch (error) {
    const safe = converted(error);
    throw sourceWorkflowStarted ? safe : new IndexCommandError(safe.code, noWrite);
  } finally {
    session?.close();
  }
}

export {
  IndexCommandError,
  parseIndexRequest,
  parseIndexConfiguration,
  parseIndexResult,
} from '../../application/dist/index.js';
export type {
  IndexWriteRequest,
  IndexStatusRequest,
  IndexReadBudget,
  IndexConfigurationV1,
  IndexWriteResult,
  IndexStatusResult,
} from '../../application/dist/index.js';
