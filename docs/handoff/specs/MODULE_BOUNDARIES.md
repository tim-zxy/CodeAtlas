# Module Boundaries Specification

## Repository layout

```text
apps/cli            apps/mcp            apps/daemon
packages/runtime    packages/application packages/agent-api
packages/ir         packages/storage     packages/source
packages/providers  packages/plugins     packages/contracts
packages/execution  packages/documents   packages/knowledge
packages/evaluation
crates/native-analyzer
fixtures
```

## Allowed dependency direction

```text
apps -> agent-api/application/runtime
agent-api -> application + ir
runtime -> application + storage + provider/plugin composition + config
application -> domain service interfaces + ir
knowledge -> execution + contracts + documents + ir + domain ports
execution -> contracts + ir + domain ports
contracts -> ir + domain ports
documents -> ir + domain ports
providers -> ir + source provider ports
plugins -> ir + provider read ports
storage -> ir + declared persistence ports
source -> ir
evaluation -> public APIs + ir + fixture contracts
ir -> no project package
native-analyzer -> protocol schemas/fixtures, never TypeScript storage
```

## Forbidden edges

- `ir` to any upper package.
- provider/plugin implementations to knowledge.
- domain packages to apps or transport adapters.
- apps to concrete SQLite repositories.
- analyzer to SQLite or workspace databases.
- Agent API to native providers directly.
- knowledge workflow to provider SDKs directly.
- framework-specific public types above plugin normalization.
- cycles between domain packages.

## Ownership

- Runtime composes dependencies and lifecycle; it does not contain domain rules.
- Application exposes commands/queries and transaction boundaries.
- Storage owns SQL/migrations and implements ports.
- Providers observe code; plugins derive framework semantics.
- Contracts own boundary matching; execution owns detailed graph and deterministic `RuntimeFlow`.
- Knowledge owns candidates, identity, reconciliation, evaluation gate, publication, and projections.
- Agent API maps external schemas and permissions to application use cases.

Architecture tests must parse package manifests/imports, compare them to an allowlist, fail cycles, and include injected forbidden-edge tests.

