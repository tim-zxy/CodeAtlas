import process from 'node:process';
import { setImmediate } from 'node:timers/promises';
import type { Writable } from 'node:stream';
import { inspectInstallCapabilities } from '@codeatlas/runtime';

const help = `Read-only installed resource admission diagnostics.
codeatlas doctor --memory-budget-bytes <positive-safe-decimal-integer>
No default budget, Native probe, installation, repair or configuration change.
Native binary is NOT_PROBED. Exit 0 means the report was written, not qualified
installation, protocol compatibility or execution permission. Refused checks are
reported as data. Use explicit index/status commands for persisted repository state.
`;

async function write(stream: Writable, text: string): Promise<void> {
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

export async function runDoctorCommand(
  args: readonly string[],
  io: { stdout: Writable; stderr: Writable } = { stdout: process.stdout, stderr: process.stderr },
): Promise<number> {
  const report = async (code: string, exit: number) => {
    try {
      await write(io.stderr, JSON.stringify({ code, message: code }) + '\n');
    } catch {
      return 1;
    }
    return exit;
  };
  if (args.length === 2 && args[0] === 'doctor' && args[1] === '--help') {
    try {
      await write(io.stdout, help);
      return 0;
    } catch {
      return report('INSTALL_INSPECTION_FAILED', 1);
    }
  }
  const value = args[2];
  if (
    args.length !== 3 ||
    args[0] !== 'doctor' ||
    args[1] !== '--memory-budget-bytes' ||
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  )
    return report('INVALID_INSTALL_INSPECTION_INPUT', 2);
  let result;
  try {
    result = inspectInstallCapabilities({ memoryBudgetBytes: Number(value) });
  } catch (error) {
    const changed =
      error instanceof Error &&
      Object.getOwnPropertyDescriptor(error, 'message')?.value === 'INSTALL_INSPECTION_CHANGED';
    return report(changed ? 'INSTALL_INSPECTION_CHANGED' : 'INSTALL_INSPECTION_FAILED', 1);
  }
  try {
    await write(io.stdout, JSON.stringify(result) + '\n');
    return 0;
  } catch {
    return report('INSTALL_INSPECTION_FAILED', 1);
  }
}
