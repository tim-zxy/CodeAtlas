import { AsyncLocalStorage } from 'node:async_hooks';

type Phase =
  | 'INPUT_COPY'
  | 'STATE_READY'
  | 'CHUNK'
  | 'FRAGMENT_BUFFERED'
  | 'LINE_BEGIN'
  | 'EVENT_PARSED'
  | 'SINK_BEGIN'
  | 'SINK_SETTLED'
  | 'TARGET_LEDGER'
  | 'FAILED'
  | 'EXIT';
type Fields = typeof emptyFields;
const emptyFields = {
  ownedInputBytes: null as number | null,
  ownedInputBackingBytes: null as number | null,
  pendingBytes: null as number | null,
  chunkBytes: null as number | null,
  lineBytes: null as number | null,
  baselineSummaries: null as number | null,
  targetFiles: null as number | null,
  changedFiles: null as number | null,
  baselineLedger: null as number | null,
  operations: null as number | null,
  summaries: null as number | null,
  coverage: null as number | null,
  diagnostics: null as number | null,
  targetLedger: null as number | null,
};
type Record = Readonly<
  Fields & {
    scope: 'DECODER_WORKSPACE_STRUCTURE_ONLY';
    phase: Phase;
    decoderId: number;
  }
>;
type RequestComponent = 'ENCODER' | 'PREVALIDATION' | 'CLIENT';
type RequestPhase =
  | 'BEGIN'
  | 'RECORD_APPENDED'
  | 'REQUEST_PARSED'
  | 'BASELINE_PARSED'
  | 'JOINED'
  | 'TEXT_DECODED'
  | 'LINES_SPLIT'
  | 'RECORDS_PARSED'
  | 'VALIDATED'
  | 'COPY'
  | 'RECORDS_READY'
  | 'FAILED'
  | 'EXIT';
const emptyRequestFields = {
  recordCount: null as number | null,
  recordBytes: null as number | null,
  joinedBytes: null as number | null,
  joinedBackingBytes: null as number | null,
  textCodeUnits: null as number | null,
  lineCount: null as number | null,
  parsedRecordCount: null as number | null,
  baselineSummaries: null as number | null,
  clientBytes: null as number | null,
  clientBackingBytes: null as number | null,
};
type RequestRecord = Readonly<
  typeof emptyRequestFields & {
    scope: 'REQUEST_WORKSPACE_STRUCTURE_ONLY';
    component: RequestComponent;
    phase: RequestPhase;
    invocationId: number;
  }
>;
const context = new AsyncLocalStorage<{
  accept: (record: Record) => void;
  acceptRequest: ((record: RequestRecord) => void) | undefined;
  captureFailed: boolean;
  decoders: number;
  requestOperations: number;
  active: boolean;
}>();

/** Private offline diagnostic scope, deliberately absent from the package index. */
export async function observeNativeRefreshWorkspace<T>(
  operation: () => T | Promise<T>,
  accept: (record: Record) => void,
  acceptRequest?: (record: RequestRecord) => void,
) {
  const owner = {
    accept,
    acceptRequest,
    captureFailed: false,
    decoders: 0,
    requestOperations: 0,
    active: true,
  };
  return context.run(owner, async () => {
    let value: T | null = null,
      error: unknown = null,
      threw = false;
    try {
      value = await operation();
    } catch (failure) {
      threw = true;
      error = failure;
    } finally {
      owner.active = false;
    }
    return { value, error, threw, captureFailed: owner.captureFailed };
  });
}

/** Separate private callback keeps existing decoder records and identities unchanged. */
export function createNativeRequestWorkspaceObservation(component: RequestComponent) {
  const owner = context.getStore();
  if (!owner?.active || !owner.acceptRequest) return undefined;
  const invocationId = ++owner.requestOperations;
  let fields = { ...emptyRequestFields };
  return (phase: RequestPhase, changed: Partial<typeof emptyRequestFields> = {}) => {
    if (!owner.active || owner.captureFailed) return;
    fields = { ...fields, ...changed };
    try {
      owner.acceptRequest!(
        Object.freeze({
          ...fields,
          scope: 'REQUEST_WORKSPACE_STRUCTURE_ONLY',
          component,
          phase,
          invocationId,
        }),
      );
    } catch {
      owner.captureFailed = true;
    }
  };
}

/** Scalar snapshots only: no raw objects, cumulative heap estimate or public hook. */
export function createNativeRefreshWorkspaceObservation() {
  const owner = context.getStore();
  if (!owner?.active) return undefined;
  const decoderId = ++owner.decoders;
  let fields = { ...emptyFields };
  return (phase: Phase, changed: Partial<Fields> = {}) => {
    if (!owner.active) return;
    fields = { ...fields, ...changed };
    if (owner.captureFailed) return;
    try {
      owner.accept(
        Object.freeze({ ...fields, scope: 'DECODER_WORKSPACE_STRUCTURE_ONLY', phase, decoderId }),
      );
    } catch {
      // A broken trusted capture invalidates evidence, never the decoded operation.
      owner.captureFailed = true;
    }
  };
}
