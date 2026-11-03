import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export const fixtureRoot = new URL(
  '../../../../fixtures/phase1/delta-support-candidate/',
  import.meta.url,
);
export const fixtureJSON = (p) => JSON.parse(readFileSync(new URL(p, fixtureRoot), 'utf8'));
export const cases = fixtureJSON('cases.json');
export const limits = {
  maxSerializedBytes: Number.MAX_SAFE_INTEGER,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxDepth: Number.MAX_SAFE_INTEGER,
};
export function loadDeltaCase(id) {
  const c = cases.find((x) => x.id === id);
  if (!c) throw Error('Unknown case');
  return { input: fixtureJSON(c.input), expected: fixtureJSON(c.expected) };
}
export const sha = (x) => createHash('sha256').update(x).digest('hex');
// Literal pre-refactor compatibility observations; not profile or graph goldens.
export const legacyBudgets = [
  {
    id: 'H02-present',
    boundary: {
      maxSerializedBytes: 67575,
      maxItems: 2983,
    },
  },
  {
    id: 'H03-original',
    boundary: {
      maxSerializedBytes: 67575,
      maxItems: 2983,
    },
  },
  {
    id: 'H05-metadata',
    boundary: {
      maxSerializedBytes: 73048,
      maxItems: 3212,
    },
  },
  {
    id: 'H07-python',
    boundary: {
      maxSerializedBytes: 73069,
      maxItems: 3212,
    },
  },
  {
    id: 'H08-java',
    boundary: {
      maxSerializedBytes: 73144,
      maxItems: 3215,
    },
  },
  {
    id: 'H09-both',
    boundary: {
      maxSerializedBytes: 76017,
      maxItems: 3342,
    },
  },
  {
    id: 'H09-removal',
    boundary: {
      maxSerializedBytes: 64936,
      maxItems: 2863,
    },
  },
  {
    id: 'H10-survivor',
    boundary: {
      maxSerializedBytes: 71112,
      maxItems: 3133,
    },
  },
  {
    id: 'H13-no-op',
    boundary: {
      maxSerializedBytes: 67575,
      maxItems: 2983,
    },
  },
  {
    id: 'H14-zero-facts',
    boundary: {
      maxSerializedBytes: 37100,
      maxItems: 1727,
    },
  },
  {
    id: 'H15-old-basis',
    boundary: {
      maxSerializedBytes: 67575,
      maxItems: 2983,
    },
  },
  {
    id: 'H16-declared-only',
    boundary: {
      maxSerializedBytes: 67575,
      maxItems: 2983,
    },
  },
  {
    id: 'H18-digest',
    boundary: {
      maxSerializedBytes: 67575,
      maxItems: 2983,
    },
  },
];
