# R5 CI 批准记录与 R4 历史证据兼容提案

2026-11-04，待批准。适用于 [R5 集成计划](../plans/2026-11-04-phase1-r5-exact-pack-integration.md) I2；本提案优先于其中“直接替换批准文件”的初拟步骤。

现有 `scripts/test-native-refresh-ci-layout.mjs` 读取 `fixtures/ipc/refresh-v3/approved-transport.json`，逐条核对 8 项 R4 历史 Source 的原路径、SHA 和长度。R5 同路径 8 项均不匹配历史身份。R5 独立生成清单确认：测试文件及 `scripts/native-refresh-ci.mjs` 都是精确绑定输入；工作流、现有批准记录及拟新增 R5 批准记录均不是该目录的绑定输入。直接替换记录会改变历史测试语义；修改测试或 CLI 则要求新证据，不能借现有 R5 资格。复制历史证据到 R5 包也不能为同路径混用不同身份。

推荐保留原批准记录逐字节不变，新增同目录 `approved-transport-r5.json`，使用真实 Release ID/asset ID。仅调整现有 Native job 的 exact-pack step：下载器读取新记录，既有校验与诊断测试继续运行；调用原 collector 前，在 CI 自有临时 checkout 的固定输入路径短暂放置同一份新记录，collector 退出后在 `finally` 原字节恢复旧记录并核对。此步骤不对本地工作树执行，不新增 CLI 参数、环境审批覆盖或 fallback。下载与 collector 都校验同一个已提交 R5 记录，继续保留原严格 SHA、物理布局、实际 22 类和全部旧测试。任何读取、写入、恢复或校验失败都使作业失败，保留原诊断和失败证据。

相比改 CLI/测试再重新制作全部 R5 证据，这个接入方案只影响 CI 提供批准记录的位置，不改变批准记录 schema、门槛、fixture 证据或收集行为。若不采用，维持现有本地证据和云端 HOLD；不直接替换 R4 记录或跳过历史测试。

批准后范围：一个新记录、现有 workflow 一个 step 的修改、范围匹配的验证（旧历史身份检查、两个记录分别通过既有验证器、本地 ZIP 对新记录完整校验、CI step 的 PowerShell 解析及恢复路径核对），以及一处追踪补记。验证不重复 Native、校准或 holdout。不改 workflow 触发/作业或 R5 已绑定文件。对真实 Release、Git 写入和云端批次的授权仍遵循集成计划，不能由此 DCP 推导。