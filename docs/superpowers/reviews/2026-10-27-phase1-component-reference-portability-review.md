## 最终可复现检查点 — 2026-10-27

原目录 portable-reference-compressed-default-green **212/212**，0fail/cancel/skip/todo，51731.7341ms；不含六组旧私有输入的隔离复制目录 portable-reference-compressed-clean-green **212/212**，53385.7278ms，含19个真实Node退出。两环境串行，不能合计成424个独立测试。架构17项目通过；产品源码/编译产物未改，无需重复产品构建。

保留36份封存payload原字节：24份JSON使用标准库gzip传输，12份JSONL不变；加Source说明、provenance及固定测试loader共39个附加文件。loader只接受清单键，校验asset SHA、按原byteLength有界解压，再核对payload SHA与前序封存。数据源仍是产品前或已如实分类的独立参考，不从产品生成expected。没有修改.prettierignore或降低格式门禁。最初发现21份JSON排版冲突，因此采用此传输；旧原始输入完全保留。

首次压缩接入144PASS/68FAIL源于新Store测试辅助一处多行fs.readFileSync遗留，发生在产品执行前；仅改为受控loader并UTF8解码后上述两批转绿。缺资产RED、缺loader RED、Windows路径失败及全部中间结果保留，未重写为通过。下方38文件/211测试是中间步骤快照，以本最终记录为准。

[109项原验收映射](2026-10-27-phase1-stage-store-acceptance-map.json)保持Stage66/Store43全部签收OPEN，逐项关联原input/expected/base摘要及相关组件证据；未执行原case不能签收。材料可携带性缺口已补齐，独立整操作预算、完整原Fixture、较宽旧快照恢复及G退出仍待。既有D..G继续有效，下一步无需再拆小包审批。

# Phase1 组件参考材料可携带性与验收缺口 — 2026-10-27

原D..G范围内的测试材料整理；无产品、数据库schema、契约、依赖或数值变更。作者局部评审，不是整分支/阶段验收。

## 已完成的材料转移

从上轮8798 hash封存中逐项核对并原字节复制36份JSON/JSONL，新增Source说明与逐文件来源/hash清单，共38个附加文件，位于[原Stage Fixture根的组件参考目录](../../../fixtures/phase1/mixed-analysis-stage/component-references/README.md)。六个测试消费者只更换数据前缀，不从新产品生成expected；early Java v2的上下文调整发生在初始可调用校验器之后，清单明确注明，不能称整个文件pre-product。原2241 Fixture字节、原cases/expected、历史失败/根和私有输入全部保留。新增材料不新增Fixture ID或数值门槛，registry仍61/exactPhase1 35/catalog0。

受影响四组测试先211/211通过。另建无Git/无私有证据的隔离复制目录，仅携带现有编译产物、库内Fixture、测试和既有Zod字节，不安装依赖、不建立工作树。首次复跑105通过/106失败：嵌套路径244字符，临时目录名达到266，Windows mkdtemp在SQLite构造前ENOENT。首次完整日志保留。原生长路径前缀可建目录，但当前Node SQLite以EISDIR拒绝；不改产品/宿主设置。

测试runner和Node worker现共享一个很小的测试根定位函数：普通目录使用原固定计划isolated-tests；在其内部做数据复制复现时复用这个已核验外层根。没有任意root参数/env开关，realpath/target包含检查继续成立，数据库仍在原批准范围。其后无私有输入的复制目录四组211/211通过，含19个真实Node退出；运行前后六组私有输入目录均不存在。仅输出/临时目录由库内runner创建，无读取旧W数据。这证明本组件集合的输入可携带，不是干净Git构建或云端CI通过证明。脚本入口为[scripts/run-mixed-analysis-local-tests.mjs](../../../scripts/run-mixed-analysis-local-tests.mjs)，必须使用新证据label避免覆盖。

## 逐项验收差距

[Stage66/Store43完整映射](2026-10-27-phase1-stage-store-acceptance-map.json)逐项记录109个原case的input/expected/base SHA-256、相邻组件证据和未满足条件。全部原Fixture签收仍OPEN；这与已有Stage37/Store69组件实现证据不冲突，不把相关组件测试自动记作原case已执行。

重点剩余：独立整操作预算/精确边界；真正到达的完整状态矩阵；完整delta、竞争、同ID冲突、coverage multiplicity/census、有效R010派生状态清理、legacy组合；较宽旧/orphan原始快照恢复。共享literal base与真实raw/owner/来源之间的兼容须明确核验，不能以替换为另一组上下文或伪造state来签收原case。下步按映射完成这些门禁；没有新增待批准的小步骤。

D/E/F IN_PROGRESS、G OPEN，B1b/P1-04/05/Phase1未完成。原609/609是上轮15文件结果，本轮211为受影响四文件；重复环境不合计为422个独立测试。最新精确结果、原文后缀和完整新seal另由本包portability checkpoint记录。

无Native、校准、profile、依赖安装、云端CI、Git写入或用户库操作。历史timeout仍UNKNOWN，C1/C2/R4及其他既有风险均保留。
