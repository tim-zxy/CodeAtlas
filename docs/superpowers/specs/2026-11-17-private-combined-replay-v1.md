# Private combined replay v1 (implementation-only)

Status: user-approved bounded trust-contract amendment, 2026-11-17.

Only a separately named private offline entry may acquire an original replay,
verify semantics once, finish proof writes, fully revalidate inputs/dependency
bytes and topology/location/original receipt/result/proofs, and synchronously
project using that same verification. No caller callback between tail validation
and projection. A private owner lease refuses concurrent run/verify/restore; any
failure latches FAILED. Observation persistence and original restoration must
succeed before returning the row. No failed row reaches a collector through this
entry; a local observation file may survive restoration failure as failed evidence.

Legacy command, public helper functions, collectors and actual22 keep the old
verification path. This entry is not wired to any of them and grants no execution
or admission authority. It accepts only offline mode internally. No numeric,
worker/SQL/resource/cancellation policy, Canonical IR or database contract changes.

The final complete input check moves from before asynchronous proof writes to
after them. The duplicate complete semantic verification is absent. The guarantee
is point-of-use full validation, not atomic filesystem immutability: transient
changes restored between checks can be missed. Preserve an explicit old-reject /
new-accept counterexample. Same-account writers are not isolated by the lease.

Old snapshots, qualification, raw observations and UNKNOWN cleanup remain historical.
Any future real use requires newly frozen source/controller/corpus identities and
fresh required evidence; no old partial Transport rows may be appended. Rollback
uses the unchanged legacy entry and disables this new route, never relabels old
qualification or deletes evidence. No formal qualification, Native execution,
publication, profile adoption, PACK or actual22 is authorized by this amendment.

Success criteria: stable synthetic output equals the original verifier/projection;
late proof/input/result drift refuses; forged/cross-owner/reentrant calls refuse;
write/restoration failures withhold delivery and prevent retry; real file checks
and closed self-owned SQLite images are exercised, with Native acquisition replaced
only in the test-loaded module. Record limitations and independent review.

## Implementation evidence and limits

The separately named runRefreshTransportCombinedOfflineReplayV1 remains unselected
by all legacy commands/collectors. A real WeakSet lease covers acquisition through
restoration; public run/verify/restore refuse interleaving. Only the combined branch
moves the post-input check after proof persistence; the original verifier retains
its old check location. Tail validation reuses complete dependency discovery and
verification, workspace/database location and original receipt/artifact/result
checks, then calls the existing synchronous projector. Any failure latches FAILED;
observation/restore dual failures retain both originals in AggregateError.errors.

Fresh Node24.15.0 Windows synthetic checks:16 combined +4 existing index tests,
20/20 PASS,0fail/cancel/skip/TODO,4020.3415ms. Real closed16-table SQLite images,
actual byte/path/metadata/topology guards, cancellation prefix proof, exclusive
writer and restoration run; only Native acquisition and repository-wide discovery
are test-loaded substitutes. The substitutions do not escape into the source file.
17-project architecture check passes. Focused Prettier and syntax checks are also
required before handoff; no full Native-dependent suite was run, consistent with
the explicit prohibition on Native/qualification. No A6 or phase completion follows.

Stable same-algorithm legacy/combined scalar outputs agree. Faults cover post-proof
dependency, original artifact, result DB, unexpected workspace member and cancelled
prefix proof; forged owner, overlapping public calls, wrong case digest, false
closure, exclusive observation collision and restoration archive collision. An
actual dual-failure RED preceded its fix. Early fixture failures were noncanonical
JSON, missing strict memory fields/case/corpus data, and an attempted second restore
of the same preserved archive; corrected fixture data never weakened verifier rules.
Fault tests explicitly require the injected post-proof mutation to have occurred.

Preserved counterexample: mutate a dependency after the semantic issued-receipt
check, restore bytes on verification-file close. Legacy's intervening input check
refuses; combined-v1's later tail check accepts. This is deliberate approved weaker
transient-window detection, not strict equivalence or filesystem atomicity.

Measured check counts in the small fixture:legacy5 vs combined3 full dependency
pairs, excluding the common substituted acquisition (the real acquisition adds1
each:6 vs4). Thus the observation path statically removes two full pairs and one
semantic pass; preparation/audits/reconstruction and worker cost remain. No claim
of33% total runtime improvement or completion within330 minutes. Independent final
readonly review reports no remaining definiteP1/P2 after the dual-failure fix;
reviewer ran no tests. Historical qualification/cleanup is not changed.

Final scoped syntax and Prettier checks passed. Initial package.json formatting warning was corrected with the existing formatter; parsed script semantics differ only by appending the new test. Original worktree HEAD4c82d49 with27 status entries, clean integration96a965b, original index-candidate four statuses and helper SHA6bd757f1ca1d65502d27e4d9f7dbb6e43afeeb47c6e68c1e3aa1a4cee71303c2 remain unchanged. New executable entry references are only its helper and synthetic test.

## Explicit offline execution wiring preparation - 2026-11-17

Approved bounded preparation adds the named p05-refresh-combined-offline-v1 command and separate local controller. It is not automatically selected by legacy CLI/collectors. No actual/approved route is allowed; topology corpus and generator4 are required. Original qualification/holdout/reconstruction/budget/stop gates remain. See [freeze plan](../plans/2026-11-17-combined-execution-freeze.md); formal identities/seed/outer launcher and execution permission remain incomplete.
