import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { mock } from 'node:test';
import * as actual from '../helpers/phase05-evaluation-fixture.mjs';

// Control-flow fault boundary only. Real Git/SQLite/receipt/public Runtime work
// is delegated unchanged; no admission/profile or Native success is simulated.
mock.module(new URL('../helpers/phase05-evaluation-fixture.mjs', import.meta.url), {
  exports: {
    ...actual,
    async runPhase05IndexTrial(input) {
      const root = path.dirname(input.receiptDirectory);
      if (input.priorReceipts.some((receipt) => !receipt.receiptPath.startsWith(root + path.sep)))
        throw new Error('Unrelated case cannot be a replay prerequisite.');
      return actual.runPhase05IndexTrial(input);
    },
  },
});
const { runPhase05Evaluation } = await import('../evaluate-phase05.mjs');
const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
const result = await runPhase05Evaluation(input);
const report = JSON.parse(await readFile(result.reportPath, 'utf8'));
assert.equal(
  report.observations.filter((row) => row.failure?.code === 'RESOURCE_LIMIT_EXCEEDED').length,
  28,
  JSON.stringify(
    report.observations
      .filter((row) => row.status === 'FAILED' && row.failure?.code !== 'RESOURCE_LIMIT_EXCEEDED')
      .map((row) => ({ runKey: row.runKey, failure: row.failure, artifacts: row.artifactDigests })),
  ),
);
process.stdout.write(
  JSON.stringify({ rawPublicRefusals: 28, unrelatedCaseDependency: false }) + '\n',
);
