## Snapshot diagnostics clarification accepted; original B1b D..G resumed — 2026-10-26

用户已明确批准[兼容澄清](2026-10-26-phase1-snapshot-diagnostics-compatibility-proposal.md)并继续原批次，无需重新拆包确认。H1 旧 SQL 比较投影 P 精确包含 id、repositoryId、providerId、providerVersion、runtimeVersion、requestedRevisionId、requestedRevisionFingerprint、startedAt、completedAt、capabilities、outcome；仅 diagnostics 不属于旧表可重建字段。完整 diagnostics 原序保留在不可变 history/origin 和其身份中，不能从旧 SQL 的缺失字段推断原观察为空；origin/registry 完整比较、新 snapshot freshness 和同 ID 异内容拒绝不变。无迁移／IR／wire／Code 身份／数值变更。

H1 永久回归先 RED（79 项中 2 项预期失败），窄修正后连同严格 raw 对照共 81/81 通过，含 INFO/WARNING 完整保留、只读磁盘重开及两时间字段漂移拒绝；Storage build 通过。证据：.superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/diagnostics-permanent-red._、diagnostics-compatibility-green._、diagnostics-storage-build.*。这只是当前局部证据；D/E/F、完整预算／故障恢复／Store/raw 同诊断核验及 G 全包门禁仍待执行，B1b/P1-04/05 和 Phase1 均未完成。生产资格路由保持关闭，无真实 Native／新依赖／校准／云端 CI／Git 写入。下方旧状态是保留快照，其 pending/hold 结论由本补记替代，旧失败不改为通过。

# B1b 完整 Snapshot diagnostics 与历史读取的兼容澄清提案

2026-10-26。PROPOSED / NOT_ACCEPTED / NOT_IMPLEMENTED。主任务包A..G已获批准；本补充只处理执行中实证发现的完整快照比较边界，不重开总体规划，不授权新运行或改变数值策略。

## 1. 实证与当前阻塞

[主DCP](2026-10-25-phase1-r011-history-stage-contract.md)§3要求完整原Snapshot进入state.snapshots/originRegistryDigest和origin；[R1设计](2026-10-26-phase1-declared-raw-history-candidate-design.md)§6.2明确保留Java后v5的全部diagnostics及顺序。既有ProviderSnapshot v1允许SUCCEEDED同时带WARNING。这些规则不能为了写历史而删改。

实码：code-context-read.ts从旧provider_snapshots/provider_capabilities重建快照，diagnostics固定为空数组；旧SQL没有诊断列／表。activation-history.ts的normalizedSnapshot只规范化capabilities顺序，然后把完整manifest快照与重建对象逐字段比较。因此合法非空diagnostics也被判INVALID_HISTORY。

本包隔离对照：由已存在full组合器严格验证的一条声明式v5 WARNING，outcome仍SUCCEEDED，组装结果保留该诊断；相应完整manifest通过原validateHistoryManifest，Code身份和SQL存储字段一致。无diagnostics的完整manifest capture返回AVAILABLE；保留原diagnostics的版本capture失败INVALID_HISTORY，堆栈落在snapshot相等比较。Probe是本地声明式数据和隔离SQLite，不是实际Native/Source运行、测量或校准。

证据位于 .superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/diagnostic-compatibility-red.log、.stderr.log、.run.json、diagnostic-compatibility-probe.mjs及diagnostic-candidate.json。该RED仍未修复，不算通过。D/E/F依赖该边界，暂停相关实施；B/C不受影响的范围继续验证。

## 2. 推荐：保留完整历史；精确比较可持久重建的字段

固定比较投影P(snapshot)恰为：id、repositoryId、providerId、providerVersion、runtimeVersion、requestedRevisionId、requestedRevisionFingerprint、startedAt、completedAt、capabilities、outcome。只有diagnostics不在此旧SQL可重建投影内；capabilities继续按name排序，保留support/coverage全部值和重复检测。时间仍需精确核验，不因为Code digest忽略时间而从P中删除。

H1读取须满足两个独立条件：完整历史/来源对象自身的全部严格校验与不可变身份通过；P(manifest snapshot)与P(实际旧SQL快照)精确相等。任何可持久字段变化仍拒绝，不用部分字段“差不多相等”。不把旧表未存储诊断解释为“原观察确认没有诊断”。

完整diagnostics继续留在state.snapshots、originSnapshot、originRegistryDigest及全部manifest/origin身份编码中；读取视图仍返回这些原始完整对象，不把它们的diagnostics清空或排序。origin与registry的完整Snapshot相等关系不变，历史重投影不改旧诊断、confidence、extractionVersion或其他载荷。

新鲜观察在固定Runtime/Providers组装时必须继续从受严格准入的Java然后v5事件构造完整diagnostics，不能接受caller diagnostics数组、布尔资格或配置替代。H4消费前对Raw→完整Snapshot／Code／Syntax／manifest关系重新校验；同id异内容拒绝，Store只能插入或精确比对不可变记录。不得修改已提交历史来“补齐”旧诊断。

## 3. 精确性与信任边界

旧SQL能够独立核验的只是P。未持久的诊断原观察内容不能从该旧表恢复或再次独立核验；它依赖已验证提交的不可变完整history/origin及其hash/关系。文档和诊断必须说明这个限制，不能宣称SQL重读证明了原始诊断文本。

这不是让历史JSON自行授予运行/发布权：仍需真实pointer/capture/Stage所有权、完整Code/source/support/coverage及锁内复查。直接恶意SQL插入history不属于主DCP承诺防御的边界；真实Native/Source/settlement及qualificationRef资格继续由H5控制，未通过前生产路由关闭。测试port不能替代生产固定装配或放宽Store校验。

只比较P属于本次明确请求接受的校验契约澄清；本轮不先删掉当前全字段比较让测试变绿。若用户要求诊断还必须有独立旧SQL存储副本，则选择下面的迁移路线，不能暗中使用P后声称全字段SQL一致。

## 4. 备选及影响

| 路线                            | 行为与代价                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 推荐：P精确比较＋完整不可变历史 | 不新增真值副本，保持完整诊断／身份／旧表兼容；明确SQL无法恢复未存字段；需本澄清及相应正反Fixture                  |
| 新增专门的诊断持久化迁移        | 可独立重建全部快照，但增加Schema、写入／迁移／恢复与旧行无诊断证明问题，涉及ADR-020迁移预约和另案范围；本包未授权 |
| 清空诊断／拒绝全部非空诊断      | 会丢失原始观察或缩小既有合法SUCCEEDED范围，违背R1完整诊断保留；不推荐、不据此实现                                 |

旧C3-A身份编码、IR/ProviderSnapshot v1、IPC1..5、SQL/checksum、public capture视图/API和数值支持策略均不变。Code identity原本不含diagnostics；完整历史与origin身份继续包含它们。不是修改原Code identity来掩盖差异，也不降低Quality Gate。

## 5. 纳入已批准B1b包的实施和验证

若接受本澄清，直接继续原A..G，不再为相同批准范围重新任务化或逐小步询问。仅对activation-history.ts的Snapshot SQL比较使用明确P，不改变旧R010 reader；相应测试加入现有mixed Stage/Store语料组及H1兼容测试，不新增Fixture根／依赖／迁移。

必须覆盖：现有空诊断全部旧结果保持；SUCCEEDED+INFO/WARNING的完整保留与重开；Java后v5多诊断原序；P的每一个字段及capability值漂移分别拒绝；origin/registry全对象不一致拒绝；diag改变必须改变完整registry/manifest/origin身份；raw诊断不匹配新提交候选拒绝；已提交origins不回填／不覆盖；同Code basis但不同诊断历史仍有不同history身份；回滚/commit未知恢复比较完整历史，包括诊断。未执行的Store/disk/Runtime门禁继续OPEN。

同步ADR-020、主DCP、Provider SPI/Canonical IR/SQLite/Evaluation/Security/WBS/Acceptance/Traceability与CURRENT_STATUS，原文和失败保留，不修改旧测量／旧冻结报告。B1b完整Exit、P1-04/05与全Phase1均仍须原全部门禁。

## 6. 本次集中确认

请求接受推荐的P比较及完整不可变诊断边界，并将对应实现／正反测试／文档同步纳入已批准B1b后续D..G。无新score/阈值/profile/依赖、实际Native/helper/模型/校准、云端CI或Git写入。需要此次确认是因为该实证兼容冲突要求明确改变已接受历史读取的完整Snapshot比较依据；不能从普通实施批准推导放宽该校验。

## 7. 复现与快照身份防护补记

加强后的diagnostic-compatibility-confirmed-red保留真正原始无诊断raw/snapshot/provenance作为正控制；含诊断版本仍由原严格组合器构造，依然1PASS/1RED。首版probe和所有日志保留；不可覆盖的diagnostic-candidate.json只是固定声明输入，不是新的实际观察。

新观察仍遵守原snapshot freshness/唯一性，不得因为旧SQL没有diagnostics便复用旧snapshotId来接受不同完整内容。存在不可变完整历史副本时必须比较完整快照，包括诊断；只有legacy SQL而无完整历史时，诊断是未知，不能回填[]或证明同一完整观察，沿原fresh-id/拒绝路径。纯hash向量中“同Code basis而诊断不同产生不同history身份”不是覆盖已提交snapshot或origin的许可。上述正反控制是本澄清接受后的必要门禁。
