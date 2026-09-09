# ADR 003 SQLite Authority and Derived Indexes

Status: Accepted

Decision: SQLite rows are canonical local state. FTS5 and vector indexes are derived and rebuildable. Embeddings and Zvec are optional and cannot gate core operation.

Consequences: vector profile changes dirty/rebuild vectors without changing knowledge; index loss is recoverable; canonical writes remain transactional.

