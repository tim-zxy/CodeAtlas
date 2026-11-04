import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url);
export const cases = JSON.parse(readFileSync(new URL('cases.json', root), 'utf8'));
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function loadRawCase(id) {
  const c = cases.find((c) => c.id === id);
  if (!c) throw Error('Unknown declared delta case');
  const json = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
  return {
    input: json(c.input),
    metadata: json(c.metadata),
    requestBytes: readFileSync(new URL(c.request, root)),
    outputBytes: readFileSync(new URL(c.output, root)),
    expected: json(c.expected),
  };
}
