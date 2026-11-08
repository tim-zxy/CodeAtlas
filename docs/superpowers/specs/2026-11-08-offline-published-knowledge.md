# Private exact published-version reader

Existing P1-15 implementation refinement under knowledge-and-consumption sections 5/7 and agent-api view_knowledge. This is a private module method on the owned experimental publication store, not a public Query route, W011 migration, production read authority or full P1-15 acceptance.

## Selection and access

readPublishedKnowledge accepts a nonempty unique exact itemId/revisionId set. It returns that receipt-backed PUBLISHED version, including historical versions; it never substitutes a latest revision. The separately observed currentHeadRevisionId/isCurrentHead describe the same read snapshot. Missing, pending, foreign-workspace, denied or corrupt members fail the whole selection. Stored AFFECTED/STALE flags remain warnings, with LIVE_SOURCE_NOT_OBSERVED and, where applicable, HISTORICAL_PUBLISHED_REVISION. Stored CURRENT does not prove live Source currency.

Before any selected bodies, a frozen complete selection/field manifest is checked by TEST_KNOWLEDGE_READ_NOT_AUTHORITY. The synchronous test assertion port is checked again before output; it is not a production principal or clearance. Declared async refuses before invocation; an actual Promise is handled without unhandled rejection, marks cleanup UNKNOWN and blocks subsequent knowledge reads on that store. Caller transactions are not adopted. A private savepoint, original connection marker and exact schema prove read-transaction continuity around callbacks; uncertain ownership refuses.

## Dedicated projection

Parameterized SQL counts raw UTF8 stored bytes before processing JSON, under the existing shared HistoryReadBudget and request controls. Only selected Item/Revision envelopes, pruned reference-context metadata, original matching candidate coverage and provenance IDs enter JS. Never call readState/committed/command or materialize complete snapshot/stateBinding/Claim bodies. Context includes only the selected revision's actual scoped references/support identities and their required basis references, not other candidate inventories. No reference authorizes a source body.

Receipt, command entry, revision row, Item/Revision identity/type/status, prior pointer/operation, same-item predecessor, candidate content/support/snapshot and provenance must agree. Candidate coverage is read from the corresponding original candidate; neither coverage nor quality is invented. Results are owned and deeply frozen. Output stays OWNED_TEST_PUBLICATION / quality NOT_EVALUABLE / productionQuery NOT_AUTHORIZED.

No database writes, history rewrite, source rescan, model, new dependency, graph expansion or Wiki profile policy. Public token-budget/ResultMeta adapters, production authorization/classification, real W011 source and formal quality gates remain OPEN. Disable the private reader to roll back; immutable experimental history is unchanged.
