# B-G1 声明入口与执行链集中实施计划

> **For agentic workers:** 具体包获批后使用superpowers:executing-plans，在本会话顺序完成G1–G4；用户不授权代理/新会话/工作树、Git写入或逐小步审批。

**Goal:** 当前已证明的框架入口经局部Code CALL图得到strict、确定性的声明RuntimeFlow候选。
**Architecture:** Plugin负责框架入口；Execution只接受IR/Code输入并派生图/Flow，不依赖Plugins。无Runtime/Store占位；原API与公开index保持。
**Tech Stack:** 现有TypeScript、Node crypto、Zod4.6.1、node:test；不新增第三方库。
**Spec:** [精确设计](../specs/2026-10-30-phase1-declared-execution-design.md)。
**Status:** 2026-10-31用户在整包确认后“继续”，已批准G1–G4及独立政策；当前B_G1_DECLARED_EXECUTION_LOCAL_EXIT。

## Global Constraints

只在C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas。D旧checkout和破损Git指针不修；不reset/stash/stage/提交/推送/换EOL/清理旧材料。不启动真实Source/Rust/Native/helper/collector/DB/模型、测量/profile/云端CI。保留B-F3原Fixture和日志；本包只跑获准普通本地Node组件及构建。

所有政策、身份与逻辑单位取自设计，不临时选阈值。maxItems必填，Fixture边界值不是新默认。Local strict budget refusal不替代原通用frontier/API义务。独立作者审查，不冒称代理评审；按用户收敛策略不复制全仓hash/旧宽回归。

## 文件与接口清单

新增产品：
- packages/plugins/src/framework-entry-candidate.ts：compileFrameworkEntryCandidate(input,framework,maxItems):FrameworkRuntimeCandidate，复用既有固定领域出口，创建HTTP/MESSAGE/SCHEDULE真实入口。
- packages/execution/src/declared-execution.ts：deriveDeclaredExecutionGraph(input,maxItems):DeclaredExecutionCandidate，未知输入边界、支持一致性、局部图/预算/身份。
- packages/execution/src/declared-runtime-flow.ts：deriveDeclaredRuntimeFlows(input,maxItems):DeclaredExecutionCandidate，稳定遍历、step/back-reference与支持；复用前文件私有共享identity/budget纯helper，不造通用策略框架。

修改产品仅packages/plugins/src/framework-runtime-candidate.ts：提取FromValidatedContext私有出口，旧函数签名/字段/语义不变。若图/Flow确需共享纯预算/键函数，在declared-execution.ts模块导出，不提前多拆一层。public index均不改。

已有包接线：packages/execution/package.json新增@codeatlas/ir workspace:*及当前已安装zod精确4.6.1；pnpm-lock.yaml只对应execution importer，现有解析版本不变。复用既有包管理器做范围限定offline/ignore-scripts链接，不联网、不全仓升级；若环境不能完成则记录setup缺口，不手工假造依赖身份或改保护设置。此为本次集中待批范围。

新增测试：
- packages/plugins/test/framework-entry-candidate.test.mjs
- packages/execution/test/declared-execution.test.mjs
- packages/execution/test/declared-runtime-flow.test.mjs
- packages/execution/test/framework-execution-composition.test.mjs（仅测试可导入两个私有包，生产Execution不得import Plugins）

Fixture：fixtures/phase1/ir-contract/declared-execution/inputs.json、expected.json；复用旧声明装配helper作为input准备，不塞oracle/policy生成。仅改fixtures/phase1/ir-contract/fixture.json两个路径，既有ID/capability保持。
注册：新增scripts/test-declared-execution.mjs import上述四文件；根package.json test脚本追加一次此root，不重复所有文件或增加全局计数。

治理更新限定：本设计/计划/作者评审，CURRENT_STATUS、DESIGN_TRACEABILITY、CANONICAL_IR的被批准语义、PLUGIN_SPI入口适用段、WORK_BREAKDOWN/PHASE_ACCEPTANCE对应子出口；SQL/ADR原架构不改。只写短变更与证据链接，保留旧后缀。

## Review Focus

1. 从任意领域事实造入口、把producer/Mongo当独立执行根：G1负例。
2. 同handler多入口被合并或同context循环无限展开：G2。
3. HEURISTIC或候选列表升级真调用，或候选节点进入Flow：G2/G3。
4. 将CALL fanout/Flow ordinal说成分支/运行时序，或按topic名连接异步：G3。
5. 输入支持篡改、basis不一致、逐记录重复支持绕过预算或改旧B-F3行为：G1–G4。

## G1：独立Fixture、已有包接线与真实入口

依赖B-F3有限出口及本包明确批准；不是以旧0.5审批代替本包政策批准。
- [x] 先写两份字面Fixture及四文件中的首组预期。已有Context/Runtime parser检查准备结构；冻结输入/expected语义身份，先观察API缺失RED。
- [x] 完成已有库offline局部接线；不升级/下载/执行安装脚本。
- [x] 提取原已验证Context出口，实现入口compiler；固定policy、精确实体键、完整支持/provenance及maxItems。
- [x] 定向G1 GREEN；旧B-F3新组件文件验证旧API结果不变。

验收：HTTP/Kafka consumer/Scheduled正例；producer/Mongo/低支持/未知政策/缺owner不造入口；多合同/任务根分别准确；旧原子字段保持。
Fixture→设计§2 G1/§3/§4/§5；首个可执行任务即冻结独立预期与API RED，不先搭public index或Store。

## G2：同context的真实Code CALL图

依赖G1实际EntryPoint，故不可与G1同时实施。
- [x] 写chain/diamond/cycle、多入口同owner、EXACT/HEURISTIC/AMBIGUOUS/UNSUPPORTED、foreign/缺支持的字面图预期并观察行为RED。
- [x] 复用IR schema实现严格输入边界、入口与内部合同/任务/owner一致性、固定政策及当前支持比对；一context根直接target Code，不造dispatch CALL。
- [x] 用邻接表和每context visited集合只展开实际EXACT可达部分；候选节点保留但不扩展；身份/合并/累计预算按设计。
- [x] 定向GREEN及maxItems边界；没有真实入口就没有图根。

验收：graph facts通过原parser；关系/支持/loop精确；不存在context笛卡尔积或猜测边。Fixture→设计§2 G2/§3–§5；原IR基本schema收据可复用，新增语义由此测试承担。

## G3：确定性Flow及最小组合闭环

依赖G2；两模块可独立评审，数据依赖要求顺序执行。
- [x] 写重排同值、diamond非branch、循环回引、仅candidate节点排除、空入口、删除/低支持及预算字面Flow预期，观察RED；加入非本包图语义/伪造根/错误policy拒绝，不静默省略输入边界。
- [x] 实现每入口一Flow、一可达节点一步；稳定ordinal只作呈现，边/支持不丢失，不做压缩器。
- [x] 使用同一组声明Fixture调用真实G1→G2→G3，不经预先编造图替代组件；断言最终RuntimeFactSet完整关系与PARTIAL限制。

验收：当前HTTP/consumer/JOB路径、跨入口context隔离、loop/unknown及删除均有支持；没有图外虚构节点/时序/异步连接。Fixture→设计§2 G3/§4/§5/§7。

## G4：一次集中检查、作者评审与退出

- [x] 只登记原Fixture两个路径/一个新root一次；保持旧Fixture ID、capability及库存门禁。
- [x] 按下方最小命令一次集中验证；范围修复采用TDD，只复验受影响检查，不自动重试到绿。
- [x] 作者按Review Focus检查整链/允许依赖/旧入口；没有新代理授权，不派agent。
- [x] 一个results索引记录命令/真实数量/失败/Fixture身份，短状态和追踪更新；仅满足全部本包条件才记B_G1_DECLARED_EXECUTION_LOCAL_EXIT。
- [x] Phase1/P1-07完整能力、其他B任务、E01/E02和实际资格保持OPEN。

验收映射：设计§6/§7→新root/旧B-F3 root/注册/工作区和架构/精确格式；不以手写样本比例当Quality Gate。

## 最小本地验证命令

Node使用D:/Program Files/nodejs/node.exe，工作目录为原C工作树。
1. 构建node node_modules/typescript/bin/tsc -p packages/plugins/tsconfig.json；同命令-p packages/execution/tsconfig.json。IR源码不变，复用IR dist，不全仓build。
2. 开发时上述相应新test文件RED/GREEN；批末node --test --test-concurrency=1 scripts/test-declared-execution.mjs（四文件仅登记一次）。
3. node --test --test-concurrency=1 scripts/test-framework-binding-extraction.mjs：旧B-F3 API/helper兼容；不再另跑相同23项叠加计数。
4. node --test --test-concurrency=1 packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs scripts/test-workspace-structure.mjs：分别负责注册/包与root接线。
5. node scripts/check-architecture.mjs；Prettier仅检查本包明确产品/测试/JSON/root/manifest/锁文件。治理MD受原ignore，只查新增段/链接，不全文件EOL重排。
6. 当前设计阶段不执行以上命令。批准后不跑旧Rust/Native/DB矩阵、校准、全仓回归或CI；仅相关变更/失败才扩大检查。

## 可合并与不能提前并行的工作

G1–G4作为一份批准范围连续执行，Fixture、产品、相应兼容和范围修复统一处理，不按框架/小步再问。G2依赖G1，G3依赖G2，G4集中验收，不能为加快进度开并发长测/代理。

下一原Phase1责任为完整领域边界与四Plugin剩余能力、合同匹配/跨仓、R012/R013发布与实际资格。本计划未授权这些新增范围；不另加Phase、不把OPEN改DEFERRED。

## 实施结算与最小偏差 — 2026-10-31

最终54/54、旧B-F3 root121/121、注册/workspace55/55、两包build0、架构17与16文件范围格式通过；[逐项实施/作者审查](../reviews/2026-10-31-phase1-declared-execution-implementation-review.md)，[命令与原失败](../../../.superpowers/sdd/2026-10-30-phase1-declared-execution/results.json)。14个声明输入，原JSON预期语义未变。

范围修订：scripts/test-workspace-structure.mjs必须同步原精确依赖oracle的execution行（新增一行，未放宽allowlist）；输入/身份/支持预期采用冻结JSON加显式通用字段断言，未另造巨大实现输出golden。pnpm离线安装因旧modules清理要求拒绝，未开启CI/purge；实际只创建两个经现有manifest/lock核对的库junction，不改旧树/不下载。该局部已有库接线方式记录于link-receipt及ledger，不是安装成功/发布资格。

G1 API RED→17GREEN；G2构建类型失败→build0；G3原顺序产品缺陷及测试共享/预算/删除准备缺陷均保留失败并源头修正；作者RED3修复后root54及最终build/格式通过。只复验受影响路径；本轮无Source/Native/Rust/DB/helper/collector/模型、profile/新库、云端CI或Git写入。P1-07完整能力与父任务仍OPEN。
