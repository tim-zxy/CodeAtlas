# P1-19 readonly CLI diagnostics

Authorized continuation: wire existing readonly inspector and persisted status;
no new budget default, Native probe, config/DB initialization or modification.

- doctor --memory-budget-bytes <positive-safe-decimal>: stdout is the existing
  immutable inspector JSON report (no added readiness/protocol claim); exit0 means
  report written, not execution/installation qualified. Explicit --help only is0.
  Invalid options/budgets: safe JSON error on stderr, exit2, no report/inspection.
  Inspection/output failure: safe stderr JSON, exit1. No raw error message/stack.
- status <existing index status flags>: direct alias to index status, preserving
  request validation, JSON result/errors, budgets, read-only opening and exits.
- Existing index/understand/trace/smoke behavior and data contracts remain.
- Runtime exposes the existing observer through its normal package export for CLI;
  no app bypass into providers/Storage and no additional dependencies.

Success: actual child CLI from owned empty cwd (PATH without tools) reports without
writing or Native; actual owned SQLite status alias matches index status byte-for-
byte and does not change DB bytes; bad flags refuse before IO; closed pipe gives
safe nonzero exit. No full install/platform/protocol or Phase1 acceptance claim.

- [x] Actual child doctor/status tests RED before routing/implementation.
- [x] Minimal doctor writer/parser and routing/Runtime export; register tests.
- [x] Affected CLI/runtime tests, builds, architecture and concentrated review;
  evidence and one batched sync. No R9/capture/parser action.
