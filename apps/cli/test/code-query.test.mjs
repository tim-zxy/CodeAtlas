import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { withCodeQueryDatabase } from '../../../packages/storage/test/helpers/code-query-fixture.mjs';
const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const expected = JSON.parse(
  await readFile(
    new URL('../../../fixtures/queries/code-query/expected/results.json', import.meta.url),
    'utf8',
  ),
);
const limits = [
  '--max-nodes',
  '100',
  '--max-edges',
  '100',
  '--max-metadata-rows',
  '10000',
  '--max-result-bytes',
  '1000000',
  '--timeout-ms',
  '10000',
];
function execute(args) {
  return spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', windowsHide: true });
}
test('actual CLI supports search, understand and code trace over validated SQLite', async (t) => {
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId, symbolIds }) => {
    const common = ['--database', databasePath, '--repository', repositoryId, ...limits];
    for (const [args, inspect] of [
      [
        ['understand', ...common, '--name', 'run'],
        (value) =>
          assert.deepEqual(
            value.symbols.map((node) => node.id),
            expected.searchRun,
          ),
      ],
      [
        ['understand', ...common, '--symbol', symbolIds.root],
        (value) =>
          assert.deepEqual(
            value.outgoing.map((edge) => edge.id),
            expected.understandRootOutgoing,
          ),
      ],
      [
        ['trace', ...common, '--symbol', symbolIds.root, '--max-depth', '5'],
        (value) =>
          assert.deepEqual(
            value.edges.map((edge) => edge.id),
            expected.traceRootEdges,
          ),
      ],
    ]) {
      const child = execute(args);
      assert.equal(child.status, 0, child.stderr);
      const result = JSON.parse(child.stdout);
      assert.equal(result.schema, 'code-query-result');
      assert.equal(result.version, 1);
      assert.equal(child.stdout.endsWith('\n'), true);
      assert.ok(result.payload.warnings.includes('WORKTREE_NOT_OBSERVED'));
      inspect(result.payload);
    }
  });
});
for (const args of [
  ['understand'],
  ['trace'],
  ['understand', '--database', 'x', '--database', 'y'],
  ['understand', '--unknown', 'x'],
]) {
  test(`actual CLI usage error is controlled JSON for ${args.join(' ')}`, () => {
    const child = execute(args);
    assert.equal(child.status, 2);
    assert.equal(child.stdout, '');
    assert.equal(JSON.parse(child.stderr).code, 'INVALID_QUERY');
  });
}
test('actual CLI missing database fails without successful empty response', () => {
  const child = execute([
    'understand',
    '--database',
    'missing-query-database',
    '--repository',
    'repo',
    '--name',
    'x',
    ...limits,
  ]);
  assert.equal(child.status, 1);
  assert.equal(child.stdout, '');
  assert.equal(JSON.parse(child.stderr).code, 'DATABASE_UNAVAILABLE');
  assert.ok(!child.stderr.includes('ENOENT'));
});
test('repeated in-process CLI calls remove signal and output listeners', async (t) => {
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId, symbolIds }) => {
    const args = [
      'understand',
      '--database',
      databasePath,
      '--repository',
      repositoryId,
      '--symbol',
      symbolIds.root,
      ...limits,
    ];
    const source = `import {runCli} from ${JSON.stringify(new URL('../dist/main.js', import.meta.url).href)};
      const initial=[process.listenerCount('SIGINT'),process.stdout.listenerCount('error')];
      for(let i=0;i<2;i++)if(await runCli(${JSON.stringify(args)})!==0)process.exitCode=1;
      process.stderr.write(JSON.stringify({initial,final:[process.listenerCount('SIGINT'),process.stdout.listenerCount('error')]}));`;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(child.status, 0, child.stderr);
    const counts = JSON.parse(child.stderr);
    assert.deepEqual(counts.final, counts.initial);
    assert.equal(child.stdout.trim().split('\n').length, 2);
  });
});
test('failed output delivery produces failure without raw pipe exception', async (t) => {
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId, symbolIds }) => {
    const args = [
      'understand',
      '--database',
      databasePath,
      '--repository',
      repositoryId,
      '--symbol',
      symbolIds.root,
      ...limits,
    ];
    const source = `import {runCli} from ${JSON.stringify(new URL('../dist/main.js', import.meta.url).href)};
      process.stdout.write=(chunk,encoding,callback)=>{const error=new Error('secret pipe exception');queueMicrotask(()=>{callback(error);process.stdout.emit('error',error)});return false};
      process.exitCode=await runCli(${JSON.stringify(args)});`;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(child.status, 1);
    assert.equal(child.stdout, '');
    assert.equal(JSON.parse(child.stderr).code, 'QUERY_DATA_INVALID');
    assert.ok(!child.stderr.includes('secret pipe exception'));
  });
});
test('SIGINT during query maps to cancellation and removes its handler', async (t) => {
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId, symbolIds }) => {
    const args = [
      'understand',
      '--database',
      databasePath,
      '--repository',
      repositoryId,
      '--symbol',
      symbolIds.root,
      ...limits,
    ];
    const source = `import {runCli} from ${JSON.stringify(new URL('../dist/main.js', import.meta.url).href)};
      const originalOn=process.on;process.on=function(name,listener){const result=Reflect.apply(originalOn,this,[name,listener]);if(name==='SIGINT')queueMicrotask(()=>process.emit('SIGINT'));return result};
      process.exitCode=await runCli(${JSON.stringify(args)});`;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(child.status, 130);
    assert.equal(child.stdout, '');
    assert.equal(JSON.parse(child.stderr).code, 'QUERY_CANCELLED');
  });
});
test('help output failure returns controlled delivery failure', () => {
  const source = `import {runCli} from ${JSON.stringify(new URL('../dist/main.js', import.meta.url).href)};
    process.stdout.write=(chunk,encoding,callback)=>{const error=new Error('secret help sink exception');queueMicrotask(()=>{callback(error);process.stdout.emit('error',error)});return false};
    process.exitCode=await runCli(['--help']);`;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(child.status, 1);
  assert.ok(!child.stderr.includes('secret help sink exception'));
  assert.ok(!child.stderr.includes('code-query-command.js'));
});
test('failed usage diagnostic resolves to a failure code instead of rejecting', () => {
  const source = `import {runCli} from ${JSON.stringify(new URL('../dist/main.js', import.meta.url).href)};
    process.stderr.write=(chunk,encoding,callback)=>{const error=new Error('secret diagnostic sink exception');queueMicrotask(()=>{callback(error);process.stderr.emit('error',error)});return false};
    let result;try{result={exit:await runCli([])}}catch(error){result={rejected:true,message:error.message}};
    process.stdout.write(JSON.stringify(result));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(child.status, 0);
  assert.deepEqual(JSON.parse(child.stdout), { exit: 1 });
});
test('actual child-process stdout pipe closure does not leak an exception', async () => {
  const child = spawn(process.execPath, [entry, '--help'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.destroy();
  child.stderr.setEncoding('utf8');
  let diagnostic = '';
  child.stderr.on('data', (chunk) => {
    diagnostic += chunk;
  });
  const [status] = await once(child, 'close');
  assert.equal(status, 1);
  assert.ok(!diagnostic.includes('Error:'));
  assert.ok(!diagnostic.includes('code-query-command.js'));
});
test('cancellation after a live SQL root read closes the read session', async (t) => {
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId, symbolIds }) => {
    const args = [
      'understand',
      '--database',
      databasePath,
      '--repository',
      repositoryId,
      '--symbol',
      symbolIds.root,
      ...limits,
    ];
    const source = `import {DatabaseSync} from 'node:sqlite';import {runCli} from ${JSON.stringify(new URL('../dist/main.js', import.meta.url).href)};
      const prepare=DatabaseSync.prototype.prepare,close=DatabaseSync.prototype.close;let ready=false,closed=0;
      DatabaseSync.prototype.prepare=function(...args){const statement=Reflect.apply(prepare,this,args),get=statement.get;statement.get=function(...args){const row=Reflect.apply(get,this,args);if(!ready&&row?.id==='query-node-root'){ready=true;queueMicrotask(()=>process.emit('SIGINT'))}return row};return statement};
      DatabaseSync.prototype.close=function(){closed++;return Reflect.apply(close,this,[])};
      const exit=await runCli(${JSON.stringify(args)});process.stdout.write(JSON.stringify({exit,ready,closed,handlers:process.listenerCount('SIGINT')}));`;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), { exit: 130, ready: true, closed: 1, handlers: 0 });
    assert.equal(JSON.parse(child.stderr).code, 'QUERY_CANCELLED');
  });
});
