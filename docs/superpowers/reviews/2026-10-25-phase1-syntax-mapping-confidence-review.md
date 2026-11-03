## M-01/M-02 offline preparation accepted locally — 2026-10-25

User explicitly approved both offline preparation packages. M-01 T1–T3 and M-02 D1–D2 are complete only as LOCAL_MAPPING_ORACLE_PREPARATION / LOCAL_CONFIDENCE_EVIDENCE_PLAN. [Corpus](../../../fixtures/phase1/syntax-mapping-preparation/README.md), [evidence protocol](../specs/2026-10-25-phase1-syntax-confidence-evidence-protocol.md) and [author implementation review](2026-10-25-phase1-syntax-mapping-preparation-implementation-review.md) record the exact scope and gaps. This current entry supersedes the historical planning-pending/not-started entries preserved below; it does not authorize product H2–H5 or a numerical confidence policy.

Fresh exact 16-file local closure: **488 passed, no failed/cancelled/skipped**, architecture **17 projects passed**. Registry **54 total / 28 Phase1 / catalog0**. All 3096 predecessor hashes matched at start; 3072 protected files including all 701 old Fixture files and existing compiled artifacts remain unchanged. Two root tests and one Fixture were added; three old oracles have only three structural substitutions each. The 34 cases/31 classification rows are declarations, not measured observations or sample-sufficiency gates. All measurements, thresholds and numericalPolicy remain null.

Evidence: `.superpowers/sdd/2026-10-25-phase1-syntax-mapping-preparation/implementation-verification.json`, exact logs, original document snapshots and freezes. An authoring coordinate defect was diagnosed with retained producer examples, proved RED and corrected under an explicit successor freeze; the first raw corpus/freeze remains preserved. No product source/schema/migration/dependency/profile/build/DB/Native/calibration/cloud/Git mutation occurred. Review was author-only under the sequential constraint. H1 local acceptance stands; full H2/H3 DESIGN_BLOCKED, H4/H5/Phase1/P1-04/05 gates OPEN, confidence policy NOT_SELECTED. C1 EPERM/C2 lifetimes spent/Native timeout UNKNOWN/main cancellation settlement unqueried/R4 mutable DB restrictions persist. Next: review the evidence protocol before separately approving any actual evidence operation or numerical strategy.

## Mapping direction accepted; M-01/M-02 preparation plans pending — 2026-10-25

User approved the nonnumeric Syntax mapping direction (field/ref closure,syntaxKey/extractionVersion,ambiguity handling and missing-policy refusal) and task-package refinement. The [M-01 preparation plan](../plans/2026-10-25-phase1-syntax-mapping-preparation.md),[M-02 evidence plan](../plans/2026-10-25-phase1-syntax-confidence-evidence.md) and [author plan review](2026-10-25-phase1-syntax-mapping-preparation-plan-review.md) define exact Fixture/loader/offline oracle,classification/protocol,registration diffs and future15/16-file local checks. Concrete plans REVIEW_PENDING;T1–T3/D1–D2 NOT_STARTED. This supersedes earlier direction-PROPOSED wording only;no score/policy value or product mapper is approved.

FullH2/H3 remains DESIGN_BLOCKED;H1LocalExit stands,H4/H5/Phase1 gates remainOPEN.3068predecessor hashes matched at start;actualregistry53/exact27/current701Fixture bytes unchanged. Future54/28 follows a single plannedmanifest,not a passed result or numericalgate. This turn only writes plans/review/status: no product/Fixture/test/registration/build/DB/Native/Rust/helper/calibration/profile/number/dependency/cloud/Git mutation or newworktree/session/agent. ExistingIR/SQLite/LLM/AUTO-MANUAL/flow/Deferred and C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4 restrictions remain. Originalbytes/EOL and raw failures follow intact.

# H2/H3 Syntax 映射与置信策略设计审查

日期：2026-10-25。结论：PROPOSED，可评审；完整 H2/H3 仍 DESIGN_BLOCKED，未获实施批准。作者自审，遵循用户本会话顺序推进/不使用代理的偏好，不声称独立评审。

[设计附约](../specs/2026-10-25-phase1-syntax-mapping-confidence-design.md)补足 raw/Canonical 各字段、原引用闭包、Provider-independent syntaxKey、原观察/当前投影、错误与累计预算、置信策略证据边界及分解任务。writing-plans 在设计方向确认后使用，本轮没有生成可执行 coding plan。

## 证据范围

- H1封存3045文件在设计开始全部匹配；其1467Node/build/architecture17为历史证据，本轮没有重跑，也没有通过文字状态代替文件核验。
- 实码读取了 NativeSyntaxObservationSchema/NativeSyntaxValueSchema、SyntaxEvidenceSchema/SyntaxValueSchema/parseSyntaxEvidence、ProviderTargetSchema、ConfidenceSchema、Code normalizers、完整候选/历史组合、owner-binding 和现有身份helper。
- 可证实的缺口：raw缺少confidence和syntaxKey，没有完整Syntax normalizer；Code节点置信度与现有IR结构Fixture不能赋予新Syntax策略数值依据。
- 本轮只新增设计/评审及治理状态前缀；不改产品、测试、Fixture、注册、构建输出、迁移、profile、依赖、旧证据或运行数据库。H1 Local Exit不被重开或扩张。

## 关键审查点与处理

| 风险 | 本方案的明确处理 |
| --- | --- |
| 先给满分/零分使IR能通过 | 禁止默认或借分；无获准数值策略INCOMPATIBLE_CONTRACT；数值及实际观察另案批准 |
| ProviderSyntaxId泄漏为Canonical身份 | 新key只用Source/位置/语义与typed Canonical refs；新的域/规则明确待批准 |
| selected winner遗漏loser原引用 | 使用完整原支持映射；所有raw候选须落到最终selected节点；不丢引用、不补节点 |
| AMBIGUOUS归并后只有一个Canonical候选 | Callee仍NON_RESOLVED；SyntaxValue IR无法表达其AMBIGUOUS时拒绝，不静默EXACT/UNKNOWN或改IR |
| CanonicalCallee缺少resolution/originalHint字段 | 明示表示限制；不增IR字段/覆盖name；保留原raw来源依据，不冒充无损逐字段复制 |
| 递归值与OBJECT重复属性丢失 | 递归有界映射，保留entries数组/顺序/重复项；不求值表达式 |
| owner=null配置被借用owner分数或缺Source支持 | Source必有；独立分类证据；无策略不生成Canonical |
| provisional owner/规则DTO变成权限 | Providers纯规则无DB/lease；H3真实连接/capture/Stage、H4/H5仍拥有权限与资格 |
| 每阶段重新获得预算/偷用Storage helper | 同累计账本；Providers复用自身history/identity helpers；不跨架构import Storage encoder |
| 相同key去重丢失原观察或升级生产资格 | key不等于origin/member/权限；H1独立保留各origin/current projection |

## 任务与门禁审查

M-01非数值映射规则及独立语料任务包和M-02分类/证据方案可以独立阅读设计，实施依赖不能并行跳过。H2 raw桥接/owner、完整normalizer、H3最终投影/freeze和H4/H5有实际顺序依赖。缺数值策略时前置组件只能用自己的局部能力名称，不能宣称完整映射或H2/H3完成。

Fixture族和现有HS-RAW/OWNER/SYNTAX/STAGE/BUDGET/IDENTITY追踪明确；本轮不新建manifest/不造注册总数/不设Quality Gate数值。实施前仍需精确文件/接口/命令的任务包和独立expected；当新数值、实际运行、依赖或云端动作确有必要时按原约束单独确认。

## 需要用户明确确认

接受推荐方向及§4/5/6契约：无新数值的映射、候选折叠拒绝/保持未解析、syntaxKey/extractionVersion身份规则、固定置信策略缺失时拒绝，进入M-01/M-02任务包细化。此确认不授予confidence分数、profile/校准、真实Native、编码、H4/H5或云端CI权限。

无已知需先改产品的Critical发现。剩余Important阻断明确保留：完整数值策略证据与批准缺失，H2/H3不IMPLEMENTATION_READY；new identity/mapping proposal未获批准。没有将这些阻断降为minor或默默视为通过。

C1EPERM、四C2生命周期已用完、超时UNKNOWN、main取消结算未查、R4不可pristine复用均不变。原始文档和所有历史失败继续保留。本轮文档/链接/原文后缀/hash检查见 .superpowers/design/2026-10-25-phase1-syntax-mapping-policy/design-verification.json。
