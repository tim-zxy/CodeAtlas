# B1b diagnostics 与 D 组件实施检查点

2026-10-26。LOCAL COMPONENT CHECKPOINT / D IN_PROGRESS / B1b NOT_COMPLETE。作者复核，未声称独立评审。用户已批准 Snapshot diagnostics 澄清并要求继续原 D..G；不请求重复授权。

## 本次实际变化

H1 精确比较旧 SQL 可重建的 P 字段；只排除 diagnostics。完整诊断仍保留在不可变 history/origin 和所有相应身份中，时间和全部 capabilities 仍比较。旧 SQL 本身无法证明未存诊断原文。未新增迁移或真值副本。

D 增加内部 full/R1 组合预算续接：先以真实剩余额度调用原严格准入，将实际消费记入原同一 ledger，再使用已有预算化 Java/Python 归一化、原支持收集与选择。公开入口、输出和原预算结果保持；默认导出不经 public index 转发。旧 R1 私有导出清单精确增加 default；原 self-hash 冻结收据未改，新增显式 successor patch 证明全部原字节与精确变更。

D 新来源 pair 严格生成完整 origin/projection/member/metadata，按已有 H1 域与 UTF16 canonical JSON 编码，保存诊断原序并闭合 Source/Code 支持。历史 pair 验证原始完整内容，只重绑当前 support basis/digest 和 projection ID；原 confidence/extractionVersion/载荷不变。原 fixture-observation score=1 是既有历史字面量，不是新增数值策略。缺失当前值或置信度不足拒绝，不重评分。

这些函数是纯声明式候选组装，不能认证 Source、实际 Native、Stage 所有权、数据库当前值或运行资格。新来源/历史 unit、contract、freshness 与同 ID 完整内容核验仍须固定 Runtime 和 Stage/Store 的完整链路，不能凭 helper 成功授发布权。

## 实际验证与失败保留

证据根：.superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/。每项日志与 run.json 分名不可覆盖。

- diagnostics-permanent-red：79 项中 77 PASS / 2 预期 RED；INFO/WARNING 在旧比较失败。diagnostics-compatibility-green：原严格 raw 对照加 H1 共 81/81。diagnostics-all-fields-green：H1 90/90，含磁盘只读重开、时间与全部已存字段／capability 子字段漂移拒绝。其他字段已有结构门禁与 P 比较共同守护，不将每条拒绝都虚称只在 P 行触发。
- d-continuation-api-red / d-full-api-red：缺入口；d-continuation-green 初次 98/99，仅私有导出清单不认识新入口。精确 successor 更新后旧证据和新预算通过。d-full-resource-red 复现 Python 预算错误被误包装；修正后 d-resource-green 122/122。
- d-history-pair-api-red / d-retained-api-red：缺入口；d-history-closure-red：可调用实现未拒绝缺必需 Source/Code 支持。补闭包后正反例通过。初次 pair 编译类型错误通过现有 IR parser 正确收窄，无断言绕过。
- d-component-final：37 文件 1373/1373，0 fail/cancel/skip/todo，详见 d-component-scope.json。此后只补 11 个 H1 漂移测试，并在作者检查中明确计费引用上下文／retained envelope 的解析表示；d-parser-final-green 对最终受影响 pair 与 mapper 共 81/81，0 fail/cancel/skip/todo。没有把早于最终小改的 1373 描述为最后全包重跑。
- Providers/Storage/Runtime 范围构建通过；d-guardrails 对 17 项目架构检查通过。原 IR 类型检查前序证据未重跑；本次未改 IR 类型或其边界。

## 复核结论及剩余

检查完整诊断保留、P 边界、旧公开出口、同账本且先预留、identity 域／顺序、支持闭包、输入 getter/proxy/cycle/sparse、原历史不可变与安全错误码。最后补足解析表示计费并复核宽数组遍历避免扩展参数栈限制；相关最终检查通过。该检查只覆盖当前组件，不是完整 B1b 或独立作者之外的评审。

D 仍缺完整未来 9 组 Code 行视图／全库 snapshot census 身份、完整 manifest／parent／transition 组装、固定 createMixedAnalysisRules 一次同步装配及 owned budget receipt；当前 Runtime 测试只是这些私有组件的消费者，尚无 Runtime 产品入口。E 的连接所有权／TEMP／freeze 和 F 的原子写入／竞争／故障／进程退出／提交未知恢复均未实施；G 整批出口、测试注册剩余两根和完整本地闭环未完成。冻结的 Stage 66 / Store 43 案例仍只是声明，未算执行通过。

下一项按原批准范围顺序实现 D 的未来行身份与完整 manifest／固定规则，然后 E/F/G；不重新拆包申请。B1b、P1-04/05 与 Phase1 均不宣称完成。无真实 Native/helper/collector/model、校准／新值／依赖、CI、Git 写入、新会话、工作树或代理。所有既有风险与旧失败保留。
