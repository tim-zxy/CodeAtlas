# Phase1 A-local 统一顺序执行：合同与零事实准入 — 2026-10-27

沿用用户原D..G批准及“没有特别需要审批的就统一执行”指示。作者局部实现/Fixture评审，独立整分支与阶段退出仍待。

## 本批实际结果

[原109项追踪](2026-10-27-phase1-stage-store-acceptance-map.json)明确绑定执行覆盖由75推进到93，剩余16（Stage8、Store8）。原Fixture整体签收继续等共享预算/兼容/G，93/109不是Phase1完成率。新增13个Store竞争/事务/恢复场景、2个legacy场景、Stage/Store共用一个NO_OP检查覆盖2项意图，以及OTHER-only零事实1项，共18项；新案例数不是新主任务或门槛。

Store13项用独立已提交Python上下文或Native Source-only上下文，逐项消费原input/expected/SHA。实际验证Source drift、相同fingerprint的support drift、pointer ABA/null变化、真正BEGIN IMMEDIATE后的TEMP篡改、重复消费、外来事务、跨库lease、BEGIN失败及未知提交只读三态。拒绝后完整持久表等于明确外部竞争后的last-good上下文，历史/origin/projection/member行保持；成功则完整等于既有独立SQL目标。成功提交前用另一真实只读连接确认看不到尚未提交的新行。

原2个legacy场景直接复用已有R03四个validated writer×success/rollback的8条真实检查，wrapper先核对原Fixture和绑定；没有复制writer或伪造handle。Native full/patch是原Store API名称，只用既有声明式输入，没有启动Native二进制。原检查含完整持久表rollback、pointer失效、真实capture、generic磁盘重开。

NO_OP独立上下文仅由已封存noop-mixed完整历史与独立SQL行目标投影；真实H1先证明AVAILABLE，比较完整Source/history/origin/projection，再执行固定纯Runtime并真实recheck。全持久表及只读重开不变，无mixed_stage TEMP表、无新历史；这不等于H5生产协调器已完成。

## 修复一个现有契约内的产品缺陷

原Stage acceptObservation对所有owner.units.length=0都进入仅删除null路径，导致完整合法OTHER-only FULL raw被INVALID_CANDIDATE拒绝。新独立Fixture先用原C3A作者参考、原empty target、完整OTHER Source及公开H1哈希计算owner/manifest/activation；没有从Stage/Store生成expected。既有纯Runtime完整Code/history输出和实际owner正文/摘要均精确匹配，随后才观察到真实Stage RED。

唯一产品改动：零单元仅删除分支限定为DELTA；FULL继续通过原raw字节、Source/owner/scope、provenance和freeze全套校验。其余逻辑无改动。合法OTHER-only零事实freeze匹配独立完整目标且不发布；FULL-null、错误inventory、损坏request、DELTA携带raw四类负控制全部拒绝、永久撤销Stage且持久行不变。符合已批准Stage契约§5/7与原OTHER-zero Fixture意图，是实现缺陷修正，无新增契约、数值、profile、运行授权或依赖。

## 可复现验证及保留失败

Storage本地构建0；最终9文件集中顺序回归288/288（含19真实Node退出），0fail/cancel/skip/todo，79.827秒。随后原writer兼容8/8，架构17项目通过。旧75项、旧失败与全部原Fixture字节保留，注册仍61/Phase1 35/catalog0，Stage/Store新root尚待完整G。没有重复Phase0.5完整回归或Native校准。

新NO_OP前几轮失败均为测试适配缺陷：SQLite null-prototype行、origin/member访问顺序与projection ID排序不同。最后逐字段完整行集两侧按不可变主键比较并仅转换行原型，不丢记录、值或JSON数组顺序。OTHER作者第一次误向严格owner-map函数传入多余字段，在写入前拒绝；首次control比较漏分离Runtime code字段，随后新增独立完整空Code DTO比较。真实产品RED在这些修正后、任何产品修改前观察，完整日志分别保留。未将准备错误冒充产品RED。

## 剩余执行与边界

Stage8：origin immutable/retained revalidation/retire及5类预算；Store8：准确parent full、完整delta、仅删除、foreign拒绝/完整重验证、同ID内容冲突、coverage multiplicity、全snapshot census。其已有组件证据继续保留，但原意图完整绑定执行未签收。独立整操作预算不得从candidate usage回填expected；有效旧R010清除、较宽旧/orphan完整snapshot恢复和G退出仍OPEN。旧raw-I01等声明式参考含占位locator digest，不能直接当实际SQL/owner上下文；后续须明确合格上下文并独立重算来源绑定，不能猜root或降低capture。

D/E/F IN_PROGRESS、G OPEN，P1-04/05及Phase1未完成；主任务4/21接受、17未关闭。原批准范围内继续顺序执行，不逐微步骤询问；实质契约/范围冲突、新依赖/数值、破坏性操作、真实Native/模型/profile/云端CI/Git写入仍按原单独确认边界。C1/C2、Native timeout UNKNOWN、R4不可pristine及main取消结算未查等全部保留。
