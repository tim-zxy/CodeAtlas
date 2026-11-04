## 组件输入可携带性检查点 — 2026-10-27

已将36份封存组件输入整理为库内可携带材料：24份JSON按标准库gzip保存原payload字节，12份JSONL不变，loader校验存储/解压摘要与原byteLength。六处消费者不再读旧私有输入；未从产品生成expected、未修改.prettierignore或格式门禁。原目录与无旧私有输入复制目录四组均212/212，0fail/cancel/skip/todo，含19个真实Node退出；不同环境重复不累计为424。架构17项目通过，产品/编译产物未改。[本轮作者评审](../reviews/2026-10-27-phase1-component-reference-portability-review.md)记录Windows路径及辅助代码首轮失败、最终转绿和可复现入口。

新增材料为原Fixture根附加参考39文件，不新增Fixture ID/门槛；原2241 Fixture字节、所有历史原文/失败保留，registry61/exactPhase1 35/catalog0。原Stage66/Store43共109项已逐项映射输入/期望/基线摘要、相关组件证据及缺口，尚未执行的原case全部保持OPEN，不以组件数冒充验收。

本记录替代下方“组件必须读取旧W输入”的历史限制；.superpowers仍仅作证据/临时输出而不提交。D/E/F IN_PROGRESS、G OPEN；独立整操作预算、完整原Fixture与较宽旧快照恢复仍待，B1b/P1-04/05/Phase1未完成。原D..G顺序继续，无新增Native、校准、profile/依赖/数值、CI或Git授权；timeout仍UNKNOWN及全部既有风险不变。

## ABA 与 Store 组件新检查点 — 2026-10-27

获批ABA私有SQLite见证及实际查询记账3→5已实施，同/另连接ABA拒绝；Store锁内资格、一次lease消费、原子持久写入、未知提交只读判定和清理诊断已接入。19类实际SQL边界异常与真实Node退出38/38。[作者组件评审](../reviews/2026-10-27-phase1-stage-aba-store-component-review.md)记录全部RED→GREEN及范围限制；下方待批准/无Store/ABA仍RED等为保留快照。

最新集中本地回归15文件609/609，0fail/cancel/skip/todo；Storage/Runtime build exit0，架构17项目通过。Stage37/Store69是组件结果，不代替原Stage66/Store43逐项验收。原Fixture2241字节、registry61/Phase1 35/catalog0保持，全部历史失败/原文保留。

D/E/F IN_PROGRESS，G OPEN；独立整操作预算reference、完整66/43映射、可携带Fixture整理及较宽原始快照恢复仍待，B1b/P1-04/05/Phase1未完成。组件数据仍在私有证据目录，不可提交.superpowers或声称干净checkout/CI就绪。原D..G已批准，后续顺序推进无需逐小步骤确认；无新增Native、校准、依赖、数值、云端CI或Git写入授权。Native历史timeout仍UNKNOWN，既有风险不变。

## 接受记录 — 2026-10-27

用户明确“批准”本提案的两个私有 SQLite 见证及实际查询记账（构造预留3→5），并授权继续原 D..G。本记录取代下方 PROPOSED／待批准状态；历史自动审批拒绝与两项 RED 仍保留。实施、验证和 Store 门禁必须另以新证据记录，本次批准本身不表示通过。

# Stage ABA 私有见证及实际查询记账修订

2026-10-27。PROPOSED / NOT_IMPLEMENTED。自动审批拒绝后提交的具体修订；不把先前端口批准解释为本项批准。只影响原 B1b Stage/Store 资格见证，不增加 Phase1 功能、schema/migration、依赖、置信值、profile、Native、云端 CI 或 Git 写入。

## 已复现的问题

原冻结 Store 语料包含 pointer-aba。新增 Stage 复现分别在同连接、另一个真实 SQLite 连接执行 pointer A→删除→A；所有被比较的持久行完全相等，当前 Stage 仍会发出 owner。这两项是明确保留的 RED，不能记为通过。完整内容摘要仍然必需，但单独使用不足以发现该状态往返。

本包 aba-counter-measurements.json 是隔离新数据库的实测：同连接 total_changes 从11到13、data_version保持1；另一连接提交时原连接 total_changes保持11、data_version从1到2。两种情况的完整持久行都与操作前相等。这些值是测试输出，不是配置、阈值或拟定默认值。

## 推荐方案

沿用 SQLite 原生能力，在 Stage 私有记录保存两个 safe integer：

- SELECT total_changes() AS n：见证同连接的写入；预期值仅随本 Stage 固定 TEMP INSERT 的真实成功逐次推进。
- PRAGMA data_version：见证其他连接提交；要求与保存值相等。

继续同时验证 statement incarnation、TEMP schema 代际、TEMP 全内容、原 capture/Source/Code/历史身份，不以计数替代任何已有门禁。两个值不进入 Canonical IR、Native wire、owner 正文、stageDigest、manifest、用户配置或公开 API，不能由 caller 提供。

检查放在 prepare/accept/freeze 的已有有界重查，以及 Store 自己 BEGIN IMMEDIATE 后的锁内重查；不提供 public inTransaction 开关，不调用锁内 Providers/用户规则。计数不一致直接沿用 STAGE_CHANGED 并撤销相关资格。Store 的持久写入发生在最后锁内原状态核验之后；不把自身提交后的变化误认为旧 capture 仍可复用。清理仍只依本实例拥有的 TEMP incarnation，不能删除别人的表。

相比新增持久 generation 字段和触发器，此方案不需要迁移。继续只比较内容已经被两项 RED 证伪，不能作为替代。

## 需明确批准的记账变化

每次读取两个值都实际交付两条数字 SQL 行，必须计入现有 maxRows 累计账。Stage 构造的预留由当前3次既有操作（TEMP preflight、schema-version、INSERT）增加为5次（再加上述两个查询）。每次后续检查也按实际增加两行记账；新增数字对象按既有 maxItems/logical memory 规则计费。

这不改变 maxRows 字段含义、EffectiveConfig 输入值、任何 maxRows 默认值、质量门槛或 profile；它会使原本只够旧实现的紧预算更早拒绝。构造器必须在 CREATE TEMP 前预留完整实际成本。新组件 exact/one-below 控制随实际操作数更新，旧 Fixture、公有 H1 读取成本和历史收据不改；整操作独立 reference 仍是后续必需门禁，不能用动态 usage 回填 expected。

## 实施与验收（批准后直接继续原 D..G）

1. 在私有 Stage 数据中记录见证；在 TEMP 创建前预留5次真实操作和固定数字表示成本，只有成功写入自己的 TEMP 才推进预期 total_changes。
2. 两项 ABA RED 转 GREEN；重复非法方法保持原状态，真正验证失败/重入仍永久撤权；已有完整 owner/manifest/Code/支持/diagnostics/coverage 对照均保持。
3. 将相同见证带入真实 Store 锁内检查，执行同连接/另连接 ABA、Source/同指纹支持漂移、TEMP篡改、预算、每写边界回滚/崩溃/未知提交与只读判定。Stage66/Store43、整操作预算和 G 全包退出前仍 OPEN。
4. 同步原 Stage §5/§6、计划、Fixture 映射、traceability/CURRENT_STATUS 和实际 SQL 操作参考，不新增根测试注册假装完成，不执行真实 Native/CI。

## 自动审批阻断记录

被拒绝的是尚未执行的 Stage epoch 实现和内部预留3→5变更。自动审批原理由为：“该操作将 Stage 的预算预留从3改为5并改变计费契约；这属于此前明确要求单独确认的新数值/接口语义，现有批准未覆盖。”本次没有通过拆命令、换工具或间接执行应用修复。只完成原范围内的其他检查、独立目标准备和上述测量/文档。

请求一次批准：接受这两个私有 SQLite 见证及其真实两行成本（构造预留3→5），随后继续原 D..G；其余先前批准范围和限制均保持。
