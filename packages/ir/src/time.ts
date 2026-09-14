import { z } from 'zod';

import { IrValidationError } from './errors.js';
import { parseIr } from './validation.js';

const UtcInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const UtcInstantSchema = z
  .string()
  .regex(UtcInstantPattern)
  .refine((value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString() === value;
  }, 'UTC instants must be canonical ISO-8601 millisecond instants')
  .brand<'UtcInstant'>();
export type UtcInstant = z.infer<typeof UtcInstantSchema>;

export const EpochMillisecondsSchema = z
  .number()
  .finite()
  .int()
  .refine(Number.isSafeInteger, { message: 'Epoch milliseconds must be safe integers' })
  .refine((value) => !Object.is(value, -0), {
    message: 'Epoch milliseconds must not be negative zero',
  })
  .brand<'EpochMilliseconds'>();
export type EpochMilliseconds = z.infer<typeof EpochMillisecondsSchema>;

export function utcInstantToEpochMilliseconds(value: UtcInstant): EpochMilliseconds {
  const instant = parseIr(UtcInstantSchema, value);
  return parseIr(EpochMillisecondsSchema, new Date(instant).getTime());
}

export function epochMillisecondsToUtcInstant(value: EpochMilliseconds): UtcInstant {
  const epochMilliseconds = parseIr(EpochMillisecondsSchema, value);
  const date = new Date(epochMilliseconds);

  if (!Number.isFinite(date.getTime())) {
    throw new IrValidationError([
      {
        path: [],
        message: 'Epoch milliseconds cannot be represented as a UTC instant',
      },
    ]);
  }

  return parseIr(UtcInstantSchema, date.toISOString());
}
