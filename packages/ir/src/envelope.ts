import { z } from 'zod';

import { IrValidationError, SchemaMismatchError, UnsupportedSchemaVersionError } from './errors.js';
import { parseIr } from './validation.js';

export const JsonValueSchema = z.json();
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
  const payloadSchema = descriptor.payload as unknown as z.ZodType<
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
    payload = parseIr(descriptor.payload, envelope.payload);
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
