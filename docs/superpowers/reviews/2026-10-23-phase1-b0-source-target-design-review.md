# B0 Source-target 设计作者审查

2026-10-23。审查[提案](../specs/2026-10-23-phase1-b0-source-target-dcp.md)，不是实现或独立review。B0-a书面契约为PROPOSED；B0-b结果协议仍待独立细化，不能据此实现。

## 审查结论

推荐 additive normalizePythonSourceObservation，复用现有 SyntaxTargetSourceSchema 与相同私有归一化核心。原 normalizePythonObservation、strict basis shape、版本/身份/错误/限额/旧Fixture均保留。Providers index已有export-star，新增入口不需要再次改变index或workspace导出预期。没有新的公用IR类型、通用框架、配置或依赖。

## 核验与必要区别

- C3-A前收据664/664哈希在启动时匹配；本轮只读核验调用路径及一次纯内存反例，无产品回归/新Fixture注册/DB/Native/helper/CI运行。前轮422PASS/1TODO为历史，不算本轮新回归。
- Python现有代码确实只用basis.repo/revision映射身份；已有目标三元组可解除先有最终Code digest的循环，但contentFingerprint在纯API中只能作结构声明。它不等于各文件指纹，也不能自行认证真实Source。Application/Stage必须另绑定真实capture/inventory并在Store写锁内复核。
- 反例保留旧完整Source/参考文件，只在内存删事实并重新封装序号/count/checksum；现有validator接受SUCCEEDED的零Code流。旧normalizer对schema-valid空数组输出空pairs。它们都不声称提取完整，本轮不能将这个边界改称Native漏提取或生产漏洞。counts不同说明不能匹配冻结完整参考；未另跑完整output checker。
- 原 v4 outcome由Syntax coverage推导，不能对Code完整性投票。PARTIAL不重标SUCCEEDED；即使旧SUCCEEDED也不能弥补缺失的完整Code证明。B0-a不扩展wire/旧Apply、不新建Code-only发布路径。
- 新入口合法空映射保留为provisional；不为“有Source就必须非空”编造规则。真实空文件与遗漏事实的区分属于B0-b的独立生产/consumer/Fixture完整性契约。
- Opaque Source fingerprint schema并不保证scalar Unicode，已在自审中明确新入口应在新shape补检查；不宣称旧入口已有所有此类拒绝，也不借共享核心改变旧行为。

## Spec覆盖/任务追踪

| 要求                         | 未来证据                                                            | 状态                            |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------- |
| 无最终basis的严格输入        | B0a-1独立输入/golden先冻结、API缺失RED                              | 未编写/未执行                   |
| 同一事实算法/旧兼容          | B0a-2新旧共同合法输入等价、原黄金/错误/类型与Provider独立性         | 未实现                          |
| 不认证Source/不授权发布      | 额外authority字段拒绝、空数组仍无outcome；未来C3/Stage绑定另验      | 契约明确，产品未实现            |
| 完整Code/Syntax不可推断      | 本轮纯内存反例；后续B0-b per-scope独立完整预期和strict协议          | 后续阻塞保持OPEN                |
| Failure/recovery/security    | 纯映射无SQL/IO；跨上下文/未知kind/引用/资源拒绝；保留旧门禁         | 待局部实现及匹配测试            |
| 注册/Architecture/Evaluation | 拟新Fixture ID且不碰旧根；Providers build/明确无Native匹配清单/架构 | writing-plans后固定，不预报通过 |

## 自审取舍与缺失项

替换旧API或接受可选basis会混淆语义，未采用。完整dual-result wire/stage一次设计缺少独立Code承诺与实际资源依据，未借本轮补造。B0-a可以独立作为纯映射基础验收，但不是B0整体验收。新Fixture的精确JSON和测试命令需在用户接受书面契约后的具体计划中固定；没有数值Quality Gate、newprofile或Source.py激活批准。

C1 file-symlink EPERM/旧4个C2槽/历史Native UNKNOWN保留。B0-b、B1历史manifest/removed/Stage/atomicApply，以及C实际child/collector记账各自仍需设计/计划/相应实际运行批准；全部P1-04/05/Phase1 exits OPEN。无FROZEN契约在本轮被修改，ADR/权威文档只记录PROPOSED，不升级为Accepted。

建议用户确认本文件B0-a具体契约后进入writing-plans；保留同会话顺序方式，不重问执行方式。此次确认不授权实现未写的计划或B0-b/B1/C。
