// Explicit D Fixture controls only; never product configuration or admission.
import assert from 'node:assert/strict';
import path from 'node:path';

function dataFields(value, keys) {
  const message = 'D fixture context must contain only declared data fields';
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), message);
  assert.ok(
    Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null,
    message,
  );
  const descriptors = Object.getOwnPropertyDescriptors(value);
  assert.ok(
    Reflect.ownKeys(descriptors).every((key) => typeof key === 'string'),
    message,
  );
  assert.deepEqual(Reflect.ownKeys(descriptors).sort(), [...keys].sort(), message);
  for (const descriptor of Object.values(descriptors))
    assert.ok(Object.hasOwn(descriptor, 'value') && descriptor.enumerable, message);
  return Object.fromEntries(Object.entries(descriptors).map(([key, entry]) => [key, entry.value]));
}

export function snapshotDRefreshFixtureContext(value) {
  const fields = dataFields(value, ['memoryBudgetBytes', 'executablePath', 'allowedEnvironment']);
  assert.equal(fields.memoryBudgetBytes, 1_000_000_000, 'D fixture context caller input mismatch');
  assert.ok(
    typeof fields.executablePath === 'string' &&
      !fields.executablePath.includes('\0') &&
      path.isAbsolute(fields.executablePath) &&
      path.resolve(fields.executablePath) === fields.executablePath,
    'D fixture context executable must be canonical and absolute',
  );
  const environment = fields.allowedEnvironment;
  assert.ok(
    environment !== null && typeof environment === 'object' && !Array.isArray(environment),
    'D fixture context environment must be a data record',
  );
  const keys = Reflect.ownKeys(environment);
  assert.ok(
    keys.every((key) => ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'].includes(key)),
    'D fixture context environment key is not allowed',
  );
  const allowedEnvironment = dataFields(environment, keys);
  assert.ok(
    Object.values(allowedEnvironment).every(
      (entry) => typeof entry === 'string' && !entry.includes('\0'),
    ),
    'D fixture context environment values must be strings',
  );
  return Object.freeze({ ...fields, allowedEnvironment: Object.freeze(allowedEnvironment) });
}
