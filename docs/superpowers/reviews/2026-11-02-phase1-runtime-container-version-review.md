# Runtime 容器版本作者评审

APPROVED，已按用户确认实施最小修订；非独立评审。

结论：原 A/B §7.1 的 SQL schema_version=2 与 R012 CHECK=1/禁止改迁移相冲突，必须治理。推荐只在 JSON 内增加 formatVersion2，可保留原一次事务、外壳、旧行与checksum；必须精确区分无版本旧格式/显式新格式，未知格式拒绝，不能按有无 derivation 猜格式或降级。

实测原异常见唯一 B 证据 ab-local-closure/store2-diagnostic.log。原失败保留，当前新联合测试为未通过/HOLD，不因其他组件绿色签收。作者核对 R012 原SQL，不修改 CHECK、不建立迁移/备份系统，不接触用户数据库。

批准后沿原 U0–U7 一次继续，不新增微步骤审批。详见 ../specs/2026-11-02-phase1-runtime-container-version-proposal.md。

2026-11-02用户批准Runtime容器最小修订：SQL schema_version=1，严格JSON {formatVersion:2,identity,candidate}；旧{identity,candidate}及迁移/checksum保持，未知格式/混格式拒绝。真实owned SQLite联合Code/Syntax/Runtime、准确membership/activation、旧入口拒绝、只读重开及坏格式拒绝1/1通过，见ab-local-closure/store2-approved-green-02.log。首次负向UPDATE被原R012_IMMUTABLE拒绝，已改为仅disposable Fixture新增坏子行，未禁用触发器或修改迁移；该失败保留store2-approved-green.log。原SQL版本冲突HOLD由本批准及新证据限定解除；原失败记录不删除。原U0–U7继续，完整factory/SPI、Application/Runtime与跨仓、U6/U7仍待，无新Native/CI/Git。
