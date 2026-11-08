# W009/W010 owned temporary snapshot Store

Status: user-approved bounded offline implementation. This is not approval to
install production migrations, upgrade user databases, publish Knowledge, enable
scan clearance or finalize W011. The prior physical candidate remains PROPOSED.

The private Storage module exposes openCompilationInputStore and createRun,
putSnapshot, readSnapshot, inspectCommit. Tests alone connect these to new owned
temporary SQLite files and existing Application capture. No Runtime/default/public
export is wired. Subject namespace/id and request labels bind correlation and
idempotency only; they are not authenticated grants. A mandatory synchronous
caller check revalidates current permission/control; callbacks/DTOs do not mint it.

The unchanged pure compilation-input-contract implementation now lives privately
in IR, with its import changed to ./index.js. Application retains its old private
re-export path. Storage imports that validator without an Application dependency;
public IR schemas/exports and all hash recipes are unchanged.

The unregistered workspace-proposed/009_knowledge.sql and010_lifecycle.sql match
the two original candidate blocks exactly after existing LF normalization. The
production manifest remains8. Private preparation constructs a reference schema
in memory from the validated old manifest and pinned candidate hashes. Each
operation compares the complete named table/index/trigger metadata under the
existing bounded SQL account, admits only exact9/10, and requires FKs enabled.
Writes require10. Unknown objects, missing guards or11 refuse. This is schema
recognition, not a migration or proof of historical/source integrity.

Create inserts the closed capture-only request/metadata and moves CREATED to
CAPTURING in one transaction, after checking a frozen same-workspace RevisionSet.
Only the genuine Store instance that acknowledged creation can write an unbound
run; no new Store/restart resumes it. Namespace+subject+request-key uniqueness is
preserved. put validates the complete DTO, selection, policies and actual repository
registration/revision-set pins; one BEGIN IMMEDIATE inserts snapshot/supports and
binds the run once. No digest-only identity, UPSERT, replacement or history rewrite.
Exact committed reuse validates the old record and retains its original ID/window.

Reads use a real SQLite snapshot and revalidate canonical JSON, header agreement,
digest, full typed closure and exact support-row membership. They recheck the
captured request/subject/workspace and original control. No successful prefix or
corruption-as-absence result is exposed. Existing logical bounds remain mandatory,
with no numeric defaults or physical RSS claim.

An acknowledged write returns COMMITTED independently of postcommit checking:
failure there retains the receipt with cleanupState UNKNOWN and blocks that
instance's later writes. Lost COMMIT acknowledgement returns COMMIT_OUTCOME_UNKNOWN,
never automatically retries; complete validated rows can subsequently prove commit.
NOT_COMMITTED requires the actual original corresponding attempt to have settled
and a complete absence check. A reopened Store without that ownership reports
UNKNOWN on absence and refuses to continue the unbound run. Eight run-state
vocabulary remains; no INTERRUPTED persistence, model/source-event/publication
writer or full run recovery is introduced.

Automatic approval rejected extending production DocumentStore/ContractStore to
candidate9/10 as beyond the temporary-store approval. That patch did not execute
and was not retried. The safer private Store path is implemented; both production
readers and their original guards remain byte-equivalent to the prior commit.
Therefore production reader compatibility is explicitly OPEN, not passed by these
temporary experiments. BackupRequired behavior and old migration bytes are unchanged.

Verification: seven initial API-absence REDs; later ownership test demonstrated a
new instance incorrectly continuing an unbound run before correction. Nine final
Store tests include nonempty existing capture -> real disk -> close/reopen, support
corruption, frozen scope/key binding, limits/cancel/FK refusal, rollback, missing
acknowledgement and acknowledged-commit/cleanup uncertainty. Independent read-only
review found no blocking issue and ran the then-eight Store cases (a subset, not
additional evidence). It also compared old readers/manifest to HEAD and confirmed
the validator move changes only its import.

IR/Storage/Application/Runtime builds passed. The combined snapshot/capture/model/
schema/backup batch passed126 cases; separate Runtime/document compatibility
passed76. Packaging/workspace registration checks passed66; architecture17 and
all changed-file formatting passed. No user database, real model/Source
body, installed package, Native qualification, R9, numeric approval or publication.
Rollback disables the private entry and preserves databases/history; restoration
or schema downgrade is not an automatic rollback operation.
