import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export const fixtureRoot = new URL(
  '../../../../fixtures/phase1/history-transition/',
  import.meta.url,
);
export const limits = {
  maxSerializedBytes: Number.MAX_SAFE_INTEGER,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxDepth: Number.MAX_SAFE_INTEGER,
};
export const fixtureJSON = (p) => JSON.parse(readFileSync(new URL(p, fixtureRoot), 'utf8'));
export const cases = fixtureJSON('cases.json');
export function loadHistoryCase(id) {
  const c = cases.find((x) => x.id === id);
  if (!c) throw Error('Unknown case');
  return { input: fixtureJSON(c.input), expected: fixtureJSON(c.expected) };
}
export const sha = (x) => createHash('sha256').update(x).digest('hex');
export function assertDeepFrozen(assert, value) {
  if (value && typeof value === 'object') {
    assert.equal(Object.isFrozen(value), true);
    for (const x of Object.values(value)) assertDeepFrozen(assert, x);
  }
}
