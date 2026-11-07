# Existing-version coexistence preflight offline plan

Approved: implement/test only in owned fixture directories; preserve original first-install/installed modes and ACL subjects/ancestor/link/critical-right rules. No actual install, filesystem ACL change or account query.

Material assumptions: NEW_VERSION is a private read-only predicate, not a reservation/grant; actual future writer must exclusive-create the exact absent leaf and recheck protection. Existing CodeAtlas/releases are checked as strict protected containers; higher ancestors retain original ancestor policy. Old versions are not loaded or modified. Runtime candidate dc691cab remains frozen because production code does not change.

Success: owned safe coexistence passes; missing/file/reparse containers, occupied target of any type/case/dangling link, anomalous sibling link, unknown owner/critical writer on containers/ancestors fail. Old PREFLIGHT success/refusal and INSTALLED link/ACL behavior remain. Source-only test security uses explicit in-memory ACL doubles, no GetCurrent/Query. Runtime checker generation pins same production module.

- [x] Regression RED for missing mode/function.
- [x] Minimal new preflight function/dispatch; preserve old branch and policy bytes.
- [x] Owned topology + policy tests; affected long-path/owner preparation tests and architecture/format checks.
- [x] Generate fixed checker for existing dc691cab package without executing; record precise actual deployment plan/evidence and batch-sync.

Offline implementation/preparation completed; actual deployment is not executed. Resulting source commit and fresh CI are tracked separately.
