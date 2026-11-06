# V2 event-loop and operation-order Implementation Plan

**Goal:** Join approved pure V2 policy to the existing event/queue/loop model with substitutes, while reporting final Source verification phase conflict.
**Spec:** docs/superpowers/specs/2026-11-05-v2-event-loop-offline-contract.md
**Constraints:** no old source/phase change, actual OS/Native/Git, rights/number/dependency/CI/Git writes. Root sole integrator.

- [ ] Worker (new session, inherited model, medium): only scripts/mixed-native-dynamic-debug-event-bridge.cs, mixed-native-dynamic-observer-loop.cs, test-mixed-native-dynamic-observer-loop.ps1/.mjs and optional test-mixed-native-dynamic-observer-loop-double.cs. RED/GREEN pure loop proof and error controls; no root docs/package or product builds.
- [ ] Root: source-call-path and exact rejected ordering tests in new scripts/test-mixed-native-operation-order.mjs; decision memo/evidence for final GIT verification after ANALYSIS. Do not implement this pending phase contract change.
- [ ] Root integrate ordinary test registration; targeted new/old control/loop/probe regression, architecture/format, concentrated review. Source/typed package build inputs unchanged so reuse prior build pins.

Review focus: one Continue per consumed event even clock failure; no READY without register/root; no SOURCE reentry or unauthorized phase extension; no cleanup success with unknown instance/worker; no actual authentication claim from synthetic evidence. Do not repeat old239 wholesale.
