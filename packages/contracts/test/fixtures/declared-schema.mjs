import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { workspaceRuntimeInputDigestV2, canonicalRuntimeJson } from '@codeatlas/ir';
export const seed = JSON.parse(
  readFileSync(
    new URL(
      '../../../../fixtures/phase1/contract-matching/declared-schema-inputs.json',
      import.meta.url,
    ),
  ),
).input;
export const expected = JSON.parse(
  readFileSync(
    new URL(
      '../../../../fixtures/phase1/contract-matching/declared-schema-expected.json',
      import.meta.url,
    ),
  ),
);
export function seal(x) {
  x.workspaceBasis.workspaceActivationDigest = workspaceRuntimeInputDigestV2(x);
  x.catalog.workspaceBasis = structuredClone(x.workspaceBasis);
  return x;
}
export const fixture = () => seal(structuredClone(seed));
export const control = (extra = {}) => ({
  maxInputBytes: 100000,
  maxItems: 10000,
  maxDepth: 64,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
  ...extra,
});
export function rebody(d, change) {
  const x = JSON.parse(d.contentUtf8);
  change(x);
  d.contentUtf8 = JSON.stringify(x) + '\n';
  d.sourceFile.contentFingerprint =
    'sha256:' + createHash('sha256').update(d.contentUtf8).digest('hex');
  d.sourceSupport.valueDigest = createHash('sha256')
    .update('codeatlas-phase1-support-value-v1\0' + canonicalRuntimeJson(d.sourceFile))
    .digest('hex');
}
