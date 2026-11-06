# Final Source verification after ANALYSIS — decision proposal

Status: Decision B APPROVED for private V2 offline implementation and substitute verification on2026-11-05. Implementation evidence is recorded separately; approval alone is not completion. No Source verification is removed, moved early or bypassed. Real Git/Native/HOST, rights and resource numbers remain outside approval.

## Verified incompatibility

- packages/application/src/mixed-source-workflow.ts verifySelection invokes the real Source verification function and checks current Source state.
- packages/source/src/mixed-source-workflow.ts verifyMixedSourceSelection re-runs observeMixedGitWorktree; this performs discoverGitContextControlled and gitIgnoredPathsControlled rather than reusing initial observations.
- The approved A5 complete execution performs this verification after Native/Stage preparation immediately before Store application. The current13 probe likewise verifies after owned wire8 transport. A full current13 operation must preserve final freshness, including after asynchronous Runtime derivation.
- Approved V2 requires GIT only SOURCE; SOURCE slots all precede ANALYSIS; owner and C# policy reject return to SOURCE and reject GIT in ANALYSIS.
- operation-order.tap reproduces both refused slot plans and exercises actual final Source verification using the existing in-memory Git double. This fixture emitted 8 additional read-only Git commands (count is fixture evidence, not a new quota): rev-parse/show-toplevel, symbolic-ref, rev-parse/HEAD and check-ignore. No real Git was run.

Thus the current R013 probe is a real Source/Stage/candidate/atomic-Store interface proof with a V2 Native lane, not a complete all-process V2 operation: its final Git verification is outside that lane. Full orchestration cannot be honestly reported connected under the unchanged two-phase predicate.

## Recommended decision B: fixed verification-only GIT suffix inside ANALYSIS

Approve only the following exception, for offline implementation/substitutes first:

1. Independent coordinator fixes all initial SOURCE/GIT, Native ANALYSIS and final verification slots before HOST. Initial SOURCE remains GIT-only. ANALYSIS/GIT is permitted ONLY as the final verification suffix; after its first slot, no V2/SURFACE_V8 or SOURCE slot may occur. No arbitrary phase switching, optional caller slots or general Git executor.
2. Final slots bind the SAME authenticated/admitted analysis context digest and exact current Source/Storage/Application scope. Their full static command and actual stdin digest still come from the actual controlled Source Git issuer with one-shot claim. They are exclusively the existing final Source selection API's independently fixed read-only commands; no write/clean/reset/stash operation is introduced.
3. Finish real Runtime candidate derivation before final source.verifySelection; verify actual Source and original readset, then use the original synchronous atomic Store workflow with no extra external await/callback between final check and application. Do not turn a caller-returned success callback into authority.
4. Any new/changed file/ignore/HEAD/root or unexpected command/count, cancelled/expired context, unknown process or cleanup uncertainty refuses publication. Preserve Source effects and previous Code/Syntax/Runtime last-good state; retain UNKNOWN commit semantics and explicit readonly recovery.
5. Keep exact V2 frame field set/prefix, existing GIT role meaning and canonical full launch hash. Update the role/phase-pair and suffix-order predicates, corresponding contract/ADR/spec trace and negative tests through governed change. Old V1/V5 stays byte-compatible. No new OS right, resource value/formula, production profile or baseline installation follows.

Why B: it preserves one-way stage progression and the final freshness check while avoiding a new wire token or weakening full-input/image binding. It still IS a change to the currently approved role/phase predicate, so implementation follows the explicit user approval, not routine wiring authority.

## Alternatives

A. Add explicit final VERIFY phase, GIT-only, same analysis-context binding, no transition afterwards. This makes intent clearer but changes phase token grammar and all JS/C#/schema/vector readers; larger compatibility surface and review. Requires equally explicit approval.

C. Retain current V2 unchanged and keep full current13 operation blocked. Continue independent V2 event/worker/HOST identity work. Safest immediate choice; minimum component probe remains valid within its recorded scope.

Moving final verification before Native or running it through unobserved/default Git would lose the declared freshness or whole-process trust/resource boundary; neither is offered as a completing alternative.

## Impact, risks and rollback

Affected future implementation: dynamic-owner slot validation/analysis binding and C# Slot/constructor/REGISTER rules; private HOST-side current13 orchestration and fixed qualification descriptor; Source/Stage/Store remain the existing implementations. No Canonical IR, SQLite migration, published semantic workflow, public provider configuration or accepted Phase1 threshold change.

Risks: mistaking arbitrary ANALYSIS/GIT for verification, allowing Native after verification begins, stale context or static command drift, callbacks/awaits reopening a freshness window, and treating a component pass as qualification. The fixed suffix, genuine issuer, explicit Application/Storage recheck and targeted ordering/failure tests must cover these. Resource lifetimes must record final Git overhead; no numerical estimate or formula is selected here.

Rollback: V2 remains private/disabled for live use; restore only the new suffix-specific predicates/tests/orchestrator from their owned change, retaining old V1 and evidence. No Git reset/stash/bulk staging or database rollback migration is required. Real-run output is absent.

Suggested approval wording: approve B's fixed ANALYSIS verification-only GIT suffix and corresponding offline orchestration/validation; do not approve real Native/HOST execution, permission/ACL changes, resource formulas/numbers, baseline/profile installation, push/PR/merge or formal CI.

## Independent work advanced now

Separate dynamic debug bridge, dynamic loop and concrete adapter to original bounded stream workers. Output-driven synthetic HOST executes the actual V2 control handshake through mailbox/event policy; associated MemoryStream workers exercise the same typed adapter. Final integration now also drives the COMPLETE synthetic HOST handshake through those actual memory workers. Old code/factory and phase predicates stay unchanged. This is offline consistency and scheduling evidence only.

## Bounded offline continuation - 2026-11-06

See [N1 exact allSOURCE orchestration](2026-11-06-current13-no-native-offline.md) and
[HOST protected-consumption ownership](2026-11-06-host-consumption-lifetime-offline.md).
These private offline refinements preserve prior Native/suffix guards, operation
authority and live NOT_READY; no OS guarantee, actual launch, new right or resource
number follows. Historical outcomes below/above remain scoped to their tested bytes.
