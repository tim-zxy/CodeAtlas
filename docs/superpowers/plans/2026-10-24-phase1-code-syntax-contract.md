# B0b-1 Offline Code/Syntax Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans, existing C worktree/session, sequentially. Use TDD,systematic-debugging on unexpected failure,requesting-code-review as author review under the approved sequential constraint,and verification-before-completion. No new session/worktree/subagent,stage,commit or evidence cleanup.

**Goal:** Implement only the accepted B0b-1 pure v5 byte-stream contract and independent Fixture.

**Architecture:** Add one isolated Providers module using existing strict IR/Syntax payload schemas and controlled errors. Validate raw request/output binding,structure and Code/Syntax correspondence without reading Source or invoking a producer. Preserve every old wire/schema/caller and all production admission/publication gates.

**Tech Stack:** Existing TypeScript/Zod,Node24 node:test,crypto SHA256,fatal TextDecoder and Buffer/Uint8Array facilities. No dependency/configuration/migration.

**Spec:** [B0-b accepted written direction](../specs/2026-10-23-phase1-b0b-completeness-proposal.md),§4/5 and B0b-1 row. This plan does not implement B0b-2 producer/transport or B1/C.

## Global Constraints

- Original root C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas;HEAD cc5a8cb571986c5e56ed04053b2c96ef500fcacb,branch codex/p05-integrated-exit-audit. D:/workspace main is not the implementation checkout.
- Preserve provider-independent Canonical IR,SQLite authoritative,LLM candidate-only,AUTO/MANUAL,ExecutionGraph → RuntimeFlow → BusinessFlow.
- Protocol5 is isolated;PYTHON_SYNTAX_CODE_V1 fixed. No automatic upgrade/fallback,DESCRIBE/capability advertisement,Source classifier or Runtime route.
- Old IPC1..3/v4,ProviderSnapshot/IR schema,owner-map,normalizers,old16Source and every old Fixture remain unchanged.
- No Source/DB/clock/process IO in the validator;SUCCEEDED remains a structural result without qualified/captured/ready/publish/Store authority.
- Reuse NATIVE_CLIENT_HARD_LIMITS and explicit request budgets. No new numerical gate/default/profile/reservation.
- No Rust/library/Native/helper/measurement/calibration/cloud operation. No root test/verify or dependency installation.
- Retain .superpowers evidence and old failures;never stage .superpowers/.pnpm-store. Unrelated EOL/local changes untouched.

## Review Focus

1. A resealed omitted-function stream can still be structurally valid:independent Source-oracle mismatch must remain visible.
2. UTF-8/raw-line/header variants and different removed/resources bytes:checksums bind actual bytes,not reconstructed objects.
3. Valid function declaration spans enclose name spans;nested references may lack their own Syntax range:use exact owner and enclosing-range/multiplicity checks.
4. Missing/duplicate coverage,zero files,empty Python andJava-only are different responsibilities.
5. Pure validation cannot observe Native work_items,wall-clock/cancellation execution orSource/history truth:no test/report promotes those as verified.

## File map / public boundary

| Path                                                                                                               | Responsibility                                                                         |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| packages/providers/src/native-code-syntax-ipc.ts                                                                   | New isolated pure validator,private schemas/context/correspondence helpers             |
| packages/providers/src/index.ts                                                                                    | Append only validator export and return-type export                                    |
| packages/providers/test/native-code-syntax-ipc.test.mjs                                                            | Independent positive/negative byte-contract tests                                      |
| packages/providers/test/fixtures/code-syntax-contract-helpers.mjs                                                  | Test-only raw resealing/mutations and independent byte comparison;no product authoring |
| fixtures/phase1/code-syntax-completeness/fixture.json                                                              | New Manifest v1,ID p1-code-syntax-completeness-v1                                      |
| Same root: cases.json,README.md,sources/,requests/,observations/,expected/                                         | Independent Source/request/raw-stream/decision/Canonical references and provenance     |
| package.json                                                                                                       | One new test registration next to native-syntax-ipc test                               |
| scripts/test-workspace-structure.mjs                                                                               | Exact two-line Providers index assertion addition only;retain old inventory/assertions |
| Accepted DCP,this plan,new implementation review,ADR-020 and handoff status/WBS/acceptance/trace/specs/scalability | Fresh bounded evidence and unchanged open gates                                        |

No existing product file besides the index is modified. No export of a parser framework/schema factory.

Public function exactly:
validateCodeSyntaxObservationStream(requestBytes:Uint8Array,outputBytes:Uint8Array):ValidatedCodeSyntaxObservation.
Return type readonly/deep-frozen {request,events,codeOutcome,syntaxOutcome,outcome,counts,checksum,requestChecksum},using strict local inferred v5 request/event types. Code outcome COMPLETE|PARTIAL|NOT_APPLICABLE;Syntax COMPLETE|PARTIAL;outcome SUCCEEDED|PARTIAL. No raw Buffer stored in returned result.

Reuse NativeSyntaxContractError and NativeIpcErrorCode rather than add another error hierarchy. Invalid input request => INVALID_REQUEST;non5 version => INCOMPATIBLE_PROTOCOL_VERSION;corrupt output/binding/count/order/correspondence => PROTOCOL_CORRUPTION;exceeded observable byte/event/depth bound => RESOURCE_LIMIT_EXCEEDED;correctly framed sole failure terminal => its Native error code. Errors retain controlled existing message,not raw JSON/Source/Zod details.

Private responsibilities in the new file:

- readRequest(requestBytes:Uint8Array):{request:CodeSyntaxRequest;requestChecksum:string}:guard actual byte views,copy bytes,strict frame/decode/schema/context and request-bound limits.
- readEvents(outputBytes:Uint8Array,request:CodeSyntaxRequest,requestChecksum:string):readonly CodeSyntaxEvent[]:bounded raw lines/sequence/binding/count/checksum/failure handling.
- validateCorrespondence(request:CodeSyntaxRequest,events:readonly CodeSyntaxEvent[]):void:one-file/facet responsibilities,identity/owner/ranges/counts/multiplicity/outcomes.
- All three are private;the public function translates errors and freezes parsed output. No public helper options or bypass.

## Planning clarifications (no old contract changes)

1. Request/context reuse:derive strict v5 payload from SyntaxObservationRequestSchema.shape.payload.extend({codeContract:literal}). After v5 shape/version validation,use a private v4-shaped request view without codeContract solely with parseSyntaxObservationRequest to reuse existing repository/Source/owner-map/context validation. This is not wire dispatch,fallback or v4 evidence;never synthesize an old output stream. Independently enforce limits/depth on actual v5 bytes.
2. Framing:one request LF-terminated line;nonempty LF-terminated output lines;no CR,BOM,embedded extra newline or invalid UTF-8;no silent trailing data. JSON plain-data/scalar Unicode checks remain strict. Actual request checksum includes LF and whitespace;terminal checksum includes all preterminal output LF bytes only.
3. Byte safety:accept genuine Buffer/Uint8Array,not Proxy/plain-object/lookalike/subclass;use native typed-array access/copy rather than user-overridable valueOf/iterator/byteLength access. Check hard lengths before whole-stream copies/decoding;reject shared-memory backing rather than claim an atomic external snapshot. Copy accepted bytes;never freeze/mutate caller buffers.
4. Function correspondence:DECLARATION.owner exactly equals function Provider ref,same file;declaration SourceRange contains the function's name SourceRange. Never require span equality. One matched declaration per covered function;missing/duplicate owner association refuses.
5. Import correspondence:edge and alias ASSIGNMENT match same file/owner/source span,REFERENCE name/hint and target. Consume this import value occurrence before accounting general REFERENCE values.
6. Other REFERENCE values:collect occurrences recursively from value fields,excluding callees/declarations and consumed import aliases. Use nearest explicit argument SourceRange or observation SourceRange as enclosing range. Match one edge to one occurrence with same owner/hint/target,whose enclosing range contains the edge. Preserve multiplicity,not just Set membership. Per identity group,process edges by start/end coordinates and factId;choose the unused compatible enclosing occurrence with earliest end,tie event index/value path. No dense adjacency matrix/new framework. Keep unmatched Syntax references only for nonCOMPLETE REFERENCE coverage;every emitted Code edge must match a covered occurrence. Document group-bounded scan cost;no performance/profile qualification claim.
7. All emitted Code facts must satisfy existing Python normalizer rules;call normalizePythonSourceObservation with targetSource/provider/files and collected facts,discarding its temporary result. It authenticates noSource and does not alter returned raw events/IDs. Covered MODULE/FUNCTION/IMPORT/REFERENCE counts equal valid corresponding fact counts;unsupported/partial units without valid facts remain explicit statistics/limitations.
8. Per-file event phases/order follow DCP. A DIAGNOSTIC with null sourceRange is a global diagnostic after all file groups,before terminal;file diagnostics stay last in their group. Diagnostics do not themselves turn partial into success.
9. Observable budget checks:request/output/line bytes,event count,JSON depth and safe integer statistics. Positive maxItems/maxDurationMs/maxMemoryBytes/deadline shape and full request binding are checked,not Native visitor ticks,actual Source-read bytes/hash/TOCTOU ormaxInputBytes Source contribution,elapsed duration,memory peak or real cancellation. Those remain B0b-2/C. This is not a waiver of aggregate traversal.
10. Class fixture FUNCTION can be PARTIAL with zero declared function sites and UNSUPPORTED_CLASS_SCOPE;wildcard IMPORT has an unsupported unit. Do not invent a class-as-function fact or silently turn zero into COMPLETE.

These clarify implementation of the accepted direction and are submitted with this plan for review. If implementation needs a new wire field,old-schema change or different unit semantics,stop that part for governed amendment.

## Task 1: Independently freeze contract references and observe export RED

**Depends on:** this concrete plan confirmed.
**Interfaces:** Produce new Fixture and before-product freeze;no product implementation or product-generated expected.

- [x] Re-read required authority/spec/plan;verify plan-review hashes,original worktree,new implementation/Fixture absence and exact old registry ID set47/exact21Phase1.
- [x] Create Manifest v1,phase:'1',category:'code-intelligence',languages:[],frameworks:[],capabilities:['CODE_SYNTAX_COMPLETENESS_CONTRACT_ONLY'],criticalFacts:[],qualityGates:{}. inputs:{cases:'cases.json',sources:'sources/',requests:'requests/',observations:'observations/'},expected:{decisions:'expected/decisions.json',canonical:'expected/canonical.json'}. Empty gates are no waiver.
- [x] Author cases.json with exact IDs below and per-case Source/request/stream paths. Requests are raw .jsonl,not a reserialized object masquerading as original bytes. Independently author event payloads and literal decisions/counts;use only stdlib JSON/crypto to frame/hash known authored records. Never call new/old producer or normalizer to derive expected.
- [x] Pin these seeds;Code facets ordered MODULE/FUNCTION/IMPORT/REFERENCE:
  - no-files:no Source/facts/Syntax coverage;Code NOT_APPLICABLE,Syntax COMPLETE,SUCCEEDED.
  - empty-python:empty Source,one module,zero Syntax,Code/Syntax COMPLETE.
  - comment-python:Source '# note\n',one module,zero functions/edges/Syntax,COMPLETE/COMPLETE.
  - nested-python:copy original syntax-nested-source-oracle/calibration/app.py and independently frozen raw fact/Syntax payloads with provenance SHA;Code3nodes/0edges,2DECLARATION,COMPLETE/COMPLETE.
  - alias-reference-python:Source 'import pkg as p\nx = p\n';one module,one IMPORT,one REFERENCE,two ASSIGNMENT observations;facet covered counts1/0/1/1,COMPLETE/COMPLETE.
  - async-python:Source 'async def f(x):\n return None\n';module+function,one DECLARATION with async modifier,COMPLETE/COMPLETE.
  - wildcard-python:Source 'from pkg import *\n';module,IMPORT unsupported unit/limitation;Code/Syntax PARTIAL.
  - class-python:Source 'class Box:\n pass\n';module,no inventedTYPE,function facetPARTIAL/UNSUPPORTED_CLASS_SCOPE;Code/Syntax PARTIAL.
  - malformed-python:copy original syntax-dynamic-malformed-oracle/calibration Source and independent raw fact/Syntax payloads;keep warning/UNKNOWN;declare uncertainCode facetsPARTIAL,SyntaxPARTIAL,never relabel success.
  - dynamic-python:copy syntax-initial-absence-oracle/calibration/app.py and independent fact/Syntax payloads;Code2nodes/1importedge,5Syntax;Code COMPLETE,Syntax PARTIAL.
  - java-only:complete v5 JavaSyntax reference with supplied exact owners,no v5Code facts/coverage;Code NOT_APPLICABLE,Syntax COMPLETE. Independently author companion fullJava v2 request/events and Canonical expectation for exactly that Java Source/projection;all requested capability coverage included. Retain Source/owner/fact binding.
  - mixed:combine that Java reference and alias-reference Python under one Source target and private unit owner binding,sorted file groups;v5Code coversPython only,COMPLETE/COMPLETE. CompanionJava v2 reference remains separate;do not invoke a new snapshot adapter or send duplicate native observations to FactMerger.
- [x] Record exact original SHA for every reused Source/fact/Canonical artifact;review every newly authored Source-to-fact/coverage decision. Reusing old payloads is documentary provenance,not upgrading an oldv4 success into v5 qualification. Preserve old roots/16Source unmodified.
- [x] Canonical expected may copy independently frozen old goldens only when identity/context match;otherwise independently author literal normalized facts using published ID/FactKey encoding,not product normalizer output. Mark Java/mixed references contract-only,not real complete extraction proof.
- [x] Verify existing .gitattributes phase1 **/\*.py/**/_.java/\**/_.jsonl -text rules cover every new raw file;no attribute/globalconfig/EOL rewrite. Format only new allowed JSON/Markdown files before freeze;preserve rawSource/.jsonl as authored. Save raw SHA for all new files in task1-fixture-before-product-freeze.json,including companionJava v2 artifacts. Later additions get a separately dated freeze before first consuming test.
- [x] Create new test importing * as api and assert.equal(typeof api.validateCodeSyntaxObservationStream,'function'). Build Providers,run node --test --test-concurrency=1 packages/providers/test/native-code-syntax-ipc.test.mjs. Save actual undefined-versus-function RED;build failure is not valid RED.
- [x] Save exact before snapshots of index.ts,workspace assertion andpackage.json;Task1 deliverable is frozen oracle plus RED,not implementation complete.

## Task 2: Strict v5 parsing and common context validation

**Depends on:** Task1 freeze/RED.
**Interfaces:** Implement private readRequest/readEvents and public function/return type above;correspondence added in Task3. Add only two exact index exports.

- [x] Write tests before product: 'raw v5 request binds exact bytes','old versions never fall back','unknown codeContract/authority fields refused','unsafe byte inputs do not run user code','fatal UTF8 and exactLF framing','raw request/output checksum mismatch','exact outcomes/counts/keys and deep-freeze'.
- [x] Assertions:valid frozen streams equal expected request/events/counts/checksum/outcomes;Object.keys(result).sort() exactly [checksum,codeOutcome,counts,events,outcome,request,requestChecksum,syntaxOutcome] (eight keys);input bytes unchanged and independently mutable after call;all returned nested objects/arrays frozen.
- [x] Mutations:version4/1 request=>INCOMPATIBLE_PROTOCOL_VERSION;missing/extra codeContract or publish/ready=>INVALID_REQUEST;Proxy/plain object/subclass rejected without getter/trap invocation;BOM/CR/noLF/truncated/multiple-request lines/invalidUTF8 rejected. Escaped lone surrogates in request fingerprints/keys=>INVALID_REQUEST andoutput reasons/keys=>PROTOCOL_CORRUPTION;valid astral strings remain valid. Raw output unknownversion/extra keys/sequence/terminal/binding/count/hash mismatch=>PROTOCOL_CORRUPTION. Failure terminal surfaces exactly its controlled code;no raw sentinel/message leak.
- [x] Reuse existing request/Source/owner schema and old context checks through the private validated view;testforeignrepo/revision/snapshot,Source path/ID duplicates,SECRET/nonTEXT/OTHER/unregistered language,active/provisional owner digest mismatch. Repaired hash cannot repair foreign context.
- [x] Run new tests and retain true missing-API RED. Implement minimal local schemas/readers/error translation,then append validator and type exports. Do not export incomplete/private helpers.
- [x] Freeze/validate actual raw request SHA before output verification. Reject hard bounds before decode;check request's maxInputBytes and fullv5 depth/Unicode even though reusable v4-view checks a smaller object.
- [x] Read output LF chunks sequentially with running byte/event count and SHA rather than split/map allocating all decoded lines up front;count newly introduced coverage records and all diagnostics/terminal bytes. Validate events sequentially,return only after final terminal.
- [x] Run Providers build and named Task2 tests:exit0/fail0. Task3-specific tests are not called green until its checks exist;retain their RED separately.

## Task 3: Coverage/correspondence/outcomes and independent omission controls

**Depends on:** Task2 strict framing/context.
**Interfaces:** Implement validateCorrespondence;public result fields unchanged.

- [x] Write named tests:'all fixed seed decisions match independent expected','missing/duplicate/foreign facet refuses','emptyPython requires module','Java has no implicitCode proof','function declaration encloses name range','alias and reference multiplicity close','Code/Syntax partial stay independent','resealed omitted function remains oracle mismatch'.
- [x] Coverage assertions:exactly four facets perPython file and oneSyntax coverage perrequested file;noCode facet onJava;complete module=>onepath-qualified module,eligible/covered1;fact/owner/ref identities unique and file-local;same target/provider/snapshot;eachCode fact andcovered count correspond perclarifications4..7. Negative stats,-0,unbalanced sums,nonzero declaration resolution counts,wrongedge resolution counts,unsupported/partial units claimedCOMPLETE refuse.
- [x] Positive enclosing-span control uses actual function name span and larger DECLARATION span;equal/unrelated/foreign owner isn't guessed by proximity. Include nested array/object references and repeated identical hints with distinct edge spans;every covered occurrence consumed once. Extra edge/unmatched complete occurrence or duplicate semantic count refuses.
- [x] Empty/no-files/Java-only responsibilities assert DCP outcomes;allCodeCOMPLETE+SyntaxPARTIAL=>PARTIAL;CodePARTIAL+SyntaxCOMPLETE=>PARTIAL;unsupportedSyntax=>PARTIAL;missingcoverage=>corruption,notpartial. Class/wildcard literal expected decisions retainPARTIAL.
- [x] Testfile order and intra-file phases;globalnullrange diagnostic allowed only after all files;foreigndiagfile anddata afterterminal refuse.
- [x] Reseal mutations using test-only stdlib helper with actual sequence/count/SHA repair:omitmodule=>corruption;omitfunction but leave declaration/count obligation=>corruption;omitfunction AND declaration AND corresponding claimedunit,rebuildcoverage/outcomes=>may returnstructuralSUCCEEDED,but raw full-output comparison against independently frozen Source-oracle must reportdifferent. Same for an omitted import/reference with all corresponding visible claims removed. Never assert a pure validator discovers Source it did not read.
- [x] Mutate onlyremoved orresourceBudget whileoldowner-map unchanged:requestChecksum differs;oldstart/terminal binding refuses;independently resealed validscope may passstructure without authenticating removal/history.
- [x] Implement only declared structural checks;use existingPython normalizer forfact grammar/closure without emittingCanonical authority. Scalar tuple sorting,per-file indexes andsmallprivateinterval/multiset matching;no cached adjacency matrix/general graph matcher.
- [x] Run all new contract tests plus oldv4/owner/budget/Python tests:exit0/fail0/no newskip/TODO. Rehash initialFixture/oldSource roots. No Rust/source extraction/Native read is implied.

## Task 4: Register, verify bounded scope and synchronize evidence

**Depends on:** Task3.
**Interfaces:** Consume frozen seeds and validator;produce one registration,exact index assertion,author review and receipt.

- [x] Write registration assertion in new test,observe REDbefore editing root script. Register new test once next to oldnative-syntax-ipc test.
- [x] Update test-workspace-structure exact Providers index string by appending only the two export lines;all old entries/assertions stay byte-identical within expected string. Record initial shell failure as expected export-contract RED,not an old product regression.
- [x] Execute exact planned commands below sequentially,save full outputs/exit codes and actual counts. Verify original47registry IDs retained;exact difference one newID,total48/exact22Phase1 if no independently authorized addition. Syntax profile catalog remainsempty.
- [x] Review full owned diff/spec/ReviewFocus as author,clearly mark no independent review. Confirm noSource IO/clock/spawn/storage/network/caller/advertisement/dependency/number change and no deferred capability.
- [x] Recheck initial newFixture freeze and all prior receipt paths;only declared index/newtestregistration/workspaceassertion/newmodule/docs/compiledoutputs/ownledger changes allowed. Preserve every originalSource/Fixture/oldfailure/oldreceipt.
- [x] Update CURRENT_STATUS,WBS,acceptance,trace,ADR-020 and affected spec/scalability notices with fresh LOCAL_OFFLINE_CONTRACT evidence only. NoB0b-2/B1/C orPhase closure.
- [x] Save implementation-verification.json and author implementation review;format/check only owned files,scoped gitdiff check,no cleanup/stage/commit/push.

### Exact local validation (planned, not run by this planning turn)

Run in original C worktree. Reuse currentmatching IR/Evaluation dist;build only their existing localTSprojects if source-hash evidence shows stale/missing prerequisites. No installation/rootbuild.

    pnpm --filter @codeatlas/providers build
    node --test --test-concurrency=1 packages/providers/test/native-code-syntax-ipc.test.mjs packages/providers/test/native-syntax-ipc.test.mjs packages/providers/test/native-syntax-owner-binding.test.mjs packages/providers/test/native-syntax-budget.test.mjs packages/providers/test/python-source-normalizer.test.mjs packages/providers/test/python-normalizer.test.mjs packages/providers/test/canonical-fact-identity.test.mjs packages/providers/test/java-node-normalizer.test.mjs packages/providers/test/canonical-normalizer.test.mjs packages/providers/test/native-ipc.test.mjs packages/providers/test/native-ipc-v2.test.mjs packages/providers/test/native-ipc-v3.test.mjs packages/providers/test/fact-merger-input.test.mjs packages/providers/test/fact-merger-selection.test.mjs packages/providers/test/fact-merger.test.mjs scripts/test-syntax-initial-absence-oracle.mjs scripts/test-syntax-java-owner-oracle.mjs scripts/test-syntax-mixed-provisional-oracle.mjs scripts/test-syntax-dynamic-malformed-oracle.mjs scripts/test-syntax-nested-source-oracle.mjs scripts/test-syntax-bounded-output-oracle.mjs scripts/test-syntax-changed-only-oracle.mjs packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs scripts/test-workspace-structure.mjs
    node scripts/check-architecture.mjs

Expected:build0;25namedfiles fail0;architecture17;registry48/exact22/catalog0. Actual testcount fromlogs only. Existing junction/symlink environment skips disclosed andtheir gates remainopen. Registry tests create/clean only mkdtemp-owned resolved temp directories. No peak-collector,C2process orbinary/Rust suites.

Boundary tests derive one-byte/one-event below/equal/above values from frozen actual raw lengths/counts and existing hardlimits,not guessedGate numbers. Depth andmaxItems/maxDuration/Memory shape/binding tested separately from actual traversal/time/memory,which remainNOT_RUN.

### Traceability / exit

| DCP obligation                                              | Task/test/Fixture                                      | Gate not claimed                                   |
| ----------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------- |
| §4 fixedSource projection /MODULE/FUNCTION/IMPORT/REFERENCE | Task1seeds;Task3coverage/owner/multiset                | RealSourceinventory/extraction                     |
| §5 rawv5binding/strictcompatibility                         | Task2rawbytes;Task3repairedbinding controls;oldIPC1..4 | Productionnegotiation/profile                      |
| §5 dualoutcomes/empty/correspondence                        | Task3fixeddecisions/omissioncontrol                    | Independenttruth orApply                           |
| §7 independentSource/fullrawexpected                        | Task1preproductfreeze;Task3exactoracleinequality       | ActualRustproducer/measurement                     |
| §8/9security/governance                                     | Task4architecture/export/registry/docs/receipt         | B1snapshot/history/atomicStore,Cactualchild,Phase1 |

Task1→2→3→4 is sequential;no independent implementation justifies parallel work.
First executable action after confirmation:verify this plan-review receipt/capture exact beforefiles,author/freeze Task1references,then export RED.

Status: user confirmed this B0b-1 concrete plan on 2026-10-24; Tasks1..4 complete for LOCAL_OFFLINE_CONTRACT only. Fresh evidence: Providers build0;25 named files436PASS/fail0/skip0/TODO0;architecture17;registry48/exact22Phase1/catalog0. See implementation author review and implementation-verification.json. B0b-2/3,B1/C,C1file-symlinkEPERM,root/integration/independentreview/CI,P1-04/05/Phase1OPEN. FourC2lifetimes spent;historicalNative timeoutUNKNOWN;maincancel not re-queried.

## Execution closure — 2026-10-24

Completed sequentially in original worktree after confirmation. Task1:44 independent frozen files/12 seeds/Java v2 companion and actual missing-export RED. Tasks2/3:99 initial missing-API RED;first build failed on branded Map-key inference,then explicit string lookup keys restored build;107 final new tests pass. Task4:registration0-versus1 RED and exact-export assertion RED retained;one registration/two export lines added. First25-file regression435PASS/1 stale-document failure retained;governance synchronization yielded436PASS/0fail/0skip/0TODO andarchitecture17. No old test weakened. Registry/freeze/predecessor evidence is recorded in implementation-verification.json.

Approved method rulings:manual receipts rather than commit-coupled helpers(no committed review range);author review and scoped local verification(no independent/full integration proof). Existing worktree/no cleanup/no stage or commit retained. No Native/helper/DB/CI/new dependency or profile. B0b-2 requires its own reviewed concrete design/plan.
