# Phase1 B1-B2 第一实施包：计划作者评审

日期：2026-10-25。类型：AUTHOR PLAN SELF-REVIEW，非独立评审或产品验收。

[具体计划](../plans/2026-10-25-phase1-delta-support-candidate.md)；[已接受方向](../specs/2026-10-25-phase1-delta-composition-design.md)。用户“确认”接受书面方向，本次具体计划 REVIEW_PENDING，T1..T3 NOT_STARTED。

## 结论

可提交整包审阅。三个顺序任务分别交付：兼容的共享预算入口、完整声明候选/全部原candidate引用闭包、精确注册与范围验收。不会把第一包等同于完整B1-B2，更不会接入真实Native/SQLite/Stage/Store。

## 自评与具体化选择

| 检查       | 结论                                                                                                                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 设计覆盖   | 设计§3.1/3.2→T1输入拥有权/预算兼容；§3.3..3.6→T2完整支持/单位/coverage/每候选引用/选择器/DTO；§5..7→T3错误/注册/本地gate/文档。§4真实raw桥接和C/D明确是后继，不算实现缺省已通过                                                         |
| 文件与类型 | 一个新产品模块，加已有history-transition.ts的私有出口提取；pipeline helper始终接收unknown自行prepare，不接受caller prepared；旧public仍原签名/原Error。DTO精确10字段，coverage/Syntax只放transition中，不重复顶层字段或增candidate hash |
| 每步可验证 | 每任务有精确文件/签名/RED/构建/测试命令/验收；缺失API与实际断言RED分开。旧public的预算观测在改动前保存，明确不是独立graph golden或新数值profile                                                                                         |
| 五项风险   | D08非winner悬空、D03/D09原candidate与winner/min-confidence、D07/D10伪prepared与mutation、D11跨阶段不重置、D01/D02/D05空仓/零事实/单位身份分别落实所属测试                                                                               |
| 范围与依赖 | T1→T2→T3顺序，旧算法/selector/IR/Source/wire/Store/Runtime/index不改；没有大重构、框架、新依赖/数值或真实运行。预算仍逻辑计数，不声称RSS/性能                                                                                           |
| 命令对应   | companion planned-local-commands.json与正文同源展开，30文件=原27加新3；构建/architecture/format/diff准确。计划阶段NOT_RUN，实际通过总数待未来运行，不把原662记新鲜结果                                                                  |

## 自评修正与依据

1. 旧history oracle确实硬编码registry51/exact25。新增一个manifest后，即使产品正确也会失败。计划明确列入该文件，且只将标题/两处精确结构数量同步为52/exact26，保留旧ID一次/catalog0和所有语义断言。新oracle独立证明新增ID一次；不是放宽到>=或删检查。
2. T1新Fixture已出现时旧完整oracle会因上述计数产生预期RED。因此T1直接验证原46字面结果和旧输入/policy行为，T3再运行包含全部旧oracle的完整30文件cohort；不把T1部分结果报告为全root通过。
3. active Source缺失/依赖不匹配常常会先被原pipeline拒绝。D06明确记录真实拒绝层，不声称新closure已覆盖一个未到达的路径。D08则必须构造旧public可接受、selected graph有效而非winner UNRESOLVED candidate缺node的真实反例，新入口才以DANGLING_REFERENCE拒绝，旧public行为不被加强。
4. 共享预算返回的packet/transition引用来自同一次owned prepare，budget只在内部延续；无新wrapper charge进入旧public，防止“重构”无意改变其旧极限。T1必须拿改动前边界和旧goldens证明，不只比较两个改完后的函数。
5. 新Fixture先格式化、再provenance/freeze，避免重复前批格式后继修正；若发现独立语料缺陷仍保留全部旧版/失败，并单独记录新冻结。旧563 Fixture禁止格式重写。

## 当前证据与未闭合项

启动2094/2094前序哈希匹配，17份治理/设计原件已保存。本轮只写计划、作者自评和接受方向/计划待审入口；产品源文件、旧注册、Fixture、构建/缓存、测试、DB、Rust、Native/helper、profile、依赖/数值、CI均未执行或修改。文档链接/格式/差异与最终哈希由plan-review.json封存。

真实raw bytes→normalized、成功/完整/未取消/未late结算、认证历史/Source、provisional owner/Stage、最终Syntax basis/valueDigest、R011、锁内CAS/原子Apply/恢复/读者均是缺失的后继证据。第一包不能认证一致伪造数据；它只产生DECLARED_INPUT完整候选。

C1 symlink EPERM OPEN；四C2生命周期已用完；历史Native timeout UNKNOWN；main39708335128取消结算未查；mutable R4未碰。B1-B2整体、C/D、P1-04/05/Phase1退出仍OPEN。没有独立评审、提交、推送或云端资格。

在已接受的纯第一包范围内未发现剩余Critical/Important计划冲突。下一步只请用户审阅具体计划；整包批准后按原C工作树/本会话顺序实施T1–T3，不重复询问执行方法，云端/实际运行/DB权限不随之扩大。
