import { spawn } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isAbsolute } from 'node:path';
import type { Readable } from 'node:stream';

import {
  NativeEventEnvelopeSchema,
  NativeEventStreamSchema,
  NativeRequestEnvelopeSchema,
  type NativeEventEnvelope,
  type NativeIpcError,
  type NativeIpcRequestType,
  type NativeRequestEnvelope,
} from './native-ipc.js';

export const NATIVE_CLIENT_HARD_LIMITS = Object.freeze({
  maxStdinBytes: 1_000_000,
  maxLineBytes: 1_000_000,
  maxStdoutBytes: 10_000_000,
  maxEvents: 10_000,
  maxStderrBytes: 1_000_000,
} as const);

export interface NativeClientLimits {
  readonly maxStdinBytes: number;
  readonly maxLineBytes: number;
  readonly maxStdoutBytes: number;
  readonly maxEvents: number;
  readonly maxStderrBytes: number;
}

export interface NativeClientOptions {
  readonly executablePath: string;
  readonly arguments?: readonly string[];
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly allowedEnvironment?: Readonly<Record<string, string>>;
  readonly limits?: Partial<NativeClientLimits>;
}

export type NativeClientErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_REQUEST'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROCESS_FAILED'
  | 'PROTOCOL_VIOLATION'
  | 'OUTPUT_LIMIT_EXCEEDED'
  | 'CHECKSUM_MISMATCH'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'ANALYZER_FAILED';

export interface NativeClientErrorDetails {
  readonly requestId?: string;
  readonly exitCode?: number;
  readonly signal?: NodeJS.Signals;
  readonly analyzerError?: NativeIpcError;
  readonly stderr?: string;
}

export class NativeClientError extends Error {
  readonly code: NativeClientErrorCode;
  readonly requestId?: string;
  readonly exitCode?: number;
  readonly signal?: NodeJS.Signals;
  readonly analyzerError?: NativeIpcError;
  readonly stderr?: string;

  constructor(
    code: NativeClientErrorCode,
    message: string,
    details: NativeClientErrorDetails = {},
  ) {
    super(message);
    this.name = 'NativeClientError';
    this.code = code;
    if (details.requestId !== undefined) this.requestId = details.requestId;
    if (details.exitCode !== undefined) this.exitCode = details.exitCode;
    if (details.signal !== undefined) this.signal = details.signal;
    if (details.analyzerError !== undefined) this.analyzerError = details.analyzerError;
    if (details.stderr !== undefined) this.stderr = details.stderr;
    Error.captureStackTrace?.(this, NativeClientError);
  }

  toJSON(): Record<string, unknown> {
    const value: Record<string, unknown> = {
      name: this.name,
      code: this.code,
      message: this.message,
    };
    if (this.requestId !== undefined) value.requestId = this.requestId;
    if (this.exitCode !== undefined) value.exitCode = this.exitCode;
    if (this.signal !== undefined) value.signal = this.signal;
    if (this.analyzerError !== undefined) value.analyzerError = this.analyzerError;
    return value;
  }
}

export interface ValidatedNativeResult {
  readonly request: NativeRequestEnvelope;
  readonly events: readonly NativeEventEnvelope[];
  readonly terminal: NativeEventEnvelope;
  readonly stderr: string;
}

interface ValidatedOptions {
  readonly executablePath: string;
  readonly arguments: readonly string[];
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly environment: Readonly<Record<string, string>>;
  readonly limits: Readonly<NativeClientLimits>;
}

interface DecodedOutput {
  readonly events: NativeEventEnvelope[];
  readonly rawRecords: Buffer[];
}

const ALLOWED_ENVIRONMENT = new Set([
  'LANG',
  'LC_ALL',
  'NO_COLOR',
  'SYSTEMROOT',
  'WINDIR',
  'TEMP',
  'TMP',
]);

const LIMIT_NAMES = Object.keys(NATIVE_CLIENT_HARD_LIMITS) as (keyof NativeClientLimits)[];
const TERMINAL_EVENT_TYPES = new Set<NativeEventEnvelope['type']>([
  'DESCRIBE_COMPLETED',
  'ANALYSIS_COMPLETED',
  'ANALYSIS_FAILED',
  'REFRESH_COMPLETED',
  'REFRESH_FAILED',
  'CANCEL_ACCEPTED',
  'REQUEST_FAILED',
]);
const LEGAL_EVENT_TYPES: Readonly<
  Record<NativeIpcRequestType, ReadonlySet<NativeEventEnvelope['type']>>
> = {
  DESCRIBE: new Set(['DESCRIBE_COMPLETED', 'REQUEST_FAILED']),
  ANALYZE: new Set([
    'ANALYSIS_STARTED',
    'SOURCE_FILE',
    'NODE',
    'EDGE',
    'COVERAGE',
    'DIAGNOSTIC',
    'ANALYSIS_COMPLETED',
    'ANALYSIS_FAILED',
    'REQUEST_FAILED',
  ]),
  REFRESH: new Set([
    'REFRESH_STARTED',
    'SOURCE_FILE',
    'UPSERT_NODE',
    'REMOVE_NODE',
    'UPSERT_EDGE',
    'REMOVE_EDGE',
    'COVERAGE',
    'DIAGNOSTIC',
    'REFRESH_COMPLETED',
    'REFRESH_FAILED',
    'REQUEST_FAILED',
  ]),
  CANCEL: new Set(['CANCEL_ACCEPTED', 'REQUEST_FAILED']),
};
const FAILURE_PRECEDENCE: Readonly<Record<NativeClientErrorCode, number>> = {
  CANCELLED: 5,
  TIMEOUT: 4,
  PROTOCOL_VIOLATION: 3,
  OUTPUT_LIMIT_EXCEEDED: 3,
  CHECKSUM_MISMATCH: 3,
  INVALID_CONFIGURATION: 3,
  INVALID_REQUEST: 3,
  PROVIDER_UNAVAILABLE: 2,
  PROCESS_FAILED: 2,
  ANALYZER_FAILED: 1,
};

export async function executeNativeRequest(
  requestValue: NativeRequestEnvelope,
  optionsValue: NativeClientOptions,
): Promise<ValidatedNativeResult> {
  const request = parseRequest(requestValue);
  const options = validateOptions(optionsValue);
  if (options.signal?.aborted === true) {
    throw clientError('CANCELLED', 'Native request was cancelled', request);
  }
  const timeoutMs = effectiveTimeout(request, options.timeoutMs);
  if (timeoutMs <= 0) {
    throw clientError('TIMEOUT', 'Native request timed out', request);
  }
  const requestBytes = Buffer.from(`${JSON.stringify(request)}\n`, 'utf8');
  if (requestBytes.byteLength > options.limits.maxStdinBytes) {
    throw clientError('OUTPUT_LIMIT_EXCEEDED', 'Native request exceeds the byte limit', request);
  }

  const result = await runProcess(requestBytes, options, request, timeoutMs);
  const stream = NativeEventStreamSchema.safeParse({ request, events: result.output.events });
  if (!stream.success) {
    throw clientError('PROTOCOL_VIOLATION', 'Native event stream is invalid', request, {
      stderr: result.stderr,
    });
  }
  const terminal = stream.data.events.at(-1);
  if (terminal === undefined) {
    throw clientError('PROTOCOL_VIOLATION', 'Native event stream has no terminal event', request, {
      stderr: result.stderr,
    });
  }
  if (
    terminal.type === 'REQUEST_FAILED' ||
    terminal.type === 'ANALYSIS_FAILED' ||
    terminal.type === 'REFRESH_FAILED'
  ) {
    throw clientError('ANALYZER_FAILED', 'Native analyzer rejected the request', request, {
      analyzerError: terminal.payload.error,
      stderr: result.stderr,
    });
  }
  if (terminal.type === 'ANALYSIS_COMPLETED' || terminal.type === 'REFRESH_COMPLETED') {
    verifyChecksum(
      result.output.rawRecords.slice(0, -1),
      terminal.payload.integrityChecksum,
      request,
      result.stderr,
    );
  }
  return deepFreeze({
    request: stream.data.request,
    events: stream.data.events,
    terminal,
    stderr: result.stderr,
  });
}

function verifyChecksum(
  records: readonly Buffer[],
  declared: string,
  request: NativeRequestEnvelope,
  stderr: string,
): void {
  if (!/^sha256:[0-9a-f]{64}$/.test(declared)) {
    throw clientError('CHECKSUM_MISMATCH', 'Native result checksum is invalid', request, {
      stderr,
    });
  }
  const actual = createHash('sha256').update(Buffer.concat(records)).digest();
  const expected = Buffer.from(declared.slice('sha256:'.length), 'hex');
  if (!timingSafeEqual(actual, expected)) {
    throw clientError('CHECKSUM_MISMATCH', 'Native result checksum does not match', request, {
      stderr,
    });
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || Buffer.isBuffer(value)) return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const child of Object.values(object)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function parseRequest(value: NativeRequestEnvelope): NativeRequestEnvelope {
  const result = NativeRequestEnvelopeSchema.safeParse(value);
  if (!result.success) {
    throw new NativeClientError('INVALID_REQUEST', 'Native request is invalid');
  }
  return result.data;
}

function validateOptions(value: NativeClientOptions): ValidatedOptions {
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof value.executablePath !== 'string' ||
    !isAbsolute(value.executablePath) ||
    value.executablePath.includes('\0') ||
    !Number.isSafeInteger(value.timeoutMs) ||
    value.timeoutMs <= 0
  ) {
    throw new NativeClientError('INVALID_CONFIGURATION', 'Native client configuration is invalid');
  }

  const arguments_ = value.arguments ?? [];
  if (
    !Array.isArray(arguments_) ||
    arguments_.some((argument) => typeof argument !== 'string' || argument.includes('\0'))
  ) {
    throw new NativeClientError('INVALID_CONFIGURATION', 'Native client configuration is invalid');
  }

  const environment: Record<string, string> = {};
  const environmentValue = value.allowedEnvironment ?? {};
  if (
    environmentValue === null ||
    typeof environmentValue !== 'object' ||
    Array.isArray(environmentValue)
  ) {
    throw new NativeClientError('INVALID_CONFIGURATION', 'Native client configuration is invalid');
  }
  for (const [name, environmentEntry] of Object.entries(environmentValue)) {
    const canonicalName = name.toUpperCase();
    if (
      !ALLOWED_ENVIRONMENT.has(canonicalName) ||
      canonicalName in environment ||
      typeof environmentEntry !== 'string' ||
      environmentEntry.length === 0 ||
      environmentEntry.length > 4_096 ||
      environmentEntry.includes('\0')
    ) {
      throw new NativeClientError(
        'INVALID_CONFIGURATION',
        'Native client configuration is invalid',
      );
    }
    environment[canonicalName] = environmentEntry;
  }

  const suppliedLimits = value.limits ?? {};
  if (
    suppliedLimits === null ||
    typeof suppliedLimits !== 'object' ||
    Array.isArray(suppliedLimits) ||
    Object.keys(suppliedLimits).some(
      (name) => !LIMIT_NAMES.includes(name as keyof NativeClientLimits),
    )
  ) {
    throw new NativeClientError('INVALID_CONFIGURATION', 'Native client configuration is invalid');
  }
  const limits = { ...NATIVE_CLIENT_HARD_LIMITS } as NativeClientLimits;
  for (const name of LIMIT_NAMES) {
    const supplied = suppliedLimits[name];
    if (supplied === undefined) continue;
    if (
      !Number.isSafeInteger(supplied) ||
      supplied <= 0 ||
      supplied > NATIVE_CLIENT_HARD_LIMITS[name]
    ) {
      throw new NativeClientError(
        'INVALID_CONFIGURATION',
        'Native client configuration is invalid',
      );
    }
    (limits as Record<keyof NativeClientLimits, number>)[name] = supplied;
  }

  return {
    executablePath: value.executablePath,
    arguments: [...arguments_],
    timeoutMs: value.timeoutMs,
    ...(value.signal === undefined ? {} : { signal: value.signal }),
    environment: Object.freeze(environment),
    limits: Object.freeze(limits),
  };
}

function runProcess(
  requestBytes: Buffer,
  options: ValidatedOptions,
  request: NativeRequestEnvelope,
  timeoutMs: number,
): Promise<{ readonly output: DecodedOutput; readonly stderr: string }> {
  let child;
  try {
    child = spawn(options.executablePath, [...options.arguments], {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnvironment(options.environment),
    });
  } catch {
    return Promise.reject(
      clientError('PROVIDER_UNAVAILABLE', 'Native provider is unavailable', request),
    );
  }

  let failure: NativeClientError | undefined;
  let closed = false;
  let graceTimer: NodeJS.Timeout | undefined;

  const terminate = () => {
    if (closed || graceTimer !== undefined) return;
    child.kill();
    graceTimer = setTimeout(() => {
      if (!closed) child.kill('SIGKILL');
    }, 250);
    graceTimer.unref();
  };
  const recordFailure = (error: NativeClientError) => {
    if (
      failure === undefined ||
      FAILURE_PRECEDENCE[error.code] > FAILURE_PRECEDENCE[failure.code]
    ) {
      failure = error;
    }
    terminate();
  };

  const stdoutPromise = decodeStdout(child.stdout, request, options.limits).catch(
    (error: unknown) => {
      recordFailure(asClientError(error, request));
      return undefined;
    },
  );
  const stderrPromise = captureStderr(
    child.stderr,
    options.limits.maxStderrBytes,
    request,
    recordFailure,
  );
  const stdinPromise = writeRequest(child.stdin, requestBytes, request).catch((error: unknown) => {
    recordFailure(asClientError(error, request, 'Native request could not be written'));
  });
  const closePromise = new Promise<{
    readonly exitCode: number | null;
    readonly signal: NodeJS.Signals | null;
  }>((resolve) => {
    child.once('error', () => {
      recordFailure(clientError('PROVIDER_UNAVAILABLE', 'Native provider is unavailable', request));
    });
    child.once('close', (exitCode, signal) => {
      closed = true;
      resolve({ exitCode, signal });
    });
  });

  const timeout = setTimeout(
    () => recordFailure(clientError('TIMEOUT', 'Native request timed out', request)),
    timeoutMs,
  );
  timeout.unref();
  const abort = () =>
    recordFailure(clientError('CANCELLED', 'Native request was cancelled', request));
  options.signal?.addEventListener('abort', abort, { once: true });

  return Promise.all([stdoutPromise, stderrPromise, stdinPromise, closePromise])
    .then(([output, stderr, , close]) => {
      if (close.exitCode !== 0 || close.signal !== null) {
        recordFailure(
          clientError('PROCESS_FAILED', 'Native process failed', request, {
            ...(close.exitCode === null ? {} : { exitCode: close.exitCode }),
            ...(close.signal === null ? {} : { signal: close.signal }),
          }),
        );
      }
      if (failure !== undefined) throw withStderr(failure, stderr);
      if (output === undefined) {
        throw clientError('PROCESS_FAILED', 'Native process failed', request, { stderr });
      }
      return { output, stderr };
    })
    .finally(() => {
      clearTimeout(timeout);
      if (graceTimer !== undefined) clearTimeout(graceTimer);
      options.signal?.removeEventListener('abort', abort);
    });
}

function childEnvironment(
  allowed: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const environment: Record<string, string> = {};
  if (process.platform === 'win32') {
    for (const name of Object.keys(process.env)) environment[name] = '';
  }
  return { ...environment, ...allowed };
}

function effectiveTimeout(request: NativeRequestEnvelope, invocationTimeoutMs: number): number {
  if (request.type !== 'ANALYZE' && request.type !== 'REFRESH') return invocationTimeoutMs;
  const durations = [invocationTimeoutMs, request.payload.resourceBudget.maxDurationMs];
  if (request.payload.deadlineEpochMs !== null) {
    durations.push(request.payload.deadlineEpochMs - Date.now());
  }
  return Math.min(...durations);
}

function writeRequest(
  stdin: NodeJS.WritableStream,
  bytes: Buffer,
  request: NativeRequestEnvelope,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      stdin.removeListener('drain', end);
      stdin.removeListener('error', fail);
      stdin.removeListener('close', closedBeforeFinish);
      stdin.removeListener('finish', succeed);
    };
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };
    const succeed = () => settle(resolve);
    const fail = () =>
      settle(() =>
        reject(clientError('PROCESS_FAILED', 'Native request could not be written', request)),
      );
    const closedBeforeFinish = () => {
      if (!settled) fail();
    };
    const end = () => stdin.end();

    stdin.once('error', fail);
    stdin.once('close', closedBeforeFinish);
    stdin.once('finish', succeed);
    if (stdin.write(bytes)) end();
    else stdin.once('drain', end);
  });
}

async function captureStderr(
  stderr: Readable,
  limit: number,
  request: NativeRequestEnvelope,
  recordFailure: (error: NativeClientError) => void,
): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  let exceeded = false;
  for await (const chunk of stderr) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = Math.max(0, limit - total);
    if (remaining > 0) chunks.push(bytes.subarray(0, remaining));
    total += bytes.byteLength;
    if (!exceeded && total > limit) {
      exceeded = true;
      recordFailure(
        clientError('OUTPUT_LIMIT_EXCEEDED', 'Native stderr exceeds the byte limit', request),
      );
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

function asClientError(
  error: unknown,
  request: NativeRequestEnvelope,
  message = 'Native process failed',
): NativeClientError {
  return error instanceof NativeClientError
    ? error
    : clientError('PROCESS_FAILED', message, request);
}

function withStderr(error: NativeClientError, stderr: string): NativeClientError {
  if (stderr.length === 0 || error.stderr !== undefined) return error;
  return new NativeClientError(error.code, error.message, {
    ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
    ...(error.exitCode === undefined ? {} : { exitCode: error.exitCode }),
    ...(error.signal === undefined ? {} : { signal: error.signal }),
    ...(error.analyzerError === undefined ? {} : { analyzerError: error.analyzerError }),
    stderr,
  });
}

async function decodeStdout(
  stdout: Readable,
  request: NativeRequestEnvelope,
  limits: NativeClientLimits,
): Promise<DecodedOutput> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const events: NativeEventEnvelope[] = [];
  const rawRecords: Buffer[] = [];
  const requestEventLimit =
    request.type === 'ANALYZE' || request.type === 'REFRESH'
      ? request.payload.resourceBudget.maxEvents
      : limits.maxEvents;
  const maxEvents = Math.min(limits.maxEvents, requestEventLimit);
  let pending = Buffer.alloc(0);
  let totalBytes = 0;
  let terminalSeen = false;

  for await (const chunk of stdout) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bytes.byteLength;
    if (totalBytes > limits.maxStdoutBytes) {
      throw clientError('OUTPUT_LIMIT_EXCEEDED', 'Native stdout exceeds the byte limit', request);
    }
    if (terminalSeen && bytes.byteLength > 0) {
      throw clientError(
        'PROTOCOL_VIOLATION',
        'Native stdout continues after a terminal event',
        request,
      );
    }
    pending = Buffer.concat([pending, bytes]);
    while (true) {
      const lf = pending.indexOf(0x0a);
      if (lf < 0) {
        if (pending.byteLength > limits.maxLineBytes) {
          throw clientError(
            'OUTPUT_LIMIT_EXCEEDED',
            'Native stdout line exceeds the limit',
            request,
          );
        }
        break;
      }
      const rawLine = pending.subarray(0, lf);
      pending = pending.subarray(lf + 1);
      if (events.length >= maxEvents) {
        throw clientError('OUTPUT_LIMIT_EXCEEDED', 'Native event count exceeds the limit', request);
      }
      if (rawLine.byteLength > limits.maxLineBytes) {
        throw clientError('OUTPUT_LIMIT_EXCEEDED', 'Native stdout line exceeds the limit', request);
      }
      const event = parseEventLine(rawLine, decoder, request, events.length);
      if (!LEGAL_EVENT_TYPES[request.type].has(event.type)) {
        throw clientError(
          'PROTOCOL_VIOLATION',
          'Native event is not legal for the request',
          request,
        );
      }
      if (event.type === 'REQUEST_FAILED' && events.length !== 0) {
        throw clientError(
          'PROTOCOL_VIOLATION',
          'Native request failure follows another event',
          request,
        );
      }
      if (terminalSeen) {
        throw clientError(
          'PROTOCOL_VIOLATION',
          'Native stdout continues after a terminal event',
          request,
        );
      }
      events.push(event);
      rawRecords.push(Buffer.concat([rawLine, Buffer.from('\n')]));
      terminalSeen = TERMINAL_EVENT_TYPES.has(event.type);
    }
  }

  if (pending.byteLength !== 0) {
    throw clientError(
      'PROTOCOL_VIOLATION',
      'Native stdout ended with an incomplete record',
      request,
    );
  }
  return { events, rawRecords };
}

function parseEventLine(
  rawLine: Buffer,
  decoder: TextDecoder,
  request: NativeRequestEnvelope,
  expectedSequence: number,
): NativeEventEnvelope {
  if (
    rawLine.byteLength === 0 ||
    rawLine.includes(0x0d) ||
    rawLine.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
  ) {
    throw clientError('PROTOCOL_VIOLATION', 'Native stdout is not valid JSONL', request);
  }
  try {
    const parsed: unknown = JSON.parse(decoder.decode(rawLine));
    const result = NativeEventEnvelopeSchema.safeParse(parsed);
    if (!result.success) throw new Error('invalid event');
    if (result.data.requestId !== request.requestId || result.data.sequence !== expectedSequence) {
      throw new Error('invalid event context');
    }
    return result.data;
  } catch {
    throw clientError('PROTOCOL_VIOLATION', 'Native stdout contains an invalid event', request);
  }
}

function clientError(
  code: NativeClientErrorCode,
  message: string,
  request: NativeRequestEnvelope,
  details: Omit<NativeClientErrorDetails, 'requestId'> = {},
): NativeClientError {
  return new NativeClientError(code, message, { requestId: request.requestId, ...details });
}
