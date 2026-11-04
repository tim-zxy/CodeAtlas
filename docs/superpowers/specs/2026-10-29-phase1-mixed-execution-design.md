## 当前结果 — 2026-10-29

用户已批准本设计和T1–T4，本地状态A5_FIXED_EXECUTION_LOCAL_EXIT：[A5实施结果与作者审查](../plans/2026-10-29-phase1-mixed-execution-closure.md#实施结果与作者审查2026-10-29)；[唯一结果索引](../../../.superpowers/sdd/2026-10-29-phase1-mixed-execution/results.json)。完整实际运行资格仍NOT_READY。下文“待审/只有设计”是保留的批准前快照；本结果替代其状态，不扩大§7授权。

# Phase1 A5：固定混合执行链、显式配置与运行资格边界

2026-10-29。REVIEW_READY_LOCAL_IMPLEMENTATION / PRODUCTION_QUALIFICATION_NOT_READY。与[合并实施包](../plans/2026-10-29-phase1-mixed-execution-closure.md)一次审查；未批准前只形成设计，不改产品或Fixture。

## 1. 基线与实码发现

[A4结果](../../../.superpowers/sdd/2026-10-29-phase1-bounded-source-state/results.json)：195 PASS/1原C1 TODO；SourceState有界SQL、同账本、根绑定已本地交付。本轮不重跑该批次。

当前可复用链：A4 prepareBudgetedMixedSourceOperation → captureActivationContext → MixedAnalysisStage → A3 v2请求 → settled Java owner → A3 v5请求/私有client → 最终metadata → freeze → Source完整重查 → MixedAnalysisStore.apply。仍由测试手工串接，缺少单一固定调用者。

核验依据：
- index-command.ts 现行产品操作为FULL/INCREMENTAL，STATUS独立；没有要求AUTO回退。沿用显式操作可以避免引入策略框架。
- Stage构造只接FULL/DELTA；prepareScope拒绝unchanged DELTA。NO_OP应在prepareOwner前确认，不能捕获INVALID_STAGE来推断。
- EffectiveConfig已有providerId/enabled/configurationSchemaVersion/configuration，顶层configVersion=1；Native配置内容尚未给出混合SQL/events来源。
- 原native-composition-candidate/empty request/expected是空FULL正例；v5 TS/Rust允许空sourceFiles但要求非空languages。mixed-request-preparation额外要求sourceFiles.length>0，阻断该既有能力。
- Store已内部记录activationId/status/cleanupFailed；apply返回/异常不足以区分提交后关闭失败。无需为取得本地结算状态自动重开DB或重跑恢复。

范围：将上述五处衔接合成一个可测试的私有执行组件；生产资源资格仍按§7保持NOT_READY。不是用新壳函数宣布生产路由ready。

## 2. 选择与边界

推荐显式FULL/INCREMENTAL；INCREMENTAL可返回NO_OP或执行DELTA，必要时明确FULL_ANALYSIS_REQUIRED，由上层另一次显式FULL请求处理。禁止在失败后自动重试FULL。

不新增AUTO模式、通用执行器/可注入transport、捕获credit/token框架、另一套历史差分、隐藏profile/test flag。沿用Stage构造对真实capture的累计费用导入；NO_OP允许必要的Stage TEMP准备/关闭，但不生成新activation/history/ProviderSnapshot或Graph写入。Source仍经过原CAS，成功Source commit与Graph NO_OP分别报告，不把Graph NO_OP说成整个操作零写入。

本包的配置解析和执行器均文件级私有，不从Runtime/package index导出；旧Java/v3 runIndexCommand、旧Index请求/config、STATUS与CLI不改路由。私有qualificationRef仍只是候选契约引用，不是实际运行资格证明。

## 3. Native provider混合配置

使用现有EffectiveConfig.providers中唯一enabled、providerId=native的注册。新混合内容采用configurationSchemaVersion=2；仅当其configuration.kind明确为MIXED_CODE_SYNTAX_V1时由新私有解析器处理。不全局重解释旧version1配置；未知版本/缺失字段/未知键拒绝，不自动补默认。

~~~ts
{
  kind: 'MIXED_CODE_SYNTAX_V1',
  source: { include: string[], exclude: string[] },
  history: { maxRows: number, maxSerializedBytes: number },
  native: {
    maxEvents: number,
    transportLimits: {
      maxStdinBytes: number, maxLineBytes: number,
      maxStdoutBytes: number, maxEvents: number, maxStderrBytes: number
    }
  }
}
~~~

所有数字为显式正安全整数；此处版本号是schema标识，不是质量阈值。无新的默认/测量数值。source规则复用原Source编译器；不新增路径匹配语言。

resolveMixedExecutionConfig(config: EffectiveConfig)返回内部不可变：
- source原规则；
- history：显式maxRows/maxSerializedBytes，加EffectiveConfig.resourceBudget的maxItems/maxDepth/maxMemoryBytes分别映射既有同名逻辑上限；
- operationBudget保留既有六字段；
- native.maxEvents、transportLimits逐项原样校验。复用NativeClient已有hard caps，不引入新数值；maxStdinBytes不得超过operation maxInputBytes，maxStdoutBytes不得超过operation maxOutputBytes，transport maxEvents不得超过native.maxEvents。

域必须区分：
| 控制 | 本包含义 |
| --- | --- |
| rows / serializedBytes | Source→capture→Stage→Store共享逻辑账本，显式独立SQL/编码费用域 |
| Host maxItems/depth/逻辑memory | A4原共享账本；logical retention按原twice规则，不是RSS |
| Syntax maxItems | 原批准的跨文件Syntax work ticks；与Host对象计数及Java内部工作不同，不将两者相加伪造同一计量 |
| maxEvents | 每次原始Native流的事件上限，包含started/terminal；不从items/rows换算 |
| input/output bytes | 沿用各既有子域：Source累计输入、v5请求/源码/输出、transport stdin/stdout；不是新定义的跨重复读取/SQL/两协议总字节数 |
| duration | 一个操作deadline；每步使用剩余时间，不在Java/v5之间重新计时 |
| physical memory | 本包不提供正向资格；不能把配置memory和logical retention当HOST+子进程RSS证据 |

上表是新私有执行契约需要确认的显式语义，不修改旧协议含义。完整生产准入仍需先保留准确物理reservation，再决定可给Host逻辑账本的剩余额度；本包不安装reservation=0或冒称两者同时各可使用全额度。当前私有local组件仍用A4上限，供Node/SQLite/double验证；实际生产配置到物理额度的适配保持OPEN。

## 4. 固定路由与NO_OP

Stage文件新增私有readMixedNoOpBasis(stage, contracts)，仅在PREPARING、mode=DELTA时使用，复用readPreparation/checkStageContext和原contracts解析。返回null或只读{basis,activationId}：
- 必须有完整可用历史；
- target repository/revision/fingerprint、完整inventory、locator digest和contracts均与历史一致才返回旧basis/activationId；
- 不构造owner、不接受caller basis、不从空requiredUnits猜NO_OP；不改prepareScope原unchanged拒绝。
- 不能仅看文件指纹，合同变化/支持身份变化仍走原严格路径。

执行表：
| 请求/状态 | 行为 |
| --- | --- |
| FULL | Stage FULL；按原full完整候选和其他provider门禁，不自动NO_OP |
| INCREMENTAL、历史缺失/不可用 | FULL_ANALYSIS_REQUIRED；不自动恢复或重试 |
| INCREMENTAL、全部上述条件相同 | 初次NO_OP检查→完整Source verifySelection→再次NO_OP检查确认capture未变→关闭Stage→返回旧basis |
| INCREMENTAL、原规则可支持变化 | 原DELTA请求/删除及retained规则 |
| 分类/locator/契约或其他provider变化需full/重新验证 | 原准确拒绝；不把错误吞掉、清空其他provider或降级结果 |

NO_OP用原Stage预算导入/清理机制，无新history capture贷记。必要TEMP开销如实计费。其他provider没有变化时可保留已有完整历史；任何变更仍由原guard裁定。

## 5. 私有执行器

新增runtime/src/mixed-execution.ts默认runMixedExecution(input)。类型引用A4准备、CompositionMetadata、NativeClientOptions、CodeSyntaxRequest、HistoryContractIdentity等既有类型；Runtime不新增IR/Source依赖。输入：
- operation FULL/INCREMENTAL、EffectiveConfig、database、repository、A4 request定位字段（source配置由§3提供）；
- 原policy、signal/deadline控制；
- trusted native options、tool/provider/runtime identity、已登记languages；
- 已审查contracts及qualificationRef（candidate引用，非运行准入）。

不接受raw/events、candidate/basis、store/rules/transport factory或caller提供的成功回执。固定调用现有Application/Provider/Stage/Store。内部以现有schema生成snapshot/request IDs，采用Node randomUUID；不添加可配置ID算法或测试开关。

顺序：
1. 解析配置/显式操作与控制，复用原私有Native options校验（不读binary/不spawn），建立一次操作deadline；A4 Source准备/真实budget。
2. 用remaining捕获历史，Stage mode由显式操作确定；交原Stage导入累计usage，不提前重复导入。
3. INCREMENTAL先执行§4 NO_OP分支；否则原Stage投影。
4. Java请求为null则java=null；否则原v2 client完整结束后形成SETTLED_JAVA_OWNER。版本、tool由trusted input提供，实际profile身份匹配属于§7，不能从字符串自行认定。
5. prepareOwner→v5请求→原私有v5 client完整结束；actual start/settle在相应await前后记录，最终snapshot.completedAt在v5结束后赋值。时钟倒退按原metadata校验拒绝，不修饰成未来时间。
6. acceptObservation→freeze→完整Source verifySelection→同步apply；verify返回后不插入其他await/callback。
7. finally关闭本次Stage、释放未接管capture/account；不关闭caller DB，不清理外部Stage。Source/Graph各自如实结算。

每次Native调用沿原固定客户端、一次stdout消费、await close与错误丢弃；每步使用同一绝对deadline的剩余时间。native options不得扩大解析后的transport/duration/input/output；原allowedEnvironment/arguments校验保留。worker/二进制/描述符的实际可信取得与测量绑定仍未完成，不擅用旧Java reservation证明新流程。

空FULL：在既有A3构造器仅解除FULL的额外非空sourceFiles限制。空范围用输入中唯一python descriptor（与既有PYTHON_SYNTAX_CODE_V1空Fixture一致），不选任意第一个或捏造grammar/version；缺失/重复仍拒绝。DELTA requiredUnits为空仍返回null，不启动Native。沿原v5空流、完整metadata/Canonical候选校验；不得把缺流当空成功。无需改Rust/wire/IR/schema。

## 6. 结算与错误

Store文件新增文件级readMixedAnalysisSettlement(store)，从既有WeakMap读取固定字段，返回null或冻结的{activationId,status,cleanupFailed}。不复制manifest/row image、不读SQL、不自动修复；它只是该本地Store实例观察到的结算，不是fresh只读恢复证明。

私有执行错误携带：
- sourceCommit：原NOT_ATTEMPTED/UNKNOWN/COMMITTED；
- graphCommit：NOT_ATTEMPTED/NOT_COMMITTED/UNKNOWN/COMMITTED；
- activationId（无已知身份为null）、cleanupFailed。
源于真实Source workflow、是否进入apply以及真实Store settlement。apply之前为NOT_ATTEMPTED；apply已进入但receipt尚未建立且原实现尚未Graph写入为NOT_COMMITTED；receipt UNKNOWN不可改成失败回滚；COMMITTED即使关闭/输出失败仍保留activationId。

错误消息只使用封闭代码，不带SQL/文件内容/凭据或raw stderr；复用原错误类别与映射，未知异常用ANALYSIS_FAILED。不自动调用inspectMixedAnalysisOutcome：它仍是另有显式预算的fresh只读恢复，不能重置本操作账本后偷偷重开DB。保留原Store提交/回滚/cleanup算法。

## 7. 全链资源资格：明确尚缺的证据

完整生产路径必须在任何Source/DB/binary/child副作用前通过trusted资格，旧SYNTAX_OBSERVATION用途不足。现有空catalog拒绝保持；本包不新增公开混合入口、完整profile matcher或正向catalog条目。

| 范围 | 准入前必须具备 | 当前缺口 |
| --- | --- | --- |
| HOST/SQLite/规范化/Store/关闭 | 准确代码/依赖/corpus/config/env、HOST测量、SQL逻辑与实际物理费用边界、失败/取消生命周期 | A4/A5只给逻辑与组件证据 |
| Java v2与v5子进程 | 真实binary/build/args/env、进程身份、输入前采集准备、峰值与最终关闭 | v5有私有hook；v2当前普通client没有完整采集衔接，不能由double代替 |
| Git子进程 | 每个实际短命进程可核对的身份/生命周期/峰值或受审查的等价证据 | 事后attach可能错过；C2 helper不证明Git，原slots不可复用 |
| collector及并存范围 | collector/HOST成本、各进程reservation的真实并存关系、失败结算 | 尚无获批的完整采集实现 |
| 校准/holdout/候选profile | 精确运行清单、独立oracle、准确次数/资源/ownership、测后数值审查 | 当前NOT_READY；禁止占位SHA或未知值预批 |

不推荐在这里新增debugger/broker/addon或改用commit bytes替代RSS。先把固定代码路径收敛，随后为上述真实缺口形成具体采集方案和一次运行清单。任何进程未观测=UNKNOWN/不合格，不能记0、取成功样本或重试到“刚好采到”。不得把节点逻辑费用、Node helper峰值、旧Java四用途profile拼成全链资格。

物理用途schema、进程归因方法及新实现带来的费用需要Fixture/Evaluation/实际证据；本节给出审查义务，不把未知算法或数值写成已接受实施依据。完整运行包因此仍NOT_READY。可在其准备期间顺序推进已成熟的B/C独立设计，不强迫用无界重试解锁A。

## 8. Fixture/验收与治理

沿用p1-mixed-runtime-readiness-v1新增mixed-execution语料，独立expected来自原empty/python/java/mixed composer参考、固定Source状态、原history/Store故障矩阵；新路由真值表由人工先冻结，不导入执行器自生成golden。

验证重点：FULL空/OTHER-only/Python/Java/mixed；INCREMENTAL unchanged NO_OP、删除/OTHER变化、Python局部/Java全组、full-required/其他provider拒绝；单一deadline/Source变化；malformed/晚到流；Source已提交后失败、Graph COMMIT未知、COMMITTED后关闭失败；NO_OP两次读集中间并发变化。无Native真实进程、collector、校准、新profile或云端。

任务对齐：
| 任务 | 契约/依据 | 完成判据 |
| --- | --- | --- |
| T1配置 | §3、EffectiveConfig/A4、原Native hard caps | 新显式来源、域不混用、旧配置兼容、无默认数值 |
| T2空FULL与两个Store/Stage私有视图 | §4/6、原empty Fixture/R011/settled-owner | 原Stage/Store算法保持，NO_OP不落历史、结算不假装fresh |
| T3固定执行链 | §5、A2–A4与原v2/v5 | 真实Node/SQLite+进程内double下的完整结果/失败身份，无caller raw或注入成功端口 |
| T4合并验收/文档 | AGENTS/IMPLEMENTATION_PROTOCOL收敛策略 | 范围匹配fresh证据、架构/注册/追踪同步、保留原失败 |

本包退出A5_FIXED_EXECUTION_LOCAL_EXIT；不关闭P1-04/05、C1或Phase1，父任务4/21保持。

作者设计审查：采用显式操作和Stage内NO_OP，避免新capture-credit机制；仅新增必要配置解析/固定调用者和两个窄视图，复用empty Fixture，无新依赖/数值或未批准进程。完整生产资格不是本包完成条件，也不能因而被标PASS。新增provider配置、NO_OP私有视图、空FULL构造及结算/执行结果契约需一次集中批准；批准时同步ADR-020、Runtime/Provider/Stage/Store附约、验收/trace，旧v3/Canonical不变量不变。

本轮只有设计/源码核验：[证据索引](../../../.superpowers/sdd/2026-10-29-phase1-mixed-execution-design/results.json)。没有修改产品/Fixture、运行回归、Native/Git/helper/CI或Git写入。
