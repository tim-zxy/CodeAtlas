## B1–B2本地实施与批次审查结果 — 2026-11-03

用户已明确批准完整离线包。六项family、八个原Source pin的私有数据/helper与四处R5有限范围已实施，旧/无context循环保持；多文件直接按当前summaries总长度限制，包含两个base文件，retained不再进入R5下降搜索，remove只枚举固定pair，upsert范围耗尽拒绝检查放在原DB关闭/只读重开后，未跳过settlement。所有原实际Native/Source/相邻拒绝/Store/重开断言保持。

TDD纯scope两项0/2 RED（缺模块），最终scope/旧context/版本隔离4/4 PASS、0fail/skip/todo/cancel、268.1634ms；六JS语法通过，具名格式通过。没有运行真实边界入口、Native/Rust/helper/DB或构建；四个真实分支的当前producer行为仍由下一真实资格批次证明，纯scope测试不代替。没有新Fixture ID/注册、产品模块/迁移/数值/依赖或公开入口。准确日志及SHA归原B results.nativeCiQualificationPreparation。

作者已沿实际调用链复核批次上界：八类边界1848 Native；其他14类DESCRIBE+FULL28；13个成功类独立target FULL26；cancel reference2；九轮replay（functional2＋qualification1＋calibration5＋holdout1）每轮最多18 Native，共162；合计最多2066。每轮包含token-race竞争Native1、main正常Native17，四种fault用Node，SQL-preflight不spawn；重开retry只read/prepare，不再次Apply/Native。9×22=198 replay Node、2 reference Node，其他三个用途worker252，固定FULL child84、fault child36，加八个顶层Node命令，总计580。编译仅允许未来一次cargo build及一次rustc描述，其编译器/linker子进程不伪称固定测量进程数。最大数量是原case内全部调用的保守上界，不是新增重试额度。

完整argv/cwd、逐文件SHA、Node/Rust shim、52项Native source、未存在的新输出、原scope和停止规则写入原B integration-preparation/r5-run-manifest-preparation.json，状态REVIEW_READY_EXECUTION_NOT_AUTHORIZED。一次D prepare已含22qualification/110calibration/22holdout，不另重复；全四用途320校准、64独立holdout保持。按同一清单顺序执行，命令失败后不启动后续命令、不重新编译重跑；原命令内部有限case失败保留其结果，允许其既定循环自然结算，不通过再次运行选择峰值。

未来Native binary SHA仅可来自明确批准的那次构建及原build receipt，首次Native前核对源码/工具/当前Node编译身份；不把前轮意外构建用于资格。配对与verify manifest按既有严格schema由当前raw和SHA构成，当前无匹配floor则priorApprovals=[]，不拿旧profile授予新身份。candidate先冻结再holdout，任何失败/漂移保持HOLD。profile具体数值、安装、admitted actual、Release/CI/Git仍未授权；没有下载或重复完整普通回归。


# Bounded R5 Native Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans，本会话顺序实施，不新增代理/会话/工作树。

**Goal:** 以有历史Source依据的有限范围替代R5准备阶段无界发现，形成准确真实运行清单。

**Architecture:** 一个私有scope数据/helper供四个原boundary准备函数使用，原Native/Store/next断言保持；只改变R5失败停止范围。

**Tech Stack:** 既有Node标准库和脚本测试；无新依赖。

**Spec:** ../specs/2026-11-03-phase1-bounded-native-preparation-design.md

状态B1_B2_LOCAL_EXIT；离线实现已明确批准并完成，真实运行未授权。

## Global Constraints

- 仅固定R5分支生效，旧根/无context行为不变。
- 数量严格来自设计八项历史Source pin，不作为当前资格/threshold。
- 不启动Native/Rust/helper/DB、构建、下载、测量、CI或Git写入，不创建R5。
- 原B results.json.nativeCiQualificationPreparation为唯一结果入口。

## Review Focus

- complete/overlay的两个原base文件必须计入总文件数。
- R5未在有限范围产生正确next时失败，不扩大搜索或返回最后accepted假成功。
- retained先一次固定pair，不能掉回旧下降/增长路径。
- 旧context仍走原规则，新scope不是任何环境的resource admission。
- 任何负向验证先证明纯范围，不直接调用会构建/创建根的CLI。

## Task B1：有限范围、原分支及最小验证

**Create:** packages/runtime/test/helpers/native-refresh-r5-preparation-scope.json、native-refresh-r5-preparation-scope.mjs。
**Modify:** 同目录native-refresh-source-input-boundary.mjs、native-refresh-retained-sites-boundary.mjs、native-refresh-dense-remove-boundary.mjs、native-refresh-dense-upsert-boundary.mjs。
**Test:** scripts/test-native-refresh-ci-layout.mjs现有入口，追加纯范围suite，不新建root或全局计数。
**Interface:** r5PreparationScope(family,dContext)返回null或只读{accepted,next}；family精确对应Source族：source-empty-input-boundary、source-shared-owners-boundary、source-complete-coverage-boundary、source-field-sites-boundary、source-dense-remove-boundary、source-dense-upsert-boundary。

- [x] 先在旧入口写独立scope/有限迭代断言；RED只用纯函数导入/值，禁止执行实际prepare或四个真实边界入口。
- [x] 写私有scope数据/helper；数字与八个原pin逐项核对，重复family只允许相同数量，不提供可变callback/通用配置。
- [x] 四个边界在原责任点接入scope：多文件原for只增加有限结束条件；retained单次pair分支；remove只替换R5 counts；upsert原for增加终点。原出界/summary/source/相邻next及Store/关闭断言保持。
- [x] 定向新suite与必要旧版隔离GREEN；纯范围测试验证枚举终止和family映射，不能替代真实Native行为。四helper语法、具名格式和作者差异审查；不扩测原A/B、全root或实际Native。
- [x] 同步ADR-019、scalability、Evaluation、PHASE_ACCEPTANCE、DESIGN_TRACEABILITY、CURRENT_STATUS；scope冻结归原B索引，记录首轮失败和局限。

## Task B2：完整真实批次表（依赖B1）

**Modify:** 原docs/superpowers/plans/2026-11-03-phase1-native-ci-qualification.md的批次附表，原B r5-run-manifest-preparation.json。
**Consumes:** B1实际范围和旧prepare/functional/worker/candidate/holdout调用路径。
**Produces:** 可审查的准确运行包或明确剩余缺项，不启动其中任何命令。

- [x] 用B1实际调用链独立复核八类最多1848个Native启动，逐项列seed/单文件/最终fixture；追加普通类、target FULL、cancel reference和functional/测量嵌套启动，不把case数当进程数。
- [x] 固定完整命令/次数/env边界/新建输出/清理/失败停止、源码和工具身份；现有incidental build不得算资格，不在未运行时填新二进制SHA。
- [x] 全部case与质量门禁、320校准/64独立holdout一一映射；D prepare已包含自己的qualification/calibration/holdout，不额外重复它们。
- [x] 集中作者审查范围、数字来源、旧资格隔离和运行副作用。准备完整时一次提交真实批次审批；未完整则报告准确缺口，不推新profile数字/云端或自动试跑。

## 自审

本包没有引入产品新数值；只用已SHA验证的相邻历史Source数量约束一次实验，真实新边界不能证明就失败。新数据和helper是四处重复准备的唯一责任点；没有通用budget框架、额外collector或预测wire。真实执行与具体profile数值仍分别需要准确证据，批内不逐微步骤审批。
