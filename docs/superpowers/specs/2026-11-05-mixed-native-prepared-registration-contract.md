# Prepared dynamic launch registration: approved offline slice

User approved refining the dynamic input trusted-owner mechanism and necessary
offline implementation/substitute validation, preserving original safety gates.
No real execution, public routing, resource formula/value or extra OS right.

## Local owner proof

Native and controlled Git private owners record the original immutable five-field
launch plan in a module-private WeakMap only during createLifecycle/beforeSpawn.
Its stdin SHA comes from the exact buffers the existing owner will send; argv,
env, cwd and input bytes are unchanged. Native private default reader and Source
private default reader reject plain/clone/proxy/expired plans and return frozen
{role,plan}. Exit/cancel/throw/timeout revokes in finally; late callbacks cannot
read it. Defaults stay absent from public export-star. This proves only active
plan origin, not request semantic authorization, filesystem identity or user approval.

## Offline prepared registrar

New script registrar freezes context SHA and ordered static slots:
{launchId,role,imageSha256,command:{executablePath,arguments,environment,cwd}}.
Static fields match the actual owned plan exactly using existing full-plan hash
normalization with a placeholder stdin SHA only for static comparison. The actual
registered command SHA ALWAYS hashes the real full stdin SHA; no dynamic request
field is dropped. A prepare call resolves only the actual private owner readers,
not caller-supplied verification callbacks. One opaque ticket can be pending;
consume rechecks active owner origin and full binding once, then advances slot.
Forgery/clone/proxy/wrong owner/role/static mismatch/expired/replay/overlap poisons
registry; no retry or fallback. Outputs are frozen offline review receipts with
execution/production/measurement/context-authentication false. Context strings
and receipt digests remain correlation metadata, never authorization.

The existing fixed session/observer/wire and live bootstrap do NOT import this
registrar or accept a REGISTER message. A JSON receipt cannot activate READY.
Cross-process authenticated delivery and current-context/Source-policy binding
remain explicit integration work; do not replace them with a HOST claimed SHA.

## R013 scope boundary

Read-only map confirms current13 requires wire8, binding8 rules, Syntax envelope4,
Plugin context5, genuine Runtime V2 candidate and same-lease atomic Store. History
manifest/origin schema stays1; SQL runtime container marker stays1, JSON format2.
A5 request/owned transport remain wire5 and ordinary Store11. No one-line capture
swap or role V5-to-wire8 reinterpretation is made. Existing approved private wire8
components may be mapped, but changes to fixed role/protocol meaning, public
routing, atomicity/coverage or numeric defaults stop for separate approval.

## Verification and ownership

Root writes Native private owner proof and registrar plus shared integration.
Source agent writes only git owner proof and existing self-contained double tests.
R013 mapper is read-only, not counted as development concurrency. Reviewer report
only. Success: RED/GREEN origin lifetime/clone/proxy/replay/static mismatch controls,
real dynamic full-byte hash comparison, unchanged fixed-path controls, affected
builds/tests/architecture/format and independent review. No Git/Native/collector
or formal CI; substitute process owners are in-process fixtures only.

Owner claims are global per original plan, so two registries cannot consume one
invocation. Read/claim also recheck the actual gate signal and original deadline;
synchronous abort listeners cannot exploit the interval before finally deletion.
The Source factory phase additionally checks its captured parent signal/deadline.

At this batch exit, the minimum R013 integration probe used formal current-manifest initialization
and real Source/Stage/Application/Store; only Git and Native are substitutes.
Candidate derives from fixed plugins, not JSON fabrication. The initial wire8 decoder had
an explicit independent fixture ledger. The subsequent [owned wire8 batch](2026-11-05-mixed-native-wire8-transport-contract.md)
connects the owned substitute transport and shared logical decoder ledger; live
execution, cross-process provenance and full physical accounting remain unproved. Fixture MAX_SAFE caps
are never proposed real-run budgets. Proof and permission denial do not count as
Native qualification, four-framework baseline or Phase1 acceptance.
