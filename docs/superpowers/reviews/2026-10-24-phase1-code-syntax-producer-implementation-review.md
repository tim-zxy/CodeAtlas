# B0b-2 library producer / bounded consumer implementation author review

Date:2026-10-24. Kind:AUTHOR_IMPLEMENTATION_REVIEW,not independent review. [Approved plan](../plans/2026-10-24-phase1-code-syntax-producer.md);[accepted design](../specs/2026-10-24-phase1-code-syntax-producer-design.md). Existing C worktree/session,sequential execution;HEAD cc5a8cb571986c5e56ed04053b2c96ef500fcacb,branch codex/p05-integrated-exit-audit. No committed review range.

## Outcome and evidence boundary

B2-01..06 complete for LOCAL_LIBRARY_CONTRACT only. Providers build exit0;28 Node files500PASS/0FAIL/0SKIP/0TODO;105 unique Rust tests pass;18 actual owned-Source library outputs match independent rawtemplates and Canonical references through pure+bounded TS consumers;architecture17;registry49/exact23Phase1,exactlyone newID,catalog0.

Rust accounting is 8 private tests + 97 integration tests in the final 12-target batch, including 15 writer tests. Counts are unique tests, not summed repeated executions. The existing source_access test reports `SKIP symlinked parent: OS did not permit link creation`;its linked-file branch was consequently not reached. Harness PASS does not prove these denied-link branches. C1 real-file-symlink EPERM remains OPEN. Existing junction setup/test executed within its owned fixture. No Phase1 security/actual-runtime gate is waived.

Evidence root:`.superpowers/sdd/2026-10-24-phase1-code-syntax-producer/`. Full commands/logs:executed-verification-command.json,final-providers-build.log,depth-rust-private.log,depth-rust-integration.log,review-legacy-full-wire.log,depth-cross-consumer.log,verified-node-scoped.log,depth-architecture.log. Final implementation-verification.json binds inputs,outputs,failures,review and capture. Latest capture root is in depth-capture-root.json;its18case manifests/rawfiles and cross-consumer-result.json are test conformance only,measurementEligible=false and no Source/history/run authenticity authority.

## Implementation reviewed

- Isolated strictv5 Rust request/library module andwriter;protocol.rs/CLI/oldwriter/old dispatch remain unchanged. Exact v5 framing/fields/context/hash,Source verification,aggregate input/work,dualcoverage/outcomes and honest failure handling. No DESCRIBE advertisement or Runtime admission.
- Python/Java reuse private payload cores. Old observe APIs andv4 bytes/errors/work remain;v5 recordsSource obligations and atomic discarded-value references. No classTYPE,resolver,universalreference feature or oldbaseline correction.
- TS request schema/bytes/depth/line helpers shared privately;newreader snapshots beforeawait,hasbounded contiguousrawstorage,handles chunk/abort/error cleanup andalways calls the existingpurevalidator. Public index/eight-fieldfrozenresult unchanged;no publicparser/reader/process/profile/token.
- Newindependent p1-code-syntax-producer-oracle-v1:18Sourcefamilies,32provenance hashes,80files frozen beforeproduct. IncludesrealJavaidentities andseparateoldv4dictionaryfullwire. Expectedtemplates retainnumberlexemes;onlydeclaredroot/SHA substitutions. Actualoutput isnevernormalized to match or usedtoauthor expected.
- Exactlythree root testregistrations;newrequiredcross-consumer checker isexplicitartifact-dependent andnot hiddenbehindskip/defaultgeneration. Old319Fixture paths andall80newfrozen paths unchanged. Sourceclassifier,Canonical/SQL/migrations,dependencylocks/profile/catalog and production callers have no intentional change.

## Plan / acceptance trace

| Task / design basis        | Verification                                                                                                                                                                                  | Scope remaining                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| B2-01 / design§6,DCP§4/5/7 | 80-file preproductfreeze,18independentcases,32provenance,raw-byteattributes;API absence RED                                                                                                   | Authoredexpected isnot qualification/run identity                                   |
| B2-02 / §3                 | RustAPIabsence andvalidrequestbehaviorRED;strictv5/context/scalar/inventory/byte/depth tests;oldv4requestmatrix                                                                               | Binding isnot Source/history/owner authenticity                                     |
| B2-03 / §4                 | 5collectorbehaviorRED→7newcollectorPASS;wildcard/class/nested/async/repeatedreference/discardedvalue;oldPython/Java/grammar/raworacles                                                        | MinimalPythonCodeprojection,not fullPython/language maturity                        |
| B2-04 / §4                 | Writer/oraclebehaviorRED→full18rawmatches;15writerunits coverinput/work/event/outputlimits,cancellation,Sourcechange,short/permanentwrite,no scan,controlledrefusal andfulloldv4dictionaryraw | No actualprocessrestart/peakmeasurement/profile                                     |
| B2-05 / §5                 | Callable-readerRED→37readerPASS,4requestsnapshotPASS;everycompactsplit,singlebytes/UTF8,mutation,pendingabort,cleanup,hardline/total/eventbounds                                              | Reader ownsReadable consumption only,not childsettlement;raw/parsed overlap remains |
| B2-06 / §6/8               | Registration0-vs1RED;18capturemanifests/raw/checksum/Canonical/pure+readerchecks;500Node/105uniqueRust/architecture17/registrydelta                                                           | B0b-3/B1/C andallP1-04/05/Phase1exitsOPEN                                           |

Applicable task-local contract/Fixture/architecture/doc obligations are satisfied within this explicit scope. Empty legacy qualityGates do not grantPhase1 acceptance. No DEFERRED capability/new numerical gate is introduced. Canonical independence,SQLite authority,LLM candidate-only,AUTO/MANUAL andExecutionGraph → RuntimeFlow → BusinessFlow remain.

## Failure history and rulings

- MissingprivateTSAPI andunresolvedRustmodule recorded separately from runtime invalid-request RED. Newcollector fivefailures andwriter/reader actualbehavior RED preserved. No failed or unrun check is called passing.
- task2 extraction author script usedrequire in.mjs and stoppedbeforeedits;importfixed,logretained. FirstactualTSbuild founddecode also usedbyevents;shared private decodeCodeSyntaxLine preserves original semantics withoutduplicate code/publicexport.
- Private commonpayload valuevalidation andowner-map check are separate calls so oldv4 raw/depth-before-owner errorprecedence remains. This is a minorinternalinterface refinement,costone extra privateguard;no oldwire change.
- NewRust tests/support/code_syntax.rs shares ownedtemporarySource/templateinstantiation acrossintegrationtargets. Test-only extrahelperpath,costone additionalfile,no productfactory or dependency.
- Readerfirst32PASS/1testassumptionFAIL:Readable.from itself accessesProxy.then before consumer. The invalid-byteLength getter test nowtargets consumerboundary;separatethenassertion proves controlled PROCESS_FAILED forupstreamassimilation. No unsafe requestbyte guard wasweakened;trustedReadables canexecute upstreamcode.
- finalRust batch failedlinking code_syntax_oracle withLNK1104 before any integrationtest/capture. No leftovertest/cargo/rustc/link process wasfound,targetexeabsent,firstcaptureempty. Added-j1 because --test-threads1 didnotrestrictCargo buildjobs despite approvedsequentialmethod. Onecorrectedbatch passed;causeofLNK1104 remains UNDETERMINED,notfixed/flaky andnot historicalNative timeout. Retainfirstlog/emptycapture and link-failure-observation.json. Three actual captures are retained across code revisions; failed builds captured nothing. The later LNK1105/Windows1224 confirmed an open user-mapped section on an unchanged static-fixture executable; owner/root cause unknown. That target passed an isolated relink and the full cohort subsequently passed. Neither -j1 nor a successful relink proves the cause fixed.
- Preservation script initially comparedCargo.lock to an absent943-receiptkey. No matching priorSHA wasavailable;it wasnot proof oflockmutation. CurrentSHA72b958d8d35046d3c26c09a4ee1bc7f9249370ecaebf09772d4507fe3cc5d849,mtime2026-10-22,allCargo commands--locked/--offline,no ownwrite. Explicit limitation:no before/afterhashproof forthatfile. Finalreceipt nowpinsit;no lockrestoration or evidence fabrication.
- Authorreview foundsame-Source legacydictionary proof wasonlycollector-level. Addedfullactualoldwriter rawcomparison againstpre-frozenv4template;13-targetedtestsPASS. Product/Fixture/oracle source was unchanged at that assertion-only checkpoint. Later identified product fixes required fresh Rust verification and capture.

## Assessment and retained limits

No unresolved Critical/Important issue found within approved library-contract scope. Review inspected ownedsource/test/helper/filemap,private/public boundaries,Sourceenumeration/error paths,guard limits,independentreferences and receipts. It isauthorreview,notindependentreview ormerge readiness.

Manualreceipts replacecommit-coupledhelpers andcleanup because userpreserveslocalwork;cost:no committedrange. Preserved sequentialauthorreview costsno independent/fullintegrationproof. Per-filecorrespondence scans canbequadratic andrawbuffer+parseddata overlap;actualtiming/memory/reservations remain unqualified. Nativebinarymayhavebeencompiled incidentallybyCargo,butneverexecuted orqualified;no existingprofile canbeassumedvalidforchangedbuilds.

Next requires B1/C and eventual exact-current qualification design/approval:trustedSource/history/removed/retainedsupport,one honestNativeSnapshot,atomicApply,realprocess/lifetime/accounting/profile and productionrouting. Sourcepolicy,Runtimecatalog0 and alloriginalguards remain. C1EPERM OPEN,fourC2lifetimes spent,historicalNative timeoutUNKNOWN,main39708335128 cancellation not re-queried,R4mutableDB untouched. No new NativeCLI/acquisitionhelper/calibration/profilevalues/dependency/cloud/stage/commit/cleanup authority.

## Final review corrections and current evidence

Late cancellation during final flush previously returned Ok after completed bytes. review-late-cancel-red.log reproduced it; the v5-only post-flush check now returns Interrupted and emits no second terminal. Completed bytes cannot be retracted: the owning workflow must honor failed library settlement. review-late-cancel-green.log proves the regression.

Source AST depth and complete JSON envelope depth differ. review-wire-depth-red.log reproduced a completed output whose envelope exceeded the existing maxDepth. Writer now reuses the existing depth validator before serializing each complete event, taking the minimum of request and caller limits. review-wire-depth-green.log and final depth-rust-integration.log pass the regression. No old-v4 behavior, Fixture, budget value or threshold changed.

The final revision passed 8 private + 97 integration tests, the independently checked 18-case capture and 17-project architecture check. The 500-test Node cohort remains applicable: its product, test, Fixture and compiled inputs did not change during the Rust-only fixes. All capture roots and failed attempts remain preserved. This is author self-review only; an independent review and full integration qualification remain open.
