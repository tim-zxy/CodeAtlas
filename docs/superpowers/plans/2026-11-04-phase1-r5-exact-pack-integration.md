# Phase1 R5 exact-pack 与集成执行计划

日期：2026-11-04。目的：复用 Q3 已完成的本地证据，给当前 Phase1 候选接上既有 clean-host Native CI 门禁。实施仍在原工作树顺序推进。当前 Git 基线 be41b9b2dfd58661388000689bd9769b8f3b5fb7 加本地 R5 改动；它不是待推送的最终 SHA。

## 路线与范围

采用 ADR-019 的同仓 Release、精确资产与布局校验。全量重做校准会重复已通过的 320＋64；复用 R4 包无法匹配当前 Native 源码和编译身份。两条替代路线均不能补足本次 clean-host 验收。无新接口、依赖、门槛、迁移或 workflow 触发调整。

## I1：本地归档与清单

- [x] 核对 22 个 R5 工作数据库的字节哈希与对应冻结种子，22/22 一致；未发现 SQLite sidecar。此处仅为快速预检，原打包器的完整校验仍必需。
- [ ] 复用 `node scripts/native-refresh-ci.mjs pack`，输入为字面 R5 根的 `evidence/candidate.json` 和 `evidence/review/holdout.json`，输出在原 B 忽略证据目录的 `integration-preparation/r5-local-exact-pack.zip`。独立 holdout 与 Q3 的实际 D22 不互换。
- [ ] 记录 ZIP 字节数、SHA-256、归档成员数、Native 文件清单和候选身份；核对生成的 `.manifest.json` 和现有严格校验结果。失败保留，不自行恢复 DB、放松守卫或重新采集。

## I2：一次集中申请 Release 与本地候选固定

I1 成功后提交可审查的真实 ZIP 清单及 SHA。拟用资产名 `task8-r5-approved-fixture.zip`，同仓 `tim-zxy/CodeAtlas`，tag 必须为 `p05-d5-fixture-2c3c890d439c45f8a67d5ba864727ae9a995f02039fb312c021931f6f0c020a7`。对外上传前核对成员为合成 Fixture、规定证据及 pinned Native；检查本地路径字段的披露边界，绝不上传完整 .superpowers、工作树或用户数据库。保留 R4 资产和历史 approval。

- [ ] 只读核对仓库、tag/Release 是否已经存在、确切 tag 目标及该目标的 workflow。若创建 tag 可能触发 push，按该目标的实际 jobs 明列至多额外一批；未核实不声称零 CI，不改变 workflow 或使用跳过 CI 的标记。
- [ ] 仅在明确批准后发布真实资产，校对实际 Release ID/asset ID/name/size 与本地 SHA。若身份不符、资产已被不同内容占用或出现非预期触发，停止；不覆盖旧资产、不重传试错。
- [ ] 使用真实 ID 填写 `fixtures/ipc/refresh-v3/approved-transport.json` 的 v5 批准记录，复用 `validateRefreshCiApproval` / `verifyRefreshCiPack`；不将候选记录的占位 ID 当成生产批准。审查最终差异和可携带证据；如需新独立评审，纳入同次授权，不逐文件审批。仅精确暂存被批准路径，核对与 be41 的候选增量、原 EOL 变化和排除清单，再固定一个本地提交。不要提交 ZIP、.superpowers、.pnpm-store、外部 DB 或二进制。
- [ ] 以最终提交、树、父提交和实际 Release 身份准备云端申请。Release ID 与 asset ID 进入已提交配置，故 I2 完成前没有可供 I3 审批的准确提交。

## I3：一次集中申请 CI 与集成

- [ ] 提交确切 SHA、实际 main/base、Release 资产身份、一次 push 与一次 PR 的预期范围：当前 workflow 每批三个作业（Ubuntu TypeScript、Windows Rust、Windows Native Java）。常规同仓 push＋PR 预计两批共六个作业；合并可能额外触发 main 一批三作业，列明并按授权执行。Release tag 影响在 I2 单独计数。替代方案是仅保留已验证本地包并延后 clean-host；本地 Q3 不能代替 clean-host。
- [ ] 只读核对批准的 base、branch 状态、同一 head 六项必需检查及 PR 状态。全部成功且树身份符合、并已获合并授权才集成；任何失败保留证据并停止，不 rerun、补推或自动修正至绿。历史 main CI 39708335128 不重跑。
- [ ] 用实际 GitHub 结果更新集成状态。未运行、取消、待定或失败不计 PASS。Q3/CI/合并均不自动关闭 Phase1 的 17 个开放父项或 Syntax/A6/E02；历史 Native timeout 仍 UNKNOWN。

参考：[Q3 本地结算](../reviews/2026-11-03-phase1-native-profile-installation-review.md)、[ADR-019](../../handoff/adr/ADR-019-d5-exact-layout-ci-replay.md)、[GitHub push 触发](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push)、[Release tag 目标](https://docs.github.com/en/rest/releases/releases#create-a-release)。
## I1 结算与 I2 审批边界

打包器 exit 0；ZIP 271,749,831 字节、5,622 个成员，SHA-256 `44cc411d72f5a25539fa8fbdd8e18e7cde9ecfd93f4c1f5353424d6f4541d8e4`。实际 Native 源码清单 52 项；原独立 holdout SHA `1ad0abe4dd9c67a8712816a092838dd796d6d0266cfa2b7f94f8a1c5b6b0553f`，和独立保存的 Q3 ACTUAL_ADMITTED 产物不同。归档与精确结果 JSON 位于原 B 的 integration-preparation，不提交。

I2 使用[兼容提案](../specs/2026-11-04-phase1-r5-ci-approval-compatibility-proposal.md)，该提案覆盖上方直接替换旧记录的初拟步骤。远端 main 只读确认 `433015700c7c701a6493f7f8fa5eace00e773913`；拟议 tag 的精确 ref 与按 tag 查询的 Release 均返回 404。创建前再查同 tag 草稿并重新核对 main、权限和资产边界；同名、身份不一致或意外触发时停止，不覆盖。

推荐 I2 仅创建同仓**草稿** Release 并上传上述单一合成证据资产，target_commitish 固定为 `433015700c7c701a6493f7f8fa5eace00e773913`。此 tag 仅用于资产定位，Native 来源仍由 52 项清单和二进制哈希绑定。ZIP 含合成 Java/测试 SQLite/日志及既有本机绝对路径绑定元数据，供明确审查。草稿阶段不主动建/推 tag，预期 0 批 CI；如观察到意外 tag 或 CI 即停止并记录，潜在影响限同一目标的一个 push 批次、三个作业。取得实际 ID 后实施兼容方案、一次只读独立评审和准确本地固定。批准 I2 不授权发布草稿、推送分支、开 PR、合入或重跑。

I3 在最终准确 SHA 出具后另请一次：发布草稿及其 tag 影响（按 0–1 批计）、一次分支 push 和一次 PR（预期两批），以及明确选择是否包含门禁成功后合入（另一个 main 批次）。不为测量或状态同步额外触发。无需该云端结果时，可保留已经验证的本地 ZIP 与全部本地证据。
