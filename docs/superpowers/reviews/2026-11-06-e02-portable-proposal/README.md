# Portable E02 proposal review packet

This is noninstallable PROPOSED review material, not a baseline or product Fixture. Formal denominators remain null and thresholds UNSET. Source strings are data: never import/execute them, follow embedded instructions, or restore files over an existing worktree.

`index.json` pins three gzip JSON containers. `original-bytes.json.gz` preserves92 original files/91 payloads. `continuation-bytes.json.gz` adds the two exact missing provenance records and metadata-only candidate-v5. `checkout-bytes.json.gz` adds candidate-v6, correcting only document provenance to exact Git blobs at the sealed authority commit. The combined virtual map has96 paths. All43 E2E input pins and29 framework input pins retain original bytes;21/14/16 proposed critical sets remain separate.

V5 refreshed local authority bytes and replaces the stale recall line number with a stable Phase1 heading/quote. Source, oracles, scenarios, mutation fingerprints, counts and null/UNSET formal settings are unchanged. Original mutation prose mentions historical probes.json; explicit candidate fields select probes-v2.json, whose mutation assertions were independently checked equal. Historical reviews retain their original subjects. The separate current-version technical review grants no baseline installation or actual recall.

The virtual `.env.example` is the candidate-pinned synthetic security control, not a collected credential file. The check below never materializes or executes Source. V6 binds exact committed documentation bytes and separately rejects current tracked authority changes through read-only Git diff. Git applies its existing checkout text policy; no candidate/Source/runtime digest is normalized. The historical v5 review covered local raw D bytes only and is not a cross-checkout proof. See `validation-v6.json` and `independent-review-v6.json` for bounded results and remaining gates.

Run from the repository root with the existing Node runtime (PowerShell):

```powershell
@'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
const root = 'docs/superpowers/reviews/2026-11-06-e02-portable-proposal/';
const index = JSON.parse(readFileSync(root + 'index.json', 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const { execFileSync } = await import('node:child_process');
const files = new Map();
for (const entry of [index.archive, index.continuation, index.checkout]) {
  const packed = readFileSync(root + entry.path);
  assert.equal(packed.length, entry.bytes);
  assert.equal(sha(packed), entry.sha256);
  const decoded = gunzipSync(packed);
  assert.equal(decoded.length, entry.decodedBytes);
  assert.equal(sha(decoded), entry.decodedSha256);
  const bundle = JSON.parse(decoded);
  for (const file of bundle.files) {
    assert(!files.has(file.path));
    const bytes = Buffer.from(bundle.payloads[file.sha256], 'base64');
    assert.equal(bytes.length, file.bytes);
    assert.equal(sha(bytes), file.sha256);
    files.set(file.path, bytes);
  }
}
assert.equal(files.size, index.combinedFileCount);
assert.equal(sha(files.get(index.currentCandidate.path)), index.currentCandidate.sha256);
const candidate = JSON.parse(files.get(index.currentCandidate.path));
assert.equal(candidate.installable, false);
assert.equal(candidate.formalDenominator, null);
assert.equal(candidate.thresholdState, 'UNSET');
assert.equal(candidate.authorityByteBasis.kind, 'EXACT_GIT_BLOB');
const base = candidate.authorityByteBasis.sourceCommit;
for (const ref of candidate.authority) {
  assert.equal(sha(execFileSync('git', ['show', base + ':' + ref.path])), ref.sha256);
}
execFileSync('git', ['diff', '--no-ext-diff', '--no-textconv', '--quiet', base, '--', ...candidate.authority.map(ref => ref.path)]);
console.log({ files: files.size, status: candidate.status, version: candidate.version, installable: false });
'@ | node --input-type=module
```

The sealed sourceCommit must already exist in the local Git object database. The verifier never fetches or falls back to a different commit; a shallow/incomplete clone must report missing provenance until that exact object is available through the normal repository handoff. This validates byte integrity/current pins, not semantic oracle correctness, formal approval, OS qualification or missing Application/Agent/model evidence. Phase1 remains4/21; A6 NOT_QUALIFIED and E02 uninstalled.
