# R11 Reader Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans; implement inline with one integrator.

**Goal:** construct an inert closed reader from a verified object directory without altering frozen measurement semantics.
**Architecture:** independent .github/qualification adapter reuses existing inventory/digest primitives. No source module execution or package installation.
**Tech Stack:** Node standard library.
**Spec:** docs/superpowers/specs/2026-11-10-r11-reader-layout.md

## Global Constraints
Keep R11 reader/content/helper/coordinator identities and all acceptance gates. No actual ZIP upload, release, CI switch, real actual22 or token change. Only self-owned small fixtures execute.

## Review Focus
Refuse escaped/aliased paths, source mutation, untrusted object replacement, existing target adoption and accidental module execution; retain failure evidence.

### Task 1: Inert reader transport and construction
Files: .github/qualification/r11-reader-layout.mjs and .test.mjs.
- [x] Write roundtrip and refusal tests; observe missing-constructor RED.
- [x] Implement exportReader(source,bundle,digest) and materializeReader(bundle,output,digest); CLI fixes production digest and seals.
- [x] Run affected reader/PACK/coordinator/workspace tests and architecture checks; inspect frozen file hashes.
- [x] Independent review of final diff; correct associated findings.
- [x] Record fresh evidence in CURRENT_STATUS and DESIGN_TRACEABILITY; report runner/tool/asset prerequisites separately.