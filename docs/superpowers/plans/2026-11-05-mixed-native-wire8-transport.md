# Offline wire8/ledger implementation batch

Authority: [contract](../specs/2026-11-05-mixed-native-wire8-transport-contract.md); original current13 design and approved offline owner direction.

1. Root implements deep-private owned wire8 transport by reusing strict request/stream/process owner; only private generic unions accept its honest request type. RED/GREEN memory child tests; no real spawn.
2. Runtime worker implements separate async existing-formula ledger bridge and rejection accounting tests, then upgrades the minimum R013 probe in its own files.
3. Root alone compiles Providers/Runtime and joins actual transport/ledger/Stage/plugin/atomic publish. Run exact affected cohort and original architecture check; register tests in ordinary test script. No formal CI.
4. One independent final review, associated fixes only, scoped format and status/traceability update. Preserve failure logs. Publish exact remaining cross-process trust decision instead of a permissive wrapper or authority token.

This batch closes offline owned-wire8 and shared-decoder-ledger integration only. Live dynamic registration, full physical lifecycle accounting and actual qualification remain blocked by separate trust/approval prerequisites. Git commit/CI will be assessed only if necessary; push/PR/merge require explicit approval.
