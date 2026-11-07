import { types } from 'node:util';

/** Protocol consistency only. A decoded reply is never an authenticated principal,
 * permission handle or proof of human consent. Runtime must bind the actual helper,
 * host process, private channel, lifetime and cleanup before using OS identity. */
export interface WindowsProcessPrincipalData {
  readonly schema: 'codeatlas.windows-process-principal';
  readonly version: 1;
  readonly pid: number;
  readonly creationTimeFileTime: string;
  readonly sid: string;
  readonly challenge: string;
}
export class WindowsProcessPrincipalError extends Error {
  readonly code = 'WINDOWS_PRINCIPAL_UNAVAILABLE' as const;
  constructor() {
    super('Windows process principal unavailable');
    this.name = 'WindowsProcessPrincipalError';
  }
}
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uint32 = 0xffff_ffffn;
const uint64 = 0xffff_ffff_ffff_ffffn;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')!.get!;
const byteOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')!.get!;
const buffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')!.get!;
function requireValue(value: unknown): asserts value {
  if (!value) throw new WindowsProcessPrincipalError();
}
function decimal(value: unknown, max: bigint, positive = false): value is string {
  return (
    typeof value === 'string' &&
    /^(0|[1-9][0-9]*)$/.test(value) &&
    BigInt(value) <= max &&
    (!positive || BigInt(value) > 0n)
  );
}
function validSid(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = value.split('-');
  if (parts[0] !== 'S' || parts[1] !== '1' || parts.length < 4 || parts.length > 18) return false;
  const authority = parts[2]!;
  if (!decimal(authority, 0xffff_ffff_ffffn) && !/^0x[0-9a-fA-F]{12}$/.test(authority))
    return false;
  return parts.slice(3).every((part) => decimal(part, uint32));
}
/** Private helper wire decoder; byte ceiling comes from existing explicit request
 * controls. It creates data only, does not query Windows and grants no operations. */
export function decodeWindowsProcessPrincipalReply(
  bytes: unknown,
  expected: { readonly pid: number; readonly challenge: string },
  maxOutputBytes: number,
): WindowsProcessPrincipalData {
  try {
    requireValue(Number.isSafeInteger(maxOutputBytes) && maxOutputBytes > 0);
    requireValue(
      expected &&
        typeof expected === 'object' &&
        !types.isProxy(expected) &&
        Object.getPrototypeOf(expected) === Object.prototype,
    );
    const context = Object.getOwnPropertyDescriptors(expected);
    requireValue(
      Reflect.ownKeys(context).length === 2 &&
        context.pid &&
        'value' in context.pid &&
        context.challenge &&
        'value' in context.challenge,
    );
    const pid: unknown = context.pid.value;
    const challenge: unknown = context.challenge.value;
    requireValue(
      typeof pid === 'number' && Number.isSafeInteger(pid) && pid > 0 && pid <= Number(uint32),
    );
    requireValue(typeof challenge === 'string' && guid.test(challenge));
    requireValue(
      bytes &&
        !types.isProxy(bytes) &&
        bytes instanceof Uint8Array &&
        [Buffer.prototype, Uint8Array.prototype].includes(Object.getPrototypeOf(bytes)),
    );
    const storage: ArrayBuffer = buffer.call(bytes);
    const length: number = byteLength.call(bytes);
    requireValue(!(storage instanceof SharedArrayBuffer));
    requireValue(length <= maxOutputBytes);
    // A new intrinsic view avoids source valueOf/length/iterator conversion hooks.
    const ownedView = new Uint8Array(storage, byteOffset.call(bytes), length);
    const output = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(ownedView);
    const text = output.endsWith('\r\n')
      ? output.slice(0, -2)
      : output.endsWith('\n')
        ? output.slice(0, -1)
        : output;
    const value: unknown = JSON.parse(text);
    requireValue(value && typeof value === 'object' && !Array.isArray(value));
    const row = value as Record<string, unknown>;
    requireValue(
      Object.keys(row).length === 6 &&
        row.schema === 'codeatlas.windows-process-principal' &&
        row.version === 1 &&
        row.pid === pid &&
        row.challenge === challenge,
    );
    requireValue(decimal(row.creationTimeFileTime, uint64, true) && validSid(row.sid));
    const result: WindowsProcessPrincipalData = {
      schema: 'codeatlas.windows-process-principal',
      version: 1,
      pid,
      creationTimeFileTime: row.creationTimeFileTime,
      sid: row.sid,
      challenge,
    };
    // Exact serialization also rejects duplicate keys and noncanonical scalars.
    requireValue(JSON.stringify(result) === text);
    return Object.freeze(result);
  } catch {
    throw new WindowsProcessPrincipalError();
  }
}
