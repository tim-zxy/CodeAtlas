# P1-11 compatible JSON response-side slice

Existing knowledge-and-consumption section4 and P1-11 plan support Runtime adapters and owned protocol fixtures independently of A6. This batch implements only a private response adapter into the existing TEST_DOUBLE Application port. It is not the complete compatible HTTP adapter: no request/prompt encoder, endpoint selection, headers/credentials, socket, streaming transport, repair/retry/fallback, production export or real-model authority was added. P1-19 init remains unimplemented because exact creation schema/layout/defaults are not sufficiently fixed; no values were invented.

createCompatibleJsonTestPort fixes explicit identity, maxResponseBytes and a trusted owned exchange callback. The callback receives the already-owned original seven-field request/control and must return a genuinely settled Promise of bounded response text. Its internal resource ownership/settlement remains its responsibility. The adapter checks response UTF8 bytes before parsing and accepts only the limited one-assistant-choice JSON mode. This is a decoder bound, not a promise that an arbitrary callback did not allocate a larger response first or a hard RAM limit.

The existing approved yaml dependency checks duplicate raw keys after JSON.parse establishes strict JSON grammar; neither endpoint nor dependency/lock changes follow. Native JSON-schema/prompt-JSON and unsupported/tool/refusal outcomes are not promoted. The existing six result fields remain unchanged. Application independently accounts reported usage, checks model identity/output digest, scope/snapshot/reference/schema and candidate-only effects. Known usage is returned even when content, identity, finish or post-exchange cancellation refuses output. Invalid or ambiguous outer usage stays UNKNOWN, never zero. TEST_DOUBLE/NOT_EVALUABLE/NOT_ESTABLISHED and publication NOT_ATTEMPTED remain.

Initial API-absence RED failed6 of7 new tests; one broad rejection test was tightened so missing API could not falsely satisfy it. Initial Runtime build exposed the newly added type import's reach into Application inferred Zod declarations; using the established RuntimeWorkflowRequest control type removed that new reach without modifying Application or adding zod. A test's NOT_ATTEMPTED expectation was corrected to existing generation-started UNKNOWN semantics.

Independent review found two P2 issues: raw duplicate JSON keys were silently folded, and digest/control failure discarded the parsed tree, hiding BUDGET_EXCEEDED. Three raw-string/depth/work regressions reproduced both issues before fixes. Both decoding layers now reject duplicates, including escaped key names. Parsed content survives digest/control failure so Application can settle usage then enforce its original budget/cancellation checks. Ten focused tests passed after fixes; narrow independent re-review found no remaining P1/P2. Reviewer read only, did not run tests/model/network.

Exact final verification command and fresh totals are recorded in CURRENT_STATUS and the retained local targeted-tests.log; no full suite, Native/actual22 or hosted CI success is inferred. Existing knowledge-identity owned literal candidate fixture bytes were reused unchanged and original semantic/captured BusinessFlow/Capability suites retained. No new Phase1 Fixture acceptance or model-quality result is claimed.

Reproduction:

```
node node_modules/typescript/bin/tsc -p packages/runtime/tsconfig.json
node --test --test-concurrency=1 packages/runtime/test/compatible-json-test-port.test.mjs packages/application/test/semantic-test-invocation.test.mjs packages/application/test/owned-capability-input.test.mjs packages/application/test/captured-business-input.test.mjs scripts/test-workspace-structure.mjs
node scripts/check-architecture.mjs
```

All inputs and responses are self-owned literals and fake callbacks; no local HTTP server or model was started. The original27 pre-existing worktree entries are outside this batch. Public adapter/reader trust rules, fixed qualification candidate79da401, measurements, gates, installed components and resources remain unchanged. This new development source does not inherit old source qualification. Phase1 remains4/21; A6 NOT_QUALIFIED; E02 PROPOSED/uninstalled. Rollback disables this private factory and retains histories/evidence.
