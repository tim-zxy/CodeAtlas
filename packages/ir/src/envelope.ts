import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';

import { IrValidationError, SchemaMismatchError, UnsupportedSchemaVersionError } from './errors.js';
import { parseIr } from './validation.js';

export const JsonValueSchema = z
  .unknown()
  .superRefine((value, context) => {
    const ancestors = new Set<object>();

    function visit(current: unknown, path: (string | number)[]): void {
      if (typeof current === 'number' && (!Number.isFinite(current) || Object.is(current, -0))) {
        context.addIssue({
          code: 'custom',
          path,
          message: 'JSON numbers must be finite and not negative zero',
        });
        return;
      }
      if (current === null || typeof current !== 'object') return;

      if (ancestors.has(current)) {
        context.addIssue({ code: 'custom', path, message: 'JSON values must not contain cycles' });
        return;
      }

      ancestors.add(current);
      for (const [key, child] of Object.entries(current)) {
        visit(child, [...path, Array.isArray(current) ? Number(key) : key]);
      }
      ancestors.delete(current);
    }

    visit(value, []);
  })
  .pipe(z.json());
export type JsonValue = z.infer<typeof JsonValueSchema>;

export const SchemaEnvelopeSchema = z.strictObject({
  schema: z
    .string()
    .min(1)
    .refine((value) => value === value.trim(), {
      message: 'Schema names must not have surrounding whitespace',
    }),
  version: z.number().int().positive().refine(Number.isSafeInteger),
  payload: JsonValueSchema,
});

type RawSchemaEnvelope = z.infer<typeof SchemaEnvelopeSchema>;
export type SchemaEnvelope<TPayload extends JsonValue = JsonValue> = Omit<
  RawSchemaEnvelope,
  'payload'
> &
  Readonly<{ payload: TPayload }>;

export interface SchemaDescriptor<TPayloadSchema extends z.ZodType<JsonValue>> {
  readonly schema: string;
  readonly version: number;
  readonly payload: TPayloadSchema;
}

const SchemaDescriptorValuesSchema = SchemaEnvelopeSchema.pick({
  schema: true,
  version: true,
});

function parseSchemaDescriptor<TPayloadSchema extends z.ZodType<JsonValue>>(
  descriptor: SchemaDescriptor<TPayloadSchema>,
): z.output<typeof SchemaDescriptorValuesSchema> {
  return parseIr(SchemaDescriptorValuesSchema, {
    schema: descriptor.schema,
    version: descriptor.version,
  });
}

function createPayloadSchema<TPayloadSchema extends z.ZodType<JsonValue>>(
  payloadSchema: TPayloadSchema,
) {
  return JsonValueSchema.transform((input, context): z.output<TPayloadSchema> => {
    // Snapshot before invoking a caller schema, which may mutate its argument.
    const original: JsonValue = JSON.parse(JSON.stringify(input));
    const result = payloadSchema.safeParse(input);
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
      }
      return z.NEVER;
    }

    const output = JsonValueSchema.safeParse(result.data);
    if (!output.success) {
      for (const issue of output.error.issues) {
        context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
      }
      return z.NEVER;
    }

    if (!isDeepStrictEqual(original, result.data)) {
      context.addIssue({ code: 'custom', message: 'Payload schemas must preserve JSON values' });
      return z.NEVER;
    }

    // JSON validation preserves the schema's value while removing non-JSON metadata.
    return output.data as z.output<TPayloadSchema>;
  });
}

export function createSchemaEnvelopeSchema<
  const TSchema extends string,
  const TVersion extends number,
  TPayloadSchema extends z.ZodType<JsonValue>,
>(
  descriptor: SchemaDescriptor<TPayloadSchema> & {
    readonly schema: TSchema;
    readonly version: TVersion;
  },
): z.ZodType<SchemaEnvelope<z.output<TPayloadSchema>>> {
  const { schema, version } = parseSchemaDescriptor(descriptor);
  // The preceding envelope schema has already narrowed the payload to JSON.
  const payloadSchema = createPayloadSchema(descriptor.payload) as z.ZodType<
    z.output<TPayloadSchema>,
    JsonValue
  >;

  return SchemaEnvelopeSchema.pipe(
    z.strictObject({
      schema: z.literal(schema),
      version: z.literal(version),
      payload: payloadSchema,
    }),
  );
}

export function parseSchemaEnvelope<TPayloadSchema extends z.ZodType<JsonValue>>(
  descriptor: SchemaDescriptor<TPayloadSchema>,
  input: unknown,
): SchemaEnvelope<z.output<TPayloadSchema>> {
  const envelope = parseIr(SchemaEnvelopeSchema, input);
  const expected = parseSchemaDescriptor(descriptor);

  if (envelope.schema !== expected.schema) {
    throw new SchemaMismatchError(expected.schema, envelope.schema);
  }

  if (envelope.version !== expected.version) {
    throw new UnsupportedSchemaVersionError(expected.schema, expected.version, envelope.version);
  }

  let payload: z.output<TPayloadSchema>;
  try {
    payload = parseIr(createPayloadSchema(descriptor.payload), envelope.payload);
  } catch (error: unknown) {
    if (error instanceof IrValidationError) {
      throw new IrValidationError(
        error.issues.map((issue) => ({
          path: ['payload', ...issue.path],
          message: issue.message,
        })),
      );
    }

    throw error;
  }

  return {
    schema: envelope.schema,
    version: envelope.version,
    payload,
  };
}
