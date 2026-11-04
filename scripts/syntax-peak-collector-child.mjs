// OS acquisition conformance only. Never analyzes Source or selects a profile.
const mode = process.argv[2];
if (mode === 'short') {
  process.stdout.write('DONE');
} else if (mode === 'ready') {
  process.stdout.write('READY\n');
  process.stdin.once('data', () => {
    process.stdout.write('DONE');
    process.stdin.destroy();
  });
} else {
  process.exitCode = 2;
}
