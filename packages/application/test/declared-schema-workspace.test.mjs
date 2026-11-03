import test from 'node:test';
import assert from 'node:assert/strict';
import * as a from '../dist/refresh-workspace-runtime.js';
import { fixture, control } from '../../contracts/test/fixtures/declared-schema.mjs';
const request = () => ({
  workspaceId: 'workspace:one',
  repositoryId: null,
  control: control(),
  policy: {
    operation: 'INDEX',
    phase: 'PRIMARY',
    scope: { workspaceId: 'workspace:one', repositoryId: null },
    callerCapabilities: ['INDEX'],
    permissionContext: {
      workspaceId: 'workspace:one',
      repositoryIds: null,
      allowedOperations: ['INDEX'],
    },
    source: {
      path: null,
      classification: 'INTERNAL',
      form: 'DERIVED',
      secretDetected: false,
      policyBlocked: false,
      derivedAccessAllowed: true,
    },
    destination: 'LOCAL',
    settings: {
      localOnly: true,
      remoteLlmEnabled: false,
      remoteEmbeddingEnabled: false,
      allowRemoteFallback: false,
      allowSensitiveRemote: false,
      allowRawSourceRemote: false,
    },
  },
});
test('workspace V2 authorizes before preparation and never applies partial or cancelled candidates', async () => {
  assert.equal(typeof a.refreshWorkspaceRuntimeV2, 'function');
  let read = 0,
    write = 0;
  const r = request(),
    ports = {
      prepare: async () => {
        read++;
        return {
          expectedOldActivationId: null,
          frozen: fixture(),
          matches: [],
          execution: {
            payload: {
              coverage: {
                status: 'PARTIAL',
                limitations: ['SCHEMA_COMPATIBILITY_UNPROVEN'],
                unverifiedRefs: [],
              },
            },
          },
        };
      },
      apply: () => write++,
    };
  r.policy.callerCapabilities = [];
  await assert.rejects(a.refreshWorkspaceRuntimeV2(r, ports));
  assert.equal(read, 0);
  const partial = await a.refreshWorkspaceRuntimeV2(request(), ports);
  assert.equal(partial.reason, 'PARTIAL');
  assert.equal(write, 0);
  const cancelled = request();
  cancelled.control.signal = new AbortController().signal;
  const c = new AbortController();
  c.abort();
  cancelled.control.signal = c.signal;
  assert.equal((await a.refreshWorkspaceRuntimeV2(cancelled, ports)).reason, 'CANCELLED');
  assert.equal(read, 1);
});
