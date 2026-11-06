import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('debug event bridge synthetic ordering and cleanup', () => {
  const r = spawnSync(
    'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-File',
      fileURLToPath(new URL('./test-mixed-native-debug-event-bridge.ps1', import.meta.url)),
    ],
    { windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 1000000 },
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const v = JSON.parse(r.stdout.trim());
  assert.equal(v.kind, 'PURE_DEBUG_EVENT_BRIDGE_UNIT');
  assert.ok(v.passed >= 20);
  assert.equal(v.actualOsCalls, 0);
  assert.equal(v.actualCollectorRuns, 0);
});
