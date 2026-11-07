# Long-path ACL compatibility offline implementation

Approved scope: reproduce only in new owned fixtures; preserve exact installed paths, original ACL subjects/critical rights/ancestor/link checks. No installed-tree retry, account Query, ACL/security mutation or network.

Root-cause evidence: .superpowers/acl-longpath-20261107-01/characterization-result.json. Windows PowerShell5.1 short94 cmdlet passes,266 file and270 directory fail GetAcl_PathNotFound; extended-prefix cmdlet reads the same descriptors as independent extended FileInfo/DirectoryInfo. No content or ACL changes used.

Success criteria:
- one fixed private ACL-read text used by production and reproducible deployment-check script generation;
- validate canonical absolute DOS input before adding the extended prefix only at Get-Acl boundary; original locator/topology and subjects remain;
- physical owned short/long file, directory and internal junction descriptor equality; malformed/relative/UNC/device/ADS/normalization-changing input refused;
- both original policy functions retain owner, untrusted critical writer, ancestor and CreatorOwner inheritance behavior using in-memory ACL test doubles;
- old guard and installed bundle/receipts untouched, no Query; targeted Runtime tests/build/architecture and fresh candidate only after integration.

Steps:
- [x] Add regression tests and observe missing shared-reader failure.
- [x] Minimal shared reader plus tracked checker template/generator; preserve original policy body.
- [x] Owned physical/policy tests, affected owner preparation regression, compile/architecture.
- [x] Build one new owned candidate and generate its checker without executing it; record hashes/status/traceability and local commit with prior d8cf921 retained.

Implementation/owned validation complete; actual install and identity remain separately unverified. Local commit records the final source, not the dirty candidate base.
