import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const entryPoint = fileURLToPath(new URL('../dist/main.js', import.meta.url));

test('MCP explicit smoke mode starts and exits cleanly', () => {
  const result = spawnSync(process.execPath, [entryPoint, '--smoke'], { encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'codeatlas-mcp:ready\n');
});

test('MCP rejects an unsupported invocation', () => {
  const result = spawnSync(process.execPath, [entryPoint], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /not implemented in P0-W0-001/);
});
