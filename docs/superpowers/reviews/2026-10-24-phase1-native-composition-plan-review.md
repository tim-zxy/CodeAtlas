# B1-A Native 投影组合：具体计划作者评审

日期：2026-10-24。类型：AUTHOR PLAN SELF-REVIEW；没有独立评审、产品实现或真实运行。

[已接受设计](../specs/2026-10-24-phase1-b1-composition-design.md)；[待审具体计划](../plans/2026-10-24-phase1-native-composition.md)。

结论：**具体计划 REVIEW_PENDING，可提交整体确认；A1..A3 NOT_STARTED。** 用户最新“确认”接受书面 B1-A 方向及 scoped capability 语义，未扩展为本计划执行或 B1-B/C/D 权限。计划开始时1421/1421前置哈希匹配。旧Node500/Rust105/18库案例/架构17没有重跑。

## writing-plans 自评

| 检查 | 落点与结论 |
| --- | --- |
| 设计覆盖 | §4.1→A1独立参考+A2strict/safe/scope/identity；§4.2→A2五项Java能力和全部子结果成功；§4.3→A3normalizer/一次merger/七字段结果；§4.4→A2/A3固定错误与无副作用；§5→保持阻塞，不偷做SQL/历史 |
| 任务粒度 | A1的独立预期可单独否决；A2安全/上下文可独立验证；A3依赖其prepared接口完成候选和收尾。冻结先于产品，不能并行author expected与产品 |
| 接口一致 | readNativeCompositionInputs四参数→PreparedNativeComposition；composeNativeProjection同四参数→NativeProjectionCandidate；maxSerializedBytes/maxItems/maxDepth一致；prepared累计预算供A3延续，无阶段重置 |
| 精确结果 | 七字段、scope名称数组与snapshot capability对象区分；Java parsed来源没有raw checksum；v5完整bytes checksum与terminal前缀checksum区分；不返回Buffer别名/authority标志 |
| 成功scope | Native providerId固定为实际descriptor的native，不生成分身；Java旧五能力全集合，逐文件coverage和统计完整；v5双outcome与原validator不改；scope名称不成为descriptor/协商广告 |
| Review Focus | 五项风险各有具体命名测试及所属任务；mixed完整结果/Evidence是literal expected，不能自我生成golden |
| 错误 | shape/wire损坏→INVALID_INPUT；身份/清单/时间不匹配→INVALID_CONTEXT；小scope/未支持Source→UNSUPPORTED_SCOPE；缺必需子结果/合法partial→INCOMPLETE_OBSERVATION；resource/normalization/merge独立类别；message固定code |
| 输入安全 | 不直接用旧assertCodeSyntaxData作为unsafe metadata guard：其Object.entries顺序不是此边界保证；新增局部descriptor iterator扫描后复用boundedJson和原strict schema。原helper行为不改 |
| 限额诚实性 | 调用者显式逻辑预算、输入复制前检查、应用持有表示累计；复用函数内部短期heap/GC/RSS未测，不能称实际memory保证。JSON maxItems与Native AST maxItems独立 |
| 传输边界 | Java仅parsed v2 revalidation+表示尺寸/hard event cap，不新增byte decoder，不声称真实行字节验证；v5重用原byte validator |
| 版本/时间 | 子组件版本/tool/窗口是相等性声明校验，无实际二进制/clock/settlement证据；Java无wire版本字段不补造 |
| Fixture/Evaluation | 新ID仅p1-native-composition-candidate-v1，12种子前置冻结；旧原16场景、44/80文件全部原字节保持；empty qualityGates不授予Phase gate |
| 注册/验证 | 根test仅三新增；24文件本地cohort+Providers build+架构17；registry预期50/exact24、新ID唯一/catalog0；所有命令NOT_RUN |
| 边界 | 原index/normalizer/merger/IR/协议/Storage/Runtime/Source/locks/profile不改；原EOL/dirty文件保留；无Native/helper/Rust/DB/root/云端执行 |
| 比例 | 计划给出必要接口、12种子、24文件、三任务及验收映射；无产品函数体、泛化factory/JSON库或预建R011抽象 |

## 澄清与作者决定

- 保留原Java SYMBOL/IMPORT/CALL/INHERITANCE/REFERENCE作为JAVA_CODE_V2完整scope；不是从任意requestedCapabilities子集推导完整。成本：只请求较小子集的输入被拒绝，不扩展旧API。
- 新局部安全输入扫描不可直接复用会枚举getter的data检查；复用byte intrinsic copy、boundedJson、strict schema和normalizer/merger。成本：新增一个包内input模块，避免改通用guard或产生第二套身份算法。
- 逻辑字节/工作限额累计计入表示，不证明原normalizer/merger内部分配或实际RSS。成本：保守拒绝与真实accounting未完成，后者继续阻塞C/qualification。
- Java不采集stderr，内部适配的空字符串不成为captured-empty声明；parsed尺寸hash不能称raw传输hash。成本：候选来源强度仍受此纯接口边界限制。
- 首批全量Native投影不接收历史retained/removed；changed-only仍是B1后续义务。成本：完成本批也不能称B1/Phase1完成。
- 原会话顺序、手工receipts、不stage/commit/cleanup。成本：无committed review range与独立集成证明；作者评审不会包装成独立评审。

没有未分类的Critical/Important计划冲突；本结论不覆盖后续B1-B/C/D或实际运行可行性。具体预算字段/错误类别/12种子/24文件均随本计划整体审阅，尚未建立Fixture或执行测试。

## 确认边界

确认本计划后可在原会话连续完成A1→A2→A3和明确列出的本地验证，不逐步索取确认。范围扩展、设计冲突、新数值/依赖、迁移、破坏性操作或任何云端CI写入仍另行确认。当前只请审阅整份计划，不申请B1-B/C/D、真实Native/helper、R011、profile/校准/CI。
