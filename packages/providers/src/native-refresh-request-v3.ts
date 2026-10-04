import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { NativeAnalysisStateBundleV1 } from './native-analysis-state.js';
import {
  NativeClientError,
  NATIVE_CLIENT_HARD_LIMITS,
  type NativeClientLimits,
} from './native-client.js';
import { decodeNativeRequestV3 } from './native-ipc-v3-bytes.js';
import type { NativeRefreshRequestV3 } from './native-refresh-output-v3.js';
import { boundedJson } from './native-request-json.js';

/** Owned, LF-inclusive bounded input. This proves wire integrity, not Runtime admission. */
export function encodeNativeRefreshRequestV3(
  requestValue: NativeRefreshRequestV3,
  baselineValue: NativeAnalysisStateBundleV1,
  limits: NativeClientLimits,
  expectedMemoryBudgetBytes: number,
): Uint8Array {
  if (!Number.isSafeInteger(expectedMemoryBudgetBytes) || expectedMemoryBudgetBytes <= 0)
    throw new NativeClientError(
      'INVALID_CONFIGURATION',
      'Native refresh trusted budget is invalid',
    );
  for (const key of Object.keys(NATIVE_CLIENT_HARD_LIMITS) as (keyof NativeClientLimits)[])
    if (
      !Number.isSafeInteger(limits?.[key]) ||
      limits[key] <= 0 ||
      limits[key] > NATIVE_CLIENT_HARD_LIMITS[key]
    )
      throw new NativeClientError(
        'INVALID_CONFIGURATION',
        'Native refresh limits must lower ceilings',
      );
  const invalid = (): never => {
    throw new NativeClientError('INVALID_REQUEST', 'Native refresh request is invalid');
  };
  function serialize(value: unknown, cap: number): string {
    try {
      return boundedJson(value, cap);
    } catch (error) {
      throw new NativeClientError(
        error instanceof TypeError ? 'INVALID_REQUEST' : 'OUTPUT_LIMIT_EXCEEDED',
        'Native refresh input is invalid or exceeds limit',
      );
    }
  }
  const records: Buffer[] = [],
    hash = createHash('sha256');
  let total = 0;
  function append(value: unknown, checksum = true): string {
    const text =
      serialize(value, Math.min(limits.maxLineBytes, limits.maxStdinBytes - total) - 1) + '\n';
    const bytes = Buffer.from(text);
    total += bytes.length;
    records.push(bytes);
    if (checksum) hash.update(bytes);
    return text;
  }
  const request = JSON.parse(append(requestValue)) as NativeRefreshRequestV3;
  if (
    request?.type !== 'REFRESH' ||
    request.payload?.resourceBudget?.maxMemoryBytes !== expectedMemoryBudgetBytes
  )
    invalid();
  // Bound the whole unknown bundle before traversing/sorting or schema allocation.
  // Its temporary owned copy is included in final D workspace calibration.
  const baseline = JSON.parse(
    serialize(baselineValue, limits.maxStdinBytes),
  ) as NativeAnalysisStateBundleV1;
  if (
    !baseline ||
    Object.keys(baseline).some((key) => !['header', 'summaries'].includes(key)) ||
    !isDeepStrictEqual(baseline.header, request.payload.baselineState) ||
    !Array.isArray(baseline.summaries) ||
    baseline.summaries.some((summary) => typeof summary?.sourceFile?.path !== 'string')
  )
    invalid();
  baseline.summaries.sort((a, b) =>
    Buffer.compare(Buffer.from(a.sourceFile.path), Buffer.from(b.sourceFile.path)),
  );
  for (const [index, payload] of baseline.summaries.entries())
    append({
      protocolVersion: 3,
      requestId: request.requestId,
      sequence: index + 1,
      type: 'BASELINE_SUMMARY',
      payload,
    });
  append(
    {
      protocolVersion: 3,
      requestId: request.requestId,
      sequence: baseline.summaries.length + 1,
      type: 'REQUEST_COMPLETED',
      payload: { summaryRecords: baseline.summaries.length, integrityChecksum: hash.digest('hex') },
    },
    false,
  );
  const bytes = Buffer.concat(records, total);
  try {
    decodeNativeRequestV3(bytes);
  } catch {
    invalid();
  }
  return bytes;
}
