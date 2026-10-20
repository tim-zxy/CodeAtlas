// Synthetic application receipt only. No Native admission, SQLite publication,
// or actual indexing acceptance is performed by this test adapter.
import { readFile } from 'node:fs/promises';
import {
  parseIndexRequest,
  parseIndexResult,
} from '../../../../packages/application/dist/index.js';
export {
  IndexCommandError,
  parseIndexConfiguration,
  parseIndexRequest,
} from '../../../../packages/application/dist/index.js';

export async function runIndexCommand(input) {
  const request = parseIndexRequest(input);
  if (request.operation !== 'FULL') throw new Error('Unexpected synthetic command');
  const vectors = JSON.parse(
    await readFile(
      new URL(
        '../../../../fixtures/indexing/phase05-index-cli/expected/results.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  return parseIndexResult(vectors.full);
}
