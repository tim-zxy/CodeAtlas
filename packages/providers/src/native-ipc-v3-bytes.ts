import { createHash } from 'node:crypto';
import { createNativeRequestWorkspaceObservation } from './native-refresh-workspace-observation.js';
import { type NativeAnalysisStateBundleV1 } from './native-analysis-state.js';
import {
  NativeV3ContractError,
  validateNativeRequestRecordsV3,
  type NativeRequestHeaderV3,
  type NativeRequestRecordV3,
} from './native-ipc-v3.js';

/** Pure bounded input validation. It neither dispatches a process nor activates analysis state. */
export function decodeNativeRequestV3(bytes: Uint8Array): {
  header: NativeRequestHeaderV3;
  baseline: NativeAnalysisStateBundleV1 | null;
} {
  const observe = createNativeRequestWorkspaceObservation('PREVALIDATION');
  observe?.('BEGIN');
  try {
    return decodeNativeRequestWorkspace(bytes, observe);
  } catch (error) {
    observe?.('FAILED');
    throw error;
  } finally {
    observe?.('EXIT');
  }
}

function decodeNativeRequestWorkspace(
  bytes: Uint8Array,
  observe: ReturnType<typeof createNativeRequestWorkspaceObservation>,
): { header: NativeRequestHeaderV3; baseline: NativeAnalysisStateBundleV1 | null } {
  const fail = (code: ConstructorParameters<typeof NativeV3ContractError>[0]): never => {
    throw new NativeV3ContractError(code);
  };
  if (bytes.byteLength > 1_000_000) fail('RESOURCE_LIMIT_EXCEEDED');
  if (
    !bytes.length ||
    bytes.at(-1) !== 10 ||
    bytes.includes(13) ||
    (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191)
  )
    fail('PROTOCOL_CORRUPTION');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail('PROTOCOL_CORRUPTION');
  }
  observe?.('TEXT_DECODED', { textCodeUnits: text.length });
  const lines = text.slice(0, -1).split('\n');
  observe?.('LINES_SPLIT', { lineCount: lines.length });
  if (lines.some((line) => !line.trim())) fail('PROTOCOL_CORRUPTION');
  let records: NativeRequestRecordV3[];
  try {
    records = lines.map((line) => JSON.parse(line) as NativeRequestRecordV3);
  } catch {
    return fail('PROTOCOL_CORRUPTION');
  }
  observe?.('RECORDS_PARSED', { parsedRecordCount: records.length });
  if (records.some((r, i) => r?.type === 'REQUEST_COMPLETED' && i !== records.length - 1))
    fail('PROTOCOL_CORRUPTION');
  const header = validateNativeRequestRecordsV3(records);
  const last = records.at(-1)!;
  if (last.type !== 'REQUEST_COMPLETED') fail('PROTOCOL_CORRUPTION');
  // Find the terminal LF's preceding record boundary in bytes, not UTF-16 text offsets.
  const prefixEnd = bytes.lastIndexOf(10, bytes.length - 2) + 1;
  const checksum = createHash('sha256').update(bytes.subarray(0, prefixEnd)).digest('hex');
  if (last.type === 'REQUEST_COMPLETED' && checksum !== last.payload.integrityChecksum)
    fail('PROTOCOL_CORRUPTION');
  const result = {
    header,
    baseline:
      header.type === 'ANALYZE'
        ? null
        : {
            header: header.payload.baselineState,
            summaries: records.flatMap((r) => (r.type === 'BASELINE_SUMMARY' ? [r.payload] : [])),
          },
  };
  observe?.('VALIDATED', { baselineSummaries: result.baseline?.summaries.length ?? 0 });
  return result;
}
