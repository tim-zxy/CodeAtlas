## Q3实施出口补记 — 2026-11-04

用户已明确批准并完成单次固定R5 context续接：D22/22、0failure、exit0；原通用CLI缺context失败保留。Q3本地退出为已安装四用途值及27/15/22三组各自通过，准确审计见[最终作者结算](../reviews/2026-11-03-phase1-native-profile-installation-review.md)和原B q3-d-context-final-audit.json。下方尚未勾选的checklist、NOT_AUTHORIZED/RUNNING等是本次结算前的完整历史快照，未执行文字不再代表当前授权或结果。没有重复原观察/校准/holdout或新增产品改动；产品未变时复用原编译/定向10项/架构证据。原85Node批次和另获批准27Node续接分别记账，不隐藏原失败。后续pack/独立整分支评审/准确新提交/云端仍需遵守原边界；R5 post-trial不能视为pristine。全部原文不删改。

# R5 Numeric Profile Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans；本会话顺序执行，不新增代理/会话/工作树。

**Goal:** 安装明确批准的四用途预留，并用一次范围匹配的原准入流程验证当前构建。

**Architecture:** 仅更新原静态数据表，保留全部历史条目、原资源公式与严格读者。三个数据条目覆盖四用途，不增加配置、purpose或采集框架。

**Tech Stack:** 现有TypeScript编译器、Node标准库、原memory/refresh工具。

**Spec:** ../specs/2026-11-03-phase1-native-profile-numeric-review.md

状态：用户已批准并安装；一次27＋15通过，D入口拒绝，完整Q3未通过。详见[本批审查](../reviews/2026-11-03-phase1-native-profile-installation-review.md)。

## Global Constraints

- 值精确为226656256（READ_SEAL/FULL_TRANSPORT）、407248896（REFRESH_VERIFY）、399069184（REFRESH_TRANSPORT）bytes；仅审查文档规定的环境/身份。
- 无Git/cloud/Release、无重新校准、无新cargo/Native构建、无新依赖/阈值、无Syntax profile或全A6资格。
- Source/Native/独立目录/原始SHA不漂移；失败停、不重试，不手修pristine/ownership。

## Review Focus

- 四用途使用三个数据条目，不能混用raw/candidate/corpus SHA。
- Source数据携带保持原字节，D四个标量文件不冒称可独立重建整个物理Corpus。
- Runtime数据重建必须保持726ffb...及原独立目录（规定的三个profile-data排除之外）不变。
- 一字节不足、未知purpose/环境、错误scope仍拒绝；实际结果标签不可混为公开业务执行。
- 准入后D首次读取若拒绝当前R5状态就停止，不能用手动restore换取通过。

## Task Q3：数据、编译、最小追踪与一次真实准入验证

**Modify:** packages/runtime/src/native-metadata-profiles.ts（只新增三条冻结对象，保留所有旧条目）。
**Create:** fixtures/storage/native-analysis-state/phase1-r5/{paired,verification,transport}/下的既有格式证据文件；paired复制read-seal.json/full-transport.json/manifest.json/candidate.json/holdout.json，verification复制raw.json/manifest.json/candidate.json/holdout.json，transport复制raw.json/evidence-manifest.json/candidate.json/holdout.json。D完整原物继续在R5和原B证据根；不提交DB/binary或.superpowers。
**Test:** packages/runtime/test/native-r5-approved-profiles.test.mjs，一个窄provenance/用途与数值边界suite，由既有native-metadata-admission.test.mjs按R3/R4惯例导入（实码为显式root列表，没有glob），不改Fixture ID/根注册计数；复用native-metadata-admission.test.mjs的reviewed matching Runtime、one byte below reviewed reservation、reviewed full transport三个必要selectors，先核对其调用链无真实Native。
**Sync:** 当前两计划/审查、CURRENT_STATUS、DESIGN_AUTHORITY、DESIGN_TRACEABILITY、scalability、Evaluation、PHASE_ACCEPTANCE的有限适用状态。

- [x] 明确记录具体数值批准；先冻结13份证据原字节到上述可携带位置，不改原件。对应candidate/raw SHA从数据草案复制，不手填推测值。
- [x] 新provenance/原边界控制先在未安装条目时观察明确RED；只运行无额外子进程的选中组件控制，不运行全root或memory长测。
- [x] 按数据草案安装三个条目；原已有数据及Syntax空目录保持。使用既有node node_modules/typescript/lib/tsc.js -p packages/runtime/tsconfig.json一次编译，TS有缺陷则局部修复；不得隐式pnpm install。
- [x] 核对Node编译身份726ffb...及独立D目录在原规定排除外无变化；不通过保留旧map、扩大排除或重新记录旧hash绕过。执行新窄suite/三个原selectors及具名格式，保持预算等号/one-byte-below/原语料证据。
- [ ] 再冻结实际运行argv/数据条目/新输出与现有Native binary；用原collectNativeMemoryObservations的approved入口一次收集27类（含14个Node fixture child），每类只一次；使用现有runPinnedVerificationWorker(name,0,'actual')和validateVerificationObservation(...,'ACTUAL_PRIVATE_PORT')一次收集15类；用原scripts/native-refresh-transport-memory.mjs collect approved C:/CodeAtlas-P05-D5-R5/evidence/candidate.json <全新原B/r5-admitted-d>一次执行22类D。三组无新生成器，不加Worker/collector；校准和holdout不重复。
- [ ] 非测量owner仅编排/保存原stdout/stderr/退出/验证结果；27+15+22观察、D最多18 Native、合计最多85个上述Node。源码/工具/声明数据漂移、任何命令/验证失败立即保留并停止后继组，不重启或重做slot。未知当前R5/pristine拒绝即停。
- [ ] 集中作者审查与证据/追踪更新，标记当前四用途准入结果，不能写成Phase1、Syntax/A6或CI/merge通过。原失败/原R4/原main取消状态保持。

## 执行后出口

仅当准确数值被批准、数据编译与最小provenance/边界通过且一次准入验证全部满足，才记四用途本地安装/接受。随后准备本地pack与整分支评审/准确提交/发布及CI申请；没有云端授权时不写远端。未通过则记录具体失败，未执行组保持NOT_RUN，不要求重试到绿。

## D入口修正后的单次续接（已批准）

原CLI未传R5 context，已一次exit1，失败保留、不自动重试。产品/API/数值无须修改；原strict reader仍须证明R5当时pristine/ownership，不能手动恢复。建议一次批准以下准确续接，不重做27＋15或320＋64：

```js
const layout = await readRefreshCiPackLayout();
const context = refreshCiFixtureContext(layout);
const report = await runRefreshTransportCommand(
  ['collect', 'approved', 'C:/CodeAtlas-P05-D5-R5/evidence/candidate.json', NEW_OUTPUT],
  context,
);
```

复用scripts/helpers/native-refresh-ci-layout.mjs和packages/runtime/test/helpers/native-refresh-transport-replay.mjs现有导出；仅增加被忽略证据目录中的非测量driver，不新增产品hook/helper/collector。固定全新输出为原B integration-preparation/q3-d-context-continuation；运行前核对原Native/profile/candidate/工具/编译身份，任何guard失败即停。最多22个D观察、18 Native、27列明Node（22worker＋4fault child＋1driver），无新cargo构建/校准/依赖/数值、Git/云端。原R5不改ownership、seed或手动恢复，R4不触碰。用户已明确批准此单次续接，已启动；准确运行/退出以原B integration-preparation/q3-d-context-execution.json为准，不据批准或RUNNING认定通过。
