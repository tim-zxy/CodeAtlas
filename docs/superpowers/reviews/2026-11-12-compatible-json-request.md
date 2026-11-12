# P1-11 owned compatible chat-JSON request/response slice

Existing ADR-008, knowledge-and-consumption section4 and P1-11 permit Runtime
encoding and owned protocol fixtures independently of A6. This implements a
private chat-JSON-v1 test path around the response-side port, not production
endpoint/credential/prompt-registry or model authority. Existing seven request
and six result fields, Application validation/accounting and public exports stay.

Factory fixes explicit identity, prompt task/ref/schema/instruction text, policy
ref/output-token cap, request/response byte ceilings and a trusted fake HTTP-shaped
callback. Bindings are owned copies, not authority. Wire has model, stream:false,
max_tokens, response_format:json_object and two messages: only fixed host
instructions become system text; the full original UNTRUSTED_DATA context is the
user message. This version uses the explicit legacy max_tokens wire field; it
makes no compatibility claim for every actual endpoint/model. No token defaults,
real tokenizer or independent token-quality measurement is invented.

Wire bytes must fit both the explicit host request ceiling and original request
maxInputBytes; no input/support truncation. Prompt/policy/task/schema mismatch
refuses before callback. Returned status must be200; redirects/server failures
refuse without retry/fallback or raw-body errors. This checks the fake callback's
returned status, not an actual HTTP client's redirect/DNS/TLS behavior. The
callback receives no URL/headers/credentials and owns its resource settlement.
Only actual Promises are awaited; cancellation joins the pending exchange then
existing Application settles reported usage and rejects output. No new usage
refund/reset or production permission follows.

Initial missing-API RED preceded implementation. Final Runtime build and focused
16 new/old protocol cases passed; one concentrated affected regression passed
79/79,0fail/cancel/skip/TODO,5108.0087ms; architecture17 passed. Existing registered
Runtime suite includes all six added request cases. Independent read-only narrow
review found no P1/P2. Literal wire expectations, instruction/data separation,
immutable binding, mismatch/no-call, byte rejection, redirect/server no-retry and
pending cancellation/usage are covered. No real HTTP server/socket/model was used.

Reproduce:

```
node node_modules/typescript/bin/tsc -p packages/runtime/tsconfig.json
node --test --test-reporter=tap --test-concurrency=1 packages/runtime/test/compatible-json-test-port.test.mjs packages/application/test/semantic-test-invocation.test.mjs packages/application/test/owned-capability-input.test.mjs packages/application/test/captured-business-input.test.mjs scripts/test-workspace-structure.mjs
node scripts/check-architecture.mjs
```

Raw local log .superpowers/sdd/2026-11-12-compatible-json-request/targeted-tests.log.
Last sourceed8efd4 CI217 is terminal TS/Rust PASS, Native FAIL at the oldR8 script
catalog prerequisite; actual22 SKIPPED. New source/CI outcome is separate.

Native root cause was checked from actual CI217 artifact13928208180
(native-memory-observations,681-byte archive), script-catalog/result.json:
expectedCount189,currentCount209,20added,0removed,15changed,nativeQualified:false.
Added entries include principal deployment/build and R9 stop helpers; changed
entries include ci-pack/layout, Native CI, transport/verification and tests.
This is a correctly refusing historical baseline versus newer scripts, not
missing dependencies or a request-codec failure. Updating old hashes, removing
new scripts from comparison or copying a newer result onto R8 would weaken the
original gate. No such fix, baseline/CI-reference switch or public-trust change
was performed. The already proposed separately approved qualification/actual22
and exact release-selection path remains distinct; no qualification or actual22 run was triggered here.

P1-19 init check: installed workspace migration manifest contains001..008;
proposed009/010 are separate owned-only experiments, not an init default.
EffectiveConfig deliberately requires caller-provided defaults/resource values;
bootstrap WorkspaceContext remains a placeholder. No authoritative exact
init creation-path/schema/default packet was found. No user DB or config was
created or migrated, and no budget/default was guessed.

Only owned input literals and fake callbacks; no new dependency, canonical schema,
production scan/query/publication, real model, Native build/measurement, actual22
or installed package change. Existing27 worktree entries remain outside this batch.
Public qualification remains source79da401-bound, not automatically this new
source. Phase1 stays4/21; A6 NOT_QUALIFIED; E02 PROPOSED/uninstalled. Rollback stops
using the additive private request factory; old response factory is unchanged.