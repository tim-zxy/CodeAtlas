# B1-B 历史与增量支持：作者设计评审

日期：2026-10-24。类型：AUTHOR DESIGN SELF-REVIEW；沿用既有会话顺序，无独立 reviewer、产品实施或运行证据。

[被审 DCP](../specs/2026-10-24-phase1-history-support-design.md)；[B1-A 实施评审](2026-10-24-phase1-native-composition-implementation-review.md)。

结论：**可提交 B1-B 推荐书面方向审阅；尚未接受。仅 B1-B1 纯声明转换规则可在接受后继续写具体计划，B1-B2、C/D 不具备实施条件。** 本轮1740/1740前置哈希匹配，上一526测试/架构17是历史结果，没有重跑。

## 实码和契约检查

| 项目 | 设计结论 / 实码依据 | 保留限制 |
| --- | --- | --- |
| 新观察 vs ACTIVE origin | collectMergeSupports 每个 MergeInput 只接受一 Native 观察；旧 applyPatch 保留未受影响旧 Evidence，并只为本次 upsert 构造新 support | 不放宽 merger，不把历史 origin 改为本次 snapshot |
| Source 历史 | 当前 WORKTREE/source_files 会被覆盖；C3-A historicalSourceProof 固定 UNAVAILABLE | 新不可变 manifest 只能由未来联合 Store 产生，不从旧行/summary backfill |
| per-support candidate | R009/patch-stage 读取原候选，而非已选 winner；多 ACTIVE 同 ProviderFactRef 拒绝 | 不伪造丢失 candidate/coverage 或“取最新”消歧 |
| retained 依赖 | Python逐文件，Java保守整个投影组；完整Source字段和契约身份相等 | Java组重算成本尚未Evaluation，不能声称通过性能门禁；更细增量另凭证据治理 |
| 不同 revision | 首版不直接重用含旧revision的Canonical ID；历史parent可指同库前驱，但不是复用成员授权 | 明确FULL_ANALYSIS_REQUIRED，无ID改标 |
| 删除与 scope 退出 | modified可包含同id路径变化；Source身份变化不能靠相同bytes继承；wire id/path重叠明确要求重建 | 不修改旧wire唯一性，不自动全量，不把UNKNOWN/SECRET送Native |
| 其他 Provider | 有独立有效依赖则保留；依赖过期/丢失则要求其重验证，Native无权撤销他人 | 不能以“必须保留他人支持”为由激活悬空/过期Source事实 |
| removal-only | Source历史证明删除；新snapshot若存在，只描述实际成功观察的空/局部scope | 空Native观察不证明物理删除；无准入/成功结算不能Apply，不假造SUCCEEDED |
| no-op | 完整Source/支持/契约/history匹配后仅草案；不创建snapshot/新采集时间 | owner最终重查仍需；不推导Knowledge编译新鲜度 |
| Syntax保留 | 旧wire origin与当前CanonicalSyntax投影分开；exact basis/valueDigest/owner要重验 | mapper/身份/DDL留待B1-C，不能改旧payload或直接换basis |
| coverage | snapshot仅说明观察scope，activation coverage由逐unit/group有效来源合成，零事实也census | latest snapshot/旧summary读者不能自动解释为完整激活 |
| Source独立推进 | 保留Source service独立validated CAS；新事务原子写的是历史Source副本和联合激活 | 不强迫Source扫描与Code同事务，不回退当前Source，不破坏SourceFreshness/Code状态区分 |
| 锁内CAS与旧writer | 原C3-A不改；附加history/membership读集须真实Storage owner；旧Code/support writer改变basis使历史不再适用 | 无caller inTransaction、hash自认证或锁外成功替代 |
| SQL/治理 | R011仍未发布reservation，R001..R010不改；无新Canonical shape、R014或R012/R013依赖 | 无物理SQL/迁移；所有新旧关联与恢复Fixture由C/D完整设计后审查 |

## 作者决定及代价

- 推荐分离 immutable origin 与 activation membership，复用 patch/selector，不重新采集或改写 retained Evidence。代价：需要真实历史表与附加CAS，不是一个纯hash就可完成。
- Java用保守投影组依赖，Python用已固定的文件局部最小契约。代价：任一Java变化重算该组，性能门禁仍可能阻塞；不借此降低原门槛。
- 对其他Provider过期依赖要求重验证，既不越权退休，也不假装当前有效。代价：不具备相应Provider证据时整个联合候选停留未可应用状态。
- 初始无历史、跨revision、不能表达的wire交叉身份，返回需完整重建的明确决策，不自动执行。代价：更保守的可用性，不删除last-good。
- current Source与历史Source副本分开；独立Source推进是target变化，旧支持/Code写入才可能破坏原history-binding。代价：未来Store捕获和锁内CAS要同时验证两个时间点，不能复用caller标量。
- 先独立实现B1-B1声明规则；真实捕获/持久化/增量assembler/当前Syntax投影/Apply留在各自契约。代价：本单元完成后B1-B/Phase1仍OPEN，不能称为真实历史资格。
- 作者自评和本地手工证据，无提交/新会话/工作树。代价：没有独立review/完整集成证明。

## 未予闭合的事项

本设计明确保留：R011物理表/编码/FK、stage全部mutator冻结、旧writer失效路径、真实HistoryCapture、exact delta assembler、removal-only真实run、Syntax新basis投影及身份、其他Provider重验证入口、读者scope迁移、实际资源/重启/原子Apply。它们被列为C/D或B1-B2前置，不能因本作者评审而跳过。

没有发现B1-B1声明规则方向内尚未分类的Critical/Important冲突。后续实现若必须更改既有shape/Code digest/owner-map或无法证明某条依赖，停止对应工作并走DCP；不能将本结论推广为整个B1可实施。

下一步只请审阅书面推荐方向，再写B1-B1准确计划与独立Fixture/本地验证范围；本轮没有产品/Fixture/注册/测试/DB/Rust/Native/helper/profile/云端变更。C1EPERM、C2四次已用尽、timeoutUNKNOWN、main取消未重查及R4未触碰均保持。
