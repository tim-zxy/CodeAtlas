# Private HOST startup and owned context: offline continuation

Approved D1-D4; implement/compile only, no actual launch/debugger/Git/Native or
production/user DB. Existing helper Run, rights and resource numbers unchanged.

HOST plan fixes Node executable + one .mjs owner script + one manifest.json + its
expected SHA argument, local absolute paths, explicit cwd/environment (no host
inheritance), image/script hashes and explicit character bound. Hashes and paths
are correlation metadata, not file/authentication evidence or approval. No generic
argv/shell/attach. Actual file/script/environment provenance remains a prerequisite.

Startup handle ledger retains fixed root process/thread and anonymous pipe roles,
closes each locally owned handle at most once, and transfers only matching CREATE
process/thread aliases to the debugger. Transferred aliases are released only on
successful OS EXIT Continue; failed close/unknown ownership remains sticky unknown.
A private Windows root-start seam reuses existing CreatePipe/inheritance whitelist,
RootCreationFlags/CreateProcessW/DebugSetProcessKillOnExit APIs. It returns partial
owned resources even on failure, never asserts process cleanup from CloseHandle
alone. No actual launcher/CLI/public entry is enabled or called in tests.

Bounded HOST stderr drain hashes/counts bytes without retaining content, using
explicit limits/buffer. Empty complete EOF is required for success; nonempty,
overflow/error/unfinished worker rejects semantic success. Stop requests disposal
once; no forced-unblock or extra cleanup budget is inferred.

Owned context binds an existing Storage opaque capture handle to its same SQLite
connection/readset/lease via existing read/recheck/release functions. No new SQL,
DB open or capture, no guessed schema. Success transfers release responsibility;
failure does not. Recheck failure is sticky but still permits release; release is
idempotent and never closes the database. Readset verification is last local read
only, RECHECK_REQUIRED before use. Application origin, file identity, live Source/
history/tool/environment and execution/production/measurement remain unverified.
Tests use existing owned temporary SQLite fixtures only; missing Source/history
is not filled or relabelled as authenticated.

Parallel: root owns new C# HOST/Windows/tests and shared integration; agent owns
only new owned-context module/test. Independent reviewer reports only. Full actual
HOST+loop+diagnostic resource closure and real context/oracle/lifetime/physical
formula/numeric/run packet remain distinct required gates, never synthetic PASS.

Windows handle/thread reference:
https://learn.microsoft.com/en-us/windows/win32/api/debugapi/nf-debugapi-waitfordebugevent

Root CREATE alias observation precedes DuplicateHandle, including duplicate
failure. A debugger-owned root handle may be borrowed only for controlled abort,
never locally closed; successful duplicate ownership suppresses that fallback so
only one owner terminates it. Successful EXIT Continue retires borrowed/aliased
handles; unknown/failed closes cannot be retried. Initial thread handle is carried
through both private event seams. Worker stop flags are set before raw transport
handles close; no forced I/O cancellation is asserted.

IControlPipe.ReadyToComplete gates normal loop completion. Plain control requires
complete input EOF; HOST composition additionally requires empty complete stderr
EOF. The loop waits existing workers under the same remaining budget before Stop,
so a merely stopped zero-byte stderr worker cannot masquerade as observed EOF.
Cancelled/failed cleanup stays separate from normal semantic completion.

## Bounded offline continuation - 2026-11-06

See [N1 exact allSOURCE orchestration](2026-11-06-current13-no-native-offline.md) and
[HOST protected-consumption ownership](2026-11-06-host-consumption-lifetime-offline.md).
These private offline refinements preserve prior Native/suffix guards, operation
authority and live NOT_READY; no OS guarantee, actual launch, new right or resource
number follows. Historical outcomes below/above remain scoped to their tested bytes.
