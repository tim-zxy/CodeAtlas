import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const api = async () => {
  const u = new URL('../dist/refresh-runtime-facts.js', import.meta.url);
  assert.ok(fs.existsSync(u), 'Application refresh workflow must exist');
  return import(u.href);
};
const basis = {
  repositoryId: 'repo:owned',
  revisionId: 'rev:owned',
  contentFingerprint: 'owned',
  codeActivationDigest: 'a'.repeat(64),
};
const identity = {
  codeBasis: basis,
  syntaxActivationId: 'syntax:owned',
  syntaxMembershipDigest: 'b'.repeat(64),
  runtimeActivationId: null,
};
const control = () => ({
  maxItems: 10000,
  maxDepth: 20,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
});
export function policy(operation = 'INDEX') {
  return {
    operation,
    phase: 'PRIMARY',
    scope: { workspaceId: 'workspace:owned', repositoryId: 'repo:owned' },
    callerCapabilities: [operation],
    permissionContext: {
      workspaceId: 'workspace:owned',
      repositoryIds: ['repo:owned'],
      allowedOperations: [operation],
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
  };
}
const candidate = () => ({
  facts: {
    schema: 'codeatlas.runtime-fact-set',
    version: 1,
    payload: {
      basis,
      externalRefs: [],
      supportInventory: [],
      entryPoints: [],
      tasks: [],
      dataResources: [],
      triggers: [],
      contracts: [],
      contexts: [],
      nodes: [],
      edges: [],
      flows: [],
    },
  },
  bindings: {
    schema: 'codeatlas.framework-binding-set',
    version: 1,
    payload: { basis, externalRefs: [], supportInventory: [], bindings: [] },
  },
  coverage: { status: 'COMPLETE', limitations: [], unverifiedRefs: [] },
  termination: 'COMPLETE',
});
test('Application authorization precedes capture; partial and cancellation never publish', async () => {
  const { refreshRuntimeFacts } = await api();
  let read = 0,
    write = 0;
  const ports = {
    capture: () => {
      read++;
      return { status: 'AVAILABLE', identity };
    },
    derive: async () => candidate(),
    apply: () => {
      write++;
      return { status: 'COMMITTED', activationId: 'runtime:one' };
    },
  };
  const req = {
    workspaceId: 'workspace:owned',
    repositoryId: 'repo:owned',
    policy: policy(),
    control: control(),
  };
  const denied = structuredClone(req.policy);
  denied.callerCapabilities = [];
  await assert.rejects(refreshRuntimeFacts({ ...req, policy: denied }, ports), /PERMISSION_DENIED/);
  assert.equal(read, 0);
  const partial = {
    ...ports,
    derive: async () => ({
      ...candidate(),
      coverage: { status: 'PARTIAL', limitations: ['UNPROVED'], unverifiedRefs: [] },
    }),
  };
  assert.equal((await refreshRuntimeFacts(req, partial)).status, 'NOT_PUBLISHED');
  assert.equal(write, 0);
  const ac = new AbortController();
  ac.abort();
  assert.equal(
    (await refreshRuntimeFacts({ ...req, control: { ...control(), signal: ac.signal } }, ports))
      .reason,
    'CANCELLED',
  );
  assert.equal(write, 0);
  assert.equal((await refreshRuntimeFacts(req, ports)).status, 'COMMITTED');
  assert.equal(write, 1);
});
test('trace uses QUERY policy and only its read port', async () => {
  await api();
  const { traceRuntime } = await import('../dist/trace-runtime.js');
  let reads = 0;
  const out = traceRuntime(
    {
      workspaceId: 'workspace:owned',
      repositoryId: 'repo:owned',
      policy: policy('QUERY'),
      control: control(),
    },
    {
      read: () => {
        reads++;
        return { status: 'AFFECTED', activationId: 'runtime:old' };
      },
    },
  );
  assert.equal(out.status, 'AFFECTED');
  assert.equal(reads, 1);
});
