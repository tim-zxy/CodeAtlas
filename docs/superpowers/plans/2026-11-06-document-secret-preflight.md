# Document secret preflight implementation plan

> **For agentic workers:** Use superpowers:executing-plans for this existing authorized private slice.

**Goal:** Detect explicit secret-bearing material on actual original input and all candidate string fields, without inventing scan clearance or a publication capability.
**Architecture:** Node stdlib only. Documents emits redacted rule IDs with LIMITED coverage; Application reuses prepared Source, strict Draft and final selection recheck. Both detected and no-known-pattern outcomes remain NOT_COMMITTED. No Store argument or remote path exists.
**Spec:** SECURITY source/secret controls; KNOWLEDGE_WORKFLOW AUTO structure/MANUAL semantics; existing document-draft-storage spec.

## Assumptions and success criteria
The design specifies candidate scanning but has no approved exhaustive detector rules. This initial detector conservatively recognizes private-key markers and explicit nonempty credential assignments/properties. Absence is never safe/authorized. Arbitrary opaque/encoded secrets are not covered. These rules can only deny, never expand permission. Original bytes and candidate payload both examined; diagnostics contain no match, path or fingerprint. Caller shared account prepays copies and checks cancellation. Raw matches are never written. No parser dependency, schema, permission, numeric qualification or external service is changed.

## Steps
- [x] Add literal positive/negative, nested payload, hostile input, cancellation/budget and diagnostic non-disclosure tests; observe missing API RED.
- [x] Implement private Documents detector and Application preflight; no raw/draft in blocked result, no write callback. Validate raw SHA/ranges and same repository/path; recheck actual Source after inspection. Preserve prior Source effects separately from document NOT_COMMITTED.
- [x] Exercise real controlled Source+SQLite component path, invalid source/candidate and known secret/no-known-pattern outcomes. No canonical document rows written.
- [x] Run affected tests/builds/architecture/format; update current status and trace, inspect exact owned diff and batch commit/push once if safe (verification complete; synchronization tracked separately in final handoff).

## Review focus / limitations
Invalid UTF8/shared/proxy backing refuses; property accessors refuse before invocation; no string/key is omitted from candidate traversal. Source changes/cancellation/failures do not return scan success. Example credentials may overblock. Complete detection/redaction coverage and actual parser adoption remain explicit decisions; no original acceptance item closes.
