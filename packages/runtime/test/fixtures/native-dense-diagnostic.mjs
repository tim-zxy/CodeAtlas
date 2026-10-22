// Test-only lifecycle observer. Default sink is the original offline diagnostic.
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { basename } from 'node:path';
import { performance } from 'node:perf_hooks';

const spawn = childProcess.spawn;
let diagnosticSink = (row) =>
  process.stderr.write('[DENSE_NATIVE_DIAGNOSTIC]' + JSON.stringify(row) + '\n');

// The approved ACTUAL test preload selects a separate sidecar before any spawn.
export function setNativeDiagnosticSink(sink) {
  diagnosticSink = sink;
}

let observed = 0;
childProcess.spawn = function (...args) {
  const child = Reflect.apply(spawn, this, args);
  if (!/^codeatlas-native-analyzer(?:\.exe)?$/.test(basename(String(args[0])))) return child;
  if (observed >= 64) return child;
  const start = performance.now();
  const elapsed = () => performance.now() - start;
  const row = {
    scope: 'OFFLINE_TEST_DIAGNOSTIC_ONLY',
    sequence: ++observed,
    inputWriteCallBytes: 0,
    outputPushBytes: 0,
    outputPushChunks: 0,
    firstInputMs: null,
    firstOutputMs: null,
    lastOutputMs: null,
    stdoutEofMs: null,
    exitMs: null,
    closeMs: null,
    killMs: null,
    exitCode: null,
    signal: null,
  };
  if (child.stdin) {
    for (const name of ['write', 'end']) {
      const method = child.stdin[name];
      child.stdin[name] = function (chunk, ...rest) {
        if (typeof chunk === 'string' || ArrayBuffer.isView(chunk)) {
          row.firstInputMs ??= elapsed();
          row.inputWriteCallBytes +=
            typeof chunk === 'string'
              ? Buffer.byteLength(chunk, typeof rest[0] === 'string' ? rest[0] : undefined)
              : chunk.byteLength;
        }
        return Reflect.apply(method, this, [chunk, ...rest]);
      };
    }
  }
  if (child.stdout) {
    const push = child.stdout.push;
    child.stdout.push = function (chunk, ...rest) {
      if (chunk === null) row.stdoutEofMs = elapsed();
      else {
        row.firstOutputMs ??= elapsed();
        row.lastOutputMs = elapsed();
        row.outputPushBytes +=
          typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.byteLength;
        row.outputPushChunks++;
      }
      return Reflect.apply(push, this, [chunk, ...rest]);
    };
  }
  const kill = child.kill;
  child.kill = function (...values) {
    row.killMs ??= elapsed();
    return Reflect.apply(kill, this, values);
  };
  child.once('exit', (code, signal) => {
    row.exitMs = elapsed();
    row.exitCode = code;
    row.signal = signal;
  });
  child.once('close', () => {
    row.closeMs = elapsed();
    diagnosticSink(row);
  });
  return child;
};
syncBuiltinESMExports();
