# Current13 immutable-input portability

Approved necessary stage synchronization fix only. Original product contracts, Fixture IDs, baselines, provenance and exclusive output writes remain unchanged.

The exact13 immutable JSON/JSONL allowlist in the sync-preflight input-portability map is appended to existing ci-portability index/archive. Keep all679 original logical records and359 original content blobs byte-exact. Sorted deterministic JSON/gzip adds only pinned originals; no raw rewrite, new extraction, output regeneration or source identity replacement. Reuse tracked J1.code request/output for the two duplicate Java raws with existing consumer SHA checks.

Extend only the existing test-fixture helper with readHistoricalInputOrLocal(logical,encoding,localRoot). localRoot is explicit and absolute, so current13 consumers preserve their repository-relative resolution independently of process.cwd. Validate safe relative POSIX logical components and existing archive allowlist BEFORE filesystem access; reject absolute/drive/backslash/traversal/control paths. Read local first; only ENOENT reads the archived exact bytes. Propagate all other errors unchanged. Never materialize archive data into .superpowers.

Four helper and three test readers change only immutable-input reads. Existing prepare/output roots stay ignored and outputs remain create-new(wx). Create missing output parent directories at existing write seams; do not prepopulate prepare-summary/unit-input/output files. Existing prepare is a one-shot output freeze in each owned directory, not automatic overwrite or Native regeneration. Optional ignored Rust producers/component replay inputs outside the13-file scope remain explicit local diagnostics.

New pure test fixes literal13 byte pins and the679-record old-index digest before implementation. Verify every older raw byte via existing loader, local priority, non-ENOENT identity, safe logical refusal before IO, explicit-root/cwd behavior and no ignored-directory materialization. Minimal pure strict-reader checks may consume archived raw pairs; no full graph, Source integration, long old suite or producer/Native/Rust execution.

Files: existing ci-portability index.json/historical-bytes.json.gz/historical-inputs.mjs; seven current13 read consumers named in input-portability-map; new scripts/test-current13-input-portability.mjs; this scope/evidence. Output-parent directory creation stays in those same consumers. Root owns shared documentation and all Git writes.

Historical raw metadata may contain local absolute temp/tool paths. Preserve pinned originals, classify as historical fixture data and disclose for public Git review. No credentials, unrelated files, compiled artifacts, output logs or whole-sdd copy are included.
