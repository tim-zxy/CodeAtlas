# P1-04 Native syntax implementation detail

Authority: ADR-020 and accepted foundation plan P1-04; user requests next step and separately approves exact tree-sitter-python0.25.0. The existing sequential/local-only/retained-evidence constraints stand. This detail does not approve a new profile value, calibration or cloud operation.

## Concrete reuse and dependency

Keep tree-sitter0.27.0 and Java grammar0.23.5. Add only exact Python grammar0.25.0, MIT, edition2021, depending on tree-sitter-language0.1 and build cc1.2. Existing lock already contains the shared dependencies; inspect actual Cargo resolution rather than upgrade them. Official tagged sources:

- [Grammar manifest](https://raw.githubusercontent.com/tree-sitter/tree-sitter-python/v0.25.0/Cargo.toml)
- [Rust language binding](https://raw.githubusercontent.com/tree-sitter/tree-sitter-python/v0.25.0/bindings/rust/lib.rs)
- [Generated parser, ABI15](https://raw.githubusercontent.com/tree-sitter/tree-sitter-python/v0.25.0/src/parser.c)
- [License](https://raw.githubusercontent.com/tree-sitter/tree-sitter-python/v0.25.0/LICENSE)
- [Pinned parser language validation](https://raw.githubusercontent.com/tree-sitter/tree-sitter/v0.27.0/lib/binding_rust/lib.rs)

LanguageFn compatibility is a source-based expectation until local set_language/parse tests pass. No user Python interpreter, import, module execution or annotation processor is needed. Literal grammar tests do not qualify an actual Native observer or memory profile.

## Data path and responsibilities

Runtime trusted Source/basis snapshot -> explicit v4 request -> existing no-shell/allowlisted-environment lifecycle -> Rust single-request v4 parser -> cap-std verified file reader -> per-language bounded syntax walker -> existing raw-byte terminal contract -> Python Code normalization / Java retained owner mapping -> canonical SyntaxEvidence candidates. Application/Store activation is P1-05 and remains separate from parsing. No database, graph activation or semantic knowledge write in Native.

Rust syntax.rs owns strict request selection/validation, aggregate request/source/event/output/depth budgets, deadline/cancel checks, deterministic event order, counts/checksum, and fixed failure messages. Reuse source_access::read_verified_source (same link/TOCTOU/hash rules), existing SHA256 and Tree-sitter APIs. Changed files only, removed IDs produce no stale records. A new process has no prior ownership cache to trust.

Java syntax obtains declaration owner IDs through the existing JavaAnalyzer. Bind a syntax declaration to its exact declaration-name span/known symbol, then check its provider ID against the supplied per-file owner map; never choose the nearest function. The narrow initial solution may parse each changed Java file for existing symbols and syntax separately, both within the declared budgets. Sharing its internal tree is deferred until measurements justify touching the proven visitor; unchanged files are never parsed by this route. Annotation arguments/calls/declarations/static assignments use strict raw syntax values; unsupported expressions remain UNKNOWN.

Python uses its grammar with explicit literal parsing and scope tracking. Emit python.module for each requested file and python.symbol for source-backed functions (including async/nested functions), before any raw syntax referencing those owners. Class scopes can qualify function names, but this minimum does not invent Canonical TYPE support; unsupported class/decorator semantics are honestly partial/unresolved. Emit only proven IMPORT/REFERENCE edges; CALL/INHERITANCE/OVERRIDE remain unregistered. Imports/aliases/decorators/APIRouter construction/include_router/Depends are syntax evidence for later Plugin interpretation, not FastAPI semantics inside Native. Do not execute arithmetic, f-strings, arbitrary calls or cross-file dynamic resolution to make a constant.

## Canonical normalization

normalizePythonObservation consumes validated provider observation data and returns canonical nodes/edges, provider-to-canonical pairs and provenance needed by the normal Syntax/FactMerger path; it does not publish. Reuse nodeFactKey/edgeFactKey/canonicalFactId, strict old schemas, target uncertainty and existing controlled normalization errors. MODULE identity uses repository/revision/MODULE/source path, like the existing module convention. Function identity uses SYMBOL/FUNCTION/qualified name/source span, never Provider ID. IMPORT/REFERENCE identity uses canonical endpoints, kind, unresolved hint and source span. Duplicate/dangling/wrong-provider/revision/file inputs fail. No reuse of a Java providerKind by renaming Python facts.

## Source and compatibility

classifySample currently maps only.java to SOURCE/java and.py to OTHER/null. Add Python deliberately; inventory fingerprint already includes languageHint/role/provenance/contentKind, so Python-containing repositories change inventory fingerprint even when byte content is unchanged. Preserve the existing fingerprint encoding and all-Java behavior. Record the classifier compatibility explicitly with the syntax/provider policy context; do not re-tag old inventory as current.

The existing index composition forwards all state.files while selecting Java descriptor metadata. Python classification therefore needs a mixed-repository routing/summary audit before activation: keep the complete inventory fingerprint authoritative, restrict Java work to its declared files, and never feed Python into the Java parser or pretend a partial Java graph covers Python. Old Java derived summaries are usable only when their complete expected context still matches; otherwise INCOMPATIBLE with explicit bootstrap, no automatic full parse. Exact Provider support lifetime and candidate basis recomputation are P1-05 transactions.

## Profile and execution boundary

Old READ_SEAL/FULL_TRANSPORT/REFRESH_VERIFY/REFRESH_TRANSPORT evidence is tied to old code/environment/corpus/purpose and cannot qualify the new syntax shape. Treat Syntax transport/normalization as a distinct measured purpose under the existing memory accounting/governance; exact layout/catalog/independent oracle/holdout and scalar reservation are proposed and reviewed separately. No entry or guessed number is installed here. Missing exact-current evidence refuses before source preparation/spawn; a caller-supplied budget or test-mode flag does not waive this.

Before qualification, only bounded grammar/normalizer unit and protocol refusal tests are allowed. They must not be reported as actual observer GREEN. Preparing a diagnostic/measurement harness does not authorize running calibration; present its precise candidate/corpus/commands for separate confirmation. Runtime deadline/memory enforcement cannot be claimed from a pure schema validator.

## Failure/recovery and acceptance

New v4 dispatch never falls through to v1/v2/v3; those schemas/handshakes remain strict. Do not advertise supported Syntax/Python capability before actual evaluated evidence. Invalid request/owner/source change/link/too-new profile/budget/deadline/cancel/terminal corruption produce no applicable partial batch. All actual application state remains last-good. PARTIAL syntax coverage carries unsupported locations, never invented constants or owner facts.

Independent Fixture cases: Java annotation literal plus same-name non-framework control; Python nested/async functions, import aliases, APIRouter/Depends syntax; dynamic UNKNOWN; malformed syntax partial; mixed Java/Python; fingerprint/owner mismatch; source links/change; removed files and restart changed-only; timeout/cancellation/truncated stream; stable canonical identity under Provider-ID change; no Code/Syntax activation before complete validation. Missing profile has a pre-spawn refusal test, not an actual positive observer test.

The plan's P1-04 mixed-provider persistent lifetime check depends on P1-05, while P1-05 needs the observer contract. Preserve both obligations by using the verified candidate/contract as a preparation dependency and holding P1-04 final completion for the joint04/05 composition acceptance. Do not mark either task complete using parser/normalizer tests alone. This is task ordering, not permission to weaken a gate or silently merge an implementation.


## Required mixed-composition review

The read-only audit confirmed the existing v3 complete-inventory/Java-only mismatch. [Mixed Native compatibility proposal](2026-10-22-phase1-mixed-native-compatibility-proposal.md) supplies the concrete recommended composition and alternatives. The user explicitly accepted the recommended revision on2026-10-22; its exact owner contract is pinned in [owner binding](2026-10-22-phase1-syntax-owner-binding.md). This supersedes the earlier governance pause for that direction; actual profile/Store acceptance remains open.


## Bounded library candidate evidence boundary

The controlled library writer requires explicit SyntaxWalkControl; it does not derive a memory reservation from maxMemoryBytes or an old Java profile. Aggregate maxInputBytes counts original request JSONL plus verified Source bytes; output bytes include LF/envelopes and terminal, with an event slot reserved for termination. I/O failure is propagated without attempting another record. Pre-start failure uses REQUEST_FAILED; started failures use SYNTAX_FAILED, with cancellation distinct from deadline. Test-owned Source and Vec output prove only library/contract behavior, not a live admitted observer. The [separate admission proposal](2026-10-22-phase1-syntax-admission-proposal.md) remains unapproved.


## Current accepted dispatch/budget evidence — 2026-10-22

The user explicitly accepts the Syntax traversal-budget amendment. Current unpublished v4 requests require maxItems from the existing operation/EffectiveConfig allowance, independently of maxEvents; Runtime rejects an enlarged allowance. Syntax visitor ticks are charged across files (including declaration/value traversal), with remaining controls passed to both adapters. Java's reused Code pass keeps its separate existing deadline/result limits. Explicit Native4 routing now precedes old branches and emits direct v4 errors; DESCRIBE remains IPC1..3/Java-only. No default, numeric profile, new dependency, Source policy, IR, schema or SQLite/R010 guard change.

Fresh local evidence:640/640 Node across35 files,45/45 offline Rust library/shared/adapter/producer/dispatch tests,5/5 in-memory zero-Source/invalid-request protocol tests,3 package builds,17-project architecture check and all-target offline Clippy pass. New p1-syntax-budget-contract-v1 is contract-only;registry36/exact10 Phase1. Original syntax-contract and syntax-owner-binding roots remain byte-identical; internal Syntax catalog remains empty. Exact commands and hashes: .superpowers/sdd/2026-10-22-phase1-foundation-and-runtime/task-04-dispatch-budget-verification.json.

P1-04/05 and all phase exits remain open. No actual Native CLI observation/measurement/calibration, numeric installation, cloud operation, commit/stage or R4 DB use. Test-owned Source/library output, Node transport fakes/helpers and in-memory protocol tests do not establish an admitted actual observer. Next preparation is the concrete measurement harness, independent full-output oracles, exact request/resource scope and lifecycle/accounting composition; obtain separate run approval only after those artifacts are reviewable. Author review only under the user's sequential constraint.

The earlier admission-unapproved/no-dispatch statements are historical and superseded for accepted preparation only. Controlling links: [admission](2026-10-22-phase1-syntax-admission-proposal.md), [traversal amendment](2026-10-22-phase1-syntax-traversal-budget-proposal.md).


## Measurement preparation continuation — 2026-10-22

[Preflight](2026-10-22-phase1-syntax-measurement-preflight.md) and [review](../reviews/2026-10-22-phase1-syntax-output-oracle-review.md) separate the complete wire-comparison mechanism from open actual-case full oracles,Canonical/Store results,exact resource/run package and actual Native acquisition bridge. PowerShell/helper ownership does not establish native-client child ownership or profiling equivalence. No actual-run readiness,profile or phase exit follows.
