# P0-W3-004 TypeScript Native Client Design

Date: 2026-09-22

Status: approved for implementation planning

Task: P0-W3-004

Authority: ADR-001, ADR-002, ADR-003, ADR-010, ADR-012, ADR-014; `NATIVE_IPC.md`, `PROVIDER_SPI.md`, `SECURITY.md`, `MODULE_BOUNDARIES.md`, and `native-analyzer-scalability.md`

## Objective

Add the production TypeScript process boundary for the native analyzer. The client must spawn an explicit executable without a shell, write one validated JSONL request, decode bounded stdout incrementally, capture bounded stderr, enforce timeout and cancellation, validate the complete event stream and integrity checksum, and expose no partially validated provider facts.

The task succeeds when the declared Fixture proves malformed, out-of-order, oversized, timed-out, cancelled, failed, and checksum-corrupt executions cannot produce an applicable partial result.

## Material assumptions

- Native IPC v1 remains one request per process. Each client invocation owns one child process.
- Timeout or an external `AbortSignal` terminates that process. The client does not append a protocol `CANCEL` record to the single-request stdin stream.
- Protocol-level `CANCEL` remains a valid schema/Fixture concept for a future long-lived or multiplexed runtime.
- The current Rust binary implements only `DESCRIBE`. Deterministic test helpers exercise production-client behavior for `ANALYZE`, `REFRESH`, corruption, timeout, and cancellation without adding a parser or analyzer capability.
- The existing 1 MB line/request, 10,000 event, and 10 MB stdout limits are client hard ceilings. Callers may tighten but not silently increase them.
- The client owns no SQLite connection and accepts no state-application callback.

## Non-goals

- Java parsing, Tree-sitter, source scanning, refresh analysis, or provider normalization.
- SQLite staging, graph activation, canonical Fact merging, or Knowledge publication.
- A daemon, process pool, persistent analyzer session, watcher, or process-tree manager.
- Persisted provider descriptor extensions or Canonical IR changes.
- Authentication or tamper resistance. The integrity checksum detects stream disagreement; it is not a trust signature.

## Chosen approach

The client incrementally decodes and validates stdout but quarantines all events in a private bounded buffer. It returns one immutable result only after the process has closed and the exit state, terminal event, complete stream, and checksum have all passed validation.

This is preferred to exposing an `AsyncIterable`, which would require a premature staging/commit contract, and to temporary-file spooling, which would add filesystem lifecycle and cleanup work for a protocol already capped at 10 MB.

## Public boundary

`@codeatlas/providers` adds `native-client.ts` and exports its public types and functions from `index.ts`.

The primary boundary is conceptually:

```ts
executeNativeRequest(
  request: NativeRequestEnvelope,
  options: NativeClientOptions,
): Promise<ValidatedNativeResult>
```

`NativeClientOptions` contains:

- an explicit absolute `executablePath`;
- an optional readonly argument array, empty by default and passed directly to `spawn`;
- an explicit `timeoutMs`;
- an optional `AbortSignal`;
- an optional `allowedEnvironment` containing only closed allowlisted keys;
- optional limits that may only tighten the hard ceilings.

It does not accept a command string, shell option, apply callback, storage port, or inherited environment switch.

The success result is conceptually:

```ts
interface ValidatedNativeResult {
  readonly request: NativeRequestEnvelope;
  readonly events: readonly NativeEventEnvelope[];
  readonly terminal: NativeEventEnvelope;
  readonly stderr: string;
}
```

The returned object, event array, and parsed events are frozen before exposure. Only `DESCRIBE_COMPLETED`, `ANALYSIS_COMPLETED`, `REFRESH_COMPLETED`, and `CANCEL_ACCEPTED` produce a result. `REQUEST_FAILED`, `ANALYSIS_FAILED`, and `REFRESH_FAILED` become a typed analyzer error and discard preceding events.

## Process and environment boundary

The client validates configuration and request before spawning. `executablePath` must be absolute. Arguments are an exact string array and are never joined or interpreted by a shell. The process is created with `shell: false`, piped stdin/stdout/stderr, and no inherited environment.

The closed environment-key allowlist is:

- `LANG`
- `LC_ALL`
- `NO_COLOR`
- `SYSTEMROOT`
- `WINDIR`
- `TEMP`
- `TMP`

Names are canonicalized case-insensitively on Windows. Unknown names, duplicates after canonicalization, NUL characters, and unreasonable value sizes are configuration errors. The client copies no value from `process.env` by itself; the caller must explicitly provide each permitted value. `PATH`, credentials, tokens, proxy settings, and arbitrary provider variables are rejected.

The request is parsed by `NativeRequestEnvelopeSchema`, serialized with `JSON.stringify`, followed by exactly one LF, and checked against the stdin ceiling before spawn. A false return from `stdin.write` waits for `drain`; stdin is then ended. stdin failure rejects the invocation and terminates the child.

stdout and stderr are consumed concurrently so neither pipe can block the process. stdout uses async iteration, retaining stream backpressure rather than switching to an unbounded flowing listener. stderr is accumulated only to its byte ceiling and decoded for diagnostics after capture.

Cancellation, timeout, protocol failure, limit failure, or I/O failure requests process termination. The client waits a short grace period, attempts forced termination if the child remains open, and always waits for `close` before settling. Because `shell` is false and the supported native analyzer is one process, this task does not add platform-specific process-tree traversal.

## Time and resource limits

Hard client ceilings are:

| Resource | Ceiling |
| --- | ---: |
| stdin bytes | 1,000,000 |
| stdout line bytes | 1,000,000 |
| stdout total bytes | 10,000,000 |
| event count | 10,000 |
| stderr bytes | 1,000,000 |

All sizes are measured on raw bytes, not JavaScript string length. Limits are positive safe integers. A caller-provided limit must be less than or equal to its hard ceiling.

Every invocation supplies `timeoutMs`. For `ANALYZE` and `REFRESH`, the effective deadline is the earliest of the invocation timeout, `resourceBudget.maxDurationMs`, and a non-null `deadlineEpochMs`. An already expired request returns `TIMEOUT` before spawning.

An already-aborted signal returns `CANCELLED` before spawning. Once running, abort and timeout use the same cleanup path but retain distinct error codes.

## JSONL decoder and complete validation

stdout must be strict UTF-8 JSONL:

- no BOM;
- no CR;
- no blank records;
- one JSON object per LF-terminated line;
- no incomplete final record at EOF;
- no bytes after a terminal event.

Raw line and total-byte limits are checked before UTF-8 decoding and JSON parsing. UTF-8 uses fatal decoding. Each parsed value immediately passes `NativeEventEnvelopeSchema`, followed by request ID, zero-based contiguous sequence, request-legal event type, terminal placement, and event-count checks.

Passing incremental checks does not publish or return an event. After process close, `NativeEventStreamSchema` validates the buffered stream again for start/terminal rules, context agreement, emitted counts, cancellation target, and request budgets.

A non-zero exit or signal is `PROCESS_FAILED`, even if stdout contains a superficially valid success event. A successful exit without a complete valid terminal is `PROTOCOL_VIOLATION`.

## Integrity checksum

Successful `ANALYZE` and `REFRESH` streams must declare:

```text
sha256:<64 lowercase hexadecimal characters>
```

The SHA-256 input is the exact raw JSONL bytes of every event before the terminal event, including each final LF. The terminal event is excluded to avoid a circular checksum. The client hashes while decoding, but commits the hash comparison only after identifying and validating the terminal. Comparison uses fixed-length byte buffers and constant-time equality.

`DESCRIBE`, failure terminals, and `CANCEL_ACCEPTED` do not require this checksum. The general `ContentFingerprint` brand remains unchanged; the production client adds the stricter successful-stream rule. Existing successful analysis and refresh raw fixtures will receive real checksums, and `NATIVE_IPC.md` will become the controlling description of the algorithm.

## Result isolation and no partial apply

The client has no event callback, async iterator, storage reference, or apply hook. Buffered events are local variables that are discarded on every rejected path. Failure errors do not expose the event buffer.

The acceptance test models application as an action performed only after awaiting `executeNativeRequest`. A helper emits a valid prefix and then each declared corruption. Every promise rejects and the sentinel application state remains unchanged. A fully valid stream resolves exactly once and allows the caller to apply the frozen result.

This proves the P0-W3-004 boundary without pretending to implement the Phase 0.5 SQLite staging and activation transaction.

## Typed error model

The client exposes one `NativeClientError` class with a closed code union:

```ts
type NativeClientErrorCode =
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
```

The error exposes the code, request ID when trustworthy, a bounded safe message, and relevant exit code/signal or analyzer error metadata. Captured stderr is bounded and available only as explicit diagnostic data; it is omitted from the default message and serialized form. Commands, arguments, environment values, stdin, raw stdout, source text, and partial events are not exposed.

When failures race, the deterministic reporting precedence is:

1. external cancellation;
2. timeout;
3. protocol, checksum, or output-limit failure;
4. process/I/O failure;
5. analyzer-declared terminal failure.

This precedence does not change cleanup: all paths wait for process closure.

## Fixture and tests

Add `p0-native-client-v1` at `fixtures/ipc/client-v1/cases.json`, mandatory test `packages/providers/test/native-client.test.mjs`, and a test-only child at `packages/providers/test/fixtures/native-client-child.mjs`. The helper is launched as the absolute Node executable plus an explicit script/scenario argument array, still through the production client and with `shell: false`.

The Fixture and tests cover:

- production client against the real Rust `DESCRIBE` executable;
- allowed environment propagation and rejection/isolation of unallowed variables;
- stdin and stdout backpressure without deadlock;
- bounded stderr capture and overflow;
- malformed JSON, invalid UTF-8, BOM, CRLF, and blank records;
- line, total-byte, and event-count ceilings;
- wrong request ID, out-of-order sequence, premature EOF, and post-terminal bytes;
- spawn failure, stdin failure, non-zero exit, and analyzer-declared failures;
- valid and mismatched SHA-256 integrity checksums;
- timeout, external cancellation, and observed child closure;
- unchanged sentinel application state for every corrupt-prefix case;
- immutable, once-only visibility for a fully valid result.

The existing protocol-byte fixtures remain shared between TypeScript and Rust. Their successful analysis/refresh terminal checksums are updated mechanically to the newly specified values without changing event meaning or classification.

## Documentation and traceability

Implementation updates:

- `docs/handoff/specs/NATIVE_IPC.md` with the production client, checksum, cancellation, and lifecycle rules;
- `docs/handoff/specs/SECURITY.md` with the closed environment allowlist and bounded stderr behavior;
- `docs/handoff/DESIGN_TRACEABILITY.md` with the `p0-native-client-v1` Fixture and mandatory test;
- `docs/handoff/CURRENT_STATUS.md` with fresh commands, counts, and Deferred/guardrail audit;
- the root test/verify scripts so the production-client real-binary test runs after `cargo build --workspace`.

No ADR is required unless implementation evidence forces a change to an accepted decision. Any such conflict stops implementation and follows the governed design-change process.

## Verification

Required focused and repository-wide evidence:

```text
pnpm build
node --test packages/providers/test/native-client.test.mjs
pnpm test
pnpm architecture:check
pnpm verify
```

Completion requires the fixture mapping, governing specs, acceptance statement, fresh command results, architecture guardrail audit, and remaining Deferred capabilities to agree in `CURRENT_STATUS.md` and `DESIGN_TRACEABILITY.md`.
