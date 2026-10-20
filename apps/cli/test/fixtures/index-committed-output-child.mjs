import { registerHooks } from 'node:module';
import path from 'node:path';

const entry = new URL('../../dist/index-command.js', import.meta.url).href;
const adapter = new URL('./index-committed-runtime.mjs', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@codeatlas/runtime' && context.parentURL === entry)
      return { url: adapter, shortCircuit: true };
    return next(specifier, context);
  },
});
const { runIndexCommandLine } = await import(entry);
process.exitCode = await runIndexCommandLine([
  'index',
  'full',
  '--database',
  path.join(path.dirname(process.argv[2]), 'synthetic.sqlite'),
  '--repository',
  'fixture-repo',
  '--root',
  'synthetic-root',
  '--native',
  'synthetic-native',
  '--config',
  process.argv[2],
  '--initialize',
]);
