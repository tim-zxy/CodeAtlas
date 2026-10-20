import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import {
  encodeRefreshReplayJson,
  decodeRefreshReplayJson,
  verifyRefreshReplayAsset,
} from './native-refresh-transport-replay.mjs';

const hash = () => createHash('sha256');
const keys = (value, fields) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort(), 'Invalid prefix proof fields');
};
const digest = (value) => assert.match(value, /^[a-f0-9]{64}$/);
const count = (value) => assert.ok(Number.isSafeInteger(value) && value >= 0);

// Call only with origins returned by the independent file-backed audit. Hashes
// alone establish integrity, not separate calibration/holdout processes.
export function assertRefreshPrefixOriginDistinct(seen, origin) {
  keys(origin, ['artifactSha256', 'processNonce']);
  digest(origin.artifactSha256);
  assert.ok(typeof origin.processNonce === 'string' && origin.processNonce.length);
  const tokens = [`artifact:${origin.artifactSha256}`, `process:${origin.processNonce}`];
  assert.ok(
    tokens.every((token) => !seen.has(token)),
    'Reused cancellation evidence origin',
  );
  tokens.forEach((token) => seen.add(token));
}

const relative = (value) =>
  assert.ok(
    typeof value === 'string' &&
      value.length &&
      !/[\\:\0]/.test(value) &&
      value.split('/').every((part) => part && part !== '.' && part !== '..'),
    'Invalid prefix reference path',
  );

export function validateRefreshOutputContract(name, input, outputContract) {
  // The shared canonical codec rejects hidden/accessor/symbol/sparse data first.
  input = decodeRefreshReplayJson(encodeRefreshReplayJson(input));
  outputContract = decodeRefreshReplayJson(encodeRefreshReplayJson(outputContract));
  keys(input, [
    'corpusPayloadDigest',
    'expectedOutcome',
    'inputBytes',
    'largestLineBytes',
    'outputBytes',
    'eventCount',
    'summaryBytes',
  ]);
  digest(input.corpusPayloadDigest);
  for (const field of ['inputBytes', 'largestLineBytes', 'summaryBytes']) count(input[field]);
  if (name === 'd-cancel') {
    keys(outputContract, ['kind', 'referencePath', 'provenancePath']);
    assert.equal(outputContract.kind, 'CANCELLED_PREFIX');
    assert.equal(input.expectedOutcome, 'CANCELLED');
    assert.equal(input.outputBytes, null);
    assert.equal(input.eventCount, null);
    relative(outputContract.referencePath);
    relative(outputContract.provenancePath);
    assert.notEqual(outputContract.referencePath, outputContract.provenancePath);
  } else {
    keys(outputContract, ['kind']);
    assert.equal(outputContract.kind, 'EXACT');
    count(input.outputBytes);
    count(input.eventCount);
  }
}

export async function verifyRefreshCancelledPrefix(root, referenceAsset, evidence) {
  evidence = decodeRefreshReplayJson(encodeRefreshReplayJson(evidence));
  keys(evidence, ['requestSha256', 'wireEvidence']);
  digest(evidence.requestSha256);
  const wire = evidence.wireEvidence;
  keys(wire, ['inputSha256', 'outputSha256', 'outputBytes', 'eventCount', 'cancelGate']);
  digest(wire.inputSha256);
  digest(wire.outputSha256);
  assert.equal(wire.inputSha256, evidence.requestSha256, 'Cancelled request changed');
  count(wire.outputBytes);
  count(wire.eventCount);
  assert.ok(wire.outputBytes > 0 && wire.outputBytes <= referenceAsset.bytes);
  assert.deepEqual(
    wire.cancelGate,
    {
      kind: 'FIRST_BLOCKED_STAGE_SINK',
      accepted: 1,
      maximumInFlight: 1,
      blockedVerified: true,
      abortCalls: 1,
    },
    'Original first blocked sink cancellation required',
  );
  assert.equal(referenceAsset.kind, 'ORACLE');
  const file = await verifyRefreshReplayAsset(root, referenceAsset);
  const reader = await open(file, 'r');
  try {
    const before = await reader.stat({ bigint: true });
    const complete = hash(),
      prefix = hash();
    let bytes = 0,
      events = 0;
    // One bounded iterator, full suffix integrity and prefix statistics together.
    for await (const chunk of reader.createReadStream({ autoClose: false })) {
      complete.update(chunk);
      const part = chunk.subarray(0, Math.max(0, wire.outputBytes - bytes));
      prefix.update(part);
      for (const byte of part) if (byte === 10) events++;
      bytes += chunk.length;
      count(bytes);
    }
    const after = await reader.stat({ bigint: true });
    for (const field of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'])
      assert.equal(after[field], before[field], 'Prefix reference changed during read');
    assert.equal(bytes, referenceAsset.bytes);
    assert.equal(complete.digest('hex'), referenceAsset.sha256, 'Reference suffix changed');
    assert.equal(
      prefix.digest('hex'),
      wire.outputSha256,
      'Cancelled bytes are not a reference prefix',
    );
    assert.equal(events, wire.eventCount, 'Cancelled LF count changed');
    return Object.freeze({
      kind: 'CANCELLED_PREFIX',
      referenceSha256: referenceAsset.sha256,
      inputSha256: wire.inputSha256,
      outputSha256: wire.outputSha256,
      outputBytes: wire.outputBytes,
      eventCount: wire.eventCount,
      gateVerified: true,
    });
  } finally {
    await reader.close();
  }
}
