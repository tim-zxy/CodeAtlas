// Private preparation ranges only; no current-boundary or admission authority.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { refreshCiLayoutRootForRevision } from '../../../../scripts/helpers/native-refresh-ci-layout.mjs';

const data = JSON.parse(
  readFileSync(new URL('./native-refresh-r5-preparation-scope.json', import.meta.url), 'utf8'),
);
const scopes = new Map();
for (const { family, accepted, next } of data.sources) {
  const scope = Object.freeze({ accepted, next });
  if (scopes.has(family)) assert.deepEqual(scopes.get(family), scope);
  else scopes.set(family, scope);
}
const executablePath = path.join(
  refreshCiLayoutRootForRevision('p05-d5-exact-layout-v5'),
  'native',
  'codeatlas-native-analyzer.exe',
);
export function r5PreparationScope(family, dContext) {
  if (dContext?.executablePath !== executablePath) return null;
  assert.ok(scopes.has(family), 'Unknown R5 preparation family');
  return scopes.get(family);
}
