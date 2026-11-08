# Production reader compatibility for exact W009/W010

User approved read-only code compatibility, tested only with self-owned SQLite.
DocumentStore and ContractStore may read exact prepared9/10 schemas using the
existing pinned snapshot-schema reference. The private async preparation must
complete before synchronous9/10 reads; otherwise fail closed. Constructor admission
is not a write grant. Keep original document7/8 and workspace6/7/8 write gates.
All read schema checks use the caller budget and existing SQLite snapshot, FK,
row/IR/digest/scope/support/authority and lifetime checks. Unknown versions,
changed/missing schema objects, FK-off and exhausted budgets refuse. No repair,
DDL or migration is performed on the borrowed database.

Reuse the existing exact schema comparison rather than weakening shared guards
or adding a second store/API. W008 and older supported behavior remains unchanged.
No production manifest/checksum/public contract changes, user database access,
publication, W011, permission or scan clearance. Rollback disables new reader
admission without modifying data. Original broad read/write patch remains denied
and unexecuted; this is a distinct read-only implementation.
