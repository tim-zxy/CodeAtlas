// Private P1-19 planning primitive; no filesystem, process, network or apply operation.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual, types } from 'node:util';

interface AgentSetupRequest {
  readonly client: 'CODEX';
  readonly configBytes: Uint8Array | null;
  readonly nodeExecutable: string;
  readonly mcpEntryPath: string;
  readonly workspaceRoot: string;
  readonly maxConfigBytes: number;
  readonly maxPlanBytes: number;
}
interface AgentSetupPorts {
  // Trusted synchronous parser adapter, not caller authorization.
  readonly parseToml: (text: string) => unknown;
}
interface AgentSetupPlan {
  readonly planVersion: 1;
  readonly client: 'CODEX';
  readonly status: 'ADD_DISABLED' | 'NO_CHANGE' | 'CONFLICT' | 'SNIPPET_ONLY';
  readonly configSha256: string | null;
  readonly snippet: string;
  readonly appendText: string | null;
  readonly applySupported: false;
  readonly executionAuthorized: false;
  readonly productionLaunch: 'UNAVAILABLE';
  readonly diagnostics: readonly string[];
}
function plain(value: unknown): asserts value is Record<string, unknown> {
  assert(
    value !== null && typeof value === 'object' && !types.isProxy(value),
    'INVALID_SETUP_INPUT',
  );
  assert([Object.prototype, null].includes(Object.getPrototypeOf(value)), 'INVALID_SETUP_INPUT');
  for (const key of Reflect.ownKeys(value)) {
    assert(typeof key === 'string', 'INVALID_SETUP_INPUT');
    assert('value' in Object.getOwnPropertyDescriptor(value, key)!, 'INVALID_SETUP_INPUT');
  }
}
function fields(value: unknown, names: string[]): asserts value is Record<string, unknown> {
  plain(value);
  assert.deepEqual(Object.keys(value).sort(), [...names].sort(), 'INVALID_SETUP_INPUT');
}
function location(value: unknown): asserts value is string {
  assert(typeof value === 'string' && value.length > 0, 'INVALID_SETUP_LOCATION');
  assert(!/[\x00-\x1f\x7f]/.test(value), 'INVALID_SETUP_LOCATION');
  assert.equal(Buffer.from(value, 'utf8').toString('utf8'), value, 'INVALID_SETUP_LOCATION');
  assert(path.isAbsolute(value) && path.resolve(value) === value, 'INVALID_SETUP_LOCATION');
}
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const bufferGetter = Object.getOwnPropertyDescriptor(typedArray, 'buffer')!.get!;
const offsetGetter = Object.getOwnPropertyDescriptor(typedArray, 'byteOffset')!.get!;
const lengthGetter = Object.getOwnPropertyDescriptor(typedArray, 'byteLength')!.get!;
function snapshotConfig(value: Uint8Array | null, limit: number): Buffer | null {
  if (value === null) return null;
  assert(types.isUint8Array(value) && !types.isProxy(value), 'INVALID_SETUP_BYTES');
  const backing = bufferGetter.call(value) as ArrayBuffer;
  assert(!types.isSharedArrayBuffer(backing), 'INVALID_SETUP_BYTES');
  const length = lengthGetter.call(value) as number;
  assert(length <= limit, 'SETUP_INPUT_LIMIT');
  return Buffer.from(new Uint8Array(backing, offsetGetter.call(value) as number, length));
}
export function planAgentSetup(request: AgentSetupRequest, ports: AgentSetupPorts): AgentSetupPlan {
  fields(request, [
    'client',
    'configBytes',
    'nodeExecutable',
    'mcpEntryPath',
    'workspaceRoot',
    'maxConfigBytes',
    'maxPlanBytes',
  ]);
  assert.equal(request.client, 'CODEX', 'UNSUPPORTED_AGENT_CLIENT');
  fields(ports, ['parseToml']);
  assert.equal(typeof ports.parseToml, 'function', 'INVALID_SETUP_PARSER');
  const parse = ports.parseToml;
  const { nodeExecutable, mcpEntryPath, workspaceRoot, maxConfigBytes, maxPlanBytes } = request;
  for (const limit of [maxConfigBytes, maxPlanBytes])
    assert(Number.isSafeInteger(limit) && limit > 0, 'INVALID_SETUP_LIMIT');
  for (const value of [nodeExecutable, mcpEntryPath, workspaceRoot]) location(value);
  assert(
    ['node', 'node.exe'].includes(path.basename(nodeExecutable).toLowerCase()),
    'INVALID_SETUP_LAUNCHER',
  );
  const bytes = snapshotConfig(request.configBytes, maxConfigBytes);
  const entry = {
    command: nodeExecutable,
    args: [mcpEntryPath],
    cwd: workspaceRoot,
    enabled: false,
  };
  const quote = (text: string) => JSON.stringify(text);
  const snippet =
    '[mcp_servers.codeatlas]\n' +
    'command = ' +
    quote(nodeExecutable) +
    '\n' +
    'args = [' +
    quote(mcpEntryPath) +
    ']\n' +
    'cwd = ' +
    quote(workspaceRoot) +
    '\n' +
    'enabled = false\n';
  // The trusted parser must roundtrip even the standalone generated syntax.
  assert(
    isDeepStrictEqual(parse(snippet), { mcp_servers: { codeatlas: entry } }),
    'INVALID_SETUP_PARSER',
  );
  let status: AgentSetupPlan['status'] = 'ADD_DISABLED';
  let appendText: string | null = snippet;
  let diagnostic: string | null = null;
  if (bytes !== null) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const existing = parse(text);
      plain(existing);
      const servers = Object.hasOwn(existing, 'mcp_servers') ? existing.mcp_servers : {};
      plain(servers);
      if (Object.hasOwn(servers, 'codeatlas')) {
        status = isDeepStrictEqual(servers.codeatlas, entry) ? 'NO_CHANGE' : 'CONFLICT';
        appendText = null;
        if (status === 'CONFLICT') diagnostic = 'SERVER_NAME_CONFLICT';
      } else {
        appendText = '\n' + snippet;
        const combined = parse(text + appendText);
        assert(
          isDeepStrictEqual(combined, {
            ...existing,
            mcp_servers: { ...servers, codeatlas: entry },
          }),
          'UNSAFE_SETUP_APPEND',
        );
      }
    } catch {
      status = 'SNIPPET_ONLY';
      appendText = null;
      diagnostic = 'EXISTING_CONFIG_NOT_SAFE_TO_MERGE';
    }
  }
  const plan: AgentSetupPlan = Object.freeze({
    planVersion: 1,
    client: 'CODEX',
    status,
    configSha256: bytes === null ? null : crypto.createHash('sha256').update(bytes).digest('hex'),
    snippet,
    appendText,
    applySupported: false,
    executionAuthorized: false,
    productionLaunch: 'UNAVAILABLE',
    diagnostics: Object.freeze([
      'PRODUCTION_MCP_ENTRY_NOT_READY',
      ...(diagnostic ? [diagnostic] : []),
    ]),
  });
  assert(Buffer.byteLength(JSON.stringify(plan), 'utf8') <= maxPlanBytes, 'SETUP_PLAN_LIMIT');
  return plan;
}
