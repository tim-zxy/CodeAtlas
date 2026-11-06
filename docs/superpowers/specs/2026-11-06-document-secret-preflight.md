# Private document secret inspection and remaining production decisions

## Implemented scope
SECURITY.md source/secret controls requires candidate inspection without raw-match persistence; ADR-004 preserves AUTO structure/MANUAL semantics. The existing operation-policy secretDetected input remains unchanged. New private Documents inspection has no provider, configuration or publication authority. Only stdlib is used. Application-to-Documents is an allowed internal dependency, now declared exactly in the manifest/lock and architecture tests.

The initial deny-only rules identify private-key BEGIN markers; explicit nonempty password/passwd/api_key/api-key/apikey/secret/access_token/access-token/accesstoken/token/authorization assignments; and those exact case-insensitive credential property names with nonempty string values. Original UTF8 bytes and every candidate string/key are traversed separately, including diagnostics and nested arrays. Matching is conservative and may block examples. Only sorted rule IDs are returned: no raw match, location, fingerprint, source bytes or Draft. These rules DO NOT cover arbitrary opaque or encoded credentials, every token format, transformed substrings, or every split/indirect secret. A negative is not evidence of secrecy.

Every successful inspection says coverage=LIMITED and clearance=false. Application checkDocumentWrite snapshots the caller envelope before async reads, consumes existing prepared Source.readDocumentBytes, verifies original digest/ranges through strict immutable Draft, binds selected path/repository, inspects actual raw and final Draft independently, then rechecks complete Source selection and shared control. It returns document NOT_COMMITTED with SECRET_DETECTED or SECRET_COVERAGE_INCOMPLETE. Existing Source commit effects remain separate and truthful. It accepts no Store/write callback and exposes no public root API. Errors are sanitized. Caller input/accessors/shared backing, cancellation, budget/source/range/scope failures cannot become a scan receipt.

This is a real bounded detector and Application preflight, not a complete security scanner or update-documents route. No production route or database permission was expanded; old Store/guard behavior is unchanged. No baseline threshold, qualification formula, Native/R9/remote/model execution or new external dependency.

## Production decisions still required
1. Approve a concrete versioned secret-detection coverage policy and its independent positive/negative corpus before any preflight result can contribute to write/transfer authorization. Current indicators can only deny. Alternatives are retaining the deny-only/unready state (conservative), or separately choosing a reviewed detector/approved local-only baseline. Any baseline approval must explicitly accept missed opaque/encoded forms, distinguish fully executed rules from secret-free content, retain path/classification denies and keep remote permissions separate. No such approval is inferred here.
2. Adopt and freeze the actual Markdown parser closure, then implement and verify AST-to-Canonical mapping. Current literal-IR Draft is not parser-derived proof. Final payload scanning must remain after mapping and bound to the exact consumed payload; Source/control/CAS/unknown-outcome guards remain required.

## Exact parser recommendation (not installed)
Choose unified 11.0.5 + remark-parse 11.0.0 + remark-gfm 4.0.1 as the private Documents adapter roots. Upstream package manifests freshly inspected on 2026-11-06 report MIT, ESM and these versions. Their semantic mdast/GFM model reduces custom table/link/heading semantics compared with a compact syntax tree; the Canonical IR remains provider independent. Parse only, never execute HTML, follow URLs or invoke models. Existing literal original-byte mapper handles AST UTF16 offsets; actual BOM/CRLF/Unicode adapter cases still must be proved.

Primary manifests:
- https://raw.githubusercontent.com/unifiedjs/unified/main/package.json
- https://raw.githubusercontent.com/remarkjs/remark/main/packages/remark-parse/package.json
- https://raw.githubusercontent.com/remarkjs/remark-gfm/main/package.json

Maintenance evidence is repository activity, not a support guarantee: latest commits observed via GitHub API were unified dfaf172e8be10a021e375ab05acf595f65f5acf0 (2026-10-03), remark 1146b3a274fc1f4607111e5d6607a3a769a0e89a (2026-09-27), remark-gfm 109972e8a773bf5dac1d6d2da0776557f36971aa (2025-02-10).

Historical decision packet reports a 69-node remark closure and 3-node Lezer1.6.3/common1.5.5/highlight1.2.5 alternative. Its underlying Nov4 archive files are absent from THIS worktree, so those counts/license/integrity claims are historical, not a fresh audited lock. Lezer's GitHub archive points to a moved upstream; this is not evidence of abandonment. It requires more reference-link/semantic adaptation. No homemade Markdown parser is recommended.

Offline build is feasible only after approved exact archives/transitives/types are pinned and integrity/license checked, imported into the offline store and tested with frozen-lockfile/ignore-scripts. That parser offline build has NOT been verified here; only the new internal workspace link was installed/verified completely offline. Current root manifests are not published tarball verification, a CVE audit, full transitive license approval or measured performance. Obtain those before installation. Rollback disables/removes the unpublished private adapter; it does not delete existing immutable document revisions or alter old Fixture pins.

## Evidence / remaining gates
See the accompanying review JSON for exact RED/GREEN, guard findings and integration commands. Component test uses actual controlled Source with Git doubles and owned SQLite, literal IR; it is not actual parser/scan-clearance/publication E2E. P1-10/E07/P1-12 remain open; phase4/21 and A6 NOT_QUALIFIED unchanged. R9 not run. Original R8 catalog remains immutable.
