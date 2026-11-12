import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse } from 'smol-toml';
const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const args = ['setup', '--dry-run', '--max-request-bytes', '100000', '--input-timeout-ms', '3000'];
const request = (configToml = null) => ({
  client: 'CODEX',
  configToml,
  nodeExecutable: process.execPath,
  mcpEntryPath: path.resolve('apps/mcp/dist/main.js'),
  workspaceRoot: path.resolve('.'),
  maxConfigBytes: 32768,
  maxPlanBytes: 32768,
});
const execute = (input, options = {}) =>
  spawnSync(process.execPath, [entry, ...args], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
    ...options,
  });
test('actual setup CLI emits a disabled valid preview from explicit stdin only', () => {
  const input = request(),
    r = execute(input);
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.equal(plan.status, 'ADD_DISABLED');
  assert.equal(plan.applySupported, false);
  assert.equal(plan.executionAuthorized, false);
  assert.equal(plan.productionLaunch, 'UNAVAILABLE');
  assert.equal(parse(plan.snippet).mcp_servers.codeatlas.enabled, false);
  assert.equal(plan.configSha256, null);
});
test('explicit TOML conflicts and invalid content never echo supplied secrets', () => {
  for (const text of [
    '[mcp_servers.codeatlas]\ncommand="OWNED_PRIVATE"\nenabled=true\n',
    'bad = ["OWNED_PRIVATE',
  ]) {
    const r = execute(request(text));
    assert.equal(r.status, 0, r.stderr);
    const p = JSON.parse(r.stdout);
    assert(['CONFLICT', 'SNIPPET_ONLY'].includes(p.status));
    assert.equal(p.appendText, null);
    assert(!r.stdout.includes('OWNED_PRIVATE'));
  }
});
test('setup rejects raw malformed input unknown fields and forbidden actions without echo', () => {
  for (const input of [
    '{OWNED_PRIVATE',
    { ...request(), configPath: 'OWNED_PRIVATE' },
    { ...request(), apply: true },
    { ...request(), client: 'VS_CODE' },
    { ...request(), maxPlanBytes: 1 },
  ]) {
    const r = execute(input);
    assert.notEqual(r.status, 0);
    assert.equal(r.stdout, '');
    assert(!r.stderr.includes('OWNED_PRIVATE'));
  }
  for (const extra of [['--apply'], ['--config', 'OWNED_PRIVATE'], ['--install'], ['--start']]) {
    const r = spawnSync(process.execPath, [entry, ...args, ...extra], {
      input: '{}',
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
    });
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
    assert(!r.stderr.includes('OWNED_PRIVATE'));
  }
});

const { runAgentSetupCommand } = await import('../dist/agent-setup.js');
const { Readable, Writable } = await import('node:stream');
function io(input) {
  let out = '',
    error = '';
  return {
    streams: {
      stdin: input,
      stdout: new Writable({
        write(c, e, done) {
          out += c.toString();
          done();
        },
      }),
      stderr: new Writable({
        write(c, e, done) {
          error += c.toString();
          done();
        },
      }),
    },
    result: () => ({ out, error }),
  };
}
test('explicit stdin byte bound and timeout close input without producing a preview', async () => {
  const large = io(Readable.from([Buffer.alloc(100001, 120)]));
  assert.equal(await runAgentSetupCommand(args, large.streams), 2);
  assert.equal(large.result().out, '');
  assert(large.streams.stdin.destroyed);
  const slow = io(new Readable({ read() {} }));
  assert.equal(
    await runAgentSetupCommand(
      args.map((x) => (x === '3000' ? '25' : x)),
      slow.streams,
    ),
    1,
  );
  assert.equal(JSON.parse(slow.result().error).code, 'SETUP_PREVIEW_INPUT_TIMEOUT');
  assert(slow.streams.stdin.destroyed);
});
test('preview output failure is bounded and never becomes apply permission', async () => {
  const streams = io(Readable.from([Buffer.from(JSON.stringify(request()))]));
  streams.streams.stdout = new Writable({
    write(c, e, done) {
      done(Error('OWNED_OUTPUT_SECRET'));
    },
  });
  assert.equal(await runAgentSetupCommand(args, streams.streams), 1);
  assert.equal(streams.result().out, '');
  assert.equal(JSON.parse(streams.result().error).code, 'SETUP_PREVIEW_OUTPUT_FAILED');
  assert(!streams.result().error.includes('OWNED_OUTPUT_SECRET'));
});
test('invalid UTF8 and help/flag shapes are rejected without using payload or config paths', () => {
  const r = execute('', { input: Buffer.from([0xc0, 0xaf]) });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  for (const flags of [
    args.filter((x) => x !== '--dry-run'),
    [...args, '--dry-run'],
    ['setup', '--dry-run', '--max-request-bytes', '01', '--input-timeout-ms', '100'],
  ]) {
    const r = spawnSync(process.execPath, [entry, ...flags], {
      input: '{}',
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
    });
    assert.equal(r.status, 2);
  }
  const help = spawnSync(process.execPath, [entry, 'setup', '--help'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /stdin/);
});
test('preview leaves an owned cwd config untouched and launch paths remain unexecuted literals', async () => {
  const fs = await import('node:fs/promises'),
    os = await import('node:os');
  const base = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'codex-cli-preview-owned-')),
    ),
    config = path.join(base, 'config.toml');
  await fs.writeFile(config, 'OWNED_HOME_CANARY');
  const input = request('model="explicit-synthetic"');
  input.nodeExecutable = path.join(base, process.platform === 'win32' ? 'node.exe' : 'node');
  input.mcpEntryPath = path.join(base, 'nonexistent-mcp.js');
  input.workspaceRoot = base;
  const r = execute(input, {
    cwd: base,
    env: {
      PATH: '',
      SystemRoot: process.env.SystemRoot ?? '',
    },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).status, 'ADD_DISABLED');
  assert.equal(await fs.readFile(config, 'utf8'), 'OWNED_HOME_CANARY');
  assert.deepEqual(await fs.readdir(base), ['config.toml']);
  assert(!r.stdout.includes('OWNED_HOME_CANARY'));
});
