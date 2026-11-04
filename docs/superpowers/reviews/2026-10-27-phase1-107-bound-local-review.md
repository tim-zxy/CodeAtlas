# Phase1 107项本地绑定执行评审

Status: AUTHOR_LOCAL_REVIEW / SHARED_EXIT_GATES_OPEN。本文件不是独立整分支评审，也不接受整个Fixture或Phase1。

## 已执行与范围

用户要求沿用批准、顺序统一执行。继续原A-local D..G，不创建会话、工作树或代理，不触发CI/Git云端写入。实现仍仅涉及mixed-analysis-stage.ts与对应构建产物：FULL在当前指针失效时严格验证完整不可变历史carrier及祖先，重建snapshot元数据而非恢复旧资格；retained比较对真实SQLite null-prototype行创建并计费plain record，保留全部字段和origin_json原始字节。其他canonical/public API、迁移、依赖和数值profile不变。

[原意图追踪表](2026-10-27-phase1-stage-store-acceptance-map.json)覆盖107/109：Stage64/66、Store43/43；最后items-one-below和bytes-one-below未签。原Fixture整体接受0。新增独立SQL/history参考覆盖准确parent/full重建、删除、实际partial raw、retained/retired origins、coverage重数、跨revision快照总数、未观察外部provider拒绝及同ID内容冲突。完整持久表、只读连接和lease消费均有实码检查。

非空旧snapshot diagnostics附加验证完成：使用既有WARNING语义，独立重算origin、projection及history身份；SQL只比较既存持久字段，旧诊断完整保留于history/origin，不伪造缺失SQL行。首次失败是独立参考重算后未排序，与既有ordered约束不符；修正参考顺序后1/1通过，产品未修改。原失败、未排序参考和所有后续日志均保留。

## 新鲜验证与限制

原16文件集中复验302/302；附加diagnostics1/1，不把两次运行伪称一次303。随后本批测试与唯一产品文件按既有格式规则格式化，并重新构建Storage。最终集中运行显式包含已知清理记账审计，结果以approved-107-final-explicit-known-red.run.json/log为准；不得因其预期RED而报告整批绿色。范围内旧writer兼容、架构和原Fixture字节验证也以本次封存receipt为准。

独立depth最大值、BigInt溢出和累计预算不足已覆盖原3意图，但不是完整整操作bytes/items/rows/逻辑memory的精确oracle。数值shape占位只用于节点数/解码权重，禁止用作serializedBytes预算参考。

## 未关闭问题

[清理行预留提案](../specs/2026-10-27-phase1-cleanup-row-reservation-proposal.md)与[集中任务包](../plans/2026-10-27-phase1-cleanup-row-reservation.md)仍待专项接受：两项真实审计表明构造5行全部花完，正常和构造失败close另外读取1行却没有预算资金。原§4.1所有SQL计费与§6提交后清理失败未定义预留/消费/重试时序，依据AGENTS不能静默定约。沿用批准只继续其他原任务，不推定接受新增记账规则。

完整资源reference、最后2原case、有效R010派生状态清除/旧reader bootstrap、根注册和G退出仍OPEN。非空diagnostics门禁现已有证据，不再列作未验证。D/E/F IN_PROGRESS、G OPEN；主任务4/21接受、17未关闭，真实Native/运行资格仍不ready。历史Native timeout UNKNOWN，原失败、C2生命周期、R4 mutable DB和所有接受风险保留。无真实Native、RSS校准、新依赖/置信分数/profile、云端CI、Git写入或付款操作。
