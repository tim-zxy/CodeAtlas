# Phase1 B1-B1 声明历史转换：实施计划作者评审

日期：2026-10-24。类型：AUTHOR PLAN SELF-REVIEW，非独立评审、实现验收或集成审批。

[具体计划](../plans/2026-10-24-phase1-history-transition.md)；[已接受 B1-B 方向](../specs/2026-10-24-phase1-history-support-design.md)。用户“确定”接受书面方向并推进具体计划；本计划 REVIEW_PENDING，T1..T3 NOT_STARTED，不把方向确认解释为具体计划或后继 B/C/D 的实施授权。

## 结论

可提交整包计划审阅。B1-B1 限于纯声明数据的一致性和转换草案，复用已有 IR/序列化/支持关系/选择器，不改 B1-A、公开 API、既有运行路由、SQLite 或 Native。T1→T2→T3 顺序推进：独立 Fixture 与输入验证，转换决策，注册及范围回归/证据。首项是 Fixture 先冻结再 RED，不是真实采集。

## 逐项自评

| 维度 | 结果与证据范围 |
| --- | --- |
| 设计覆盖 | 设计§2/4原候选与历史声明→T1；§5差分/范围/退休→T2；§6零事实coverage/Syntax义务→T1/T2；§8安全/预算→T1/T2；§9Fixture/验收→T3。§7真实捕获、链真实性、锁内CAS/SQL/恢复和§6最终Syntax mapper明确留给C/D，不以mock闭合 |
| 类型一致 | 输入prepare、policy入口、错误union、旧支持/新观察/coverage/输出字段已统一；private prepared预算不是caller授权；Digest为约束字符串，不更改Canonical类型 |
| 可执行步骤 | 每任务列具体文件、签名、失败断言、API RED与behavior RED、build先决、通过条件、保留回执；没有产品函数体或可选架构分叉 |
| 五项风险 | H04同basis/current漂移；H10/H11他Provider有效/过期对照；H07/H08/H14保守组/零事实；H17/H18对象/预算；H12/H15/H16来源/Syntax/失效声明。每项落实到所属任务测试 |
| 命令一致 | 未来27文件Node命令继承B1-A原24文件并仅加3；build/architecture/scopedformat/diff数组与计划逐字生成同源。计划阶段不执行这些产品命令 |
| 简化与治理 | 两个私有模块，既有schema/selector/serializer，无依赖/抽象层/全量回归/真实Native/DB。不是为了简单删门禁；原性能和实际集成资格仍OPEN |

## 本次自评中修正的缺口

1. 原先只有 per-support canonical candidate，没有明确内容绑定，不能让“保留原摘要、替换为winner”的反例触发错误。计划已增加support.valueDigest，精确固定为本地声明候选编码摘要；同样明确它不认证一致伪造的candidate+digest，也不替换Canonical/Syntax SupportRef算法。H03修改candidate而保留旧摘要应INVALID_HISTORY；H04当前candidate与其摘要都合法更新仍HISTORY_CHANGED。
2. 覆盖facet先拟为Java旧五能力逐项要求，但B1-A输出是JAVA_CODE_V2复合能力。已改为现有三种scoped名字按unit精确配对；不把新packet当Java子运行的五能力证据。Java真实子门禁留在原路径，未放宽。
3. Syntax原basis可能早于当前激活；要求它等于当前basis会误把原origin当成新投影。计划只要求原repo/revision一致，始终输出REVALIDATE_FINAL_BASIS义务；不改旧记录、不提供mapper。
4. 原起草长命令被Windows进程创建限制拒绝（os error206），未执行、未写目标；随后分段保存文档。不是产品测试失败，也没有重跑测试或改变运行环境。

## 仍然缺失或需后继审查的能力

- 数据来自真实SQLite的真实性、完整历史链/cycle、连接/incarnation/释放失效、代码与Source两时点读集及history pointer真实性。
- B1-B2 delta assembler与完整新候选的merge/closure，真实changed-only的运行/成本、request/output/late settlement准入。
- B1-C R011完整DDL/PK/FK/升级/恢复、stage所有mutator冻结、最终Syntax identity/owner/basis/valueDigest闭包。
- B1-D锁内CAS、原子提交/回滚/重启、旧writer失效、读者兼容，以及其他Provider真实重验证入口。

上述不是T1..T3的通过项，也不是被免除的门禁；B1-B、P1-04/05、Phase1仍OPEN。若实施必须越过这些边界，暂停对应任务并补治理，不能沿计划措辞扩大授权。

## 本轮证据及确认边界

前序1760/1760哈希匹配，16份治理/设计原件保存在独立before-docs；所有产品/原Fixture/依赖/旧回执由最终plan-review.json再次核验。新Fixture和新产品文件尚不存在。这里只执行本轮拥有文档的格式、链接、差异和哈希核验；前次526Node/架构17是历史结果，不作fresh PASS。

C1 EPERM OPEN，四C2生命周期已用完，历史Native timeout UNKNOWN；main39708335128取消结算未查，mutable R4未碰。无stage/commit/push/cloud CI。下一步请用户集中确认具体计划；确认后沿既有会话顺序执行T1..T3，云端/Native/DB授权不随之扩大。
