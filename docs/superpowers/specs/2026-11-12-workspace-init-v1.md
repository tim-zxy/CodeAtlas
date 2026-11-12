# Approved P1-19 explicit workspace init v1

User approved the proposed .ekp layout, explicit configuration, readonly complete
reentry and fail-preserving incomplete initialization. This is implementation of
existing P1-19, not Native/production model/scan/publication or Public validation
trust-schedule approval. Only owned temporary fixtures will be executed here.

Request: {workspaceRoot,repositories:string[],configuration:ConfigurationSources}.
Existing loadEffectiveConfig owns version1 YAML precedence and explicit defaults/
budgets; no global path lookup, environment credential resolution or new numeric
default. Canonical root must match effective runtime.workspaceRoot. Persist the
validated resolved config (without warnings) as YAML1; this is an explicit
workspace configuration snapshot, not a change to precedence or a permission.
CLI: codeatlas init --root <path> --configuration <ConfigurationSources JSON>
--max-config-bytes <positive-safe-integer> [--repository <path> ...]. Unsupported
--index is refused; use existing explicit index separately. No source/Git probe.

Layout: .ekp/config.yaml, .ekp/workspace.sqlite,
.ekp/repositories/<directoryKey>/index.sqlite and .ekp/init.json. directoryKey and
IDs are newly generated UUIDs, persisted separately; neither paths nor directory
keys infer semantic identity. Empty repository selection is allowed. Repositories
may be outside the workspace root; canonical duplicate roots refuse. Existing
Workspace001..008 and Repository001..013 only; no pending009/010 installation.

Completion marker exact shape: {schema:'codeatlas.workspace-init',version:1,
status:'COMPLETE',workspaceId,workspaceRoot,configSha256,repositories:[
{repositoryId,repositoryRoot,directoryKey}]}. It is a locator/completion record,
not authoritative canonical data or access authorization. Both databases' scope
bindings/versions are independently checked. SQL remains authoritative. Initial
DB hashes are not used as permanent equality checks: normal indexing changes them.

Exclusive mkdir .ekp elects one creator. Create config and repository directories,
initialize/close/reopen each new repository, initialize/verify Workspace metadata,
then exclusive-write/fsync/close init.json last. All recognized paths/instances
are rechecked; no symlink/hardlink adoption or blanket OS-isolation claim. No
cross-database rollback/rename-no-clobber or power-loss atomicity is claimed.
A valid complete marker plus matching current bindings admits readonly reentry;
configuration/request conflicts, missing/partial marker, unknown files, missing
DBs or identity changes refuse. Never silently fall back to an ancestor workspace.

On failure preserve all created files. No cleanup deletion, automatic migration,
resume, adoption or retry. Initialization effect refers only to completion-marker
publication, not absence of partial DB writes. Known marker commit stays COMMITTED
if later output/check fails; uncertain marker write/close stays UNKNOWN. Cleanup
UNKNOWN prevents success. Existing trees are never written on reentry. Partial
initialization needs a separately reviewed explicit recovery decision.

Implementation steps: (1) literal owned fixtures before code; (2) readonly
Workspace binding verifier and Runtime orchestration reusing existing creators;
(3) explicit CLI route with bounded config read and output-effect preservation;
(4) focused unit/integration/failure cases and architecture, independent review;
(5) factual handoff/trace updates and scoped source synchronization. Do not run
against real user roots, modify installed packages or trigger actual22.


Implementation evidence: [review](../reviews/2026-11-12-workspace-init-v1.md).
Readonly completion checks use internally constructed immutable SQLite URIs,
not ordinary readonly opens that could write SHM. Active WAL/SHM/journal refuses;
closed checkpointed WAL images work without sidecars. Complete reentry returns
existing configuration warning paths without unknown values. This does not
promise a live writer snapshot or power-loss/multi-database atomicity.
