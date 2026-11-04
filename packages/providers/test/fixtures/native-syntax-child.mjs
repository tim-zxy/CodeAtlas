import { readFile } from 'node:fs/promises';
const [mode, file] = process.argv.slice(2);
for await (const chunk of process.stdin) {
}
if (mode === 'hold') {
  setInterval(() => {}, 1000);
} else {
  if (process.env.CODEATLAS_SYNTAX_TEST_SECRET) process.stderr.write('LEAK');
  let b = await readFile(file);
  if (mode === 'corrupt') b = Buffer.from(b.toString().replace('/items', '/changed'));
  if (mode === 'truncate') b = Buffer.from(b.toString().split('\n').slice(0, -2).join('\n') + '\n');
  if (mode === 'post-terminal') b = Buffer.concat([b, b]);
  process.stdout.write(b);
}
