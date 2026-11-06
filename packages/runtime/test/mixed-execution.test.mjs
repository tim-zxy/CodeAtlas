import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { setup, cases } from '../../source/test/fixtures/mixed-source-git-double.mjs';
import {
  openR010FixtureDatabase,
  prefixPlan,
} from '../../storage/test/helpers/r011-history-fixture.mjs';
import { applyMigrationPlan } from '../../storage/dist/migrations/runner.js';
import { NativeAnalyzeEventStreamV2Schema } from '../../providers/dist/native-ipc-v2.js';
import { reseal } from '../../providers/test/fixtures/native-composition-helpers.mjs';
let run;
try {
  run = (await import('../dist/mixed-execution.js')).default;
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const base =
  'fixtures/phase1/mixed-analysis-stage/component-references/stage-observation-independent/';
const root = 'fixtures/phase1/mixed-runtime-readiness/mixed-execution/';
const oracle = JSON.parse(await fs.readFile(root + 'expected.json'));
const config = JSON.parse(await fs.readFile(root + 'cases.json')).configuration;
const readReference = (
  await import('../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs')
).readComponentReference;
const bytesOf = async (f) => (f.startsWith(base) ? readReference(f) : await fs.readFile(f));
const read = async (f) => JSON.parse(await bytesOf(f));
const hash = (b) => 'sha256:' + crypto.createHash('sha256').update(b).digest('hex');
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
async function fixture(t, id, mode = 'ok') {
  const f = await setup(t);
  f.state.nativeMode = mode;
  const empty = ['empty', 'other-only'].includes(id);
  const template = empty ? null : await read(base + id + '.json');
  const metadata =
    template?.metadata ??
    (await read('fixtures/phase1/native-composition-candidate/empty/metadata.json'));
  const request = await read(
    empty
      ? 'fixtures/phase1/native-composition-candidate/empty/request.jsonl'
      : base + id + '-request.jsonl',
  );
  const events = (
    await bytesOf(
      empty
        ? 'fixtures/phase1/native-composition-candidate/empty/output.jsonl'
        : base + id + '-output.jsonl',
    )
  )
    .toString()
    .trim()
    .split('\n')
    .map(JSON.parse);
  const keep = empty
    ? id === 'other-only'
      ? ['notes.txt']
      : []
    : metadata.inventory.map((x) => x.path);
  for (const old of metadata.inventory) {
    const source =
      id === 'python-only'
        ? 'fixtures/phase1/native-composition-candidate/python-only/sources/' + old.path
        : 'fixtures/phase1/code-syntax-completeness/sources/' + id + '/' + old.path;
    const bytes = await fs.readFile(source);
    assert.equal(hash(bytes), old.contentFingerprint);
    await fs.writeFile(path.join(f.root, old.path), bytes);
  }
  const db = await openR010FixtureDatabase(path.join(f.root, 'source.sqlite'), 'repo:a2', f.root);
  f.state.closeOwnedDatabase = () => db.close();
  applyMigrationPlan(db.database, await prefixPlan(11));
  const configuration = structuredClone(config);
  configuration.providers[0].configuration.source.exclude = [
    ...cases.sourcePaths.filter((p) => !keep.includes(p)),
    'source.sqlite',
    'source.sqlite-*',
  ];
  const spawned = [],
    closed = [],
    requests = [];
  // setup returns its own pure EventEmitter double; never a real spawn function.
  const gitDouble = f.spawnDouble;
  cp.spawn = (file, args, options) => {
    if (file === f.state.expectedExecutable && args[0] === '-C')
      return gitDouble(file, args, options);
    assert.equal(file, process.execPath);
    f.state.nativeSpawnCalls = (f.state.nativeSpawnCalls ?? 0) + 1;
    assert.equal(options.shell, false);
    assert.equal(options.windowsHide, true);
    const child = new EventEmitter(),
      parts = [];
    let done = false;
    Object.assign(child, {
      pid: 12345,
      exitCode: null,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    const close = (code) => {
      if (done) return;
      done = true;
      child.exitCode = code;
      child.stdout.end();
      child.stderr.end();
      closed.push(code);
      child.emit('exit', code, null);
      child.emit('close', code, null);
    };
    child.kill = () => {
      queueMicrotask(() => close(9));
      return true;
    };
    child.stdin = new Writable({
      write(c, _e, cb) {
        parts.push(Buffer.from(c));
        cb();
      },
      final(cb) {
        const bytes = Buffer.concat(parts),
          r = JSON.parse(bytes);
        spawned.push(r.protocolVersion);
        requests.push(r);
        cb();
        queueMicrotask(async () => {
          try {
            if (f.state.nativeMode === 'cancel') {
              f.controller.abort();
              return;
            }
            if (f.state.nativeMode === 'timeout') return;
            const revision = db.database
              .prepare('SELECT * FROM revisions WHERE id=?')
              .get(r.payload.revision?.id ?? r.payload.targetSource.revisionId);
            const files = db.sourceState.load('repo:a2').files;
            const mapped = new Map([
              ['repo:one', 'repo:a2'],
              ['revision:worktree', revision.id],
              ['content:first', revision.content_fingerprint],
              ['/fixture/repo', f.root],
              [metadata.snapshot.id, r.payload.providerSnapshotId],
            ]);
            for (const old of metadata.inventory) {
              const next = files.find((x) => x.path === old.path);
              if (next) {
                mapped.set(old.id, next.id);
                mapped.set(old.contentFingerprint, next.contentFingerprint);
              }
            }
            const rebind = (v) =>
              typeof v === 'string'
                ? (mapped.get(v) ?? v)
                : Array.isArray(v)
                  ? v.map(rebind)
                  : v && typeof v === 'object'
                    ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rebind(x)]))
                    : v;
            let out;
            if (r.protocolVersion === 2) {
              mapped.set(metadata.java.request.requestId, r.requestId);
              const ev = rebind(structuredClone(metadata.java.events));
              ev.at(-1).payload.integrityChecksum = hash(
                Buffer.from(
                  ev
                    .slice(0, -1)
                    .map((e) => JSON.stringify(e) + '\n')
                    .join(''),
                ),
              );
              const checked = NativeAnalyzeEventStreamV2Schema.safeParse({
                request: r,
                events: ev,
              });
              if (!checked.success) throw Error(checked.error.message);
              out = Buffer.from(ev.map((e) => JSON.stringify(e) + '\n').join(''));
            } else {
              mapped.set(request.requestId, r.requestId);
              mapped.set(
                request.payload.ownerBinding.stageDigest,
                r.payload.ownerBinding.stageDigest,
              );
              mapped.set(
                request.payload.ownerBinding.ownerMapDigest,
                r.payload.ownerBinding.ownerMapDigest,
              );
              let ev = rebind(structuredClone(events));
              const ids = new Set(r.payload.sourceFiles.map((x) => x.id));
              ev = ev.filter(
                (e, i) =>
                  i === 0 ||
                  i === ev.length - 1 ||
                  ids.has(e.payload.sourceFileId ?? e.payload.sourceRange?.sourceFileId),
              );
              for (const e of [ev[0], ev.at(-1)])
                for (const k of ['targetSource', 'ownerBinding', 'expectedActivationBasis'])
                  if (Object.hasOwn(e.payload, k)) e.payload[k] = r.payload[k];
              ev.at(-1).payload.codeOutcome = r.payload.sourceFiles.some(
                (x) => x.languageHint === 'python',
              )
                ? 'COMPLETE'
                : 'NOT_APPLICABLE';
              const counts = ev.at(-1).payload.counts;
              for (const [k, type] of Object.entries({
                nodes: 'NODE',
                edges: 'EDGE',
                syntax: 'SYNTAX_OBSERVATION',
                codeCoverage: 'CODE_COVERAGE',
                syntaxCoverage: 'SYNTAX_COVERAGE',
                diagnostics: 'DIAGNOSTIC',
              }))
                counts[k] = ev.filter((e) => e.type === type).length;
              out = reseal(r, ev).outputBytes;
            }
            if (f.state.nativeMode === 'source-change')
              await fs.appendFile(path.join(f.root, keep[0]), '\n');
            if (f.state.nativeMode === 'bad') out = Buffer.from('private malformed payload\n');
            if (f.state.nativeMode === 'late') out = Buffer.concat([out, Buffer.from('{}\n')]);
            child.stdout.end(out);
            setImmediate(() => close(0));
          } catch (e) {
            f.state.mockError = e;
            child.stdout.destroy(e);
            setImmediate(() => close(2));
          }
        });
      },
    });
    queueMicrotask(() => child.emit('spawn'));
    return child;
  };
  syncBuiltinESMExports();
  const input = {
    operation: 'FULL',
    configuration,
    database: db.database,
    repository: { id: 'repo:a2', rootPath: f.root },
    request: { repositoryId: 'repo:a2', startingPath: f.root, workspaceRoot: f.root },
    policy: policy(),
    control: { ...f.control, maxInputBytes: Number.MAX_SAFE_INTEGER },
    native: {
      options: {
        executablePath: process.execPath,
        timeoutMs: f.state.nativeMode === 'timeout' ? 1 : 1000,
      },
      identity: {
        providerVersion: metadata.snapshot.providerVersion,
        runtimeVersion: metadata.snapshot.runtimeVersion,
        tool: metadata.tool,
      },
      languages: request.payload.languages,
    },
    contracts: template?.preparation.contracts ?? [
      {
        providerId: 'native',
        extractor: 'syntax-v1',
        normalizer: 'fixture-v1',
        contract: 'PYTHON_SYNTAX_CODE_V1',
        policy: 'syntax-surface-support-v1',
      },
    ],
    qualificationRef: 'component-fixture:not-runtime-qualified',
  };
  return { ...f, db, input, spawned, closed, requests };
}
test('A5 fixed executor remains private', async () => {
  assert.equal(typeof run, 'function');
  assert.equal((await import('../dist/index.js')).runMixedExecution, undefined);
});
for (const id of Object.keys(oracle.full))
  test('A5 FULL ' + id, async (t) => {
    const f = await fixture(t, id),
      result = await run(f.input);
    assert.equal(result.kind, 'COMMITTED');
    assert.equal(result.effects.graphCommit, 'COMMITTED');
    assert.equal(result.effects.sourceCommit, 'COMMITTED');
    assert.match(result.activationId, /^activation:/);
    assert.deepEqual(f.spawned, oracle.full[id]);
    assert.equal(f.closed.length, f.spawned.length);
    assert.equal(f.db.database.prepare('SELECT count(*) n FROM active_history_pointer').get().n, 1);
    assert.ok(
      f.requests.every((r) => r.payload.deadlineEpochMs === f.requests[0].payload.deadlineEpochMs),
    );
  });
test('A5 unchanged INCREMENTAL returns old history with no Native', async (t) => {
  const f = await fixture(t, 'python-only'),
    first = await run(f.input),
    before = f.db.database.prepare('SELECT * FROM active_history_pointer').all();
  f.spawned.length = 0;
  const result = await run({ ...f.input, operation: 'INCREMENTAL' });
  assert.equal(result.kind, 'NO_OP');
  assert.equal(result.activationId, first.activationId);
  assert.deepEqual(result.basis, first.basis);
  assert.deepEqual(f.spawned, []);
  assert.equal(result.effects.sourceCommit, 'COMMITTED');
  assert.equal(result.effects.graphCommit, 'NOT_ATTEMPTED');
  assert.deepEqual(f.db.database.prepare('SELECT * FROM active_history_pointer').all(), before);
});
test('A5 INCREMENTAL without history refuses without fallback', async (t) => {
  const f = await fixture(t, 'python-only');
  await assert.rejects(
    run({ ...f.input, operation: 'INCREMENTAL' }),
    (e) =>
      e.code === 'FULL_ANALYSIS_REQUIRED' &&
      e.effects.sourceCommit === 'COMMITTED' &&
      e.effects.graphCommit === 'NOT_ATTEMPTED',
  );
  assert.deepEqual(f.spawned, []);
});
for (const mode of ['source-change', 'bad', 'late', 'cancel', 'timeout'])
  test('A5 fixed execution discards ' + mode, async (t) => {
    const f = await fixture(t, 'python-only', mode);
    await assert.rejects(run(f.input), (e) => {
      assert.ok(e.effects);
      assert.equal(e.effects.sourceCommit, 'COMMITTED');
      assert.equal(e.effects.graphCommit, 'NOT_ATTEMPTED');
      assert.ok(!e.message.includes('private'));
      return true;
    });
    assert.equal(f.db.database.prepare('SELECT count(*) n FROM active_history_pointer').get().n, 0);
    assert.equal(f.spawned.length, 1);
    assert.equal(f.closed.length, 1);
  });
for (const mode of ['begin', 'unknown', 'cleanup'])
  test('A5 fixed execution settles ' + mode, async (t) => {
    const f = await fixture(t, 'python-only'),
      db = f.db.database,
      exec = db.exec.bind(db);
    db.exec = (sql) => {
      if (
        sql === 'BEGIN IMMEDIATE' &&
        db.prepare("SELECT count(*) n FROM sqlite_temp_master WHERE name='mixed_stage'").get().n
      ) {
        if (mode === 'begin') throw Error('private begin');
        f.graph = true;
      }
      if (mode === 'cleanup' && f.graph && sql === 'DROP TABLE temp.mixed_stage') {
        f.cleanupAttempts = (f.cleanupAttempts ?? 0) + 1;
        throw Error('private cleanup');
      }
      const result = exec(sql);
      if (mode === 'unknown' && f.graph && sql === 'COMMIT') throw Error('private commit');
      return result;
    };
    try {
      if (mode === 'cleanup') {
        const r = await run(f.input);
        assert.equal(r.effects.graphCommit, 'COMMITTED');
        assert.equal(r.effects.cleanupFailed, true);
        assert.match(r.activationId, /^activation:/);
        assert.equal(f.cleanupAttempts, 1);
      } else
        await assert.rejects(
          run(f.input),
          (e) =>
            e.effects.graphCommit === (mode === 'unknown' ? 'UNKNOWN' : 'NOT_COMMITTED') &&
            typeof e.effects.activationId === 'string',
        );
    } finally {
      db.exec = exec;
    }
  });

for (const kind of ['deletion', 'python-local', 'java-group', 'other-only'])
  test('A5 INCREMENTAL ' + kind, async (t) => {
    const f = await fixture(t, kind === 'other-only' ? 'other-only' : 'mixed'),
      first = await run(f.input);
    f.spawned.length = 0;
    f.requests.length = 0;
    if (kind === 'deletion') {
      await fs.unlink(path.join(f.root, 'Box.java'));
      await fs.unlink(path.join(f.root, 'app.py'));
    } else
      await fs.appendFile(
        path.join(
          f.root,
          { 'python-local': 'app.py', 'java-group': 'Box.java', 'other-only': 'notes.txt' }[kind],
        ),
        '\n',
      );
    if (kind === 'other-only') {
      await assert.rejects(
        run({ ...f.input, operation: 'INCREMENTAL' }),
        (e) => e.code === 'FULL_ANALYSIS_REQUIRED',
      );
      assert.deepEqual(f.spawned, []);
      return;
    }
    let r;
    try {
      r = await run({ ...f.input, operation: 'INCREMENTAL' });
    } catch (e) {
      if (f.state.mockError) throw f.state.mockError;
      throw e;
    }
    assert.equal(r.kind, 'COMMITTED');
    assert.notEqual(r.activationId, first.activationId);
    assert.deepEqual(
      f.spawned,
      { deletion: [], 'python-local': [5], 'java-group': [2, 5], 'other-only': [] }[kind],
    );
    if (kind === 'python-local')
      assert.deepEqual(
        f.requests[0].payload.sourceFiles.map((x) => x.path),
        ['app.py'],
      );
    if (kind === 'java-group')
      assert.deepEqual(
        f.requests[0].payload.sourceFiles.map((x) => x.path),
        ['Box.java'],
      );
    assert.equal(f.db.database.prepare('SELECT count(*) n FROM active_history_pointer').get().n, 1);
  });
for (const kind of ['provider-identity'])
  test('A5 INCREMENTAL refuses ' + kind, async (t) => {
    const f = await fixture(t, 'python-only');
    await run(f.input);
    f.spawned.length = 0;

    if (kind === 'provider-identity')
      f.db.database.prepare("UPDATE provider_snapshots SET provider_version='changed'").run();
    await assert.rejects(run({ ...f.input, operation: 'INCREMENTAL' }), (e) =>
      [
        'FULL_ANALYSIS_REQUIRED',
        'INCOMPATIBLE_CONTRACT',
        'HISTORY_CHANGED',
        'INVALID_HISTORY',
      ].includes(e.code),
    );
    assert.deepEqual(f.spawned, []);
  });
test('A5 NO_OP rechecks history after asynchronous Source verification', async (t) => {
  const f = await fixture(t, 'python-only');
  await run(f.input);
  f.spawned.length = 0;
  let begins = 0,
    changed = false;
  const exec = f.db.database.exec.bind(f.db.database);
  f.db.database.exec = (sql) => {
    if (sql === 'BEGIN IMMEDIATE') begins++;
    return exec(sql);
  };
  f.state.beforeReply = () => {
    if (
      begins &&
      f.db.database
        .prepare("SELECT count(*) n FROM sqlite_temp_master WHERE name='mixed_stage'")
        .get().n &&
      !changed
    ) {
      changed = true;
      f.db.database.exec('DELETE FROM active_history_pointer');
    }
  };
  try {
    await assert.rejects(run({ ...f.input, operation: 'INCREMENTAL' }), (e) =>
      ['HISTORY_CHANGED', 'SOURCE_CHANGED', 'STAGE_CHANGED'].includes(e.code),
    );
  } finally {
    f.db.database.exec = exec;
  }
  assert.equal(changed, true);
  assert.deepEqual(f.spawned, []);
});
test('A5 NO_OP cleanup failure is reported without inventing Graph commit', async (t) => {
  const f = await fixture(t, 'python-only');
  await run(f.input);
  const exec = f.db.database.exec.bind(f.db.database);
  f.db.database.exec = (sql) => {
    if (sql === 'DROP TABLE temp.mixed_stage') throw Error('private close');
    return exec(sql);
  };
  try {
    await assert.rejects(
      run({ ...f.input, operation: 'INCREMENTAL' }),
      (e) =>
        e.effects.cleanupFailed &&
        e.effects.graphCommit === 'NOT_ATTEMPTED' &&
        typeof e.effects.activationId === 'string',
    );
  } finally {
    f.db.database.exec = exec;
  }
});
for (const key of ['raw', 'events', 'candidate', 'basis', 'store', 'rules', 'transport'])
  test('A5 rejects caller ' + key + ' before effects', async (t) => {
    const f = await fixture(t, 'empty');
    await assert.rejects(
      run({ ...f.input, [key]: {} }),
      (e) => e.effects.sourceCommit === 'NOT_ATTEMPTED',
    );
    assert.deepEqual(f.spawned, []);
    assert.equal(f.state.calls, 0);
  });

test('A5 contract change revalidates required units without NO_OP/full fallback', async (t) => {
  const f = await fixture(t, 'python-only'),
    first = await run(f.input);
  f.spawned.length = 0;
  f.input.contracts[0].policy += '-changed';
  const r = await run({ ...f.input, operation: 'INCREMENTAL' });
  assert.equal(r.kind, 'COMMITTED');
  assert.notEqual(r.activationId, first.activationId);
  assert.deepEqual(f.spawned, [5]);
  assert.notEqual(f.requests.at(-1).payload.expectedActivationBasis, null);
});

test('A5 failed incremental preserves last-good Graph/history', async (t) => {
  const f = await fixture(t, 'python-only');
  await run(f.input);
  const before = f.db.database.prepare('SELECT * FROM active_history_pointer').all();
  await fs.appendFile(path.join(f.root, 'app.py'), '\n');
  f.state.nativeMode = 'bad';
  f.spawned.length = 0;
  await assert.rejects(
    run({ ...f.input, operation: 'INCREMENTAL' }),
    (e) => e.effects.sourceCommit === 'COMMITTED' && e.effects.graphCommit === 'NOT_ATTEMPTED',
  );
  assert.deepEqual(f.db.database.prepare('SELECT * FROM active_history_pointer').all(), before);
  assert.deepEqual(f.spawned, [5]);
});
test('A5 expired deadline refuses before Source/DB effects', async (t) => {
  const f = await fixture(t, 'empty');
  f.input.control.deadlineEpochMs = Date.now() - 1;
  await assert.rejects(
    run(f.input),
    (e) => e.code === 'TIMEOUT' && e.effects.sourceCommit === 'NOT_ATTEMPTED',
  );
  assert.equal(f.state.calls, 0);
  assert.deepEqual(f.spawned, []);
});

test('A5 unknown rejection values keep safe code and effects', async (t) => {
  const f = await fixture(t, 'empty');
  Object.defineProperty(f.input.native.options, 'executablePath', {
    get() {
      throw undefined;
    },
  });
  await assert.rejects(
    run(f.input),
    (e) =>
      e.code === 'ANALYSIS_FAILED' &&
      e.effects?.sourceCommit === 'NOT_ATTEMPTED' &&
      e.effects?.graphCommit === 'NOT_ATTEMPTED',
  );
  assert.equal(f.state.calls, 0);
  assert.deepEqual(f.spawned, []);
});

// Explicit deep-private callback parameter; ordinary JSON input remains exact.
function qualificationDouble(f, failRole) {
  const roles = [],
    events = [],
    disposals = [];
  f.state.expectedExecutable = path.join(f.root, 'git-fixture-only.exe');
  const lifecycle = (role) => ({
    async beforeSpawn() {
      events.push(role + ':ready');
      if (role === failRole) throw Error('private launch refusal');
    },
    async beforeInput() {
      events.push(role + ':input');
    },
    async afterClose() {
      events.push(role + ':close');
    },
    async dispose() {
      disposals.push(role);
    },
  });
  return {
    roles,
    events,
    disposals,
    value: {
      source: {
        executablePath: f.state.expectedExecutable,
        environment: {},
        createLifecycle() {
          return lifecycle('GIT');
        },
      },
      createNativeLifecycle(role) {
        roles.push(role);
        return lifecycle(role);
      },
    },
  };
}
test('A5 private qualification callbacks reach Source then v2 and v5 without public routing', async (t) => {
  const f = await fixture(t, 'mixed'),
    q = qualificationDouble(f);
  const r = await run(f.input, q.value);
  assert.equal(r.kind, 'COMMITTED');
  assert.deepEqual(q.roles, ['V2', 'V5']);
  assert.ok(q.events.includes('GIT:ready'));
  for (const role of ['V2', 'V5'])
    assert.deepEqual(
      q.events.filter((x) => x.startsWith(role + ':')),
      [role + ':ready', role + ':input', role + ':close'],
    );
  assert.equal(q.disposals.filter((x) => x === 'V2').length, 1);
  assert.equal(q.disposals.filter((x) => x === 'V5').length, 1);
  assert.equal(f.state.nativeSpawnCalls, 2);
});
test('A5 private v2 pre-spawn refusal does not launch Native or fall through v5', async (t) => {
  const f = await fixture(t, 'mixed'),
    q = qualificationDouble(f, 'V2');
  await assert.rejects(
    run(f.input, q.value),
    (e) =>
      e.code === 'PROCESS_FAILED' &&
      e.effects.sourceCommit === 'COMMITTED' &&
      e.effects.graphCommit === 'NOT_ATTEMPTED',
  );
  assert.equal(f.state.nativeSpawnCalls ?? 0, 0);
  assert.deepEqual(q.roles, ['V2']);
  assert.equal(q.disposals.filter((x) => x === 'V2').length, 1);
});

test('A5 private unknown process cleanup remains visible without claiming database cleanup failed', async (t) => {
  const f = await fixture(t, 'mixed'),
    q = qualificationDouble(f);
  f.input.native.options.timeoutMs = 100;
  const originalFactory = q.value.createNativeLifecycle;
  q.value.createNativeLifecycle = (role) => {
    const l = originalFactory(role);
    l.afterClose = async () => {
      await new Promise(() => {});
    };
    return l;
  };
  let timer;
  try {
    await assert.rejects(
      Promise.race([
        run(f.input, q.value),
        new Promise((_r, j) => (timer = setTimeout(() => j(Error('UNBOUNDED_GUARD')), 1000))),
      ]),
      (e) =>
        e.code === 'TIMEOUT' &&
        e.cleanupState === 'UNKNOWN' &&
        e.effects.graphCommit === 'NOT_ATTEMPTED',
    );
  } finally {
    clearTimeout(timer);
  }
});

for (const source of [undefined, null, {}])
  test(
    'A5 chosen qualification cannot omit or downgrade its Source binding ' + String(source),
    async (t) => {
      const f = await fixture(t, 'mixed');
      const q = {
        source,
        createNativeLifecycle() {
          return {
            async beforeSpawn() {},
            async beforeInput() {},
            async afterClose() {},
            async dispose() {},
          };
        },
      };
      await assert.rejects(
        run(f.input, q),
        (e) =>
          e.effects.sourceCommit === 'NOT_ATTEMPTED' && e.effects.graphCommit === 'NOT_ATTEMPTED',
      );
      assert.equal(f.state.calls, 0);
      assert.equal(f.state.nativeSpawnCalls ?? 0, 0);
    },
  );
