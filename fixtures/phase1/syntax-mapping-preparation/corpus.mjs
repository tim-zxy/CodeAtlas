import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
export const cases = Object.freeze(
  read('cases.json').map((c) => Object.freeze({ ...c, sourceRefs: Object.freeze(c.sourceRefs) })),
);
export function loadMappingCase(id) {
  const metadata = cases.find((c) => c.id === id);
  if (!metadata) throw new TypeError('UNKNOWN_MAPPING_CASE');
  return { metadata, input: read(metadata.input), expected: read(metadata.expected) };
}
export function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
