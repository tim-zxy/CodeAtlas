# 框架剩余证据准备 — 作者审查

2026-11-02；OFFLINE_PREPARATION_EXIT / CONTRACT_DESIGN_IN_PROGRESS。沿原已批准B范围继续独立Source/Fixture与设计准备，不申请或冒称新增producer/真实运行授权。

新增MongoWatchSource.java显式由MongoClient取得atlas数据库，再取得events集合，watch结果传入forEach callback，body声明handle(change)。Java只作为Source文本，未解析、编译、导入或执行，未联网/操作数据库。旧MongoSource的collection参数仍没有数据库/集合来源，保留为未知资源控制，不能借另一个read/write常量填充。

独立watch-obligations明确资源来源、结果关联、callback/handler和旧未知反例；不是产品生成的expected，也不是已批准critical分母/数值baseline。原p1-mongo-v1仅追加两个路径，旧manifest所有值与四个原文件字节不变，无新Fixture ID/注册计数或qualityGates修改。准确before/proof/commands在唯一B账本remaining-contract-preparation。

新鲜验证：两个JSON范围格式exit0；原fixture-manifest与fixture-registry两个测试文件35/35、0fail。这个结果只证明路径/发现/结构，不是Mongo语义或Source→Canonical验证；不与历史163/4等相加。没有修改产品，所以未全仓构建/架构/Native回归。

只读源码核验Spring基础PARTIAL：this.repository = repository的左值为field_access，Java producer assignment分支只接受identifier，否则置partial且不发记录。现有ASSIGNMENT/成员写索引能表示简单this.member，未来修订必须发真实写入以保留接收者替换控制，不可只删partial。尚未实际验证修改后的完整Source结果，不声称这是唯一PARTIAL来源或已经修复。

[统一契约草案](../specs/2026-11-02-phase1-framework-evidence-closure-design.md)已将成员写/普通构造/参数角色/结果与callback/资源/候选发布统一映射到原Fixture/Quality Gate。已有DEPENDENCY/DATA_WATCH Runtime IR优先复用。callback作用域、依赖目标绑定、完整site义务和新版本传播仍需精确化；不将未定项交给实施时猜测，不先占wire8/Syntax4，也不再为简单成员写单独拆微审批。

作者自审；未新增代理，不宣称独立评审或完整设计ready。生产Source/四框架/原E03..E06/critical/资源/Phase1门禁保持OPEN，父项4/21、17OPEN。原失败/EOL/Fixture/.superpowers保留；无Rust/CLI/helper/collector/模型/用户DB/CI/Git写入、新依赖或数值。
