import { z } from 'zod';

import { EntityIdSchema } from './ids.js';
import { RepositoryRootPathSchema } from './source-identity.js';

export const RepositorySchema = z.strictObject({
  id: EntityIdSchema,
  rootPath: RepositoryRootPathSchema,
});
export type Repository = z.infer<typeof RepositorySchema>;
