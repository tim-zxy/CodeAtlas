# Python Source-target Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans, in this existing worktree and session, sequentially. Use TDD and verification-before-completion. No new session, worktree, subagent, staging or commit.

**Goal:** Add the approved pure Python Source-target entry without requiring or accepting a final Code digest.

**Architecture:** Keep the existing strict RepoBasis wrapper and extract its mapper into one private Source-target core. A second strict wrapper reuses SyntaxTargetSourceSchema and checks scalar Unicode only for its new input. Results remain provisional frozen pairs without Source authentication, completeness, outcome or publication authority.

**Tech Stack:** Existing TypeScript/Zod, Node 24 node:test and built-in String.isWellFormed; no dependency, migration or configuration addition.

**Spec:** [Accepted B0-a DCP](../specs/2026-10-23-phase1-b0-source-target-dcp.md), sections 1,4,5,8,9. Section 7 B0-b is not approved by this plan.

## Global Constraints

- Work only at C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas; verify HEAD cc5a8cb571986c5e56ed04053b2c96ef500fcacb and preserve dirty files/EOL changes.
- Preserve provider-independent Canonical IR, SQLite authoritative, LLM candidate-only, AUTO/MANUAL and ExecutionGraph → RuntimeFlow → BusinessFlow.
- PYTHON_NORMALIZER_VERSION remains '1'. Old InputSchema, acceptance/error behavior, original Fixture bytes, IPC1..3/v4, owner-map and limits remain unchanged.
- No production caller, Source classification, Native wire/producer, Runtime/Store, profile/default/number, dependency, SQL, R4, acquisition helper or cloud operation.
- Empty mappings remain legal, without complete/ready/authenticated status. Root/Native/calibration/CI remain separate gates; NOT_RUN/TODO never means PASS.
- Preserve original16 Source references and all previous .superpowers receipts/failures; never submit .superpowers/.pnpm-store. No commit is planned.

## Review Focus

1. Repo fingerprint differs from file fingerprint: mapping succeeds without authentication.
2. Proxy/getter/sparse input: refuse before invoking user code or exposing raw errors.
3. Lone surrogate in strings or keys: new wrapper refuses; old opaque-string acceptance stays unchanged.
4. Empty observations and invented authority keys: empty pairs are legal; authority keys reject.
5. Core extraction alters IDs, closure, ordering or limits: independent golden, old API and six caller references must remain exact.

## File map and interfaces

All paths below are relative to the original C worktree.

| File                                                                                                                             | Responsibility                                                          |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| packages/providers/src/python-normalizer.ts                                                                                      | Two validated wrappers, one private mapper                              |
| packages/providers/test/python-source-normalizer.test.mjs                                                                        | New contract, equivalence, hostile input, identity, freezing and limits |
| fixtures/phase1/python-source-normalization/fixture.json                                                                         | Manifest v1, ID p1-python-source-normalization-v1                       |
| Same root: inputs/observation.json                                                                                               | Explicit targetSource input without Code digest                         |
| Same root: expected/normalized.json                                                                                              | Exact existing independent golden bytes                                 |
| Same root: README.md                                                                                                             | Provenance hashes and contract-only/authority limits                    |
| package.json                                                                                                                     | Register new test once after old Python test                            |
| docs/handoff/{CURRENT_STATUS,DESIGN_AUTHORITY,WORK_BREAKDOWN,PHASE_ACCEPTANCE,DESIGN_TRACEABILITY}.md                            | Fresh local evidence and open gates                                     |
| docs/handoff/adr/ADR-020-phase1-contracts-and-evaluation.md; specs/{PROVIDER_SPI,CANONICAL_IR,NATIVE_IPC,SECURITY,EVALUATION}.md | Synchronize pure API, unchanged publication boundary                    |
| This plan, B0 DCP, new implementation review and .superpowers/sdd/2026-10-23-phase1-python-source-normalization/                 | Progress, RED/GREEN, pre-product freeze and receipt                     |

No index.ts or workspace-export assertion change: the existing export-star covers the addition. Old tests/Fixtures stay read-only. No generic framework or new IR type.

Public addition: normalizePythonSourceObservation(value: unknown): NormalizedPythonObservation.
Output remains exactly { readonly nodePairs: readonly NormalizedNodePair[]; readonly edgePairs: readonly NormalizedEdgePair[] }, recursively frozen. Existing normalizePythonObservation and version remain unchanged.

Private interfaces in python-normalizer.ts:

- SourceInputSchema = InputSchema.omit({ basis: true }).extend({ targetSource: SyntaxTargetSourceSchema }); preserve strictness.
- type PythonSourceInput = z.infer<typeof SourceInputSchema>.
- normalizePythonSourceInput(input: PythonSourceInput): NormalizedPythonObservation: existing mapper, with input.targetSource repository/revision and no final digest.
- checkScalarUnicode(value: unknown): void: after ensurePhase1Data and strict parsing, scan every string and object key with isWellFormed, using existing check() for INVALID_FACT. Follow existing private scalar-check patterns; no wire parser dependency or new depth/config control.

Old wrapper retains ensurePhase1Data, InputSchema.parse and catch translation; explicitly select the Source triple and other current provider/array fields for the core. New wrapper runs ensurePhase1Data, SourceInputSchema.parse, checkScalarUnicode and that same core. Preserve CanonicalNormalizationError; translate other errors to INVALID_FACT, path [] and 'Invalid Python observation'. No raw error/source dump.

## Task B0a-1: Freeze independent Fixture and observe API-absence RED

**Depends on:** user review of this concrete plan.
**Interfaces:** Consume old observation/golden as documentary provenance; produce new four-file Fixture and test 'Source-target API is exported'. Never use product output to author expected.

- [x] Re-read required authority and DCP; verify plan-review receipt, original worktree and new-file absence. Save pre-change hashes and exact registry ID set.
- [x] Independently author input with the old sample's facts/source/provider IDs and targetSource {repositoryId:'repo:python',revisionId:'revision:worktree',contentFingerprint:'content:python'}. No basis or codeActivationDigest anywhere; not captured inventory.
- [x] Copy old fixtures/phase1/python-normalization/expected/normalized.json bytes, reviewed SHA256 e78f4e8e39c1654e815ad42953b4cb2d07f57b7d12e8bfc31bd748bdb29447e9. Changed provenance stops work; never regenerate golden through the normalizer.
- [x] Manifest: schemaVersion:1, phase:'1', category:'code-intelligence', languages:[], frameworks:[], capabilities:['PYTHON_NORMALIZATION_CONTRACT_ONLY'], inputs.observation:'inputs/observation.json', expected.normalized:'expected/normalized.json', criticalFacts:[], qualityGates:{}. README records provenance/hash and repo/file fingerprint distinction; empty gates confer no waiver.
- [x] Format only these four new files; freeze raw SHA256 in B0a-1-fixture-before-product-freeze.json before product changes. Do not backdate or replace expected from implementation.
- [x] New test imports * as api from '../dist/index.js' and asserts typeof api.normalizePythonSourceObservation === 'function'. Build with pnpm --filter @codeatlas/providers build, then run node --test --test-concurrency=1 packages/providers/test/python-source-normalizer.test.mjs.
- [x] Save real RED: assertion 'undefined' versus 'function', nonzero exit. Build/dependency failure is not a valid RED. No product edit before observed API absence.

Deliverable is an independently reviewable frozen oracle and RED, not product completion.

## Task B0a-2: Strict wrapper and unchanged shared mapper

**Depends on:** B0a-1 freeze/RED.
**Interfaces:** Consume PythonSourceInput/private signatures above; produce the single public addition and unchanged legacy API.

- [x] Write named tests before product changes, fresh clone for each case:
  - 'Source-target matches independent golden and legacy': assert.deepEqual(newRun(input), expected); legacyRun with explicit basis triple plus codeActivationDigest:'a'.repeat(64) equals expected. Assert version '1' and exact keys ['edgePairs','nodePairs'].
  - 'Source declaration is not authentication': changing only targetSource.contentFingerprint gives identical pairs; repo fingerprint need not equal file fingerprint.
  - 'empty observations confer no authority': valid Source context, nodes:[],edges:[] produces exact frozen empty pairs; no outcome/ready/publish property.
  - 'strict shape and authority refusal': missing each required field, null, mixed basis/targetSource, extra top-level basis/codeActivationDigest/expectedActivationBasis/ownerBinding/capturedHandle/publish/ready, nested targetSource digest, malformed nested Source/fact shape => INVALID_FACT.
  - 'plain-data rejection avoids user code': getters not invoked, Proxy trap count zero; sparse array, symbol key, cycle, undefined and exotic prototype => INVALID_FACT; sentinel absent from message.
  - 'new Unicode guard preserves legacy acceptance': lone high/low surrogate in targetSource.contentFingerprint, providerSnapshotId, confidence.reasons and a key => INVALID_FACT; legal astral fingerprint/reason accepted. Legacy basis.contentFingerprint with lone surrogate still returns expected. No global schema tightening.
  - 'context and reference errors match legacy': mirror old parameterized refusal cases without editing old tests. Add foreign repo on Source/node/edge, Source revision mismatch, duplicate path with distinct ID, wrong content kind, invalid range and dangling/foreign endpoints. Compare exact error code with legacy for shared well-formed shapes: INVALID_CONTEXT/INVALID_FACT/MISSING_REFERENCE/UNSUPPORTED_KIND.
  - 'identities ignore Provider names and order': reverse Source/node/edge arrays, rename Provider or fact IDs consistently including endpoints; compare canonical arrays with independent expected and preserve pair provenance.
  - 'deep freeze without input mutation': input equals before-clone and remains unfrozen; every returned nested object/array frozen, attempted mutation throws, second call equals expected.
  - 'hard limits remain exact': distinct legal file/module observations at NATIVE_CLIENT_HARD_LIMITS.maxEvents succeed in both APIs; source count or nodes+edges count above that bound rejects INVALID_FACT in both. Derive sizes from existing constant, not a new profile/default.
- [x] Run new tests against old build, retain failures. Legacy baseline passes separately. Unexpected failures require systematic-debugging, never weakened assertions.
- [x] Implement declared wrappers and private core. Move existing mapper unchanged except Source context; retain MODULE/FUNCTION, IMPORT/REFERENCE, ID/FactKey, range/confidence, edge closure, uniqueness, sorting and hard limits. No class/call/dataflow.
- [x] Run pnpm --filter @codeatlas/providers build (exit0), then node --test --test-concurrency=1 packages/providers/test/python-source-normalizer.test.mjs packages/providers/test/python-normalizer.test.mjs (fail0, no new TODO/skip).
- [x] Check pre-product freeze and all old covered source/Fixture/evidence hashes. Review extraction against old source, confirming no production caller or digest reaches the core.

Deliverable is a pure provisional contract; no application integration.

## Task B0a-3: Register, validate and record bounded evidence

**Depends on:** B0a-2.
**Interfaces:** Consume frozen oracle/both APIs/six old caller scripts; produce one registration, regression logs and current task-local receipt.

- [x] Register new test exactly once next to old Python test in root package.json. New test 'new test is registered once' reads script, asserts one whitespace-delimited occurrence; no unrelated script edits.
- [x] Run exact local commands below sequentially with full logs/status; no bare root test/verify, Rust, binary clients or acquisition helper suite.
- [x] Use existing Evaluation discoverFixtures('fixtures'): retain every prior ID; exact difference ['p1-python-source-normalization-v1']; assert new metadata/artifact paths. Prior46/exact20Phase1 implies47/exact21 if no other authorized addition. Investigate mismatch, do not relax counts. Assert Syntax profile catalog still empty.
- [x] Recheck new Fixture against B0a-1 freeze, old golden SHA and original16 Source-reference bytes.
- [x] Author-review DCP coverage, error/Unicode compatibility, IO/authority/caller absence and actual gate totals. Independent review/integration/CI stay NOT_RUN.
- [x] Synchronize declared authority/status/WBS/acceptance/trace documents with fresh reproducible evidence. B0-a LOCAL_CONTRACT_COMPLETE only when applicable checks pass. B0-b/B1/C, C1 symlink EPERM, actual Native/resource/profile, P1-04/05/Phase1 remain OPEN; historical timeout UNKNOWN.
- [x] Save immutable implementation-verification.json linking predecessor, logs and initial freeze; retain failed attempts. Format only owned files and run scoped git diff --check. No staging/commit/push.

### Exact local verification (planned, not executed now)

Run in original C worktree. Existing IR/Application/Evaluation dist prerequisites must match recorded source hashes; if missing/stale, build only those local TypeScript projects, recording prerequisites, without installation/root build.

    pnpm --filter @codeatlas/providers build
    node --test --test-concurrency=1 packages/providers/test/python-source-normalizer.test.mjs packages/providers/test/python-normalizer.test.mjs packages/providers/test/canonical-fact-identity.test.mjs packages/providers/test/java-node-normalizer.test.mjs packages/providers/test/canonical-normalizer.test.mjs packages/providers/test/fact-merger-input.test.mjs packages/providers/test/fact-merger-selection.test.mjs packages/providers/test/fact-merger.test.mjs packages/providers/test/native-syntax-owner-binding.test.mjs packages/providers/test/native-syntax-budget.test.mjs packages/providers/test/native-syntax-ipc.test.mjs scripts/test-syntax-initial-absence-oracle.mjs scripts/test-syntax-mixed-provisional-oracle.mjs scripts/test-syntax-dynamic-malformed-oracle.mjs scripts/test-syntax-nested-source-oracle.mjs scripts/test-syntax-bounded-output-oracle.mjs scripts/test-syntax-changed-only-oracle.mjs packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs scripts/test-workspace-structure.mjs
    node scripts/check-architecture.mjs

Expected: build0;20 named test files fail0;architecture17 projects pass;registry exact extra ID and catalog0. Counts come from actual logs, not projected totals. Disclose existing skips and leave their gates open. Six reference callers compare pure independently authored observations, no Native. Registry tests create owned temp directories/junctions; verify cleanup stays within resolved owned temp paths. Node test runners are not acquisition-helper lifetimes. Peak collector and architecture-rules subprocess suites are excluded from this mapper-only scope.

### Traceability / exit

| Obligation                                | Task / evidence                                                          | Boundary                    |
| ----------------------------------------- | ------------------------------------------------------------------------ | --------------------------- |
| DCP§4 strict target/Unicode, Security     | B0a-2 strict/hostile/Unicode;new Fixture                                 | No authority                |
| DCP§4/5 mapping, identity, errors, limits | B0a-1 independent golden;B0a-2 equivalence/closure/boundary;legacy tests | Contract only               |
| DCP§5 unchanged API/Fixture/wire          | B0a-3 six callers,owner/budget/IPC,identity/merger,old SHA               | No complete Code proof      |
| DCP§8 Evaluation                          | B0a-1 freeze;B0a-3 manifest/registry                                     | No language maturity/waiver |
| DCP§9 architecture/docs                   | B0a-3 architecture17/workspace/review/receipt                            | No Phase exit               |

No new ADR decision beyond synchronized ADR-020 for this approved additive pure API. If identity/error/schema/wire changes become necessary, stop that portion and submit a governed amendment. New numeric gates, complete-Code/wire, production assembly and actual-run decisions remain separate.

First executable action after confirmation: B0a-1 pre-change hash/registry capture, independent freeze, API-absence RED. Tasks are sequential: oracle precedes code; shared-core validation precedes acceptance. No independent task warrants parallel implementation.

Status: concrete plan CONFIRMED_BY_USER;B0a-1..3 LOCAL_CONTRACT_COMPLETE. Fresh302PASS/0FAIL/0SKIP/0TODO across20 files;Providers build0;architecture17;registry47/exact21/catalog0. See implementation review/receipt. B0-b/B1/C and all phase gates remain OPEN. Earlier plan-only wording/commands document the approved baseline,not a claim of full integration.
