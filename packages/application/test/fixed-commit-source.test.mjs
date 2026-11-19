import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { createFixedCommitSourceReader } from '../dist/fixed-commit-source.js';
import { makeAccount } from '../../source/test/fixtures/mixed-source-git-double.mjs';

const workspaceId = 'workspace:owned',
  repository = { id: 'repo:owned', rootPath: resolve('invalid-owned-path') };
const commitOid = 'a'.repeat(40);
const selected = 'contracts/events.contract';
function ownedGrant(path) {
  return {
    repository,
    commitOid,
    policy: {
      operation: 'READ_SOURCE',
      phase: 'PRIMARY',
      destination: 'LOCAL',
      scope: { workspaceId, repositoryId: repository.id },
      callerCapabilities: ['READ_SOURCE'],
      permissionContext: {
        workspaceId,
        repositoryIds: [repository.id],
        allowedOperations: ['READ_SOURCE'],
      },
      source: {
        path,
        form: 'RAW',
        classification: 'INTERNAL',
        secretDetected: false,
        policyBlocked: false,
        derivedAccessAllowed: false,
      },
      settings: {
        localOnly: true,
        remoteLlmEnabled: false,
        remoteEmbeddingEnabled: false,
        allowRemoteFallback: false,
        allowSensitiveRemote: false,
        allowRawSourceRemote: false,
      },
    },
  };
}
function reader(currentGrant) {
  return createFixedCommitSourceReader({
    workspaceId,
    repository,
    commitOid,
    maxObjectBytes: 16384,
    currentGrant,
  });
}
test('fixed commit read requires a current per-path raw grant for the pinned repository and commit', async () => {
  for (const [change, code] of [
    [(g) => ({ ...g, commitOid: 'b'.repeat(40) }), 'PERMISSION_DENIED'],
    [
      (g) => ({ ...g, repository: { ...repository, rootPath: resolve('other-owned-path') } }),
      'PERMISSION_DENIED',
    ],
    [
      (g) => ({
        ...g,
        policy: { ...g.policy, scope: { ...g.policy.scope, repositoryId: 'repo:other' } },
      }),
      'PERMISSION_DENIED',
    ],
    [
      (g) => ({
        ...g,
        policy: { ...g.policy, source: { ...g.policy.source, path: 'contracts/other.contract' } },
      }),
      'PERMISSION_DENIED',
    ],
    [
      (g) => ({
        ...g,
        policy: { ...g.policy, source: { ...g.policy.source, classification: 'SECRET' } },
      }),
      'SECURITY_POLICY_BLOCKED',
    ],
    [(g) => ({ ...g, policy: { ...g.policy, callerCapabilities: [] } }), 'PERMISSION_DENIED'],
  ]) {
    const { account, usage } = makeAccount();
    await assert.rejects(reader((p) => change(ownedGrant(p)))([selected], account), {
      message: code,
    });
    assert.equal(usage.invalid, true);
    assert.equal(usage.reads, 0);
  }
});
test('fixed commit read rechecks the live grant at the Source access boundary', async () => {
  let calls = 0;
  const { account, usage } = makeAccount();
  await assert.rejects(reader((p) => (++calls === 1 ? ownedGrant(p) : null))([selected], account), {
    message: 'PERMISSION_DENIED',
  });
  assert.equal(calls, 2);
  assert.equal(usage.reads, 0);
  assert.equal(usage.invalid, true);
});
