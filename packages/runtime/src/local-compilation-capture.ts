import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import {
  captureCompilationInput,
  CompilationCaptureError,
} from '../../application/dist/capture-compilation-input.js';
import { createOwnedCompilationInputPorts } from './compilation-input.js';
import type { CompilationInputSnapshot } from '../../application/dist/compilation-input-contract.js';
import { createCompilationSourceVerifier } from './compilation-source.js';
import {
  assertLocalCaptureOperation,
  closeLocalCaptureOperation,
  createLocalCaptureOperation,
  finishLocalCaptureOperation,
} from './local-capture-operation.js';

type OperationInput = Parameters<typeof createLocalCaptureOperation>[0];
type StorageInput = Parameters<typeof createOwnedCompilationInputPorts>[0];

/** Private ordinary-entry composition. The caller owns the live Principal and
 * Source contexts; this invocation owns and always closes its operation only.
 * There is deliberately no scan flag or caller-supplied authorization callback.
 * Whole-inventory clearance is not installed: materialization must still refuse.
 */
export async function captureLocalCompilationInput(
  input: OperationInput & {
    repositories: StorageInput['repositories'];
    sources: ReadonlyMap<string, object>;
  },
): Promise<CompilationInputSnapshot> {
  if (!input || types.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype)
    throw new CompilationCaptureError('CAPTURE_FAILED', 'SETTLED');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Object.values(descriptors).some((descriptor) => !Object.hasOwn(descriptor, 'value')))
    throw new CompilationCaptureError('CAPTURE_FAILED', 'SETTLED');
  input = Object.fromEntries(
    Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]),
  ) as typeof input;
  const operation = createLocalCaptureOperation({
    principalHandle: input.principalHandle,
    workspaceStore: input.workspaceStore,
    security: input.security,
    callerCapabilities: input.callerCapabilities,
    request: input.request,
    budget: input.budget,
    control: input.control,
  });
  try {
    const checkpoint = (): undefined => {
      assertLocalCaptureOperation(operation.handle);
      return undefined;
    };
    const owned = createOwnedCompilationInputPorts({
      workspaceStore: input.workspaceStore,
      repositories: input.repositories,
      budget: input.budget,
      control: input.control,
      syncCheck: checkpoint,
    });
    const source = createCompilationSourceVerifier({ sources: input.sources, ownedInputs: owned });
    const denyMaterialization = (): never => {
      checkpoint();
      throw new CompilationCaptureError('CAPTURE_SCAN_UNAVAILABLE', 'SETTLED');
    };
    const result = await captureCompilationInput(input.request, input.control, {
      ...owned,
      ...source,
      account: {
        checkpoint,
        own: (value) => input.budget.own(value),
        invalidate: () => closeLocalCaptureOperation(operation.handle),
      },
      allocateSnapshotId: randomUUID,
      now: () => new Date().toISOString(),
      currentPolicyVersions: () => {
        checkpoint();
        return operation.policyVersions;
      },
      // The operation owner has already checked the actual workspace selection.
      // This permits metadata selection only, never materialized facts or text.
      authorizeSelection: checkpoint,
      authorizeRepositoryRead: denyMaterialization,
      authorizeWorkspaceRead: denyMaterialization,
    });
    finishLocalCaptureOperation(operation.handle);
    return result;
  } finally {
    closeLocalCaptureOperation(operation.handle);
  }
}
