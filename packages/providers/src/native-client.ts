import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';

import {
  NativeEventEnvelopeSchema,
  NativeEventStreamSchema,
  NativeRequestEnvelopeSchema,
  type NativeEventEnvelope,
  type NativeIpcError,
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

  constructor(code: NativeClientErrorCode, message: string, details: NativeClientErrorDetails = {}) {
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

export async function executeNativeRequest(
  requestValue: NativeRequestEnvelope,
  optionsValue: NativeClientOptions,
): Promise<ValidatedNativeResult> {
  const request = parseRequest(requestValue);
  const options = validateOptions(optionsValue);
  const requestBytes = Buffer.from(`${JSON.stringify(request)}\n`, 'utf8');
  if (requestBytes.byteLength > options.limits.maxStdinBytes) {
    throw clientError('OUTPUT_LIMIT_EXCEEDED', 'Native request exceeds the byte limit', request);
  }

  const result = await runProcess(requestBytes, options, request);
  const events = decodeOutput(result.stdout, request, options.limits);
  const stream = NativeEventStreamSchema.safeParse({ request, events });
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
  return { request: stream.data.request, events: stream.data.events, terminal, stderr: result.stderr };
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
      throw new NativeClientError('INVALID_CONFIGURATION', 'Native client configuration is invalid');
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
    if (!Number.isSafeInteger(supplied) || supplied <= 0 || supplied > NATIVE_CLIENT_HARD_LIMITS[name]) {
      throw new NativeClientError('INVALID_CONFIGURATION', 'Native client configuration is invalid');
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
): Promise<{ readonly stdout: Buffer; readonly stderr: string }> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(options.executablePath, [...options.arguments], {
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...options.environment },
      });
    } catch {
      reject(clientError('PROVIDER_UNAVAILABLE', 'Native provider is unavailable', request));
      return;
    }

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let captureError: NativeClientError | undefined;
    let settled = false;

    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      action();
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > options.limits.maxStdoutBytes) {
        captureError ??= clientError(
          'OUTPUT_LIMIT_EXCEEDED',
          'Native stdout exceeds the byte limit',
          request,
        );
        child.kill();
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > options.limits.maxStderrBytes) {
        captureError ??= clientError(
          'OUTPUT_LIMIT_EXCEEDED',
          'Native stderr exceeds the byte limit',
          request,
        );
        child.kill();
        return;
      }
      stderr.push(chunk);
    });
    child.once('error', () =>
      settle(() => reject(clientError('PROVIDER_UNAVAILABLE', 'Native provider is unavailable', request))),
    );
    child.once('close', (exitCode, signal) => {
      const stderrText = Buffer.concat(stderr).toString('utf8');
      settle(() => {
        if (captureError !== undefined) {
          reject(captureError);
        } else if (exitCode !== 0 || signal !== null) {
          reject(
            clientError('PROCESS_FAILED', 'Native process failed', request, {
              ...(exitCode === null ? {} : { exitCode }),
              ...(signal === null ? {} : { signal }),
              stderr: stderrText,
            }),
          );
        } else {
          resolve({ stdout: Buffer.concat(stdout), stderr: stderrText });
        }
      });
    });
    child.stdin.end(requestBytes);
  });
}

function decodeOutput(
  output: Buffer,
  request: NativeRequestEnvelope,
  limits: NativeClientLimits,
): NativeEventEnvelope[] {
  if (
    output.byteLength === 0 ||
    output.at(-1) !== 0x0a ||
    output.subarray(0, -1).includes(0x0d) ||
    output.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
  ) {
    throw clientError('PROTOCOL_VIOLATION', 'Native stdout is not valid JSONL', request);
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const lines = output.subarray(0, -1).toString('binary').split('\n');
  if (lines.length > limits.maxEvents) {
    throw clientError('OUTPUT_LIMIT_EXCEEDED', 'Native event count exceeds the limit', request);
  }
  return lines.map((binaryLine) => {
    const bytes = Buffer.from(binaryLine, 'binary');
    if (bytes.byteLength === 0 || bytes.byteLength > limits.maxLineBytes) {
      throw clientError('OUTPUT_LIMIT_EXCEEDED', 'Native stdout line exceeds the limit', request);
    }
    try {
      const parsed: unknown = JSON.parse(decoder.decode(bytes));
      const event = NativeEventEnvelopeSchema.safeParse(parsed);
      if (!event.success) throw new Error('invalid event');
      return event.data;
    } catch {
      throw clientError('PROTOCOL_VIOLATION', 'Native stdout contains an invalid event', request);
    }
  });
}

function clientError(
  code: NativeClientErrorCode,
  message: string,
  request: NativeRequestEnvelope,
  details: Omit<NativeClientErrorDetails, 'requestId'> = {},
): NativeClientError {
  return new NativeClientError(code, message, { requestId: request.requestId, ...details });
}
