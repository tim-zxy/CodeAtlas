import { types } from 'node:util';
import type { createOwnedManagedReadToolsMcpServer } from './owned-business-stdio.js';

type Server = Pick<
  ReturnType<typeof createOwnedManagedReadToolsMcpServer>,
  'start' | 'close' | 'completion'
>;
type Cleanup = Awaited<ReturnType<Server['close']>>;

/** Trusted acquisition producer receipt, never a request permission or success certificate. */
export class OwnedMcpAcquisitionFailure extends Error {
  constructor(readonly cleanupState: Cleanup['cleanupState']) {
    super('OWNED_MCP_ACQUISITION_FAILED');
  }
}
async function closeRegisteredResources(
  closeResources: () => Cleanup | Promise<Cleanup>,
): Promise<Cleanup> {
  try {
    const result = await closeResources();
    return { cleanupState: result.cleanupState === 'SETTLED' ? 'SETTLED' : 'UNKNOWN' };
  } catch {
    return { cleanupState: 'UNKNOWN' };
  }
}
/** The embedding owner transfers its registered resources before server acquisition. */
export async function acquireAndRunOwnedManagedMcpHost(
  acquireServer: (signal: AbortSignal) => Promise<Server>,
  closeResources: () => Cleanup | Promise<Cleanup>,
  signal: AbortSignal,
): Promise<Readonly<Cleanup & { exitCode: 0 | 2 }>> {
  if (signal.aborted)
    return Object.freeze({ ...(await closeRegisteredResources(closeResources)), exitCode: 2 });
  let server: Server;
  try {
    const pending = acquireServer(signal);
    // Do not invoke arbitrary thenables or release resources after a broken producer contract.
    if (!types.isPromise(pending) || types.isProxy(pending))
      return Object.freeze({ exitCode: 2, cleanupState: 'UNKNOWN' });
    server = await pending; // Cancellation is cooperative: join the producer, including late ownership.
  } catch (error) {
    if (
      types.isProxy(error) ||
      !(error instanceof OwnedMcpAcquisitionFailure) ||
      Object.getOwnPropertyDescriptor(error, 'cleanupState')?.value !== 'SETTLED'
    )
      return Object.freeze({ exitCode: 2, cleanupState: 'UNKNOWN' });
    return Object.freeze({ ...(await closeRegisteredResources(closeResources)), exitCode: 2 });
  }
  return runOwnedManagedMcpHost(server, closeResources, signal);
}

/** Private embedding owner only; no session, resource or permission is created here. */
export async function runOwnedManagedMcpHost(
  server: Server,
  closeResources: () => Cleanup | Promise<Cleanup>,
  signal: AbortSignal,
): Promise<Readonly<Cleanup & { exitCode: 0 | 2 }>> {
  let closing: Promise<Cleanup> | undefined;
  let failed = false,
    cancelled = false,
    unknown = false;
  function close() {
    closing ??= Promise.resolve().then(async (): Promise<Cleanup> => {
      try {
        const result = await server.close();
        // Do not release the owner while server settlement is unconfirmed.
        if (result.cleanupState !== 'SETTLED') return { cleanupState: 'UNKNOWN' };
      } catch {
        return { cleanupState: 'UNKNOWN' };
      }
      return closeRegisteredResources(closeResources);
    });
    return closing;
  }
  const abort = () => {
    cancelled = true;
    void close();
  };
  signal.addEventListener('abort', abort, { once: true });
  let cleanup: Cleanup;
  try {
    if (signal.aborted) abort();
    else {
      await server.start();
      const result = await server.completion;
      unknown = result.cleanupState !== 'SETTLED';
    }
  } catch {
    failed = true;
  } finally {
    cleanup = await close();
    signal.removeEventListener('abort', abort);
  }
  const cleanupState = unknown || cleanup.cleanupState !== 'SETTLED' ? 'UNKNOWN' : 'SETTLED';
  return Object.freeze({
    exitCode: failed || cancelled || cleanupState === 'UNKNOWN' ? 2 : 0,
    cleanupState,
  });
}
