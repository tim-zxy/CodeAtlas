import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url),
  prefix = 'fixtures/phase1/mixed-analysis-stage/component-references/';
const manifest = JSON.parse(fs.readFileSync(new URL('provenance.json', root)));
const entries = new Map(manifest.files.map((entry) => [entry.path, entry]));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** Repository-owned test inputs only. This grants no runtime or publication authority. */
export function readComponentReference(value) {
  const entry = entries.get(value.startsWith(prefix) ? value.slice(prefix.length) : value);
  if (!entry) throw Error('Unknown component reference');
  const asset = fs.readFileSync(new URL(entry.asset, root));
  if (sha(asset) !== entry.assetSha256) throw Error('Component asset digest mismatch');
  const bytes =
    entry.encoding === 'gzip' ? gunzipSync(asset, { maxOutputLength: entry.byteLength }) : asset;
  if (
    bytes.length !== entry.byteLength ||
    sha(bytes) !== entry.sha256 ||
    entry.sha256 !== entry.sourceEvidence.sha256
  )
    throw Error('Component payload differs from sealed source');
  return bytes;
}
