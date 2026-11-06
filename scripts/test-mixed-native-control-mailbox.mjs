import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test(
  'bounded C# mailbox uses only memory and explicit fixture caps',
  { skip: process.platform !== 'win32' },
  (t) => {
    const source = fs.readFileSync(
      new URL('./mixed-native-control-mailbox.cs', import.meta.url),
      'utf8',
    );
    for (const forbidden of [
      'DllImport',
      'System.Diagnostics',
      'System.IO',
      'MixedNativeObserverPolicy',
      'MixedProcessCollector',
    ])
      assert.equal(source.includes(forbidden), false);
    const result = spawnSync(
      'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        fileURLToPath(new URL('./test-mixed-native-control-mailbox.ps1', import.meta.url)),
      ],
      { windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 1000000 },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const evidence = JSON.parse(result.stdout.trim());
    assert.equal(evidence.kind, 'PURE_MIXED_NATIVE_CONTROL_MAILBOX_UNIT');
    assert.ok(evidence.passed > 100);
    assert.equal(evidence.actualCollectorRuns, 0);
    assert.equal(evidence.actualNativeRuns, 0);
    assert.equal(evidence.actualDatabaseRuns, 0);
    t.diagnostic(JSON.stringify(evidence));
  },
);
