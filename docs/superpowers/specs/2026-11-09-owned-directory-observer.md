# Owned temporary directory observer, existing P1-18 event port

Next existing-P1-18 implementation step: connect actual Node nonrecursive filesystem
notifications to the already-implemented owned lifecycle using only newly created
self-owned OS temporary directories. This is not a project watcher/Source observation,
real Native/Git run, new permission, protected install, user-data scan, schema or
production service. Ordinary local tests create known test data; no file body is read.
No public tool schema, CHANGE/OVERFLOW semantics, numeric policy or dependency changes.

createOwnedDirectoryObserver(scope,listener,control) exclusively creates a fresh
codeatlas-owned-observer-* directory below canonical OS temp itself. There is no input
path, adoption, existing-directory reopen, project discovery or recursive watch.
Capture immutable bounded scope and controls before attaching, check observed directory
identity before/after attach and return only {directory,signal,close}. The returned
process-local handle is not installation or project-access authority. These observed
checks are limited owned-fixture isolation, not a hostile-path stability proof.

Known native rename/change with nonempty filename -> CHANGE; missing/unknown filename
or event -> OVERFLOW. Never retain/emit filenames or body. Provider error, unexpected
native close or listener failure permanently aborts its readonly signal and closes;
there is no retry/reopen. Managed host subscribes to observer signal and closes
immediately on provider failure or observer termination using the existing lifecycle
cancellation path, not a new terminal event or falsely recovered READY session.

close is registered before callback/abort effects, idempotent, stops future delivery
and joins actual FSWatcher close confirmation, including late acquisition/cancel.
Watcher error/unconfirmed cleanup remains safe UNKNOWN, internally observed even when
caller ignores rejection. Caller lifecycle abort closes normally. Retain fresh temp
directories as small owned test evidence; no recursive deletion or unrelated cleanup.

Tests perform real create/rename/delete of known files only in that fresh directory,
without asserting exact OS event count; control/deadline limits are explicit test
inputs. Other callback/failure cases use controlled listeners, not user paths. One
actual owned SDK integration combines observer and lifecycle, with an independent
test actor changing owned data while a real readonly Runtime query waits; event
invalidates old result. It is event transport evidence, not actual missed-project-
change reconciliation or source freshness qualification. Full P1-18 and Phase1 remain
open; rollback disables the additive adapter and keeps original paths/history.
