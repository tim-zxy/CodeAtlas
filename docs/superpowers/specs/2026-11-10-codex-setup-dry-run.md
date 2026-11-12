## Approved CLI preview extension - 2026-11-12

User approved a Codex CLI preview with explicit inputs only and promotion of the
already locked smol-toml1.8.0 to CLI runtime dependency, same version/SRI and no new
transitive packages. This supersedes only the historical private-only/no-CLI/
no-lock-change restriction below. Apply, install, real user config discovery/read/
write, MCP launch and production rights remain closed. The pure planner is reused.

CLI: codeatlas setup --dry-run --max-request-bytes <N> --input-timeout-ms <N>.
Bounded strict UTF8 JSON comes only from stdin: exactly client, configToml(string
or null), nodeExecutable, mcpEntryPath, workspaceRoot, maxConfigBytes,maxPlanBytes.
No config path or environment/home lookup. Convert the explicit TOML string to
owned bytes; generated plans remain enabled=false/applySupported=false and launch
UNAVAILABLE. Invalid arguments/input/oversize/timeout/output fail without payload
or parser-error echo; preview status is data, not permission. The input timer is
cooperative and does not preempt synchronous parser CPU; byte ceilings remain.
All actual validation uses synthetic request bytes/self-owned test directories.

# Codex setup dry-run planning

Authorized P1-19 first target: Codex; private planAgentSetup(request,ports) only. No public CLI/schema changes, real config discovery/read/write, install, server launch, network or production grants. Existing P1-19 dry-run/conflict/snippet rules and module direction remain. Other clients refuse explicitly and can add separate adapters later.

Use an injected trusted synchronous TOML parser (tests use already locked smol-toml1.8.0); no dependency or lock change. Request supplies owned config bytes or null, exact Node executable/MCP entry/cwd and explicit input/output byte ceilings. No config path, home discovery, environment or secrets accepted. New entry is always [mcp_servers.codeatlas] with command/args/cwd/enabled=false only. Current apps/mcp main is smoke-only: every result states production launch unavailable, apply unsupported and execution unauthorized. No ready flag can override this.

Missing config plans a disabled section. Existing valid config is parsed completely; absent name permits only an append preview after reparsing proves all other TOML values unchanged. Exact disabled entry means no change; any differing codeatlas entry is a conflict, never replacement. Invalid/unsafe config returns only the standalone disabled snippet and generic diagnostic, not source text/parser errors. Plan contains original byte digest (null if absent), status, snippet and optional appendText; no merged document or raw existing values. Immutable plan, exact keys and byte limits. The primitive does no I/O; caller/parser ports remain trusted, not authorization evidence. Apply/backup and real config selection remain future separately gated work.

Success: self-owned temporary TOML retains its bytes; Windows path quoting, comments, unrelated tables, same entry, conflict, invalid UTF8/TOML, unsupported client, explicit ceilings and no config/secret echo covered by independent expected TOML parsing. No production configuration or Codex process tested.

Official fields checked2026-11-10: https://developers.openai.com/codex/config-file/config-reference and https://developers.openai.com/codex/mcp . These describe client syntax, not CodeAtlas production readiness. Rollback stops using this private planner; no persisted state changes.