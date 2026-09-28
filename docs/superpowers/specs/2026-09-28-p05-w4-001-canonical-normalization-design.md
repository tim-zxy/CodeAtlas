# P05-W4-001 Canonical Normalization and Fact Identity Design

Status: Accepted by user for implementation planning (2026-09-28). Product implementation still awaits review of the task plan.

## Purpose and authority

Turn complete, validated Phase 0.5 Native Java Provider facts into language-neutral Canonical Code IR without guessing targets or tying canonical identity to a Provider. This unblocks P05-W4-002 FactMerger and P05-W1-010 full apply; it does not perform either task. The accepted starting point is the user's conservative, backward-compatible approach: retain the current strict Provider/Canonical IR shapes, use source position where the current ProviderNode has no signature, and expose the resulting line-movement limitation.

Governing authorities are ADR-002, ADR-010, ADR-012; `docs/handoff/DESIGN_AUTHORITY.md`; `docs/handoff/specs/CANONICAL_IR.md`, `PROVIDER_SPI.md`, `EVALUATION.md`, and `MODULE_BOUNDARIES.md`; `docs/handoff/WORK_BREAKDOWN.md` P05-W4-001; and the P05-W4-001 row of `DESIGN_TRACEABILITY.md`. No FROZEN schema, SQLite migration, Native IPC payload, ProviderSnapshot, or numerical Quality Gate changes in this task. If exact method-signature identity or a separate source-unit Canonical kind becomes necessary, stop and propose an ADR rather than adding an unvalidated field or type.

## Scope and boundaries

- Add one pure normalization entry point in `@codeatlas/providers` that accepts a fully validated, completed v1 or v2 Native `ANALYZE` result (`SUCCEEDED` or `PARTIAL`, with the latter retaining its coverage limitations). Recheck the necessary request/event context and strict Provider Fact schemas at this boundary; reject `DESCRIBE`, `REFRESH`, failed, truncated, corrupt, or mixed-context streams. The Native client remains responsible for raw JSONL byte framing and checksum verification. Normalization does not authorize publication of a partial graph.
- Normalize only the Java Provider kinds already emitted by the Native Analyzer. A kind outside the reviewed map is an explicit typed failure, not a silently dropped fact and not a guessed `OTHER`.
- Return deterministic, key-ordered pairs of each Provider fact reference and its Canonical node or edge, plus the provider-to-canonical node lookup needed to resolve edge references. The return value is complete or absent; no mutation, I/O, SQLite write, Evidence row, binding row, activation, confidence aggregation, or deduplication occurs.
- Keep `@codeatlas/ir` provider-independent. The Java-kind map lives below it in `@codeatlas/providers`; Canonical schemas remain the validating output boundary. The function is not a framework Plugin, Knowledge compiler, or general-purpose language registry.

## Data flow and mapping

The normalizer validates the complete stream, collects all ProviderNode events, computes and validates Canonical nodes, then maps ProviderEdge source, resolved target, and candidate references through the node lookup. It validates every Canonical result before returning the batch. Input order cannot affect keys, IDs, references, or output order; stable sorting uses Canonical FactKey and Provider Fact reference only as a tie-breaker, never as semantic identity.

| Native `providerKind` | Canonical output | Identity and location policy |
| --- | --- | --- |
| `java.package`, `java.package_container` | `PACKAGE` | The same qualified package name in one repository/revision yields the same key. A package declaration retains its source range in its normalized candidate; a synthetic container has `null`. P05-W4-002 must choose any merged display location deterministically without treating one declaration as the sole support. |
| `java.compilation_unit` | `MODULE` | A file-scoped source unit identified by its normalized repository-relative path, not a build-system module. This preserves the source endpoint of file-level import edges. Canonical `sourceRange` is `null`; the path remains its name/qualified name. |
| `java.class`, `java.interface` | `TYPE` with `CLASS` or `INTERFACE` | Require a qualified name and source-backed name range; include source-file identity and name position so duplicate declarations are not conflated. |
| `java.method`, `java.constructor`, `java.field` | `SYMBOL` with `METHOD`, `CONSTRUCTOR`, or `FIELD` | Require a qualified name and source-backed name range; include source-file identity and name position. Overloads with the same qualified name remain distinct. |
| `java.import.normal`, `java.import.static`, `java.import.wildcard` | `IMPORT` edge | Preserve source unit, resolved target or honest non-resolved hint/candidates, and source callsite. Import variant remains Provider detail; the Canonical edge kind is language-neutral. |
| `java.call`, `java.inheritance`, `java.reference` | `CALL`, `INHERITANCE`, `REFERENCE` edge | Preserve exact source/target state, resolution, candidate order, confidence, and source callsite. |

No `OVERRIDE` Provider edge is currently emitted, so the task does not synthesize one. Every source-backed range must reference a SourceFile in the validated request; a `java.compilation_unit` path must match one of those repository-relative source paths. A resolved reference to an absent ProviderNode, an unresolved candidate without a mapped node, wrong repository/revision/snapshot/provider context, missing required qualified name/range, duplicate Provider Fact ID, or contradictory payload fails atomically with a controlled diagnostic path. Non-resolved targets stay `UNRESOLVED`; ambiguous candidates are never reduced to one target. When distinct Provider candidate refs map to the same Canonical node, collapse only those duplicate Canonical refs in first-seen order; if that would leave fewer than two candidates for an `AMBIGUOUS` target, reject the contradictory observation rather than promoting it to resolved. A source range or hint is never inferred from stderr or surrounding source text.

## FactKey and Canonical ID v1

Use domain-separated, length-delimited UTF-8 tuples and SHA-256 to derive opaque `NodeFactKey`, `EdgeFactKey`, and `CanonicalId` strings. The exact wire-independent encoding is `UTF8(domain) + NUL +` each field encoded as its UTF-8 byte length in unsigned decimal ASCII, `:`, then its exact UTF-8 bytes; integer fields use base-10 ASCII without a leading zero except zero itself. Emit `domain:lowercase-hex-digest`. The versioned domains are `node-fact-v1`, `edge-fact-v1`, `canonical-node-v1`, and `canonical-edge-v1`. Encoding must not rely on JSON object-key order, platform path separators, Provider ID, Provider Fact ID, snapshot ID, event order, or runtime version. Two providers describing the same canonical tuple produce the same key/ID. Different repository or revision identities remain distinct.

Ill-formed UTF-16 strings with unpaired surrogate code units are not valid identity fields: reject them before UTF-8 conversion rather than allowing replacement-character substitution to alias a distinct repository, revision, path, name, or hint. Surface the offending input field as a controlled normalization error. Well-formed supplementary-plane characters retain their ordinary UTF-8 encoding and the pinned version-1 vectors do not change.

The exact node field orders are:

- `PACKAGE`: repository ID, revision ID, `PACKAGE`, qualified package name.
- File-scoped `MODULE`: repository ID, revision ID, `MODULE`, normalized repository-relative path.
- `TYPE`: repository ID, revision ID, `TYPE`, type subkind, qualified name, source-file ID, then zero-based start line/column and end line/column.
- `SYMBOL`: repository ID, revision ID, `SYMBOL`, symbol subkind, qualified name, source-file ID, then zero-based start line/column and end line/column.

The actual Canonical `name`, `qualifiedName`, `sourceRange`, and `confidence` stay schema-valid output fields, not alternate sources of identity. Identical keys can appear more than once in the output when independent Provider facts support one Canonical fact; collapsing support and choosing a final confidence/source display is P05-W4-002.

The exact edge field order is repository ID, revision ID, Canonical edge kind, source-node FactKey, source callsite's source-file ID/start line/start column/end line/end column, then target discriminant (`RESOLVED` or `UNRESOLVED`) and either target-node FactKey or exact original hint. Resolution level and candidate list remain Canonical target payload, not FactKey inputs, so two incomplete observations of the same site/hint can be reconciled by P05-W4-002. A CALL key therefore includes caller, resolved target or unresolved hint, callsite, and revision semantics as required by `WORK_BREAKDOWN.md`. A change between resolved and non-resolved target identities can change the key; P05-W1-011 must remove stale prior support during patch apply. Null callsites cannot give a stable source-grounded edge key in this task and are rejected rather than keyed by Provider ID.

`CanonicalId` is deterministically derived from one field containing the appropriate FactKey under its separate `canonical-node-v1` or `canonical-edge-v1` domain label. This is an implementation rule for P05-W4-001, not a reinterpretation of the opaque ID schemas. The tuple encoding and representative digests are pinned as version-1 test vectors; changing them later requires reviewed compatibility and migration analysis.

## Known limitation and design guardrail

The current strict ProviderNode contract has no source-spelled signature field. Location is therefore necessary to distinguish same-name Java method and constructor overloads without importing a Native-specific Provider Fact ID into Canonical identity. Pure line or column movement may produce a new key, even if the declaration is semantically unchanged. This task reports that limitation; it does not promise cross-revision semantic identity preservation, alter the IR schema, parse source again, or infer signature from a Provider Fact ID. Future signature-aware identity requires an ADR, migration and Fixture review. A provider that records a different name span may conservatively produce separate support rather than a false merge.

The `MODULE` mapping above denotes a file-scoped source unit only for this normalization profile. It does not assert Java language-module or Maven/Gradle build-module semantics. If downstream queries need those concepts separated, use a governed Canonical IR design change before implementation rather than silently overloading this mapping further.

## Fixtures, failure behavior, and acceptance

Register a P05-W4-001 `canonical-normalization` Fixture with exact Provider input and Canonical node/edge golden files. It must cover package declarations across two files plus a synthetic package container, compilation-unit import sources, class/interface/method/field/constructor mappings, and resolved and ambiguous/unresolved targets. Separate key-vector cases vary Provider identity without trying to place two Provider identities in one Native process stream. Pin tuple/digest vectors and output order. Use the existing `java-overload`, `java-call-basic`, and `java-inheritance` Provider goldens as additional inputs without altering their v1 facts.

Failing-first tests must cover duplicate/unknown kinds, missing or cross-context references, malformed qualified names/ranges, invalid completed-stream context, unsupported terminal type, non-resolved candidate preservation, permutation of the fact-collection stage without breaking IPC sequence/checksum rules, provider/snapshot changes that must not change Canonical keys, and an overload pair that must not collide. Failure returns no partial normalized batch. Contract and type tests exercise strict `CanonicalNodeSchema`/`CanonicalEdgeSchema`. The existing canonical comparator can check unique-key golden cases; duplicate-support cases compare the ordered Provider-to-Canonical pairs directly because the comparator correctly rejects duplicate Canonical IDs before FactMerger. Run the root Node fileset, all TypeScript builds and IR type tests, architecture checks, Prettier, and Git whitespace checks. Native Java source Fixtures remain unchanged. No new numeric accuracy or performance threshold is introduced.

Task completion records the exact Fixture ID, commands and counts, schema/migration impact (`none` unless separately governed), known location-based identity limitation, and next dependency-valid task in `CURRENT_STATUS.md`; synchronize the P05-W4-001 traceability row and controlling specifications after this design is accepted. P05-W4-002 FactMerger and P05-W1-010 apply remain separate tasks. Phase 0.5 promotion remains blocked on all outstanding `PHASE_ACCEPTANCE.md` gates.
