import assert from 'node:assert/strict';
import { lstat, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const r9StopRequestFile = 'STOP_REQUESTED';
export const r9StopReceiptFile = 'r9-stop-receipt.json';
const failure = (code) => Object.assign(new Error(code), { code });
/** Offline R9 deny-only control. Not execution authority, an in-flight interrupt,
 * a process-tree cleanup proof or OS time/memory/process isolation. */
export async function createR9StopControl(directory, verifyIdentity) {
  assert.ok(verifyIdentity === undefined || typeof verifyIdentity === 'function');
  assert.equal(path.resolve(directory), directory);
  assert.equal(await realpath(directory), directory);
  const original = await lstat(directory, { bigint: true });
  assert.ok(original.isDirectory() && !original.isSymbolicLink());
  let stopped,
    saved = false,
    active = false,
    stageActive = false;
  const ownedRoot = async () => {
    const current = await lstat(directory, { bigint: true });
    assert.ok(current.isDirectory() && !current.isSymbolicLink());
    assert.equal(await realpath(directory), directory);
    for (const field of ['dev', 'ino', 'birthtimeNs'])
      assert.equal(current[field], original[field]);
  };
  const record = async (boundary, reason, cleanupState) => {
    assert.match(boundary, /^[A-Za-z0-9:._-]+$/);
    await ownedRoot();
    if (saved) return;
    await writeFile(
      path.join(directory, r9StopReceiptFile),
      JSON.stringify({
        schemaVersion: 1,
        status: 'STOPPED',
        boundary,
        reason,
        cleanupState,
        laterLaunchesBlocked: true,
        hardIsolation: false,
      }) + '\n',
      { flag: 'wx' },
    );
    saved = true;
  };
  const fail = async (boundary) => {
    stopped ??= 'R9_WORKER_FAILED';
    try {
      await record(boundary, 'WORKER_FAILED_OR_CLEANUP_UNKNOWN', 'UNKNOWN');
    } catch {
      stopped = 'R9_STOP_CONTROL_UNAVAILABLE';
      throw failure(stopped);
    }
  };
  const checkpoint = async (boundary) => {
    try {
      await ownedRoot();
      if (stopped) throw failure(stopped);
      try {
        await lstat(path.join(directory, r9StopRequestFile));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (verifyIdentity) {
          try {
            await verifyIdentity();
            if (stopped) throw failure(stopped);
          } catch {
            await fail(boundary + ':IDENTITY');
            throw failure(stopped);
          }
        }
        return;
      }
      stopped = 'R9_STOP_REQUESTED';
      await record(boundary, 'REQUESTED', 'NOT_PROVEN');
    } catch (error) {
      if (!stopped || error.code !== stopped) stopped = 'R9_STOP_CONTROL_UNAVAILABLE';
      throw failure(stopped);
    }
    throw failure(stopped);
  };
  const run = async (boundary, operation, stage) => {
    await checkpoint(boundary + ':BEFORE');
    if (stopped) throw failure(stopped);
    if (active || (stage && stageActive)) {
      await fail(boundary + ':CONCURRENT');
      throw failure(stopped);
    }
    if (stage) stageActive = true;
    else active = true;
    try {
      const result = await operation();
      if (result !== null && typeof result === 'object') {
        if (Object.getOwnPropertyDescriptor(result, 'cleanupState')?.value === 'UNKNOWN')
          throw failure('R9_CLEANUP_UNKNOWN');
        if (stage) {
          const failures = Object.getOwnPropertyDescriptor(result, 'failures')?.value;
          if (
            (Array.isArray(failures) && failures.length > 0) ||
            Object.getOwnPropertyDescriptor(result, 'passed')?.value === false
          )
            throw failure('R9_STAGE_FAILED');
        }
      }
      // Preserve/validate/restore original evidence before post-operation checks.
      await checkpoint(boundary + ':AFTER');
      return result;
    } catch (error) {
      await fail(boundary + ':FAILED');
      throw error;
    } finally {
      if (stage) stageActive = false;
      else active = false;
    }
  };
  return Object.freeze({
    checkpoint,
    fail,
    worker: (boundary, operation) => run(boundary, operation, false),
    stage: (boundary, operation) => run(boundary, operation, true),
  });
}
