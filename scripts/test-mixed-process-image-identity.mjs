import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter, once } from 'node:events';
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test(
  'collector image identity uses owned files only, never acquisition',
  { skip: process.platform !== 'win32' },
  () => {
    const powershell = join(
      process.env.SystemRoot ?? process.env.SYSTEMROOT ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    );
    const result = spawnSync(
      powershell,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-File',
        fileURLToPath(new URL('./test-mixed-process-image-identity.ps1', import.meta.url)),
      ],
      {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        encoding: 'utf8',
        windowsHide: true,
        shell: false,
        timeout: 30000,
        maxBuffer: 1000000,
      },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      kind: 'OFFLINE_IMAGE_IDENTITY_UNIT_ONLY',
      assertions: 21,
      acquisitionRuns: 0,
      measurementEligible: false,
    });
  },
);

// TEST_DOUBLE only: evaluate the fixed helper with fake pipes/child; never import child_process.
async function runSyntheticHelper(mode) {
  const file = new URL('./mixed-process-conformance-child.mjs', import.meta.url);
  let source = fs.readFileSync(file, 'utf8');
  for (const line of [
    "import { spawn } from 'node:child_process';",
    "import { fileURLToPath } from 'node:url';",
    "import { once } from 'node:events';",
  ]) {
    assert.equal(source.split(line).length - 1, 1);
    source = source.replace(line, '');
  }
  source = source.replaceAll('import.meta.url', '__helperUrl');
  assert.equal(/\bimport\s*[(\s]/.test(source), false);
  const stdin = new EventEmitter();
  let destroyed = false,
    killed = 0,
    spawnCalls = 0,
    report = '';
  stdin.destroy = () => {
    destroyed = true;
  };
  const child = new EventEmitter();
  child.pid = 102;
  for (const name of ['stdout', 'stderr']) {
    child[name] = new EventEmitter();
    child[name].setEncoding = () => {};
  }
  child.unref = () => {
    throw Error('Fixed child must remain owned');
  };
  child.kill = () => {
    killed++;
    queueMicrotask(() => child.emit('close', 1, null));
    return true;
  };
  const environment = { SYSTEMROOT: 'C:\\Windows', NO_COLOR: '1' };
  const fakeProcess = {
    argv: ['node', fileURLToPath(file), mode],
    execPath: 'D:/fixed/node.exe',
    pid: 101,
    env: environment,
    stdin,
    stdout: {
      write: (s) => {
        report += s;
      },
    },
  };
  const spawn = (executable, args, options) => {
    spawnCalls++;
    assert.equal(executable, fakeProcess.execPath);
    assert.deepEqual(Array.from(args), [
      fileURLToPath(file),
      mode === 'SHORT_DESCENDANT' ? 'child-short' : 'child-wait',
    ]);
    assert.equal(options.shell, false);
    assert.equal(options.windowsHide, true);
    assert.equal(options.detached, true);
    assert.deepEqual(Array.from(options.stdio), ['pipe', 'pipe', 'pipe']);
    assert.equal(options.env, environment);
    queueMicrotask(() => child.emit('spawn'));
    setImmediate(() => {
      if (mode === 'SHORT_DESCENDANT') {
        child.stdout.emit('data', 'DONE');
        child.emit('close', 0, null);
      } else stdin.emit('data', Buffer.from('cancel\n'));
    });
    return child;
  };
  await vm.runInNewContext(
    '(async () => {' + source + '\n})()',
    { process: fakeProcess, spawn, once, fileURLToPath, __helperUrl: file.href },
    { timeout: 1000 },
  );
  return { report: JSON.parse(report), killed, spawnCalls, destroyed };
}

for (const mode of ['SHORT_DESCENDANT', 'CANCEL_DESCENDANT', 'FINAL_QUERY_FAILURE'])
  test('fixed helper preserves ownership in TEST_DOUBLE ' + mode, { timeout: 3000 }, async () => {
    const value = await runSyntheticHelper(mode);
    const cancelled = mode === 'CANCEL_DESCENDANT';
    assert.equal(value.spawnCalls, mode === 'FINAL_QUERY_FAILURE' ? 0 : 1);
    assert.equal(value.killed, cancelled ? 1 : 0);
    assert.equal(value.destroyed, cancelled);
    assert.deepEqual(value.report, {
      pid: 101,
      childPid: mode === 'FINAL_QUERY_FAILURE' ? null : 102,
      childExitCode: mode === 'SHORT_DESCENDANT' ? 0 : cancelled ? 1 : null,
      childSignal: null,
      childClosed: mode !== 'FINAL_QUERY_FAILURE',
      outcome: cancelled ? 'CANCELLED' : 'DONE',
      childStdout: mode === 'SHORT_DESCENDANT' ? 'DONE' : '',
    });
  });
