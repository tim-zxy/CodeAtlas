import { open, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { setImmediate } from 'node:timers/promises';
import type { Writable } from 'node:stream';
import { initializeWorkspace, WorkspaceInitError } from '@codeatlas/runtime';

const help = `Explicit workspace metadata initialization; no scan, Git, Native or model.
codeatlas init --root <path> --configuration <ConfigurationSources JSON file> --max-config-bytes <positive-safe-integer> [--repository <path> ...]
ConfigurationSources contains explicit defaults, maxInputBytes and optional YAML layers.
Creates a new .ekp only. Complete matching workspaces are readonly; interrupted or
conflicting directories are preserved and refused. No overwrite, resume or implicit index.
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
export async function runInitCommand(
  args: readonly string[],
  io: { stdout: Writable; stderr: Writable } = { stdout: process.stdout, stderr: process.stderr },
): Promise<number> {
  const report = async (error: WorkspaceInitError, exit: number) => {
    try {
      await write(
        io.stderr,
        JSON.stringify({
          code: error.code,
          directoryCreated: error.directoryCreated,
          initializationEffect: error.initializationEffect,
          cleanupState: error.cleanupState,
        }) + '\n',
      );
    } catch {
      return 1;
    }
    return exit;
  };
  if (args.length === 2 && args[0] === 'init' && args[1] === '--help') {
    try {
      await write(io.stdout, help);
      return 0;
    } catch {
      return report(new WorkspaceInitError('INIT_OUTPUT_FAILED'), 1);
    }
  }
  let result;
  try {
    if (args[0] !== 'init') throw Error();
    const values = new Map<string, string>(),
      repositories: string[] = [];
    for (let i = 1; i < args.length; i++) {
      const key = args[i]!,
        value = args[++i];
      if (value === undefined || !value.length || value.trim() !== value || value.startsWith('--'))
        throw Error();
      if (key === '--repository') {
        repositories.push(path.resolve(value));
        continue;
      }
      if (!['--root', '--configuration', '--max-config-bytes'].includes(key) || values.has(key))
        throw Error();
      values.set(key, value);
    }
    if (values.size !== 3) throw Error();
    const number = values.get('--max-config-bytes')!;
    if (!/^[1-9]\d*$/.test(number) || !Number.isSafeInteger(Number(number))) throw Error();
    const maximum = Number(number),
      filename = path.resolve(values.get('--configuration')!);
    if ((await realpath(filename)) !== filename) throw Error();
    const before = await lstat(filename, { bigint: true });
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1n ||
      before.size > BigInt(maximum)
    )
      throw Error();
    const file = await open(filename, 'r');
    let text: string;
    try {
      const own = await file.stat({ bigint: true });
      if (own.dev !== before.dev || own.ino !== before.ino) throw Error();
      const bytes = Buffer.alloc(Number(before.size) + 1);
      let used = 0;
      while (used < bytes.length) {
        const r = await file.read(bytes, used, bytes.length - used, null);
        if (!r.bytesRead) break;
        used += r.bytesRead;
      }
      const after = await file.stat({ bigint: true }),
        named = await lstat(filename, { bigint: true });
      if (
        BigInt(used) !== before.size ||
        after.size !== before.size ||
        after.mtimeNs !== before.mtimeNs ||
        after.ctimeNs !== before.ctimeNs ||
        named.dev !== before.dev ||
        named.ino !== before.ino ||
        named.mtimeNs !== before.mtimeNs
      )
        throw Error();
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, used));
    } finally {
      try {
        await file.close();
        if (file.fd !== -1) throw Error();
      } catch {
        throw new WorkspaceInitError('INIT_CONFIG_CLOSE_FAILED', false, 'NOT_COMMITTED', 'UNKNOWN');
      }
    }
    result = await initializeWorkspace({
      workspaceRoot: path.resolve(values.get('--root')!),
      repositories,
      configuration: JSON.parse(text),
    });
  } catch (error) {
    return report(
      error instanceof WorkspaceInitError ? error : new WorkspaceInitError('INIT_INPUT_INVALID'),
      error instanceof WorkspaceInitError ? 1 : 2,
    );
  }
  try {
    await write(io.stdout, JSON.stringify(result) + '\n');
    return 0;
  } catch {
    return report(
      new WorkspaceInitError(
        'INIT_OUTPUT_FAILED',
        result.outcome === 'CREATED',
        result.initializationEffect === 'COMMITTED' ? 'COMMITTED' : 'NOT_COMMITTED',
      ),
      1,
    );
  }
}
