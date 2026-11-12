# P1-11 owned local mock HTTP transport

Existing authority: ADR-008, knowledge-and-consumption section4 and the approved
Phase1 knowledge/delivery P1-11 Step4 explicitly require bounded local mock HTTP
adapter validation separately from ACTUAL_MODEL quality. The previous owned
request/response codecs are reused unchanged. This implements the missing socket
transport leaf rather than inventing a production endpoint/credential registry.

Private createCompatibleLoopbackTestTransport fixes explicit endpoint and request/
response byte ceilings. The endpoint must be canonical literal IPv4 127.0.0.1,
explicit nondefault port and /v1/chat/completions, plain HTTP, without query,
fragment or credentials. No DNS/TLS/proxy, arbitrary headers, redirect following,
retry, fallback, compression or production export/registration. These limits are
an additive owned-test seam, not a claim all local model APIs use this path or
that localhost proves model identity/permission. Hosts must own the synthetic
server and input; this component does not authenticate another loopback process.

Wire is POST JSON with explicit length and connection:close, no auth header.
Successful response must be200, uncompressed/identity and complete strict UTF8;
chunks are counted and overflow aborts without returning a truncated candidate.
Node retains its built-in header parser bound. Existing Application owns original
request/candidate checks and usage accounting. On response transport failure no
usage is invented; actual client transport is still TEST_DOUBLE/NOT_EVALUABLE.

Original control deadline and cancellation destroy client work, then join request,
response and client socket closure before settling. Timer uses the original
remaining deadline within Node's timer range; no timeout default is introduced.
The factory's original control is a genuine signal from Application. Captured
native EventTarget methods and AbortSignal getter prevent instance overrides
from escaping setup or finish. Synchronous setup/send errors after acquisition
also destroy and join. No promise of hard CPU/memory isolation or termination of
an arbitrary server/model is made. Owned test-server teardown is separate.

Success criterion: actual owned server receives exact encoded context, no auth,
and literal response reaches the original validator with TEST_DOUBLE labels;
redirect/status/truncation/overflow/encoding/cancel/deadline fail once without
raw payload exposure or an abandoned client. Endpoint options are owned before
callbacks; getters refuse uninvoked. No public schema, dependency, calibrated
resource number, installed package, user data or production permission changes.

Evidence: initial missing-API positive RED; Runtime build passes. Independent
review found one P2: mutable signal instance hooks could reject after client
acquisition or escape cleanup. Real signal regression initially RED (3hooks vs0),
then fixed with captured native hooks and joined setup failure. Strengthened
throwing hooks regression passes; narrow independent re-review reports fixed
and no remaining P1/P2. Reviewer did not execute tests/network.

Final concentrated87/87,0fail/cancel/skip/TODO,5310.6951ms; architecture17 and
scoped Prettier/diff pass. Eight new cases in the already mandatory compatible
JSON test file, no duplicate registration. Includes existing request/response,
Application semantic/captured-BusinessFlow/Capability and workspace guard tests.
Raw local reviewed log:
.superpowers/sdd/2026-11-12-compatible-loopback/reviewed-tests.log.
Previous86-case log retained; counts overlap and must not be summed.

~~~text
node node_modules/typescript/bin/tsc -p packages/runtime/tsconfig.json
node --test --test-reporter=tap --test-concurrency=1 packages/runtime/test/compatible-json-test-port.test.mjs packages/application/test/semantic-test-invocation.test.mjs packages/application/test/captured-business-input.test.mjs packages/application/test/owned-capability-input.test.mjs scripts/test-workspace-structure.mjs
node scripts/check-architecture.mjs
~~~

No full P1-11/Phase1 or real-model quality acceptance. Real endpoint/model/prompt
registry/grants and actual quality evidence remain absent. P1-19's independent
new Workspace metadata leaf is already pushed at a7b5d34; complete CLI init still
needs exact layout/default and multi-file recovery decisions, not a new config
schema (EffectiveConfig exists). R8 catalog pin mismatch is not repaired by this
transport; historical baseline and public owner schedule stay unchanged. No
actual22, Native build/sampling, user project/database or public validation write.
Rollback stops selecting this additive private test transport; no persisted state.
