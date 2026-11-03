# 按需scope求值 — 实施结果与作者审查

2026-11-02；SCOPE_DEMAND_LOCAL_EXIT / SPRING_PARTIAL。用户明确批准精确DCP与T1–T3。当前包完成的是有界遍历改进，不是四框架或Phase1验收。

## 结果

Spring原request/Source/所有cap不变。RED重现tick_binding next1001>maxItems1000拒绝；改动后同cap得到OBSERVATION_COMPLETED，syntaxOutcome=PARTIAL，29条Syntax观察，32651字节raw。新raw SHA=126f799b5f1d4b64fb304ab013fd2e69daaee1bc4149ef1a3c4f06909818cfd5。覆盖仍有INCOMPLETE_BINDING_ENUMERATION，scope保留BASE_SYNTAX_PARTIAL/FILE_BINDING_PARTIAL，基础PARTIAL具体来源本批未定位，不能称为完整解析或框架发布ready。

17个既有Source的request与raw逐字节等于原library-output/r5；全部事实/身份/控制/覆盖/支持未变。现有严格wire7 reader接受这17份与新Spring共18份。原r5与Spring历史失败均未覆盖。

## 唯一产品改动

只修改crates/native-analyzer/src/binding_sufficiency.rs。augment第二轮先保持block/unsupported限制并复用原effect match，复用原TYPE kind判定和import条件；没有TYPE/import/effect消费者时不求scope，其余分支仍用同一scope/control/tick函数。既有第一次AST walk、旧观察重写、最终scope父链、coverage/records/保留字节与全部真实访问计费保持。

没有缓存、新状态/依赖、wire/IR/history/SQL、profile/数值或scope/UNKNOWN意义变更；普通构造原限制仍保留。真实工作减少，所以既有maxItems下可完成观察；没有把执行过的访问抹为免费。work_items未在wire暴露，本批没有记录新Spring的最终work_items，不能造出精确节省次数或速度/RSS改善。

原预算测试保持if True: x=1 Source和maxItems10，out.observations补独立字面assignment（零基1:4..9），使旧观察核验真实消费control/scope；仍断言ResourceLimit。没有删除门禁、降低阈值或从产品生成expected。新Spring回归默认ignored，普通测试不会隐式启动新Source观察。

## 新鲜验证与准确证据

[唯一B索引](../../../.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/results.json)的scopeDemand指向scope-demand目录中的源码原件、57项执行前针对性身份、RED/GREEN命令/源码/程序集/原始流、replay-comparison与final-proof。

- RED：固定1.98.1 cargo test --locked --offline，精确binding_scope_demand_spring，1测试0pass/1fail，29filtered；失败是期望COMPLETED而实际资源FAILED。产品前缀在RED前未变。
- GREEN：同工具链/离线锁定，binding_sufficiency::tests:: filter加--include-ignored/--test-threads=1；4/4通过，0fail/ignored，26filtered。包含原17 Source oracle与两个预算控制以及新Spring；17不是额外17个Rust测试，不能累计成21项。
- 主运行共2次（RED、集中GREEN），条件纠错0次。未运行旧six-source入口、单独诊断入口、CLI/helper/collector/全库/Clippy/校准。链接器创建lib/exp的warning非致命，准确退出均保存。
- 单文件rustfmt --check exit0、架构17项目exit0。严格reader离线重放18/18，不是18次Native进程或Source重新采集。
- 56项非目标冻结输入、另5个Rust模块、4个Node绑定产品/向量、18份历史raw摘要匹配；GREEN源码冻结后不变。Node163/52等未重跑，不累计为本批新PASS。

T1第一次源码前缀核验使用CRLF-only分隔，遇LF原件时在Cargo启动前误报；统一换行匹配后证明前缀相同。是检查脚本准备修正，不是产品RED、不占Rust条件复验额度，记录保留在progress。

## 作者审查

逐项对照Review Focus：unsupported/block处理在continue前保留；effect match只移动不复制；每种有消费者路径仍检查scope/control；原type/import生成顺序和值保持；预算控制仍拒绝，旧17 raw字节一致是兼容实证。新Source不改为预期失败，也未提高cap，Spring完成但PARTIAL仍真实传递。未发现本批准范围内未解决的阻断实现缺陷。

本次为作者自审，依用户禁止新增代理不派发独立review，不宣称整分支merge-ready。FROZEN架构不变，实际访问计费合同不弱化；变动是已批准EVOLVABLE执行次序/实际工作量。

## 剩余统一契约与退出边界

新的Spring PARTIAL提供了此前资源拒绝遮挡的观察，但尚无当前完整Canonical/Plugin/Store生产发布证明。后续仍需普通new三处覆盖语义、Depends参数角色/provider、Mongo真实资源/结果/handler、Spring注入和现有DEPENDENCY/DATA_WATCH消费者、完整coverage义务及原E03..E06/critical baseline追踪。原A6/profile/真实进程资格、历史Native timeout UNKNOWN与main/R4等风险保持。

父项4/21已验收、17OPEN不变；不因本局部退出关闭P1-04..09或Phase1。当前Spring预算回归已通过，不改写旧run01失败/无guard的历史UNKNOWN；也不把它称为旧Native timeout修复。无用户DB、云端CI/Git写入、新数值/依赖或额外代理。
