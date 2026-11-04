import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
export const cases = Object.freeze(read('cases.json').map((c) => Object.freeze(c)));
export function loadScopeCase(id) {
  const metadata = cases.find((c) => c.id === id);
  if (!metadata) throw new TypeError('UNKNOWN_SCOPE_CASE');
  return { metadata, input: read(metadata.input), expected: read(metadata.expected) };
}
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
