import type { RuntimeRequestControl } from '@codeatlas/ir';
import {
  createOwnedStoredCodeSession,
  type OwnedSymbolUnderstandingPorts,
} from './symbol-understanding-tool.js';
import type { CodeTraceBudget, CodeTraceResponse } from './code-trace-contract.js';
export interface OwnedCodeTracePorts extends Omit<
  OwnedSymbolUnderstandingPorts,
  'limits' | 'authorize'
> {
  limits: CodeTraceBudget;
  authorize(
    manifest: Readonly<
      Omit<Parameters<OwnedSymbolUnderstandingPorts['authorize']>[0], 'purpose'> & {
        purpose: 'trace_flow/CODE';
      }
    >,
    control: RuntimeRequestControl,
  ): unknown;
}
export function createOwnedCodeTraceSession(ports: OwnedCodeTracePorts) {
  const session = createOwnedStoredCodeSession(ports, 'CODE');
  return Object.freeze({
    ...session,
    descriptor: Object.freeze({
      version: 2 as const,
      supportedKinds: ['CODE'] as const,
      directions: ['OUTGOING_CALLS'] as const,
      mode: 'OWNED_TEST_ONLY' as const,
      tokenPolicyRef: session.descriptor.tokenPolicyRef,
    }),
    execute: session.execute as (
      input: unknown,
      handle: unknown,
      c: RuntimeRequestControl,
    ) => Promise<CodeTraceResponse>,
  });
}
