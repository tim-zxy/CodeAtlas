import { isUtf8 } from 'node:buffer';
import { types } from 'node:util';
import { ensurePhase1Data } from '@codeatlas/ir';
import { DocumentDraftError, type DocumentAccount } from './source-positions.js';

const credentials =
  /^(?:password|passwd|api[_-]?key|secret|access[_-]?token|token|authorization)$/i;
const assignment =
  /\b(?:password|passwd|api[_-]?key|secret|access[_-]?token|token|authorization)\s*["']?\s*[:=]\s*["']?[^\s"',}\]]+/i;
const privateKey = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/;
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const getter = (name: string) => Object.getOwnPropertyDescriptor(typedArray, name)!.get!;

/** Deny-only inspection. No-known-pattern is NOT clearance: encoded/opaque and
 * unrecognized credentials remain outside this LIMITED rule set. No raw matches escape. */
export function inspectDocumentSecrets(
  source: Uint8Array,
  candidate: unknown,
  account: DocumentAccount,
): Readonly<{
  ruleSet: 'document-secret-indicators-v1';
  detected: boolean;
  coverage: 'LIMITED';
  clearance: false;
  rules: readonly string[];
}> {
  try {
    account.checkpoint();
    if (!types.isUint8Array(source) || types.isProxy(source))
      throw new DocumentDraftError('INVALID_DOCUMENT_INPUT');
    const backing = getter('buffer').call(source) as ArrayBuffer;
    if (types.isSharedArrayBuffer(backing)) throw new DocumentDraftError('INVALID_DOCUMENT_INPUT');
    const size = getter('byteLength').call(source) as number;
    account.reserveBuffer(size);
    const bytes = Buffer.from(new Uint8Array(backing, getter('byteOffset').call(source), size));
    if (!isUtf8(bytes)) throw new DocumentDraftError('INVALID_DOCUMENT_INPUT');
    // UTF16 logical storage upper bound for decoding these UTF8 bytes; not an RSS profile.
    account.reserveBuffer(size * 2);
    const raw = bytes.toString('utf8');
    account.own(candidate);
    ensurePhase1Data(candidate);
    const rules = new Set<string>();
    const inspect = (value: string) => {
      account.checkpoint();
      account.visitItem();
      if (privateKey.test(value)) rules.add('PRIVATE_KEY_MARKER');
      if (assignment.test(value)) rules.add('CREDENTIAL_ASSIGNMENT');
    };
    inspect(raw);
    const walk = (value: unknown): void => {
      account.checkpoint();
      account.visitItem();
      if (typeof value === 'string') inspect(value);
      else if (value !== null && typeof value === 'object') {
        for (const key of Object.keys(value)) {
          const child = (value as Record<string, unknown>)[key];
          inspect(key);
          if (credentials.test(key) && typeof child === 'string' && child.trim().length)
            rules.add('CREDENTIAL_PROPERTY');
          walk(child);
        }
      }
    };
    walk(candidate);
    account.checkpoint();
    return Object.freeze({
      ruleSet: 'document-secret-indicators-v1',
      detected: rules.size > 0,
      coverage: 'LIMITED',
      clearance: false,
      rules: Object.freeze([...rules].sort()),
    });
  } catch (error) {
    account.invalidate();
    throw error;
  }
}
