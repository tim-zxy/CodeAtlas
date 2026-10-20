import {
  CodeQueryError,
  createQueryControl,
  executeCodeQuery,
  parseCodeQueryRequest,
} from '../../application/dist/index.js';
import type { CodeQueryRequest, CodeReadPort } from '../../application/dist/index.js';
import { openRepositoryCodeQuery, StorageCodeQueryError } from '../../storage/dist/index.js';

export async function runCodeQuery(
  input: { databasePath: string; query: CodeQueryRequest },
  options: { signal?: AbortSignal } = {},
): ReturnType<typeof executeCodeQuery> {
  if (input === null || typeof input !== 'object') throw new CodeQueryError('INVALID_QUERY');
  const request = parseCodeQueryRequest(input.query);
  const control = createQueryControl(request.budget, options.signal);
  let session;
  try {
    await control.checkpoint();
    session = await openRepositoryCodeQuery(input.databasePath, request.repositoryId, control);
    const port = session satisfies CodeReadPort;
    return await executeCodeQuery(request, port, control);
  } catch (error) {
    if (error instanceof CodeQueryError) throw error;
    if (error instanceof StorageCodeQueryError) throw new CodeQueryError(error.code);
    throw new CodeQueryError('QUERY_DATA_INVALID');
  } finally {
    session?.close();
  }
}

export {
  CodeQueryError,
  parseCodeQueryRequest,
  parseCodeQueryEnvelope,
} from '../../application/dist/index.js';
export type {
  CodeQueryRequest,
  CodeQueryPayload,
  QueryBudget,
} from '../../application/dist/index.js';
