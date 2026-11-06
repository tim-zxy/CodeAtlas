import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from './mixed-native-runtime-qualification.mjs';
import { validateMixedSourceQualification } from '../packages/application/dist/mixed-source-workflow.js';
import { createMixedNativeLaunchSession } from './mixed-native-launch-handshake.mjs';

const flags = {
  databaseStateVerified: false,
  sourceHistoryAuthenticated: false,
  toolImagesAuthenticated: false,
  environmentAuthenticated: false,
  executionAuthorized: false,
  productionAdmission: false,
  measurementEligible: false,
};
const invalid = (e) =>
  e.code === 'INVALID_MIXED_NATIVE_RUNTIME_QUALIFICATION' && e.message === e.code;
const config = () => ({ executablePath: process.execPath, environment: { FIXTURE: 'literal' } });
function fixture() {
  const calls = [];
  let state = {
    status: 'OFFLINE_BOUND',
    controlStatus: 'OPEN',
    launchStatus: 'OFFLINE_IDLE',
    remaining: 3,
    ...flags,
  };
  const lifecycle = Object.freeze({
    beforeSpawn() {},
    beforeInput() {},
    afterClose() {},
    dispose() {},
  });
  const owner = {
    take(role) {
      assert.equal(this, owner);
      calls.push(role);
      return lifecycle;
    },
    status() {
      assert.equal(this, owner);
      return { ...state };
    },
    dispose() {
      assert.fail('adapter must not dispose its owner');
    },
  };
  return {
    owner,
    calls,
    lifecycle,
    state,
    setState(value) {
      state = value;
    },
  };
}
function create(owner, source = config()) {
  assert.equal(typeof api.createMixedNativeRuntimeQualification, 'function');
  return api.createMixedNativeRuntimeQualification(owner, source);
}

test('exact private Runtime callback shape reuses Application Source validation without taking slots', () => {
  const f = fixture();
  const source = config();
  const q = create(f.owner, source);
  assert.deepEqual(Object.keys(q).sort(), ['createNativeLifecycle', 'source']);
  assert.deepEqual(Object.keys(q.source).sort(), [
    'createLifecycle',
    'environment',
    'executablePath',
  ]);
  assert.ok(
    Object.isFrozen(q) && Object.isFrozen(q.source) && Object.isFrozen(q.source.environment),
  );
  assert.deepEqual(f.calls, []);
  const existing = validateMixedSourceQualification({ ...source, createLifecycle() {} });
  assert.deepEqual(q.source.environment, existing.environment);
  assert.equal(q.source.executablePath, existing.executablePath);
  assert.equal(q.source.createLifecycle(Object.freeze({ synthetic: true })), f.lifecycle);
  assert.equal(q.createNativeLifecycle('V2'), f.lifecycle);
  assert.equal(q.createNativeLifecycle('V5'), f.lifecycle);
  assert.deepEqual(f.calls, ['GIT', 'V2', 'V5']);
});
test('Source environment is detached with existing fixed empty compatibility keys', () => {
  const f = fixture();
  const source = config();
  const q = create(f.owner, source);
  source.environment.FIXTURE = 'changed';
  source.executablePath = 'relative';
  assert.equal(q.source.environment.FIXTURE, 'literal');
  assert.equal(q.source.environment.SYSTEMROOT, '');
  assert.equal(q.source.environment.NODE_V8_COVERAGE, '');
  assert.equal(q.source.executablePath, process.execPath);
});
test('owner methods are captured once and retain original receiver', () => {
  const f = fixture();
  const q = create(f.owner);
  f.owner.take = () => assert.fail('replacement take');
  f.owner.status = () => assert.fail('replacement status');
  assert.equal(q.createNativeLifecycle('V2'), f.lifecycle);
  assert.deepEqual(f.calls, ['V2']);
});
for (const role of ['GIT', 'HOST', 'OBSERVER', '', null, undefined]) {
  test('Native factory rejects role ' + String(role) + ' before owner take', () => {
    const f = fixture();
    const q = create(f.owner);
    assert.throws(() => q.createNativeLifecycle(role), invalid);
    assert.deepEqual(f.calls, []);
  });
}
for (const field of Object.keys(flags)) {
  test('owner authority claim is rejected at construction: ' + field, () => {
    const f = fixture();
    f.state[field] = true;
    assert.throws(() => create(f.owner), invalid);
    assert.deepEqual(f.calls, []);
  });
}
for (const change of [
  { status: 'CLOSED' },
  { status: 'FAILED' },
  { controlStatus: 'FAILED' },
  { controlStatus: 'CLOSED' },
]) {
  test('unhealthy owner refuses before take: ' + JSON.stringify(change), () => {
    const f = fixture();
    const q = create(f.owner);
    Object.assign(f.state, change);
    assert.throws(() => q.source.createLifecycle({}), invalid);
    assert.throws(() => q.createNativeLifecycle('V2'), invalid);
    assert.deepEqual(f.calls, []);
  });
}
test('PENDING and depleted metadata are delegated to owner rather than reimplemented', () => {
  const f = fixture();
  f.state.launchStatus = 'PENDING';
  f.state.remaining = 0;
  const q = create(f.owner);
  q.createNativeLifecycle('V2');
  q.createNativeLifecycle('V2');
  assert.deepEqual(f.calls, ['V2', 'V2']);
});
for (const field of ['take', 'status', 'dispose']) {
  test('owner accessor is rejected without evaluation: ' + field, () => {
    const f = fixture();
    let called = false;
    Object.defineProperty(f.owner, field, {
      enumerable: true,
      get() {
        called = true;
        return () => {};
      },
    });
    assert.throws(() => create(f.owner), invalid);
    assert.equal(called, false);
  });
}
for (const field of ['take', 'status', 'dispose']) {
  test('proxy owner method rejected: ' + field, () => {
    const f = fixture();
    f.owner[field] = new Proxy(f.owner[field], {});
    assert.throws(() => create(f.owner), invalid);
  });
}
test('proxy owner rejected without traps', () => {
  const f = fixture();
  let called = false;
  const owner = new Proxy(f.owner, {
    ownKeys() {
      called = true;
      throw Error('trap');
    },
  });
  assert.throws(() => create(owner), invalid);
  assert.equal(called, false);
});
test('inherited, missing, extra and symbol owner capabilities rejected', () => {
  const f = fixture();
  assert.throws(() => create(Object.create(f.owner)), invalid);
  const missing = { ...f.owner };
  delete missing.take;
  assert.throws(() => create(missing), invalid);
  assert.throws(() => create({ ...f.owner, run() {} }), invalid);
  assert.throws(() => create({ ...f.owner, [Symbol('hidden')]: 1 }), invalid);
});
test('invalid status data cannot invoke a getter or proxy trap', () => {
  const f = fixture();
  let called = false;
  const s = { ...f.state };
  Object.defineProperty(s, 'status', {
    enumerable: true,
    get() {
      called = true;
      return 'OFFLINE_BOUND';
    },
  });
  f.setState(s);
  f.owner.status = () => s;
  assert.throws(() => create(f.owner), invalid);
  assert.equal(called, false);
  f.owner.status = () =>
    new Proxy(
      {},
      {
        get() {
          called = true;
          throw Error('trap');
        },
      },
    );
  assert.throws(() => create(f.owner), invalid);
  assert.equal(called, false);
});
for (const [name, change] of [
  [
    'relative executable',
    (c) => {
      c.executablePath = 'git';
    },
  ],
  [
    'extra callback',
    (c) => {
      c.createLifecycle = () => {};
    },
  ],
  [
    'environment case alias',
    (c) => {
      c.environment = { PATH: '', Path: '' };
    },
  ],
  [
    'nonstring environment',
    (c) => {
      c.environment.FIXTURE = 1;
    },
  ],
  [
    'environment NUL',
    (c) => {
      c.environment.FIXTURE = '\0';
    },
  ],
]) {
  test('existing Source validation refuses ' + name, () => {
    const f = fixture();
    const c = config();
    change(c);
    assert.throws(() => create(f.owner, c), invalid);
    assert.deepEqual(f.calls, []);
  });
}
test('Source config getters are refused without invocation', () => {
  const f = fixture();
  const c = config();
  let called = false;
  Object.defineProperty(c, 'environment', {
    enumerable: true,
    get() {
      called = true;
      return {};
    },
  });
  assert.throws(() => create(f.owner, c), invalid);
  assert.equal(called, false);
});
test('take failure preserves exact frozen UNKNOWN error', () => {
  const f = fixture();
  const failure = Object.freeze(
    Object.assign(Error('original refusal'), { cleanupState: 'UNKNOWN' }),
  );
  f.owner.take = () => {
    throw failure;
  };
  const q = create(f.owner);
  assert.throws(
    () => q.source.createLifecycle({}),
    (e) => e === failure,
  );
  assert.throws(
    () => q.createNativeLifecycle('V2'),
    (e) => e === failure,
  );
});
test('existing launch session remains sole order and outstanding-slot authority', () => {
  const bindings = ['GIT', 'V2', 'V5'].map((role, i) => ({
    launchId: 'adapter-' + i,
    role,
    commandSha256: 'a'.repeat(64),
    imageSha256: 'b'.repeat(64),
  }));
  const session = createMixedNativeLaunchSession(bindings, () =>
    assert.fail('no exchange executed'),
  );
  const owner = {
    take(role) {
      return session.take(role);
    },
    status() {
      return {
        status: session.status().status === 'FAILED' ? 'FAILED' : 'OFFLINE_BOUND',
        controlStatus: 'OPEN',
        ...flags,
      };
    },
    dispose() {},
  };
  const q = create(owner);
  const first = q.source.createLifecycle({});
  assert.equal(typeof first.beforeSpawn, 'function');
  assert.throws(
    () => q.createNativeLifecycle('V2'),
    (e) => e.code === 'INVALID_MIXED_NATIVE_LAUNCH',
  );
  assert.equal(session.status().status, 'FAILED');
  assert.throws(() => q.createNativeLifecycle('V5'), invalid);
});
for (const field of ['take', 'status', 'dispose']) {
  test('noncallable owner member rejected: ' + field, () => {
    const f = fixture();
    f.owner[field] = null;
    assert.throws(() => create(f.owner), invalid);
    assert.deepEqual(f.calls, []);
  });
}
test('authority change after construction is refused before either factory can take', () => {
  const f = fixture();
  const q = create(f.owner);
  f.state.executionAuthorized = true;
  assert.throws(() => q.source.createLifecycle({}), invalid);
  assert.throws(() => q.createNativeLifecycle('V2'), invalid);
  assert.deepEqual(f.calls, []);
});
