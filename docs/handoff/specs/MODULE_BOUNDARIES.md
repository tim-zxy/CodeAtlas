## N1 and HOST B bounded offline contract continuation - 2026-11-06

The selected private allSOURCE NO_OP/deletion and coordinator-owned protected
consumption lifetime directions are refined for detailed offline implementation
and memory substitutes. Controlling specs: docs/superpowers/specs/2026-11-06-current13-no-native-offline.md
and docs/superpowers/specs/2026-11-06-host-consumption-lifetime-offline.md (paths from
repository root); consolidated plan: docs/superpowers/plans/2026-11-06-n1-host-b-offline.md.
N1 preserves genuine Application/Storage/Source/Runtime authority, final freshness,
no-write NO_OP and original atomic deletion; Native branch/priorNative guard stay.
HOST B changes only the explicitly stated offline trust/lifetime premise: independent
fixed inventory, known ownership, full consumer join and close-once UNKNOWN handling.
Pure callbacks/flags never authenticate an actual OS process/path or authorize launch.
No package dependency edge, IR/schema/migration, AUTO/MANUAL rule, threshold, profile,
resource formula/value, permission or live-admission change. Original phase/security/
provider/evaluation gates remain unchanged and unpassed by this approval. Platform
review remains mandatory; historical denied/unimplemented records are retained.

## A-runtime 本地实施更新；protocol 最终门禁 OPEN — 2026-10-29

用户已明确批准 D1–D4/T1–T6 本会话顺序实施。Source受控核验、Stage累计账本、v5分发代码/原始流和私有进程屏障已实现；当前 **AR_LOCAL_IMPLEMENTED_PROTOCOL_GATE_OPEN**，不是全包验收通过。最新本地组件107 PASS/1 TODO、注册360/360、纯IPC176/176、Stage333/333、Rust指定库29/29、架构17项目、构建/类型/精确格式通过。文件symlink因EPERM为TODO/C1 OPEN。

Rust protocol内部测试最终复验在link.exe LNK1104失败，未执行；一次独立构建目录对照在依赖链接LNK1105/1224失败。准确根因UNKNOWN，不自动重试、不称已修复/flaky；旧T4的18项GREEN不冒称最终门禁。详见[作者实施评审](../../superpowers/reviews/2026-10-29-phase1-runtime-local-readiness-review.md)，准确证据根 `.superpowers/sdd/2026-10-29-phase1-runtime-local-readiness`。未新增独立评审。

实施细节以评审及实际源码为准：native-client私有aliases是default对象成员，避免既有export-star将named aliases公开；lifecycle类型模块内，public index/options保持。私有raw consumer可接既有caller limits；Source parsed副本解析前预付；Stage account拒绝ambient事务。这些是获准私有边界的缺陷修正，不增加公开契约或数值。实际protocol筛选为`protocol::`（包含新增mixed_v5_tests），旧计划`protocol::tests`仅能选旧模块；Source旧控制的准确命令见attempt3 receipt。

无真实Native、额外acquisition helper/collector/model、新目的schema/profile值/依赖、云端CI或Git写入。既有G13 Node模块隔离进程如实记录。全Source选择/Python扫描、实际归因/运行资源与H5仍OPEN，主任务4/21接受、17未关闭；空catalog继续拒绝。历史timeout UNKNOWN、C2spent/main取消未查/R4mutable限制不变。原前任10315摘要未覆盖Source，本包单独保留Source原字节并补入继任封存；不声称原摘要覆盖整仓。下方旧“未实施/REVIEW_PENDING”保留为历史，由本补记限定范围替代。

## A-runtime D1–D4 / T1–T6 已批准 — 2026-10-29

用户明确批准Source核验/Stage累计记账、v5分发及原始流、私有进程输入屏障及配套本地组件实施包，本会话顺序实施，不逐任务确认。状态ACCEPTED_FOR_LOCAL_IMPLEMENTATION，尚无实现/新测试通过声明。无真实Native/额外Node helper/collector/model、profile/新目的schema/数值/依赖、云端CI/Git写入授权。全Source选择范围/Python扫描/实际归因与H5仍OPEN，主任务4/21接受、17未关闭。下方REVIEW_PENDING为保留历史；本补记只提升本次明确范围，不接受§8未知目的或完整运行资格。

## 2026-10-22 accepted Phase1 first-batch authority

ADR-020 adds no allowed dependency edge. Runtime consumes policy/port types through Application, Storage retains IR-only dependency, and new Evaluation reporting uses existing Common IR.

Authority: ADR-020 and the user confirmation; architecture acceptance is not implementation evidence.

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



## Accepted Syntax admission preparation — 2026-10-22

The user separately approves [purpose/record/accounting preparation](../../superpowers/specs/2026-10-22-phase1-syntax-admission-proposal.md). [Fresh review](../../superpowers/reviews/2026-10-22-phase1-syntax-admission-preparation-review.md) records632 scoped tests/3 builds/architecture17, strict raw-evidence/holdout/component-budget validation and Runtime refusal before lazy preparation. The internal Syntax catalog is empty. New Fixtures are contract-only; OS acquisition conformance uses only Node helpers. Actual Native candidate/harness/full oracles, measurement approval, numeric installation and joint P1-04/05 acceptance remain open. All old profile entries/selectors, strict IPC1..3/R010 and semantic publication boundaries remain; no new dependency/number/cloud authority.
