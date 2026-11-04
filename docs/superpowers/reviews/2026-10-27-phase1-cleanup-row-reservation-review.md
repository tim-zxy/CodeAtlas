# Phase1 清理行预留：集中设计评审

Status: REVIEW_PENDING。作者设计/证据审查，不是独立整分支批准。

[提案](../specs/2026-10-27-phase1-cleanup-row-reservation-proposal.md)和[实施包](../plans/2026-10-27-phase1-cleanup-row-reservation.md)形成一个确认点。已读原Stage§4.1/§6、既有constructor5行与liveTable/close、Store COMMIT后关闭诊断及两次实际SQL审计。

两组原始观测一致：setup5/预付5/清理实际1/清理新增付费0；当前2RED，不能以功能PASS掩盖。推荐预留首个清理credit、额外close逐次付费，既保障原整操作额度准入，又保留COMMIT后资源关闭失败的真实已提交身份。预留与实际交付必须区分，credit不入Canonical身份，旧H1/纯Runtime rows语义和全部数值/profile不变。

这是需要用户确认的新预留/消费时序契约，不是再申请原功能测试权限。AGENTS要求FROZEN决定不能静默改变；原契约没有明确预算占用与尚未发生的清理、再次关闭如何区分，直接把5改6并称原语义充分会掩盖这一选择。当前未实现credit、未修改constructor5、未降低预算/跳过审计。原已批准的功能/兼容验证继续，相关资源记账及最终G等待本次集中确认。

风险控制：首个credit不能被普通工作偷用；构造失败同样计费；后续retry不能免费；liveTable不得吞资源异常；close失败不回滚已提交图且lease已死；现有同ID/ABA/foreign/源变更、全部失败/只读恢复/不可变原文保护必须保持。
