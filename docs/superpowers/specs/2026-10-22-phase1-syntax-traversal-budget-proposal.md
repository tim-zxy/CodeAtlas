# Syntax traversal budget and Native dispatch proposal

Status: ACCEPTED 2026-10-22 by explicit user reply approving the recommended field/accounting/dispatch direction and continued implementation. No numeric values, calibration, actual Native run, new dependency or cloud CI is authorized.

## Evidence and problem

EffectiveConfig.resourceBudget already has maxItems. The current strict v4 resourceBudget contains maxEvents/maxDepth/input/output/duration/memory, while Rust SyntaxWalkControl independently requires max_items for AST visits/value conversion as well as result-item safety. Neither Source byte count nor emitted event count is its defined unit. There is currently no faithful wire-to-control mapping for an actual standalone Native v4 process.

A fresh owned-Source/in-memory library characterization proves the distinction: the existing Python unit source completes with exactly20 events under maxEvents20 and its separately declared test traversal allowance. Reusing20 as traversal cap refuses the same source with RESOURCE_LIMIT_EXCEEDED. These are pre-existing test values, not a new production threshold, actual observer failure or profile measurement. Evidence: task-04-traversal-budget-characterization.log. Do not interpret this as a flaky parser or silently remove its visit guard.

## Recommended minimum amendment

1. Add a required positive safe integer resourceBudget.maxItems to the unpublished v4 request only, reusing the existing EffectiveConfig field and operation budget. No default, multiplier, guessed byte-to-node estimate or numeric profile entry. maxEvents remains an independent raw-stream event cap.
2. Define maxItems as the aggregate number of Syntax visitor work ticks across requested files (including declaration discovery and literal/value traversal). A bounded file collector reports consumed ticks internally; the producer charges the remaining request allowance before the next file. Do not publish this accounting as Canonical/provider facts. Java's reused Code-analysis pass retains its own existing deadline/result limits; do not pretend its internals are charged by the new Syntax counter.
3. Runtime/request preparation obtains the explicit allowance from approved EffectiveConfig/caller operation budget; it cannot increase an upstream allowance. Native uses the request's declared maxItems, maxDepth, aggregate maxInputBytes and maxOutputBytes. No old Java worker reservation is inferred. Syntax profile corpus/resource shape must bind these exact controls before any later run request.
4. Keep all old strict IPC1..3, Code/Provider IR, SQLite/R010 and publication boundaries unchanged. This alters the not-yet-advertised v4 request; original syntax-contract and syntax-owner-binding roots stay byte-identical historical evidence. Add an independently pinned syntax-budget contract root and migrate current candidate consumers explicitly. Missing maxItems in the current request refuses; no silent fallback/adapter.
5. After approval and contract synchronization, add explicit Native4 dispatch using existing single-request framing/strict decoder/producer. Invalid version4 requests never fall through to old ANALYZE/DESCRIBE; errors use v4's direct error payload. Keep DESCRIBE capability/maturity unchanged until actual evaluated evidence. No actual executable is run in this implementation batch.

## Alternatives

- Reuse maxEvents for visits: rejected by the independent20-event characterization; it conflates output with traversal and can refuse valid bounded output.
- Remove visit bound or choose unlimited/guessed defaults: violates explicit item controls and resource safety.
- Pass a hidden test/admission-bypass flag or a second unbound scalar budget: creates a split source of authority and cannot qualify the shipped workflow.

## Verification and review impact

Before implementation, the only new behavior is a controlled library characterization; no v4 field or Native production route has changed. After approval: genuine RED for missing required field, invalid/unsafe/zero values, independent event/work budgets, aggregate multi-file exhaustion, no partial applicable batch, unchanged old strict protocol behavior and shared Rust/TS bytes. Legacy roots remain history, not current positive request compatibility. Use literal fixtures and library/stream/fake-child tests only; actual Native measurement/qualification remains separately approved.

This is a material request/control refinement under AGENTS design governance. Approval is requested for the field/unit/aggregate accounting and related contract/dispatch implementation direction only. It does not approve any maxItems value, calibration/profile number, actual Native run, new dependency or cloud CI. P1-04/05 and phase exits remain open.


## Accepted implementation checkpoint

The proposed field/accounting/dispatch direction is accepted and implemented as a bounded candidate. Earlier before-implementation/request-for-approval paragraphs describe the original proposal. [Fresh review](../reviews/2026-10-22-phase1-syntax-dispatch-budget-review.md) records current tests, no actual run/profile authority and remaining gates.
