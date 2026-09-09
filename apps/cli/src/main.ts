#!/usr/bin/env node

const smokeRequested = process.argv.length === 3 && process.argv[2] === '--smoke';

if (smokeRequested) {
  process.stdout.write('codeatlas-cli:ready\n');
} else {
  process.stderr.write('codeatlas CLI behavior is not implemented in P0-W0-001\n');
  process.exitCode = 2;
}
