# B批剩余统一方案作者审查

2026-10-31；仅设计/任务化，尚未实施；brainstorming、writing-plans、Ponytail full。用户指定的批次边界优先，不再逐private出口拆审批。没有代理或新会话。

已核对原2026-10-27五批计划及P1-06..09原任务：原P1-07是FastAPI、图/Store是P1-08。本方案纠正后续追踪，不修改原G1日志。G1的16个产品/Fixture/注册输入身份与原结果一致，历史54/121/55不重跑。

当前Execution/Runtime IR可复用；Contracts包为空，IR未实现ServiceIdentity/ContractMatch/WorkspaceExecution，migrations止于R011/W003。统一契约必须在Store之前，不能通过新SQLite表把不明确关系当既定事实。

[设计](../specs/2026-10-31-phase1-b-remaining-design.md)明确V4与旧SPI隔离、标准化binding、六match状态/消息方向、当前activation/RevisionSet、单repo与workspace IR区别、same-Code/Syntax变化CAS、last-good及跨库stale。现有两个0.5政策不被当概率；新增关系适用及匹配最弱支持取法列为本次待批准，不发明质量阈值。五个迁移备份true、no backfill/down为本次提案，不借R011授权。

[任务包](../plans/2026-10-31-phase1-b-remaining-execution.md)以B1–B6为执行节点，整体审查后连续实施；核心域和Store有独立Fixture/可验证条件，批末一次去重检查。阶段划分不代表独立审批，也不按Case数推完成百分比。

需要保留的实际不足：部分Feign/Depends/handler输入充分性尚待独立Source核验；如需新wire/Syntax，不在本包偷偷实现。没有原critical evidence/actual qualification，相关父任务HOLD；同时推进无依赖项。原A6/空profile/Native timeout UNKNOWN/main取消未查询/R4与云端边界保持，未移除Gate。

一次整包待确认范围见设计§7；未授权时只形成文档，不创建产品、Fixture、SQL/依赖或运行测试。此为作者审查，不冒称独立评审、实际迁移通过或B批已完成。

作者二次核对收敛三项必要边界：ServiceCatalog包含真实service记录及显式contract关联，不让未实现的serviceRef悬空；新workspace实体身份域/tuple明确；历史Runtime支持不能外键到会被Code刷新删除的current行，必须绑定实际不可变支持值。均已写入统一设计，不改现行实现、不增独立审批包。
