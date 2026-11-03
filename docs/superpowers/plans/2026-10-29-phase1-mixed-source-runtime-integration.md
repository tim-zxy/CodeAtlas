## 用户已批准整包实施 — 2026-10-29

本次明确批准A2及S1–S4顺序实施与原范围统一修复；状态ACCEPTED_FOR_LOCAL_IMPLEMENTATION。下方REVIEW_READY/NOT_STARTED保留为批准前快照，不代表实现或测试已完成。

# Phase1 A2：混合 Source 与前置账本合并实施包

2026-10-29。**REVIEW_READY / NOT_STARTED**。设计：[A2附约](../specs/2026-10-29-phase1-mixed-source-runtime-integration.md)。本计划与附约一次确认；获批后本会话顺序实施，遵循收敛执行策略，无逐任务审批/新代理/工作树/提交。

目标：从拥有文件产生混合Source、经原CAS应用并完整重查选择范围，将文件/元数据前缀续接到现有Stage/Store。本包不是实际Native或全流程资源资格。

## 文件与任务依赖

S1独立Fixture → S2共享Source路径 → S3前置账本/Stage → S4Application/Runtime准备与整合。S2与S3逻辑可独立，仍顺序执行。只有以下产品文件在范围，编译dist为派生产物：

| 部分 | 新增 | 修改/复用 |
| --- | --- | --- |
| Source | packages/source/src/mixed-source-workflow.ts | classify.ts、fingerprint.ts、scan.ts、walk.ts、git.ts；path-policy/path-safety复用，不另写规则 |
| Storage | packages/storage/src/analysis/mixed-source-account.ts | mixed-analysis-stage.ts；复用activation-history-format.ts的预算内核，不改SQL/Store算法 |
| Application | packages/application/src/mixed-source-workflow.ts | 复用operation-policy.ts、reconcile-worktree.ts与SourceStatePort，不改旧index命令或公开index |
| Runtime | packages/runtime/src/mixed-source-preparation.ts | 复用现有配置类型，原生产分发/catalog不变 |

新增测试文件：packages/source/test/mixed-source-workflow.test.mjs、packages/application/test/mixed-source-workflow.test.mjs、packages/runtime/test/mixed-source-preparation.test.mjs；Storage追加mixed-source-accounting.test.mjs定向案例。scripts/test-mixed-runtime-readiness.mjs追加上述新文件各一次，根package.json已有入口不改。

Fixture新增文件仅位于fixtures/phase1/mixed-runtime-readiness/source-integration/（source、cases.json、expected.json、README.md），沿已有Manifest语义；先列实际文件并冻结，不承诺人为案例数。原11个literal/README文件不改；既有fixture.json仅追加两个新路径引用，旧Manifest保存原字节并分别记录新旧摘要，无新ID/结构计数维护。

## S1 独立期望与红灯

- [ ] 从设计§5列行为族；literal期望来自原Source策略、明确.py新模式及手算费用，不由新实现生成expected。保存新增文件摘要和准确预期出处。
- [ ] 新测试用拥有文件/SQLite及固定Git替身，不启动实际Git或Native。先观察缺API RED，再观察关键可调用行为RED，错误来源分开记录。
- [ ] 复用已有Fixture ID与root，不为本包改八个全局计数守卫。

## S2 Source共享核心与全集重查

- [ ] 先实现固定混合分类适配，旧分类/指纹默认与接口不变；证明.py新旧差异及原Java/OTHER/Unicode/二进制行为。
- [ ] 共享scan/walk/git核心支持新account路径：流式目录枚举、前后身份核验、原路径策略、逐项/读前收费与取消；Git固定参数、限额及失败close。禁止另造通用扫描框架。
- [ ] 初次观察一次安全读取完成分类与指纹；重查比较全部选择集、元数据及内容，不只看SQLite里已有文件，不把逻辑移除当物理删除。
- [ ] Source构建后只跑新Source文件；原Git真实扫描测试本包不运行，旧行为控制在新文件中直接复用pure接口和旧literal。

## S3 同对象预算接管

- [ ] 提取现有Source account实现到指定Storage内部文件。begin创建真实HistoryReadBudget，保持控制状态及累计文件字节；不接受caller统计或资格字符串。
- [ ] Stage可选预算参数省略时原路径/费用不变；传入时在首次capture/SQL前按剩余量准入，原setup/cleanup credit继续保留。
- [ ] 证明Source前置非零用量、两次重查、较紧限额、失败前缀及Stage→Store导入连续；先借account在Stage接管后也遵守失效/消费生命周期。
- [ ] Storage构建并运行新定向案例；Stage constructor/acquire被修改，因此在批次最终执行旧Stage root一次。Store算法/SQL未变，不重跑旧19崩溃点或全Store回归。

## S4 授权、CAS与准备整合

- [ ] Application经已有INDEX/READ_SOURCE授权后读取，使用原CAS写Source；冲突拒绝，不手改DB。Source已更新而分析失败保持last-good/stale，错误不伪称整段回滚。
- [ ] Runtime私有准备负责创建并转交同一budget/account与真实目标；不在runIndexCommand公开新路由，不接caller qualificationRef。
- [ ] 拥有SQLite验证观察→Source CAS→capture→Stage→重查→Store及关键失败；Native原始流使用已有独立Fixture，仅证明本地组合。
- [ ] 同步受影响权威和trace，只记录变更契约及本次证据；一份结果索引链接原日志，作者审查内联本计划，不再新增评审包/全仓封存。

## 批次最小命令清单

执行前固定准确参数与日志；无实际Git/Native/helper。不运行pnpm完整verify/root。

- 顺序构建：node node_modules/typescript/bin/tsc -p packages/{source,storage,application,runtime}/tsconfig.json，分别四条命令。
- 开发定向：node --test --test-concurrency=1 对应新文件；Storage仅按AR/S3新增测试名筛选。批次结束统一root一次，避免每个修复重跑整批。
- 最终组合：node --test --test-concurrency=1 scripts/test-mixed-runtime-readiness.mjs packages/runtime/test/native-syntax-admission.test.mjs。
- 旧受影响Stage：node --test --test-concurrency=1 scripts/test-mixed-analysis-stage.mjs，一次。
- node scripts/check-architecture.mjs；IR schema不变则复用原IR类型结果，不机械重跑。
- Manifest仅增加路径映射，运行packages/evaluation/test/fixture-manifest.test.mjs和fixture-registry.test.mjs一次；八个历史功能守卫的全局计数未变，复用相关原结果，不重跑整套registry360。核对原11个文件字节、旧Manifest原件、ID唯一及root新增导入一次。
- Prettier只检查实际修改文件；无Rust产品变更，复用本轮protocol18及库29，不再编译Rust。

## 完成条件与保留边界

Source全成员选择/重查、授权与CAS失败、前缀账本和移交后失效由对应测试证明；旧Java公开行为/架构/必需Stage门禁保持，相关Fixture及追踪同步后才能签收本包。记录实际pass/fail/TODO，不预设通过数。

本包允许本地文件/SQLite及固定进程替身；不包含实际Git/Native、collector、校准/目的schema/profile值、新数值/依赖、云端CI/Git写入、旧证据清理或代理。真实运行审查包必须在此实现稳定后给出完整身份/目的/采集/次数清单，不能用当前组件结果自动开放。P1-04/05和Phase1仍OPEN。

作者审查：接口生产/消费为Source account←Storage begin→Runtime持有→Stage接管，Source通过Application转接；初始Source CAS独立于Canonical分析事务；原public index/Source默认模式/catalog不变。新增预算接管与全集规则的批准在同一次决定，不拆方向、任务细化或S1..S4审批。

## 实施结果与作者审查（2026-10-29）

状态 **A2_LOCAL_SOURCE_PRELUDE_COMPONENT_EXIT**。S1–S4已在声明式本地组件范围完成；不是P1-04/05或Phase1整体退出。作者审查，无新增独立评审/代理。

| 任务 | 实现与可验证证据 |
| --- | --- |
| S1 | 独立source-integration共11个新增文件在产品前冻结；复用原Fixture ID，Manifest仅增加两个路径引用，原11个literal/README保留、旧Manifest原字节保存 |
| S2 | 固定私有Java/Python观察、流式目录、原选择策略、全集/内容重查、Git有界取消收尾；最新Source22/22 |
| S3 | 原Source account提取共享，同一HistoryReadBudget在Stage前后累计，输入计数不重置，旧account跟随Stage失效；新增4项及旧16项在最终root通过 |
| S4 | 仓库级权限预检＋逐文件RAW授权、真实Source CAS与提交后stale错误、Runtime私有准备；原Python Source/oracle绑定的Source→capture→Stage→重查→Store局部正向通过 |

准确命令/日志/退出码统一在[results.json](../../../.superpowers/sdd/2026-10-29-phase1-mixed-source-runtime-integration/results.json)。最终四包构建exit0；组件root加原准入107项，106 PASS/1原有TODO；受影响Stage333/333；Manifest/registry35/35；architecture17；16文件范围格式通过。未累计重叠用例。移除一条未用import后只重建Source并复验22项，未重复Stage/整批。

### 作者发现与处理

- Source将目录Git剪枝用于文件，破坏include-over-ignore：原业务RED复现，在共享遍历入口分离目录下降与文件选择，原期望不改。
- 新测试计费recipe遗漏visitItem：修正测试步骤，保留失败，内核/expected不改。Fixture关闭顺序导致SQLite EBUSY：由拥有目录的测试清理先关闭DB，无产品重试/删库绕过。
- 原OperationPolicy要求RAW具有真实path：保留原规则，仓库级DERIVED预检后每文件RAW检查；新增拒绝控制证明打开内容前授权。未用占位路径授权整仓。
- 新Git stdout错误缺监听、默认排除junction误拒绝：可调用RED保留，修正受控分支管道所有权及先按既有路径/Git策略决定选择，再拒绝所选链接。补丁误落旧分支由TS2304构建发现，已限定回新分支后验证。
- 旧公开index、依赖/锁定、IR/迁移/SQL/生产catalog、DESCRIBE和旧Fixture expected不改；没有削弱Quality Gate。Fixture复用保持registry62、Phase1 36，该ID一次；未改八个历史计数脚本。
- 原Store算法未改，复用其既有范围证据，以本次Stage333和新增真实Store应用控制覆盖预算接管；IR类型/纯IPC/raw/Rust在相关实现未变的范围复用。未重跑旧19崩溃点、完整verify或全仓封存。

### 限制与下一批

所有Git行为测试均为进程内固定替身；Native输出来自已有独立Source/oracle，身份/owner/checksum仅按拥有Source重新绑定。这证明局部契约、Source CAS、累计费用和Store效果，不证明真实Git/Native抽取、进程归因、RSS或生产可用性。

Runtime私有准备消费固定内部调用者提供的limits/control，不重新解析YAML，也不据此认证参数为生产准入。未来实际索引路由须从EffectiveConfig唯一派生、核对注册根及完整操作资格后再调用；本包没有改公开index分发。SourceState SQL仍由原INDEX读取/CAS控制，本包不冒称已统一整个流程所有SQL/实际内存计费。

C1真实文件symlink EPERM仍TODO；目录junction等通过不替代它。历史链接/Native超时根因UNKNOWN，C2 spent、main取消结算未查、R4 mutable限制保留。完整混合Runtime路由、准确资源目的/component schema、collector与实际一次性运行清单仍需集中设计；profile数值须实测后审批。无实际Git/Native/collector、新数值/依赖、云端CI/Git写入。主任务仍4/21接受、17未关闭。

下一步一次准备完整混合Runtime与实际资格包；不再拆方向/细化审批，不为此另起测试体系重构。
