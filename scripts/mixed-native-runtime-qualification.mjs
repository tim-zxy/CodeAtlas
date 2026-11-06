// Deep-private callback adapter only. Owner metadata is consistency data, never authority.
import { types } from 'node:util';
import { validateOperationPolicyData } from '../packages/application/dist/index.js';
import { validateMixedSourceQualification } from '../packages/application/dist/mixed-source-workflow.js';
const code = 'INVALID_MIXED_NATIVE_RUNTIME_QUALIFICATION';
const bad = () => Object.assign(Error(code), { code });
const check = (condition) => {
  if (!condition) throw bad();
};
const flags = [
  'databaseStateVerified',
  'sourceHistoryAuthenticated',
  'toolImagesAuthenticated',
  'environmentAuthenticated',
  'executionAuthorized',
  'productionAdmission',
  'measurementEligible',
];

export function createMixedNativeRuntimeQualification(owner, sourceConfig) {
  let take;
  let healthy;
  let source;
  try {
    check(
      owner &&
        typeof owner === 'object' &&
        !types.isProxy(owner) &&
        [Object.prototype, null].includes(Object.getPrototypeOf(owner)),
    );
    const descriptors = Object.getOwnPropertyDescriptors(owner);
    const keys = Reflect.ownKeys(descriptors);
    check(
      keys.length === 3 &&
        ['take', 'status', 'dispose'].every((key) => Object.hasOwn(descriptors, key)),
    );
    for (const descriptor of Object.values(descriptors)) {
      check(
        descriptor.enumerable &&
          Object.hasOwn(descriptor, 'value') &&
          typeof descriptor.value === 'function' &&
          !types.isProxy(descriptor.value),
      );
    }
    const capturedTake = descriptors.take.value;
    const capturedStatus = descriptors.status.value;
    healthy = () => {
      try {
        const status = Reflect.apply(capturedStatus, owner, []);
        validateOperationPolicyData(status);
        check(
          status &&
            typeof status === 'object' &&
            !Array.isArray(status) &&
            status.status === 'OFFLINE_BOUND' &&
            status.controlStatus === 'OPEN' &&
            flags.every((key) => status[key] === false),
        );
      } catch {
        throw bad();
      }
    };
    take = (role) => {
      healthy();
      // Preserve the owner's original error, including UNKNOWN cleanup metadata.
      // The owner/session alone enforces ordering, pending slots and one-shot use.
      return Reflect.apply(capturedTake, owner, [role]);
    };
    validateOperationPolicyData(sourceConfig);
    check(
      sourceConfig &&
        typeof sourceConfig === 'object' &&
        !Array.isArray(sourceConfig) &&
        Object.keys(sourceConfig).length === 2 &&
        ['executablePath', 'environment'].every((key) => Object.hasOwn(sourceConfig, key)),
    );
    source = validateMixedSourceQualification({
      executablePath: sourceConfig.executablePath,
      environment: sourceConfig.environment,
      createLifecycle(_plan) {
        return take('GIT');
      },
    });
    healthy();
  } catch {
    throw bad();
  }
  return Object.freeze({
    source,
    createNativeLifecycle(role) {
      check(role === 'V2' || role === 'V5');
      return take(role);
    },
  });
}
