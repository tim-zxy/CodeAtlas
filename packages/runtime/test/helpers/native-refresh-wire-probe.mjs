import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';

// Fresh-worker test instrumentation only; never imported by product code.
// Observe existing reads/writes without a data listener, second reader or buffering relay.
let active = false;
function counter() {
  const hash = createHash('sha256');
  let bytes = 0,
    records = 0,
    line = 0,
    largest = 0;
  return {
    accept(value, encoding) {
      const chunk = typeof value === 'string' ? Buffer.from(value, encoding) : value;
      hash.update(chunk);
      bytes += chunk.byteLength;
      for (const byte of chunk) {
        if (byte === 10) {
          records++;
          line = 0;
        } else {
          line++;
          largest = Math.max(largest, line);
        }
      }
    },
    finish() {
      return { bytes, records, largest, lfTerminated: line === 0, sha256: hash.digest('hex') };
    },
  };
}
export async function observeNativeWire(
  operation,
  observeOutputChunk,
  observeChild,
  observeErrorChunk,
  selectWireChild = () => true,
) {
  assert.equal(active, false, 'Wire probe requires an isolated settled operation');
  active = true;
  const originalSpawn = childProcess.spawn;
  const probes = [];
  childProcess.spawn = (...args) => {
    const child = originalSpawn(...args);
    if (!child.stdin || !child.stdout) return child;
    observeChild?.(child);
    // Keep ownership/close observation for every child, but a composite Source
    // workflow must not feed Git stdout/stderr into the Native wire decoder.
    if (!selectWireChild(child)) return child;
    const input = counter(),
      output = counter();
    // Cumulative submitted backing identities, not simultaneous retained memory.
    // Weak keys do not pin buffers; pooled backing bytes may include unrelated data.
    const seenInputStores = new WeakSet();
    const inputBackingStores = {
      scope: 'SUBMITTED_INPUT_BACKING_STORES_ONLY',
      views: 0,
      distinctStores: 0,
      uniqueBackingBytes: 0,
      largestBackingBytes: 0,
    };
    const acceptInput = (chunk, encoding) => {
      if (ArrayBuffer.isView(chunk)) {
        inputBackingStores.views++;
        const backing = chunk.buffer;
        if (!seenInputStores.has(backing)) {
          seenInputStores.add(backing);
          inputBackingStores.distinctStores++;
          inputBackingStores.uniqueBackingBytes += backing.byteLength;
          inputBackingStores.largestBackingBytes = Math.max(
            inputBackingStores.largestBackingBytes,
            backing.byteLength,
          );
        }
      }
      input.accept(chunk, encoding);
    };
    // Queue samples are not a continuous high water or decoded/request workspace.
    const streamBuffers = {
      scope: 'WIRE_STREAM_BUFFER_SAMPLES_ONLY',
      maximumPendingInputBytes: 0,
      maximumReadableOutputBytes: 0,
      maximumConsumedOutputChunkBytes: 0,
      consumedOutputChunks: 0,
    };
    const sampleBuffers = () => {
      streamBuffers.maximumPendingInputBytes = Math.max(
        streamBuffers.maximumPendingInputBytes,
        child.stdin.writableLength,
      );
      streamBuffers.maximumReadableOutputBytes = Math.max(
        streamBuffers.maximumReadableOutputBytes,
        child.stdout.readableLength,
      );
    };
    sampleBuffers();
    probes.push({ input, output, inputBackingStores, streamBuffers, sampleBuffers });
    const write = child.stdin.write.bind(child.stdin);
    child.stdin.write = (chunk, ...rest) => {
      acceptInput(chunk, typeof rest[0] === 'string' ? rest[0] : undefined);
      const accepted = write(chunk, ...rest);
      sampleBuffers();
      return accepted;
    };
    const end = child.stdin.end.bind(child.stdin);
    child.stdin.end = (chunk, ...rest) => {
      if (typeof chunk === 'string' || ArrayBuffer.isView(chunk))
        acceptInput(chunk, typeof rest[0] === 'string' ? rest[0] : undefined);
      const result = end(chunk, ...rest);
      sampleBuffers();
      return result;
    };
    const iterate = child.stdout[Symbol.asyncIterator].bind(child.stdout);
    child.stdout[Symbol.asyncIterator] = async function* () {
      for await (const chunk of { [Symbol.asyncIterator]: iterate }) {
        sampleBuffers();
        streamBuffers.consumedOutputChunks++;
        streamBuffers.maximumConsumedOutputChunkBytes = Math.max(
          streamBuffers.maximumConsumedOutputChunkBytes,
          chunk.byteLength,
        );
        output.accept(chunk);
        observeOutputChunk?.(chunk);
        yield chunk;
      }
    };
    if (observeErrorChunk && child.stderr) {
      const iterateError = child.stderr[Symbol.asyncIterator].bind(child.stderr);
      child.stderr[Symbol.asyncIterator] = async function* () {
        for await (const chunk of { [Symbol.asyncIterator]: iterateError }) {
          observeErrorChunk(chunk, child);
          yield chunk;
        }
      };
    }
    return child;
  };
  syncBuiltinESMExports();
  let value = null,
    error = null,
    threw = false;
  try {
    value = await operation();
  } catch (failure) {
    threw = true;
    error = failure;
  } finally {
    childProcess.spawn = originalSpawn;
    syncBuiltinESMExports();
    active = false;
  }
  const wire = probes.map(({ input, output, inputBackingStores, streamBuffers, sampleBuffers }) => {
    sampleBuffers();
    const a = input.finish(),
      b = output.finish();
    return {
      inputBytes: a.bytes,
      inputRecords: a.records,
      largestInputLineBytes: a.largest,
      inputLfTerminated: a.lfTerminated,
      outputBytes: b.bytes,
      outputRecords: b.records,
      largestOutputLineBytes: b.largest,
      outputLfTerminated: b.lfTerminated,
      inputSha256: a.sha256,
      outputSha256: b.sha256,
      inputBackingStores: Object.freeze(inputBackingStores),
      streamBuffers: Object.freeze(streamBuffers),
    };
  });
  // Input means write-call bytes; stdout means bytes delivered to the consumer.
  // On a failed stream these are not a claim of all bytes emitted/read by Rust.
  return { value, error, threw, wire };
}
