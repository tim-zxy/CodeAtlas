# R11 Actual22 Coordinator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, then one independent final review.

**Goal:** Implement the approved independent deny-only coordinator without executing actual22.
**Architecture:** Reuse frozen stop, download, pack, installer, replay and validation APIs from one sealed reader graph; only new .github/qualification files.
**Tech Stack:** Existing Node stdlib/ESM and approved PACK inventory helpers, no dependencies.
**Spec:** docs/superpowers/specs/2026-11-10-r11-actual-coordinator.md

## Global Constraints
- Preserve all frozen hashes, R11 evidence, exact values, successful requests and22-case validation.
- Only self-owned substitutes/tests; real actual22, upload, release and CI switch stay closed.
- No caller callback accepted by operational CLI; the internal seam issues no admission evidence.

## Review Focus
- Nested worker concurrency, ignored failure reports and cleanup UNKNOWN must block later launches.
- Identity changes or stop requests before/after an operation must refuse further stages.
- Wrong reader/link, request/approval/version/hash or existing output/layout refuses before execution.
- No fake release IDs, local ZIP shortcut, unsealed dynamic import or profile exclusion in bootstrap.
- Preserve real report validator, opaque context, source restoration and evidence on every error.

### Task1: test-first internal sequence and pure input bindings
Files .github/qualification/r11-actual-coordinator.mjs and r11-actual-coordinator.test.mjs.
- [x] Write success-order, all-stage failure, failed-report, UNKNOWN, drift, stop and bad-binding tests; observe RED.
- [x] Implement runActual22Sequence(ports,control), validateActualRequest(value), assertR11Bindings(approval), readerContentDigest(inventory).
- [x] GREEN with original stop helper and own directories; no qualified receipt from the internal seam.

### Task2: sealed operational bridge and adversarial preflight
- [x] Validate exact request/tool/Node/reader before dynamic import, use original strict approval schema and independent real asset download.
- [x] Connect original owned installer/context/collector/validator; preserve once-only output and error receipts.
- [x] Test source/link drift, exclusive output and non-dispatch/import safety without executing the real bridge.

### Task3: integrated review and source synchronization
- [x] Run targeted new and original stop tests, workspace/architecture and scoped format/diff checks; preserve frozen hashes.
- [x] Independent final review, fix only related defects, update controlling authorities/traceability with reproducible results.
- [ ] Commit/push exact task files under existing authorization; monitor the same automatic CI without re-triggering.

No extra design reconfirmation: user explicitly approved this independent entry and delegated routine implementation choices. User's minimal risk-driven checks and evidence preservation override redundant whole-suite runs or skill cleanup.

ZIP verification uses the existing approved executable bodies: PowerShell SHA362a356ce7f0940ec74f73a8fc2c990a2cc24a38a11c90bbd8eca947110ad139 and C:/Windows/System32/tar.exe SHAa3ac62fd4cdf619a7c53f71ca3fe5fb42f72020975670ff29afe3603f6416a8e. powershellPath is a locator only, must name pwsh.exe and cannot choose a new identity. ZIP stages use controlled process PATH/PATHEXT/cwd, reject shadow commands and restore all settings in finally. No system settings or ACL change. Full external tool/runtime distribution provenance remains a clean-runner prerequisite; these seals do not claim OS/DLL isolation. Request and approval are parsed from the exact checked Buffer, and receipts use exclusive valid JSON writes.
