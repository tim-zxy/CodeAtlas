# ADR 010 Native IPC and Storage Boundary

Status: Accepted

Decision: The Rust analyzer communicates through version-negotiated JSONL over stdin/stdout, logs on stderr, and owns no SQLite state. TypeScript validates complete streams/patches and activates canonical state transactionally.

Consequences: analyzers are replaceable and crash-safe; shared byte fixtures are required; native processes receive an allowlisted environment and no shell.

