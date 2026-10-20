import process from 'node:process';
import { setImmediate } from 'node:timers/promises';
import type { Writable } from 'node:stream';

import { CodeQueryError, parseCodeQueryRequest, runCodeQuery } from '@codeatlas/runtime';

const help = `Read an existing repository Canonical graph; never implicitly index or migrate.
codeatlas understand --database <path> --repository <id> (--symbol <id> | --name <literal> [--match exact|prefix]) <budgets>
codeatlas trace --database <path> --repository <id> --symbol <id> --max-depth <n> <budgets>
Required budgets: --max-nodes --max-edges --max-metadata-rows --max-result-bytes --timeout-ms
Supply a positive safe decimal integer for each budget; max-depth permits zero.
Results are JSON code facts/CODE_TRACE, not execution order or semantic flows.
Freshness compares persisted source only; current worktree is not observed.
Coverage describes supporting snapshots, not complete repository coverage.
Timeout/cancellation are cooperative between synchronous SQLite operations.
`;

function parse(args: string[]) {
  const command = args[0];
  if (command !== 'understand' && command !== 'trace') throw new CodeQueryError('INVALID_QUERY');
  const values = new Map<string, string>();
  const flags = [
    '--database',
    '--repository',
    '--symbol',
    '--name',
    '--match',
    '--max-depth',
    '--max-nodes',
    '--max-edges',
    '--max-metadata-rows',
    '--max-result-bytes',
    '--timeout-ms',
  ];
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index]!;
    const value = args[index + 1];
    if (!flags.includes(flag) || values.has(flag) || value === undefined || value.startsWith('--'))
      throw new CodeQueryError('INVALID_QUERY');
    values.set(flag, value);
  }
  const required = (flag: string) => {
    const value = values.get(flag);
    if (value === undefined) throw new CodeQueryError('INVALID_QUERY');
    return value;
  };
  const numeric = (flag: string) => {
    const value = required(flag);
    if (!/^(0|[1-9]\d*)$/.test(value)) throw new CodeQueryError('INVALID_QUERY');
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw new CodeQueryError('INVALID_QUERY');
    return parsed;
  };
  if (
    values.has('--symbol') === values.has('--name') ||
    (command === 'trace' && values.has('--name')) ||
    (values.has('--match') && !values.has('--name')) ||
    (command === 'understand' && values.has('--max-depth'))
  )
    throw new CodeQueryError('INVALID_QUERY');
  const budget = {
    maxNodes: numeric('--max-nodes'),
    maxEdges: numeric('--max-edges'),
    maxMetadataRows: numeric('--max-metadata-rows'),
    maxResultBytes: numeric('--max-result-bytes'),
    timeoutMs: numeric('--timeout-ms'),
  };
  const common = { repositoryId: required('--repository'), budget };
  const query = parseCodeQueryRequest(
    command === 'trace'
      ? {
          ...common,
          operation: 'CODE_TRACE',
          symbolId: required('--symbol'),
          maxDepth: numeric('--max-depth'),
        }
      : values.has('--name')
        ? {
            ...common,
            operation: 'SEARCH',
            name: required('--name'),
            match: values.get('--match') ?? 'exact',
          }
        : { ...common, operation: 'UNDERSTAND', symbolId: required('--symbol') },
  );
  return { databasePath: required('--database'), query };
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
    // Writable may emit error after invoking its write callback.
    await setImmediate();
    stream.removeListener('error', onError);
  }
}
async function report(error: unknown): Promise<number> {
  const safe = error instanceof CodeQueryError ? error : new CodeQueryError('QUERY_DATA_INVALID');
  try {
    await write(process.stderr, JSON.stringify({ code: safe.code, message: safe.message }) + '\n');
  } catch {
    return 1;
  }
  return safe.code === 'QUERY_CANCELLED' ? 130 : 1;
}
export async function runCodeQueryCommand(args: string[]): Promise<number> {
  if (
    (args.length === 1 && args[0] === '--help') ||
    (args.length === 2 && ['understand', 'trace'].includes(args[0]!) && args[1] === '--help')
  ) {
    try {
      await write(process.stdout, help);
      return 0;
    } catch (error) {
      return report(error);
    }
  }
  let input;
  try {
    input = parse(args);
  } catch {
    try {
      await write(
        process.stderr,
        JSON.stringify({
          code: 'INVALID_QUERY',
          message: new CodeQueryError('INVALID_QUERY').message,
        }) + '\n',
      );
    } catch {
      return 1;
    }
    return 2;
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on('SIGINT', cancel);
  try {
    const result = await runCodeQuery(input, { signal: controller.signal });
    await write(process.stdout, JSON.stringify(result) + '\n');
    return 0;
  } catch (error) {
    return report(error);
  } finally {
    process.removeListener('SIGINT', cancel);
  }
}
