## Snapshot diagnostics clarification accepted; original B1b D..G resumed — 2026-10-26

用户已明确批准[兼容澄清](../specs/2026-10-26-phase1-snapshot-diagnostics-compatibility-proposal.md)并继续原批次，无需重新拆包确认。H1 旧 SQL 比较投影 P 精确包含 id、repositoryId、providerId、providerVersion、runtimeVersion、requestedRevisionId、requestedRevisionFingerprint、startedAt、completedAt、capabilities、outcome；仅 diagnostics 不属于旧表可重建字段。完整 diagnostics 原序保留在不可变 history/origin 和其身份中，不能从旧 SQL 的缺失字段推断原观察为空；origin/registry 完整比较、新 snapshot freshness 和同 ID 异内容拒绝不变。无迁移／IR／wire／Code 身份／数值变更。

H1 永久回归先 RED（79 项中 2 项预期失败），窄修正后连同严格 raw 对照共 81/81 通过，含 INFO/WARNING 完整保留、只读磁盘重开及两时间字段漂移拒绝；Storage build 通过。证据：.superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/diagnostics-permanent-red._、diagnostics-compatibility-green._、diagnostics-storage-build.*。这只是当前局部证据；D/E/F、完整预算／故障恢复／Store/raw 同诊断核验及 G 全包门禁仍待执行，B1b/P1-04/05 和 Phase1 均未完成。生产资格路由保持关闭，无真实 Native／新依赖／校准／云端 CI／Git 写入。下方旧状态是保留快照，其 pending/hold 结论由本补记替代，旧失败不改为通过。

# Snapshot diagnostics 兼容提案作者评审

2026-10-26。AUTHOR_ONLY / REVIEW_READY / NOT_ACCEPTED。对象：[具体提案](../specs/2026-10-26-phase1-snapshot-diagnostics-compatibility-proposal.md)。

实证区分了实现、Fixture与契约：旧 full parser/组合器接受SUCCEEDED WARNING并保留诊断，完整manifest通过原H1验证，无诊断对照AVAILABLE；差异仅在旧表未持久字段与全字段比较。不能据此删除diagnostics、修改IR或强行把UNKNOWN当空。

推荐P只排除旧SQL未存的diagnostics，仍精确比较时间、provider/target/版本/outcome及完整capabilities。不可变registry/origin仍保留并校验全部字段；新鲜提交必须匹配已准入raw诊断。原 Code identity、主Schema与数值不变。明确披露未存字段不能从旧表独立恢复，避免把投影比较描述为原始诊断认证。

接受前不改历史比较；受影响D/E/F暂停，已批准B/C可完成局部验证。接受后沿原批次连续实施，单独的小任务确认不再需要。迁移路线、清空诊断、额外运行均未选。只有作者评审，无独立／全B1b验收或绿色修复声明。
