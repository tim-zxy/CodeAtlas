# B-G1集中设计作者评审

2026-10-30；结论：形成可集中评审的具体设计/任务包，PROPOSED，尚未实施。按用户偏好作者顺序审查，无新agent。不是独立评审或运行资格结论。

## 实码依据

- [B-F3原结果](../../../.superpowers/sdd/2026-10-30-phase1-runtime-semantic-candidate/results.json)提供有限领域出口。再次只读核对原产品/Fixture/编译身份，不重跑原121/113/35。
- Execution入口空；IR v1已有所需实体/严格引用闭包。Code CALL完整正文不在RuntimeFactSet，故设计明确传当前Code快照，不假设externalRefs能展开调用。
- 架构允许execution→ir，禁止execution→plugins；新边界不带框架类型。现execution importer为空，IR与现有Zod接线须明确列入包，不能默认为已安装。
- 原RuntimeFlow设计明确CALL不能证明真实先后；新Flow ordinal仅确定性呈现，不从fanout推分支。CFG/PDG/DiagramModel继续DEFERRED。

## 关键自查与取舍

1. 一个入口适配器、图与Flow两个职责模块；没有公开路由、SQL空表、policy registry或副本binder。FromValidatedContext只为避免重复全解析，旧unknown边界仍验证。
2. 新政策0.5/HEURISTIC独立待批；不借B-F3授权。不把Code HEURISTIC转EXACT；候选图节点不被Flow当真实路径。
3. ENTRY直接target其真实owner Code，避免无来源dispatch CALL；每根context独立，同context按Code键visited，环用回引。
4. PUBLISH/CONSUME/数据操作绑定尚不足，明确保留原Phase1 OPEN责任。没有把局部CALL图包装成完整事件/数据图或部署证明。
5. 预算硬拒绝为本私有有限候选合同，不静默替代原通用frontier截断接口；这个差异明确提请批准。输入/输出实际重复支持计费，不新设默认数值或物理profile。
6. 全部图/Flow关系用现有IR，逻辑身份不含raw/provider/ordinal；同ID冲突拒绝，未来immutable activation由R012/R013解决，本包不写DB。
7. 独立字面Fixture先于产品；一个root、一个注册责任点、无全局计数改动；原B-F3 root仅在产品helper变化后集中验一次，不叠加重复23/旧宽矩阵。
8. 本包只读设计证据及短状态/追踪，不机械复制所有历史封存；旧失败/EOL/工作树/R4不动。

## 作者复查修订

具体反例暴露两处需在实施前写清的边界：Runtime通用parser不证明entry与internal合同/任务实现相同，也允许本包未实现的其他图语义。已在设计G2明确根的policy、内部合同/任务和owner一致性、Code callable范围；在G3明确拒绝非本包图，而不是静默丢异步边。计划同步对应负例。均为本提案的边界收敛，未更改现行IR或获准产品。

## 一次待确认与限制

[设计](../specs/2026-10-30-phase1-declared-execution-design.md)与[G1–G4计划](../plans/2026-10-30-phase1-declared-execution.md)可以一并审阅/批准；一次覆盖新身份/政策/支持/局部预算、三个私有模块/原helper、现有库的offline接线、Fixture/普通Node验证及范围修复。批准前无产品/Fixture/注册/依赖链接/测试/构建。

原Phase1父任务仍4/21已接受、17OPEN；A6 NOT_QUALIFIED、空profile、Native timeout UNKNOWN、main取消结算未查询、R4可变DB和旧CI限制保持。此设计没有承诺通过完整P1-07/原Gate或实际E2E。
