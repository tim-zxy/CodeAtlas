# HOST protected consumption lifetime: B-DESIGN-OFFLINE

Status: accepted bounded design/offline scope; pure implementation and original-ledger substitute composition have a final49-assertion compile/test receipt, with integrated review and gate sealing recorded separately. This supersedes only historical HOST B paused statements for this bounded work. Actual HOST/path/OS admission stays NOT_READY.

## Assumptions and success criteria

The independent coordinator and its fixed expected inventory are trusted inputs. HOST output, callbacks, matching hashes and this state machine cannot establish that trust. All new operations are explicit memory substitutes. No Windows implementation, file/path observation, Native/Git/HOST run, rights, startup flags, inheritance changes, dependency, physical formula/value or baseline is authorized here.

Success means deterministic complete acquisition, handle-associated verification and final full named-path reconciliation before consumption; no consumer callback on refusal; ownership retained across every fixed consumer; known handles close once in reverse acquisition order; uncertainty remains sticky UNKNOWN without retry. Tests must prove partial-acquisition failure, uncertain acquisition, verify/reconcile failure, noninheritance rejection, duplicate ownership, premature settlement/release, callback failure and uncertain close.

## Independent protected inventory

The immutable coordinator-authored entry list is fixed before HOST declarations. Each entry carries exact ID, canonical lexical absolute local path, kind, parent ID and expected SHA256 for files. Ancestors carry no byte digest. Explicit parent chains include every distinct directory through the agreed volume root, deduplicated case-insensitively; aliases, reparse/link/mount and unsupported namespaces require separate platform proof. Lexical validation is no OS canonicalization guarantee.

Required file roles are the fixed bootstrap mixed-native-host-bootstrap.mjs, prehook mixed-native-owner-context.mjs, prehook mixed-native-host-module-loader.mjs, manifest, operation descriptor, explicit path-read SQL/migration/data and selected Node/tool/observer artifacts. Exact retained product-module paths remain listed wherever the existing full recheck contract consumes them. Independent expected material defines completeness; deriving this list from HOST or observed successful opens is forbidden. Constructor checks role/chain consistency, not semantic inventory completeness or disk identity.

Mutable Source, repository SQLite/WAL/journal, workspace stores and unrelated files are excluded by the independent inventory review. No recursive workspace lock or assumed directory-content freeze. No flag/access/share combination is chosen.

## Minimal private API and ownership

New scripts/mixed-native-host-consumption-lifetime.cs follows the existing MixedNativeHostHandleLedger close-once pattern, without editing it. Entry and returned state are immutable. IOperations is substitute-only: Open(entry) reports KnownOpen(handle, noninheritable), NotOpened or Unknown; Verify(entry,handle) verifies against the fixed expected entry through that handle; Reconcile(entries,handles) performs the complete post-acquisition name/ancestor comparison; Close(handle) reports definite closure. Exceptions are uncertain outcomes, never assumed no-open.

Acquire is one-shot: sort ancestor-before-descendant by path depth then ordinal-ignore-case path; acquire the full set, verify through retained handles, then reconcile every entry. A failed open stops all later acquisition/consumption; known handles remain owned. Unknown acquisition is never represented by an invented handle and remains UNKNOWN even if every known handle later closes. Reused handle values refuse and remain UNKNOWN. Noninheritable observation is required; it does not expand the existing three-stdio inherited whitelist.

BeginConsumption marks possible consumption before invoking any startup callback. Fixed settlement enum: RootAndDescendants, FinalQueryAndDuplicates, ControlEof, StderrEof, ConsumingWorkers. Settlement signals are memory observations only. Calling settlement early, twice or outside the consuming phase refuses. Release before consumption may close known acquisitions; after consumption it requires every fixed settlement observation. Release visits each known handle exactly once in reverse acquisition order, continuing other known closes after failure. Failed/thrown close remains sticky UNKNOWN; repeat release never retries it. No second batch or reusable handle pool.

## Existing startup seam and offline composition

Current QualificationHostRoot.Start privately owns actual CreateProcess/pipe calls; its created flag, RequestAbort or ledger.CloseAll cannot prove all consumers settled. QualificationHostPipe.WorkersComplete and observer/policy cleanup have distinct joins. There is no existing trusted complete HOST consumption-settlement token, so this work cannot safely connect to actual Start or promote caller booleans to platform proof.

A new OfflineComposition in the owned file composes Acquire -> BeginConsumption -> an explicitly named startup substitute callback using the ORIGINAL MixedNativeHostHandleLedger -> five fixed memory settlement observations -> require original startup ledger allReleased -> release protected handles. Tests use original ledger Keep/Close/ObserveRootCreate/DebuggerExitContinued behavior, never forge QualificationHostRoot.created or invoke Win32. Callback throw marks uncertainty and retains ownership until complete substitute settlement; no implicit release in finally. The adapter refuses every live-use request. This makes ownership ordering reviewable at the existing resource-owner boundary without enabling a launcher.

Snapshots always carry executionAuthorized=false, productionAdmission=false, measurementEligible=false, moduleClosureAuthenticated=false and liveAdmission=NOT_READY. OFFLINE_OWNERSHIP_READY is ordering data only.

## Plan and verification

1. Freeze independent literal memory inventory and failure expectations in the new C# test; observe missing-module RED.
2. Implement only the pure lifetime and offline original-ledger composition in the new module.
3. Compile/run the isolated PowerShell Add-Type test runner; preserve raw failures and fresh final output under .superpowers/sdd/2026-11-06-host-consumption-lifetime-offline/.
4. Root integrator reviews and synchronizes ADR020, DESIGN_AUTHORITY, security/provider/evaluation/module-boundary applicability, acceptance and traceability plus CURRENT_STATUS. No formal Fixture ID/quality gate is added or passed by memory tests.

Owned paths: this document, scripts/mixed-native-host-consumption-lifetime.cs, scripts/test-mixed-native-host-consumption-lifetime-double.cs, scripts/test-mixed-native-host-consumption-lifetime.ps1 and this task's dedicated evidence directory. Existing shared production files are untouched.

## Remaining platform decision packet

Future review must independently fix supported Windows/filesystem/volume/threat model and exact file/directory access/share/open semantics; existing writers/mappings, parent/grandparent rename/replacement, POSIX operations, reparse/mount/aliases, unsupported access and startup-import/data-read compatibility. It must establish actual root CREATE image/creation/pipe identity, exact original three-stdio inheritance, observer final-query/duplicate release, root/descendant exit, control/stderr EOF and worker completion under original budget, then retained-handle closure. It also needs exact artifacts/tools/inputs/resources and separately approved real execution. Ordinary file-share refusal or substitute success proves none of these guarantees. Failure returns to NOT_READY; no broader rights, fallback or retry-to-green.

## Current implementation evidence

Exact compiler invocation, API-absence RED, reentrant-release RED, initial47 and final49 memory assertions, and immutable source/log pins are in .superpowers/sdd/2026-11-06-host-consumption-lifetime-offline/verification.json. The acquiring guard was added only after the real reentrant Open/Release control failed. No actual startup, OS observation or protected inventory coverage is proved by these tests; the literal inventory is synthetic and independently reviewed real inventory remains a prerequisite.

## Fixed-input projection continuation

The [pure inventory projector](2026-11-06-host-protected-inventory-offline.md) checks independently fixed existing metadata/raw bytes and emits these same Entry fields. Final41 Node checks prove literal input consistency and lexical ancestor projection, not actual inventory completeness or cross-C# execution. The lifetime49 source and original-ledger tests are unchanged and reused separately. A projector pass never supplies trusted actual consumer settlement or enables Start.

## Launch-plan correlation continuation

scripts/mixed-native-host-launch-inventory.cs adds only void Validate(plan, entries). It correlates the existing Node Tool, fixed Bootstrap, Manifest path/hash and cwd Ancestor fields before the original memory composition seam. Hashes remain ordinal exact; paths use the existing Windows lexical slash/case semantics. It performs no IO, does not retain input, construct a token or replace Lifetime structural validation. The current production Start path does not invoke this primitive and remains NOT_READY.

The independent literal test double invokes Validate before constructing the original OfflineComposition. Wrong paths/hashes/kind/cwd refuse with Open0/callback0; original acquire/reconcile refusals, startup-ledger settlement, five memory observations and reverse closure retain their original owner. The new PowerShell runner compiles these sources with the unchanged startup/lifetime files and is registered in the existing Windows offline step.26 assertions establish only this bounded correlation, not real inventory completeness, protection or qualification. No original49/41 test needs to be repeated for this additive primitive.
