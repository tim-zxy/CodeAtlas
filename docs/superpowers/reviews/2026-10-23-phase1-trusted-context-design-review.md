# 可信上下文与进程采集分段提案作者评审

状态：设计核验完成；提案尚未批准，未实施C1/C2。作者评审，不声明独立评审。

## 评审对象与依据

[分段提案](../specs/2026-10-23-phase1-trusted-context-and-process-acquisition-proposal.md)；ADR-020已接受的混合/准入/遍历补记；IMPLEMENTATION_PROTOCOL变更控制；已完成16-case Source索引与前一收据。重新核对实际Runtime gate、native-client runProcess、PowerShell helper collector、Storage token/temp-stage及原v3 bootstrap。核对Node24.15.0与微软官方公开API文档，外部文档只支持平台接口事实，不替代本地可行性或测量证据。

进入本轮前，前一task-04-changed-only-oracle-verification.json中495个哈希全部匹配。既有725 Node/83 Rust为上轮证据，本轮只改设计/交接，不重跑或冒称新产品测试。

## 主要结论

1. Runtime空catalog前置拒绝真实存在；prepare回调并未替代真实授权capture。全量v3Source检查、旧激活token和Native-state seal可复用其模式，不能当作已实现的混合Syntax stage lease。
2. 当前runProcess直接spawn并立即安排请求写入，只有严格的公开NativeClientOptions，没有通用observer。现有diagnostic preload会monkeypatch，不可自动作为测量透明hook。
3. 当前PowerShell保留的是自己创建helper的句柄；Node公开PID/生命周期或实验diagnostic事件不是Windows HANDLE。句柄持有与退出后查询在平台上有依据，但对实际child的身份、获取竞争、最终峰值读取仍要验证。
4.16-case索引完整覆盖Source/严格单元参考，但6个activation形状差异和全部synthetic contexts仍需真实绑定。removed不在原owner-map编码中；提案保留该编码，完整请求/移除/Apply认证仍是独立门禁。
5. 推荐先做不能晋级Runtime的未执行清单校验和最多4个拥有Node helper场景。实际捕获/产品hook/broker/Native运行都不在本次建议批准范围。探针即使结果可行，也不能直接证明Native或形成profile。

## 自审与任务化结果

- 来源/authority、完整请求含removed/resource、实际Source与stage生命周期、同fingerprint支持变更均有明确义务。
- 资格清单只输出DRAFT/NOT_READY，不自证TRUSTED_CAPTURE/RUN_APPROVED/PROFILE_APPROVED；缺失真实工具身份不填假哈希，不建立第二份生产真相。
- 对Node-owned attach、broker和addon三种路径给出取舍；推荐的是有界可行性问题，不是未验证bridge结论。不访问私有_handle，不默许PID复用、PID轮询或只读退出前采样代替最终证据。
- C2范围是4个顺序、各一次helper生命周期；无系统进程扫描、外部用户进程、Native/Source/profile、提权、依赖或重试；沿用原helper控制。取消/缺失不算成功测量。
- C1与C2可独立，但本会话顺序；C3依赖结果，再决定确切stage seal/捕获端口/bridge/accounting。没有把不存在的lease API写成已完成，也没有绕过Source Python仍未开启的事实。
- 后续真实运行、数值安装、迁移/新增依赖、云端写入/CI分别保留原审批。R4 DB、旧Fixture/失败证据/换行均不触及。
- 不修改现有wire/Canonical/owner-map/profile/迁移，故此刻不改ADR的已接受决策。若C3提出material变化，需明确DCP与受影响Fixture/acceptance/trace，不能从本提案概括批准里推导授权。

未发现必须先修改产品才能评审本方向的问题；无task-local deferred minor。待用户决策的是是否允许C1准备契约与C2外部attach可行性问题。具体实施计划在方向获批后细化，沿用原inline方式。P1-04/05与Phase1退出保持OPEN。

## 本轮验证与限制

仅进行新文档格式、本地文件链接及证据/非文档哈希核验；收据位于.superpowers/sdd/2026-10-22-phase1-foundation-and-runtime/task-04-trusted-context-design-review.json。未写产品代码/Fixture，未启动Node helper/Native/校准或CI。所有可行性问题仍是未执行问题。

Ruling:先分离不能晋级的准备材料与有界helper探针，不选择产品bridge。成本：实际capture/bridge仍需证据与后续治理。
Ruling:作者评审，按用户顺序约束不派独立reviewer。成本：没有独立评审保证。
