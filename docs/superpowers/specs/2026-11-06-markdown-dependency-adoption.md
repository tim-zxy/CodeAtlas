# Markdown dependency adoption: approved exact closure

The user approved the three roots and audited69-package candidate lock for scripts-
disabled offline installation and local parser verification. Production scanner
clearance, publication and actual R9 remain excluded. Earlier NOT INSTALLED / future
request wording below records the pre-approval audit; fresh adoption evidence is
recorded separately and does not rewrite that historical audit.

## Exact recommended object
Adopt only unified11.0.5, remark-parse11.0.0 and remark-gfm4.0.1 under private
@codeatlas/documents. Preserve TypeScript domain / Rust analyzer boundaries and
provider-independent Canonical IR. No SDK, network parser, HTML execution, URL
fetching, model invocation or scanner-clearance permission is included.

Use [this isolated pnpm11.19.0 candidate lock](../reviews/2026-11-06-markdown-parser-candidate-lock.yaml)
as the reviewed dependency-resolution target. SHA256:
`37aed2cb8c1a3b5306e01420b98a200ddce63ded2d19dd36e45e2d1e7b2c62ba`.
It pins69 packages and212 edges. It is NOT the repository workspace lock and is
NOT installed. [Lock/archive/advisory evidence](../reviews/2026-11-06-markdown-parser-lock-verification.json)
is the controlling candidate supplement to the original max-satisfying audit.

The actual lock differs from that original audit in four transitive versions:
- mdast-util-gfm-autolink-literal2.0.1 (rather than2.1.0)
- mdast-util-gfm-task-list-item2.0.0 (rather than2.0.1)
- mdast-util-to-markdown2.2.2 (rather than2.2.3)
- vfile-message4.0.3 (rather than4.0.4)

All four excluded latest versions were published today. pnpm11's documented
minimumReleaseAge default is1440minutes; observed older selection is consistent
with that safeguard. No exclusion/trust override was applied. The four older
archives were separately audited; the other65 reuse matching prior archive
identities. All69 actual-lock archives match npm SRI/name/version and MIT grants,
with no install hooks/native binding.gyp/missing declared export targets. Actual
lock's npm advisory query returned HTTP200/empty at the recorded time, not proof
of no vulnerability. [Official pnpm policy](https://github.com/pnpm/pnpm/blob/main/pnpm/docs/settings/dependency-resolution.md).

## Completed without adoption
In an isolated Temp directory, pnpm generated ONLY a lock with downloads0/adds0.
A second offline/frozen/lockfile-only pass exited0; node_modules is absent. Every
actual version/SRI and212 edges were checked against archive metadata. No project
manifest/lock or package code was used/changed by these isolated commands. The
previous audit's newest-version proposal remains preserved; it was not silently
relabeled as this lock.

## Approval scope and implementation steps
Requested future approval: adopt this exact root/closure target, install with
scripts disabled and implement/verify the private Markdown AST adapter within
existing IR/range/opaque-ID contracts. It does not approve new security coverage,
remote source/model access, real Native/R9, resource numbers or phase acceptance.

After approval:
1. Add only the three exact dependencies to Documents. Produce a candidate project
lock, keeping existing resolved package identities unchanged. Compare its added
package versions/SRI/edges to this candidate. On any difference, stop adoption and
audit the delta; do not override release-age/trust protections or blanket-upgrade.
2. Populate a dedicated package store using verified registry integrity with
lifecycle scripts disabled; then perform an offline frozen install. This actual
store population/install is NOT performed now. Downloaded audit tarballs alone
are not a pnpm installation or proof of runnable build.
3. Run Documents/Application/Runtime builds and parser adapter tests using original
UTF8/BOM/CRLF/Unicode fixtures, duplicate headings, fenced code-as-data, tables and
reference links. Full existing mandatory tests and architecture guards remain.
Keep failed/partial parse last-good behavior and immutable parserVersion/policy tuple.
4. Keep final-payload secret scanning deny-only until its coverage contract is
approved. Do not enable production Document writes merely because parsing works.
Sync the verified phase batch once through the authorized continuation branch.

## Risk, alternative and rollback
More transitive packages than the historical Lezer alternative; MIT inspection is
not legal certification or exhaustive malware/signature audit. Actual performance,
AST adaptation and offline TypeScript integration still require measurement/tests.
The conservative alternative is to retain parser-unavailable status; a smaller
syntax-tree adapter requires more independently verified semantic/reference mapping.
Rollback disables the private adapter and restores only its unpublished dependency
changes. Retain old immutable revisions/evidence; no DB down migration or history
rewrite. No adoption/installation action is currently authorized by this packet.
