# Dynamic binding offline Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or subagent-driven-development. Root is the sole integrator; per-file ownership below.

**Goal:** Implement approved independent-coordinator/fixed-HOST dynamic binding in a private V2 offline lane without enabling real execution.
**Architecture:** Preserve old V1. Independent fixed artifact/slot checks and genuine original issuer claims produce a bounded V2 exchange; separate pure C# policy independently validates command hashes and lifecycle. All live authority remains false.
**Tech Stack:** Existing Node24/TypeScript7, standard crypto/streams, pure C#/PowerShell test compilation; no dependency additions.
**Spec:** docs/superpowers/specs/2026-11-05-dynamic-binding-offline-contract.md

## Global Constraints
No actual HOST/Native/Git/observer/collector, new rights/formula/numeric default, public route or V5 reinterpretation. Tests only memory streams/pure metadata/owned temporary SQLite. Never accept HOST supplied expected manifest or raw JSON as authority.

## Review Focus
- Caller forgery/clone/stale/cross-registry claim must not register.
- Analysis context cannot precede unfinished SOURCE or revert phase.
- Full hash includes exact Unicode/escaped static fields and real stdin hash.
- Cancel/deadline/late BOUND/READY/input/exit races poison without retry.
- Partial cleanup/unknown child and artifact drift never become successful authority.

## Task 1: Protocol and observer (isolated parallel files)
- [x] Codec worker: new scripts/mixed-native-dynamic-control-codec.mjs and test counterpart. Reuse existing strict codec implementation with exact V2 schema/prefix, no mode argument in V1.
- [x] Observer worker: new scripts/mixed-native-dynamic-observer-policy.cs, test PS1/Node wrappers. Consume exact Slot/policy API above; pure metadata only; cross-language vectors. No old C# source edits or Windows APIs.
- [x] RED/GREEN each scoped test; record logs under .superpowers/sdd/2026-11-05-dynamic-binding-offline; workers do not build product packages or alter root registration/docs.

## Task 2: Owned coordinator and end-to-end join (root)
- [x] Fixed independent manifest/entry/module/slot checks via existing owned loader; genuine Native/Git active origin and one-shot claim; distinct private SURFACE_V8 mapping for wire8 only.
- [x] Reuse exchange through internal codec-selected core and separate V2 wrapper; preserve V1 signature/behavior.
- [x] Connect actual owned callback through REGISTER/BOUND/INTENT/READY and acquire/release using memory peer, no configurable verifier callback or JSON authority flag. Application authorization remains outside coordinator in existing fixed workflows.
- [x] Validate minimum complete offline lane and wrong identity/hash/order/context/deadline/cleanup refusals; build affected packages once final files ready.

## Task 3: Integrate and record
- [x] Register ordinary tests; run only affected final cohort, architecture/format and one concentrated independent review. Preserve initial failures.
- [x] Update status/trace and exact authority pointers. Original admission/qualification/Phase1 acceptance unchanged. No Git write/CI.
