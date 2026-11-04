# B0b-2 producer/consumer design author review

Date: 2026-10-24. Kind: AUTHOR_DESIGN_REVIEW, not independent review. Status: PROPOSED / awaiting user design review; no implementation plan or execution approval. [Design](../specs/2026-10-24-phase1-code-syntax-producer-design.md); [accepted B0-b](../specs/2026-10-23-phase1-b0b-completeness-proposal.md).

## Verified starting evidence

All884 SHA entries in the B0b-1 final receipt matched before this turn's document edits. Original C worktree retained; .codegraph absent. Prior436PASS/architecture17/registry48/exact22/catalog0 is historical, not rerun. No Source, Fixture, product/build/registration, DB/R4, Native/Rust/helper/probe, dependency/profile/number, cloud or Git mutation is performed by this design turn. Only local design/governance/evidence documents change.

Read current SyntaxRequest decoder, Python declare/walk/value/import and per-file observation shape, Java observe boundary, controlled library writer/dispatch, Source read verification, Native CLI route, TS v4 observe/runProcess/decoder, purev5 request/stream contract, independent Fixture authoring provenance and existing library-oracle testing pattern. One guessed syntax_protocol.rs filename was absent; actual contract is syntax.rs. No execution probe resulted.

## Builder and contract checks

| Check                | Assessment / resolution                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                | Library producer plus bounded TS byte consumer only; no CLI v5 route, process owner, admission, Source policy, snapshot adapter, Store or profile. This completes part of B0b-2 engineering evidence, not real Native qualification |
| Old compatibility    | Keep v4 outer field/version gates and observe methods; share only private common payload/value/collector responsibilities. New v5 cannot be serialized into fake old wire or reinterpret old partial output                         |
| Actual enumeration   | Code counters attach to Source units and successful fact emission. Wildcard/class/owner gaps require explicit partial/unsupported evidence. Counting emitted facts alone cannot discover eligible omissions                         |
| Fixture authority    | B0b-1 Java unit IDs and JS raw encoding are not real Native output goldens. Freeze a separate producer reference with actual published identity encoding and independent wire serialization; retain all old roots                   |
| Request binding      | Snapshot exact bytes before await; compute requestChecksum locally and bind actual output. Extract current private TS parser rather than duplicate/relax request validation; no parser public export                                |
| Stream bounds        | Check bytes/lines/events during reading, no unbounded chunk list; final purevalidator always executes. Raw/parsed overlap remains future measured HOST evidence, not constant-memory proof                                          |
| Ownership and errors | Reader owns reading/abort-listener/destroy settlement only. It cannot declare a child closed. Writer stops on failed sink without retry or fabricated success; failure terminal only when it fits existing bounds                   |
| Budgets              | Existing explicit SyntaxWalkControl/request/hard controls, cumulative Source input/work. No new constants, resource profile, threshold or claim that maxMemoryBytes proves actual peak enforcement                                  |
| Storage/security     | No schema/migration; Source link/path/hash protections reused, removed inventory not scanned/authenticated; candidate-only and no publication authority                                                                             |
| Tasks                | B2-01→02→03→04→05→06 default sequential;05 logically independent after02 interface freeze. Exit and missing actual-production gates separately named                                                                                |

No design blocker found for presenting this proposal. Remaining concrete signatures, exact filenames/commands, RED order, parser/collector compatibility checks and test-only temp ownership must be fixed by writing-plans after this written design is approved. They are builder details, not runtime defaults approved by this document.

## Review rulings and costs

- Original session/sequential preference and prior approved evidence-preservation method retained: author builder check without new subagent/worktree. Cost: no independent review.
- No commit-coupled helpers, commit/stage or evidence cleanup. Cost: local document/receipt review rather than a committed diff range.
- Scope deliberately excludes CLI/process routing, real cancellation settlement, acquisition/resource qualification and B1 capture/history/Store. Cost: a correct library stream is not a production-ready Native capability.
- Quadratic correspondence matching and final raw/parsed buffer overlap were considered; no speculative matcher/profile change. Cost: actual performance/memory gates stay open and can require governed follow-up.

No new test passed or gate closed by this review. C1 symlink EPERM stays open, four C2 lifetimes stay spent, historical Native timeout UNKNOWN, main cancellation not re-queried. User confirmation requested for this written design only; concrete implementation and scoped library-test authority are decided in the following plan review.
