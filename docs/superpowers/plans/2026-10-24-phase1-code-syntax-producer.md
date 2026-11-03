# B0b-2 Library Producer and Bounded Consumer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans, inline in the existing C worktree/session, sequentially. Use TDD,systematic-debugging for unexpected failures,author code review under the preserved method,and verification-before-completion. No new subagent/session/worktree,stage,commit or cleanup of existing evidence.

**Goal:** Implement only the accepted isolated v5 library producer and no-spawn TS bounded reader,proved against independently frozen Source/output oracles.

**Architecture:** Keep old wire entry points and results unchanged. Reuse private common request/payload and analyzer paths;collect Code obligations during Source enumeration and emit a distinct v5 stream. The reader snapshots request bytes and always calls the existing purevalidator before returning a frozen candidate.

**Tech Stack:** Existing Rust2024/serde_json/sha2/cap-std/tree-sitter dependencies,TypeScript/Zod,Node24 Buffer/Readable/AbortSignal/node:test. No dependency,CLI or profile changes.

**Spec:** [accepted B0b-2 design](../specs/2026-10-24-phase1-code-syntax-producer-design.md), [B0-b contract](../specs/2026-10-23-phase1-b0b-completeness-proposal.md).

## Global Constraints

- Worktree C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas;HEAD cc5a8cb571986c5e56ed04053b2c96ef500fcacb,branch codex/p05-integrated-exit-audit. D:/workspace main is not the implementation checkout. Preserve all local changes/EOL,old .superpowers/Fixture roots;no reset/stash/stage/commit or .pnpm-store submission.
- Pure protocol5/OBSERVE_CODE_SYNTAX/PYTHON_SYNTAX_CODE_V1 remains isolated. No Native CLI route,DESCRIBE advertisement,spawn/helper/acquisition/measurement/calibration,Runtime/Source policy,one-Native-snapshot adapter,B1 history/retained support/atomicApply,R011/IR migration,newnumber/profile/dependency or cloud operation.
- Preserve Canonical independence,SQLite authority,LLM candidate-only,AUTO/MANUAL andExecutionGraph → RuntimeFlow → BusinessFlow;all P1-04/05/Phase1 gates remain OPEN.
- Old IPC1..3/v4 strict versions/fields/errors/raw outputs/identity/work counts and all old Source/Fixture bytes stay unchanged. New v5 fixes are not permission to repair old Python semantics.
- Reuse existing request/hard limits and SyntaxWalkControl;request+Source bytes and visitor work aggregate acrossfiles. maxEvents is not maxItems,maxMemoryBytes shape is not observed peak. No invented numeric threshold/default.
- Only after this concrete plan is confirmed:local TS builds/tests and named Rust **library test harnesses** below are authorized. They are not Native CLI/acquisition-helper/profile runs. Cargo may compile its automatic binary target while building integration tests;that artifact is not executed or qualified. The existing source_access junction test alone may invoke cmd /C mklink /J inside its exclusively owned test directory;this OS-fixture setup is explicitly included,not an extra C2 acquisition lifetime. Offline/locked Cargo must fail closed on missing dependencies;no install/fetch/unlock fallback. Sequential jobs;no root test/verify or cloud writes.
- C1symlinkEPERM OPEN,fourC2lifetimes spent,timeout root causeUNKNOWN,main39708335128 cancellation not re-queried,R4mutable DB untouched.

## Review Focus

1. Invalid dictionary after an earlier reference must not leak unmatched Code edges/statistics into a v5 stream;old v4 stays unchanged (Task3).
2. Per-file event order is not enough:request+Source input and work aggregate acrossfiles,while tiny output budgets may not fit even a failure terminal (Task4).
3. A million tiny chunks must not allocate an unbounded list;request mutation,abort during pending read and cleanup/error settlement must not return success (Task5).
4. Java unit IDs/JS encoding from B0b-1 are not producer goldens;expected fullwire and actual request binding must be authored independently,including owned-root substitution (Tasks1/6).
5. Failed or short writes must never be followed by retry/success,and raw/parsed memory overlap must not be labeled measured or qualified (Tasks4/5/6).

## File map and fixed private interfaces

| Path                                                                        | Change / responsibility                                                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| crates/native-analyzer/src/code_syntax.rs                                   | New strict v5 request/error reuse/library entry;public module                                                  |
| crates/native-analyzer/src/code_syntax_producer.rs                          | New v5 writer/budget/settlement;private module                                                                 |
| crates/native-analyzer/src/lib.rs                                           | Add pub mod code_syntax; and mod code_syntax_producer; only                                                    |
| crates/native-analyzer/src/syntax.rs                                        | Extract private common payload value validation,retain exact v4 outer gates and existing public types/exports  |
| crates/native-analyzer/src/python.rs                                        | Private shared payload observation core,v5-only Code tracking and value atomicity;old observe unchanged        |
| crates/native-analyzer/src/python/code_syntax_tests.rs                      | New internal collector tests,not an exported analyzer API                                                      |
| crates/native-analyzer/src/java_syntax.rs                                   | Private payload observation entry for v5;old observe delegates unchanged                                       |
| crates/native-analyzer/tests/code_syntax_request.rs                         | New Rust request matrix                                                                                        |
| crates/native-analyzer/tests/code_syntax_producer_unit.rs                   | New owned-Source/writer/error/budget tests                                                                     |
| crates/native-analyzer/tests/code_syntax_oracle.rs                          | New full independent raw oracle comparisons and explicit artifact capture                                      |
| packages/providers/src/native-code-syntax-request.ts                        | Move private v5 request schema/byte/data validation and snapshot;no index export                               |
| packages/providers/src/native-code-syntax-ipc.ts                            | Consume shared private request functionality;existing public API/result unchanged                              |
| packages/providers/src/native-code-syntax-stream.ts                         | New package-private bounded Readable consumer;no spawn/no index export                                         |
| packages/providers/test/native-code-syntax-request.test.mjs                 | New private request snapshot/parity tests                                                                      |
| packages/providers/test/native-code-syntax-stream.test.mjs                  | New memory-stream/framing/abort/ownership tests                                                                |
| packages/providers/test/fixtures/code-syntax-producer-helpers.mjs           | Fixture loading and independent template instantiation only;no expected generation by product                  |
| scripts/test-code-syntax-producer-oracle.mjs                                | Offline new Fixture/full-stream/Canonical checks;always executable without captured artifacts                  |
| scripts/check-code-syntax-library-output.mjs                                | Explicit required library-artifact cross-consumer check;missing artifacts fail,never skip                      |
| fixtures/phase1/code-syntax-producer-oracle/                                | New Manifest,18case source/request/event/Canonical templates,provenance/serialization contract                 |
| package.json                                                                | Register exactly the two new Node tests and offline Fixture script next to B0b-1;no root verification executed |
| Accepted design/ADR-020/handoff/specs/scalability,new implementation review | Fresh bounded evidence;all production/phase gates remain open                                                  |

Index.ts,test-workspace-structure.mjs,Cargo manifests/locks,protocol.rs,native-client.ts,Source access implementation,IR/SQL/profile/catalog and old Fixture files are not modified. Tests may use existing Source access behavior,not weaken its guards.

Rust fixed interfaces:

- `pub struct CodeSyntaxRequest` has private header/raw byte length/checksum;`pub fn header(&self)->&Value`, `pub fn request_checksum(&self)->&str` read-only accessors.
- `pub fn decode_code_syntax_request(bytes:&[u8])->Result<CodeSyntaxRequest,SyntaxRequestError>` reuses existing controlled error type/code.
- `pub fn write_code_syntax_observation(request:&CodeSyntaxRequest,control:&SyntaxWalkControl<'_>,output:&mut impl Write)->io::Result<()>` re-exported from code_syntax.rs.
- `pub fn serve_code_syntax_request(bytes:&[u8],control:&SyntaxWalkControl<'_>,output:&mut impl Write)->io::Result<()>`;no from_budget or CLI dispatch entry in this batch.
- `syntax::validate_common_payload(payload:&Value)->Result<(),SyntaxRequestError>` is pub(crate),checks shared values/context/owner-map only. Exact version-specific outer/payload fields,actual raw byte limit and whole-request depth remain each decoder's responsibility. Existing error constructor/check helpers may become pub(crate),not public/new hierarchy.
- Python private `observe_payload(&mut self,p:&Value,index:usize,source:&[u8],control:&SyntaxWalkControl<'_>,code:bool)->Result<CodeSyntaxFileObservation,AnalyzerError>`;`CodeSyntaxFileObservation` is pub(crate) under code_syntax with `{syntax:SyntaxFileObservation,code_coverage:Vec<Value>}`. Existing public observe passes false/returns syntax;v5 calls a pub(crate) observe_code_syntax wrapper passing true. Boolean is private two-path selection,not a user option.
- Java `pub(crate) fn observe_payload(&mut self,p:&Value,index:usize,source:&[u8],control:&SyntaxWalkControl<'_>)->Result<SyntaxFileObservation,JavaSyntaxError>`;old observe delegates with its unchanged validated payload.

TS fixed interfaces (package-private,not index):

- `CodeSyntaxRequestSchema` and inferred `CodeSyntaxRequest` move unchanged to native-code-syntax-request.ts.
- `readCodeSyntaxRequestSnapshot(requestBytes:Uint8Array):{readonly bytes:Buffer;readonly request:CodeSyntaxRequest;readonly requestChecksum:string}` owns a copy before any await;buffer never leaves private pipeline/public result.
- `copyCodeSyntaxBytes(value:Uint8Array,limit:number,code:NativeIpcErrorCode):Buffer`, `assertCodeSyntaxData(value:unknown,maxDepth:number,code:NativeIpcErrorCode):void` move current implementations without relaxing checks. Request-only decode stays private. Existing event schemas still consume the same request schema shape.
- `consumeCodeSyntaxObservationStream(requestBytes:Uint8Array,stdout:Readable,signal:AbortSignal):Promise<ValidatedCodeSyntaxObservation>` owns only this Readable consumption;no stderr/profile/authority/result fields added.

## Task B2-01: Independent producer oracle and pre-change baseline

**Depends:** user confirms this plan. **Produces:** frozen Manifest18-case references,provenance/raw hashes and before snapshots for all modified product/registration files.

- [x] Verify full plan-review receipt first;capture HEAD/branch/common-dir and .codegraph existence,all declared beforefiles,old registry IDs48/exact22/catalog0 and old44/16Source/priorFixture hashes. Do not repeat old regressions or calibration to establish a document baseline.
- [x] Independently author `p1-code-syntax-producer-oracle-v1` Manifestv1,phase1/code-intelligence,empty languages/frameworks,capability CODE_SYNTAX_LIBRARY_ORACLE_ONLY,empty legacycriticalfacts/qualitygates. New Fixture is contract/library evidence,not new language support or Phase1 pass.
- [x] Freeze exactly18 case IDs: no-files,empty-python,comment-python,wildcard-python,class-python,nested-python,malformed-python,dynamic-python,alias-reference-python,async-python,java-only,mixed,multi-import-from,nested-repeated-values,class-owner-gap,unicode-control,two-python-files,discarded-dictionary.
- [x] First12 Source semantics derive from B0b-1/pinned old Source references;Java-only/mixed replace unit identities by independently encoded actual Java owner/Syntax IDs using frozen syntax-java-owner-oracle sources/provider-nodes/canonical references. Record original SHA for every copied input;never alter old files. No product import/producer/normalizer in author script,which is retained under own .superpowers/sdd workspace.
- [x] Extra Source literals: multi-import-from=`import pkg as p, other\nfrom lib import first as f, second\n`;nested-repeated-values=`x = [p, {"k": p}]\n`;class-owner-gap=`class Box:\n    x = p\n`;unicode-control exact source is the JSON string `"name = \"雪\"\ncontrol = \"\\t\"\n"`;two-python-files has a.py=`x = p\n`,b.py=`y = q\n`;discarded-dictionary=`x = {"k": p, **kw}\n`. Strings denote exact LF UTF8 bytes;final literal bytes are reviewed/frozen before product.
- [x] Freeze full v5 event templates,Code statistics/outcomes,Canonical expected and request templates. multi-import-from has4import covered units;nested-repeated-values2reference covered units;these are data counts,not gates. class-owner-gap has no classTYPE,no unmatchededge,knownreference eligible/unsupported1/1 with REFERENCE PARTIAL/UNSUPPORTED_OWNER. discarded-dictionary retains UNKNOWN UNSUPPORTED_DICTIONARY,does not publish the tentativep edge;known discardedp reference is eligible/unsupported (1/1),REFERENCE PARTIAL/UNSUPPORTED_VALUE_REFERENCE andSyntax PARTIAL. These are newv5 limitation strings on the existing free controlled-reason field,not a new error/IR kind or oldv4 correction. No invented resolvers,unknown→resolved upgrade or silent omission.
- [x] Freeze an additional independently authored old-v4 request/fullraw template for the discarded-dictionary Source under this new Fixture. It pins the currently existing tentativeedge/UNKNOWN behavior solely for backward compatibility,not correctness. Invoke the real oldobserve path with that separately authoredv4request;do not synthesize oldwire as an internalv5validation fallback. No oldFixture root is edited.
- [x] Serialization contract: Rust's existing serde_json BTreeMap object ordering,no preserve_order feature change;author freezes UTF8-key-ordered literal rawlines with known integer/f64 lexical forms from old references (score1 versus NUMBER.value1.0 must remain distinct). Use request.template.jsonl with exactlyone declared rootPath stringtoken,events.template.jsonl with declared requestSHA/terminalSHA stringtokens and all other bytes frozen. Instantiate by replacing only those exactJSONstringtokens with stdlib-encodedroot/checksum strings after assertingtokenlocations/counts. Never parse-and-reserialize expected events:that would erase numberlexemes. Compute requestSHA from actual instantiatedrequestbytes andterminalSHA from frozen instantiatedpreterminalrawlines. No actualoutput is normalized/reordered/de-fielded to match. If serialization/identity assumptions conflict,diagnose;do not regenerate expected from producer.
- [x] Budgets copy the matching old Source requests;use existing bounded-output reference allowance only for larger references with provenance. No new default/profile number. Record -text attributes covering every new py/java/jsonl;format metadata before freeze,then SHA all new Fixture bytes. No product changes before this freeze.
- [x] Add new offline Fixture test before product;API absence may initially produce import/compile diagnostics. Record those as API-absence RED only,not behavioral success/failure proof. Each later task must additionally show its named runtime behavioral RED on an implemented boundary.

## Task B2-02: Strict Rust v5 and shared context parity

**Depends:**01. **Files:** code_syntax.rs,lib.rs,syntax.rs,code_syntax_request.rs;TS private schema/snapshot extraction and native-code-syntax-request.test.mjs are done here so both later sides share a fixed request boundary.

- [x] Write tests named `v5_raw_request_checksum_includes_lf_and_whitespace`,`old_versions_do_not_fall_back`,`strict_fields_and_context_match_ts`,`snapshot_owns_actual_bytes_before_await`;assert raw SHA from independently frozen request,exact original header,no authority fields,and unchanged caller bytes.
- [x] Preserve missing-export/import RED;after minimal callable boundary exists,run valid-request assertion and record actual INVALID_REQUEST-versus-accepted RED before implementing parser. This distinguishes missing API compilation from behavioral RED.
- [x] Extract common payload semantics from syntax.rs without moving v4 fields/version checks into a permissive version flag. New decoder validates exactly5/OBSERVE_CODE_SYNTAX/codeContract,LF/framing/UTF8/scalar data/depth/actual bytes,then common semantics and owner-map. No synthesized v4 raw request or copied old output.
- [x] Matrix includes wrongversions1..4/6;wrong/missing/extra contract,foreignrepo/revision/snapshot/owner digest,duplicate/overlap source IDs/paths,SECRET/BINARY/OTHER/unregistered language,unsafe numbers/-0/Unicode,CR/BOM/noLF/trailing record,request boundary/depth neighbors. Shared negative expectations equal current TS contract codes,not simply both reject.
- [x] Move TS request schema/copy/data logic to fixed private module,add actual raw `bytes` snapshot. Keep existing public validator signature/eight keys/error mapping/deep freeze,index exactly unchanged. Never export request/parser helpers via index.
- [x] Verify Node named request+existingB0b-1 tests after Providers build and Cargo named request tests;oldsyntax_request_fixtures must pass. Record both behavioral RED/GREEN and hashes of old request fixtures.

Example assertions for the frozen request test (raw is read directly from the frozen request template,with only its declared owned-root substitution):

```rust
let request = decode_code_syntax_request(&raw).expect("frozen v5 request");
assert_eq!(request.request_checksum(), format!("{:x}", Sha256::digest(&raw)));
assert_eq!(decode_syntax_request(&raw).unwrap_err().code(), "INCOMPATIBLE_PROTOCOL_VERSION");
```

## Task B2-03: Source-enumerated Code coverage and compatibility

**Depends:**02. **Files:** python.rs,python/code_syntax_tests.rs,java_syntax.rs,private CodeSyntaxFileObservation.

- [x] First pin old observe output/work against already-frozen v4 cases;write v5 tests `wildcard_is_an_unsupported_import_unit`,`class_never_proves_complete_function_scope`,`nested_async_declarations_keep_ids_and_owners`,`repeated_values_have_distinct_occurrences`,`discarded_dictionary_has_no_orphan_edges`,`java_payload_entry_keeps_original_owner_validation`. Record v5 named assertion RED,not an old fixture rewrite.
- [x] Reuse one Python parser/tree and existing Collector;v5-only optional Code tracking duringdeclare/walk/value/edge emission. Keep old observe wrapper,errors,identity encoder,ticks and result schema unchanged. Extra v5 bookkeeping checks control/depth/work;no uncharged full Source pass or genericcollector/protocol framework.
- [x] MODULE one perPython includingempty/comment;FUNCTION declarations/owner/name span/nesting/async;IMPORT enumerateall explicititems/fromaliases,wildcardeligible/unsupported with UNSUPPORTED_WILDCARD_IMPORT;classFUNCTION PARTIAL with UNSUPPORTED_CLASS_SCOPE. Syntaxerror marks unreliable facets PARTIAL/SYNTAX_ERROR,never deletes a unit to claim completion. Match resolution distribution to emitted edges.
- [x] v5 value publication is atomic:tentative referenced values that become an unrepresentable enclosing dictionary cannot leave edge/covered counts without matching Syntax values. Known discardedp is kept as unsupported obligation per01;do not shrink eligible count based on emittedfacts. Old v4 path deliberately retains its existing behavior. Compare the same discarded-dictionary Source through both paths against their separately pre-frozen expectations,plus alloldoracles. Compare whole v5 output/Canonical and old whole v4 output,not just counts.
- [x] Java observe delegates to private payload core with identical work/owner/IDs;v5 producesSyntaxonly. Supplied owner not found among actual Java declarations remains INVALID_REQUEST;missing/foreign owner cannot be guessed by name.
- [x] Run new internal `code_syntax` lib tests plus existingpython_syntax_unit/java_syntax_unit/python_grammar_compatibility and old raw Source oracle tests. Failures involving new Fixture/design assumptions use governance;no old baseline weakening.

The wildcard test's fixed coverage assertions are data counts for its frozen single-wildcard Source:

```rust
let import = &v5.code_coverage[2];
assert_eq!(import["facet"], "IMPORT");
assert_eq!(import["status"], "PARTIAL");
assert_eq!(import["statistics"]["eligibleSites"], 1);
assert_eq!(import["statistics"]["unsupportedSites"], 1);
assert_eq!(import["statistics"]["coveredSites"], 0);
```

## Task B2-04: Bounded v5 library writer/settlement

**Depends:**03. **Files:** code_syntax_producer.rs,code_syntax.rs,code_syntax_producer_unit.rs,code_syntax_oracle.rs.

- [x] Write `full_output_equals_independent_wire_oracle`,`request_and_all_sources_share_input_budget`,`work_is_aggregate_across_two_files`,`event_limit_is_not_work_limit`,`short_write_settles_without_duplicate_record`,`failed_sink_is_never_retried`,`failure_may_not_fit_tiny_budget`. Assertions include exact rawbytes/sequence/counts/checksum/binding and no completed after failure.
- [x] Record actual behavioral RED for missingCodecoverage/wrongbinding/settlement before implementation. Reuse read_verified_source,scope only declaredsourceFiles,UTF8path/id order,request+Sourcebytes cumulative and checked subtraction of actualv5 work_items. Removed paths/poison directories are never read.
- [x] Emit exactv5 types,Code facets,dual outcomes and sixcounts;hash actual writtenLF records,echo requestchecksum. Reserve onefailureevent slot duringnonterminal emits;budget terminal bytes honestly. A budget too small for failure returns io::Error with no completed;no quota exception or retry. `write_all` handles ordinaryshortwrites;permanent/zero-write errors stop with no secondrecord attempt.
- [x] Before parser/work/writes check cancellation/deadline;on Source_CHANGED/path/link/budget/parser/grammar errors use existing controlled codes/messages. A recognized invalidrequest may emitREQUEST_FAILED;untrustedidentity/framing returnsInvalidData without echo. Never continue a broken sink or partially failed observation into success.
- [x] Test actual owned Source fingerprint mismatch,missingfile,traversal/rootescape/link controls,second-file limits,alreadycancelled/expired control,outputevent/line/byte exact and neighbors. Use existing test-owned exclusive tempdirs and resolved-parent/name guard beforecleanup;do not touch host-managedworktrees or prior evidence. C1file-symlinkcreationEPERM remains documentedunavailable,not a fabricated pass or replacement proof.
- [x] The oracle runner exports only when CODEATLAS_CODE_SYNTAX_LIBRARY_OUTPUT_ROOT names a newly created exclusive directory inside this task's evidence workspace. Use create_new perartifact,request.jsonl/events.jsonl/expected.jsonl/manifest.json percase,includinghashes;never overwrite an old run. No Native CLI/acquisition-process or collector is invoked. TemporarySource cleanup cannot delete captured raw evidence. Capture manifest exactkeys: schemaVersion=1,executionKind=RUST_LIBRARY_TEST_ONLY,measurementEligible=false,caseId,requestFile=request.jsonl,eventsFile=events.jsonl,expectedFile=expected.jsonl,requestSha256,eventsSha256,expectedSha256. Digests are lowercaseSHA256 ofactual respectivebytes,not claimed production identity. Artifact files andmanifest use create_new;checker confinesfixedfilenames underownedroot andvalidatesexactkeys/hashes before readingcross-consumerdata.

Full-oracle assertion is raw-byte equality,not selected-field agreement:

```rust
assert_eq!(actual_output, independently_instantiated_expected_raw);
assert_eq!(terminal["payload"]["requestChecksum"], request.request_checksum());
```

## Task B2-05: Bounded no-spawn TS reader

**Depends:**02 interface;execute after04 bypreservedsequentialmethod. **Files:** native-code-syntax-stream.ts,native-code-syntax-stream.test.mjs.

- [x] Tests import the private dist module directly;index remains identical. Write `whole_wire_and_every_split_return_same_frozen_result`,`single_byte_chunks_have_bounded_retained_metadata`,`mutated_caller_request_does_not_change_binding`,`abort_during_pending_read_destroys_owned_readable`,`errors_remove_abort_listeners_and_never_return_partial`,`request_failure_reads_zero_output_bytes`.
- [x] Record runtime RED from a callable wrong/absent-reader result,not only missing-file import. Build onlyProviders. MemoryReadable tests never spawn helpers,read Source or access DB.
- [x] Snapshot/check request andpreaborted signal beforeallocation/read. Allocate one contiguous Buffer with capacity min(request.maxOutputBytes,existinghardmaxStdoutBytes);scanLF/event/line length whilecopying incoming bytes afterremaining-capacity checks. No chunk-array growth or extra framing defaults. Single-byte tests use frozenactualwirelength,not a new stress/performancegate.
- [x] Incremental overflow/CR/truncation/trailing/newline errors refuse;atEOF call existing publicpurevalidator on exactprivate requestbytes andbounded rawsubview. No reconstructedrequest/parsed-event-onlyshortcut. Return exactsame eight frozenfields,no stderr/ready/profile/publication data.
- [x] Reader owns consumption:attach abortlistener once;onabort destroy passedReadable andsettleCANCELLED;onreaderror settleNativeClientError PROCESS_FAILED;oncontracterror preserveNativeSyntaxContractError code. In finally removeownlistener anddestroyunfinishedread,never attachprocesslisteners/kill logic. Tests ensure cleanup/settlement once and no leakedunhandled error;actualchildexit remainsunproved.
- [x] Existing raw+parsedbuffer overlap andprivate per-filematchingcost remain disclosed;no performance/profileclaim. Run newreader/request andalloldB0b-1 tests,withassert.equal(indexbytes,beforeindexbytes).

A complete-stream assertion consumes frozen bytes with a standard in-memory Readable:

```javascript
const actual = await consumeCodeSyntaxObservationStream(
  requestBytes,
  Readable.from(chunks),
  signal,
);
assert.deepEqual(actual, validateCodeSyntaxObservationStream(requestBytes, expectedOutputBytes));
assert.ok(Object.isFrozen(actual));
assert.deepEqual(Object.keys(actual).sort(), [
  'checksum',
  'codeOutcome',
  'counts',
  'events',
  'outcome',
  'request',
  'requestChecksum',
  'syntaxOutcome',
]);
```

## Task B2-06: Cross-consumer evidence,registration and final review

**Depends:**04+05. **Files:** two scripts,testhelper,package.json,governance+review+receipt.

Test-only helper interfaces: `loadProducerCase(id:string):Promise<{requestTemplate:Buffer,eventsTemplate:Buffer,expectedCanonical:unknown}>` and `instantiateProducerCase(id:string,rootPath:string):Promise<{requestBytes:Buffer,expectedOutputBytes:Buffer,expectedCanonical:unknown}>`. They read frozenfiles andperform only Task01 exacttoken/stdhash substitution,no product import or Source-derivedexpected generation. Offline script andartifactchecker reuse them;Rust runnerimplements the same fixed substitutions independently withstd/serde stringencoding/SHA only. Neither substitutes intoactualoutput.

- [x] Offline script loads18frozenreferences andindependentCanonicals;everyexpectedraw passes purevalidator/reader andexactdecision/Canonical assertions. Repairedomission/owner/stat/SHA negatives remain separate. Register exactlytwo newNode tests andoffline script in root teststring;write registrationassertions first andrecordRED. Do not register artifactdependentchecker in root(defaultmustnot silentlyskip).
- [x] Run Rustoracle capture once afternewlibrarybehaviorpasses. Node check-code-syntax-library-output.mjs takes exactlyan explicit ownedroot argument;reject absent/missing/hashmismatch/foreignpath artifacts,then compare actualbytes toindependentexpected andconsumeactualrequest/output withpure+reader. No normalization/filter/removalofchecksums from actualoutput,no product-generatedexpected,no auto-generation/skip/fallback. A failedrun is preserved;newrun only afteridentifiedcode/testcorrection,never blindretry.
- [x] Execute exactscopedcommandsbelow sequentially;save fullstdout/stderr/exitcounts. Expectedregistry49/exact23Phase1,one newID,all48oldIDsretained,catalog0. Verify actualcounts fromlogs,no inventedpassingtotals/newskiporTODO. Environment-constrainedsource-link check remainsopen andseparatelydisclosed.
- [x] Author reviewagainstaccepteddesign,ReviewFocusandall18Source/fullwire/Canonicalreferences. Manualreceipts/no committedrange andauthorreview/no independent/fullintegrationproof areexplicitrulings. No claim that maxMemory shape,deadlinedata or librarycancellation equals actualNative lifecycle/measurement.
- [x] Rehashallpredecessorpaths,initialnewFixturefreeze,old44andold16Source/Fixture roots;onlydeclaredprivateRust/TS/producttest/registration/docs/compiledoutputs/ownledger changesallowed. No Sourceaccess/oldwriter/dispatch/CLI/index/lock/profilechanges. Synchronize13governancedocuments/accepteddesign/plan/implementationreview/CURRENT_STATUS withfreshLOCAL_LIBRARY_CONTRACT evidence;B0b-3/B1/C/P1-04/05/Phase1remainOPEN.
- [x] Save finalimplementation-verification.json withexactcommands/counts/newrunidentity/artifactSHA,allfailures,limits,traceandmanualrulings;runownedformat/scopedgitdiffcheck,localdoclinks andfullreceipt rehash. No stage/commit/push/cleanup.

The explicit artifact checker must fail on a missing required case and compare captured bytes before invoking product consumers:

```javascript
assert.deepEqual(actualOutputBytes, independentlyInstantiatedExpectedBytes);
assert.equal(manifest.executionKind, 'RUST_LIBRARY_TEST_ONLY');
assert.equal(manifest.measurementEligible, false);
```

## Exact verification scope after plan approval (NOT_RUN now)

All in original C worktree,sequential. Commands use existing dependency cache only. Missingoffline dependencies/toolchain is a blocker to report,not permission to fetch/install or runcloudCI.

1. `pnpm --filter @codeatlas/providers build`.
2. `cargo test --locked --offline -p codeatlas-native-analyzer --lib code_syntax -- --test-threads=1` (new privatecollector tests).
3. `cargo test --locked --offline -p codeatlas-native-analyzer --test code_syntax_request --test code_syntax_producer_unit --test code_syntax_oracle --test syntax_request_fixtures --test syntax_producer_unit --test syntax_contract_fixtures --test syntax_dispatch_unit --test syntax_initial_absence_oracle --test python_syntax_unit --test python_grammar_compatibility --test java_syntax_unit --test source_access -- --test-threads=1 --show-output`.
4. Before command3,create one exclusive evidence root with mkdtemp under `.superpowers/sdd/2026-10-24-phase1-code-syntax-producer/library-output/` and set CODEATLAS_CODE_SYNTAX_LIBRARY_OUTPUT_ROOT only in that Cargo child environment. Its code_syntax_oracle target both verifies and captures in that single invocation;all other targets ignore this new variable. Then run `node scripts/check-code-syntax-library-output.mjs <same-explicit-absolute-owned-root>`. Save actualroot/commands/hashmanifest in the receipt. No second oracle invocation or duplicate batch for capture;the runner uses spawnSync argument arrays,not shell-builtcommands.
5. `node --test --test-concurrency=1` plus the25 exactB0b-1 filepaths in `.superpowers/sdd/2026-10-24-phase1-code-syntax-contract/planned-verification-command.json`,followedby packages/providers/test/native-code-syntax-request.test.mjs,packages/providers/test/native-code-syntax-stream.test.mjs,scripts/test-code-syntax-producer-oracle.mjs (28files total). Save expanded literalcommand in this task's planned-verification-command.json beforeapproval.
6. `node scripts/check-architecture.mjs` (expected17projects);exactregistrydiscoverFixtures delta/checkcatalog0;newandoldrawattributes/hashes;ownedPrettier/rustfmtcheck only. `rustfmt --edition 2024 --check` with exactlychangednewRustfiles,no cargo fmt whole-workspace rewrite.

Expected:all declared runnablecontracttests pass,buildexit0,architecture17,registry49/exact23/catalog0,oldbytesunchanged. ActualRust/Node testcounts andconstrainedlinkavailability must come fromlogs;no whole-regression/calibration/explicitNativeCLIbuild/CLIexecution/CI authority. Incidental Cargo compilation for these selected test targets is included,not production build/distribution qualification. Tests compilingthelibraryare allowedonlyafterthisplanreview,not by written-designapproval alone.

## Traceability / next boundary

| Design obligation                 | Task/Fixture/test proof                       | Not claimed                                |
| --------------------------------- | --------------------------------------------- | ------------------------------------------ |
| §2/3isolatedv5/private reuse      | 02requestmatrix,03oldobservecompatibility     | CLI/admission/fallback                     |
| §4Sourceenumeration/dualcoverage  | 01independent18cases,03collector,04fullraw    | Repositoryinventory/historyauthenticity    |
| §4budget/Source/security/failure  | 04writer/actualownedSource/librarycontrols    | ActualNativepeak/processrestart/timeoutfix |
| §5boundedreader/bytebinding       | 02snapshot,05chunk/abort/cleanup              | Childsettlement/constantmemory             |
| §6independentoracle/compatibility | 01freeze,06actualrawcross-consumer/oldoracles | Qualification/profile/productionready      |
| §7/8governance/completion         | 06receipt/registry/architecture/docs          | B0b-3/B1/C/P1-04/05/Phase1 exits           |

Status: user confirmed the concrete plan; B2-01..06 COMPLETE_LOCAL_LIBRARY_CONTRACT. Fresh evidence:500Node/105uniqueRust/18actual-librarycross-consumer/architecture17/registry49-exact23/catalog0. See implementationauthorreview and implementation-verification.json. First executable action afterplanconfirmation:verifyreceipt/capturebeforefiles andfreezeindependentB2-01oracle. User'sexistingsequentialmethodpersists;do notaskexecutionmethodagain.

## Execution closure / bounded deviations

Executed sequentially inoriginalCworktree. GenuineAPIabsence/runtimeRED andallold/newraworaclesretained. Two build attempts stopped before tests/capture (LNK1104 and LNK1105/Windows1224); exact failures and observations are retained, with root causes UNDETERMINED. Three successful captures reflect successive reviewed code revisions, not repeated status checks. Final depth-rust-private/integration logs prove 8+97=105 unique Rust tests; depth-capture-root.json selects the current 18-case output. C1OSlinkbranchesunavailable despiteharnessPASS.

Privatecommonpayload/ownermapcheckseparationpreservesolderrorprecedence;rawlinedecode shared privately;one Rusttestsupportfileavoidsduplication. ReaderProxy.thenfailurebelongsupstreamReadableassimilation,notunsafe requestcopy. Cargo.locklackedpredecessorSHA;observedhash/oldmtime/--lockedsourceproof recordedwithoutpretendingbytecomparison. Manualreceipts/no committedrange,authorreview/noindependentfullintegrationproof andpotentialmatching/rawbufferperformancecosts remainexplicit. No new dependencies/numericgates/profile/actualNative/DB/cloud/stage/commit/cleanup.
