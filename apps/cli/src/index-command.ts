import { readFile } from 'node:fs/promises';
import process from 'node:process';
import type { Writable } from 'node:stream';
import { setImmediate } from 'node:timers/promises';

import {
  IndexCommandError,
  parseIndexConfiguration,
  parseIndexRequest,
  runIndexCommand,
} from '@codeatlas/runtime';

const help = `Explicit repository indexing; no implicit indexing from knowledge queries.
codeatlas index full --database <path> --repository <id> --root <path> --native <path> --config <path> [--initialize]
codeatlas index incremental --database <path> --repository <id> --root <path> --native <path> --config <path>
codeatlas index status --database <path> --repository <id> --max-metadata-rows <n> --max-result-bytes <n> --timeout-ms <n>
All budgets are explicit positive safe decimal integers; writes require a versioned JSON configuration.
Native memory admission remains required; initialize is full-only and never overwrites a database.
Status reads persisted metadata only: worktree NOT_OBSERVED, baseline PRESENT_UNVERIFIED is not refresh admission.
`;

async function parse(args: readonly string[]) {
  const mode = args[1];
  const invalid = () =>
    new IndexCommandError('INVALID_REQUEST', {
      databaseInitialized: false,
      sourceReconciled: false,
      graphCommit: 'NOT_ATTEMPTED',
    });
  if (args[0] !== 'index' || !['full', 'incremental', 'status'].includes(mode ?? ''))
    throw invalid();
  const flags =
    mode === 'status'
      ? ['--database', '--repository', '--max-metadata-rows', '--max-result-bytes', '--timeout-ms']
      : ['--database', '--repository', '--root', '--native', '--config'];
  const values = new Map<string, string>();
  let initialize = false;
  for (let index = 2; index < args.length; index++) {
    const flag = args[index]!;
    if (flag === '--initialize') {
      if (mode !== 'full' || initialize) throw invalid();
      initialize = true;
      continue;
    }
    const value = args[++index];
    if (!flags.includes(flag) || values.has(flag) || value === undefined || value.startsWith('--'))
      throw invalid();
    values.set(flag, value);
  }
  const required = (flag: string) => {
    const value = values.get(flag);
    if (value === undefined) throw invalid();
    return value;
  };
  // Validate the entire flag shape before reading configuration or touching storage.
  for (const flag of flags) required(flag);
  const common = {
    schemaVersion: 1,
    databasePath: required('--database'),
    repositoryId: required('--repository'),
  };
  if (mode === 'status') {
    const numeric = (flag: string) => {
      const value = required(flag);
      if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw invalid();
      return Number(value);
    };
    return parseIndexRequest({
      ...common,
      operation: 'STATUS',
      budget: {
        maxMetadataRows: numeric('--max-metadata-rows'),
        maxResultBytes: numeric('--max-result-bytes'),
        timeoutMs: numeric('--timeout-ms'),
      },
    });
  }
  let configuration;
  try {
    configuration = parseIndexConfiguration(
      JSON.parse(await readFile(required('--config'), 'utf8')),
    );
  } catch {
    throw new IndexCommandError('INVALID_CONFIGURATION', invalid().effects);
  }
  return parseIndexRequest({
    ...common,
    operation: mode === 'full' ? 'FULL' : 'INCREMENTAL',
    repositoryRoot: required('--root'),
    nativeExecutablePath: required('--native'),
    initialize,
    configuration,
  });
}

async function write(stream: Writable, text: string): Promise<void> {
  let onError: (error: Error) => void = () => {};
  try {
    await new Promise<void>((resolve, reject) => {
      onError = reject;
      stream.once('error', onError);
      stream.write(text, 'utf8', (error) => (error ? reject(error) : resolve()));
    });
  } finally {
    // A Writable error event may follow its write callback.
    await setImmediate();
    stream.removeListener('error', onError);
  }
}

export async function runIndexCommandLine(
  args: readonly string[],
  io: { stdout: Writable; stderr: Writable } = { stdout: process.stdout, stderr: process.stderr },
): Promise<number> {
  const report = async (error: IndexCommandError, exit: number) => {
    try {
      await write(
        io.stderr,
        JSON.stringify({ code: error.code, message: error.message, effects: error.effects }) + '\n',
      );
    } catch {
      return 1;
    }
    return exit;
  };
  if (
    (args.length === 2 && args[1] === '--help') ||
    (args.length === 3 &&
      ['full', 'incremental', 'status'].includes(args[1]!) &&
      args[2] === '--help')
  ) {
    try {
      await write(io.stdout, help);
      return 0;
    } catch {
      return report(
        new IndexCommandError('INDEX_DATA_INVALID', {
          databaseInitialized: false,
          sourceReconciled: false,
          graphCommit: 'NOT_ATTEMPTED',
        }),
        1,
      );
    }
  }
  let input;
  try {
    input = await parse(args);
  } catch (error) {
    return report(
      error instanceof IndexCommandError ? error : new IndexCommandError('INVALID_REQUEST'),
      2,
    );
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on('SIGINT', cancel);
  try {
    const result = await runIndexCommand(input, { signal: controller.signal });
    try {
      await write(io.stdout, JSON.stringify(result) + '\n');
    } catch {
      return report(
        new IndexCommandError(
          'INDEX_DATA_INVALID',
          result.kind === 'INDEX_OPERATION'
            ? {
                databaseInitialized: result.databaseInitialized,
                sourceReconciled: true,
                graphCommit: 'COMMITTED',
              }
            : { databaseInitialized: false, sourceReconciled: false, graphCommit: 'NOT_ATTEMPTED' },
        ),
        1,
      );
    }
    return 0;
  } catch (error) {
    const safe =
      error instanceof IndexCommandError ? error : new IndexCommandError('ANALYSIS_FAILED');
    return report(safe, safe.code === 'CANCELLED' ? 130 : 1);
  } finally {
    process.removeListener('SIGINT', cancel);
  }
}
