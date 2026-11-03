import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mixedAnalysisTestRoot } from './mixed-analysis-test-root.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  w = path.join(root, '.superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure'),
  [label, ...args] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(label) || !args.length) throw Error('invalid task command');
const dbroot = mixedAnalysisTestRoot(root);
fs.mkdirSync(dbroot, { recursive: true });
const real = fs.realpathSync(dbroot);
if (path.relative(path.resolve(dbroot), real) !== '') throw Error('unsafe test root');
const out = fs.openSync(path.join(w, label + '.log'), 'wx'),
  err = fs.openSync(path.join(w, label + '.stderr.log'), 'wx');
const begin = Date.now(),
  child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, TMP: real, TEMP: real },
    stdio: ['ignore', out, err],
  });
child.once('error', (e) => {
  console.error(e.code);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  fs.closeSync(out);
  fs.closeSync(err);
  const receipt = { label, args, code, signal, elapsedMs: Date.now() - begin, isolatedRoot: real };
  fs.writeFileSync(path.join(w, label + '.run.json'), JSON.stringify(receipt, null, 2) + '\n', {
    flag: 'wx',
  });
  console.log(JSON.stringify(receipt));
  console.log(
    fs
      .readFileSync(path.join(w, label + '.log'), 'utf8')
      .split(/\r?\n/)
      .slice(-14)
      .join('\n'),
  );
  if (code !== 0)
    console.log(fs.readFileSync(path.join(w, label + '.stderr.log'), 'utf8').slice(-3000));
  process.exitCode = code ?? 1;
});
