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

type RequestOptions = Omit<Options, 'exchange'> & {
  maxRequestBytes: number;
  prompt: { promptRef: string; taskKind: string; outputSchemaRef: string; instructions: string };
  policy: { modelPolicyRef: string; maxOutputTokens: number };
  transport: (body: string, control: Control) => Promise<{ status: number; body: string }>;
};
/** Owned chat-JSON-v1 wire fixture only. Explicit bindings identify test bytes,
 * not a production prompt registry, model policy or permission to release context. */
export function createCompatibleJsonRequestTestPort(options: RequestOptions) {
  const fixed = fields(options, [
    'identity',
    'maxResponseBytes',
    'maxRequestBytes',
    'prompt',
    'policy',
    'transport',
  ]);
  const prompt = fields(fixed.prompt, ['promptRef', 'taskKind', 'outputSchemaRef', 'instructions']);
  const policy = fields(fixed.policy, ['modelPolicyRef', 'maxOutputTokens']);
  assert(
    [...Object.values(prompt), policy.modelPolicyRef].every(
      (value) => typeof value === 'string' && value.length > 0 && value.trim() === value,
    ),
    'INVALID_COMPATIBLE_REQUEST_BINDING',
  );
  for (const limit of [fixed.maxRequestBytes, policy.maxOutputTokens])
    assert(
      Number.isSafeInteger(limit) && (limit as number) > 0,
      'INVALID_COMPATIBLE_REQUEST_LIMIT',
    );
  assert(
    typeof fixed.transport === 'function' && !types.isProxy(fixed.transport),
    'INVALID_COMPATIBLE_TEST_TRANSPORT',
  );
  const transport = fixed.transport as RequestOptions['transport'];
  const port = createCompatibleJsonTestPort({
    identity: fixed.identity as Identity,
    maxResponseBytes: fixed.maxResponseBytes as number,
    async exchange(request, control) {
      const input = fields(request, [
        'taskKind',
        'promptRef',
        'modelPolicyRef',
        'outputSchemaRef',
        'authorizedContext',
        'inputDigest',
        'invocationBudget',
      ]);
      for (const key of ['taskKind', 'promptRef', 'outputSchemaRef'])
        assert.equal(input[key], prompt[key], 'COMPATIBLE_PROMPT_BINDING_MISMATCH');
      assert.equal(
        input.modelPolicyRef,
        policy.modelPolicyRef,
        'COMPATIBLE_POLICY_BINDING_MISMATCH',
      );
      const budget = fields(input.invocationBudget, ['maxInputBytes', 'maxOutputBytes']);
      assert(
        Number.isSafeInteger(budget.maxInputBytes) && (budget.maxInputBytes as number) > 0,
        'INVALID_COMPATIBLE_REQUEST_LIMIT',
      );
      const context = JSON.parse(canonicalCompilationJson(input.authorizedContext, control));
      assert.equal(context.instructionRef, prompt.promptRef, 'COMPATIBLE_PROMPT_BINDING_MISMATCH');
      assert.equal(context.dataLabel, 'UNTRUSTED_DATA', 'INVALID_COMPATIBLE_CONTEXT');
      const body = canonicalCompilationJson(
        {
          model: port.identity.modelId,
          stream: false,
          max_tokens: policy.maxOutputTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: prompt.instructions },
            { role: 'user', content: canonicalCompilationJson(context, control) },
          ],
        },
        control,
      );
      const maximum = Math.min(fixed.maxRequestBytes as number, budget.maxInputBytes as number);
      assert(
        body.length <= maximum && Buffer.byteLength(body, 'utf8') <= maximum,
        'COMPATIBLE_REQUEST_TOO_LARGE',
      );
      const pending: unknown = transport(body, control);
      assert(types.isPromise(pending), 'INVALID_COMPATIBLE_TEST_TRANSPORT');
      const response = fields(await pending, ['status', 'body']);
      assert.equal(response.status, 200, 'COMPATIBLE_STATUS_REFUSED');
      assert.equal(typeof response.body, 'string', 'INVALID_COMPATIBLE_RESPONSE');
      return response.body as string;
    },
  });
  return port;
}
