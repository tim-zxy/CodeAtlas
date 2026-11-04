import test from 'node:test';
import assert from 'node:assert/strict';
import * as execution from '../dist/stitch-workspace.js';
import { fixture, control } from '../../contracts/test/fixtures/declared-schema.mjs';
test('V3 stitch cancellation retains partial evidence and never accepts supplied MATCHED claims', () => {
  assert.equal(typeof execution.stitchWorkspaceExecutionV3, 'function');
  const a = new AbortController();
  a.abort();
  const out = execution.stitchWorkspaceExecutionV3(
    { frozenBindings: fixture(), graphs: [], matches: [{ forged: true }] },
    control({ signal: a.signal }),
  );
  assert.equal(out.termination, 'CANCELLED');
  assert.equal(out.execution.payload.coverage.status, 'PARTIAL');
  assert.equal(out.execution.payload.edges.length, 0);
  assert.equal(out.matches.length, 0);
  assert(out.consumed.items > 0);
});
