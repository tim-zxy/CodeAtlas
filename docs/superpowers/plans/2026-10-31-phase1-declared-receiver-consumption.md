# 声明接收者消费修订 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans，当前会话顺序实施。用户禁止自行新增代理/工作树/Git 写入；不采用技能默认提交建议。

**Goal:** 正确消费同 site 的显式类型声明/初始化及实证中的简单泛型名义类型，同时保留所有未知/冲突与发布边界。

**Architecture:** 只在现有 bindDeclaredReceiver 中识别声明初始化对与受限类型文本；原索引和 importProof 的通用语义保持。原 reader/normalizer/history/Store 均不变。

**Tech Stack:** 现有 TypeScript、Node test、IR/Plugins 和已安装工具，无新依赖。

**Spec:** [准确消费合同](../specs/2026-10-31-phase1-declared-receiver-consumption-design.md)。状态 PROPOSED / NOT_EXECUTED，须一次整包批准。

## Global Constraints

无 Rust/Native/Source 重新采集/helper/collector/模型/DB、协议/IR/SQL/数值/profile/依赖变化、CI/Git 写入、新代理。原 B 账本复用；保留全部旧失败、Source 和向量。真实 Kafka PARTIAL 必须继续拒绝。

## Review Focus

- 初始化与后续写入混淆：额外 WRITE/不同位置不折叠。
- 同名字跨作用域混淆：完整 owner/scope/range/Source 身份不同时拒绝。
- 泛型文本不完整或越界：不直接按第一个 < 截断，不接收未支持语法。
- 原 import/callee/scope 拒绝被绕过：沿原 gate，保留原反例。
- 缺失初始化 support：成功必须带 typed+write，不改变 UNKNOWN；PARTIAL 不发布。

## 文件范围

- Modify: packages/plugins/src/framework-bindings.ts，唯一产品文件；优先局部私有函数，不导出新接口。
- Modify: fixtures/phase1/plugin-context/binding-extraction/inputs.json、expected.json，独立作者预期，只追加本包向量。
- Modify only if needed: packages/plugins/test/helpers/framework-binding-fixture.mjs，使输入能表达两记录的完整 ref/range 差异；保留旧生成行为。
- Modify only if needed: packages/plugins/test/framework-bindings.test.mjs，复用现有数据驱动入口，不新建根脚本。
- Docs: 批准后同步本设计/计划、PLUGIN_SPI 的受影响语义、CURRENT_STATUS、DESIGN_TRACEABILITY 和原 B progress/results；保留旧历史。验收父项/WBS 不擅自签收。

## T1 — 同 site 声明/初始化消费（随后直接执行 T2/T3）

Consumes: createFrameworkBindingIndex(context)、bindDeclaredReceiver(index, site)。Produces: 原 BindingProof；成功 support 增加对应 assignment；不改签名。

- [x] 独立追加同 site 正例及错 range/owner/scope/control、额外 WRITE、其他 definition 的拒绝向量，先冻结新向量，不由产品输出生成 expected。
- [x] 执行原 framework-bindings.test.mjs，确认新正例因现有 definitions.length 拒绝而 RED；测试准备错误先定位，不改 expected 迎合输出。
- [x] 在接收者消费责任点实现设计 §1。索引保留全部 definitions，safeChain 和原拒绝路径不变。
- [x] 定向复验绑定向量；保存首轮失败与修复，不新建全套防御矩阵。

## T2 — 简单泛型名义类型消费

Consumes: 经 T1 证明的 TYPED Syntax 原文。Produces: 仅供原 importProof 使用的 QualifiedName 或 UNPROVEN；不修改 Syntax 值。

- [x] 独立追加泛型/全限定正例和空/未闭合/嵌套/wildcard/数组/var/annotation 反例，确认正例 RED。
- [x] 使用现有 identifier 规则完成设计 §2 的有限语法检查；只在 Java typed receiver 路径使用。
- [x] 原 JAVA_TYPE/import precision/遮蔽/静态导入和 PARTIAL 反例继续通过。T1 support 保持。

## T3 — 一次集中受影响验证与作者审查

- [x] Plugins 构建：pnpm --filter @codeatlas/plugins build；若依赖产物身份未变则复用，不全仓构建/安装。
- [x] Node 顺序执行下列已注册测试文件：framework-bindings.test.mjs、framework-extraction.test.mjs、framework-runtime-candidate.test.mjs、framework-entry-candidate.test.mjs（均位于 packages/plugins/test/）。实施前核对实际文件名；若入口不符，只修正命令指向现有责任测试，不扩为全仓回归。
- [x] node scripts/check-architecture.mjs；仅改动文件 prettier --check。没有 manifest/注册变化，不为状态机械重跑全注册计数。
- [x] 核对旧向量/Source/raw/锁文件不变；记录准确命令和本批结果于原 B 单一 results/progress，禁止累加历史重叠 PASS。
- [x] 作者审查正反例与支持闭包、未知保持、无旧语义回归，更新受影响权威文档。不得宣称独立评审。

## 完成条件与复用

T1/T2 由独立向量证明并维持原接口，T3 所有适用门禁通过。若发现需修改 scope、IR、producer 或 coverage，暂停相关修改进入治理，不按范围内修复扩大。绑定支持与原 PARTIAL 拒绝是必须门禁，不以缩减验证为由删除。

旧 B5 52 项与 Source run01 按原输入/产物身份只作为适用背景，本批不重新执行、不冒称本批新 PASS。无实际 Source 发布资格；原 Source/Spring 失败、原 E03..E06/critical/performance/A6 等保持 OPEN。批准后连续完成 T1–T3，原范围必要修复统一处理，不逐任务确认。

## 已批准实施结果 — 2026-10-31

T1/T2/T3 complete（Node 消费组件范围），准确红绿、治理裁定、作者审查和单一账本见[实施审查](../reviews/2026-10-31-phase1-declared-receiver-consumption-review.md)。最终163/163，不与历史累加；Plugins等价直接tsc构建/架构17/范围格式exit0。旧generic-type仅一项预期随获准规则更新，原件封存；Python新反例元数据准备错误修正，失败日志保留。原helper/test/lock与43项Source/Rust/raw摘要匹配。无独立评审、新运行或父项签收。
