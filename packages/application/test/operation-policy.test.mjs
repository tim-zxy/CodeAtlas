import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as application from '../dist/index.js';
const input = JSON.parse(
  await readFile(
    new URL('../../../fixtures/phase1/security-config/inputs/policy.json', import.meta.url),
    'utf8',
  ),
);
const fresh = () => structuredClone(input);
function decide(x) {
  assert.equal(typeof application.authorizeOperation, 'function', 'Missing operation policy');
  return application.authorizeOperation(x);
}
function deny(change, code) {
  const x = fresh();
  change(x);
  assert.deepEqual(decide(x), { allowed: false, code, fallbackAllowed: false });
}
test('bounded local query allowed with unchanged input', () => {
  const x = fresh();
  assert.deepEqual(decide(x), { allowed: true, code: 'ALLOWED', fallbackAllowed: false });
  assert.deepEqual(x, input);
});
test('query-does-not-authorize-update', () =>
  deny((x) => {
    x.operation = 'UPDATE_KNOWLEDGE';
    x.callerCapabilities = ['QUERY'];
  }, 'PERMISSION_DENIED'));
test('permission context independently denies write', () =>
  deny((x) => {
    x.operation = 'UPDATE_KNOWLEDGE';
    x.permissionContext.allowedOperations = ['QUERY'];
  }, 'PERMISSION_DENIED'));
test('scope does not escape workspace or repository', () => {
  deny((x) => (x.scope.workspaceId = 'other'), 'PERMISSION_DENIED');
  deny((x) => (x.scope.repositoryId = 'other'), 'PERMISSION_DENIED');
  deny((x) => (x.scope.repositoryId = null), 'PERMISSION_DENIED');
});
test('local-only-denies-remote-on-repair', () =>
  deny((x) => {
    x.operation = 'REMOTE_LLM';
    x.phase = 'REPAIR';
    x.destination = 'REMOTE';
    x.settings.remoteLlmEnabled = true;
  }, 'REMOTE_DISABLED'));
test('remote model and embedding opt-ins are distinct', () => {
  deny((x) => {
    x.operation = 'REMOTE_LLM';
    x.destination = 'REMOTE';
    x.settings.localOnly = false;
  }, 'REMOTE_DISABLED');
  deny((x) => {
    x.operation = 'REMOTE_EMBEDDING';
    x.destination = 'REMOTE';
    x.settings.localOnly = false;
    x.settings.remoteLlmEnabled = true;
  }, 'REMOTE_DISABLED');
});
test('security block cannot authorize fallback', () =>
  deny((x) => {
    x.operation = 'REMOTE_LLM';
    x.phase = 'FALLBACK';
    x.destination = 'REMOTE';
    x.settings.localOnly = false;
    x.settings.remoteLlmEnabled = true;
    x.settings.allowRemoteFallback = true;
    x.source.policyBlocked = true;
  }, 'SECURITY_POLICY_BLOCKED'));
test('detected secrets remain blocked even in derived form', () =>
  deny((x) => (x.source.secretDetected = true), 'SECRET_DETECTED'));
test('raw secret source denied and safe local projection independently allowed', () => {
  deny((x) => {
    x.source.classification = 'SECRET';
    x.source.form = 'RAW';
  }, 'SECURITY_POLICY_BLOCKED');
  const x = fresh();
  x.source.classification = 'SECRET';
  x.source.path = '.env';
  assert.equal(decide(x).allowed, true);
});
test('secret-file default deny has no permission override', () => {
  for (const p of ['.env.production', 'secrets/config.json', '.ssh/id_rsa', 'cert/private.pem'])
    deny((x) => {
      x.operation = 'READ_SOURCE';
      x.source.path = p;
      x.source.form = 'RAW';
    }, 'SECURITY_POLICY_BLOCKED');
});
test('remote raw source needs explicit data permission', () => {
  deny((x) => {
    x.operation = 'REMOTE_LLM';
    x.destination = 'REMOTE';
    x.settings.localOnly = false;
    x.settings.remoteLlmEnabled = true;
    x.source.form = 'RAW';
  }, 'SECURITY_POLICY_BLOCKED');
});
test('sensitive remote data requires independent opt-in', () =>
  deny((x) => {
    x.operation = 'REMOTE_LLM';
    x.destination = 'REMOTE';
    x.settings.localOnly = false;
    x.settings.remoteLlmEnabled = true;
    x.source.classification = 'SENSITIVE';
  }, 'SECURITY_POLICY_BLOCKED'));
test('authorized remote derived data can be allowed without fallback', () => {
  const x = fresh();
  x.operation = 'REMOTE_LLM';
  x.destination = 'REMOTE';
  x.settings.localOnly = false;
  x.settings.remoteLlmEnabled = true;
  assert.equal(decide(x).allowed, true);
});
test('query is not a remote transmission capability', () =>
  deny((x) => {
    x.destination = 'REMOTE';
    x.settings.localOnly = false;
    x.settings.remoteLlmEnabled = true;
  }, 'SECURITY_POLICY_BLOCKED'));
test('unsafe paths and malformed policy shapes refused', () => {
  for (const path of ['../secret', 'C:/secret', 'a\\\\b']) {
    const x = fresh();
    x.source.path = path;
    assert.throws(
      () => decide(x),
      (e) => e.code === 'POLICY_INPUT_INVALID',
    );
  }
  const x = fresh();
  x.secret = 'NEVER_ECHO';
  assert.throws(
    () => decide(x),
    (e) => e.code === 'POLICY_INPUT_INVALID' && !e.message.includes('NEVER_ECHO'),
  );
});
test('getters and sparse capability arrays refused without effects', () => {
  const x = fresh();
  let called = false;
  Object.defineProperty(x, 'extra', {
    enumerable: true,
    get() {
      called = true;
      throw Error('secret');
    },
  });
  assert.throws(
    () => decide(x),
    (e) => e.code === 'POLICY_INPUT_INVALID',
  );
  assert.equal(called, false);
  const y = fresh();
  delete y.callerCapabilities[0];
  assert.throws(
    () => decide(y),
    (e) => e.code === 'POLICY_INPUT_INVALID',
  );
});

test('explicit derived-access refusal cannot be ignored for ordinary sources', () => {
  const x = fresh();
  x.source.derivedAccessAllowed = false;
  assert.deepEqual(decide(x), {
    allowed: false,
    code: 'SECURITY_POLICY_BLOCKED',
    fallbackAllowed: false,
  });
});
test('independent Fixture decision vectors are consumed', async () => {
  const expected = JSON.parse(
    await readFile(
      new URL('../../../fixtures/phase1/security-config/expected/decisions.json', import.meta.url),
      'utf8',
    ),
  );
  assert.deepEqual(decide(fresh()), expected.baseline);
  const x = fresh();
  x.operation = 'REMOTE_LLM';
  x.destination = 'REMOTE';
  assert.deepEqual(decide(x), expected.localOnlyRemote);
  assert.equal(expected.syntheticBudgetsOnly, true);
});
