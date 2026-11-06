import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('V2 HOST factory declarations compile; pure adapters preserve ownership gates', () => {
  const r = spawnSync(
    'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-File',
      fileURLToPath(new URL('./test-mixed-native-dynamic-host-windows.ps1', import.meta.url)),
    ],
    { windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 1000000 },
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const result = JSON.parse(r.stdout.trim());
  assert.equal(result.kind, 'DYNAMIC_HOST_FACTORY_COMPILE_AND_PURE_ADAPTER_UNIT');
  assert.ok(result.passed >= 20);
  assert.equal(result.actualHostStarts, 0);
  assert.equal(result.actualWindowsCalls, 0);
  assert.equal(result.loopRuns, 0);
  assert.equal(result.executionAuthorized, false);
});
