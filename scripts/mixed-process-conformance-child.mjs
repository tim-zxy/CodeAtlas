import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
const mode = process.argv[2];
if (mode === 'child-short') process.stdout.write('DONE');
else if (mode === 'child-wait') process.stdin.resume();
else if (mode === 'FINAL_QUERY_FAILURE')
  process.stdout.write(
    JSON.stringify({
      pid: process.pid,
      childPid: null,
      childExitCode: null,
      childSignal: null,
      childClosed: false,
      outcome: 'DONE',
      childStdout: '',
    }),
  );
else if (['SHORT_DESCENDANT', 'CANCEL_DESCENDANT'].includes(mode)) {
  const cancel = mode === 'CANCEL_DESCENDANT' ? once(process.stdin, 'data') : null;
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), mode === 'SHORT_DESCENDANT' ? 'child-short' : 'child-wait'],
    { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: process.env },
  );
  let output = '',
    stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (x) => {
    output += x;
    if (output.length > 4) child.kill();
  });
  child.stderr.on('data', (x) => {
    stderr += x;
    if (stderr.length > 0) child.kill();
  });
  const closed = once(child, 'close');
  await once(child, 'spawn');
  if (cancel) {
    const [bytes] = await cancel;
    if (bytes.toString() !== 'cancel\n') throw Error('INVALID_CANCEL');
    child.kill();
    process.stdin.destroy();
  }
  const [code, signal] = await closed;
  if (stderr) throw Error('HELPER_STDERR');
  process.stdout.write(
    JSON.stringify({
      pid: process.pid,
      childPid: child.pid,
      childExitCode: code,
      childSignal: signal,
      childClosed: true,
      outcome: cancel ? 'CANCELLED' : 'DONE',
      childStdout: output,
    }),
  );
} else throw Error('INVALID_MODE');
