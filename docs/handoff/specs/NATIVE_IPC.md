# Native IPC Wire Specification

## Transport

One JSON object per UTF-8 line. TypeScript writes requests to stdin; Rust writes protocol events only to stdout and logs only to stderr. No shell. The client enforces maximum line/event/count/total-byte limits, backpressure, timeout, cancellation, and process termination.

## Envelope

```ts
interface NativeRequestEnvelope<T> {
  protocolVersion: 1; requestId: string;
  type: "DESCRIBE" | "ANALYZE" | "REFRESH" | "CANCEL";
  payload: T;
}
interface NativeEventEnvelope<T> {
  protocolVersion: 1; requestId: string;
  sequence: number; type: string; payload: T;
}
```

Sequence starts at zero and strictly increases per request. Exactly one terminal event is required. Unknown required versions, duplicate/out-of-order sequence, malformed JSON, oversize payload, post-terminal data, or premature EOF are protocol errors.

## DESCRIBE

Returns analyzer version, supported protocol and IR schema versions, languages, capabilities, limits, and build/platform metadata. The runtime selects a mutually supported protocol/IR pair before analysis and rejects incompatibility explicitly.

## ANALYZE events

`ANALYSIS_STARTED`, `SOURCE_FILE`, `NODE`, `EDGE`, `COVERAGE`, `DIAGNOSTIC`, `ANALYSIS_COMPLETED`, and `ANALYSIS_FAILED`. A completed payload includes counts, coverage summary, content fingerprint, and integrity checksum. Failed streams are never applied.

## REFRESH events

Refresh input contains base revision/fingerprint and normalized added/modified/deleted files. Patch events are `UPSERT_NODE`, `REMOVE_NODE`, `UPSERT_EDGE`, and `REMOVE_EDGE`, plus source/coverage/diagnostic and terminal events. The base must match the active graph; otherwise return `BASE_REVISION_MISMATCH` and request full analysis.

## Error model

Errors include incompatible protocol/IR, invalid request, unsupported language/capability, source changed during analysis, resource/budget exceeded, cancelled, internal analyzer failure, protocol corruption, and base mismatch. Diagnostics may be non-fatal; only the terminal event determines stream success.

## Shared fixtures

Both implementations consume byte-identical describe, analyze, refresh modify/delete, partial coverage, invalid event, malformed JSON, out-of-order, oversize, cancellation, incompatible version, and premature EOF fixtures.

