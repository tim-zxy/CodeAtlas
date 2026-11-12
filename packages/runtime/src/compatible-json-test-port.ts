// Private response-side P1-11 adapter; no HTTP client, credentials or production authority.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { parseDocument } from 'yaml';
import type { RuntimeWorkflowRequest } from '@codeatlas/application';
import { canonicalCompilationJson } from '../../application/dist/compilation-input-contract.js';

type Control = RuntimeWorkflowRequest['control'];
type Identity = { providerId: string; modelId: string; adapterVersion: string };
type Options = {
  identity: Identity;
  maxResponseBytes: number;
  exchange: (request: unknown, control: Control) => Promise<string>;
};
function decode(text: string) {
  const value = JSON.parse(text);
  // JSON.parse supplies strict JSON grammar; the already-approved YAML parser
  // checks raw duplicate object keys before their ambiguity can be discarded.
  assert.equal(
    parseDocument(text, { schema: 'json', uniqueKeys: true, strict: true }).errors.length,
    0,
    'INVALID_COMPATIBLE_JSON',
  );
  return value;
}
function fields(value: unknown, keys: string[]): Record<string, unknown> {
  assert(
    value && typeof value === 'object' && !types.isProxy(value),
    'INVALID_COMPATIBLE_TEST_PORT',
  );
  assert(
    [Object.prototype, null].includes(Object.getPrototypeOf(value)),
    'INVALID_COMPATIBLE_TEST_PORT',
  );
  const own = Object.getOwnPropertyDescriptors(value),
    result: Record<string, unknown> = {};
  assert.equal(Reflect.ownKeys(value).length, keys.length, 'INVALID_COMPATIBLE_TEST_PORT');
  for (const key of keys) {
    const descriptor = own[key];
    assert(
      descriptor?.enumerable && Object.hasOwn(descriptor, 'value'),
      'INVALID_COMPATIBLE_TEST_PORT',
    );
    result[key] = descriptor.value;
  }
  return result;
}
/** Trusted exchange is a self-owned test seam, never an endpoint or permission.
 * Response decoding is byte-bounded; exchange itself must settle its own work.
 * Application alone accounts usage and validates candidate identity/references. */
export function createCompatibleJsonTestPort(options: Options) {
  const fixed = fields(options, ['identity', 'maxResponseBytes', 'exchange']);
  const supplied = fields(fixed.identity, ['providerId', 'modelId', 'adapterVersion']);
  assert(
    Object.values(supplied).every((v) => typeof v === 'string' && v.length > 0 && v.trim() === v),
    'INVALID_COMPATIBLE_TEST_PORT',
  );
  assert(
    Number.isSafeInteger(fixed.maxResponseBytes) && (fixed.maxResponseBytes as number) > 0,
    'INVALID_COMPATIBLE_TEST_PORT',
  );
  assert(
    typeof fixed.exchange === 'function' && !types.isProxy(fixed.exchange),
    'INVALID_COMPATIBLE_TEST_PORT',
  );
  const identity = Object.freeze({ ...supplied }) as Identity,
    maximum = fixed.maxResponseBytes as number;
  const exchange = fixed.exchange as Options['exchange'];
  return Object.freeze({
    evidenceKind: 'TEST_DOUBLE' as const,
    identity,
    capabilities: Object.freeze({ outputMode: 'JSON' as const }),
    async generate(request: unknown, control: Control) {
      const pending: unknown = exchange(request, control);
      assert(types.isPromise(pending), 'INVALID_COMPATIBLE_TEST_EXCHANGE');
      const text: unknown = await pending;
      assert(
        typeof text === 'string' &&
          text.length <= maximum &&
          Buffer.byteLength(text, 'utf8') <= maximum,
        'COMPATIBLE_RESPONSE_TOO_LARGE',
      );
      const wire = decode(text);
      assert(
        wire && typeof wire === 'object' && !Array.isArray(wire),
        'INVALID_COMPATIBLE_RESPONSE',
      );
      const choice =
        Array.isArray(wire.choices) && wire.choices.length === 1 ? wire.choices[0] : null;
      let structuredOutput: unknown = null,
        outputDigest = '',
        finishReason = 'INVALID';
      if (
        choice?.index === 0 &&
        choice.message?.role === 'assistant' &&
        choice.message.refusal == null &&
        !Object.hasOwn(choice.message, 'tool_calls')
      ) {
        if (choice.finish_reason === 'length') finishReason = 'LENGTH';
        else if (choice.finish_reason === 'stop' && typeof choice.message.content === 'string') {
          try {
            structuredOutput = decode(choice.message.content);
            outputDigest = createHash('sha256')
              .update(canonicalCompilationJson(structuredOutput, control))
              .digest('hex');
            finishReason = 'STOP';
          } catch {
            // Keep an already-decoded tree: Application settles usage, then applies
            // its original depth/work/cancellation checks before candidate admission.
          }
        }
      }
      // Preserve known usage even for refusal, malformed content, identity mismatch,
      // or cancellation after transport settlement. Existing Application checks win.
      return {
        structuredOutput,
        identity: { ...identity, modelId: wire.model },
        usage: {
          inputTokens: wire.usage?.prompt_tokens,
          outputTokens: wire.usage?.completion_tokens,
        },
        finishReason,
        outputDigest,
        warnings: [],
      };
    },
  });
}
