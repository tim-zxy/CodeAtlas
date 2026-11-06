import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import {
  nativeMetadataEnvironment,
  assertNativeMetadataAdmission,
  assertNativeRefreshVerificationAdmission,
  assertNativeRefreshTransportAdmission,
} from '../dist/native-metadata-admission.js';
const api = await import('../dist/install-capabilities.js').catch((e) => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw e;
});
const gates = [
  ['READ_SEAL', (n) => assertNativeMetadataAdmission(n, 'READ_SEAL')],
  ['FULL_TRANSPORT', (n) => assertNativeMetadataAdmission(n, 'FULL_TRANSPORT')],
  ['REFRESH_VERIFY', assertNativeRefreshVerificationAdmission],
  ['REFRESH_TRANSPORT', assertNativeRefreshTransportAdmission],
];

test('installation inspection reports existing gate outcomes without qualifying binary or executing repairs', () => {
  assert.equal(typeof api.inspectInstallCapabilities, 'function');
  const memoryBudgetBytes = 1;
  const expected = gates.map(([workspace, check]) => {
    try {
      check(memoryBudgetBytes);
      return { workspace, status: 'PASSED', code: null };
    } catch {
      return { workspace, status: 'REFUSED', code: 'RESOURCE_LIMIT_EXCEEDED' };
    }
  });
  const originals = {
    spawn: childProcess.spawn,
    spawnSync: childProcess.spawnSync,
    execFile: childProcess.execFile,
    write: fs.writeFileSync,
  };
  let effects = 0;
  const forbidden = () => {
    effects++;
    throw Error('must not execute or write');
  };
  childProcess.spawn = forbidden;
  childProcess.spawnSync = forbidden;
  childProcess.execFile = forbidden;
  fs.writeFileSync = forbidden;
  syncBuiltinESMExports();
  try {
    const report = api.inspectInstallCapabilities({ memoryBudgetBytes });
    assert.deepEqual(report.admissionChecks, expected);
    assert.deepEqual(report.environment, nativeMetadataEnvironment());
    assert.equal(report.nativeBinary, 'NOT_PROBED');
    assert.equal(report.executionAuthorized, false);
    assert.equal(report.memoryBudgetBytes, memoryBudgetBytes);
    assert.ok(
      Object.isFrozen(report) &&
        Object.isFrozen(report.environment) &&
        Object.isFrozen(report.admissionChecks) &&
        report.admissionChecks.every(Object.isFrozen),
    );
    assert.equal(effects, 0);
  } finally {
    childProcess.spawn = originals.spawn;
    childProcess.spawnSync = originals.spawnSync;
    childProcess.execFile = originals.execFile;
    fs.writeFileSync = originals.write;
    syncBuiltinESMExports();
  }
});

test('invalid installation inspection inputs refuse before installed metadata IO or getters', () => {
  assert.equal(typeof api.inspectInstallCapabilities, 'function');
  const read = fs.readFileSync;
  let reads = 0,
    getters = 0;
  fs.readFileSync = () => {
    reads++;
    throw Error('must not read');
  };
  syncBuiltinESMExports();
  const accessor = Object.defineProperty({}, 'memoryBudgetBytes', {
    enumerable: true,
    get() {
      getters++;
      return 1;
    },
  });
  try {
    for (const input of [
      null,
      [],
      {},
      accessor,
      new Proxy({ memoryBudgetBytes: 1 }, {}),
      { memoryBudgetBytes: 1, profile: 'override' },
      ...[0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1].map((memoryBudgetBytes) => ({
        memoryBudgetBytes,
      })),
    ])
      assert.throws(() => api.inspectInstallCapabilities(input), {
        message: 'INVALID_INSTALL_INSPECTION_INPUT',
      });
    assert.equal(reads, 0);
    assert.equal(getters, 0);
  } finally {
    fs.readFileSync = read;
    syncBuiltinESMExports();
  }
});

test('installed metadata read failure is a sanitized failed inspection, not ready or an empty success', () => {
  assert.equal(typeof api.inspectInstallCapabilities, 'function');
  const read = fs.readFileSync;
  fs.readFileSync = () => {
    throw Error('private-path credential-detail');
  };
  syncBuiltinESMExports();
  try {
    assert.throws(() => api.inspectInstallCapabilities({ memoryBudgetBytes: 1 }), {
      message: 'INSTALL_INSPECTION_FAILED',
    });
  } finally {
    fs.readFileSync = read;
    syncBuiltinESMExports();
  }
});

test('installed identity drift refuses the whole report instead of mixing observations', () => {
  const read = fs.readFileSync;
  let ownReads = 0;
  fs.readFileSync = (file, ...args) => {
    const value = read(file, ...args);
    if (String(file).replaceAll('\\', '/').endsWith('/install-capabilities.js') && ++ownReads > 1)
      return typeof value === 'string' ? value + '\n// synthetic changed observation' : value;
    return value;
  };
  syncBuiltinESMExports();
  try {
    assert.throws(() => api.inspectInstallCapabilities({ memoryBudgetBytes: 1 }), {
      message: 'INSTALL_INSPECTION_CHANGED',
    });
    assert.ok(ownReads >= 2);
  } finally {
    fs.readFileSync = read;
    syncBuiltinESMExports();
  }
});
