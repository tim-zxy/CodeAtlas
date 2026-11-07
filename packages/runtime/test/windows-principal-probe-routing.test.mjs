import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const owner = new URL('../dist/windows-principal-owner.js', import.meta.url).href;
const probe = new URL('./windows-principal-live-probe.mjs', import.meta.url).href;
const filename = fileURLToPath(new URL('./windows-principal-live-probe.mjs', import.meta.url));
function run(flag, failPrecompiled = false) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const source = `import {mock} from 'node:test';
const live=new WeakSet(), counts={legacy:0,precompiled:0,released:0};
const acquire=()=>{const p=Object.freeze(Object.create(null));live.add(p);return p};
await mock.module(${JSON.stringify(owner)},{exports:{
 acquireCurrentWindowsPrincipal:async()=>{counts.legacy++;return acquire()},
 acquirePrecompiledWindowsPrincipal:async()=>{counts.precompiled++;if(${failPrecompiled})throw Object.assign(new Error('TEST_DEPLOYMENT_REFUSED'),{code:'WINDOWS_PRINCIPAL_UNAVAILABLE',cleanupState:'UNKNOWN'});return acquire()},
 assertCurrentWindowsPrincipal:p=>{if(!live.has(p))throw new Error('TEST_PRINCIPAL_UNAVAILABLE')},
 releaseCurrentWindowsPrincipal:p=>{if(!live.delete(p))throw new Error('TEST_PRINCIPAL_UNAVAILABLE');counts.released++}
}});
process.argv=[process.execPath,${JSON.stringify(filename)},${JSON.stringify(flag)}];
try {await import(${JSON.stringify(probe)})} catch {process.exitCode=1}
console.log(JSON.stringify({kind:'TEST_DOUBLE_PRINCIPAL_ROUTE',...counts}));`;
  const result = spawnSync(
    process.execPath,
    ['--experimental-test-module-mocks', '--input-type=module', '--eval', source],
    { env, encoding: 'utf8', timeout: 30000, maxBuffer: 1000000, windowsHide: true, shell: false },
  );
  assert.ifError(result.error);
  const rows = result.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return {
    result,
    route: rows.find((row) => row.kind === 'TEST_DOUBLE_PRINCIPAL_ROUTE'),
    receipt: rows.find((row) => row.kind === 'CURRENT_PROCESS_LOCAL_PRINCIPAL_PROBE'),
  };
}
test('explicit precompiled probe joins real test-owned operation without legacy fallback', () => {
  const { result, route, receipt } = run('--precompiled-current-process-only');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(route, {
    kind: 'TEST_DOUBLE_PRINCIPAL_ROUTE',
    legacy: 0,
    precompiled: 1,
    released: 1,
  });
  assert.equal(receipt.acquisition, 'PRECOMPILED_DLL');
  assert.equal(receipt.userDatabasesOpened, 0);
  assert.equal(receipt.closedHandlesInvalid, true);
});
test('legacy explicit probe stays compatible', () => {
  const { result, route, receipt } = run('--current-process-only');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(route, {
    kind: 'TEST_DOUBLE_PRINCIPAL_ROUTE',
    legacy: 1,
    precompiled: 0,
    released: 1,
  });
  assert.equal(receipt.acquisition, 'LEGACY_SOURCE');
});
test('precompiled refusal retains UNKNOWN and never tries legacy', () => {
  const { result, route, receipt } = run('--precompiled-current-process-only', true);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.deepEqual(route, {
    kind: 'TEST_DOUBLE_PRINCIPAL_ROUTE',
    legacy: 0,
    precompiled: 1,
    released: 0,
  });
  assert.equal(receipt.cleanupState, 'UNKNOWN');
  assert.equal(receipt.stage, 'principal-acquire');
});
test('unknown explicit mode performs no acquisition', () => {
  const { result, route } = run('--precompiled-any-process');
  assert.equal(result.status, 1);
  assert.deepEqual(route, {
    kind: 'TEST_DOUBLE_PRINCIPAL_ROUTE',
    legacy: 0,
    precompiled: 0,
    released: 0,
  });
});
