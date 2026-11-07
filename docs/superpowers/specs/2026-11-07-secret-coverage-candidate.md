# Offline secret coverage candidate and P1-12 boundary map

Fresh evidence: initial15 RED corpus cases failed before implementation; final
16-vector corpus plus unsafe-input/cancel/budget tests passed. Documents build,
121 combined detector/preflight/capture-contract/lifecycle tests, architecture17
passed with no skips. Tests: Node --test, concurrency1, Documents secret-preflight;
Application document-write-preflight, parsed-document-write-preflight,
compilation-input-contract and compilation-input. Independent review: no high/
important issue; deferred minor joined-URI first-scheme limitation now pinned as
an explicit missed-form vector. Integrator confirmed zero diff for v1 source and
corpus. Reviewer could not independently obtain Git diff (Permission denied),
did not retry it; file-scoped review and all evaluation remain read-only/synthetic.

Status: PROPOSED, offline evaluation only. No policy installation, scan permission,
production call site, public API or acceptance threshold is changed. Existing
SECURITY controls, capture private schema-v1 and v1 detector remain authoritative.

## Executable candidate

`packages/documents/src/secret-candidate.ts` exposes private
`inspectDocumentSecretCandidate(source,candidate,account)`. It snapshots valid
nonshared UTF8 source and plain-data candidate using the shared account. It runs
the unchanged v1 PEM/credential-assignment/string-property rules, then inspects
original text plus every candidate string and key for URI passwords. The URI rule
tokenizes at whitespace/angle brackets/quotes, finds the first `://` in each token,
finds its preceding scheme, locally parses with Node URL, and flags nonempty
password. It neither follows URLs nor emits parser errors/raw matches. Account
checkpoints and work charges cover complete strings, including no-hit input.
Result reports `document-secret-indicators-v2-candidate`, status PROPOSED,
coverage LIMITED and clearance false, with sorted rule IDs only. No location,
raw text, fingerprint or transferable authority is returned. Existing v1 callers
and corpus are unchanged. No production path imports the candidate module.

Independent literal corpus: `packages/documents/test/fixtures/secret-indicators-v2-candidate.json`.
Positives include raw/payload/diagnostic/key URI password, percent-encoded password,
v1 assignment/property and conservative examples. Negatives include ordinary URI,
empty password, port and `@` in query. Explicit known misses retain invalid URI,
opaque token, base64 and split fragments. Joined multiple URIs without delimiters,
unknown token formats and nonstring secret values are not covered. Placeholders
may overblock. URI username-only is deliberately not a password indicator; this
does not classify it as safe. No no-hit result proves absence of secrets.

Approach: compose v1 instead of altering its historical behavior; use standard URL
syntax parsing instead of a new dependency or broad decoding engine. Costs include
extra bounded copies/visits charged to the same ledger and deliberately incomplete
coverage. Rollback removes/disables the private candidate; no data migration needed.

## Actual boundary map and remaining production conditions

| Boundary | Existing implementation/evidence | Remaining restriction |
| --- | --- | --- |
| Complete selection/support closure | Application compilation-input-contract strict whitelist, exact basis/ref/value/digest and transitive closure tests | Candidate scanner is not an owned capture or inventory authorization; all transitive text must be covered before materialization is admitted |
| Original and final payload | Unchanged document-write-preflight scans original and mapped Draft independently; source mismatch/final cancellation tests | Candidate only evaluates supplied bytes/data; no Source or final-consumer identity is authenticated by its result |
| Source binding | captureCompilationInput verifies each owned Source after mapping, rechecks repository/workspace, then releases all owners | Source/policy drift or UNKNOWN cleanup refuses; cross-database common instant is never claimed |
| Policy and permissions | Application reauthorizes complete reads and policy versions after cleanup; revoke-during-cleanup test | Current same-account Principal supplies identity only; private ordinary entry still rejects CAPTURE_SCAN_UNAVAILABLE before fact/body reads |
| Runtime/context lifetime | Existing opaque Principal/operation owners check process/lifetime, cancellation, budgets and scope | No receipt/Boolean can revive a closed owner or authorize body reading, remote/model access or publishing |

Production needs an explicitly approved, versioned coverage policy/corpus with
misses and false-positive risk accepted; an authoritative inventory and permission
to read it; exact consumed original/final payload binding under the owned lifetime;
final Source/policy/permission checks; and settled failure/cancellation cleanup.
This candidate does not install any of those privileges. Normal capture, documents,
Runtime/Code support text, transformations and consumption must all be covered by
their corresponding approved path; document-only evaluation cannot close P1-12.
No real identity query, installed update, user data, model, migration, publication
or R9 is performed. E02 PROPOSED/uninstalled, A6 NOT_QUALIFIED, Phase1 4/21 remain.
