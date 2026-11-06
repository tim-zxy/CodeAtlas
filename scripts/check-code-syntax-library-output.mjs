import assert from 'node:assert/strict';
import { open, lstat, realpath, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  validateCodeSyntaxObservationStream,
  normalizePythonSourceObservation,
  NATIVE_CLIENT_HARD_LIMITS,
} from '../packages/providers/dist/index.js';
import { consumeCodeSyntaxObservationStream } from '../packages/providers/dist/native-code-syntax-stream.js';
import { Readable } from 'node:stream';
import {
  sha,
  producerJSON,
  instantiateProducerCase,
} from '../packages/providers/test/fixtures/code-syntax-producer-helpers.mjs';
const keys = [
  'caseId',
  'eventsFile',
  'eventsSha256',
  'executionKind',
  'expectedFile',
  'expectedSha256',
  'measurementEligible',
  'requestFile',
  'requestSha256',
  'schemaVersion',
];
export function verifyCaptureManifest(m, id, bytes) {
  assert.deepEqual(Object.keys(m).sort(), keys);
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.executionKind, 'RUST_LIBRARY_TEST_ONLY');
  assert.equal(m.measurementEligible, false);
  assert.equal(m.caseId, id);
  for (const [prefix, name] of [
    ['request', 'request.jsonl'],
    ['events', 'events.jsonl'],
    ['expected', 'expected.jsonl'],
  ]) {
    assert.equal(m[prefix + 'File'], name);
    assert.match(m[prefix + 'Sha256'], /^[0-9a-f]{64}$/);
    assert.equal(m[prefix + 'Sha256'], sha(bytes[prefix]));
  }
}
async function regular(path, cap) {
  const s = await lstat(path);
  assert.ok(s.isFile() && !s.isSymbolicLink(), 'Capture file must be regular');
  assert.ok(s.size <= cap, 'Capture exceeds existing byte cap');
  const file = await open(path, 'r');
  try {
    const before = await file.stat();
    assert.ok(before.isFile() && before.size <= cap, 'Capture exceeds existing byte cap');
    for (const key of ['dev', 'ino', 'size', 'mtimeMs'])
      assert.equal(before[key], s[key], 'Capture changed before reading');
    // One sentinel detects growth without an unbounded whole-file allocation.
    const data = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < data.length) {
      const read = await file.read(data, length, data.length - length, null);
      if (read.bytesRead === 0) break;
      length += read.bytesRead;
    }
    assert.equal(length, before.size, 'Capture changed while reading');
    const after = await file.stat();
    for (const key of ['dev', 'ino', 'size', 'mtimeMs'])
      assert.equal(after[key], before[key], 'Capture changed while reading');
    return data.subarray(0, length);
  } finally {
    await file.close();
  }
}
export async function checkCapturedLibraryOutput(input) {
  const candidate = resolve(input),
    root = await realpath(candidate);
  assert.equal(candidate, root, 'Capture root must be direct');
  const allowed = resolve(
    fileURLToPath(
      new URL(
        '../.superpowers/sdd/2026-10-24-phase1-code-syntax-producer/library-output/',
        import.meta.url,
      ),
    ),
  );
  const r = relative(allowed, root);
  assert.ok(
    r !== '' && !r.startsWith('..' + sep) && r !== '..' && !isAbsolute(r),
    'Capture outside owned scope',
  );
  assert.equal(await realpath(allowed), allowed);
  const rootInfo = await lstat(root);
  assert.ok(rootInfo.isDirectory() && !rootInfo.isSymbolicLink());
  const cases = await producerJSON('cases.json');
  assert.deepEqual((await readdir(root)).sort(), cases.map((x) => x.id).sort());
  const evidence = [];
  for (const { id } of cases) {
    const dir = join(root, id),
      s = await lstat(dir);
    assert.ok(s.isDirectory() && !s.isSymbolicLink());
    assert.equal(await realpath(dir), dir);
    assert.deepEqual((await readdir(dir)).sort(), [
      'events.jsonl',
      'expected.jsonl',
      'manifest.json',
      'request.jsonl',
    ]);
    const bytes = {
      request: await regular(join(dir, 'request.jsonl'), NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes),
      events: await regular(join(dir, 'events.jsonl'), NATIVE_CLIENT_HARD_LIMITS.maxStdoutBytes),
      expected: await regular(
        join(dir, 'expected.jsonl'),
        NATIVE_CLIENT_HARD_LIMITS.maxStdoutBytes,
      ),
    };
    const manifest = JSON.parse(
      await regular(join(dir, 'manifest.json'), NATIVE_CLIENT_HARD_LIMITS.maxLineBytes),
    );
    verifyCaptureManifest(manifest, id, bytes);
    const rootPath = JSON.parse(bytes.request).payload.repository.rootPath;
    const expected = await instantiateProducerCase(id, rootPath);
    assert.deepEqual(bytes.request, expected.requestBytes);
    assert.deepEqual(bytes.expected, expected.expectedOutputBytes);
    assert.deepEqual(bytes.events, expected.expectedOutputBytes);
    const pure = validateCodeSyntaxObservationStream(bytes.request, bytes.events),
      stream = await consumeCodeSyntaxObservationStream(
        bytes.request,
        Readable.from([bytes.events]),
        new AbortController().signal,
      );
    assert.deepEqual(stream, pure);
    const p = pure.request.payload;
    assert.deepEqual(
      normalizePythonSourceObservation({
        targetSource: p.targetSource,
        providerId: p.providerId,
        providerSnapshotId: p.providerSnapshotId,
        sourceFiles: p.sourceFiles,
        nodes: pure.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
        edges: pure.events.filter((e) => e.type === 'EDGE').map((e) => e.payload),
      }),
      expected.expectedCanonical,
    );
    evidence.push({
      id,
      requestSha256: sha(bytes.request),
      eventsSha256: sha(bytes.events),
      outcome: pure.outcome,
    });
  }
  return {
    kind: 'RUST_LIBRARY_TEST_CROSS_CONSUMER_CONFORMANCE_ONLY',
    measurementEligible: false,
    sourceOrHistoryAuthenticated: false,
    cases: evidence,
  };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  assert.equal(process.argv.length, 3, 'Explicit capture root required');
  const result = await checkCapturedLibraryOutput(process.argv[2]);
  await writeFile(
    join(resolve(process.argv[2]), 'cross-consumer-result.json'),
    JSON.stringify(result, null, 2) + '\n',
    { flag: 'wx' },
  );
  console.log(
    JSON.stringify({ cases: result.cases.length, measurementEligible: false, kind: result.kind }),
  );
}
