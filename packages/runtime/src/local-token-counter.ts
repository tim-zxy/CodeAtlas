import { createHash } from 'node:crypto';
import { countTokens } from 'gpt-tokenizer/encoding/cl100k_base';
import {
  canonicalCompilationJson,
  CompilationInputContractError,
} from '../../application/dist/compilation-input-contract.js';

type RuntimeRequestControl = Parameters<typeof canonicalCompilationJson>[1];
const POLICY = 'codeatlas.agent-response.cl100k_base@gpt-tokenizer-4.1.2:v1';

/** Exact serialized Agent API text only, not client chat or outer MCP framing.
 * No permission grant, default ceiling, remote access or production wiring.
 * Cancellation is cooperative: synchronous BPE cannot be interrupted mid-call. */
export function createCl100kTokenCounter(maxInputBytes: number) {
  if (!Number.isSafeInteger(maxInputBytes) || maxInputBytes <= 0)
    throw Error('INVALID_TOKEN_COUNTER_LIMIT');
  return Object.freeze({
    kind: 'EXACT_LOCAL_COUNTER',
    policyRef: POLICY,
    measure(text: string, control: RuntimeRequestControl) {
      // Reuse the existing descriptor-safe control validation and stop semantics.
      canonicalCompilationJson(null, control);
      if (typeof text !== 'string' || !text.isWellFormed())
        throw Error('TOKEN_COUNTER_UNAVAILABLE');
      if (Buffer.byteLength(text, 'utf8') > maxInputBytes)
        throw new CompilationInputContractError('BUDGET_EXCEEDED');
      let outputTokens: number;
      try {
        // One complete text; preserve the encoding's default special-token refusal.
        outputTokens = countTokens(text);
      } catch {
        throw Error('TOKEN_COUNTER_UNAVAILABLE');
      }
      const result = Object.freeze({
        policyRef: POLICY,
        contentDigest: createHash('sha256').update(text, 'utf8').digest('hex'),
        outputTokens,
      });
      canonicalCompilationJson(null, control);
      return result;
    },
  });
}
