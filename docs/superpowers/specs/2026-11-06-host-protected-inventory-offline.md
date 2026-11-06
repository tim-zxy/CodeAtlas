# HOST protected inventory projection: offline scope

Approved continuation of B-DESIGN-OFFLINE only. The frozen49 pure ownership files remain untouched.

Assume the coordinator independently fixes the manifest SHA, existing graph array pins and supplement records before HOST. They are ordinary expected inputs, never authentication tokens. projectMixedNativeHostProtectedInventory(input) performs no filesystem access, import resolution, process launch or Windows call. It uses node:path.win32 and node:crypto only.

Inputs reuse root, manifestPath, manifestSha256, manifest, descriptor, graph and original manifestBytes/descriptorBytes and existing graph receipt pins (artifactsSha256, edgesSha256, sourceFilesSha256). supplement is an array using existing C# Entry fields id/path/kind/parentId/sha256; parentId is null on incoming file records and projected to generated ancestor IDs. excludedPaths is a fixed exact lexical file exclusion list for mutable Source/DB/sidecars. Output entries use the same C# Entry fields; no token, new wire/schema, trusted callback or settlement authority is introduced.

Original manifestBytes must match independent manifestSha256; original descriptorBytes must match bootstrap artifact digest/size. Fatal UTF-8 decoding/JSON parsing must agree structurally with the supplied existing manifest/descriptor. No byte normalization. The existing owner-context loader currently imposes canonical JSON separately; this projector does not replace its own stricter admissibility checks or authorize a bootstrap from broader raw consistency alone. The fixed graph array pins must match; graph entry/module IDs and descriptor entry/module IDs agree with original builder module-N/data-N conventions. Every graph artifact must exactly occur in manifest. All manifest artifacts are retained, including graph modules, explicit SQL/data, descriptors and original recheck inputs. sourceFiles is checked only as pinned provenance, never expanded into runtime protection paths.

The coordinator supplement must explicitly contain the bootstrap script and both prehook helpers with exact fixed filenames, plus the host/observer/git/native manifest binding artifacts as Tool entries. A supplement may annotate the SAME manifest ID/path/hash with a role, or add a distinct independently fixed file. Conflicting ID/path/hash, case aliases and contradictory roles refuse. This checks supplied tool coverage only; it does not determine that an entry is a real binary, establish actual Node/tool startup paths or bless marker files.

Paths are lexical canonical drive-absolute Windows paths. Project every ancestor through each drive root, deduplicate case-insensitively, and emit deterministic ancestor IDs in ordinal order. Reject traversal, device/ADS/ambiguous names and exact excluded-file overlap. Do not recursively enumerate a Source root or inspect a DB. Exclusion completeness remains a coordinator review obligation.

Verifiable success: literal independent oracle catches omitted module/data/helper/tool, wrong entry/module membership, stale expected hashes, descriptor mismatch, case/path/hash conflicts, missing ancestors and accidental runtime inclusion of graph.sourceFiles; pure Node tests pass. No current graph generation or real binary reads. Existing historical graph receipt may supply a stale-hash counterexample only; no fresh/current complete protected inventory is claimed. No cross-C# runner is included: output field compatibility is checked in memory; lifecycle ordering remains separately proven by HOST49.

Plan: write literal fixture and independently fixed pins/expected paths before code, observe absent-module RED, implement minimal pure projector, run only new Node memory tests, preserve failures and pin final files. Root performs combined independent review and shared documentation integration.

All executionAuthorized/productionAdmission/measurementEligible/moduleClosureAuthenticated/contextAuthenticated/liveTransportConnected flags remain false. Live admission is NOT_READY. Actual complete supplement, namespace guarantees and trusted full consumer settlement remain unproved; nothing calls Start or translates caller settlement booleans into authority.

## Same-ID supplement role preservation

Every same-ID annotation first requires identical normalized path and SHA. The legal annotation table is:

| Existing projected role | Allowed same-ID supplement annotation |
| --- | --- |
| Manifest | None; preserve Manifest |
| Descriptor (bootstrap/operation) | None; preserve Descriptor |
| Graph data-* PathData | None; preserve PathData |
| Graph Module | Bootstrap, PrehookOwner or PrehookLoader only, with the exact corresponding fixed filename; Tool is forbidden |
| Non-graph manifest extra PathData | Tool or a required helper role, preserving the same ID/path/hash and the helper filename checks |
| New distinct supplement ID/path | Original explicit Tool/helper rules apply |

This preserves the original schema and C# kinds. A graph Module may carry its prehook role when the same protected bytes have both uses; it remains one protected file entry. Contradictory role replacement is refused before returning entries.
