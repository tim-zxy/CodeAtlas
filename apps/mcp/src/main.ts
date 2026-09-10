#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createBootstrapRuntimeBuilder, type KnowledgeRuntime } from '@codeatlas/runtime';

export async function buildMcpRuntime(workspaceRoot = process.cwd()): Promise<KnowledgeRuntime> {
  return createBootstrapRuntimeBuilder().build({
    configVersion: 1,
    mode: 'MCP_STDIO',
    workspaceRoot,
  });
}

export async function runMcp(args = process.argv.slice(2)): Promise<number> {
  if (args.length === 1 && args[0] === '--smoke') {
    await buildMcpRuntime();
    process.stderr.write('codeatlas-mcp:ready\n');
    return 0;
  }

  process.stderr.write('codeatlas MCP behavior is not implemented in P0-W0-003\n');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runMcp();
}
