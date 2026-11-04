# Phase1 后续批量交付策略

2026-11-02。用户要求规划批量执行并继续；沿原A/B→C→D→E，不改变产品范围。此策略授权设计编排，不替代新增合同或实际运行许可。

## 调度与审批单位

|交付包|覆盖|集中交付与退出|
|---|---|---|
|AB-1 诊断与契约收敛|P1-04..09已知阻塞|先同cap定位Spring；同步细化普通new/UNKNOWN覆盖、Depends/Mongo角色关系及发布义务，形成一个准确契约包|
|AB-2 实际事实到发布|原A/B剩余实现|按同一已批准契约连续实现producer→reader/映射/历史→四框架→Graph/Flow→Store/跨仓，集中验收原Fixture；物理资格独立保留|
|C 知识生产|P1-10..14|文档/ADR＋四SemanticTask＋冻结编译输入＋身份协调＋MANUAL原子发布|
|D 使用与交付|P1-15..19|published查询/FTS5＋标准Wiki＋六Agent工具/MCP＋安装/诊断|
|E 阶段退出|P1-20|真实E2E、既定Evaluation/性能/安全/恢复、必要CI集中评估|

父项仍4/21已验收、17OPEN。AB-1/AB-2是原A/B内部执行检查点，不新增Phase主任务。C/D/E尚未实施批准，不因本策略变成空白开发许可。

## 执行规则

- 每个准确包一次审阅，批准后在本会话顺序完成独立Fixture、实现、必要修复、验证、作者审查和追踪；不逐表/字段/框架/测试询问。
- 跨层相依步骤合并：producer的新字段必须连同reader/IR/identity/history/Store/插件消费者统一定义，避免每层再出一个审批包。真正无需新字段的消费修订单独完成后不重复返工。
- 已批准B范围内普通Node/owned SQLite工作继续有效；新契约、未列明真实进程/数值/依赖/用户DB、破坏性动作及CI/Git写入仍保留准确审批。
- 阻塞只暂停依赖它的链。Spring诊断期间可顺序做Depends/Mongo/coverage离线设计；不能凭未知诊断预先承诺新cap、profile或wire版本。
- 开发做直接RED/GREEN，批末一次去重集成/兼容/架构。只因文档改变不重跑完整回归；计费/恢复矩阵由原责任测试覆盖，不给每种语法复制。
- 每批复用原B结果索引及简短progress，保存真实失败；旧证据按身份和适用性复用，不累计重叠PASS，不新增全仓封存层。
- 不自行新增代理/会话/工作树，不reset/stash/stage/清理/EOL同步。云端CI后置到有意义的集成点，仍须另列提交/jobs/次数/替代方案并获确认。

## 当前继续结果与首个可执行包

已核对tree-sitter-java 0.23.5的node-types：object_creation_expression通过named child class_body表示匿名类，没有body字段。现有两处scope限制之外，java_syntax.rs unknown()还会把构造结果DYNAMIC_EXPRESSION置文件PARTIAL；因此不能只修scope后宣称Kafka ready。这个覆盖语义须与原UNKNOWN合同集中治理，不能静默按Python历史例外推广到Java。

第一份准确操作包：[Spring同cap guard诊断](2026-11-02-phase1-spring-resource-diagnostic.md)。它只定位，不改producer行为；实施/新Rust运行待一次批准。诊断结果是后续准确修订依据，不是完整A/B通过。

下一份合并契约包必须一次列清：普通/匿名构造与UNKNOWN覆盖、default/annotation/参数角色、Mongo结果/handler关联、逐规则支持/未验证关系/coverage义务、原E03..E06和critical缺口；具体新版本/身份/数值不预填。新事实未明确前，不申请“全A/B任意修改”授权。

本文件只设计编排；无产品/Fixture变更、构建、测试、Rust/Native/DB/helper/模型/CI/Git执行。
