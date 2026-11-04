# Phase1 first-batch implemented contract record

Status: P1-00..02 local contract implementation, 2026-10-22. Authority: [ADR-020](../../handoff/adr/ADR-020-phase1-contracts-and-evaluation.md). This records the bounded first publication of the new APIs; it does not activate later Phase1 workflows or close a Phase1 exit.

## Evaluation

Package evaluation exports evaluatePhase1Report(unknown). The codeatlas.phase1-evaluation envelope is version 1. Input is strict Phase1EvaluationInput: identity includes Fixture/manifest/input/expected/implementation/config/policy digests and version/null-reason inventories; requiredObligations enumerate layer, kind, criticality, execution kind, oracle and applicability; observations bind these identities and explicit artifact/basis references. The output retains input provenance and reports gates/overall/missing/failed/notEvaluable/notApplicable.

ASSERTION and RATIO obligations are distinct. RATIO uses the explicitly approved input/expected-bound baseline; a missing or proposed baseline, a zero denominator, absent observation or a mismatched execution identity cannot create PASS. PURE_CONTRACT, RECORDED_REPLAY, TEST_DOUBLE, ACTUAL_PRODUCT and ACTUAL_MODEL remain distinguishable. Actual execution requires artifact and basis references. The helper validates the report contract, not the authenticity of a caller's evidence or approval claim; later trusted runners load and authenticate those records. Empty Manifest v1 qualityGates confer no Phase1 approval. Synthetic test thresholds are not production baselines.

## New Canonical IR

New version-1 envelope parsers: codeatlas.runtime-fact-set, runtime-flow, syntax-evidence, document-bundle, claim, knowledge-candidate, knowledge-item and knowledge-revision (each with the codeatlas. prefix). Unknown names, versions, extra fields, non-JSON descriptors, proxy/accessor/sparse/cyclic inputs are refused. Old Code/Common/Source/Evidence schemas and strict Code/Provider/IPC versions stay unchanged.

RepoBasis binds repositoryId/revisionId/contentFingerprint/codeActivationDigest. DocumentBasis binds documentId/documentRevisionId/contentFingerprint. WorkspaceBasis binds workspaceId/revisionSetId/workspaceActivationDigest. SupportRef contains basis/entity/valueDigest; its entity revision must match that basis. ScopedRef contains REPOSITORY + repositoryId or WORKSPACE + workspaceId around the existing EntityRef. Reference contexts contain unique availableEntities/availableSupports. Parsers verify closure, typed references, support ownership and matching basis; they do not authenticate a mutable database or authorize publication. Application/Storage must supply an authorized frozen inventory.

Runtime includes EntryPoint, Task, DataResource, Trigger, typed HTTP/MESSAGE/RPC Contract signatures, ExecutionContext/Node/Edge and RuntimeFlow steps/branches/boundaries. Local IDs/fact keys, context ancestry, edge endpoints/context, step ordering/references and explicit cross-context boundaries are checked. Source ranges retain the existing coordinate convention. SyntaxEvidence has typed literal/reference/array/object/unknown arguments and owner/source/support closure, with resolution cardinality checks; this is not Native observation or framework recognition.

Documents include Document/Revision/Section/Block/Table/Link/CodeSnippet/EntityMention/Chunk and typed Claim. DocumentRange binds DocumentRevision rather than pretending to be a SourceFileRange. A document revision's sourceBasis is RepoBasis or DocumentBasis, not WorkspaceBasis; workspace matching facts instead use WorkspaceBasis on SupportRef. Revision/block/section/reference and table/snippet projections are checked. Draft document pointers may be null. Claim state intent is CURRENT/TARGET/HISTORICAL/TRANSITION/DESIRED; it is not a publication decision.

Knowledge content is a strict COMPONENT/CAPABILITY/INTEGRATION/BUSINESS_FLOW/RUNTIME_FLOW_REFERENCE union with typed references and supported steps. Candidates stay CANDIDATE. Active items require a published revision pointer; draft items cannot have one. Revisions retain snapshot, evaluation and previous-revision provenance. The schema can describe degraded provenance honestly, but P1-02 keeps that production path disabled. No generator, publisher or wiki renderer is implemented here.

## Effective configuration

Runtime exports loadEffectiveConfig(ConfigurationSources) and buildConfiguredRuntime(sources, builder). Sources are already-read YAML strings plus explicit defaults and maxInputBytes; no file discovery, environment-secret reading or model connection occurs. Repository overrides workspace, then global, then defaults; arrays replace. Every supplied layer requires configVersion 1. The returned configuration is deeply immutable and does not mutate inputs.

YAML uses exact yaml@2.8.2, YAML 1.2 core, one document, unique string keys, no aliases/custom tags/warnings. Total UTF-8 input bytes are checked before YAML parsing. Unknown keys produce UNKNOWN_CONFIG_KEY at the known container path, without echoing unknown key/value text. Embedded secret material is rejected; credentialRef accepts only an ENVIRONMENT name. Parser details and input values do not escape CONFIG_INVALID.

The known configuration keys are:

- runtime: mode ONE_SHOT or MCP_STDIO; absolute workspaceRoot, normalized after validation.
- indexing: nativeAnalyzer.parseWorkers AUTO or explicit positive integer; resourceBudget with maxInputBytes/maxOutputBytes/maxItems/maxDepth/maxDurationMs/maxMemoryBytes.
- providers/plugins: unique providerId/pluginId, enabled, configurationSchemaVersion and JSON configuration. Later trusted extensions validate their own configuration schema.
- knowledge: defaultScope AUTO/REPOSITORY/WORKSPACE/CROSS_REPO/ALL, defaultMode AFFECTED_ONLY/FULL, degradedCandidates false.
- llm: enabled, endpoint or null, credentialRef or null, allowRemoteFallback, resourceBudget or null. Model budget keys are maxInputTokens/maxOutputTokens/maxInvocations/maxDurationMs.
- embedding.enabled false; agents.defaultDepth L0/L1/L2.
- security: localOnly/remoteLlmEnabled/remoteEmbeddingEnabled/allowSensitiveRemote/allowRawSourceRemote booleans.

No resource number is invented or approved by this implementation. Required budgets are explicit positive safe integers. Enabling LLM requires endpoint and model budget. HTTP(S) endpoint syntax disallows embedded credentials/query/fragment; non-loopback endpoints additionally require remote opt-in and localOnly false. Actual transport must later validate resolved destinations/redirects; syntax checking is not network isolation. buildConfiguredRuntime forwards only the existing bootstrap mode/root/version, returning the full effective config for later explicit consumers; it does not apply future adapters or silently change native admission budgets.

## Operation authorization

Application exports authorizeOperation(unknown). The strict input carries operation, PRIMARY/REPAIR/FALLBACK phase, workspace/repository scope, caller capabilities, permissionContext, classified RAW/DERIVED source, LOCAL/REMOTE destination and explicit security settings. Both caller and permission context must grant the operation and scope. QUERY does not grant UPDATE_KNOWLEDGE, INDEX, READ_SOURCE or REPROJECT_WIKI. The model and embedding grants/remote flags remain independent.

Source policy blocks and explicit derived-access refusals win. Secret detection refuses all use; default secret paths/raw secret classifications refuse raw use. Explicitly allowed derived metadata is local only. Remote raw use additionally requires READ_SOURCE and allowRawSourceRemote; sensitive remote use requires its own flag. localOnly applies to repair and fallback, and remote fallback requires explicit permission. Every decision has fallbackAllowed false; no caller may treat a denial as permission to change destination. Decision codes: ALLOWED/PERMISSION_DENIED/SECURITY_POLICY_BLOCKED/SECRET_DETECTED/REMOTE_DISABLED. Malformed input produces POLICY_INPUT_INVALID without raw details.

These are pure decision functions, not identity authentication. Future command/model/source adapters must construct trusted inputs and enforce the result at each side effect. No model, network, publication or CLI command enforcement E2E is claimed by this contract batch.

## Fixture and evidence boundary

p1-report-contract-v1, p1-ir-contract-v1 and p1-security-config-v1 use independent literal inputs/expected artifacts and executable positive/negative controls. They are discoverable by the existing Manifest v1 registry. The final [batch review](../reviews/2026-10-22-phase1-first-batch-review.md) records commands and outcomes. No new migration, SQL checksum, numeric quality threshold or Native profile is introduced. Phase0.5 UNKNOWN timeout and accepted residual issues remain tracked.
