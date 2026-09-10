import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { buildCliRuntime } from '../apps/cli/dist/main.js';
import { buildMcpRuntime } from '../apps/mcp/dist/main.js';
import { KnowledgeRuntime } from '../packages/runtime/dist/index.js';
test('CLI and MCP construct the same KnowledgeRuntime contract',async()=>{const workspaceRoot=path.join(process.cwd(),'fixtures','runtime-bootstrap');const cli=await buildCliRuntime(workspaceRoot);const mcp=await buildMcpRuntime(workspaceRoot);assert.ok(cli instanceof KnowledgeRuntime);assert.ok(mcp instanceof KnowledgeRuntime);assert.equal(cli.kind,'KnowledgeRuntime');assert.equal(mcp.kind,'KnowledgeRuntime');assert.equal(cli.config.mode,'ONE_SHOT');assert.equal(mcp.config.mode,'MCP_STDIO');assert.deepEqual(cli.workspace,mcp.workspace);assert.equal(cli.workspace.kind,'WORKSPACE_CONTEXT_PLACEHOLDER');assert.equal(cli.workspace.workspaceRoot,path.resolve(workspaceRoot));});
