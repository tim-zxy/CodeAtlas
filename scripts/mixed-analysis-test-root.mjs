import path from 'node:path';
const suffix = path.join(
  '.superpowers',
  'sdd',
  '2026-10-26-phase1-b1b-local-canonical-history-closure',
  'isolated-tests',
);
/** Keep nested data-only reproductions inside their already approved outer test root. */
export function mixedAnalysisTestRoot(workspaceRoot) {
  const root = path.resolve(workspaceRoot);
  for (let current = root; path.dirname(current) !== current; current = path.dirname(current)) {
    if (current.endsWith(path.sep + suffix)) return current;
  }
  return path.join(root, suffix);
}
