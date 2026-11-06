import { isDeepStrictEqual, types } from 'node:util';
import { NativeStateValidationError } from '../../providers/dist/index.js';
import {
  nativeMetadataEnvironment,
  assertNativeMetadataAdmission,
  assertNativeRefreshVerificationAdmission,
  assertNativeRefreshTransportAdmission,
} from './native-metadata-admission.js';

type Workspace = 'READ_SEAL' | 'FULL_TRANSPORT' | 'REFRESH_VERIFY' | 'REFRESH_TRANSPORT';
const checks: readonly (readonly [Workspace, (budget: number) => unknown])[] = [
  ['READ_SEAL', (n) => assertNativeMetadataAdmission(n, 'READ_SEAL')],
  ['FULL_TRANSPORT', (n) => assertNativeMetadataAdmission(n, 'FULL_TRANSPORT')],
  ['REFRESH_VERIFY', assertNativeRefreshVerificationAdmission],
  ['REFRESH_TRANSPORT', assertNativeRefreshTransportAdmission],
];

/** Private P1-19 diagnostics only. Does not probe a binary, authorize execution,
 * inspect project Source/DB, install, repair, migrate or change reviewed profiles. */
export function inspectInstallCapabilities(input: { readonly memoryBudgetBytes: number }) {
  if (!input || typeof input !== 'object' || types.isProxy(input))
    throw new Error('INVALID_INSTALL_INSPECTION_INPUT');
  const prototype = Object.getPrototypeOf(input);
  const own = Object.getOwnPropertyDescriptors(input);
  const descriptor = own.memoryBudgetBytes;
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    Reflect.ownKeys(input).length !== 1 ||
    !descriptor ||
    !descriptor.enumerable ||
    !('value' in descriptor) ||
    !Number.isSafeInteger(descriptor.value) ||
    descriptor.value <= 0
  )
    throw new Error('INVALID_INSTALL_INSPECTION_INPUT');
  const memoryBudgetBytes: number = descriptor.value;
  let environment: ReturnType<typeof nativeMetadataEnvironment>;
  let admissionChecks: Readonly<{
    workspace: Workspace;
    status: 'PASSED' | 'REFUSED';
    code: 'RESOURCE_LIMIT_EXCEEDED' | null;
  }>[];
  try {
    environment = nativeMetadataEnvironment();
    admissionChecks = checks.map(([workspace, check]) => {
      try {
        check(memoryBudgetBytes);
        return Object.freeze({ workspace, status: 'PASSED' as const, code: null });
      } catch (error) {
        if (
          !(error instanceof NativeStateValidationError) ||
          error.nativeStateReason !== 'RESOURCE_LIMIT_EXCEEDED'
        )
          throw error;
        return Object.freeze({
          workspace,
          status: 'REFUSED' as const,
          code: 'RESOURCE_LIMIT_EXCEEDED' as const,
        });
      }
    });
  } catch {
    throw new Error('INSTALL_INSPECTION_FAILED');
  }
  let after: typeof environment;
  try {
    after = nativeMetadataEnvironment();
  } catch {
    throw new Error('INSTALL_INSPECTION_FAILED');
  }
  if (!isDeepStrictEqual(environment, after)) throw new Error('INSTALL_INSPECTION_CHANGED');
  return Object.freeze({
    environment,
    memoryBudgetBytes,
    admissionChecks: Object.freeze(admissionChecks),
    nativeBinary: 'NOT_PROBED' as const,
    executionAuthorized: false as const,
  });
}
