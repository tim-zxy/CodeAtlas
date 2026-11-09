// Self-owned temporary SQLite only, fixture token counter, no production authority.
import { setup } from '../../../packages/agent-api/test/helpers/knowledge-search-fixture.mjs';
import { createOwnedKnowledgeSearchMcpServer } from '../dist/owned-business-stdio.js';
const f = await setup();
const app = createOwnedKnowledgeSearchMcpServer(
  {
    session: f.api,
    limits: {
      maxMessageBytes: 2000000,
      maxConcurrentCalls: 2,
      maxItems: 1000000,
      maxDepth: 100,
      requestTimeoutMs: 10000,
    },
  },
  { input: process.stdin, output: process.stdout },
);
await app.start();
const result = await app.completion;
f.close();
process.stderr.write('OWNED_SEARCH_' + result.cleanupState + '\n');
