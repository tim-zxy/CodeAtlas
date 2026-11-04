# C3-A capture DCP 作者设计审查

2026-10-23；DESIGN ONLY / PROPOSED。审查对象：[C3 DCP](../specs/2026-10-23-phase1-code-context-capture-dcp.md)。本轮用户要求继续下一步，故完成书面设计与核验；没有把它当新实现批准。没有独立reviewer或子agent。

## 结论

C3-A已形成可供用户审阅的只读capture/recheck契约；推荐先审A，再writing-plans。B/C未达到实施就绪，不能在A的批准中夹带迁移、stage/normalizer/outcome修订或Native hook。没有当前生产变更需要宣称测试通过；C1真实file symlink门禁和P1-04/05/Phase1所有原出口仍OPEN。

## 审计发现和设计处置

| 风险                            | 实码依据                                                             | 设计处置 / 剩余义务                                                                                        |
| ------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 把Native token当完整Code身份    | token含snapshotcount/指针/Java summary，不读取所有Canonical/R009候选 | A新增域分离的完整Code/active-support摘要；不改旧算法                                                       |
| 伪空Code或不完整join看似稳定    | ACTIVE Evidence可与候选/Binding/FactEvidence不完整对应               | census/反向census；损坏拒绝，不以相同坏读集通过recheck；typed NODE/EDGE键                                  |
| 只测提交计数，漏测内容绑定      | 正常Apply同时改变count与支持                                         | 两个自有DB同HEADER/count/identity而合法candidate不同的独立摘要预期，防header-only实现蒙混过关              |
| 把Source表当已激活历史          | Source save覆盖同WORKTREE行和source_files                            | A永远historicalSourceProof=UNAVAILABLE；B需要激活绑定历史manifest与独立R011/恢复设计                       |
| SQL TEXT已入堆才检查            | Source load使用all                                                   | A只面向当前UTF-8/R010，数字预检+iterate+bounded per-row IR/编码；复用既有logical charge，不冒充RSS/profile |
| recheck被ambient旧snapshot欺骗  | 底层已有transaction helper会复用外层事务                             | A的公开capture/recheck拒绝ambient事务；短独立snapshot。B锁内CAS须Store私有实现，不接收“已锁”布尔值         |
| 伪造或跨连接凭证                | 结构digest可以由caller重算                                           | 私有WeakMap+同连接空opaque handle；变化/关闭/release永久失效；没有从JSON/digest恢复途径                    |
| owner-stage与final候选循环      | ownerMap包含stageDigest；Python normalizer输入先要求RepoBasis        | B先StageDigest（排除自引用），后ownerMap/request；normalizer Source-target契约另审；不填假final Code basis |
| completed被当冻结/同名stage冲突 | TEMP固定表名；completed后仍可normalization/merge                     | B须真实只读状态和单一阶段分区；不套旧Native seal，不同时实例化同名stage                                    |
| PARTIAL改标成功                 | Syntax终端PARTIAL且无独立Code完成度；Application full明确拒PARTIAL   | B先补独立完整性契约/预期，保留SUCCEEDED gate，不直接Store绕Application                                     |
| helper成功晋级产品采集          | C2受控场景仅2次attach，4生命周期已耗尽                               | C独立实际child/barrier/accounting DCP；无新OS运行、无重试、无profile批准                                   |
| 新契约被写成既成权威            | 新Code摘要、handle、未来R011未实现未接受                             | 控制文档只追加PROPOSED引用；不改ADR-020接受状态/SQL/IR/wire/phase出口                                      |

## 自审边界

A接口均明确标为拟议，不声称代码里已有；字段、错误、事务所有权、读集、排序/哈希、缺失状态、连接生命周期与独立Fixture条件都有定义。具体SQL清单/测试数值/精确可执行命令由A书面契约接受后的计划审查补齐，而不是在设计审查时运行产品。

Source root locator摘要仅绑定数据库记录，不证明磁盘路径安全或历史Source真实性；digest不是权限。A不连接生产prepare，因此空Syntax catalog仍在真实Source/二进制/Native操作前拒绝。未来Sqlite/Node/TEMP/collector存活开销不从logical字符串charge推导；独立profile门禁保持。

R010-only是新增capture第一实现的显式兼容边界，旧R009等功能不降级、不自动迁移；未来R011适配随B审查。持久历史manifest的物理schema、全部Code写入后的Syntax失效、旧库缺失历史、跨重启恢复、完整混合Candidate/Store与真实process accounting仍未定案或未证明，均不标完成。

## 证据与下一审批

本轮启动时上一implementation-verification.json的562项哈希全部匹配。源文件只读逐项核对，保留source-file SHA和读取位置；没有新unit/Fixture/Native/helper/云端执行，不重复下载产物或旧完整回归。新文档显式绕过默认Markdown ignore做范围格式检查，核验本地链接；新design workspace保留本轮核验收据，旧plan workspace及C2原始记录不改。

需用户确认的是C3-A书面契约。确认后写具体实施计划，再按用户既定方式inline顺序评审执行；不另问会话/工作树/agent选择。B/C不随此批准自动实施。CI仍等可集成点后按准确提交/jobs/次数单独确认；历史Native超时UNKNOWN。

## 共享契约一致性二次核对

重读2026-10-22-phase1-contracts-and-runtime-design.md §2后，将其已要求的coverage明确列入Code摘要，避免仅Code/support通过却漏掉覆盖状态。R001..R010没有最新空图snapshot指针，选择同indexed revision的完整snapshot/coverage集合，保守包含同WORKTREE历史并受限额；不猜最新、不按rowid排序。coverage按语义多重集精确计数，物理行ID不参与，原行均计预算；无Code事实的coverage也有独立Fixture义务。snapshot运行时间不进语义摘要、根locator独立，保持既有稳定内容原则。该取舍作为本DCP审批内容，未写成已接受算法。没有更改Frozen实现或弱化coverage要求。
