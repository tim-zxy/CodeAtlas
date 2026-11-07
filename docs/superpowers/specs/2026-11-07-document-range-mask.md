# Private offline document range masking

Scope: parent-authorized offline P1-12 preparation only. Existing SECURITY source
controls and Knowledge Workflow redaction remain authoritative. No clearance,
permission, public schema, detector rule, persistence or installed package changes.

Implement `maskDocumentRanges(source, ranges, account)` privately in Documents.
`ranges` contains ordered nonoverlapping `{startByte,endByte}` half-open ranges
in exact original UTF-8 bytes, supplied by an owner; these ranges are NOT evidence
of complete detection. Validate own data, UTF-8 scalar boundaries and bounds.
Reject empty, overlapping, unsorted, fractional or out-of-bounds ranges. Snapshot
inputs, reserve the byte copy before allocation and checkpoint/account each byte.
Replace bytes inside ranges with ASCII `*`, retaining CR and LF. Outside ranges
and original input stay unchanged. Output byte offsets and line endings remain
stable; Unicode character/UTF-16 columns need reparsing. No original snippets,
match diagnostics, digest or authority receipt is returned. The return is only
an independent Buffer, which the caller must treat as protected data.

Choice: byte masking uses the platform Buffer and existing DocumentAccount.
Variable-length replacement requires a new offset translation; automatic range
detection requires an approved coverage policy. Neither is necessary for this
bounded component. Empty ranges yield a copy and never imply secret-free input.
Exceptions invalidate the shared account; no partial result escapes. No automatic
production caller is added. Disable the private call to roll back adoption.

Production remains blocked until a concrete versioned detection policy and
independent positive/negative/missed-form corpus are approved, complete authorized
inventory/support closure is enumerated, original and final payloads are checked,
and an owned scope/revision/policy/control lifetime binds the exact consumed
content. Denied paths/classes stay denied; local/remote/model permissions remain
separate. Recheck Source after mapping and policy before consumption; unknown
cleanup, cancellation, incomplete scan and stale basis refuse. A no-hit result,
masked Buffer, range list or current-account Principal grants none of this.

Tests: literal synthetic Unicode/CRLF bytes with exact independent output;
out-of-bound/mid-scalar/overlap/unsorted/getter/proxy/shared input rejection;
input immutability, no-result cancellation and budget failure. Existing deny-only
detector/preflight suites remain required. P1-12/Phase1 acceptance stays open.
