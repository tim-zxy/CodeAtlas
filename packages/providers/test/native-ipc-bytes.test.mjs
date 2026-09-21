import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  NativeEventEnvelopeSchema,
  NativeEventStreamSchema,
  NativeRequestEnvelopeSchema,
} from '../dist/index.js';

const fixtureRoot = new URL('../../../fixtures/ipc/protocol-v1/', import.meta.url);
const classifications = new Set([
  'VALID',
  'MALFORMED_JSON',
  'INVALID_EVENT',
  'INCOMPATIBLE_PROTOCOL',
  'OVERSIZE_LINE',
  'OUT_OF_ORDER',
  'PREMATURE_EOF',
]);
const terminalEventTypes = new Set([
  'DESCRIBE_COMPLETED',
  'ANALYSIS_COMPLETED',
  'ANALYSIS_FAILED',
  'REFRESH_COMPLETED',
  'REFRESH_FAILED',
  'CANCEL_ACCEPTED',
  'REQUEST_FAILED',
]);
const fixtureCaseIds = [
  'describe-v1',
  'analyze-java-basic-v1',
  'refresh-modified-file-v1',
  'refresh-delete-file-v1',
  'partial-analysis-v1',
  'cancellation-v1',
  'malformed-json-v1',
  'invalid-event-v1',
  'incompatible-protocol-v1',
  'oversize-line-v1',
  'out-of-order-v1',
  'premature-eof-v1',
];

function resolveFixturePath(relativePath) {
  assert.equal(typeof relativePath, 'string');
  assert.equal(relativePath.includes('\\'), false);
  const resolved = new URL(relativePath, fixtureRoot);
  assert.equal(resolved.href.startsWith(fixtureRoot.href), true);
  return resolved;
}

function decodeLines(bytes, maxLineBytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { error: 'MALFORMED_JSON' };
  const rawLines = [];
  let start = 0;
  for (let index = 0; index <= bytes.length; index += 1) {
    if (index !== bytes.length && bytes[index] !== 0x0a) continue;
    const line = bytes.subarray(start, index);
    if (line.length > maxLineBytes) return { error: 'OVERSIZE_LINE' };
    if (line.at(-1) === 0x0d) return { error: 'MALFORMED_JSON' };
    rawLines.push(line);
    start = index + 1;
  }
  if (rawLines.at(-1)?.length === 0) rawLines.pop();
  if (rawLines.length === 0 || rawLines.some((line) => line.length === 0)) {
    return { error: 'MALFORMED_JSON' };
  }
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
    return { lines: rawLines.map((line) => decoder.decode(line)) };
  } catch {
    return { error: 'MALFORMED_JSON' };
  }
}

function parseLines(lines) {
  try {
    return { values: lines.map((line) => JSON.parse(line)) };
  } catch {
    return { error: 'MALFORMED_JSON' };
  }
}

function classifyTranscript(requestBytes, eventBytes, maxLineBytes) {
  const decodedRequest = decodeLines(requestBytes, maxLineBytes);
  if (decodedRequest.error) return decodedRequest.error;
  const decodedEvents = decodeLines(eventBytes, maxLineBytes);
  if (decodedEvents.error) return decodedEvents.error;
  if (decodedRequest.lines.length !== 1) return 'INVALID_EVENT';
  const parsedRequest = parseLines(decodedRequest.lines);
  if (parsedRequest.error) return parsedRequest.error;
  const parsedEvents = parseLines(decodedEvents.lines);
  if (parsedEvents.error) return parsedEvents.error;
  const request = parsedRequest.values[0];
  const events = parsedEvents.values;
  if ([request, ...events].some((envelope) => envelope?.protocolVersion !== 1)) {
    return 'INCOMPATIBLE_PROTOCOL';
  }
  if (!NativeRequestEnvelopeSchema.safeParse(request).success) return 'INVALID_EVENT';
  if (events.some((event) => !NativeEventEnvelopeSchema.safeParse(event).success)) {
    return 'INVALID_EVENT';
  }
  if (events.some((event, index) => event.sequence !== index)) return 'OUT_OF_ORDER';
  const terminals = events.flatMap((event, index) =>
    terminalEventTypes.has(event.type) ? [index] : [],
  );
  if (terminals.length === 0) return 'PREMATURE_EOF';
  if (terminals.length !== 1 || terminals[0] !== events.length - 1) return 'INVALID_EVENT';
  return NativeEventStreamSchema.safeParse({ request, events }).success ? 'VALID' : 'INVALID_EVENT';
}

async function loadFixture() {
  return JSON.parse(await readFile(new URL('cases.json', fixtureRoot), 'utf8'));
}

test('P0-W3-002 Fixture index declares shared byte cases with safe paths', async () => {
  const fixture = await loadFixture();
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.id, 'p0-native-ipc-protocol-bytes-v1');
  assert.equal(fixture.task, 'P0-W3-002');
  assert.equal(fixture.governingSpec, 'docs/handoff/specs/NATIVE_IPC.md');
  assert.equal(
    fixture.acceptance,
    'TypeScript and Rust consume the same Native IPC v1 request and event bytes',
  );
  assert.deepEqual(
    fixture.cases.map((fixtureCase) => fixtureCase.id),
    fixtureCaseIds,
  );
  assert.equal(new Set(fixtureCaseIds).size, fixture.cases.length);
  for (const fixtureCase of fixture.cases) {
    assert.equal(classifications.has(fixtureCase.expected), true);
    for (const name of ['requestBytes', 'eventsBytes', 'maxLineBytes']) {
      assert.equal(Number.isSafeInteger(fixtureCase[name]), true);
      assert.equal(fixtureCase[name] > 0, true);
    }
    resolveFixturePath(fixtureCase.requestFile);
    resolveFixturePath(fixtureCase.eventsFile);
  }
});

test('Fixture paths reject parent traversal and absolute paths before file access', () => {
  assert.throws(() => resolveFixturePath('../escape.jsonl'));
  assert.throws(() => resolveFixturePath('/absolute.jsonl'));
});

test('fixtures preserve exact bytes and match their protocol classification', async () => {
  const fixture = await loadFixture();
  for (const fixtureCase of fixture.cases) {
    const request = await readFile(resolveFixturePath(fixtureCase.requestFile));
    const events = await readFile(resolveFixturePath(fixtureCase.eventsFile));
    assert.equal(request.length, fixtureCase.requestBytes, fixtureCase.id);
    assert.equal(events.length, fixtureCase.eventsBytes, fixtureCase.id);
    assert.equal(
      classifyTranscript(request, events, fixtureCase.maxLineBytes),
      fixtureCase.expected,
      fixtureCase.id,
    );
  }
});

test('raw framing rejects BOM, invalid UTF-8, and middle blank lines', async () => {
  const fixture = await loadFixture();
  const fixtureCase = fixture.cases[0];
  const request = await readFile(resolveFixturePath(fixtureCase.requestFile));
  const events = await readFile(resolveFixturePath(fixtureCase.eventsFile));
  assert.equal(
    classifyTranscript(Buffer.from([0xef, 0xbb, 0xbf, ...request]), events, 8192),
    'MALFORMED_JSON',
  );
  assert.equal(classifyTranscript(Buffer.from([0xff]), events, 8192), 'MALFORMED_JSON');
  assert.equal(
    classifyTranscript(Buffer.from(`${request.toString('utf8')}\n`), events, 8192),
    'MALFORMED_JSON',
  );
});

test('classification precedence and byte counting stay deterministic', async () => {
  const fixture = await loadFixture();
  const describe = fixture.cases.find((fixtureCase) => fixtureCase.id === 'describe-v1');
  const analyze = fixture.cases.find((fixtureCase) => fixtureCase.id === 'analyze-java-basic-v1');
  const describeRequest = await readFile(resolveFixturePath(describe.requestFile));
  const describeEvents = await readFile(resolveFixturePath(describe.eventsFile));
  const analyzeRequest = await readFile(resolveFixturePath(analyze.requestFile));
  const analyzeEvents = await readFile(resolveFixturePath(analyze.eventsFile));
  const requestLineBytes = describeRequest.length - 1;
  const malformedOversize = Buffer.from(`{"broken":"${'x'.repeat(requestLineBytes)}`);

  assert.equal(
    classifyTranscript(describeRequest, malformedOversize, requestLineBytes),
    'OVERSIZE_LINE',
  );
  assert.equal(
    classifyTranscript(describeRequest, Buffer.from('{"broken":\n'), requestLineBytes),
    'MALFORMED_JSON',
  );
  assert.equal(Buffer.byteLength('界'), 3);
  assert.deepEqual(decodeLines(Buffer.from('界'), 2), { error: 'OVERSIZE_LINE' });

  const mismatchedEvents = Buffer.from(
    describeEvents.toString('utf8').replaceAll('request-describe', 'request-mismatch'),
  );
  assert.equal(classifyTranscript(describeRequest, mismatchedEvents, 8192), 'INVALID_EVENT');

  const outOfOrderEvents = Buffer.from(
    analyzeEvents.toString('utf8').replace('"sequence":1', '"sequence":9'),
  );
  assert.equal(classifyTranscript(analyzeRequest, outOfOrderEvents, 8192), 'OUT_OF_ORDER');

  const crlfEvents = Buffer.from(describeEvents.toString('utf8').replaceAll('\n', '\r\n'));
  assert.notEqual(crlfEvents.length, describe.eventsBytes);
  assert.equal(classifyTranscript(describeRequest, crlfEvents, 8192), 'MALFORMED_JSON');
});
