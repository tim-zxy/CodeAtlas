import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const childLane = process.execArgv.includes('--experimental-test-module-mocks');
if (!childLane) {
  test('fixed CAPTURE owner: isolated Node module-mock test lane (no OS identity lookup)', () => {
    assert.ok(
      existsSync(new URL('../dist/local-capture-operation.js', import.meta.url)),
      'private CAPTURE owner must exist',
    );
    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-test-module-mocks',
        '--test',
        '--test-reporter=tap',
        fileURLToPath(import.meta.url),
      ],
      { shell: false, windowsHide: true, encoding: 'utf8', maxBuffer: 1_000_000, env: environment },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const summary of ['tests 17', 'pass 17', 'fail 0', 'cancelled 0', 'skipped 0', 'todo 0'])
      assert.ok(
        result.stdout.split(/\r?\n/).includes('# ' + summary),
        result.stdout + result.stderr,
      );
  });
} else {
  // TEST_DOUBLE PRINCIPAL ONLY: this mock is intrinsic Node isolation and is not a
  // production issuer/factory. Actual SQLite scope and the OperationPolicy are real.
  const principals = new WeakSet(),
    revoked = new WeakSet();
  await mock.module(new URL('../dist/windows-principal-owner.js', import.meta.url).href, {
    exports: {
      assertCurrentWindowsPrincipal(handle) {
        if (!principals.has(handle) || revoked.has(handle)) throw Error('principal unavailable');
      },
    },
  });
  const api = await import('../dist/local-capture-operation.js');
  const { captureLocalCompilationInput } = await import('../dist/local-compilation-capture.js');
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, resolve, dirname, basename } = await import('node:path');
  const { ContractStore } = await import('../../storage/dist/runtime/contract-store.js');
  const { HistoryReadBudget } =
    await import('../../storage/dist/analysis/activation-history-format.js');
  const { loadMigrationPlan } = await import('../../storage/dist/migrations/manifest.js');
  const { applyMigrationPlan } = await import('../../storage/dist/migrations/runner.js');
  const migrationPlan = await loadMigrationPlan(
    new URL('../../storage/migrations/workspace/manifest.json', import.meta.url),
    'WORKSPACE',
  );
  const limits = {
    maxRows: 100000,
    maxSerializedBytes: 20_000_000,
    maxItems: 2_000_000,
    maxDepth: 100,
    memoryBudgetBytes: 40_000_000,
  };
  const security = () => ({
    localOnly: true,
    remoteLlmEnabled: false,
    remoteEmbeddingEnabled: false,
    allowSensitiveRemote: false,
    allowRawSourceRemote: false,
  });
  const derived = () => ({
    path: null,
    classification: 'INTERNAL',
    form: 'DERIVED',
    secretDetected: false,
    policyBlocked: false,
    derivedAccessAllowed: true,
  });
  function setup(t) {
    const root = resolve(tmpdir()),
      directory = mkdtempSync(join(root, 'local-capture-operation-'));
    const databasePath = join(directory, 'workspace.sqlite'),
      db = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
    applyMigrationPlan(db, migrationPlan);
    db.exec(
      "PRAGMA journal_mode=WAL; INSERT INTO workspace VALUES(1,'w','/owned'); INSERT INTO repositories VALUES('r','w','/owned/r'); INSERT INTO repositories VALUES('other','w','/owned/other'); INSERT INTO revision_sets VALUES('rs','w',0,0); INSERT INTO revision_set_items VALUES('rs','r','v','fingerprint'); INSERT INTO revision_set_items VALUES('rs','other','ov','other-fingerprint'); UPDATE revision_sets SET frozen=1 WHERE id='rs'",
    );
    const store = new ContractStore(db, 'w', []),
      controller = new AbortController(),
      control = {
        signal: controller.signal,
        maxItems: 100000,
        maxDepth: 100,
        deadlineEpochMs: Date.now() + 60000,
      };
    const policy = security(),
      policyVersions = api.localCapturePolicyVersions(policy, control),
      principal = Object.freeze({});
    principals.add(principal);
    const request = {
      schemaVersion: 1,
      workspaceId: 'w',
      scope: { kind: 'REPOSITORY', repositoryId: 'r' },
      revisionSetId: 'rs',
      repositoryIds: ['r'],
      selectedEntityRefs: [],
      selectedDocumentRevisions: [],
      policyVersions,
    };
    const budget = new HistoryReadBudget(limits),
      connections = [db],
      handles = [];
    const input = {
      principalHandle: principal,
      workspaceStore: store,
      security: policy,
      callerCapabilities: ['QUERY', 'READ_SOURCE'],
      request,
      budget,
      control,
    };
    t.after(() => {
      for (const handle of handles)
        try {
          api.closeLocalCaptureOperation(handle);
        } catch {}
      for (const connection of connections) if (connection.isOpen) connection.close();
      assert.equal(resolve(dirname(directory)), root);
      assert.ok(basename(directory).startsWith('local-capture-operation-'));
      rmSync(directory, { recursive: true, force: true });
    });
    const create = (changes = {}) => {
      const out = api.createLocalCaptureOperation({ ...input, ...changes });
      handles.push(out.handle);
      return out;
    };
    return {
      db,
      store,
      databasePath,
      connections,
      controller,
      principal,
      policy,
      request,
      budget,
      control,
      input,
      create,
    };
  }
  test('ordinary capture refuses missing inventory clearance before any repository access', async (t) => {
    const f = setup(t);
    // An empty repository map would fail acquisition if the scan boundary were bypassed.
    await assert.rejects(
      captureLocalCompilationInput({
        ...f.input,
        repositories: new Map(),
        sources: new Map(),
      }),
      (error) => error.code === 'CAPTURE_SCAN_UNAVAILABLE' && error.cleanupState === 'SETTLED',
    );
    assert.equal(f.db.isTransaction, false);
  });
  test('ordinary capture rejects a Principal DTO before data capture', async (t) => {
    const f = setup(t);
    await assert.rejects(
      captureLocalCompilationInput({
        ...f.input,
        principalHandle: {},
        repositories: new Map(),
        sources: new Map(),
      }),
    );
    assert.equal(f.db.isTransaction, false);
  });
  test('ordinary capture cannot turn a caller scan flag into inventory authority', async (t) => {
    const f = setup(t);
    await assert.rejects(
      captureLocalCompilationInput({
        ...f.input,
        repositories: new Map(),
        sources: new Map(),
        scanApproved: true,
      }),
      (error) => error.code === 'CAPTURE_SCAN_UNAVAILABLE' && error.cleanupState === 'SETTLED',
    );
    assert.equal(f.db.isTransaction, false);
  });
  test('ordinary capture rejects input accessors and proxies without invoking them', async (t) => {
    const f = setup(t);
    let calls = 0;
    const input = { ...f.input, repositories: new Map(), sources: new Map() };
    Object.defineProperty(input, 'principalHandle', {
      get() {
        calls++;
        return f.principal;
      },
    });
    await assert.rejects(captureLocalCompilationInput(input));
    await assert.rejects(
      captureLocalCompilationInput(
        new Proxy(
          {},
          {
            getPrototypeOf() {
              calls++;
              return Object.prototype;
            },
          },
        ),
      ),
    );
    assert.equal(calls, 0);
    assert.equal(f.db.isTransaction, false);
  });
  test('pure policy refs are deterministic data; real store membership and principal are mandatory', (t) => {
    const f = setup(t),
      first = f.create();
    assert.deepEqual(first.policyVersions, api.localCapturePolicyVersions(security(), f.control));
    assert.throws(() => f.create({ principalHandle: {} }));
    assert.throws(() => f.create({ request: { ...f.request, workspaceId: 'foreign' } }));
    assert.throws(() =>
      f.create({
        request: {
          ...f.request,
          repositoryIds: ['missing'],
          scope: { kind: 'REPOSITORY', repositoryId: 'missing' },
        },
      }),
    );
    assert.throws(() =>
      f.create({
        request: {
          ...f.request,
          policyVersions: { ...first.policyVersions, domainPolicyRef: 'caller' },
        },
      }),
    );
    assert.equal(f.db.isTransaction, false);
  });
  test('fixed CAPTURE grants only QUERY and READ_SOURCE and original source/security rules still deny', (t) => {
    const f = setup(t),
      { handle } = f.create({
        callerCapabilities: [
          'QUERY',
          'READ_SOURCE',
          'INDEX',
          'UPDATE_KNOWLEDGE',
          'REMOTE_LLM',
          'REPROJECT_WIKI',
        ],
      });
    for (const operation of ['QUERY', 'READ_SOURCE'])
      api.authorizeLocalCaptureRead(handle, { operation, repositoryId: 'r', source: derived() });
    for (const operation of [
      'INDEX',
      'UPDATE_KNOWLEDGE',
      'REMOTE_LLM',
      'LOCAL_LLM',
      'REPROJECT_WIKI',
    ])
      assert.throws(
        () =>
          api.authorizeLocalCaptureRead(handle, {
            operation,
            repositoryId: 'r',
            source: derived(),
          }),
        /PERMISSION_DENIED/,
      );
    for (const source of [
      { ...derived(), secretDetected: true },
      { ...derived(), policyBlocked: true },
      { ...derived(), derivedAccessAllowed: false },
      { ...derived(), path: '.env', form: 'RAW' },
      { ...derived(), path: 'secret.txt', form: 'RAW', classification: 'SECRET' },
    ])
      assert.throws(() =>
        api.authorizeLocalCaptureRead(handle, {
          operation: 'READ_SOURCE',
          repositoryId: 'r',
          source,
        }),
      );
    assert.throws(() =>
      api.authorizeLocalCaptureRead(handle, {
        operation: 'QUERY',
        repositoryId: 'other',
        source: derived(),
      }),
    );
    assert.throws(() => f.create({ callerCapabilities: ['QUERY'] }), /PERMISSION_DENIED/);
  });
  test('checkpoint has no SQL; acquisition boundaries and final finish recheck actual WAL scope', (t) => {
    const f = setup(t),
      { handle } = f.create(),
      rows = f.budget.rows;
    api.assertLocalCaptureOperation(handle);
    assert.equal(f.budget.rows, rows);
    const writer = new DatabaseSync(f.databasePath, { enableForeignKeyConstraints: true });
    f.connections.push(writer);
    writer.prepare('UPDATE repositories SET root_path=? WHERE repository_id=?').run('/moved', 'r');
    assert.throws(
      () =>
        api.authorizeLocalCaptureRead(handle, {
          operation: 'QUERY',
          repositoryId: 'r',
          source: derived(),
        }),
      /CAPTURE_SCOPE_MISMATCH/,
    );
    assert.throws(() => api.assertLocalCaptureOperation(handle));
    const second = f.create();
    writer
      .prepare('UPDATE repositories SET root_path=? WHERE repository_id=?')
      .run('/moved-again', 'r');
    assert.throws(() => api.finishLocalCaptureOperation(second.handle), /CAPTURE_SCOPE_MISMATCH/);
  });

  for (const boundary of ['authorize', 'finish'])
    test('scope read failure cannot revive ' + boundary + ' after SQL restoration', (t) => {
      const f = setup(t),
        operation = f.create();
      f.db.exec('ALTER TABLE revision_sets RENAME TO temporarily_unavailable_revision_sets');
      try {
        assert.throws(
          () =>
            boundary === 'authorize'
              ? api.authorizeLocalCaptureRead(operation.handle, {
                  operation: 'QUERY',
                  repositoryId: 'r',
                  source: derived(),
                })
              : api.finishLocalCaptureOperation(operation.handle),
          (error) => error.code === 'INVALID_HISTORY',
        );
      } finally {
        f.db.exec('ALTER TABLE temporarily_unavailable_revision_sets RENAME TO revision_sets');
      }
      assert.equal(f.db.isTransaction, false);
      assert.throws(
        () => api.assertLocalCaptureOperation(operation.handle),
        /LOCAL_CAPTURE_UNAVAILABLE/,
      );
      assert.throws(() =>
        api.authorizeLocalCaptureRead(operation.handle, {
          operation: 'QUERY',
          repositoryId: 'r',
          source: derived(),
        }),
      );
      if (boundary === 'finish') {
        api.closeLocalCaptureOperation(operation.handle);
        api.closeLocalCaptureOperation(operation.handle);
      }
      const fresh = f.create();
      api.authorizeLocalCaptureRead(fresh.handle, {
        operation: 'QUERY',
        repositoryId: 'r',
        source: derived(),
      });
      api.finishLocalCaptureOperation(fresh.handle);
    });
  test('request/security/control are owned; principal revoke, close and abort cannot be undone', (t) => {
    const f = setup(t),
      { handle } = f.create();
    f.policy.remoteLlmEnabled = true;
    f.request.repositoryIds[0] = 'other';
    f.control.deadlineEpochMs = Number.MAX_SAFE_INTEGER;
    api.authorizeLocalCaptureRead(handle, {
      operation: 'QUERY',
      repositoryId: 'r',
      source: derived(),
    });
    api.revokeLocalCaptureOperation(handle);
    assert.throws(() => api.assertLocalCaptureOperation(handle), /PERMISSION_DENIED/);
    api.closeLocalCaptureOperation(handle);
    api.closeLocalCaptureOperation(handle);
    assert.throws(() => api.assertLocalCaptureOperation(handle));
    const other = setup(t),
      operation = other.create();
    revoked.add(other.principal);
    assert.throws(() => api.assertLocalCaptureOperation(operation.handle));
    const cancelled = setup(t),
      cancelledOperation = cancelled.create();
    cancelled.controller.abort();
    assert.throws(() => api.assertLocalCaptureOperation(cancelledOperation.handle), /CANCELLED/);
  });
  test('finished, cloned, proxy and wrong-incarnation handles cannot authorize; empty workspace refuses', async (t) => {
    const f = setup(t),
      operation = f.create();
    const freshModule =
      await import('../dist/local-capture-operation.js?independent-test-incarnation');
    assert.throws(() => freshModule.assertLocalCaptureOperation(operation.handle));
    api.finishLocalCaptureOperation(operation.handle);
    api.closeLocalCaptureOperation(operation.handle);
    api.closeLocalCaptureOperation(operation.handle);
    assert.throws(() => api.closeLocalCaptureOperation({}));
    assert.throws(() => api.closeLocalCaptureOperation(new Proxy(operation.handle, {})));
    assert.throws(() =>
      api.authorizeLocalCaptureRead(operation.handle, {
        operation: 'QUERY',
        repositoryId: 'r',
        source: derived(),
      }),
    );
    for (const handle of [operation.handle, {}, new Proxy(operation.handle, {})])
      assert.throws(() => api.assertLocalCaptureOperation(handle));
    f.db.exec(
      "INSERT INTO revision_sets VALUES('empty','w',0,0); UPDATE revision_sets SET frozen=1 WHERE id='empty'",
    );
    assert.throws(() =>
      f.create({
        request: {
          ...f.request,
          revisionSetId: 'empty',
          scope: { kind: 'WORKSPACE', workspaceId: 'w' },
          repositoryIds: [],
        },
      }),
    );
  });

  test('shared budget is not reset and later limit expansion invalidates the operation', (t) => {
    const f = setup(t),
      budget = new HistoryReadBudget({ ...limits });
    const operation = f.create({ budget }),
      rows = budget.rows;
    api.authorizeLocalCaptureRead(operation.handle, {
      operation: 'QUERY',
      repositoryId: 'r',
      source: derived(),
    });
    assert.ok(budget.rows > rows);
    budget.limits.maxRows++;
    assert.throws(
      () => api.assertLocalCaptureOperation(operation.handle),
      /LOCAL_CAPTURE_UNAVAILABLE/,
    );
    assert.throws(() => f.create({ budget: new HistoryReadBudget({ ...limits, maxRows: 1 }) }));
  });

  for (const invalid of ['missing-field', 'getter', 'proxy'])
    test(
      'checkpoint permanently latches ' + invalid + ' limits without invoking hooks or SQL',
      (t) => {
        const f = setup(t),
          budget = new HistoryReadBudget({ ...limits }),
          operation = f.create({ budget });
        const original = budget.limits,
          rows = budget.rows;
        let invoked = 0;
        if (invalid === 'missing-field') {
          const { maxRows, ...rest } = original;
          budget.limits = rest;
        }
        if (invalid === 'getter')
          budget.limits = Object.defineProperty({ ...original }, 'maxRows', {
            enumerable: true,
            get() {
              invoked++;
              return original.maxRows;
            },
          });
        if (invalid === 'proxy')
          budget.limits = new Proxy(original, {
            get() {
              invoked++;
              throw Error('private');
            },
            ownKeys() {
              invoked++;
              throw Error('private');
            },
          });
        assert.throws(
          () => api.assertLocalCaptureOperation(operation.handle),
          (error) => error.code === 'LOCAL_CAPTURE_UNAVAILABLE',
        );
        assert.equal(invoked, 0);
        budget.limits = original;
        assert.throws(
          () => api.assertLocalCaptureOperation(operation.handle),
          (error) => error.code === 'LOCAL_CAPTURE_UNAVAILABLE',
        );
        assert.equal(budget.rows, rows);
      },
    );
  test('monotonic deadline expires even when wall time is frozen before the deadline', async (t) => {
    const f = setup(t),
      originalNow = Date.now,
      fixed = originalNow();
    try {
      Date.now = () => fixed;
      const operation = f.create({ control: { ...f.control, deadlineEpochMs: fixed + 40 } });
      await new Promise((resolve) => setTimeout(resolve, 55));
      assert.throws(() => api.assertLocalCaptureOperation(operation.handle), /DEADLINE/);
      Date.now = () => fixed - 10000;
      assert.throws(() => api.assertLocalCaptureOperation(operation.handle), /DEADLINE/);
    } finally {
      Date.now = originalNow;
    }
  });
  test('deadline is latched against backward Date and abort cannot be replaced through original control', async (t) => {
    const f = setup(t),
      now = Date.now,
      deadline = now() + 60;
    const control = { ...f.control, deadlineEpochMs: deadline },
      operation = f.create({ control });
    const later = setup(t),
      another = later.create();
    try {
      Date.now = () => deadline + 1;
      assert.throws(() => api.assertLocalCaptureOperation(operation.handle), /DEADLINE/);
      Date.now = () => deadline - 100000;
      assert.throws(() => api.assertLocalCaptureOperation(operation.handle), /DEADLINE/);
      control.signal = new AbortController().signal;
      later.control.signal = new AbortController().signal;
      later.controller.abort();
      assert.throws(() => api.assertLocalCaptureOperation(another.handle), /CANCELLED/);
    } finally {
      Date.now = now;
    }
  });
}
