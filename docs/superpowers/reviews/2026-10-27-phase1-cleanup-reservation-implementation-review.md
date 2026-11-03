# Phase1 已批准清理预留实现评审

Status: AUTHOR_LOCAL_REVIEW / C1_IMPLEMENTED_VERIFIED / C0_RESOURCE_REFERENCE_AND_C2_G_OPEN。不是独立整分支评审，不签收整个Fixture或Phase1。

## 范围与依据

用户明确批准[清理预留提案](../specs/2026-10-27-phase1-cleanup-row-reservation-proposal.md)和[集中实施包](../plans/2026-10-27-phase1-cleanup-row-reservation.md)。在产品前同步原Stage契约、ADR-020、设计权威、实施协议与验收/状态/追踪；全部原文和历史失败通过前缀方式保留。唯一产品源码为mixed-analysis-stage.ts，对应dist同步，无迁移/依赖/public IR/owner/history/wire或profile变化。

构造预留6行，其中原setup实际5、first cleanup预留1。private cleanupPrepaid随原Stage→Store预算实例续接，首次读取消费不再add；后续retry在SQL前add1。预算错误不能被ownership catch吞掉。marker失效/连接关闭不读取或DROP，schema版本不符不DROP别人的表。构造失败在已预留且已创建自己TEMP时只尝试一次清理，失败保留不确定TEMP和原错误，不自动重试。

额外故障审查发现旧liveTable仍把实际schema-version SQL错误转成false，close随后伪称成功。新测试实际RED“Missing expected exception”；保留marker guard后让已资金覆盖的version读取异常传播。该修正遵循原清理失败/所有权要求，不新增设计方向。失败后own TEMP保留，明确retry另付一次，成功后重复close无SQL。

## TDD与验证

两项原资金审计加强为精确6预付/5实际setup/1实际cleanup/0重复扣款，并保留全部first-observed RED。新增DROP失败重试、retry资金故障先于SQL、6行无capture余量时先拒绝，五项真实RED→5/5 GREEN。schema SQL故障第六项单独RED，最终affected suite包含六项控制全部通过。原Stage动态constructor边界5→6只同步已批准派生步骤，不冒充独立全操作oracle；物理setup5仍有独立审计。

本次19文件309/309发生在schema异常修正之前；最终五文件114/114覆盖Stage、Store、cleanup六控制、R010和非空diagnostics。Store包含19个真实Node退出、事务故障/unknown commit只读判定、提交后cleanupFailed与永久dead lease。不把两次重叠运行相加，不说最终全Phase1已回归。Providers→Storage→Runtime构建、IR类型、17项目架构及实际旧writer8/8均新鲜通过。日志和exit以同名run receipt为准。

## 有效R010兼容

新独立参考先从字面old snapshot、已有C3A独立算术、empty raw输入和域编码推导old/new manifest、owner、完整SQL目标，再调用Mixed产品。真实旧writer在schema10生成有效native状态，旧读取器AVAILABLE；真实迁移11后H1 AVAILABLE。Stage冻结不改持久数据，Store原子完成后与全部目标逐表精确相等，新只读连接重开同等。两个旧reader均返回UNAVAILABLE/MISSING，符合既有需bootstrap的分流，不启动Native或伪造owner。

此正例为zero-file，真实header1行、summary表0行；不声称非空summary删除已获此正例验证。其余旧writer行为由原8项兼容和Store既有矩阵提供各自范围证据。新expected未从candidate usage、Stage、Store或Runtime输出生成。

## 未关闭及下一步

原绑定仍107/109，原Fixture整体接受0。完整独立整操作bytes/items/rows/逻辑memory精确reference与最后items/bytes-one-below待完成，原四根注册/精确计数/G及独立整分支评审不得提前签收。现有独立depth/BigInt/cumulative控制不是完整资源oracle。C1已完成本地修订；原D..G继续已授权，不再要求微步骤批准。主任务4/21接受、17未关闭，真实Native/运行资格仍OPEN；历史timeout UNKNOWN及其他接受风险不变。未创建agent/会话/工作树，未启动Native/collector/校准/profile/云端CI，未Git或付款写入。
