import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from './mixed-native-launch-handshake.mjs';
// Synthetic observer only. No process, pipe, OS, image or artifact is opened.
const sha = (n) => n.toString(16).padStart(64, '0');
const plan = () => ({
  executablePath: process.execPath,
  arguments: ['fixed'],
  environment: { FIXED: 'yes' },
  cwd: process.cwd(),
  stdinSha256: sha(1),
});
const digest = (p) => {
  assert.equal(typeof api.hashMixedNativeLaunch, 'function');
  return api.hashMixedNativeLaunch(p);
};
const create = (list, exchange) => {
  assert.equal(typeof api.createMixedNativeLaunchSession, 'function');
  return api.createMixedNativeLaunchSession(list, exchange);
};
const invalid = (fn) =>
  assert.throws(fn, (e) => e.code === 'INVALID_MIXED_NATIVE_LAUNCH' && e.message === e.code);
const rejects = (fn) =>
  assert.rejects(fn, (e) => e.code === 'INVALID_MIXED_NATIVE_LAUNCH' && e.message === e.code);
function harness(roles = ['GIT'], mutate = () => {}) {
  const commands = roles.map(() => plan()),
    list = roles.map((role, i) => ({
      launchId: 'launch-' + i,
      role,
      commandSha256: digest(commands[i]),
      imageSha256: sha(10 + i),
    })),
    events = [];
  const exchange = async (message) => {
    events.push(message);
    assert.ok(Object.isFrozen(message));
    const b = list.find((x) => x.launchId === message.launchId);
    let reply;
    if (message.type === 'INTENT')
      reply = { type: 'READY', launchId: b.launchId, role: b.role, commandSha256: b.commandSha256 };
    else if (message.type === 'SPAWNED')
      reply = {
        type: 'ACQUIRED',
        launchId: b.launchId,
        role: b.role,
        pid: 123,
        imageSha256: b.imageSha256,
        creationIdentity: 'created',
        parentOwned: true,
      };
    else if (message.type === 'CLOSED')
      reply = {
        type: 'RELEASED',
        launchId: b.launchId,
        pid: 123,
        imageSha256: b.imageSha256,
        creationIdentity: 'created',
        osExited: true,
        handleReleased: true,
        unknownDescendants: false,
        cleanupComplete: true,
        queryStatus: 'RECORDED',
        peakWorkingSetBytes: 1024,
      };
    else if (message.type === 'ABANDON')
      reply = {
        type: 'ABANDONED',
        launchId: b.launchId,
        unknownDescendants: false,
        cleanupComplete: true,
      };
    else assert.fail('unknown synthetic message');
    await mutate(reply, message);
    return reply;
  };
  const session = create(list, exchange),
    signal = new AbortController().signal;
  const run = async (i = 0, close = { exitCode: 0, signal: null }) => {
    const l = session.take(roles[i]);
    await l.beforeSpawn(commands[i], signal);
    await l.beforeInput(
      { pid: 123, executablePath: process.execPath, spawnStartedEpochMs: 1, spawnedEpochMs: 2 },
      signal,
    );
    await l.afterClose(close);
    await l.dispose();
    return l;
  };
  return { session, events, commands, list, signal, run };
}
test('same command environment key order has a stable binding digest', () => {
  const a = plan();
  a.environment = { A: '1', B: '2' };
  const b = plan();
  b.environment = { B: '2', A: '1' };
  assert.equal(digest(a), digest(b));
  b.arguments.reverse();
  b.arguments.push('changed');
  assert.notEqual(digest(a), digest(b));
});
test('fixed ordered roles settle serially without authority', async () => {
  const h = harness(['GIT', 'V2', 'V5']);
  for (let i = 0; i < 3; i++) await h.run(i);
  assert.deepEqual(
    h.events.map((x) => x.type),
    ['INTENT', 'SPAWNED', 'CLOSED', 'INTENT', 'SPAWNED', 'CLOSED', 'INTENT', 'SPAWNED', 'CLOSED'],
  );
  const s = h.session.status();
  assert.equal(s.remaining, 0);
  assert.equal(s.measurementEligible, false);
  assert.equal(s.executionAuthorized, false);
  assert.equal(s.productionAdmission, false);
  assert.ok(Object.isFrozen(s));
});
test('second outstanding launch cannot share a slot', async () => {
  const h = harness(['GIT', 'V2']);
  const l = h.session.take('GIT');
  invalid(() => h.session.take('V2'));
  await l.dispose();
  invalid(() => h.session.take('V2'));
});
test('unknown role cannot enter a session', () => {
  const h = harness();
  invalid(() => h.session.take('CONHOST'));
});
test('mutated command refuses before INTENT', async () => {
  const h = harness(),
    l = h.session.take('GIT');
  h.commands[0].arguments.push('new');
  await rejects(() => l.beforeSpawn(h.commands[0], h.signal));
  assert.equal(h.events.length, 0);
  await l.dispose();
  invalid(() => h.session.take('GIT'));
});
for (const [name, mutate] of [
  [
    'stale READY',
    (r) => {
      if (r.type === 'READY') r.launchId = 'other';
    },
  ],
  [
    'role confusion',
    (r) => {
      if (r.type === 'ACQUIRED') r.role = 'V5';
    },
  ],
  [
    'PID mismatch',
    (r) => {
      if (r.type === 'ACQUIRED') r.pid = 456;
    },
  ],
  [
    'image mismatch',
    (r) => {
      if (r.type === 'ACQUIRED') r.imageSha256 = sha(99);
    },
  ],
  [
    'unowned parent',
    (r) => {
      if (r.type === 'ACQUIRED') r.parentOwned = false;
    },
  ],
  [
    'changed instance at release',
    (r) => {
      if (r.type === 'RELEASED') r.creationIdentity = 'other';
    },
  ],
  [
    'unknown descendant',
    (r) => {
      if (r.type === 'RELEASED') r.unknownDescendants = true;
    },
  ],
  [
    'unreleased handle',
    (r) => {
      if (r.type === 'RELEASED') r.handleReleased = false;
    },
  ],
  [
    'uncertain cleanup',
    (r) => {
      if (r.type === 'RELEASED') r.cleanupComplete = false;
    },
  ],
  [
    'failed final query',
    (r) => {
      if (r.type === 'RELEASED') {
        r.queryStatus = 'FAILED';
        r.peakWorkingSetBytes = null;
      }
    },
  ],
])
  test('handshake refuses ' + name + ' and forbids continuation', async () => {
    const h = harness(['V2', 'V5'], mutate);
    await rejects(() => h.run());
    invalid(() => h.session.take('V5'));
  });
test('input cannot precede READY', async () => {
  const h = harness(),
    l = h.session.take('GIT');
  await rejects(() => l.beforeInput({ pid: 123 }, h.signal));
  await l.dispose();
});
test('Native nonzero exit poisons the remaining session', async () => {
  const h = harness(['V2', 'V5']);
  await rejects(() => h.run(0, { exitCode: 1, signal: null }));
  invalid(() => h.session.take('V5'));
});
test('existing Git exit1 convention can settle', async () => {
  const h = harness();
  await h.run(0, { exitCode: 1, signal: null });
  assert.equal(h.session.status().status, 'OFFLINE_IDLE');
});
test('duplicate binding launch ID is refused', () => {
  const h = harness(['GIT', 'V2']);
  h.list[1].launchId = h.list[0].launchId;
  invalid(() => create(h.list, async () => {}));
});

for (const stage of ['INTENT', 'CLOSED', 'ABANDON'])
  test('aborted ' + stage + ' exchange cannot hang or advance a session', async () => {
    const h = harness(['V2', 'V5'], async (_r, m) => {
        if (m.type === stage) await new Promise(() => {});
      }),
      l = h.session.take('V2'),
      c = new AbortController();
    let pending;
    if (stage === 'INTENT') pending = l.beforeSpawn(h.commands[0], c.signal);
    else if (stage === 'ABANDON') pending = l.dispose(c.signal);
    else {
      await l.beforeSpawn(h.commands[0], h.signal);
      await l.beforeInput(
        { pid: 123, executablePath: process.execPath, spawnStartedEpochMs: 1, spawnedEpochMs: 2 },
        h.signal,
      );
      pending = l.afterClose({ exitCode: 0, signal: null }, c.signal);
    }
    const timer = setTimeout(() => c.abort(), 20);
    try {
      await rejects(() => pending);
    } finally {
      clearTimeout(timer);
    }
    if (stage !== 'ABANDON') await rejects(() => l.dispose(c.signal));
    else await l.dispose(c.signal);
    invalid(() => h.session.take('V5'));
    assert.equal(h.session.status().status, 'FAILED');
  });

test('poisoned active lease cannot later complete READY', async () => {
  const h = harness(['GIT', 'V2']),
    l = h.session.take('GIT');
  invalid(() => h.session.take('V2'));
  await rejects(() => l.beforeSpawn(h.commands[0], h.signal));
  await l.dispose(h.signal);
});
test('READY arriving after explicit abandonment cannot revive a disposed lease', async () => {
  let release;
  const ready = new Promise((r) => (release = r));
  const h = harness(['GIT'], async (_r, m) => {
      if (m.type === 'INTENT') await ready;
    }),
    l = h.session.take('GIT'),
    pending = l.beforeSpawn(h.commands[0], h.signal).catch((e) => e);
  await new Promise(setImmediate);
  await l.dispose(h.signal);
  release();
  const result = await pending;
  assert.equal(result?.code, 'INVALID_MIXED_NATIVE_LAUNCH');
  assert.equal(h.session.status().status, 'FAILED');
});
