# Private P1-15 lexical projection component

Status: existing roadmap implementation refinement using owned experimental data only. Not production search_knowledge, published-query admission, graph expansion, W011/FTS migration or full P1-15 acceptance. No user database/Source body access, model/embedding or production scan clearance.

## Input boundary

OfflineKnowledgeSearchIndex binds a genuine OfflinePublicationStore and a fixed TEST_SEARCH_PERMISSIONS_NOT_AUTHORITY synchronous checker. This checker is a test assertion port, not a real principal/grant or classification proof. The public/Runtime/CLI routes remain unchanged and closed to this component. Source accepts only its exact experimental schema, not production workspace databases.

Dedicated readSearchProjection never calls readState, committed or command, because those load complete snapshot/support/Claim payloads. Before projected text, it supplies a frozen manifest of workspace and complete item/revision ID set with explicit ITEM_SCOPE/SOURCE_FRESHNESS/COMPILATION_CURRENCY/TITLE/SUMMARY/GOAL/PROVENANCE_IDS fields. Each required object/field must be allowed; denial/exception/illegal result refuses the whole operation. No item-level check silently authorizes raw or transitive bodies.

In one owned read transaction, private savepoint and original connection marker verify continuity after callbacks. Caller/foreign transactions are not adopted. Headers and exact schema are rechecked before/after delivery. JSON SQL comparisons may process stored payloads internally, but JS receives only selected display/metadata fields and boolean integrity evidence, never raw snapshot/support/Claim data. Before any JSON projection is prepared, raw processing input sizes are conservatively counted via length(CAST(payload_json AS BLOB)) per LEFT JOIN item, each independently coalesced. Existing HistoryReadBudget must admit these UTF-8 bytes before JSON projection preflight/delivery. This is logical processing accounting, not measured RSS or Native qualification.

Reader requires Item/Revision schema/version, ACTIVE/PUBLISHED status, matching identity/head/type, experiment labels, receipt membership and command-entry/record equality. Pending/nonpublished or inconsistent/corrupt rows are errors, not hidden as valid empty search. Source metadata is returned without pretending to authenticate live freshness.

Real Promise results cannot be synchronously joined: rejected responses are safely handled, cleanup remains UNKNOWN and that Index instance refuses further search/rebuild. A declared async checker is rejected before invocation. This does not create a production permission model or settle arbitrary external work.

## Derived index and search

Explicit rebuild creates a fresh private in-memory SQLite FTS5 database with unicode61, storing only item/revision IDs and title/summary/goal. No raw code, support or Claim body, source prompt or embedding. Text comes only from owned experiment display fields; no actual secret-safety or production-read permission is asserted. Failed rebuild retains the prior index where settled/usable; UNKNOWN blocks further work. Canonical experimental rows/history are never changed by search/rebuild. No persistent production index is installed.

Index binds workspace, complete head ID-set digest (codeatlas.offline-search.heads.v1) and displayed text digest (codeatlas.offline-search.text.v1). Both use SHA256(domain+NUL+existing canonicalCompilationJson). Rebuild verifies head stability before installation. Search rereads the permitted projection and verifies current head/text binding before MATCH, then rechecks manifest/heads/permission before exposing results. Permission checks happen before retrieval and result materialization, not by deleting output afterward. Field scanning is conservative and bounded; this prototype does not claim production-scale query costs or physical resource qualification.

Private request is exactly text and maxResults. maxResults must be explicit positive safe integer within caller's original SQL budget; no numeric defaults. Text is an escaped literal FTS phrase, not caller FTS/SQL expression syntax. Ranking uses built-in bm25 then stable item/revision IDs; rank is not semantic confidence. Required output/processing bytes, rows and traversal limits apply; truncation and totalMatches are explicit.

Only available/authorized successful zero hits returns an empty result. INDEX_UNAVAILABLE, PERMISSION_DENIED, QUERY_INVALID and original typed control/limit failures are distinct. A head/text change invalidates the index until explicit rebuild. AFFECTED/STALE knowledge remains searchable with warnings when the head/index is unchanged; freshness and index validity are separate. All results retain OWNED_TEST_PUBLICATION, productionQuery NOT_AUTHORIZED, NO_SECRET_CLEARANCE/NO_QUALITY_ADMISSION/NO_GRAPH_EXPANSION limitations. Scope/freshness/currency are experimental metadata, not real Source or quality evidence.

## Remaining original work

Production read authority/classification, actual W011 published source, same-transaction production FTS update, full PublishedKnowledgeQuery/ResultMeta/token-budget adapter and bounded graph expansion remain OPEN. No phase scope is deferred or waived. Rollback disables the private component and discards only its owned in-memory derived index; original rows/receipts/history stay untouched.
