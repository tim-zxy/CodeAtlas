import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
test('private Runtime genuine Source verifier API exists', async () => {
  const url = new URL('../dist/compilation-source.js', import.meta.url);
  assert.ok(existsSync(url));
  const api = await import(url.href);
  assert.equal(typeof api.createCompilationSourceVerifier, 'function');
});
import fs from 'node:fs/promises';
import path from 'node:path';
import { setup, makeAccount } from '../../source/test/fixtures/mixed-source-git-double.mjs';
import { openR010FixtureDatabase } from '../../storage/test/helpers/r011-history-fixture.mjs';
import {
  prepareCompilationSource,
  verifyCompilationSource,
  releaseCompilationSource,
} from '../../application/dist/compilation-source.js';
import { createCompilationSourceVerifier } from '../dist/compilation-source.js';
function policy() {
  return {
    operation: 'INDEX',
    phase: 'PRIMARY',
    scope: { workspaceId: 'workspace:a2', repositoryId: 'repo:a2' },
    callerCapabilities: ['INDEX', 'READ_SOURCE'],
    permissionContext: {
      workspaceId: 'workspace:a2',
      repositoryIds: ['repo:a2'],
      allowedOperations: ['INDEX', 'READ_SOURCE'],
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
async function context(t) {
  // Actual Source issuer, filesystem bytes and SQLite SourceState; the original
  // Git process double is used. Policy and ownedInputs are explicit substitutes.
  // Real Runtime-owned identity issuance has separate compilation-input tests.
  const f = await setup(t),
    db = await openR010FixtureDatabase(path.join(f.root, 'source.sqlite'), 'repo:a2', f.root);
  f.state.closeOwnedDatabase = () => db.close();
  f.request.config.exclude = ['source.sqlite', 'source.sqlite-*'];
  const account = makeAccount(f.control.signal).account;
  const prepared = await prepareCompilationSource({
    request: f.request,
    policy: policy(),
    sourceState: db.sourceState,
    account,
    control: f.control,
  });
  const state = db.sourceState.load('repo:a2');
  const identity = {
    rootPath: f.root,
    repoBasis: {
      repositoryId: state.revision.repositoryId,
      revisionId: state.revision.id,
      contentFingerprint: state.revision.contentFingerprint,
      codeActivationDigest: '0'.repeat(64),
    },
    targetSource: {
      repositoryId: state.revision.repositoryId,
      revisionId: state.revision.id,
      contentFingerprint: state.revision.contentFingerprint,
    },
    targetInventory: state.files,
  };
  const token = Object.freeze({}),
    stubOwners = new WeakMap([[token, identity]]);
  const ownedInputs = {
    repositorySourceIdentity(frame) {
      const value = stubOwners.get(Object.getOwnPropertyDescriptor(frame, 'handle')?.value);
      assert.ok(value, 'explicit ownedInputs token substitute refuses foreign handle');
      return value;
    },
  };
  const sources = new Map([['repo:a2', prepared.handle]]);
  const verifier = createCompilationSourceVerifier({ sources, ownedInputs });
  return { ...f, db, prepared, identity, sources, ownedInputs, verifier, frame: { handle: token } };
}
const request = { workspaceId: 'workspace:a2' };
test('Runtime binding uses actual Source issuer with explicit ownedInputs substitute and never releases it', async (t) => {
  const f = await context(t),
    before = f.db.sourceState.load('repo:a2');
  await f.verifier.verifySource(f.frame, request);
  assert.deepEqual(f.db.sourceState.load('repo:a2'), before);
  await verifyCompilationSource(f.prepared.handle, f.identity, request.workspaceId);
  releaseCompilationSource(f.prepared.handle); // The caller owns this lifetime.
  await assert.rejects(f.verifier.verifySource(f.frame, request), /SOURCE_CONTEXT_UNAVAILABLE/);
});
test('Source routing ignores caller capture DTO and retains its original source-handle map', async (t) => {
  const f = await context(t);
  let invoked = false;
  f.sources.set('repo:a2', {});
  await f.verifier.verifySource(
    {
      handle: f.frame.handle,
      get capture() {
        invoked = true;
        throw Error('private');
      },
    },
    request,
  );
  assert.equal(invoked, false);
  releaseCompilationSource(f.prepared.handle);
});
test('missing or fabricated Source contexts and foreign repository tokens refuse before Source work', async (t) => {
  const f = await context(t),
    calls = f.state.calls;
  const missing = createCompilationSourceVerifier({
    sources: new Map(),
    ownedInputs: f.ownedInputs,
  });
  await assert.rejects(missing.verifySource(f.frame, request), /SOURCE_CONTEXT_UNAVAILABLE/);
  const fabricated = createCompilationSourceVerifier({
    sources: new Map([['repo:a2', {}]]),
    ownedInputs: f.ownedInputs,
  });
  await assert.rejects(fabricated.verifySource(f.frame, request), /SOURCE_CONTEXT_UNAVAILABLE/);
  await assert.rejects(f.verifier.verifySource({ handle: {} }, request));
  assert.equal(f.state.calls, calls);
  releaseCompilationSource(f.prepared.handle);
});
test('Runtime passes workspace binding to actual verifier rather than trusting Source identity alone', async (t) => {
  const f = await context(t);
  await assert.rejects(
    f.verifier.verifySource(f.frame, { workspaceId: 'foreign' }),
    /SOURCE_CHANGED/,
  );
  releaseCompilationSource(f.prepared.handle);
});
test('actual Source byte mutation under unchanged SQLite revision refuses through Runtime binding', async (t) => {
  const f = await context(t),
    before = f.db.sourceState.load('repo:a2');
  await fs.writeFile(path.join(f.root, 'app.py'), 'pass\n');
  await assert.rejects(f.verifier.verifySource(f.frame, request), /SOURCE_CHANGED/);
  assert.deepEqual(f.db.sourceState.load('repo:a2'), before);
  releaseCompilationSource(f.prepared.handle);
});
test('async or accessor-based owned identity providers refuse without running them', () => {
  let invoked = false;
  assert.throws(() =>
    createCompilationSourceVerifier({
      sources: new Map(),
      ownedInputs: {
        get repositorySourceIdentity() {
          invoked = true;
          return () => {};
        },
      },
    }),
  );
  assert.throws(() =>
    createCompilationSourceVerifier({
      sources: new Map(),
      ownedInputs: { repositorySourceIdentity: async () => {} },
    }),
  );
  assert.equal(invoked, false);
});
