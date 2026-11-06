# P1-19 private read-only installation admission inspection

Authority: existing P1-19 inspectInstallCapabilities/doctor/status reporting-only;
reuse existing metadata/full/verification/transport admission exactly. This is a
private diagnostic component, not finished packaging/CLI/platform qualification.

Input: one explicit positive safe integer memoryBudgetBytes, no numeric default,
profile override, executable path, workspace or permission flags. Strict plain data
only; reject invalid input before reading installed module metadata.

Result: immutable actual environment identity and each existing class's gate result.
Use safe fixed codes for refusal vs inspection failure, no raw filesystem messages.
No binary probe/execution authority; report explicitly leaves binary compatibility,
protocol, full install and query availability unverified. No spawn/write/network/
project Source/DB/model access. Do not claim a profile match authorizes a later run.
Environment must match before/after all checks; drift refuses a coherent report.

- [x] RED: missing API, invalid input before environment reads, actual gate parity,
  no process launch/write and metadata failure sanitization.
- [x] Implement the private inspector by reusing existing gates, without profile/
  numeric/formula/schema/permission/dependency/CLI/root-export changes.
- [x] Runtime build, affected diagnostics/admission-compatible checks, architecture,
  concentrated read-only review, evidence/current status and one batched sync.

Real R9 and parser/capture decisions remain unapproved. Existing prefreeze is not
modified; changed Runtime dist requires a fresh approved future execution freeze.
