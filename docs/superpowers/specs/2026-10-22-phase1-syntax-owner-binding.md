# Accepted v4 owner-binding contract detail

Authority: ADR-020 accepted mixed Native amendment and user approval2026-10-22. This packet implements the already approved basis separation; actual process/profile/Store acceptance remains in P1-04/05.

## Exact fields

Replace unpublished request payload basis with expectedActivationBasis: RepoBasis|null and targetSource: {repositoryId,revisionId,contentFingerprint}. Null means no active Code and must be authenticated as absent by Application; never use a zero or fabricated activation digest. targetSource is the authorized current Source target, not automatically the indexed graph's Source fingerprint. Existing sourceFiles and canonical owner refs bind target repository/revision. expectedActivationBasis, if present, belongs to the same repository but can represent the old active Source/revision.

ownerBinding is a strict union:

- ACTIVE_CODE: kind, codeActivationDigest, ownerMapDigest. expectedActivationBasis is non-null, targetSource equals its repository/revision/contentFingerprint and codeActivationDigest equals that active basis. Actual per-file Source/owner inventory still must match the trusted captured context.
- PROVISIONAL_CODE: kind, stageDigest, ownerMapDigest. stageDigest binds the authorized provisional Code stage. No stage path, database access or final candidate basis is transmitted. Source target and old expected activation remain distinct.

SYNTAX_STARTED/SYNTAX_COMPLETED echo all three expectedActivationBasis/targetSource/ownerBinding plus extractorVersion. The successful terminal checksum still authenticates exact pre-terminal raw bytes including LF. finalCandidateCodeBasis is deliberately absent from the request and terminal; it is computed only after normalization/FactMerger and authenticated by P1-05 before atomic Code+Syntax Apply. Adding an early finalCandidateCodeBasis field is refused.

## Owner-map digest encoding

Use SHA256 over UTF-8 domain codeatlas-native-syntax-owner-map-v1 followed by NUL. Each subsequent string or nonnegative integer is encoded as ASCII decimal UTF-8 byte length, colon and UTF-8 value; this reuses the existing identity-tuple framing. Return lowercase64 hex, without a domain prefix. All strings must be well-formed Unicode; numbers safe and nonnegative.

Field sequence: targetSource repositoryId/revisionId/contentFingerprint; expected tag ACTIVE or NONE and, only for ACTIVE, its repositoryId/revisionId/contentFingerprint/codeActivationDigest; ownerBinding kind and active codeActivationDigest or provisional stageDigest; providerId/providerSnapshotId; source-file count followed by files sorted by UTF-8 ID bytes, each id/path/contentFingerprint/languageHint-or-empty/role/provenance/contentKind/sensitivity; owner count followed by owners sorted by UTF-8 sourceFileId, providerId and providerFactId, each sourceFileId/providerId/providerFactId/canonical repositoryId/entity kind/entity id/entity revision. Owners must be repository CODE_NODE refs in the target revision. Duplicate file/owner identities are refused by request validation, never silently deduplicated.

Changing source metadata, owner map, expected active basis, snapshot or stage changes the digest. Budgets/root locator are not semantic owner identity. The descriptor/extractor version remains independently echoed/checked by the existing request/terminal contract.

## Trust boundary

computeSyntaxOwnerMapDigest accepts only the strict digest input fields (binding without its digest); it computes a structural binding, not database authority. validateSyntaxOwnerContext(request,capturedContext) reparses both strict inputs, recomputes the captured owner map and compares expected activation, target, binding mode/stage and digest. It cannot authenticate arbitrary caller-provided capturedContext. Runtime/Application must obtain that context from its own authorized immutable snapshot/stage, never from a model/CLI scalar token. Missing, changed or cross-stage context refuses. Live capture/recheck/CAS and final candidate validation remain mandatory P1-05 duties and are not proven by pure unit tests.

## Compatibility and evidence

Old Code/ProviderSnapshot and IPC1..3 stay strict and unchanged. Existing syntax-contract root/raw bytes remain original historical evidence, not a claim that the replaced unpublished v4 request remains executable. New p1-syntax-owner-binding-v1 raw Java/Python/provisional cases pin the new bytes, literal digest and checksum oracles; TypeScript and Rust consumers use the same files. No automatic adapter or real descriptor advertisement. No new numeric default/profile/capability maturity.
