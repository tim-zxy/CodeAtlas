# Precompiled Principal deployment and one-shot validation plan

Status: READY FOR REVIEW, NOT EXECUTED. Source baseline9069d44 plus this offline routing batch. No protected install, ACL change or account query authorized here.

## Existing integration and deliverable

Private acquirePrecompiledWindowsPrincipal already joins existing module-local Principal epochs. The explicit verification entry now accepts --precompiled-current-process-only, selects that path once, never falls back, and retains --current-process-only for historical legacy compatibility. It exercises only test-owned :memory: workspace metadata and QUERY/READ_SOURCE operation scopes after successful identity acquisition. It is not the ordinary CLI bootstrap and does not enable general capture, scan clearance, INDEX, models or publication.

Owned candidate directory: .superpowers/closed-runtime-20261107-deployment-01/release-ac84dad419c823081d471b6aec288985b01a2f3d9c065e9e666174271bef62b7.
Catalog SHA256 ac84dad419c823081d471b6aec288985b01a2f3d9c065e9e666174271bef62b7;450696 catalog bytes,3053 files/17512905 payload bytes,11 internal junction aliases. This is a directory catalog digest, not an archive hash/signature. Preserve catalog bytes and relative layout.

Includes CLI1 + workspace libraries10, external packages71, Storage migrations, fixed legacy source/Cargo/toolchain metadata, exact6656-byte DLL and explicit probe. Probe SHA256 e27b4a292f46c7fb7928b2e167f38b1ff8e7948be08ade3ea60a91b6fccd6275. Lock SHA25623167a4d0df3f384933f3986d17a2736ceecd41cd742da8f9cc28c161dca3d84. DLL SHA2564ee3e48cfa2f6c4d883a983a2f7b5739ecf7b01d515c94cecbed9f87e3bb7147. Do not compile again or download/resolve dependencies during deployment.

Node24.15.0 at D:/Program Files/nodejs/node.exe is external, observed SHA2563331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5. Existing PowerShell host is C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe SHA25660c9b29843624dd8af6b6a7b26147753be6aeef65098b9a503cc50850afe410f. Windows/.NET CLR and mscorlib/System4.0.0.0 plus kernel32/advapi32 are platform prerequisites, not bundled. Reflection import names do not prove the complete actual OS loader chain. This candidate omits the Rust analysis executable and is not a complete Phase1 installer.

## Precise target and installation actions requiring approval

Future target is the actual KnownFolder LocalApplicationData + Programs/CodeAtlas/releases/release-ac84dad419c823081d471b6aec288985b01a2f3d9c065e9e666174271bef62b7. Observed candidate on this machine: C:/Users/Freya/AppData/Local/Programs/CodeAtlas/releases/release-ac84dad419c823081d471b6aec288985b01a2f3d9c065e9e666174271bef62b7. Programs exists, CodeAtlas is absent at inspection. Environment text/username alone is not KnownFolder/subject proof.

After a separate install approval and platform permission: verify the exact owned source catalog and DLL, every file/hash and source identity; require the entire target absent and existing ancestry stable/non-reparse. Create only CodeAtlas/releases and the fixed new release root, then physical subdirectories/files listed by the catalog and closed-runtime.json. Do not overwrite any existing target. Recreate all11 junctions from catalog-relative targets INSIDE the installed release; do not copy/follow the D: directory's absolute junctions. Revalidate full installed topology/contents and actual alias realpaths. Never mark a copied bundle trusted merely because its digest matches.

Directory protection must satisfy existing Guard-Acl for the release, every file/internal alias and all physical ancestors. Trusted subjects remain the actual current SID, SYSTEM, Administrators and actual protected Windows-directory owner; unknown critical Allow writers or unknown owner/reparse refuse. No current SID is inferred from Freya, manifests, directory owner or an Agent response. The current same-SID Agent boundary is accepted, not human consent. Existing inheritance is inspected, not rewritten. No Set-Acl/icacls/group membership/service/registry/startup permission action is included; if default inherited protection fails, STOP and prepare a separate exact ACL decision instead of auto-repair.

There is currently no dedicated trusted installer; these are explicit proposed file operations, not a claim that an installer command already exists. The reviewed operation must retain its fixed source/target/file list, confirm no concurrent writer and preserve any newly owned partial directory on failure. No copy-back into development checkout, user DB migration, auto-update pointer or protected cleanup is included.

## One real validation action requiring separate approval

After installation/protection review only, the exact intended command is:

    & 'D:\Program Files\nodejs\node.exe' 'C:\Users\Freya\AppData\Local\Programs\CodeAtlas\releases\release-ac84dad419c823081d471b6aec288985b01a2f3d9c065e9e666174271bef62b7\packages\runtime\test\windows-principal-live-probe.mjs' --precompiled-current-process-only

Use the fixed release as working directory and reviewed ordinary Node launch without NODE_OPTIONS/NODE_PATH/test-module mocks/custom loaders; do not reuse a test hook or caller-selected module to grant authority. The launcher/environment and actual caller token still require operation-time verification. No elevated/alternate account, impersonation, network, user source or user database is needed. The entry must come from this installed catalog, not an extra file copied after validation.

Existing explicit probe limits remain unchanged:30s total deadline,200000 items,depth80,4MiB Principal stdin/file cap,16KiB stdout cap; in-memory scope budget10000 rows,2000000 serialized bytes,200000 items,depth80,20000000 memory accounting bytes. They are existing probe controls, not new resource profiles or a hard RSS limit. One Node process and at most one fixed PowerShell child, no compiler or intended descendants; no process-tree hard isolation. Only one identity acquisition attempt, no retry on denial, timeout, stderr, unexpected output or UNKNOWN.

Sequence: fixed host hash/identity -> private module-derived installed root -> bounded catalog/all-file content check -> same copied DLL/manifest packet plus internal Node PID/challenge -> fixed PowerShell with NoLogo/NoProfile/NonInteractive/Command and fixed reduced environment -> actual KnownFolder/OS protection -> cloned DLL hash/load and exact managed/PInvoke reference checks -> Query only the actual Node PID with TOKEN_QUERY/PROCESS_QUERY_LIMITED_INFORMATION -> SID/process birth/private challenge check -> repeated tree/ACL guards -> bounded canonical reply -> stdin finish/both EOFs/normal close -> host identity and metadata settlement -> opaque process-local Principal. Only then create the test-owned operation; genuine Application policy and existing Source rules remain mandatory. JSON/manifest/reply copies are never grants.

Failure invalidates the epoch; unresolved exit/close or resource ownership poisons further acquisition. Stop at first failure, retain bounded redacted diagnostics/receipts and exact partial output, do not recurse-delete unknown state or retry. Historical codeatlas-principal-VU96KA and original failed pure-loader receipt stay untouched. Normal release invalidates opaque handles; restart does not restore them. Runtime's DLL route never falls back to Temp compilation.

## Evidence, risk and rollback

Offline route RED4 cases had1PASS/3FAIL; GREEN4/4 uses Principal module doubles plus actual owned in-memory SQLite/operation rules, never OS identity. Real candidate package content, probe catalog binding, three singleton pairs and development-root refusal pass. Runtime build and17-project architecture gate pass. Old CI162 TS/Rust passed; Native retains R8 script-catalog mismatch. None closes A6 or grants installation rights.

Risks: same-account modification remains within accepted trust boundary; copy/junction/ACL race or unknown inherited rights; fixed host/Node changes force refusal; Windows OS dependency closure and actual subject may still refuse; soft limits are not hard memory containment; local DLL/pack are not in Git. No claim of deterministic compiler output. Obtain separately approved artifact backup/transfer before relying on another computer.

Rollback is to stop using the private new route and retain the old/default unavailable state, release any settled process-local handles and restart if poisoned. Do not claim old legacy route will work here. No automatic release pointer, permission or user data has changed; any deletion of installed/partial files needs exact owned-path/cleanup proof and approval. Conservative alternative is leaving real admission disabled and continuing offline work; it cannot prove actual Principal or A6 success.
