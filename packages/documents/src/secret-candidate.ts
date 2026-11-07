import { ensurePhase1Data } from '@codeatlas/ir';
import { maskDocumentRanges } from './document-range-mask.js';
import { inspectDocumentSecrets } from './secret-preflight.js';
import type { DocumentAccount } from './source-positions.js';

/** Offline, PROPOSED coverage only. v1 remains unchanged and production callers
 * do not use this candidate. A no-hit result is never clearance or permission. */
export function inspectDocumentSecretCandidate(
  source: Uint8Array,
  candidate: unknown,
  account: DocumentAccount,
) {
  try {
    const bytes = maskDocumentRanges(source, [], account);
    account.own(candidate);
    ensurePhase1Data(candidate);
    account.own(candidate);
    const fixed = structuredClone(candidate);
    const baseline = inspectDocumentSecrets(bytes, fixed, account);
    const rules = new Set(baseline.rules);
    const inspect = (text: string) => {
      // Charge the complete string, including no-URI inputs, to the shared ledger.
      for (let at = 0; at < text.length; at++) {
        account.checkpoint();
        account.visitItem();
      }
      for (const match of text.matchAll(/[^\s<>"']+/g)) {
        account.checkpoint();
        const token = match[0];
        const separator = token.indexOf('://');
        if (separator < 1) continue;
        let start = separator;
        while (start > 0 && /[a-z0-9+.-]/i.test(token[start - 1]!)) {
          account.checkpoint();
          account.visitItem();
          start--;
        }
        if (!/[a-z]/i.test(token[start]!)) continue;
        // URL parsing is local syntax only: never follow links or log parser errors.
        let password = '';
        try {
          password = new URL(token.slice(start)).password;
        } catch {
          continue;
        }
        if (password.length) rules.add('URI_PASSWORD');
      }
    };
    account.reserveBuffer(bytes.length * 2);
    inspect(bytes.toString('utf8'));
    const walk = (value: unknown): void => {
      account.checkpoint();
      account.visitItem();
      if (typeof value === 'string') inspect(value);
      else if (value !== null && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          inspect(key);
          walk(child);
        }
      }
    };
    walk(fixed);
    account.checkpoint();
    return Object.freeze({
      ...baseline,
      ruleSet: 'document-secret-indicators-v2-candidate' as const,
      status: 'PROPOSED' as const,
      detected: rules.size > 0,
      rules: Object.freeze([...rules].sort()),
    });
  } catch (error) {
    account.invalidate();
    throw error;
  }
}
