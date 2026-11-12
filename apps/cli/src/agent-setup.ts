import process from 'node:process';
import { Readable, addAbortSignal, type Writable } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { parse } from 'smol-toml';
import { planAgentSetup } from '@codeatlas/runtime';

const help = `Codex configuration preview from explicit stdin JSON only.
codeatlas setup --dry-run --max-request-bytes <N> --input-timeout-ms <N>
JSON fields: client=CODEX, configToml(string or null), nodeExecutable,
mcpEntryPath, workspaceRoot, maxConfigBytes, maxPlanBytes. Paths are literal
preview values, never opened or executed. No config discovery/read/write,
apply, install, server launch or execution grant. Feed EOF to finish input.
Exit 0 means the preview was written, including conflict/snippet-only status.
`;
async function write(stream: Writable, text: string) {
  let onError: (error: Error) => void = () => {};
  try {
    await new Promise<void>((resolve, reject) => {
      onError = reject;
      stream.once('error', onError);
      stream.write(text, 'utf8', (error) => (error ? reject(error) : resolve()));
    });
  } finally {
    await setImmediate();
    stream.removeListener('error', onError);
  }
}
export async function runAgentSetupCommand(
  args: readonly string[],
  io: { stdin: Readable; stdout: Writable; stderr: Writable } = {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  },
): Promise<number> {
  const report = async (code: string, exit: number) => {
    try {
      await write(io.stderr, JSON.stringify({ code }) + '\n');
    } catch {
      return 1;
    }
    return exit;
  };
  if (args.length === 2 && args[0] === 'setup' && args[1] === '--help') {
    try {
      await write(io.stdout, help);
      return 0;
    } catch {
      return report('SETUP_PREVIEW_OUTPUT_FAILED', 1);
    }
  }
  let maximum: number, timeout: number;
  try {
    if (args[0] !== 'setup' || args.filter((v) => v === '--dry-run').length !== 1) throw Error();
    const values = new Map<string, string>();
    for (let i = 1; i < args.length; i++) {
      const key = args[i]!;
      if (key === '--dry-run') continue;
      const value = args[++i];
      if (
        !['--max-request-bytes', '--input-timeout-ms'].includes(key) ||
        values.has(key) ||
        !value ||
        !/^[1-9]\d*$/.test(value) ||
        !Number.isSafeInteger(Number(value))
      )
        throw Error();
      values.set(key, value);
    }
    if (values.size !== 2) throw Error();
    maximum = Number(values.get('--max-request-bytes'));
    timeout = Number(values.get('--input-timeout-ms'));
    if (timeout > 2147483647) throw Error();
  } catch {
    return report('INVALID_SETUP_PREVIEW_ARGUMENTS', 2);
  }
  let plan;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    addAbortSignal(controller.signal, io.stdin);
    timer = setTimeout(() => controller.abort(), timeout);
    for await (const chunk of io.stdin) {
      const owned = Buffer.from(chunk);
      bytes += owned.length;
      if (bytes > maximum) throw Error('SETUP_PREVIEW_INPUT_LIMIT');
      chunks.push(owned);
    }
    clearTimeout(timer);
    const input = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes)),
    );
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).sort().join('\0') !==
        [
          'client',
          'configToml',
          'maxConfigBytes',
          'maxPlanBytes',
          'mcpEntryPath',
          'nodeExecutable',
          'workspaceRoot',
        ].join('\0')
    )
      throw Error();
    const { configToml, ...request } = input;
    if (configToml !== null && (typeof configToml !== 'string' || !configToml.isWellFormed()))
      throw Error();
    plan = planAgentSetup(
      { ...request, configBytes: configToml === null ? null : Buffer.from(configToml, 'utf8') },
      { parseToml: parse },
    );
  } catch {
    return report(
      controller.signal.aborted ? 'SETUP_PREVIEW_INPUT_TIMEOUT' : 'INVALID_SETUP_PREVIEW_INPUT',
      controller.signal.aborted ? 1 : 2,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
  try {
    await write(io.stdout, JSON.stringify(plan) + '\n');
    return 0;
  } catch {
    return report('SETUP_PREVIEW_OUTPUT_FAILED', 1);
  }
}
