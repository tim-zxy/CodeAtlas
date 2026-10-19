# PR20 CI build-cache compatibility proposal

Status: PROPOSED, awaiting explicit design review. This is not permission to
change the catalog, regenerate evidence, install a value or publish another pack.
It refines the existing ADR-019 / closeout Tasks7/8, not a new roadmap task.

## Reproduced evidence

PR20 at a947845, run39197534643, completes with TypeScript/Rust SUCCESS and Native
FAILURE. The complete original job log is retained as task8-pr20-settled-native.log
in the existing closeout workspace. REFRESH contracts, Storage rollback/ownership,
existing purpose-reservation checks and original memory collection all pass.

Two original Java PARTIAL tests fail at test-phase05-native-observation.mjs:409
because parseObservation is null. A real caller-TEMP alias reproduces both exact
failures; canonicalizing that caller path makes both pass, then the whole original
Native entry passes114/114 (65207.3097ms). No production guard is relaxed.

The exact-pack step downloads the correct asset but ci-result.json reports
INSTALL failure before ACTUAL. Original artifact12165652221 contains that receipt
and the current hosted materializer manifest. Read-only stdlib ZIP range access
compares its independently prepared catalog against the approved2345 entries:

- Hosted project-mode build has2329 entries:16 build-info files are absent.
- Seven emitted JS files differ with Windows TypeScript source line endings.
- The separately compiled Native differs as expected; the installer must still
  use its original pinned executable, not that new binary.

A fresh LF checkout with the same locked dependencies removes every JS difference;
only the16 missing caches remain. Building it in the original build mode restores
membership, but an independent checkout outside ancestor node_modules still has
one differing apps/mcp/dist/.tsbuildinfo. Its packageJsons records additionally
contain packages/application/package.json and packages/source/package.json. The
old cache cannot be asserted reproducible from the current sources. A nested
checkout also records ancestor resolution misses; its failed experiment is kept.

Original local current-catalog recheck remains2345/2345 byte/hash-equal after the
CI-only context/source-byte correction. No frozen helper, generator, compiler,
product, Native, candidate, raw report, holdout or approved ZIP was changed.

## Already bounded compatibility correction

Pin TypeScript source text to LF in .gitattributes, as already done for other
build inputs. Canonicalize only the Native Fixture caller's TEMP/TMP before
testing. Register a real autocrlf-enabled checkout regression outside the hashed
helper/script trees. Genuine RED shows added CR bytes inside a template literal;
GREEN2/2 preserves those bytes and the existing published SQL CRLF policy.
Original114/114 Native tests pass with this caller configuration. This restores
original source bytes; it does not solve or exempt the build-cache discrepancy.

## Recommended governed amendment

Exclude only workspace dist/.tsbuildinfo compiler caches from the next versioned
replay dependency catalog. They are build-optimization records, not loaded by
the measured Node/Rust/SQLite operation. Keep every existing JS, map, declaration,
package, migration, helper, script and Native identity check. Do not expand this
to a suffix-wide map/declaration exclusion, strip bytes or accept logical equality.
Keep the three existing profile-data exceptions exactly as approved.

Before implementing, revise the existing detailed contract and Tasks7/8 together
with ADR-019, Evaluation, acceptance and traceability. Tests must independently
prove that adding/removing/mutating only these caches leaves actual discovered
semantic dependencies stable, while changing JS/maps/declarations/package/source/
Native membership still refuses. Preserve historical catalog/evidence versions;
old records do not become eligible under the new rule.

Use a newly approved exclusive layout revision p05-d5-exact-layout-v2 at literal
C:\CodeAtlas-P05-D5-R2. Do not adopt, move, erase or repair the existing v1 root.
The D-only caller input remains1_000_000_000bytes; all C defaults, caps, SQL charges,
worker policy and original thresholds remain unchanged. The new literal path
requires regenerated original boundaries, not substituted old invocations.

Then freeze the corrected final catalog, regenerate/qualify all22, run the original
110 calibration and22 independent holdouts, independently reconstruct the new
candidate and stop for its exact numerical approval. No value is proposed here.
Unchanged production-purpose profiles need not be remeasured solely for this
private catalog amendment if exact identity proves unchanged. A new approved
synthetic pack must use its own candidate-namespaced tag and real IDs; never
replace Release416886384/asset655180938 or alter its original bytes.

Only subsequent original guarded local/clean-host actual22, current ordinary gates,
actual31, required hosted checks and original Exit Criteria can close this Phase.
No Phase1 coding, public API/config/schema, SQLite migration or FROZEN model change.

## Alternatives and decision boundary

Keeping the strict old contract is safe but holds Phase0.5. Copying a historical
cache merely to satisfy its hash is not an independent clean-build proof and is
not recommended. A portable whole-build equivalence or OS-path normalization
scheme would be a larger, unproved contract; it is outside this correction.

Requested decision: accept this narrow catalog/layout amendment and its original
qualification/measurement sequence. This does not approve an unseen reservation
or a replacement artifact. Until accepted, do not edit frozen helpers, broaden
exclusions, regenerate the corpus or mark the hosted failure passing.
