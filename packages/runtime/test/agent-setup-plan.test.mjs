import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { parse } from 'smol-toml';
import { planAgentSetup } from '../dist/agent-setup-plan.js';
const ports = { parseToml: parse };
const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');
const request = (configBytes = null) => ({
  client: 'CODEX',
  configBytes,
  nodeExecutable: process.execPath,
  mcpEntryPath: path.resolve('apps/mcp/dist/main.js'),
  workspaceRoot: path.resolve('.'),
  maxConfigBytes: 32768,
  maxPlanBytes: 32768,
});

test('missing config produces a valid disabled Codex preview, never launch permission', () => {
  const r = request(),
    plan = planAgentSetup(r, ports);
  assert.equal(plan.status, 'ADD_DISABLED');
  assert.equal(plan.configSha256, null);
  assert.equal(plan.applySupported, false);
  assert.equal(plan.executionAuthorized, false);
  assert.equal(plan.productionLaunch, 'UNAVAILABLE');
  assert.deepEqual(parse(plan.snippet), {
    mcp_servers: {
      codeatlas: {
        command: r.nodeExecutable,
        args: [r.mcpEntryPath],
        cwd: r.workspaceRoot,
        enabled: false,
      },
    },
  });
  assert.equal(plan.appendText, plan.snippet);
  assert.ok(Object.isFrozen(plan));
});

test('owned CRLF config with existing tables is unchanged; append stays in absolute MCP section and hides old secrets', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-setup-owned-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const p = path.join(root, 'config.toml');
  fs.writeFileSync(
    p,
    '# owned fixture\r\nmodel = "synthetic"\r\n[other]\r\ncredential = "DO_NOT_ECHO_OWNED_SECRET"\r\n',
  );
  const before = fs.readFileSync(p),
    plan = planAgentSetup(request(before), ports);
  assert.equal(plan.status, 'ADD_DISABLED');
  assert.equal(plan.configSha256, digest(before));
  const parsed = parse(before.toString('utf8') + plan.appendText);
  assert.deepEqual(parsed.other, { credential: 'DO_NOT_ECHO_OWNED_SECRET' });
  assert.equal(parsed.model, 'synthetic');
  assert.equal(parsed.mcp_servers.codeatlas.enabled, false);
  assert.equal(JSON.stringify(plan).includes('DO_NOT_ECHO_OWNED_SECRET'), false);
  assert.deepEqual(fs.readFileSync(p), before);
  assert.deepEqual(fs.readdirSync(root), ['config.toml']);
});

test('exact disabled entry is idempotent; a conflicting or expanded entry is never replaced or echoed', () => {
  const first = planAgentSetup(request(), ports);
  const same = planAgentSetup(request(Buffer.from(first.snippet)), ports);
  assert.equal(same.status, 'NO_CHANGE');
  assert.equal(same.appendText, null);
  for (const text of [
    first.snippet.replace('enabled = false', 'enabled = true'),
    first.snippet + 'env = { TOKEN = "OWNED_SECRET" }\n',
  ]) {
    const plan = planAgentSetup(request(Buffer.from(text)), ports);
    assert.equal(plan.status, 'CONFLICT');
    assert.equal(plan.appendText, null);
    assert.equal(JSON.stringify(plan).includes('OWNED_SECRET'), false);
  }
});

test('invalid TOML, invalid UTF8 and wrong MCP table type yield safe standalone snippet only', () => {
  for (const bytes of [
    Buffer.from('bad = [ "SECRET_INVALID'),
    Buffer.from([0xc0, 0xaf]),
    Buffer.from('mcp_servers = 3'),
  ]) {
    const plan = planAgentSetup(request(bytes), ports);
    assert.equal(plan.status, 'SNIPPET_ONLY');
    assert.equal(plan.appendText, null);
    assert.equal(JSON.stringify(plan).includes('SECRET_INVALID'), false);
    assert.equal(parse(plan.snippet).mcp_servers.codeatlas.enabled, false);
  }
});

test('unsupported clients, unsafe launch strings, unknown flags and byte limits refuse explicitly', () => {
  for (const update of [
    { client: 'VS_CODE' },
    { apply: true },
    { nodeExecutable: 'npx' },
    { mcpEntryPath: 'relative.js' },
    { workspaceRoot: 'bad\npath' },
    { maxConfigBytes: 0 },
    { maxPlanBytes: 1 },
    { configBytes: Buffer.alloc(32769) },
  ]) {
    assert.throws(() => planAgentSetup({ ...request(), ...update }, ports));
  }
});
test('input bytes are snapshotted before parser callbacks; plan never aliases mutable input', () => {
  const bytes = Buffer.from('model = "owned"\n');
  const expected = digest(bytes);
  const plan = planAgentSetup(request(bytes), {
    parseToml(text) {
      bytes.fill(120);
      return parse(text);
    },
  });
  assert.equal(plan.configSha256, expected);
  assert.equal(plan.status, 'ADD_DISABLED');
  assert.equal(plan.appendText.includes('model'), false);
});

test('append preserves dates, quoted tables, arrays and comments without reserializing old content', () => {
  for (const text of [
    '# comment without final newline',
    'date = 2026-11-10\nitems = [{ n = 1 }]\n[mcp_servers."other.name"]\ncommand = "owned"\n',
  ]) {
    const plan = planAgentSetup(request(Buffer.from(text)), ports);
    assert.equal(plan.status, 'ADD_DISABLED');
    const old = parse(text),
      combined = parse(text + plan.appendText);
    const inserted = combined.mcp_servers.codeatlas;
    delete combined.mcp_servers.codeatlas;
    if (!old.mcp_servers) delete combined.mcp_servers;
    assert.deepEqual(combined, old);
    assert.equal(inserted.enabled, false);
  }
});

test('intrinsic byte limits cannot be hidden by typed-array properties and conversion hooks never run', () => {
  const large = new Uint8Array(32769);
  Object.defineProperty(large, 'byteLength', { value: 0 });
  assert.throws(() => planAgentSetup(request(large), ports), /SETUP_INPUT_LIMIT/);
  const original = Buffer.from('model = "original"\n');
  const bytes = new Uint8Array(original);
  let hooks = 0;
  Object.defineProperty(bytes, 'byteLength', {
    get() {
      hooks++;
      return 0;
    },
  });
  Object.defineProperty(bytes, 'length', {
    get() {
      hooks++;
      return 0;
    },
  });
  bytes.valueOf = () => {
    hooks++;
    return Buffer.from('model = "replaced"\n');
  };
  const plan = planAgentSetup(request(bytes), ports);
  assert.equal(plan.configSha256, digest(original));
  assert.equal(hooks, 0);
  assert.throws(() => planAgentSetup(request(new Uint8Array(new SharedArrayBuffer(2))), ports));
  assert.throws(() => planAgentSetup(request(new Proxy(new Uint8Array(2), {})), ports));
});
