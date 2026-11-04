import {
  spendCodeSyntaxBudget,
  chargeCodeSyntaxJSON,
  preflightCodeSyntaxJSON,
  type CodeSyntaxCompositionBudget,
} from './native-code-syntax-budget.js';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { z } from 'zod';
import { ensurePhase1Data } from '@codeatlas/ir';
import type { NativeIpcErrorCode } from './native-ipc.js';
import {
  SyntaxObservationRequestSchema,
  parseSyntaxObservationRequest,
  NativeSyntaxContractError,
} from './native-syntax-ipc.js';
import { NATIVE_CLIENT_HARD_LIMITS } from './native-client.js';
const integer = z
  .number()
  .int()
  .safe()
  .nonnegative()
  .refine((v) => !Object.is(v, -0));
const contract = z.literal('PYTHON_SYNTAX_CODE_V1');
const envelope = {
  protocolVersion: z.literal(5),
  requestId: SyntaxObservationRequestSchema.shape.requestId,
  sequence: integer,
};
export const CodeSyntaxRequestSchema = z.strictObject({
  ...envelope,
  sequence: z.literal(0),
  type: z.literal('OBSERVE_CODE_SYNTAX'),
  payload: SyntaxObservationRequestSchema.shape.payload.extend({ codeContract: contract }),
});
export type CodeSyntaxRequest = z.infer<typeof CodeSyntaxRequestSchema>;
function check(value: unknown, code: NativeIpcErrorCode = 'PROTOCOL_CORRUPTION'): asserts value {
  if (!value) throw new NativeSyntaxContractError(code);
}
const typed = Object.getPrototypeOf(Uint8Array.prototype) as object;
const lengthOf = Object.getOwnPropertyDescriptor(typed, 'byteLength')!.get!;
const bufferOf = Object.getOwnPropertyDescriptor(typed, 'buffer')!.get!;
function copyCodeSyntaxBytesCore(
  value: Uint8Array,
  limit: number,
  code: NativeIpcErrorCode,
  context: CodeSyntaxCompositionBudget | null,
): Buffer {
  check(value !== null && typeof value === 'object' && !types.isProxy(value), code);
  check(
    types.isUint8Array(value) &&
      (Object.getPrototypeOf(value) === Buffer.prototype ||
        Object.getPrototypeOf(value) === Uint8Array.prototype),
    code,
  );
  check(!types.isSharedArrayBuffer(bufferOf.call(value)), code);
  const length = lengthOf.call(value) as number;
  check(length <= limit, 'RESOURCE_LIMIT_EXCEEDED');
  if (context) spendCodeSyntaxBudget(context, 'serializedBytes', length);
  const result = Buffer.alloc(length);
  Uint8Array.prototype.set.call(result, value);
  return result;
}
export function copyCodeSyntaxBytes(
  value: Uint8Array,
  limit: number,
  code: NativeIpcErrorCode,
): Buffer {
  return copyCodeSyntaxBytesCore(value, limit, code, null);
}
export function copyCodeSyntaxBytesWithBudget(
  value: Uint8Array,
  limit: number,
  code: NativeIpcErrorCode,
  context: CodeSyntaxCompositionBudget,
): Buffer {
  return copyCodeSyntaxBytesCore(value, limit, code, context);
}
export function assertCodeSyntaxData(
  value: unknown,
  maxDepth: number,
  code: NativeIpcErrorCode,
): void {
  const pending: [unknown, number][] = [[value, 0]];
  while (pending.length) {
    const [v, depth] = pending.pop()!;
    check(depth <= maxDepth, 'RESOURCE_LIMIT_EXCEEDED');
    if (typeof v === 'string') check(v.isWellFormed(), code);
    if (v !== null && typeof v === 'object')
      for (const [key, child] of Object.entries(v)) {
        check(key.isWellFormed(), code);
        pending.push([child, depth + 1]);
      }
  }
  ensurePhase1Data(value);
}
function decodeCodeSyntaxLineCore(
  raw: Buffer,
  code: NativeIpcErrorCode,
  context: CodeSyntaxCompositionBudget | null,
): unknown {
  check(
    raw.length > 0 &&
      raw.at(-1) === 10 &&
      !raw.subarray(0, -1).includes(10) &&
      !raw.includes(13) &&
      !(raw[0] === 239 && raw[1] === 187 && raw[2] === 191),
    code,
  );
  if (context) {
    spendCodeSyntaxBudget(context, 'serializedBytes', raw.length);
    preflightCodeSyntaxJSON(raw, context);
  }
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  if (context) chargeCodeSyntaxJSON(value, code, context);
  return value;
}
export function decodeCodeSyntaxLine(raw: Buffer, code: NativeIpcErrorCode): unknown {
  return decodeCodeSyntaxLineCore(raw, code, null);
}
export function decodeCodeSyntaxLineWithBudget(
  raw: Buffer,
  code: NativeIpcErrorCode,
  context: CodeSyntaxCompositionBudget,
): unknown {
  return decodeCodeSyntaxLineCore(raw, code, context);
}
const sha = (raw: Buffer) => createHash('sha256').update(raw).digest('hex');
export default function readCodeSyntaxRequestSnapshotCore(
  requestBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget | null,
  binding: boolean | 7 | 8 = false,
): {
  readonly bytes: Buffer;
  readonly request: Omit<CodeSyntaxRequest, 'protocolVersion' | 'payload'> & {
    protocolVersion: 5 | 6 | 7 | 8;
    payload: CodeSyntaxRequest['payload'] & {
      syntaxContract?: 'SYNTAX_BINDING_V2' | 'SYNTAX_BINDING_V3' | 'SYNTAX_BINDING_V4';
    };
  };
  readonly requestChecksum: string;
} {
  try {
    const raw = copyCodeSyntaxBytesCore(
      requestBytes,
      Math.min(NATIVE_CLIENT_HARD_LIMITS.maxStdinBytes, NATIVE_CLIENT_HARD_LIMITS.maxLineBytes),
      'INVALID_REQUEST',
      context,
    );
    const value = decodeCodeSyntaxLineCore(raw, 'INVALID_REQUEST', context);
    if (value !== null && typeof value === 'object' && 'protocolVersion' in value)
      check(
        value.protocolVersion === (binding === 8 ? 8 : binding === 7 ? 7 : binding ? 6 : 5),
        'INCOMPATIBLE_PROTOCOL_VERSION',
      );
    if (context) assertCodeSyntaxData(value, context.limits.maxDepth, 'INVALID_REQUEST');
    const request = (
        binding
          ? CodeSyntaxRequestSchema.extend({
              protocolVersion: z.literal(binding === 8 ? 8 : binding === 7 ? 7 : 6),
              payload: CodeSyntaxRequestSchema.shape.payload.extend({
                extractorVersion:
                  binding === 8
                    ? z.literal('syntax-v2')
                    : CodeSyntaxRequestSchema.shape.payload.shape.extractorVersion,
                syntaxContract: z.literal(
                  binding === 8
                    ? 'SYNTAX_BINDING_V4'
                    : binding === 7
                      ? 'SYNTAX_BINDING_V3'
                      : 'SYNTAX_BINDING_V2',
                ),
              }),
            })
          : CodeSyntaxRequestSchema
      ).parse(value),
      p = request.payload;
    if (context) chargeCodeSyntaxJSON(request, 'INVALID_REQUEST', context);
    check(raw.length <= p.resourceBudget.maxInputBytes, 'RESOURCE_LIMIT_EXCEEDED');
    assertCodeSyntaxData(value, p.resourceBudget.maxDepth, 'INVALID_REQUEST');
    const { codeContract: _contract, ...view } = p;
    const commonPayload = binding
      ? Object.fromEntries(Object.entries(view).filter(([key]) => key !== 'syntaxContract'))
      : view;
    // A checked internal context view, never a downgrade or a constructed legacy output.
    if (context) chargeCodeSyntaxJSON(commonPayload, 'INVALID_REQUEST', context);
    const commonRequest = {
      protocolVersion: 4,
      requestId: request.requestId,
      sequence: 0,
      type: 'OBSERVE_SYNTAX',
      payload: commonPayload,
    };
    if (context) chargeCodeSyntaxJSON(commonRequest, 'INVALID_REQUEST', context);
    const checked = parseSyntaxObservationRequest(commonRequest);
    if (context) chargeCodeSyntaxJSON(checked, 'INVALID_REQUEST', context);
    return { bytes: raw, request, requestChecksum: sha(raw) };
  } catch (error) {
    if (error instanceof NativeSyntaxContractError) throw error;
    throw new NativeSyntaxContractError('INVALID_REQUEST');
  }
}

export function readCodeSyntaxRequestSnapshot(requestBytes: Uint8Array): {
  readonly bytes: Buffer;
  readonly request: CodeSyntaxRequest;
  readonly requestChecksum: string;
} {
  return readCodeSyntaxRequestSnapshotCore(requestBytes, null) as {
    bytes: Buffer;
    request: CodeSyntaxRequest;
    requestChecksum: string;
  };
}
export function readCodeSyntaxRequestSnapshotWithBudget(
  requestBytes: Uint8Array,
  context: CodeSyntaxCompositionBudget,
): {
  readonly bytes: Buffer;
  readonly request: CodeSyntaxRequest;
  readonly requestChecksum: string;
} {
  return readCodeSyntaxRequestSnapshotCore(requestBytes, context) as {
    bytes: Buffer;
    request: CodeSyntaxRequest;
    requestChecksum: string;
  };
}
