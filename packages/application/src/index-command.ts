import { realpath } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { observeGitWorktree } from '@codeatlas/source';
import { RepositoryRootPathSchema, type RepositoryRootPath } from '@codeatlas/ir';
import {
  IndexCommandError,
  parseIndexRequest,
  parseIndexResult,
  type IndexEffects,
  type IndexStageTimings,
  type IndexStatusView,
  type IndexWriteRequest,
  type IndexWriteResult,
} from './index-command-contract.js';
import {
  reconcileObservedGitWorktree,
  type SourceStatePort,
  type StoredWorktreeState,
} from './reconcile-worktree.js';

export interface IndexRepositoryPort {
  readonly initialized: boolean;
  readonly sourceState: SourceStatePort;
  analyze(state: StoredWorktreeState): Promise<{
    timings: IndexStageTimings;
    workers: { requested: 'AUTO' | number; effectiveCount: number };
  }>;
  readStatus(): Promise<IndexStatusView>;
}
export interface IndexWritePorts {
  captureSourceBase(): Promise<StoredWorktreeState | null>;
  withRepository(
    observedRoot: RepositoryRootPath,
    action: (repository: IndexRepositoryPort) => Promise<IndexWriteResult>,
  ): Promise<IndexWriteResult>;
}

export async function executeIndexWrite(
  requestValue: IndexWriteRequest,
  ports: IndexWritePorts,
  signal?: AbortSignal,
): Promise<IndexWriteResult> {
  const request = parseIndexRequest(requestValue);
  if (request.operation === 'STATUS') throw new IndexCommandError('INVALID_REQUEST');
  const started = performance.now();
  const effects: IndexEffects = {
    databaseInitialized: null,
    sourceReconciled: false,
    graphCommit: 'NOT_ATTEMPTED',
  };
  let phase: 'SOURCE' | 'ANALYSIS' | 'RESULT' = 'SOURCE';
  const checkpoint = () => {
    if (signal?.aborted) throw new IndexCommandError('CANCELLED');
  };
  try {
    checkpoint();
    const previous = await ports.captureSourceBase();
    checkpoint();
    const root = RepositoryRootPathSchema.parse(await realpath(request.repositoryRoot));
    const scanStarted = performance.now();
    const observation = await observeGitWorktree({
      repositoryId: request.repositoryId,
      startingPath: root,
      workspaceRoot: root,
      config: request.configuration.source,
    });
    const scanMs = performance.now() - scanStarted;
    checkpoint();
    if ((await realpath(observation.rootPath)) !== root)
      throw new IndexCommandError('REPOSITORY_MISMATCH');
    return await ports.withRepository(root, async (repository) => {
      effects.databaseInitialized = repository.initialized;
      checkpoint();
      let target: StoredWorktreeState | null = null;
      reconcileObservedGitWorktree(
        observation,
        {
          load: (id) => repository.sourceState.load(id),
          findCommitRevisionId: (id, commit) =>
            repository.sourceState.findCommitRevisionId(id, commit),
          replace(expected, next) {
            repository.sourceState.replace(expected, next);
            target = next;
          },
        },
        previous,
      );
      effects.sourceReconciled = true;
      checkpoint();
      if (target === null) throw new IndexCommandError('INDEX_DATA_INVALID');
      phase = 'ANALYSIS';
      effects.graphCommit = 'UNKNOWN';
      const receipt = await repository.analyze(target);
      effects.graphCommit = 'COMMITTED';
      phase = 'RESULT';
      const status = await repository.readStatus();
      if (status.source?.repositoryId !== request.repositoryId)
        throw new IndexCommandError('INDEX_DATA_INVALID');
      const reasons = { ...receipt.timings.unavailableReasons };
      delete reasons.scanMs;
      const result = parseIndexResult({
        schemaVersion: 1,
        kind: 'INDEX_OPERATION',
        operation: request.operation,
        outcome: 'SUCCEEDED',
        databaseInitialized: repository.initialized,
        sourceReconciled: true,
        graphCommitted: true,
        status,
        workers: receipt.workers,
        timings: {
          ...receipt.timings,
          scanMs,
          totalMs: performance.now() - started,
          unavailableReasons: reasons,
        },
      });
      if (result.kind !== 'INDEX_OPERATION') throw new IndexCommandError('INDEX_DATA_INVALID');
      return result;
    });
  } catch (error) {
    if (error instanceof IndexCommandError) throw new IndexCommandError(error.code, effects);
    throw new IndexCommandError(
      phase === 'SOURCE'
        ? 'SOURCE_FAILED'
        : phase === 'ANALYSIS'
          ? 'ANALYSIS_FAILED'
          : 'INDEX_DATA_INVALID',
      effects,
    );
  }
}
