# P1-11 private offline semantic invocation boundary

Implements knowledge-and-consumption section4 within existing Application/IR
boundaries. Four tasks only: CAPABILITY_SYNTHESIS, BUSINESS_FLOW_SYNTHESIS,
COMPONENT_SUMMARY, CLAIM_EXTRACTION. No dependency, public schema/export, HTTP
client, endpoint, real model, Source read, database or publication is introduced.
This is a TEST_DOUBLE safety component, not full SemanticContextBuilder or E08/E14.

The request keeps exactly the seven declared fields: taskKind,promptRef,
modelPolicyRef,outputSchemaRef,authorizedContext,inputDigest,invocationBudget.
Private context refinement is {instructionRef,dataLabel:'UNTRUSTED_DATA',scope,
inputSnapshotRef,data,referenceContext}; instructionRef equals promptRef. The
provided reference context is structurally validated and copied; it is NOT a
permission or actual snapshot record. inputDigest is SHA256 of canonical context
bytes, an offline integrity hint. inputSnapshotRef uses the locked kind/id-only
shape. No caller Boolean can authorize production context.

invocationBudget explicitly supplies maxInputBytes/maxOutputBytes, no defaults.
The same caller-owned account supplies checkpoint/own/reserveBuffer/visitItem/
invalidate plus reserveCall and chargeUsage({inputTokens,outputTokens}); calls,
copies/work and reported usage stay with that run owner, never a fresh per-retry
budget. Unknown usage invalidates and refuses. Failed/incomplete attempts still
consume a call and invalidate the owner; no retry/repair/expansion/fallback loop.

Only a private TEST_DOUBLE port is accepted: fixed identity
{providerId,modelId,adapterVersion}, explicit outputMode NATIVE_JSON_SCHEMA/JSON/
PROMPT_JSON, and generate(request,control):Promise<result>. Port references and
request/control are snapshotted without getters/proxies. No endpoint redirects or
real adapter path exists. A port label cannot establish real model evidence: all
successful outputs are permanently TEST_DOUBLE/NOT_EVALUABLE, publication not
attempted, context authorization NOT_ESTABLISHED.

Result keeps structuredOutput,identity,usage,finishReason,outputDigest,warnings.
STOP is the only complete finish; LENGTH/CANCELLED reject. Bound output bytes and
digest, identity and schema/task correspondence, candidate-only publication state,
scope/snapshot binding and all references using existing parseKnowledgeCandidate
or parseClaim. These are schema/allowed-reference checks only. Model confidence,
authority and semantic truth are NOT verified or admitted for publication. Raw
errors/warnings/URLs are not logged; warning presence becomes a safe generic code.

Cancellation/deadline uses the original intrinsic signal and fixed deadline. Await
the actual generation promise to settle before rejecting cancelled work; no race
that abandons a live worker. Port contract must join its own tasks. Thenables are
not awaited. Invalidation failure stays UNKNOWN. No partial result becomes output.
After generation settles, bounded usage metadata is recorded before cancellation/
deadline output refusal. chargeUsage is synchronous settlement and must not skip
accounting just because the request was cancelled. Errors report usageSettlement
NOT_ATTEMPTED/RECORDED/UNKNOWN separately from cleanupState. Missing usage remains
UNKNOWN; an asynchronous budget settlement also leaves cleanup UNKNOWN. This is
reported usage, not independent verification of provider token measurements.

Tests use self-owned context snapshots and local JS doubles: four task success,
injection-as-data, unknown task/schema/capability/provider, hallucinated references,
wrong scope/snapshot/digest, partial output, usage/call budget, errors/thenables,
and cancelled generation settlement. Actual policy/redaction/producer provenance,
transport/adapters/model quality and complete workflow remain unimplemented and
separately gated. Rollback disables this private entry; there is no persisted state.

Evidence (2026-11-07): Application build passed;18 local-double cases plus29
owned-database/schema/backup cases passed together (47/47), architecture17 passed.
Independent review identified cancelled-attempt usage loss; the strengthened test
failed before the settlement fix, then passed with deadline/unknown-usage cases.
Initial API-absence tests and W010 candidate-state test also demonstrated RED.
No real model, user body, permission, production adapter or database was involved.
