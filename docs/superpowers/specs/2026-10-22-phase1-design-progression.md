# Phase1 启动核验与设计推进方案

日期：2026-10-22（Asia/Shanghai）。状态：设计 brief / 待评审；不是实施规范、不是编码授权。

本文件完成用户指定的本轮第一步：重新核验交接，提出可审阅的 Phase1 设计推进方案。详细字段规范、逐步实施计划和最终设计评审仍须按本文件的完成条件产出；不得将本文件或既有启动审查标成 IMPLEMENTATION-READY。

## 1. 目标、假设与成功条件

目标：在既有产品设计内形成 Phase1 Core product proof 的详细设计、可执行任务包、Fixture/Quality Gate 追踪和评审结论；用户明确确认后才实施。默认本会话顺序推进，不创建新会话、工作树或并行长测。

材料假设：指定工作树及其未提交文档是当前交接材料，远端 main 不能替代这些文件。权威优先级按 DESIGN_AUTHORITY；收尾后的明确接受决定优先于审查文件中的旧 HOLD 快照，但状态文字必须有原证据支持。非产品变更的启动核验不要求重复已完成的回归或校准。

本轮可验证成功条件：准确记录本地 HEAD/树/实际差异；重新计算已保存 Evaluation；核实原门禁记录与日志存在；核对真实空实现、迁移和 Fixture 注册；区分已知风险与本轮未验证内容；提出设计顺序、交付物、退出映射和决策清单。不修改产品、配置、Schema、Fixture、原验收勾选或旧证据。

## 2. 交接核验与证据边界

工作树：`C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas`。HEAD 为 `cc5a8cb571986c5e56ed04053b2c96ef500fcacb`，源码树 `4b35ef9eddc49edfc410b0c6deb49eaea932915c`。

保留的 `task8-r4-normal-merge-verified.json` 记录 PR21 正常合并为 `433015700c7c701a6493f7f8fa5eace00e773913`，`merged=true`、`treeEqual=true`，testedTree/mergeTree 与本地 HEAD 树一致。本地对象库缺少 merge 对象，本轮没有 fetch；上述合并状态来自保留的原 REST 记录，不冒充实时服务器查询。

以下 E 指 `.superpowers/sdd/2026-10-13-p05-index-evaluation-closeout/`。

| 原证据                                            | 本轮新核验                                                                      | 范围限制                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `E/task8-r4-final-gates-summary.json`             | 18 条，逐条 exitCode=0、signal=null，全部日志存在                               | 历史执行记录；未重跑，未逐行重新审计所有日志。安静命令允许空日志                                       |
| `E/task8-r4-actual-evaluation/report/report.json` | 现有 evaluator 重算逐字段一致；31 行；五门禁值 1/1/1/1/0                        | 不是新 Native 运行；28 Native-index + 2 recorded Provider/SQLite + 1 declared-source Native 的分层不变 |
| `E/task8-r4-actual-diagnostic-hosted-audit.json`  | exact head cc5a8cb、observations=22、failures=0、originalTimeoutExplained=false | 保留审计结论；本轮未重新对全部原 receipt/199 导出逐项做严格审计                                        |
| `E/task8-r4-local-gates-audit.json`               | SHA256 与收尾索引一致                                                           | 原已执行本地审计，不是本轮重新测量                                                                     |
| Fixture registry                                  | 当前 dist 严格发现 26 份有效 Manifest，Phase1 为 0                              | `cases.json` 不等于 Evaluation Manifest；发现成功不代表 Fixture 执行通过                               |
| `E/progress.md` 顶部                              | 自动 main run 39708335128 已提交 cancel，最后记录未结算                         | 本轮未联网刷新，不称 canceled/success/failure；不恢复、不重跑、不安排定时任务                          |

本轮重算 SHA256：

| 文件（相对 E）                                  | SHA256                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `task8-r4-actual-evaluation/report/report.json` | `77f8dab1b2ca3dfcd627de767767951bd1c7e4413a4b89e650db3d47b569bf67` |
| `task8-r4-normal-merge-verified.json`           | `37c813323d1d618b3ac2ff7db4b4abddd1e4f633b7e5db02c471685e798abbca` |
| `task8-r4-local-gates-audit.json`               | `27224f28c048228fa6d7fe3999f7233d86a5b1b3232e57f53fb94ca53dfd7eb9` |
| `task8-r4-actual-diagnostic-hosted-audit.json`  | `6b4ca87b50dd7308040b0df1e8812afce62fd34c860d56bcad34ea1f344d05d4` |

真实内容差异：现有 tracked diff 为 9 份文档、211 行新增、0 删除；与 Git status 的大量 M 不等同。抽查 MCP/Knowledge 文件为 index LF/worktree LF；不能笼统宣称全部状态差异都是 CRLF。本轮不刷新 index，不 reset/stash/stage，不改换行。未跟踪的收尾、审查和 `.superpowers`/`.pnpm-store` 均保留。

结论：Phase0.5 已按原接受决定完成收尾，DESIGN-READY 前置成立；没有新的实施授权。历史超时根因 UNKNOWN，不能称 fixed/flaky。P05-RISK-001、P05-ENV-001、P05-FOLLOWUP-002 保留；非 pristine 的 R4 post-trial mutable DB 不复用、不恢复、不伪造 ownership。既有完整产物不重复下载。

## 3. 必须能力与当前差距

范围取自 PHASE_ACCEPTANCE 的 Phase1 22 项，不从包名或概念表推断交付。

- 四类内建 Plugin：Spring/Mongo/Kafka/FastAPI；输出受验证的 canonical entry/task/data/contract，保留 partial/unresolved、coverage 和支持链。
- ExecutionGraph 的 REQUEST/EVENT/JOB/TASK/BATCH 上下文；确定性 RuntimeFlow；HTTP/message 合同与跨仓 stitching；六种匹配结果、revision 和 confidence。
- Markdown/ADR Document IR；结构与语义 Claim 边界；Component/Capability/Integration/grounded BusinessFlow 候选；三类受治理知识工作流、稳定身份、copy-on-write 发布。
- 有版本/预算/权限的本地或 OpenAI-compatible LLM 边界；FTS5；标准 LOCKED Wiki；六个 MCP 工具及 L0/L1/L2 按需获取；安全与可安装产品；两个指定 E2E 的全部 critical probes。

实码核对：execution/contracts/documents/knowledge/agent-api 的 `src/index.ts` 均为 `export {};`；MCP 普通调用返回未实现，只有 smoke；RuntimeBuilder 仅组合 bootstrap config/workspace placeholder。Application 已有 Source/full/patch/index/code-query 用例，Plugins 有 SPI/候选验证和选择，均应复用。Native 实际入口构造 JavaAnalyzer，未见 Python 实现。Repository manifest 到 R010，Workspace 到 W003；R011/R012、W004..W011 只是规划。Root 注册的主要是 Phase0/0.5 测试，两个 Phase1 E2E 尚无有效 Manifest。

Not in Scope：Phase2 embeddings/Zvec/hybrid、daemon/local HTTP、advanced reconciliation、ArchitectureRule/Decision/Migration、用户 Declarative WikiSpec/继承/diff、完整 DiagramModel/renderer、完整降级编排；Phase3 自适应路由、CFG/PDG/taint、SCIP/Joern 深度、第三方 sandbox、session memory、单可执行文件、托管模型下载和自动语义发布。无 Phase4；不要求所有语言。

source-grounded 降级候选是条件项，建议初期关闭可选生成路径；不改变源覆盖诊断和失败保旧版。若决定启用，必须另列候选来源/权限/限制与同链发布 Fixture，不能补造 Canonical Code Facts。

## 4. 路径比较与推荐

| 路径                               | 收益                                                    | 代价 / 风险                                            | 结论                     |
| ---------------------------------- | ------------------------------------------------------- | ------------------------------------------------------ | ------------------------ |
| 共享契约先收敛，再按可验证领域分包 | 能先审清身份、发布、错误、安全和 baseline；复用现有边界 | 第一批是设计与 Fixture 定义，需要明确阻塞清单          | 推荐                     |
| 先做 Spring 或 MCP 的演示纵切      | 较早展示界面/工具                                       | FastAPI、跨仓和 Publication 仍未解决，易固化不完整接口 | 不作为 Phase1 总推进路线 |
| 全部 Phase1 一份巨型实现计划       | 表面一次性交接                                          | 域间依赖和未定契约容易隐藏，变更时评审成本大           | 不推荐                   |

FastAPI 事实入口比较：优先评估现有语言中立 Native/LanguageAnalyzer 下的有限 Python 语法事实路径，框架解释仍在 Plugin；备选是合格 Provider 经已有 SPI 归一化；仅导入 OpenAPI/config artifact 无法独立证明装饰器、router prefix、dependency 和实现支持，不作为完整 FastAPI 验收替代。尚未选择 grammar 版本或新增依赖；有限 Python 也不是承诺完整 Python 解析。必须先盘点四 Plugin 真正需要的语法事实，包含 Java annotation/参数/字面量等现有事实是否足够，不能只检查 Python。

## 5. 详细设计包结构与收敛标准

以下 D0..D8 是本 brief 的设计工作 ID，不是已批准产品 WBS。每包需列实际文件路径/函数签名、严格字段/版本/上限来源、错误码/恢复、独立 oracle、精确验证命令；在这些内容齐备前不得生成“可领取编码”的标记。上限、阈值没有既有依据时列为决策项，不填写猜测值。

| 包 / Owner（领域）        | 详细设计产物                                                                                                                                 | 依赖与可核验完成条件                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| D0 交接/治理              | 本文件、证据索引、现状差异、风险边界                                                                                                         | 本轮完成只读核验；保存原材料，明确未核验项，不强行将旧 HOLD 清除                                         |
| D1 Canonical/端口/Storage | Runtime/Document/Claim/Knowledge payload；EntityRef/RevisionSet/支持链；Application 命令查询；R011/R012、W004..W011逐项字段/索引/FK/事务设计 | D0；旧 envelope/IR/ProviderSnapshot 兼容；所有字段与两库归属可追溯；失败/重启/并发行为明确；不预建全部表 |
| D2 Evaluation             | Phase1 L1/L2/L3/L4 输入/报告/critical inventory；两 E2E oracle 与 probes；新旧 registry/runner 兼容                                          | D1可先出合同；无空分母PASS、无结果派生oracle；baseline/度量与证据层级明确，待批准数值不伪造              |
| D3 安全/配置/事实入口     | EffectiveConfig/授权/remote opt-in/预算/取消；四 Plugin 输入需求；有限 Python 与其他 Provider 对比                                           | D1/D2；无 raw-env/shell/network authority，经既有 SPI；语法与框架职责分开；真实能力/unsupported矩阵明确  |
| D4 自动 Runtime/合同      | 四 Plugin 提取与失效；ExecutionGraph、RuntimeFlow；服务身份/HTTP/message匹配及跨仓读取                                                       | D1/D2/D3；六类匹配结果、异步边界、支持定位、deterministic重放与源更新失效可检验                          |
| D5 文档/语义/知识发布     | 结构解析、四 SemanticTask、三工作流、身份/Reconciliation/quality/publication                                                                 | D1/D2/D3；D4提供事实；冻结RevisionSet、LLM事务外、原子激活、重开保旧版；Phase1/2 state-aware边界明确     |
| D6 查询/投影/Agent        | FTS5、KnowledgeQuery、LOCKED Wiki、六工具请求响应/错误与 L0/L1/L2                                                                            | D5发布接口；D4 trace；无 embedding可用；query/reprojection不更新知识；预算、权限、stale/missing可测试    |
| D7 Runtime/安装           | composition/lifecycle、MCP watcher、one-shot missed-change reconciliation；npm/native平台包、init/index/setup/doctor/status                  | D3配置；D4..D6用例；无Rust/无LLM安装和确定性查询；setup dry-run/merge/backup；平台矩阵真实验证           |
| D8 总任务包/评审          | 分包 implementation plans、稳定WBS、22项追踪矩阵、评审问题与决策表                                                                           | D1..D7；每任务可独立拒绝/接受，具备失败测试步骤、精确命令和报告；结论区分缺设计、待批准、未实现、已验证  |

推荐设计顺序：D0 → D1（公共合同与存储归属）→ D2/D3（先安全与Fixture输入）→ D4/D5 → D6 → D7 → D8。D2贯穿，不等待最后补测。

真正独立的设计工作：文档结构 golden 与 LLM structured-output/secret 负例；四 Plugin 在共享上下文冻结后的独立场景；合同匹配与单仓执行在 BoundaryRef 冻结后的规则设计。共享 IR、manifest 序号、公共错误/权限、Runtime composition、publication事务、E2E critical inventory 不独立。本会话仍顺序完成，不据此调度并发。

## 6. 模块、数据、迁移与失败恢复的设计约束

- 现有路径保持：apps → Agent API/Application/Runtime；Runtime只组合生命周期；Application是命令/查询及事务边界；领域包拥有规则；Storage实现端口和参数化SQL。禁止apps直连SQLite、knowledge直连模型SDK、Plugin写库和Rust激活状态。
- Canonical runtime/contract payload 必须经 IR 严格 schema 后进入 validated workflow；Plugin SPI 的 semantic candidate 不等于已发布事实。Provider信息放绑定/Evidence，不能进入provider-dependent Canonical身份。
- 单仓 ExecutionGraph/RuntimeFlow 归 repo R011/R012；服务/合同/跨仓、Document/Claims/Knowledge/lifecycle/Evaluation归 workspace W004..W011。跨库不伪造 FK 或分布式原子事务；冻结 RevisionSet 后读取明确revision/fingerprint，发现基础变化时拒绝发布或标记affected，具体读一致性/比较令牌须D1写明。
- 新 migration 复用当前 manifest/runner，已发布R001..R010/W001..W003不可改。逐个追加、每边界升级/重复运行/too-new/checksum/锁/中途失败检查；失败只回滚当前事务，不承诺自动降级。需 backupRequired 的迁移必须先有备份编排，否则拒绝。
- 自动事实替换与手动知识出版分别原子激活。模型/网络/长运算在事务外；候选校验、引用/grounding/身份/质量未通过时不移动published pointer。重启、并发发布、取消、预算/权限失效均需验证最后已发布版仍可读。
- SourceFreshness 与 CompilationCurrency 独立；partial/unsupported/null/未执行必须显式诊断，不用空成功掩盖。合同保留matched/ambiguous/unresolved/conflicted/outside-workspace/known-external。
- 安全先于上下文和远传：不信任文档/注释指令；secret过滤；本地/远端分别授权；不自动fallback。模型输出只作候选，不保留默认完整prompt/原始秘密/隐藏推理。
- FTS5从canonical rows重建，损失不改变知识真相；Wiki只经published KnowledgeQuery，手动reprojection不调用update_knowledge。Phase1不建立通用投影插件系统。

## 7. Phase1 Exit → 设计/Fixture/验收映射

E01..E22按当前 PHASE_ACCEPTANCE 列表顺序编号，仅本方案引用，不改权威条文。下列 Fixture 全为待设计、未注册；ID/路径/命令将在D2与对应领域包冻结。现阶段不将建议名称冒充现有可执行验收。

| Exit | 内容 / 设计Owner          | 所需独立Fixture与门禁/验收                                                                 |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------ |
| E01  | 四框架事实 D3/D4          | detection正负、提取/组合/失效、partial；真实产品输入→canonical输出                         |
| E02  | critical入口/边界 D2/D4   | 冻结critical inventory与独立oracle；按用户批准baseline测recall，缺基线不PASS               |
| E03  | 五上下文ExecutionGraph D4 | request/event/job/task/batch及branch/join/retry/failure/compensation；保异步边界           |
| E04  | RuntimeFlow D4            | 输入顺序扰动重复派生相等；每步支持存在，未证顺序不编造                                     |
| E05  | 合同六结果 D4             | HTTP/message正反、歧义、冲突、未解、workspace外、已知外部golden                            |
| E06  | 跨仓trace D4/D6           | 多repo冻结RevisionSet；逐边revision/confidence与变化拒绝                                   |
| E07  | 文档结构/Claim D5         | Markdown/ADR位置、heading/block/table/link/code/chunk；注入与结构/语义授权分开             |
| E08  | 四类grounded候选 D5       | Component/Capability/Integration/BusinessFlow schema、悬空支持/伪关系拒绝                  |
| E09  | 身份稳定 D5               | rename/reword/update/ambiguity/merge/split/disappearance；oracle不取模型名称               |
| E10  | MANUAL/last-good D5       | 无授权拒绝；失败/partial/取消/重启/并发不损坏published revision                            |
| E11  | freshness/currency D5/D6  | 源变、workflow/prompt/model变分开，旧知识带状态仍可读                                      |
| E12  | 无embedding的FTS5 D6      | 真实SQLite搜索/索引损坏重建/权限过滤，canonical rows不变                                   |
| E13  | 六MCP工具 D6/D7           | 严格请求/响应/error、stdio、单workspace、query/update权限、取消/截断                       |
| E14  | 安全 D3/D5/D7             | local-only、secret、remote opt-in、env消毒、prompt injection；安全失败不fallback           |
| E15  | 安装操作链 D7             | 无Rust/无LLM的init/index/setup dry-run/doctor/status；支持平台原生包实测                   |
| E16  | 两E2E D2/D8               | vulnerability-processing、spring-fastapi-kafka 全critical probes；真实路径与替身分层       |
| E17  | 标准Wiki读边界 D6         | 只读published KnowledgeQuery；如届时已有generator才用薄适配                                |
| E18  | projection隔离 D6         | reprojection不调用语义更新；LOCKED拒绝修改；required缺失明确                               |
| E19  | 语言能力证据 D3           | 每个注册capability有语言Fixture/Evaluation；未注册不称支持                                 |
| E20  | L0/L1/L2 D6               | 按需、预算、启动不全载Wiki；只读操作无隐式update                                           |
| E21  | 条件降级 D3/D5            | 若关闭，记录不适用与未启用证据；若启用，generation/coverage/unverified relations及同链gate |
| E22  | System Wiki D6            | published跨仓支持、missing/stale诊断；不虚构架构/迁移知识                                  |

所有领域任务完成还须：unit/contract测试、相应Fixture/Evaluation、失败恢复、architecture guardrail、相关文档和CURRENT_STATUS新证据。不同证据层不能相互冒充；全Phase completion须所有适用退出义务有实测报告和批准记录。

## 8. 缺失项、ADR/DCP与集中决策

当前尚缺：严格Phase1字段/版本/引用/上限；端口签名与DDL；三工作流事务/并发/重启语义；四Plugin语法需求与Python事实入口；L2/L3/L4/probe报告；独立E2E oracle/critical清单；批准的入口/边界基线；knowledge identity阈值/ambiguity/延迟弃用策略及Fixture依据；本地模型probe环境；平台矩阵；task→file→fixture→command→report逐项映射。列出缺失不等于将它们全部当作需用户现在回答的问题。

需要提交评审的治理材料：

1. Phase1 IR/Storage兼容设计：新增兼容schema/迁移按协议记录；破坏旧IR/SPI/已发布迁移时必须DCP/ADR并停止相关实现。
2. Evaluation兼容决定：优先保留Fixture Manifest v1路径与旧Code evaluator含义，在独立versioned domain报告中增加runtime/knowledge/probes；若v1表达不足，提出新版本ADR，不能重释criticalFacts或把未知metric加入旧runner后静默通过。
3. Framework语法证据扩展/有限Python方案：若需要新版Provider/IPC或持久化LanguageDescriptor，书面记录兼容/迁移/fixture/security影响；不能向严格ProviderSnapshot v1塞字段。
4. Reconciliation边界：Phase1保持CURRENT/TARGET/TRANSITION差异，不误报冲突；完整architecture drift/curated rules/advanced reconciliation不提前。若现行规范无法兼容澄清，提交DCP，不通过删除测试化解。

集中供用户最终审阅的决策应是具体材料：FastAPI输入方案与依赖、条件降级是否关闭、E2E critical清单与baseline、身份策略及依据、本地模型验证与发布平台矩阵、所有必要ADR/DCP、首批任务可执行性。不得请求批准尚不存在的数值或把设计方向确认当编码确认。

## 9. 首任务与分层验证

当前首个可执行工作是D1详细设计：四Plugin输入盘点 → Runtime/Contract/Document/Claim/Knowledge最小契约 → Application/Storage端口与两库事务归属；同时让D2以两个E2E的原始输入和critical probes检验契约是否足够。它是文档设计，不是创建未来表或实现Spring。

首个产品编码任务尚不可批准：必须等D1/D2/D3和对应written implementation plan审阅，明确schema、文件/签名、独立失败向量、精确命令、兼容/恢复义务后，才能命名稳定WBS并执行。不能现在宣称有可领取的产品任务。

| 层                       | 时机 / 范围      | 通过证据                                                                                                         |
| ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| A 文档/只读核验          | 本轮             | 原始摘要/报告重算、manifest发现、引用/覆盖/本轮文件差异检查                                                      |
| B 纯合同/确定性规则      | 批准实施后每任务 | TDD失败→最小实现→通过；严格版本/未知字段/引用/排序与负例；不启动不相关Native                                     |
| C 持久化/恢复/安全       | 对应任务         | owned临时SQLite；每迁移边界/重开/并发/取消/权限/last-good；不触碰R4 mutable DB                                   |
| D Provider/Plugin/运行时 | 相关实现稳定后   | 匹配的真实Native/语言/插件Fixture；actual路径、替身与记录重放明确分层；禁止无关全套或重复校准                    |
| E 跨域/E2E/全量封板      | 发布候选边界     | 两E2E全部critical probes、适用原始回归、Evaluation与architecture；精确构建身份/必要profile变动另有证据与数值批准 |
| F 云端                   | 仅独立明确批准后 | 先给准确提交、目的、次数、作业范围及本地替代；push/PR/merge/rerun/dispatch均同样受控                             |

默认使用已装工具、现有IR验证器、SQLite迁移runner、Fixture registry、Application路径和Node标准库；不为设计建立通用编排层或增加依赖。Ponytail full不改变任何安全、恢复、Fixture或Quality Gate要求。

## 10. 后续产物与审批状态

后续写入同一工作树 `docs/superpowers/specs/` 的分包详细spec，以及 `docs/superpowers/plans/` 的分包实施计划；计划使用 writing-plans，按已有决定采用本会话顺序执行方式，不创建新会话。用统一总索引追踪上述22项，最终评审覆盖字段/类型一致性、范围、失败恢复、安全、兼容、Fixture和缺失项。

本轮不提交、不推送、不创建PR，不修改原验收条目。完整设计包最终集中供用户确认；在确认前所有产品任务保持未授权。设计推进不自动授权远端LLM、依赖安装、profile新数值或任何可能触发CI的云端写入。
