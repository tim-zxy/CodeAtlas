# Private coherent document batch read

Authority: P1-12 readDocuments consumes one SQLite snapshot per database; reuse
existing DocumentStore/Document IR and the approved private read-control boundary.
No CompilationInputSnapshot schema/ID, Source authenticity, new root export,
publication, scan permission, parser/dependency or migration is introduced.

Success: readCurrentBatch(documentIds,limits,syncCheck) returns required COMPLETE
current revisions in caller order from ONE owned read transaction and ONE existing
HistoryReadBudget. Missing document/head, duplicate/unsafe selection, corruption,
control refusal or exhausted cumulative budget returns no partial result. Empty
selection is an empty read. New path requires synchronous control; old single
current/historical semantics remain. Selected IDs are copied before callbacks can
mutate caller input; strict row/bundle checks are shared with existing reads.

- [x] Add actual owned SQLite/WAL concurrent-writer test proving one read view;
  missing/duplicate/accessor/control/budget/corruption tests before implementation.
- [x] Extract the existing private snapshot and row read internals without changing
  SQL checks, add the private required-document batch port and immutable result.
- [x] Build Storage and run affected Store/migration/Application component tests,
  concentrated review and architecture guard; record exact scope and synchronize once.

The previously saved R9 prefreeze stays read-only and becomes historical for the
new compiled Storage input; do not refresh it or execute a real R9 build/sampling.


## Exact historical batch continuation

Existing readRevision and P1-12 selected DocumentRevision/per-database view require
an exact private batch reader. This adds no capture schema, digest, permission or
selection policy. Success: explicit (documentId,revisionId) pairs in caller order,
one existing budget/owned transaction, required immutable COMPLETE revisions, no
head fallback or writes, duplicate pairs/unsafe/missing/control/limit refuse all.
Different requested revisions of one document remain distinct explicit reads.

- [x] Real historical selection, rejection, ownership/budget and WAL late-insert RED.
- [x] Reuse existing row/snapshot implementation for exact private batch API.
- [x] Build Storage, affected tests, independent review and architecture; synchronize.
