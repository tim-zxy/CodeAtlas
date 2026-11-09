// Self-owned metadata fixture only, no production authority/tokenizer/Source/model.
import { setup } from '../../../packages/agent-api/test/helpers/project-context-fixture.mjs';
import { createOwnedProjectContextMcpServer } from '../dist/owned-business-stdio.js';
const f = await setup();
const app = createOwnedProjectContextMcpServer(
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
process.stderr.write('OWNED_L0_' + result.cleanupState + '\n');
