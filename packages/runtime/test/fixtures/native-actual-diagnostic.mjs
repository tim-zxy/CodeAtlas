// Explicit test-only ACTUAL preload; never part of product or measurement catalogs.
import { randomUUID } from 'node:crypto';
import { openSync, statSync, writeSync } from 'node:fs';
import path from 'node:path';
import { setNativeDiagnosticSink } from './native-dense-diagnostic.mjs';

const directory = process.env.CODEATLAS_ACTUAL_DIAGNOSTIC_DIR;
let directoryValid;
try {
  directoryValid = directory && path.isAbsolute(directory) && statSync(directory).isDirectory();
} catch {
  directoryValid = false;
}
if (!directoryValid) {
  throw new Error('ACTUAL_DIAGNOSTIC_DIRECTORY_REQUIRED');
}
let descriptor;
setNativeDiagnosticSink((row) => {
  // Each Node process owns an exclusive file; the observer caps at64 Native rows.
  // No child stdout reader, payload, path, request ID or environment is recorded.
  try {
    descriptor ??= openSync(
      path.join(directory, `${process.pid}-${randomUUID()}.jsonl`),
      'wx',
      0o600,
    );
    writeSync(descriptor, JSON.stringify({ ...row, scope: 'ACTUAL_DIAGNOSTIC_ONLY' }) + '\n');
  } catch {
    throw new Error('ACTUAL_DIAGNOSTIC_WRITE_FAILED');
  }
});
