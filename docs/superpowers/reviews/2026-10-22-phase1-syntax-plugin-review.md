# P1-03 Syntax IPC and Plugin V2 review — 2026-10-22

Disposition: complete for the approved P1-03 contract task. This is author review under the existing sequential/no-subagent plan; no independent review or Phase1 exit is claimed. Architecture authority: ADR-020 and the user request to continue the next design/development step. [Precise contract detail](../specs/2026-10-22-phase1-syntax-plugin-contracts.md).

## Delivered and traced

| Deliverable | Authority | Fixture | Evidence | Limit |
| --- | --- | --- | --- | --- |
| Explicit protocol4 OBSERVE_SYNTAX request and raw-byte complete-stream validation | ADR-020 A, NATIVE_IPC/PROVIDER_SPI, detailed contracts section3 | p1-syntax-contract-v1 |45 TypeScript tests; shared Java/Python raw request/event files and literal outcome/count/checksum oracles | No actual producer/normalizer/client wiring or language/capability advertisement |
| Explicit Plugin contextVersion2 descriptor/context/detection/extraction/candidate | ADR-020 A, PLUGIN_SPI, detailed contracts sections2/4 | p1-plugin-context-v2 |26 tests; literal context/descriptor/support/expected decisions, existing10000 combined fact bound and equality positive | No framework extraction or activation; concrete output validation remains Application-owned |
| Shared Rust byte-contract entry | P1-03 Step1, ADR-010 | Same raw syntax Fixture |2 offline Rust tests verify request framing/identity and exact event checksum/count/oracle | Not a Rust v4 request parser or producer; that implementation is P1-04 |

Root test registration and exact Providers/Plugins export inventories include the new contracts; existing allowlists and V1 validators stay strict. No dependency added, SQL or old Native production source changed. Canonical/ProviderSnapshot/IPC v1..v3 stay unchanged. Future Native requests require explicit negotiation through a real evaluated descriptor; exporting a protocol constant does not advertise runtime support.

## Tests and findings

Initial RED:62 tests,1 existing V1 characterization pass,61 missing-interface failures. Initial Plugin runtime tests passed25/25 while compilation separately exposed the existing distinct CanonicalId/EntityId brands at the general-reference bridge. The corrected implementation parses EntityId through its existing schema and uses a string-key lookup map; old public brands are not weakened. Both package builds then passed. This build failure is retained and never counted as a successful build.

Review strengthened raw-stream semantic mutations by recomputing independent checksums, preventing an integrity failure from masking a missing basis/owner/file check. The legacy-refusal test originally invoked a nonexistent helper; corrected characterization calls the actual strict v1/v2/v3 schemas. This is a test defect correction, not a product RED. Combined budget testing now proves a valid10000-item equality baseline before the10001 refusal. Positive PARTIAL, duplicate events with corrected counts/sequence/checksum, removed-file refusal, exact raw request framing and depth-budget cases are retained.

An additional positive-controlled RED26/25pass/1fail reproduced competing valueDigest entries for one captured entity in Plugin supportInventory. Root cause: uniqueness included the digest, allowing two contradictory captured values. New V2 inventory now keys uniqueness by entity within its one basis; membership in the local canonical/file inventory bounds its cardinality without a new numeric cap. The corrected71-test new suite and final397-test regression pass. No unresolved task-local Critical/Important finding or deferred minor is known from this author review; independent-review blind spots remain.

## Fresh reproducible evidence

Evidence directory .superpowers/sdd/2026-10-22-phase1-foundation-and-runtime/ retains originals and new P1-03 logs:

- task-03-brief.md: exact approved task and tested BASE cc5a8cb; predecessor source/Fixture hashes checked before implementation.
- task-03-red.log, task-03-plugin-build.log, task-03-inventory-red.log: original missing behavior, type failure and inventory bug evidence. No failure was erased or relabeled PASS.
- task-03-final-builds.log: installed compiler builds Providers/Plugins/Runtime exit0.
- task-03-regression-command.json and task-03-regression.log: exact19 test files;397 tests,397 pass,0 fail/cancel/skip. Includes71 new and326 matching old tests: strict IPC v1/v2/v3/bytes/output, old Provider/Plugin SPI/routing, fake-child client/environment, Phase1 IR, Manifest/registry, exact workspace/export and injected architecture/runtime-construction guards.
- task-03-rust-shared-final.log: cargo test --offline -p codeatlas-native-analyzer --test syntax_contract_fixtures,2 pass/0 fail. Cargo compiles/links its ordinary targets; the existing executable is not invoked for an actual observation. First compile emitted the ordinary Windows import-library linker warning, not a failed test.
- task-03-architecture.log:17 project dependency boundaries pass. Named-file Prettier and Rustfmt checks pass; no whole-tree EOL synchronization.
- task-03-verification.json: exact commands, input/source/raw-byte SHA256 and discovered31 total/exact5 Phase1 manifests, including the two new IDs.

The final contract snapshots are deeply immutable. Trust in caller identity, source-policy filtering, support digests and frozen live basis must still be established by Application/Storage/Runtime. Complete raw-byte validation is not live process timeout, cancellation delivery, actual memory enforcement or profile admission. Those runtime obligations cannot be satisfied by these pure tests. maxDurationMs/maxMemoryBytes/deadline are explicit contract fields, not measured or enforced process guarantees here.

No cloud CI/write, dependency install, Native actual observation, model/network call, calibration/profile, historical full Phase0.5 rerun, R4 mutable DB operation, stage or commit occurred. HEAD remains cc5a8cb; local original EOL/doc/evidence files are retained. Phase0.5 accepted risks and historical UNKNOWN Native timeout remain unchanged; run39708335128 cancellation settlement is still not freshly established.

## Next task

P1-04 requires a concrete Java/limited-Python producer/normalizer design and exact grammar compatibility/dependency approval, Source policy/fingerprint compatibility, real owner binding, mixed-provider closure/recovery and exact-profile admission. This task does not authorize guessed version/profile values or cloud CI. No actual P1-04 producer has been implemented by this contract task.
