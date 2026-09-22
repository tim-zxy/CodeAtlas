# P0-W3-004 TypeScript Native Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production TypeScript native-process client that safely executes one Native IPC v1 request and exposes facts only after complete protocol and checksum validation.

**Architecture:** `@codeatlas/providers` owns one public `executeNativeRequest` boundary. It spawns an explicit executable with no shell or inherited environment, incrementally decodes bounded JSONL into a private event buffer, and returns a deeply frozen result only after process, stream, terminal, and checksum validation. A deterministic Node child supplies failure modes; the real Rust binary proves the production `DESCRIBE` path.

**Tech Stack:** Node.js 24 built-ins (`node:child_process`, `node:crypto`, `node:path`, streams, `TextDecoder`), TypeScript 7 strict mode, Zod 4 schemas already owned by `@codeatlas/providers`, Node test runner, Rust workspace binary.

**Spec:** `docs/superpowers/specs/2026-09-22-p0-w3-004-typescript-native-client-design.md`

## Global Constraints

- One request owns one child process; timeout or `AbortSignal` terminates it, and no protocol `CANCEL` is appended to stdin.
- Spawn only an absolute executable path with `shell: false`; arguments are an explicit string array and never a command string.
- Inherit no environment. Permit only `LANG`, `LC_ALL`, `NO_COLOR`, `SYSTEMROOT`, `WINDIR`, `TEMP`, and `TMP`, with Windows case-insensitive duplicate rejection.
- Hard ceilings are stdin 1,000,000 bytes, stdout line 1,000,000 bytes, stdout total 10,000,000 bytes, 10,000 events, and stderr 1,000,000 bytes; callers may only tighten them.
- stdout is strict UTF-8 LF-only JSONL with no BOM, CR, blank line, incomplete final line, or post-terminal bytes.
- Successful `ANALYZE` and `REFRESH` checksums are lowercase `sha256:<64 hex>` over every pre-terminal raw JSONL record including LF.
- No public callback, iterator, storage port, SQLite access, parser, daemon, process pool, or Canonical/Knowledge mutation is introduced.
- Use only Node standard-library capabilities and the existing Zod dependency.
- Keep all public messages bounded and safe; never include command, arguments, environment, stdin, raw stdout, source text, or partial events.
- Every task follows red-green-refactor, runs its focused tests, and commits only its declared files.

## Review Focus

- A signal that aborts while a successful process is closing must deterministically report `CANCELLED`; Task 4 adds the race test.
- A child that closes before stdin drains must reject promptly and leave no unhandled stream error; Task 4 adds the early-close test.
- LF and a multi-byte UTF-8 character split across arbitrary chunks must decode exactly once; Task 3 adds byte-at-a-time output tests.
- Windows-equivalent environment names such as `TEMP` and `temp` must be rejected as duplicates rather than silently overwrite; Task 2 adds the platform-independent canonicalization test.
- Output exactly at each byte/count ceiling must pass while one byte or event over fails; Task 3 adds paired boundary tests.

---

## File map

- Create `packages/providers/src/native-client.ts`: public options/result/error types, configuration validation, secure spawning, JSONL decoder, lifecycle cleanup, complete-stream validation, checksum verification, and deep freeze.
- Modify `packages/providers/src/index.ts`: export the native-client public API.
- Create `packages/providers/test/fixtures/native-client-child.mjs`: deterministic child scenarios driven only by explicit arguments.
- Create `packages/providers/test/native-client.test.mjs`: fixture manifest, helper-process, protocol, lifecycle, checksum, and no-partial-apply tests.
- Create `packages/providers/test/native-client-binary.test.mjs`: production client against the already-built Rust binary.
- Create `fixtures/ipc/client-v1/cases.json`: P0-W3-004 fixture identity, authority, acceptance, and closed scenario list.
- Modify successful event files under `fixtures/ipc/protocol-v1`: replace opaque analysis/refresh checksums with the specified SHA-256 values.
- Modify `package.json`: register the mandatory helper test in `pnpm test` and the real-binary test after `cargo build --workspace` in `pnpm verify`.
- Modify `docs/handoff/specs/NATIVE_IPC.md`, `docs/handoff/specs/SECURITY.md`, `docs/handoff/DESIGN_TRACEABILITY.md`, and `docs/handoff/CURRENT_STATUS.md`: synchronize contract, Fixture mapping, and fresh completion evidence.

### Task 1: Freeze the P0-W3-004 Fixture and helper protocol

**Files:**

- Create: `fixtures/ipc/client-v1/cases.json`
- Create: `packages/providers/test/fixtures/native-client-child.mjs`
- Create: `packages/providers/test/native-client.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: `NativeRequestEnvelope` JSONL on child stdin and scenario name at `process.argv[2]`.
- Produces: fixture ID `p0-native-client-v1`; a deterministic helper whose scenarios emit exact stdout/stderr/exit behavior; a mandatory Node test entry.

- [ ] **Step 1: Add the fixture manifest and its failing registry test**

Create the manifest with exact task/acceptance ownership and closed scenario names:

```json
{
  "schemaVersion": 1,
  "fixtureId": "p0-native-client-v1",
  "task": "P0-W3-004",
  "governingSpecs": ["Native IPC", "Security"],
  "acceptance": "Protocol corruption, process failure, timeout, and cancellation never expose partially applicable state",
  "cases": [
    "valid-describe",
    "valid-analyze",
    "environment",
    "slow-stdin",
    "burst-output",
    "byte-at-a-time",
    "stderr",
    "stderr-oversize",
    "malformed-json",
    "invalid-utf8",
    "bom",
    "crlf",
    "blank-line",
    "line-boundary",
    "line-oversize",
    "total-boundary",
    "total-oversize",
    "event-boundary",
    "event-oversize",
    "wrong-request-id",
    "out-of-order",
    "premature-eof",
    "post-terminal",
    "nonzero-exit",
    "early-close",
    "analyzer-failed",
    "invalid-checksum",
    "checksum-mismatch",
    "hang",
    "abort-close-race"
  ]
}
```

Start `native-client.test.mjs` with imports, repository-relative fixture resolution, and this assertion:

```js
test('p0-native-client-v1 declares the P0-W3-004 acceptance surface', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  assert.equal(manifest.fixtureId, 'p0-native-client-v1');
  assert.equal(manifest.task, 'P0-W3-004');
  assert.deepEqual(manifest.governingSpecs, ['Native IPC', 'Security']);
  assert.equal(new Set(manifest.cases).size, 30);
  assert.ok(manifest.cases.includes('malformed-json'));
  assert.ok(manifest.cases.includes('out-of-order'));
  assert.ok(manifest.cases.includes('total-oversize'));
  assert.ok(manifest.cases.includes('hang'));
  assert.ok(manifest.cases.includes('abort-close-race'));
});
```

- [ ] **Step 2: Run the focused test to verify the missing files fail**

Run:

```powershell
node --test packages/providers/test/native-client.test.mjs
```

Expected: FAIL because the new manifest/helper or production client import does not yet exist.

- [ ] **Step 3: Add the deterministic helper foundation**

The helper must read stdin as bytes, parse exactly one request for normal scenarios, and expose reusable writers:

```js
import { createHash } from 'node:crypto';

const scenario = process.argv[2];
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const requestBytes = Buffer.concat(chunks);
const request = JSON.parse(requestBytes.subarray(0, -1).toString('utf8'));

const line = (event) => Buffer.from(`${JSON.stringify(event)}\n`, 'utf8');
const write = (bytes) => new Promise((resolve, reject) => {
  process.stdout.write(bytes, (error) => error ? reject(error) : resolve());
});
const checksum = (records) =>
  `sha256:${createHash('sha256').update(Buffer.concat(records)).digest('hex')}`;

function envelope(type, sequence, payload, requestId = request.requestId) {
  return { protocolVersion: 1, requestId, sequence, type, payload };
}
```

Implement `valid-describe` and `malformed-json` for the first red/green slice, and fail closed for unknown scenarios:

```js
if (scenario === 'valid-describe') {
  await write(line(envelope('DESCRIBE_COMPLETED', 0, {
    providerId: 'native',
    providerVersion: '0.0.0',
    runtimeVersion: '0.0.0',
    protocolVersions: [1],
    irSchemaVersions: [1],
    capabilities: ['protocol-handshake'],
    languages: [{
      languageId: 'java',
      grammarVersion: '0.0.0',
      analyzerVersion: '0.0.0',
      compatibilityVersion: '1',
    }],
    limits: { maxLineBytes: 1_000_000, maxEventCount: 10_000, maxTotalBytes: 10_000_000 },
    build: { target: 'test', profile: 'debug' },
  })));
} else if (scenario === 'malformed-json') {
  await write(Buffer.from('{not-json}\n'));
} else {
  process.stderr.write('unknown native-client test scenario\n');
  process.exitCode = 2;
}
```

Do not read scenario selection from environment and do not invoke a shell.

- [ ] **Step 4: Register the mandatory test and verify the fixture assertion passes**

Add `packages/providers/test/native-client.test.mjs` to the explicit file list in the root `test` script. Run:

```powershell
node --test --test-name-pattern="declares the P0-W3-004" packages/providers/test/native-client.test.mjs
```

Expected: PASS 1 test.

- [ ] **Step 5: Commit the Fixture foundation**

```powershell
git add fixtures/ipc/client-v1/cases.json packages/providers/test/fixtures/native-client-child.mjs packages/providers/test/native-client.test.mjs package.json
git commit -m "test: declare native client fixture"
```

### Task 2: Add the public contract and configuration security

**Files:**

- Create: `packages/providers/src/native-client.ts`
- Modify: `packages/providers/src/index.ts`
- Modify: `packages/providers/test/native-client.test.mjs`

**Interfaces:**

- Consumes: `NativeRequestEnvelopeSchema`, `NativeEventEnvelope`, `NativeIpcError`, and `NativeEventStreamSchema` from `native-ipc.ts`.
- Produces: `executeNativeRequest(request, options)`, `NativeClientOptions`, `NativeClientLimits`, `ValidatedNativeResult`, `NativeClientError`, `NativeClientErrorCode`, and `NATIVE_CLIENT_HARD_LIMITS`.

- [ ] **Step 1: Write failing public-contract and configuration tests**

Import the built package API from `../dist/index.js`. Add a valid DESCRIBE request and assert:

```js
const describeRequest = {
  protocolVersion: 1,
  requestId: 'client-describe-a',
  type: 'DESCRIBE',
  payload: { clientProtocolVersions: [1], clientIrSchemaVersions: [1] },
};

test('configuration rejects relative paths, command strings, unsafe environment, and raised limits', async () => {
  const invalid = [
    { executablePath: 'node', timeoutMs: 1000 },
    { executablePath: process.execPath, arguments: '--version', timeoutMs: 1000 },
    { executablePath: process.execPath, timeoutMs: 1000, allowedEnvironment: { PATH: 'x' } },
    { executablePath: process.execPath, timeoutMs: 1000, allowedEnvironment: { TEMP: 'a', temp: 'b' } },
    { executablePath: process.execPath, timeoutMs: 0 },
    { executablePath: process.execPath, timeoutMs: 1000, limits: { maxLineBytes: 1_000_001 } },
  ];
  for (const options of invalid) {
    await assert.rejects(
      executeNativeRequest(describeRequest, options),
      (error) => error instanceof NativeClientError && error.code === 'INVALID_CONFIGURATION',
    );
  }
});

test('invalid requests fail before spawning', async () => {
  await assert.rejects(
    executeNativeRequest({ ...describeRequest, extra: true }, {
      executablePath: 'Z:\\definitely-not-spawned.exe',
      timeoutMs: 1000,
    }),
    (error) => error instanceof NativeClientError && error.code === 'INVALID_REQUEST',
  );
});

test('valid configuration executes one shell-free DESCRIBE process', async () => {
  const result = await runScenario('valid-describe');
  assert.equal(result.terminal.type, 'DESCRIBE_COMPLETED');
  assert.equal(result.events.length, 1);
  assert.equal(result.request.requestId, describeRequest.requestId);
});
```

The `TEMP`/`temp` case is intentionally asserted on every platform so canonicalization logic is testable on Linux CI as well as Windows.

- [ ] **Step 2: Build and run the focused tests to verify missing exports fail**

Run:

```powershell
pnpm --filter @codeatlas/providers build
node --test --test-name-pattern="configuration|invalid requests" packages/providers/test/native-client.test.mjs
```

Expected: build or import FAIL because the public API is absent.

- [ ] **Step 3: Implement exact public types, safe error serialization, and validation**

Start `native-client.ts` with the closed public contract:

```ts
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { isAbsolute } from 'node:path';
import {
  NativeEventStreamSchema,
  NativeRequestEnvelopeSchema,
  type NativeEventEnvelope,
  type NativeIpcError,
  type NativeRequestEnvelope,
} from './native-ipc.js';

export const NATIVE_CLIENT_HARD_LIMITS = Object.freeze({
  maxStdinBytes: 1_000_000,
  maxLineBytes: 1_000_000,
  maxStdoutBytes: 10_000_000,
  maxEvents: 10_000,
  maxStderrBytes: 1_000_000,
} as const);

export interface NativeClientLimits {
  readonly maxStdinBytes: number;
  readonly maxLineBytes: number;
  readonly maxStdoutBytes: number;
  readonly maxEvents: number;
  readonly maxStderrBytes: number;
}

export interface NativeClientOptions {
  readonly executablePath: string;
  readonly arguments?: readonly string[];
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly allowedEnvironment?: Readonly<Record<string, string>>;
  readonly limits?: Partial<NativeClientLimits>;
}

export type NativeClientErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_REQUEST'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROCESS_FAILED'
  | 'PROTOCOL_VIOLATION'
  | 'OUTPUT_LIMIT_EXCEEDED'
  | 'CHECKSUM_MISMATCH'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'ANALYZER_FAILED';

export interface ValidatedNativeResult {
  readonly request: NativeRequestEnvelope;
  readonly events: readonly NativeEventEnvelope[];
  readonly terminal: NativeEventEnvelope;
  readonly stderr: string;
}
```

Implement `NativeClientError` with readonly code/request/exit/analyzer fields, bounded stderr diagnostic data, `Error.captureStackTrace`, and `toJSON()` returning only `{ name, code, requestId, message, exitCode, signal, analyzerError }` keys that are present. Do not serialize stderr or cause.

Add internal `validateOptions` and `parseRequest` helpers. The environment set is exactly:

```ts
const ALLOWED_ENVIRONMENT = new Set([
  'LANG', 'LC_ALL', 'NO_COLOR', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP',
]);
```

Canonicalize names with `toUpperCase()` for validation on every platform, reject duplicate canonical names, NUL, blank values, and values above 4096 UTF-16 code units, but preserve the canonical uppercase key in the child environment. Validate every limit as a positive safe integer no greater than its corresponding hard ceiling. Merge tightened limits over the hard defaults into a frozen object.

Implement the first complete happy path:

- parse the request before configuration so an invalid request never reaches spawn;
- spawn the explicit executable and argument array with `shell: false`, sanitized `env`, piped stdio, and `windowsHide: true`;
- serialize one request plus LF, enforce the stdin ceiling, write it, and end stdin;
- concurrently drain stderr and stdout into bounded buffers;
- await process `close`, reject spawn errors as `PROVIDER_UNAVAILABLE`, and reject non-zero exit as `PROCESS_FAILED`;
- split successful stdout on LF, reject missing final LF, parse each line with fatal UTF-8/JSON/schema validation, and validate `{ request, events }` with `NativeEventStreamSchema`;
- return `{ request, events, terminal: events.at(-1), stderr }` for the valid DESCRIBE helper.

This baseline deliberately uses one bounded stdout buffer. Task 3 replaces only that internal buffering step with the incremental line decoder while preserving the working public behavior.

- [ ] **Step 4: Export and run build/configuration tests**

Append:

```ts
export * from './native-client.js';
```

to `packages/providers/src/index.ts`. Run:

```powershell
pnpm --filter @codeatlas/providers build
node --test --test-name-pattern="configuration|invalid requests|shell-free DESCRIBE" packages/providers/test/native-client.test.mjs
```

Expected: PASS for all three selected tests with no TypeScript errors.

- [ ] **Step 5: Commit the public contract**

```powershell
git add packages/providers/src/native-client.ts packages/providers/src/index.ts packages/providers/test/native-client.test.mjs
git commit -m "feat: define native client boundary"
```

### Task 3: Implement strict streaming JSONL and boundary limits

**Files:**

- Modify: `packages/providers/src/native-client.ts`
- Modify: `packages/providers/test/fixtures/native-client-child.mjs`
- Modify: `packages/providers/test/native-client.test.mjs`

**Interfaces:**

- Consumes: validated request/options from Task 2 and `Readable` stdout chunks.
- Produces: private `decodeStdout(stdout, request, limits)` returning buffered events, terminal, and pre-terminal SHA-256 digest material without exposing events publicly.

- [ ] **Step 1: Add failing strict framing and chunk-boundary tests**

Add a `runScenario` helper that invokes `executeNativeRequest` with `process.execPath`, the absolute child-helper path, the scenario argument, and a 2-second timeout. Add table tests expecting `PROTOCOL_VIOLATION` for `malformed-json`, `invalid-utf8`, `bom`, `crlf`, `blank-line`, `wrong-request-id`, `out-of-order`, `premature-eof`, and `post-terminal`.

Add paired limit assertions:

```js
for (const scenario of ['line-boundary', 'total-boundary', 'event-boundary']) {
  await assert.doesNotReject(runScenario(scenario));
}
for (const scenario of ['line-oversize', 'total-oversize', 'event-oversize']) {
  await assert.rejects(
    runScenario(scenario),
    (error) => error instanceof NativeClientError && error.code === 'OUTPUT_LIMIT_EXCEEDED',
  );
}

test('byte-at-a-time chunks preserve split UTF-8 and LF boundaries', async () => {
  const result = await runScenario('byte-at-a-time');
  assert.equal(result.terminal.type, 'DESCRIBE_COMPLETED');
  assert.equal(result.terminal.payload.build.profile, 'débug');
});
```

Use tightened limits in boundary scenarios so fixtures remain small: for example `maxLineBytes: 512`, `maxStdoutBytes: 4096`, and `maxEvents: 4`; make the helper emit exact and plus-one values selected by scenario.

- [ ] **Step 2: Run the focused decoder tests to verify failure**

Run:

```powershell
pnpm --filter @codeatlas/providers build
node --test --test-name-pattern="framing|boundary|UTF-8" packages/providers/test/native-client.test.mjs
```

Expected: FAIL because execution/decoder behavior is not implemented.

- [ ] **Step 3: Implement secure spawn and incremental decoding**

Retain `spawn(options.executablePath, [...arguments], { shell: false, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })`. Map synchronous throw and child `error` before spawn to `PROVIDER_UNAVAILABLE` without including the executable path in the message. Replace the baseline whole-stdout parsing with incremental decoding.

Implement a byte-buffer decoder using async iteration:

```ts
const decoder = new TextDecoder('utf-8', { fatal: true });
let pending = Buffer.alloc(0);
let totalBytes = 0;
for await (const chunk of stdout) {
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  totalBytes += bytes.byteLength;
  enforceTotal(totalBytes, limits.maxStdoutBytes);
  pending = Buffer.concat([pending, bytes]);
  while (true) {
    const lf = pending.indexOf(0x0a);
    if (lf < 0) {
      enforceLine(pending.byteLength, limits.maxLineBytes);
      break;
    }
    const rawLine = pending.subarray(0, lf);
    pending = pending.subarray(lf + 1);
    parseEventLine(rawLine, decoder, request, events, limits);
  }
}
if (pending.byteLength !== 0) failProtocol('Native stdout ended with an incomplete record');
```

`parseEventLine` checks line bytes before decoding, rejects zero bytes, BOM prefix, any CR byte, fatal UTF-8 failure, JSON parse failure, and event-schema failure. It then checks request ID, `sequence === events.length`, legal request/event type, `REQUEST_FAILED` only at zero, no event after a terminal, and `events.length + 1 <= min(client maxEvents, request resource maxEvents when present)`.

Once a terminal is seen, any subsequent raw byte, including an incomplete byte, is `PROTOCOL_VIOLATION`. Do not resolve on terminal; continue draining until EOF to detect post-terminal data.

Use `Buffer.concat` only within the 1 MB line ceiling. Retain each exact line plus LF alongside the parsed event until checksum validation; total retained raw bytes remain under the 10 MB ceiling.

After EOF, run `NativeEventStreamSchema.safeParse({ request, events })` and map any failure to a fixed `PROTOCOL_VIOLATION`. For this task, return valid DESCRIBE and successful analysis/refresh terminals; Task 5 adds analyzer-failure mapping, checksum enforcement, and deep freezing without changing the decoder contract.

- [ ] **Step 4: Implement helper scenarios and make decoder tests pass**

Add a strict valid DESCRIBE payload factory. Implement malformed framing scenarios with raw buffers, byte-at-a-time writes with awaited callbacks, and boundary factories driven by the tightened limits. For `post-terminal`, write one valid terminal line followed by one extra byte. For `premature-eof`, emit a legal non-terminal `ANALYSIS_STARTED` record and close.

Run:

```powershell
pnpm --filter @codeatlas/providers build
node --test --test-name-pattern="framing|boundary|UTF-8" packages/providers/test/native-client.test.mjs
```

Expected: all selected tests PASS.

- [ ] **Step 5: Commit the decoder**

```powershell
git add packages/providers/src/native-client.ts packages/providers/test/fixtures/native-client-child.mjs packages/providers/test/native-client.test.mjs
git commit -m "feat: decode bounded native JSONL"
```

### Task 4: Enforce stdin, stderr, timeout, cancellation, and process cleanup

**Files:**

- Modify: `packages/providers/src/native-client.ts`
- Modify: `packages/providers/test/fixtures/native-client-child.mjs`
- Modify: `packages/providers/test/native-client.test.mjs`

**Interfaces:**

- Consumes: secure child and decoder from Task 3.
- Produces: one lifecycle coordinator that records deterministic first failure, terminates, drains both output pipes, waits for `close`, and settles only after cleanup.

- [ ] **Step 1: Add failing lifecycle, environment, backpressure, and stderr tests**

Add tests for:

```js
test('child receives only explicitly allowed environment', async () => {
  const result = await runScenario('environment', {
    allowedEnvironment: { LANG: 'C', TEMP: 'native-temp' },
  });
  assert.equal(result.stderr, 'LANG=C\nTEMP=native-temp\nPATH=<absent>\n');
});

test('timeout and cancellation close the child before rejection settles', async () => {
  await assert.rejects(runScenario('hang', { timeoutMs: 50 }), hasCode('TIMEOUT'));
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 25);
  await assert.rejects(
    runScenario('hang', { signal: controller.signal }),
    hasCode('CANCELLED'),
  );
});

test('already expired and aborted requests never spawn', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runScenario('should-not-run', { signal: controller.signal }), hasCode('CANCELLED'));
  const expired = structuredClone(analyzeRequest);
  expired.payload.deadlineEpochMs = Date.now() - 1;
  await assert.rejects(runScenario('should-not-run', {}, expired), hasCode('TIMEOUT'));
});
```

Also add assertions for `slow-stdin`, `burst-output`, exact stderr capture, stderr overflow as `OUTPUT_LIMIT_EXCEEDED`, `early-close` as `PROCESS_FAILED`, `nonzero-exit` as `PROCESS_FAILED`, and `abort-close-race` as `CANCELLED`. Install a temporary `process.on('unhandledRejection')` collector around the early-close test and assert it stays empty.

- [ ] **Step 2: Run lifecycle tests to verify failure**

Run:

```powershell
pnpm --filter @codeatlas/providers build
node --test --test-name-pattern="environment|timeout|cancellation|stdin|stdout|stderr|early-close|race" packages/providers/test/native-client.test.mjs
```

Expected: FAIL because lifecycle precedence and bounded stderr are incomplete.

- [ ] **Step 3: Implement request writing and concurrent stderr capture**

Serialize the already parsed request to `Buffer.from(JSON.stringify(request) + '\n', 'utf8')`, enforce stdin bytes before spawn, and write through a promise that observes `error`, `close`, write callback, and `drain` when `write()` returns false. Remove all listeners in one settlement function. End stdin only after the buffered request is accepted.

Consume stderr concurrently with stdout. Count all raw bytes. Keep at most `maxStderrBytes`, set `OUTPUT_LIMIT_EXCEEDED` immediately on the first excess byte, and keep cleanup responsible for killing/closing the child. Decode retained bytes with non-fatal UTF-8 replacement because stderr is diagnostic text, not protocol.

- [ ] **Step 4: Implement deterministic lifecycle ownership**

Create exactly one mutable failure slot and a `recordFailure(error)` function. It replaces an existing failure only when the new code has higher precedence:

```ts
const precedence: Readonly<Record<NativeClientErrorCode, number>> = {
  CANCELLED: 5,
  TIMEOUT: 4,
  PROTOCOL_VIOLATION: 3,
  OUTPUT_LIMIT_EXCEEDED: 3,
  CHECKSUM_MISMATCH: 3,
  INVALID_CONFIGURATION: 3,
  INVALID_REQUEST: 3,
  PROVIDER_UNAVAILABLE: 2,
  PROCESS_FAILED: 2,
  ANALYZER_FAILED: 1,
};
```

Create timeout and abort hooks before writing. Effective timeout is `min(options.timeoutMs, resourceBudget.maxDurationMs, deadlineEpochMs - Date.now())` for analysis/refresh and `options.timeoutMs` otherwise. Preflight non-positive effective duration as `TIMEOUT` without spawn.

On the first running failure, call `child.kill()` once, start a 250 ms unref'd grace timer, then call `child.kill('SIGKILL')` only if `close` has not fired. Await settled stdin/stdout/stderr work and the `close` event. Clear timers/listeners in `finally`. Only then throw the highest-precedence recorded error.

If close reports non-zero code or signal without a higher failure, record `PROCESS_FAILED`. A successful close with decoder failure retains the decoder error. No promise may reject after the exported promise settles.

- [ ] **Step 5: Implement helper lifecycle scenarios and run focused tests**

The helper must:

- delay reading stdin for `slow-stdin`;
- emit many valid records without awaiting every write for `burst-output`, then await drain;
- print exact diagnostic lines for `environment` and `stderr`;
- exceed a tightened stderr limit by one byte for `stderr-oversize`;
- exit before reading all stdin for `early-close`;
- set exit code 7 for `nonzero-exit`;
- keep an interval alive for `hang` and exit on termination;
- emit a valid terminal and wait one event-loop turn before exit for `abort-close-race`.

Run the Step 2 command again. Expected: all selected tests PASS and no orphan child remains.

- [ ] **Step 6: Commit lifecycle enforcement**

```powershell
git add packages/providers/src/native-client.ts packages/providers/test/fixtures/native-client-child.mjs packages/providers/test/native-client.test.mjs
git commit -m "feat: enforce native process lifecycle"
```

### Task 5: Validate complete streams, checksums, immutable results, and zero partial apply

**Files:**

- Modify: `packages/providers/src/native-client.ts`
- Modify: `packages/providers/test/fixtures/native-client-child.mjs`
- Modify: `packages/providers/test/native-client.test.mjs`
- Modify: `fixtures/ipc/protocol-v1/analyze-java-basic-v1/events.jsonl`
- Modify: `fixtures/ipc/protocol-v1/partial-analysis-v1/events.jsonl`
- Modify: `fixtures/ipc/protocol-v1/refresh-modified-file-v1/events.jsonl`
- Modify: `fixtures/ipc/protocol-v1/refresh-delete-file-v1/events.jsonl`

**Interfaces:**

- Consumes: buffered parsed events plus exact raw records from Tasks 3-4.
- Produces: only a deeply frozen `ValidatedNativeResult`, or a typed failure containing no buffered events.

- [ ] **Step 1: Add failing analyzer, checksum, immutability, and no-partial-apply tests**

Add:

```js
test('valid analysis resolves only after checksum and returns a deeply frozen result', async () => {
  const result = await runScenario('valid-analyze', {}, analyzeRequest);
  assert.equal(result.terminal.type, 'ANALYSIS_COMPLETED');
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.events));
  assert.ok(result.events.every(Object.isFrozen));
  assert.throws(() => { result.events[0].sequence = 9; }, TypeError);
});

test('analyzer failures retain safe metadata and expose no event buffer', async () => {
  await assert.rejects(
    runScenario('analyzer-failed', {}, analyzeRequest),
    (error) => {
      assert.equal(error.code, 'ANALYZER_FAILED');
      assert.equal(error.analyzerError.code, 'INTERNAL_ANALYZER_FAILURE');
      assert.equal('events' in error, false);
      assert.equal('stderr' in error.toJSON(), false);
      return true;
    },
  );
});

test('every corrupt valid prefix leaves application state unchanged', async () => {
  for (const scenario of ['out-of-order', 'premature-eof', 'post-terminal', 'checksum-mismatch']) {
    const applied = [];
    await assert.rejects(
      runScenario(scenario, {}, analyzeRequest).then((result) => applied.push(result)),
    );
    assert.deepEqual(applied, []);
  }
});
```

Also assert a syntactically invalid checksum and a well-formed mismatched checksum both produce `CHECKSUM_MISMATCH`, while a valid failed terminal does not require a checksum.

- [ ] **Step 2: Run focused complete-result tests to verify failure**

Run:

```powershell
pnpm --filter @codeatlas/providers build
node --test --test-name-pattern="checksum|immutable|analyzer failures|application state" packages/providers/test/native-client.test.mjs
```

Expected: FAIL because checksum and final result isolation are not complete.

- [ ] **Step 3: Implement complete validation and analyzer failure mapping**

After successful close, parse `{ request, events }` with `NativeEventStreamSchema.safeParse`. Map failure to `PROTOCOL_VIOLATION` with a fixed message; do not include Zod input or raw issue values.

If the terminal is `REQUEST_FAILED`, `ANALYSIS_FAILED`, or `REFRESH_FAILED`, create `ANALYZER_FAILED` carrying only the validated terminal `NativeIpcError`; discard raw records and events before throwing.

For successful analysis/refresh, require `/^sha256:[0-9a-f]{64}$/`. Hash `Buffer.concat(rawRecords.slice(0, -1))` with SHA-256, convert the declared hex to a 32-byte buffer, and compare with `timingSafeEqual`. Syntax or content failure maps to `CHECKSUM_MISMATCH`.

For successful DESCRIBE/CANCEL, skip checksum verification.

- [ ] **Step 4: Deep-freeze the success graph and erase internal bytes**

Implement an internal recursive freezer that handles arrays and plain parsed JSON objects, uses a `WeakSet<object>` to avoid repeated traversal, and freezes children before parents. Do not freeze Node streams, errors, buffers, or caller-owned option objects.

Construct a fresh result from the schema-parsed request/events, decoded bounded stderr, and terminal reference. Drop internal raw buffers before returning `deepFreeze(result)`.

- [ ] **Step 5: Implement valid/failure helper scenarios and calculate fixture checksums**

Build `valid-analyze` records from the exact request context, hash all pre-terminal `line(event)` buffers, and insert the result in `ANALYSIS_COMPLETED`. Derive `checksum-mismatch` by changing one lowercase hex nibble after generating a valid stream. Emit `ANALYSIS_FAILED` with the exact request context and safe closed analyzer error for `analyzer-failed`.

Use a short Node command or the helper's checksum function to calculate and replace the four successful analysis/refresh Fixture terminal checksums. Do not alter any other event field or classification. Confirm each checksum is lowercase `sha256:` plus 64 hex digits.

- [ ] **Step 6: Run provider and shared-byte tests**

Run:

```powershell
pnpm --filter @codeatlas/providers build
node --test packages/providers/test/native-client.test.mjs packages/providers/test/native-ipc.test.mjs packages/providers/test/native-ipc-bytes.test.mjs
cargo test -p codeatlas-native-analyzer --test protocol_fixtures
```

Expected: all selected TypeScript tests PASS and all four Rust shared-fixture tests PASS.

- [ ] **Step 7: Commit complete validation**

```powershell
git add packages/providers/src/native-client.ts packages/providers/test/fixtures/native-client-child.mjs packages/providers/test/native-client.test.mjs fixtures/ipc/protocol-v1
git commit -m "feat: validate complete native results"
```

### Task 6: Prove the real Rust binary through the production client

**Files:**

- Create: `packages/providers/test/native-client-binary.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: built `@codeatlas/providers`, built Rust native-analyzer executable, compatible/incompatible DESCRIBE requests.
- Produces: post-Cargo-build acceptance evidence that the production client, not the old test-only spawn helper, negotiates the real binary.

- [ ] **Step 1: Write the failing real-binary test**

Resolve `target/debug/codeatlas-native-analyzer` plus `.exe` on Windows, then add:

```js
test('production client completes a real Rust DESCRIBE handshake', async () => {
  const result = await executeNativeRequest(describeRequest, {
    executablePath: nativeBinary,
    timeoutMs: 5000,
  });
  assert.equal(result.terminal.type, 'DESCRIBE_COMPLETED');
  assert.deepEqual(result.terminal.payload.protocolVersions, [1]);
  assert.deepEqual(result.terminal.payload.irSchemaVersions, [1]);
  assert.equal(result.stderr, '');
});

test('production client maps real Rust negotiation failure', async () => {
  const incompatible = structuredClone(describeRequest);
  incompatible.requestId = 'client-describe-incompatible';
  incompatible.payload.clientProtocolVersions = [2];
  await assert.rejects(
    executeNativeRequest(incompatible, { executablePath: nativeBinary, timeoutMs: 5000 }),
    (error) => error.code === 'ANALYZER_FAILED'
      && error.analyzerError.code === 'INCOMPATIBLE_PROTOCOL_VERSION',
  );
});
```

- [ ] **Step 2: Run before Cargo build to prove the declared dependency**

Allow the test harness to override only its binary path with `CODEATLAS_NATIVE_ANALYZER_TEST_PATH`. Point it at a guaranteed-missing file and run:

```powershell
$env:CODEATLAS_NATIVE_ANALYZER_TEST_PATH = Join-Path $PWD 'target/missing-native-analyzer.exe'
node --test packages/providers/test/native-client-binary.test.mjs
Remove-Item Env:CODEATLAS_NATIVE_ANALYZER_TEST_PATH
```

Expected: FAIL with `PROVIDER_UNAVAILABLE` or missing-binary assertion.

- [ ] **Step 3: Register post-build execution and run it**

Add:

```json
"test:native-client-binary": "node --test packages/providers/test/native-client-binary.test.mjs"
```

to root scripts. In `verify`, place `pnpm test:native-client-binary` immediately after `cargo build --workspace` and before Clippy/tests; retain the existing `test:native-handshake` command.

Run:

```powershell
cargo build --workspace
pnpm --filter @codeatlas/providers build
pnpm test:native-client-binary
```

Expected: PASS 2 tests.

- [ ] **Step 4: Commit real-binary coverage**

```powershell
git add packages/providers/test/native-client-binary.test.mjs package.json
git commit -m "test: exercise production native client binary"
```

### Task 7: Synchronize governing docs and complete repository verification

**Files:**

- Modify: `docs/handoff/specs/NATIVE_IPC.md`
- Modify: `docs/handoff/specs/SECURITY.md`
- Modify: `docs/handoff/DESIGN_TRACEABILITY.md`
- Modify: `docs/handoff/CURRENT_STATUS.md`

**Interfaces:**

- Consumes: final implementation, Fixture/test counts, exact verification output, approved design, and this plan.
- Produces: reproducible P0-W3-004 completion record and synchronized architecture authority.

- [ ] **Step 1: Update Native IPC and Security contracts**

In `NATIVE_IPC.md`, replace P0-W3-004 future-work language with the implemented one-process client contract: strict raw-byte rules, hard ceilings, immutable validated result, failed-terminal mapping, timeout/abort process termination, no stdin `CANCEL`, and SHA-256 over pre-terminal raw JSONL bytes including LF.

In `SECURITY.md`, name the seven allowed environment keys, state that none are inherited automatically, document bounded stderr diagnostic capture, and retain the prohibition on shell execution and sensitive default serialization.

Do not claim Java parsing, SQLite activation, or long-lived cancellation.

- [ ] **Step 2: Make traceability executable**

Replace the P0-W3-004 row in `DESIGN_TRACEABILITY.md` with:

```markdown
| P0-W3-004 | `p0-native-client-v1`: `fixtures/ipc/client-v1/cases.json`; `packages/providers/test/native-client.test.mjs`; `packages/providers/test/native-client-binary.test.mjs` | Malformed/out-of-order/oversize/timeout/cancel and checksum corruption never expose partially applicable state | Native IPC; Security; ADR-010; ADR-012 |
```

Keep the task ID, fixture ID, test files, acceptance, and authority on the same row.

- [ ] **Step 3: Run formatting and focused verification**

Run:

```powershell
pnpm format
cargo fmt --all
pnpm --filter @codeatlas/providers build
node --test packages/providers/test/native-client.test.mjs packages/providers/test/native-ipc.test.mjs packages/providers/test/native-ipc-bytes.test.mjs
cargo build --workspace
pnpm test:native-client-binary
cargo test -p codeatlas-native-analyzer --test protocol_fixtures
```

Expected: every command exits 0. Record exact test counts and durations for the status entry.

- [ ] **Step 4: Run architecture and full quality gates**

Run:

```powershell
pnpm architecture:check
pnpm verify
```

Expected: both commands exit 0; formatting, TypeScript build/tests, dependency rules, Rust formatting/build/handshake/client-binary/Clippy/tests all pass.

- [ ] **Step 5: Audit scope and Deferred guardrails**

Run:

```powershell
rg -n "sqlite|tree-sitter|LanguageAnalyzer|FactMerger|Knowledge|embedding|zvec|daemon|watcher" packages/providers/src packages/providers/test/fixtures/native-client-child.mjs
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Expected: keyword hits, if any, occur only in comments/tests explaining forbidden scope; production client has no storage, parser, knowledge, network, daemon, or watcher dependency. Diff check exits 0 and changed files match this plan.

- [ ] **Step 6: Write the fresh completion record**

Append a P0-W3-004 section to `CURRENT_STATUS.md` containing:

- branch/head and task ID;
- governing design/spec/ADR paths;
- `p0-native-client-v1` and mandatory tests;
- exact focused and full command outputs/counts from Steps 3-4;
- checksum, timeout, cancellation, cleanup, environment, stderr, and zero-partial-apply evidence;
- architecture/Deferred audit stating Java parsing, SQLite staging/activation, protocol `CANCEL` dispatch, persistent processes, and Phase 0.5 analysis remain unimplemented by design.

- [ ] **Step 7: Re-run final evidence after the status edit**

Run:

```powershell
pnpm format:check
git diff --check origin/main...HEAD
pnpm verify
```

Expected: all exit 0 with the same or greater passing test counts recorded in `CURRENT_STATUS.md`.

- [ ] **Step 8: Commit documentation and evidence**

```powershell
git add docs/handoff/specs/NATIVE_IPC.md docs/handoff/specs/SECURITY.md docs/handoff/DESIGN_TRACEABILITY.md docs/handoff/CURRENT_STATUS.md
git commit -m "docs: record native client evidence"
```

## Final self-review checklist

- [ ] Every requirement in the approved design maps to Tasks 1-7; no parser, storage apply, daemon, or long-lived protocol work entered scope.
- [ ] Search this plan for prohibited placeholder markers and vague implementation instructions; none remains.
- [ ] Public names are consistent across tasks: `executeNativeRequest`, `NativeClientOptions`, `NativeClientLimits`, `ValidatedNativeResult`, `NativeClientError`, and `NativeClientErrorCode`.
- [ ] All five Review Focus items have an owning test step.
- [ ] Each task has a focused red command, minimal green implementation, verification command, and commit.
