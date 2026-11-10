# Codex Setup Dry-run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Implement inline with a single integrator.

**Goal:** useful Codex configuration preview from self-owned bytes, with no configuration writes or production enablement.
**Architecture:** private Runtime planner with trusted TOML parser port; no public exports, routes or dependencies.
**Tech Stack:** TypeScript/Node; existing smol-toml test oracle.
**Spec:** docs/superpowers/specs/2026-11-10-codex-setup-dry-run.md

## Global Constraints
No real config discovery/read/write, install, model/server call, Native or production access. Disabled preview only; exact conflict and preservation rules. Explicit byte limits, no secret echo, no public contract/lock/dependency change.

## Review Focus
TOML scope after append, collision preservation, malformed/secret input, input snapshot mutation and claiming launch readiness.

### Task 1: Private dry-run planner
Files: packages/runtime/src/agent-setup-plan.ts; packages/runtime/test/agent-setup-plan.test.mjs; root test registration and factual handoff records.
- [x] Observe missing planner RED for owned empty/existing/conflicting input.
- [x] Implement planAgentSetup(request,ports), preserving original bytes and returning disabled preview only.
- [x] Runtime build, focused tests, architecture and relevant workspace checks.
- [x] Independent review, associated fixes, fresh status/trace record; authorized source-only sync.