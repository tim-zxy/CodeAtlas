# B-F3 Runtime声明候选设计作者评审

2026-10-30；结论：具体设计/集中实施包可供一次评审，PROPOSED，不是IMPLEMENTED。
使用brainstorming/writing-plans/Ponytail full；依照用户偏好不派代理、无测试/构建/Native/DB/CI/Git写入。

## 实码核验与取舍

- 当前Runtime IR strict schema可复用，但Execution/Contracts包仍空，SQL止于R011。新包不冒称把现成Runtime Store接线即可。
- 现有四框架54个规则Case有26个输出草稿，数据为手写Context；没有把它们叫真实Source样本或校准数据。旧SOURCE_LITERAL/1结构Fixture与Syntax0.5均不能授权语义政策。
- 推荐独立规范性0.5/HEURISTIC，具备具体条件/方法/理由，明确未批准。它是约定值，证据不能唯一推出该数值；用户批准规范约定，不等于认可经验概率。若用户不接受，不装默认分数/空注册器替代决策。
- 不把DATA_OPERATION/DEPENDENCY造为缺少schema的Canonical实体，不生成伪入口/异步边让闭包通过。
- MESSAGE provider/consumer与消息role显式对应，后继传播方向与HTTP请求不同；需要本次设计确认，不能让实现者默选。
- 未知namespace的资源身份必须依赖真实receiver声明scope；当前Syntax envelope支持与origin分开。支持/归并不升分。
- 输出预算计支持引用的实际重复保留，复用已有常量而不是新增默认数值；仍无RSS/物理资格声明。

## 实施充分性自查

接口唯一、文件准确、没有policy callback或TBD字段；一个新compiler、两个既有私有helper复用，不增加泛化策略/持久缓存。新增Fixture与现有root归并，旧98例保持，不新增全局计数。Q1准备是实施包内部前置，不单独申请四次框架审批。

Review Focus逐项对应Q1/Q2/Q3测试；未通过新Fixture前不能记产品完成。计划不覆盖的Store/执行图/发布列为原Phase1OPEN义务，没有转DEFERRED。原置信/身份/支持新语义均由本设计作为待审DCP式依据；不静默改变FROZEN schema、旧SQL或原质量阈值。

## 集中需要确认

一次确认[精确设计](../specs/2026-10-30-phase1-runtime-semantic-candidate-design.md)的独立0.5/HEURISTIC约定、MESSAGE映射、身份/支持及累计cap语义，以及[Q1–Q3完整本地包](../plans/2026-10-30-phase1-runtime-semantic-candidate.md)。这不是复用旧Syntax取值审批，不授权Native/DB/新依赖/CI/Git写入。

审批前仅保存文档与相关输入身份、链接核验；不新增Fixture/代码/注册/数值安装。前置B-F2-C98/98仅作为已验证有限出口，不重跑或扩为Phase1通过。原真实资格、A6、timeout UNKNOWN、main取消、R4及父任务4/21/17OPEN保持。
