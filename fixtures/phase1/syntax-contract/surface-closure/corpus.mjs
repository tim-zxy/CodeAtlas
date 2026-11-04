// Test-only immutable recorded bytes; never a new parser run or publication authority.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const pack = JSON.parse(
  gunzipSync(readFileSync(new URL('./recorded-library-inputs.json.gz', import.meta.url))),
);
assert.equal(pack.schemaVersion, 1);
assert.equal(pack.kind, 'RECORDED_LIBRARY_INPUT');
export function readSurfaceCapture(id) {
  const entry = pack.entries.find((e) => e.id === id);
  assert(entry, 'unknown recorded Source');
  const decode = (part) =>
    part === null
      ? null
      : Object.fromEntries(
          Object.entries(part).map(([key, value]) => {
            const bytes = Buffer.from(value.base64, 'base64');
            assert.equal(createHash('sha256').update(bytes).digest('hex'), value.sha256);
            return [key, bytes];
          }),
        );
  return { id: entry.id, kind: entry.kind, syntax: decode(entry.syntax), code: decode(entry.code) };
}
