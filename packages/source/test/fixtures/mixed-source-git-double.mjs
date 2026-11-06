import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
export const fixture = new URL(
  '../../../../fixtures/phase1/mixed-runtime-readiness/source-integration/',
  import.meta.url,
);
export const expected = JSON.parse(await fs.readFile(new URL('expected.json', fixture)));
export const cases = JSON.parse(await fs.readFile(new URL('cases.json', fixture)));
export function makeAccount(signal = new AbortController().signal) {
  const usage = { reads: 0, buffers: 0, items: 0, invalid: false };
  const account = {
    checkpoint() {
      if (usage.invalid) throw Object.assign(Error('INVALID_STAGE'), { code: 'STAGE_RELEASED' });
      if (signal.aborted) throw Object.assign(Error('CANCELLED'), { code: 'CANCELLED' });
    },
    own() {
      this.checkpoint();
    },
    reserveBuffer(n) {
      this.checkpoint();
      usage.buffers += n;
    },
    readBytes(n) {
      this.checkpoint();
      usage.reads += n;
    },
    visitItem() {
      this.checkpoint();
      usage.items++;
    },
    invalidate() {
      usage.invalid = true;
    },
  };
  return { account, usage };
}
export async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codeatlas-a2-'));
  for (const p of cases.sourcePaths) {
    await fs.mkdir(path.dirname(path.join(root, p)), { recursive: true });
    await fs.copyFile(new URL('source/' + p, fixture), path.join(root, p));
  }
  const original = cp.spawn,
    state = {
      ignored: new Set(),
      head: 'a'.repeat(40),
      branch: 'main',
      mode: 'ok',
      expectedExecutable: 'git',
      spawnAudit: null,
      calls: 0,
      closes: 0,
      inputs: [],
      beforeReply: null,
    };
  cp.spawn = (file, args, options) => {
    assert.equal(file, state.expectedExecutable);
    state.spawnAudit?.(file, args, options);
    assert.equal(options.shell, false);
    assert.equal(options.windowsHide, true);
    state.calls++;
    const child = new EventEmitter();
    let done = false;
    Object.assign(child, {
      pid: 12345,
      exitCode: null,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    const close = (code) => {
      if (done) return;
      done = true;
      child.exitCode = code;
      child.stdout.end();
      child.stderr.end();
      state.closes++;
      child.emit('exit', code, null);
      child.emit('close', code, null);
    };
    child.kill = () => {
      queueMicrotask(() => close(9));
      return true;
    };
    child.stdin = new Writable({
      write(chunk, enc, cb) {
        state.inputs.push(Buffer.from(chunk));
        cb();
      },
      final(cb) {
        cb();
        queueMicrotask(async () => {
          if (state.mode === 'hang') return;
          if (state.beforeReply) await state.beforeReply(args);
          if (state.mode === 'exit') {
            close(2);
            return;
          }
          if (state.mode === 'stream-error') {
            child.stdout.destroy(Error('private pipe payload'));
            setImmediate(() => close(2));
            return;
          }
          const command = args[2];
          let output = '';
          if (command === 'rev-parse')
            output = args.includes('--show-toplevel') ? root + '\n' : state.head + '\n';
          else if (command === 'symbolic-ref') output = state.branch + '\n';
          else if (command === 'check-ignore')
            output = [...state.ignored].map((p) => p + '\0').join('');
          else throw Error('UNEXPECTED_GIT_COMMAND');
          child.stdout.write(
            state.mode === 'overflow' ? Buffer.alloc(1000001, 65) : Buffer.from(output),
          );
          close(command === 'check-ignore' && state.ignored.size === 0 ? 1 : 0);
        });
      },
    });
    queueMicrotask(() => child.emit('spawn'));
    return child;
  };
  syncBuiltinESMExports();
  t.after(async () => {
    state.closeOwnedDatabase?.();
    cp.spawn = original;
    syncBuiltinESMExports();
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  });
  const controller = new AbortController();
  return {
    root,
    spawnDouble: cp.spawn,
    state,
    controller,
    control: { signal: controller.signal, deadlineEpochMs: Date.now() + 60000 },
    request: {
      repositoryId: 'repo:a2',
      startingPath: root,
      workspaceRoot: root,
      config: { include: [], exclude: [] },
    },
  };
}
