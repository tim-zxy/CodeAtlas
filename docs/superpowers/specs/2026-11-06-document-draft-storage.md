# P1-10 private Draft, original positions and structural Store

This implements an existing P1-10 slice: original-byte geometry, strict structural
DocumentDraft composition and additive workspace W007/W008 plus a private Store.
It does not implement Markdown parsing, semantic Claim writing, a genuine secret
scanner, production document publication or P1-12 CompilationInputSnapshot.
Existing Canonical IR, opaque identity, AUTO facts/MANUAL semantics and old SQL stay.

## Original input and Draft

Documents has only its already allowed internal IR dependency; root exports remain
empty. DocumentAccount is a structural view of the existing trusted shared owner
account. Source and Draft can use the same instance without resetting its counters.
It supplies no numeric default or physical RSS/time guarantee.

Geometry reserves an exact owned byte copy, rejects shared/detached/invalid UTF8,
and uses Node isUtf8 before byte-boundary arithmetic. It never normalizes BOM,
Unicode or line endings. Parser-facing offsets are original UTF16 offsets, mapped
to zero-based lines and UTF8 byte columns. Requests splitting a surrogate pair or
CRLF are refused; bare CR/LF, EOF, empty input, duplicates and request order remain
explicit. Range coordinates must land on real original UTF8 boundaries.

assembleDocumentDraft prepays strict IR copying, verifies original SHA256 and all
ranges, preserves supplied IDs and COMPLETE/PARTIAL, freezes the independent parsed
bundle and invalidates the owner on failure. Structural-only drafts reject nonempty
Claims. No IDs, resolved entities, metadata authority or semantic content are invented.
The whole raw byte buffer is not attached, but ordinary structured text remains
unredacted/sensitive. Strict IR/range checks do NOT prove parser derivation, Source
access, external reference authenticity, secret clearance or publication eligibility.

## Compatible SQLite structure

Only new 007_documents.sql/008_claims.sql and manifest entries are added; W001..006
bytes/checksums are unchanged. New unpublished draft SQL was converted to repository
LF before its first manifest checksum. Existing runner owns transactions and applies
only additive backupRequired=false DDL; no reset/down/backfill or user DB was run.

W007 has documents/current pointer, immutable revision bundles and normalized
sections/blocks/links with revision-local FK/ordinal constraints. Other typed data
remains in strict Bundle JSON. Application supplies opaque IDs; path is only a locator.
Scope/header relocation is refused in this slice, not inferred from path/title.
W008 has the already specified Claim/evidence columns, no invented publication-state
contract. This Store refuses all nonempty Claims; schema availability is not Claim
workflow completion.

Store admits exactly schema7/8 with foreign keys ON. Existing Runtime ContractStore
explicitly supports known6/7/8, retaining unknown9 refusal and all old content checks.
Historical Runtime Fixture bytes stay unchanged and are tested at their declared
version prefixes; separate document tests exercise actual current manifest8.

COMPLETE structural bundles use one transaction and expected-current-head CAS;
PARTIAL makes no writes. The unique document/content/parser/policy tuple reuses its
actual existing revision. Only explicitly local typed kind/id/scope/revision refs
are rebound; prose/JSON and external provenance are never string-replaced. A changed
payload, entity IDs or provenance under the same tuple refuses, preserving last-good.
This conservative conflict is a limit, not automatic cross-basis identity inheritance.

readCurrent uses a SQLite snapshot and validates the actual header, revision tuple,
normalized relation columns and immutable Bundle JSON against each other. Corruption
is refused. Returned historical Bundle header currentRevisionId is null; the wrapper
carries actual current revisionId. No authenticity outside this database is implied.

## Authority, controls and failure

The Store is package-private, not a raw Agent/model write endpoint. Trusted Application
must validate Source, scope, final payload and actual secret scans outside transactions.
The mandatory synchronous guard rechecks current permissions/head/control; it is not a
JSON clearance receipt. Async/thenable/non-undefined returns refuse; genuine rejected
Promises are settled safely. Known schema/FK are rechecked inside the transaction and
again after the final guard. Once COMMIT is attempted, acknowledgement/cleanup doubt
returns COMMIT_OUTCOME_UNKNOWN, without retry. Caller owns connection and reconciliation.

Request-local HistoryReadBudget covers request admission PRAGMAs, membership queries,
rows/TEXT and each explicit clone/parser copy. Constructor's two scalar setup probes
have no request context. Full Source+Draft+Store shared-run accounting is NOT yet wired. The later
[history-read slice](../plans/2026-11-06-document-history-read.md) now adds optional
synchronous control to readCurrent and required control to exact readRevision,
using the same per-request budget/snapshot/integrity path; checks occur between
bounded stages and do not interrupt the SQLite VM. This is not full-run accounting
or authenticated CompilationInputSnapshot capture. No qualification/resource/profile numbers were adopted.
Production update-documents remains unavailable rather than treating missing scanner
execution as secretDetected=false or a supplied digest as authority.

## Evidence and next integration

The independent byte/position literals predate code. Root tests use actual owned SQLite,
original migration runner, genuine Source preparation with Git doubles, strict IR and
literal expected structures. The Source->literal Draft->Store test is component
integration, not an actual Markdown/scan/capture E2E. See the accompanying review JSON
for exact per-run counts, setup mistakes, real REDs, scoped reviews and source hashes.

Rollback disables the new private workflow; retain old revisions and additive schema.
No destructive rollback or deletion of old evidence is offered. P1-10/E07/P1-12 and
Phase1 acceptance stay open. R9 is not authorized or run.

## Remaining parser and scan decisions

The recommended existing major-dependency candidate is unified11.0.5 +
remark-parse11.0.0 + remark-gfm4.0.1: semantic mdast/CommonMark plus GFM fits the required
structure adapter. Current upstream manifests confirm these version labels, ESM and
MIT; this is not a published-archive integrity or vulnerability audit. The previously
reviewed69-node closure is historical and must be frozen/rechecked before adoption.
No parser package was installed by this slice. Read-only upstream references:
[unified manifest](https://raw.githubusercontent.com/unifiedjs/unified/main/package.json),
[remark-parse manifest](https://raw.githubusercontent.com/remarkjs/remark/main/packages/remark-parse/package.json),
[remark-gfm manifest](https://raw.githubusercontent.com/remarkjs/remark-gfm/main/package.json),
[GFM syntax](https://github.com/remarkjs/remark-gfm).

Lezer's prior3-node candidate uses compact incremental syntax trees and would need
more semantic/reference-link adaptation. Its GitHub repository now points to a new
upstream host; archival there is NOT evidence of abandonment. The new host returned
403 during this read-only check, and npm version endpoints were unavailable here.
[Official move/readme](https://github.com/lezer-parser/markdown).

Adoption should pin the reviewed closure, avoid lifecycle scripts, adapt AST offsets
to original bytes and prove duplicate headings/fences/tables/links/BOM/CRLF literally.
Do not add HTML execution, URL retrieval or automatic semantic Claim publication.
For secrets, existing whole-document blocking can avoid replacement mappings, but
actual detection patterns/provider, coverage and final-payload binding must be
specified and tested. No scanner exists in this repo beyond policy flags today;
missing execution cannot be labeled scanned. A new detection service or changed
security meaning needs a decision; ordinary private DTO/transaction details do not.
