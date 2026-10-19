#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createBootstrapRuntimeBuilder, type KnowledgeRuntime } from '@codeatlas/runtime';
import { runCodeQueryCommand } from './code-query-command.js';
import { runIndexCommandLine } from './index-command.js';

export async function buildCliRuntime(workspaceRoot = process.cwd()): Promise<KnowledgeRuntime> {
  return createBootstrapRuntimeBuilder().build({
    configVersion: 1,
    mode: 'ONE_SHOT',
    workspaceRoot,
  });
}

export async function runCli(args = process.argv.slice(2)): Promise<number> {
  if (args.length === 1 && args[0] === '--smoke') {
    await buildCliRuntime();
    process.stdout.write('codeatlas-cli:ready\n');
    return 0;
  }

  return args[0] === 'index' ? runIndexCommandLine(args) : runCodeQueryCommand(args);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
