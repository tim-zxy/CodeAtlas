# A-runtime Source/账本/v5进程边界：集中包作者审查

2026-10-29。作者自审；无新代理/独立评审。状态LOCAL_PACKAGE_REVIEW_READY，完整A-runtime/H5设计与真实运行仍OPEN。用户批准的是已呈现的统一编排；新增本包D1–D4尚待一次整体治理接受，未编码。

实码确认：v5只有库producer/reader，protocol.rs没有v5分发；SYNTAX_OBSERVATION明确不覆盖Java完整图/SQLite/Stage/Store；旧client测试确会启动Node helper，不能列作本轮无helper全绿。

自审修订：

- Source移除是逻辑清单变化，不等于磁盘文件消失；不读取已移出权限范围的文件。
- 文件/祖先/hash失败也通过account.invalidate撤销Stage，不只处理计费异常。
- 多次借用account不能重置inputBytes、放宽deadline/预算或更换signal。
- 原始流保留与进程owner跨文件复用明确三个私有aliases；type-only v5引用避免新初始化环，不复制transport。
- Rust新预算入口的实现/re-export文件列入精确计划，旧错误writer复用且保持字节。
- 同内容替换只保证一次核验期间拒绝；不虚称跨调用文件系统快照或清单新增/选择策略新鲜。
- 旧Source完整测试会写临时Git fixture，本包仅选不需Git写入的case；旧OS client测试不运行，由新double补有限兼容，完整进程门禁仍OPEN。
- registry新ID恰一个时为62/36，8脚本精确守卫及旧16处替换重建审计同步，原Fixture不修改、不放宽匹配。

范围：T1–T6可在D1–D4接受后连续实施/原范围修复。实际Source混合扫描/Python分类/选择全集重查、采集器实际归因、所有存活进程与完整资源目的/schema、准确Native/测量/holdout清单及数值仍需证据；不能把本地准备包装成完整H5实施就绪。本包不实现未知profile目的/schema、不假定HOST+NATIVE覆盖Git/collector等全部进程。

Rulings：

1. 将统一计划批准解释为执行其已明确范围，完成A1局部设计任务；不据此追认未呈现的进程hook和账本时序。依据原统一计划A1末项和已接受2026-10-23进程提案要求产品hook先DCP/Fixture/accounting/plan。若判断错误会扩大未批准信任边界。
2. Source核验组件与完整Source全集/运行资格分开，保持后者OPEN；若判断错误会把被ignore文件误判为物理删除或漏掉新增文件。
3. 不为省一次未来操作审批猜profile目的component、数值或运行次数；若判断错误会虚假证明完整内存准入。
4. 遵守不新增代理及保留证据约束，采用作者自审并明确其局限；若判断错误仍可能有作者盲点。

无产品/Fixture/测试/注册/构建/Native/helper/collector/model/云端/Git写入或新依赖。工具首个长命令因Windows命令行长度限制在创建进程前失败，尚未写文件；改为分片保存同一作者脚本后执行，不是产品运行失败。只完成设计文档与封存检查；不声称任何新产品测试通过，主任务仍4/21接受、17未关闭。

[附约](../specs/2026-10-29-phase1-runtime-boundaries-design.md)；[实施计划](../plans/2026-10-29-phase1-runtime-local-readiness.md)。
