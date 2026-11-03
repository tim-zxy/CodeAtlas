import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { validateSyntaxPeakTranscript } from './syntax-observation-evidence.mjs';
for (const mode of ['short', 'ready'])
  test(
    'Windows OS peak collector Node-helper conformance ' + mode,
    { skip: process.platform !== 'win32' },
    () => {
      assert.ok(
        existsSync('scripts/syntax-peak-collector.ps1'),
        'OS collector implementation is missing',
      );
      const p = spawnSync(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-File',
          'scripts/syntax-peak-collector.ps1',
          '-NodeExecutable',
          process.execPath,
          '-Mode',
          mode,
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 1000000 },
      );
      assert.equal(p.error, undefined);
      assert.equal(p.status, 0, p.stderr);
      const result = JSON.parse(p.stdout);
      assert.equal(result.kind, 'NODE_HELPER_CONFORMANCE_ONLY');
      assert.equal(result.childExitCode, 0);
      assert.notEqual(result.transcript.processId, process.pid);
      const peak = validateSyntaxPeakTranscript(result.transcript);
      assert.ok(peak.peakBytes > 0);
      assert.equal(peak.peakMethod, 'PROCESS_MEMORY_COUNTERS.PeakWorkingSetSize');
    },
  );
