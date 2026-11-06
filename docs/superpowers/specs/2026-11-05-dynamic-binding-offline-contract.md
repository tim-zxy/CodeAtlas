# Dynamic observer binding V2 — approved offline contract

User approved the previously proposed independent-coordinator/fixed-HOST-attester design for offline implementation and substitute verification. Real Native/HOST/debugger/collector execution, new OS rights, physical formulas/numbers, installed baselines and public/production admission remain separately reserved. Old V1/GIT/V2/V5 paths remain strict and unchanged. This is an additional private V2 family, not reinterpretation of V5.

## Trust and implementation scope

The independent coordinator freezes expected artifact manifest SHA, slots/static commands, source context, run context and deadline BEFORE any HOST-declared dynamic digest. Existing owned artifact loader independently checks bytes/path/file identity against that expected manifest; actual stable live module loading/OS channel instance is not established by offline descriptors. The chosen HOST entry and module artifacts must be explicit, included and byte-bound; context hashes remain correlation, never authorization tokens.

The only dynamic command origin is the existing private issuer's ORIGINAL active plan with signal/deadline and single global claim. Native wire8 gets distinct private SURFACE_V8 proof role; old registrar and V1 remain V5-only. A local coordinator/owner can consume that proof to build messages, not an arbitrary verifier callback/boolean. Application Source/Runtime workflows remain the permission authorizers; neither manifest comparison nor REGISTER authorizes Application operations. Synthetic observer identity/control tests describe OFFLINE consistency only: executionAuthorized/productionAdmission/measurementEligible remain false. No Windows V2 startup factory is installed; actual channels stay V1/NOT_READY.

## Wire V2

ASCII tab-separated newline frames, prefix CA_MIXED_NATIVE_CONTROL_V2, same contextSha256 and independent strictly increasing per-direction sequence envelope as V1. Explicit maxFrameBytes/maxTotalBytes/maxFrames retain existing codec checks; no new numeric default. Fields:

- REGISTER: launchId(id), role(GIT|V2|SURFACE_V8), phase(SOURCE|ANALYSIS), contextDigest(sha), staticCommandSha256(sha), stdinSha256(sha), commandSha256(sha).
- BOUND, INTENT, READY: launchId, role, phase, contextDigest, commandSha256.
- SPAWNED/CLOSED/ACQUIRED/RELEASED/ABANDON/ABANDONED: exact existing V1 fields, except ACQUIRED role uses V2 role set.

Slot phase is fixed before HOST: initial GIT only SOURCE; V2/SURFACE_V8 only ANALYSIS, no backwards phase. Explicitly approved decision B additionally permits a contiguous final verification-only ANALYSIS/GIT suffix after at least one Native ANALYSIS slot. No SOURCE or Native slot follows that suffix. Final Git commands are independently fixed before HOST and come only from the original controlled Source issuer, with exact static command and full actual stdin binding. SOURCE digest equals independent startup source digest. First Native ANALYSIS REGISTER binds its HOST-attested post-Source context digest after all previous slots settle; later analysis slots including final Git must match it. Final Git cannot establish a new analysis context. HOST must obtain/recheck this from actual Application/Storage flow, not use initial Source as final capture. Offline phase registration is not independent proof of that live semantic fact.

## Independent expected command and C# recomputation

For each slot coordinator freezes the full static command fields and image path/SHA. Existing hashMixedNativeLaunch stays the algorithm. Its normalized JSON has stdinSha256 as final field. Coordinator derives canonicalPrefix from normalization of the full command with zero stdin SHA by removing the final 64 zero characters plus closing quote/brace; suffix is exactly '"}'. The C# slot checks SHA256(UTF8('codeatlas-mixed-native-launch-v1\0'+prefix+zeroSHA+'"}')) equals independently expected staticCommandSha. REGISTER full SHA is independently recomputed with that SAME pinned prefix and actual stdin SHA. Prefix is bootstrap data, never received from HOST REGISTER. Unicode/escaping vectors prove exact compatibility; no C# JSON serialization algorithm or silent hash-domain change.

## Pure C# observer API

New file scripts/mixed-native-dynamic-observer-policy.cs (no Win32/files/process calls), including MixedNativeDynamicControlCodec and MixedNativeDynamicObserverPolicy. May reuse old codec internal primitive validators by compiling old+new sources together; old source untouched.

Slot constructor: Slot(string launchId,string role,string phase,string staticCommandSha256,string canonicalPrefix,string imagePath,string imageSha256).
Policy constructor: (string contextSha256,string sourceContextDigest,uint expectedHostPid,string expectedHostPath,string expectedHostSha,Slot[] slots,long deadlineEpochMs,long maxFrameBytes,long maxTotalBytes,long maxFrames).
Receive(string line,long nowEpochMs) -> string[]. Host/child capture/exit methods mirror old policy and take final nowEpochMs where needed; Cancel() permanently faults. Old policy object is not instantiated/mapped as a V5 substitute. Snapshot has complete/cleanupComplete/status and all authority flags false.

REGISTER validates root captured, no current/unreleased child, exact next slot, static hash, phase/context, recomputed full SHA, deadline; commits one pending binding and returns BOUND. INTENT exact match -> READY; repeated/early/wrong frames poison. Only READY allows captured child; ACQUIRED after actual/synthetic matching PID+creation/image before-continue; no stdin implication before acquire. Preserve CLOSED+OS exit/final query/release join, unknown descendant refusal, root/child cleanup, no retry. Cancellation/late frames permanently fail; no reclaimed registration slot.

## Ownership and checks

Root owns coordinator/dynamic owner, existing exchange reuse, private Native role extension, integration and docs. Codec worker owns new JS V2 codec/tests only. Observer worker owns new pure C# source/PS1+Node tests only. No overlapping source writes; root integrates one batch. Relevant prior handoff/ADR/spec authority applies; synchronized pointers precede implementation.

Success: exact V2 schema/parity/refusal; genuine issuer origin/full static+dynamic hash and one-shot lifecycle, independent manifest mismatch rejection; synthetic observer registration->BOUND->INTENT->READY->ACQUIRED->release; V1 refusal/regressions, affected builds/tests/architecture/format and one concentrated review. No claim of live HOST/environment identity, real cross-process authentication or resource qualification from these tests.

## Approved final Source suffix refinement

[Decision B](2026-11-05-final-source-verification-phase-proposal.md) preserves actual Runtime derivation before final Source re-observation, original readset recheck and synchronous atomic publication. Unexpected command/count, context/Source drift, cancellation/deadline or uncertain cleanup refuses publication; no Native after verification begins. Old V1/V5, wire fields/hash domain, public admission and resource values are unchanged. Offline tests do not authorize real execution.

## Bounded offline continuation - 2026-11-06

See [N1 exact allSOURCE orchestration](2026-11-06-current13-no-native-offline.md) and
[HOST protected-consumption ownership](2026-11-06-host-consumption-lifetime-offline.md).
These private offline refinements preserve prior Native/suffix guards, operation
authority and live NOT_READY; no OS guarantee, actual launch, new right or resource
number follows. Historical outcomes below/above remain scoped to their tested bytes.
