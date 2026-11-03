## 2026-10-22 approval update

User confirms the recommended architecture decisions and first batch P1-00..02. ADR-020 is the effective architecture record; later task implementations, exact future dependency/wire/profile/numeric gates remain separate. Prior PROPOSED/NOT AUTHORIZED wording below is the review snapshot, not a revocation of this bounded approval. Task checkboxes still reflect actual verification, not approval.

# Phase1 详细设计包总索引与决策表

日期：2026-10-22，Asia/Shanghai。版本：本地待审草案。**Phase1仍DESIGN-READY；本包不是已批准的IMPLEMENTATION-READY状态，未授权任何产品代码或云端操作。**

用户此前要求完整设计/任务包完成后集中确认，故本轮在同一会话顺序完成书面设计和计划，不逐个微小步骤请求批准。brainstorming用于设计收敛，writing-plans用于任务化，Ponytail full约束复用和最小范围；用户的集中审批方式优先于技能默认多轮中间审批。未创建新会话/工作树/并行代理或长测。

## 1. 阅读顺序

| 材料                                                                        | 内容 / 状态                                                                             |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [启动核验与推进方案](2026-10-22-phase1-design-progression.md)               | Phase0.5原证据范围、保留风险、Phase1差距；本轮第一步已有结论，未重复测量                |
| [兼容性提案](2026-10-22-phase1-compatibility-proposal.md)                   | A语法入口/迁移预留；B可变WORKTREE编译快照；C新domain Evaluation报告；全部待批准         |
| [共享契约与Runtime](2026-10-22-phase1-contracts-and-runtime-design.md)      | 字段、语法、四Plugin、Graph/Flow、合同/跨仓、repo与workspace事实持久化、错误恢复        |
| [知识与消费](2026-10-22-phase1-knowledge-and-consumption-design.md)         | Document/Claim、四SemanticTask、三工作流/身份/发布、W007..W011、FTS/Wiki/Agent/配置安装 |
| [Evaluation与追踪](2026-10-22-phase1-evaluation-design.md)                  | 新Fixture清单、两个合成E2E的VA/SF probes、报告分层、22项Exit映射、基线批准流程          |
| [基础与Runtime任务包](../plans/2026-10-22-phase1-foundation-and-runtime.md) | P1-00..09，exact未来文件/接口/失败tests/命令/依赖；全部unchecked                        |
| [知识与交付任务包](../plans/2026-10-22-phase1-knowledge-and-delivery.md)    | P1-10..20及实际语义/安装/E2E封板；全部unchecked                                         |
| [本轮自审](../reviews/2026-10-22-phase1-detailed-design-review.md)          | 实际发现/修正、未关闭决定、可启动批次和证据限制；无独立评审者                           |

## 2. 交付闭环与范围

目标是可安装的本地核心产品：工程事实→四框架语义→ExecutionGraph/RuntimeFlow/合同→Document/Evidence/Claims→受治理的LLM候选→验证/身份/质量/手动发布→FTS/Wiki/六工具Agent消费。没有模型时核心索引、确定性查询、FTS与已有知识读取可用；无模型不能假完成新的语义编译。

不引入Phase2/3的embedding/Zvec/hybrid、daemon/HTTP服务、完整架构/迁移/drift知识、用户WikiSpec/继承/SDK、完整DiagramModel、全量降级编排、CFG/PDG/taint、自适应路由、外部sandbox、session memory、托管模型、单可执行文件或自动语义发布。不要求全语言，无Phase4。

## 3. 本轮设计收敛的重要结果

- 不只补FastAPI：现有Java事实同样缺框架参数证据。新增语言中立SyntaxEvidence、显式Plugin V2、独立Native协商；旧Code IR/ProviderSnapshot/IPC严格版本保留。
- Python不只补decorator：Source当前.py为OTHER/null，需SOURCE/python分类与最小Module/Symbol/Import/Reference→Canonical owner映射，再进入FastAPI。变化影响Source fingerprint，必须显式兼容处理/真实混合Provider验收。
- Code先更新、Runtime尚旧时明确AFFECTED，不能报统一fresh。新语法/Graph/Flow通过validated apply激活；旧Java derived state不借给Python，不能证明兼容则拒绝而非自动全解析。
- 冻结RevisionSet不等于冻结可变WORKTREE内容：W010保留经授权过滤的不可变CompilationInputSnapshot和支持摘要，发布CAS、前后basis重验；不承诺跨库原子同一时刻。
- LLM输出仅candidate，语义发布MANUAL、事务外模型调用、失败保last-good；Wiki只渲染published知识，reprojection无LLM/语义更新。
- 不改旧Code evaluator含义。新Phase1 report分层报告真正产品、替身、真实模型；缺基线/缺required结果不能PASS。

## 4. 集中决策（尚未批准）

| 决策                  | 推荐                                                                           | 影响与批准边界                                                                                              |
| --------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| A 语法/语言入口与版本 | 接受独立SyntaxEvidence、Plugin V2和拟议v4；Python走最小Provider事实+syntax路径 | 新协议精确wire/schema与混合Provider lifetime须在03..05验证；不改旧IR/Snapshot；grammar版本及profile数值另审 |
| A2 repo迁移预留       | R011 syntax、R012 execution、R013 runtime_flow                                 | 只移动未发布预留；接受后先同步正式ADR/spec/roadmap/WBS/trace，再写新SQL；R001..R010不改                     |
| B 编译依据            | 接受不可变输入快照、last-good/CAS与显式freshness，承认跨库不是线性原子快照     | 保留审计支持，不复制出第二个实时真相库；不做跨revision code事实carry-forward                                |
| C Evaluation          | Manifest v1与旧Code comparator不变，增加独立Phase1 domain report/runner        | 0..20任务逐Fixture注册；两E2E全部critical probes，数值baseline冻结输入/本地测量后再批准                     |
| D 可选降级            | 初期关闭source-grounded候选生成路径                                            | 不取消coverage/错误诊断；若启用要补同链安全/grounding/path-specific实际证据；完整编排仍Phase2               |
| E 发行平台            | 首个实际验证目标Windows x64；其他平台按证据扩展                                | 不冒称Linux/macOS支持；如果既有产品支持范围另有承诺，先核对并保留，不单方面缩减                             |
| F 模型与预算          | 不选未经验证的模型/任意预算值；先交付可测adapter与流程，真实本地模型验证单列   | 真实模型身份/预算和retry/identity/deprecation数值无证据不预填；远端LLM/新profile与Actions始终独立审批       |

这些是设计决定的评审请求，不是已经改变FROZEN/EVOLVABLE规范；正式接受前不更新权威为“生效”。如A/B/C被否决，先修改相应spec和任务包，不绕开guardrail实现演示。

## 5. 依赖、首批与暂停点

推荐首批候选：P1-00 report/Fixture兼容基础→P1-01 strict IR→P1-02 EffectiveConfig/安全规则。它们不需云端CI、真实模型或新Native正向准入。**仍须用户明确实施确认、接受适用契约并同步权威后才能执行。**

P1-03..09依赖A/A2及语言/协议/混合Provider兼容收敛；04具体grammar版本未锁、profile未获批时不声称任务ready。P1-10需要Markdown依赖明确；11/18依赖compatible/MCP协议能力验证；13的非exact identity/deprecation数值没有Fixture依据则review-only；19的平台范围必须明确。P1-20只有actual模型/产品证据和批准baseline齐备才可验收。

可独立的逻辑：文档纯解析、模型上下文/安全纯规则、独立Plugin的golden；共享IR/manifest/composition/publication事务不是独立任务。顺序执行为默认，不根据独立性擅自调度代理或长测。

## 6. 本轮核验与未做事项

继承启动核验：18条历史exit0记录且日志存在；31行已保存Evaluation重算逐字段一致；26个Manifest、0个Phase1；merge保留REST证据与本地源码树一致。本轮没有重复完整回归/Native校准、下载artifact、联网刷新CI或恢复39708335128。历史Native超时仍UNKNOWN，post-trial R4 DB未动。

本轮仅写设计/计划/审查和CURRENT_STATUS设计进度说明。对新文档执行命名范围的格式、Markdown链接、任务/Fixture/Exit引用和placeholder检查；这些不是产品测试或未来Fixture通过声明。完整Phase1没有unit/Fixture/Evaluation通过证据，不能称实现完成。
