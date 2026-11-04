# Phase1 A-local 原用例绑定执行评审 — 2026-10-27

作者局部评审；不是独立整分支评审，也不是B1b/Phase1退出。

## 已实际执行

原[109项映射](2026-10-27-phase1-stage-store-acceptance-map.json)中，40项STATE_MATRIX、16项Stage边界、19项Store恢复已以明确补充上下文执行，共75项；其余10项Stage与24项Store仍未执行原用例。全部原Fixture正式签收仍等共享预算、兼容和G门禁，不能把75/109写成Phase1完成率。原所有base/input/expected字节保留；本轮新增3个明确绑定清单，无新Fixture ID。

Stage原alpha/语言未知base是真实H1 AVAILABLE，但不是Native正例。补充[矩阵绑定](../../../fixtures/phase1/mixed-analysis-stage/state-matrix-execution-bindings.json)使用已封存Native完整Source/Java/owner/raw、独立freeze及全持久表SQL目标，逐个锁定原input/expected SHA；原base同时保留为实际FULL_ANALYSIS_REQUIRED负控制。[边界绑定](../../../fixtures/phase1/mixed-analysis-stage/boundary-execution-bindings.json)明确16项上下文；foreign控制保留foreign原支持字节，只在隔离literal将Source标为Python并使history unavailable，实际验证OTHER_PROVIDER_REVALIDATION_REQUIRED，不声称修改后的旧历史有效。

全部状态由真实调用到达。APPLYING在Store真实BEGIN前重入核验，并让原消费继续到完整目标。CONSUMED用真实COMMIT后的TEMP清理故障保留该私有状态，确认清理实际尝试一次、TEMP仍在、完整已提交目标可只读重开；不会用正常关闭后的CLOSED冒充CONSUMED。不提供状态setter。非法调用后合法续接证明状态未被错误失效；终态真实lease永久撤销。

[恢复绑定](../../../fixtures/phase1/mixed-analysis-store/recovery-execution-bindings.json)把既有19处实际SQL抛错和19个实际Node退出接入原Fixture输入/期望及SHA。每个完整rollback比较明确绑定的literal基线；成功提交比较预先封存独立全表目标和validated readonly结果。native-state-clear仅证明空derived state的实际DELETE边界，有效旧R010状态清除兼容仍OPEN。

## 一项明确Fixture预期修正

failure-commit-unknown原expected无条件要求EXACT_LITERAL_BASE，但已有批准契约§6明确：无法确定提交时返回COMMIT_OUTCOME_UNKNOWN、撤销lease，再以fresh readonly完整状态判定。当前hook在实际COMMIT成功之后抛错或退出，因此磁盘应为完整已提交target。补充清单显式修正此hook的effective persistentRows，保留原expected和SHA；API仍UNKNOWN、只读判定COMMITTED、无重试和SQL修复。遵循原设计，不改变产品契约或降低比较范围。

## 验证与保留失败

新57项（56原意图+1完整性/原base负控制）与原Stage37/Store69联合163/163，0fail/cancel/skip/todo，88.149秒。之后19恢复绑定/独立目标增强的Store69/69，48.454秒；两批重叠，不合计232。每批含19个实际Node退出，顺序执行，不是Native运行。产品源码/dist/迁移/依赖/注册未改，无需编译未变化产品。

保留缺test-helper export准备RED；首轮矩阵40PASS/1FAIL为新负控制误读historyStatus；联合146/147为新负控制empty contracts先触发正确INCOMPATIBLE_CONTRACT；两次精确替换保护拒绝及一次未应用修正的失败复验均保留，最终读取实际源行后复用原audit的合法preparation。边界首轮14/16为新测试误猜clone/cross-db owner错误分类，实际正确INVALID_CANDIDATE；原expected仅要求不发布/完整基线不变。修正测试并增加永久失效检查，产品与原预期不改。首轮57绿不能证明独立CONSUMED，作者审查发现后增强真实状态准备并重新163绿。

## 未关闭

剩余34项原用例：Stage10（OTHER零事实、NO_OP、origin immutable/retained/retire、5类预算）及Store24合同场景。继续原A1：先冻结独立整操作资源算术，不从candidate usage回填golden，再接精确边界与完整delta/retained、coverage multiplicity/census、有效R010/legacy、较宽旧/orphan原始snapshot恢复。G四root/精确注册/适用兼容/架构/IR/文档退出仍待，不提前注册未完整根或称E/F完成。

D/E/F IN_PROGRESS、G OPEN；主任务仍4/21接受、17未关闭。后续按原批准范围顺序继续，无需微步骤批准。真实Native/测量/profile/模型/CI/云端/Git写入仍未发生且未由本次扩大授权；历史timeout UNKNOWN、C1/C2、R4不可pristine、main取消结算未查等全部保留。
