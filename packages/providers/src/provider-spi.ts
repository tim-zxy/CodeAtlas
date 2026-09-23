import {
  IrValidationError,
  JsonValueSchema,
  ProviderIdSchema,
  ProviderVersionSchema,
  parseIr,
} from '@codeatlas/ir';
import { z } from 'zod';

import {
  NativeEventStreamSchema,
  NativeRequestEnvelopeSchema,
  type NativeEventEnvelope,
  type NativeEventStream,
  type NativeRequestEnvelope,
} from './native-ipc.js';

const ExactStringSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value === value.trim(), 'Value must be exact and non-blank');

const UniqueStringsSchema = z
  .array(ExactStringSchema)
  .min(1)
  .superRefine((values, context) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({ code: 'custom', path: [index], message: 'Values must be unique' });
      }
      seen.add(value);
    });
  });

const UniqueVersionsSchema = z
  .array(z.number().int().safe().positive())
  .min(1)
  .superRefine((values, context) => {
    const seen = new Set<number>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({ code: 'custom', path: [index], message: 'Values must be unique' });
      }
      seen.add(value);
    });
  });

export const ProviderDescriptorSchema = z.strictObject({
  providerId: ProviderIdSchema,
  providerVersion: ProviderVersionSchema,
  protocolVersions: UniqueVersionsSchema,
  irSchemaVersions: UniqueVersionsSchema,
  languages: UniqueStringsSchema,
  capabilities: UniqueStringsSchema,
});
export type ProviderDescriptor = z.infer<typeof ProviderDescriptorSchema>;

function envelopeSchema<TType extends 'ANALYZE' | 'REFRESH'>(type: TType) {
  return NativeRequestEnvelopeSchema.pipe(
    z.custom<Extract<NativeRequestEnvelope, { type: TType }>>(
      (value) =>
        typeof value === 'object' && value !== null && 'type' in value && value.type === type,
    ),
  );
}

export type ReadonlyJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly ReadonlyJsonValue[]
  | { readonly [key: string]: ReadonlyJsonValue };

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) freezeDeep(nested);
    Object.freeze(value);
  }
  return value;
}

const ReadonlyConfigurationSchema = JsonValueSchema.transform((value): ReadonlyJsonValue =>
  freezeDeep(value),
);

export const FullAnalysisRequestSchema = z.strictObject({
  envelope: envelopeSchema('ANALYZE'),
  configuration: ReadonlyConfigurationSchema,
  signal: z.custom<AbortSignal>((value) => value instanceof AbortSignal),
});
export type FullAnalysisRequest = z.infer<typeof FullAnalysisRequestSchema>;

export const RefreshAnalysisRequestSchema = z.strictObject({
  envelope: envelopeSchema('REFRESH'),
  configuration: ReadonlyConfigurationSchema,
  signal: z.custom<AbortSignal>((value) => value instanceof AbortSignal),
});
export type RefreshAnalysisRequest = z.infer<typeof RefreshAnalysisRequestSchema>;

export interface CodeIntelligenceProvider {
  describe(): Promise<ProviderDescriptor>;
  analyze(request: FullAnalysisRequest): AsyncIterable<NativeEventEnvelope>;
  refresh(request: RefreshAnalysisRequest): AsyncIterable<NativeEventEnvelope>;
}

export class ProviderContractError extends Error {
  constructor(
    readonly code: 'CANCELLED' | 'PROVIDER_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderContractError';
  }
}

function cancelled(): ProviderContractError {
  return new ProviderContractError('CANCELLED', 'Provider analysis was cancelled');
}

function nextOrAbort(
  iterator: AsyncIterator<NativeEventEnvelope>,
  signal: AbortSignal,
): Promise<IteratorResult<NativeEventEnvelope>> {
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(cancelled());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      void iterator.next().then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    } catch (error) {
      signal.removeEventListener('abort', onAbort);
      reject(error);
    }
  });
}

export async function validateProviderStream(
  request: FullAnalysisRequest | RefreshAnalysisRequest,
  events: AsyncIterable<NativeEventEnvelope>,
): Promise<NativeEventStream> {
  const validatedRequest =
    request.envelope?.type === 'ANALYZE'
      ? parseIr(FullAnalysisRequestSchema, request)
      : parseIr(RefreshAnalysisRequestSchema, request);
  const { signal, envelope } = validatedRequest;
  if (signal.aborted) throw cancelled();

  const iterator = events[Symbol.asyncIterator]();
  const collected: NativeEventEnvelope[] = [];
  let complete = false;
  try {
    while (true) {
      const next = await nextOrAbort(iterator, signal);
      if (signal.aborted) throw cancelled();
      if (next.done) break;
      collected.push(next.value);
      if (collected.length > envelope.payload.resourceBudget.maxEvents) {
        throw new IrValidationError([
          { path: ['events'], message: 'Event count exceeds the request budget' },
        ]);
      }
    }
    complete = true;
  } finally {
    if (!complete) {
      if (signal.aborted) {
        try {
          void Promise.resolve(iterator.return?.()).catch(() => undefined);
        } catch {
          // Cancellation must remain prompt even if cleanup fails synchronously.
        }
      } else {
        await iterator.return?.();
      }
    }
  }

  const stream = parseIr(NativeEventStreamSchema, { request: envelope, events: collected });
  if (signal.aborted) throw cancelled();
  const terminal = stream.events.at(-1);
  if (
    terminal?.type === 'ANALYSIS_FAILED' ||
    terminal?.type === 'REFRESH_FAILED' ||
    terminal?.type === 'REQUEST_FAILED'
  ) {
    throw new ProviderContractError('PROVIDER_FAILED', 'Provider analysis failed');
  }
  return stream;
}
