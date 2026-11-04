import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { setup, expected } from '../../source/test/fixtures/mixed-source-git-double.mjs';
import {
  openR010FixtureDatabase,
  historyLimits,
} from '../../storage/test/helpers/r011-history-fixture.mjs';
let api;
try {
  api = (await import('../dist/mixed-source-preparation.js')).default;
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
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
test('A2 Runtime private preparation exists without public route', async () => {
  assert.equal(typeof api, 'function');
  assert.equal((await import('../dist/index.js')).prepareMixedSource, undefined);
});
test('A2 Runtime supplies one prelude budget across real Source observation and recheck', async (t) => {
  const f = await setup(t),
    db = await openR010FixtureDatabase(path.join(f.root, 'source.sqlite'), 'repo:a2', f.root);
  f.state.closeOwnedDatabase = () => db.close();
  f.request.config.exclude = ['source.sqlite', 'source.sqlite-*'];
  const result = await api({
    request: f.request,
    policy: policy(),
    sourceState: db.sourceState,
    limits: historyLimits,
    control: { ...f.control, maxInputBytes: Number.MAX_SAFE_INTEGER },
  });
  assert.deepEqual(
    result.state.files.map((x) => x.path),
    expected.files.map((x) => x.path),
  );
  const before = result.budget.serializedBytes;
  assert.ok(before > 0);
  await result.verifySelection();
  assert.ok(result.budget.serializedBytes > before);
  result.account.invalidate();
  assert.throws(
    () => result.account.checkpoint(),
    (e) => e.code === 'STAGE_RELEASED',
  );
});
test('A2 Runtime budget refusal precedes Source and DB observation', async (t) => {
  const f = await setup(t);
  let db = 0;
  await assert.rejects(
    api({
      request: f.request,
      policy: policy(),
      sourceState: {
        load() {
          db++;
          throw Error('DB');
        },
      },
      limits: { ...historyLimits, maxItems: 1 },
      control: { ...f.control, maxInputBytes: 100 },
    }),
  );
  assert.equal(db, 0);
  assert.equal(f.state.calls, 0);
});

test('A2 real Source CAS prelude continues through capture Stage and Store with original Python oracle', async (t) => {
  const { cases } = await import('../../source/test/fixtures/mixed-source-git-double.mjs');
  const fs = await import('node:fs/promises'),
    { createHash } = await import('node:crypto');
  const { applyMigrationPlan } = await import('../../storage/dist/migrations/runner.js');
  const { prefixPlan } = await import('../../storage/test/helpers/r011-history-fixture.mjs');
  const { captureActivationContext } =
    await import('../../storage/dist/analysis/activation-history.js');
  const { MixedAnalysisStage } =
    await import('../../storage/dist/analysis/mixed-analysis-stage.js');
  const { MixedAnalysisStore } =
    await import('../../storage/dist/analysis/mixed-analysis-store.js');
  const { createMixedAnalysisRules } = await import('../dist/mixed-analysis.js');
  const { readComponentReference } =
    await import('../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs');
  const { computeSyntaxOwnerMapDigest } =
    await import('../../providers/dist/native-syntax-owner-binding.js');
  const { reseal } = await import('../../providers/test/fixtures/native-composition-helpers.mjs');
  const base =
    'fixtures/phase1/mixed-analysis-stage/component-references/stage-observation-independent/';
  const template = JSON.parse(readComponentReference(base + 'python-only.json'));
  const originalRequest = JSON.parse(readComponentReference(base + 'python-only-request.jsonl'));
  const originalEvents = readComponentReference(base + 'python-only-output.jsonl')
    .toString()
    .trim()
    .split('\n')
    .map(JSON.parse);
  const bytes = Buffer.from('import pkg as p\nx = p\n');
  assert.equal(
    'sha256:' + createHash('sha256').update(bytes).digest('hex'),
    template.metadata.inventory[0].contentFingerprint,
  );
  const f = await setup(t);
  await fs.writeFile(path.join(f.root, 'app.py'), bytes);
  const db = await openR010FixtureDatabase(path.join(f.root, 'source.sqlite'), 'repo:a2', f.root);
  f.state.closeOwnedDatabase = () => db.close();
  applyMigrationPlan(db.database, await prefixPlan(11));
  f.request.config.exclude = [
    ...cases.sourcePaths.filter((p) => p !== 'app.py'),
    'source.sqlite',
    'source.sqlite-*',
  ];
  const p = await api({
    request: f.request,
    policy: policy(),
    sourceState: db.sourceState,
    limits: historyLimits,
    control: { ...f.control, maxInputBytes: Number.MAX_SAFE_INTEGER },
  });
  const before = p.budget.serializedBytes;
  const h = captureActivationContext(db.database, 'repo:a2', historyLimits);
  const stage = new MixedAnalysisStage(
    db.database,
    h.handle,
    'FULL',
    historyLimits,
    createMixedAnalysisRules(),
    p.budget,
  );
  const close = db.close;
  f.state.closeOwnedDatabase = () => {
    try {
      stage.close();
    } finally {
      close();
    }
  };
  const owner = stage.prepareOwner(null, template.preparation);
  const mapped = new Map([
    ['repo:one', 'repo:a2'],
    ['revision:worktree', p.state.revision.id],
    ['file:one', p.state.files[0].id],
    ['content:first', p.state.revision.contentFingerprint],
    ['/fixture/repo', f.root],
    [originalRequest.payload.ownerBinding.stageDigest, owner.stageDigest],
  ]);
  const rebind = (v) =>
    typeof v === 'string'
      ? (mapped.get(v) ?? v)
      : Array.isArray(v)
        ? v.map(rebind)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rebind(x)]))
          : v;
  let request = rebind(originalRequest),
    events = rebind(originalEvents),
    metadata = rebind(template.metadata);
  const payload = request.payload;
  const map = computeSyntaxOwnerMapDigest({
    expectedActivationBasis: payload.expectedActivationBasis,
    targetSource: payload.targetSource,
    ownerBinding: { kind: 'PROVISIONAL_CODE', stageDigest: owner.stageDigest },
    providerId: payload.providerId,
    providerSnapshotId: payload.providerSnapshotId,
    sourceFiles: payload.sourceFiles,
    owners: payload.owners,
  });
  mapped.set(originalRequest.payload.ownerBinding.ownerMapDigest, map);
  request = rebind(originalRequest);
  events = rebind(originalEvents);
  stage.acceptObservation(owner.ownerHandle, { metadata, ...reseal(request, events) });
  const token = stage.freeze();
  await p.verifySelection();
  assert.ok(p.budget.serializedBytes > before);
  assert.match(
    new MixedAnalysisStore(db.database).apply(token.lease, historyLimits),
    /^activation:/,
  );
  assert.equal(
    db.database.prepare('SELECT indexed_content_fingerprint AS f FROM repository_state').get().f,
    p.state.revision.contentFingerprint,
  );
  assert.throws(
    () => p.account.checkpoint(),
    (e) => e.code === 'STAGE_RELEASED',
  );
});

for (const mode of [
  'success',
  'source-change',
  'transport-failure',
  'foreign-owner',
  'settled-owner',
])
  test('A3 Source -> fixed v2/v5 transport -> Stage/Store ' + mode, async (t) => {
    const fs = await import('node:fs/promises'),
      crypto = await import('node:crypto');
    const cp = (await import('node:child_process')).default;
    const { syncBuiltinESMExports } = await import('node:module');
    const { EventEmitter } = await import('node:events');
    const { PassThrough, Writable } = await import('node:stream');
    const { applyMigrationPlan } = await import('../../storage/dist/migrations/runner.js');
    const { prefixPlan } = await import('../../storage/test/helpers/r011-history-fixture.mjs');
    const { captureActivationContext } =
      await import('../../storage/dist/analysis/activation-history.js');
    const stageAPI = await import('../../storage/dist/analysis/mixed-analysis-stage.js');
    const { MixedAnalysisStore } =
      await import('../../storage/dist/analysis/mixed-analysis-store.js');
    const { createMixedAnalysisRules } = await import('../dist/mixed-analysis.js');
    const construct = (await import('../dist/mixed-request-preparation.js')).default;
    const observe = (await import('../../providers/dist/native-code-syntax-client.js')).default;
    const { executeNativeRequest } = await import('../../providers/dist/native-client.js');
    const { readComponentReference: read } =
      await import('../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs');
    const { reseal } = await import('../../providers/test/fixtures/native-composition-helpers.mjs');
    const base =
      'fixtures/phase1/mixed-analysis-stage/component-references/stage-observation-independent/';
    const template = JSON.parse(read(base + 'mixed.json'));
    const originalRequest = JSON.parse(read(base + 'mixed-request.jsonl'));
    const originalEvents = read(base + 'mixed-output.jsonl')
      .toString()
      .trim()
      .split('\n')
      .map(JSON.parse);
    const f = await setup(t);
    for (const file of template.metadata.inventory) {
      const bytes = await fs.readFile(
        'fixtures/phase1/code-syntax-completeness/sources/mixed/' + file.path,
      );
      assert.equal(
        'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex'),
        file.contentFingerprint,
      );
      await fs.writeFile(path.join(f.root, file.path), bytes);
    }
    const db = await openR010FixtureDatabase(path.join(f.root, 'source.sqlite'), 'repo:a2', f.root);
    f.state.closeOwnedDatabase = () => db.close();
    applyMigrationPlan(db.database, await prefixPlan(11));
    const { cases } = await import('../../source/test/fixtures/mixed-source-git-double.mjs');
    f.request.config.exclude = [
      ...cases.sourcePaths.filter((p) => p !== 'app.py' && p !== 'notes.txt'),
      'source.sqlite',
      'source.sqlite-*',
    ];
    const bounded = ['settled-owner', 'source-change'].includes(mode);
    const prepare = bounded
      ? (await import('../dist/mixed-source-preparation.js')).prepareBudgetedMixedSourceOperation
      : api;
    const prepareInput = {
      request: f.request,
      policy: policy(),
      ...(bounded
        ? {
            database: db.database,
            repository: { id: 'repo:a2', rootPath: f.root },
            operationBudget: {
              maxInputBytes: Number.MAX_SAFE_INTEGER,
              maxOutputBytes: Number.MAX_SAFE_INTEGER,
              maxItems: Number.MAX_SAFE_INTEGER,
              maxDepth: Number.MAX_SAFE_INTEGER,
              maxMemoryBytes: Number.MAX_SAFE_INTEGER,
              maxDurationMs: Math.floor(Number.MAX_SAFE_INTEGER / 2),
            },
          }
        : { sourceState: db.sourceState }),
      limits: historyLimits,
      control: { ...f.control, maxInputBytes: Number.MAX_SAFE_INTEGER },
    };
    const p = await prepare(prepareInput);
    const h = captureActivationContext(db.database, 'repo:a2', p.budget.remaining());
    let stage = new stageAPI.MixedAnalysisStage(
      db.database,
      h.handle,
      'FULL',
      historyLimits,
      createMixedAnalysisRules(),
      p.budget,
    );
    f.state.closeOwnedDatabase = () => {
      try {
        stage.close();
      } finally {
        db.close();
      }
    };
    const mapped = new Map([
      ['repo:one', 'repo:a2'],
      ['revision:worktree', p.state.revision.id],
      ['content:first', p.state.revision.contentFingerprint],
      ['/fixture/repo', f.root],
      ...template.metadata.inventory.map((old) => [
        old.id,
        p.state.files.find((x) => x.path === old.path).id,
      ]),
    ]);
    const rebind = (v) =>
      typeof v === 'string'
        ? (mapped.get(v) ?? v)
        : Array.isArray(v)
          ? v.map(rebind)
          : v && typeof v === 'object'
            ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rebind(x)]))
            : v;
    let metadata = rebind(template.metadata),
      syntaxOutput;
    metadata.inventory = p.state.files;
    const originalGit = cp.spawn,
      spawned = [],
      writes = [],
      closed = [];
    cp.spawn = (file, args, options) => {
      if (file === 'git') return originalGit(file, args, options);
      assert.equal(file, process.execPath);
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
        write(chunk, _enc, cb) {
          parts.push(Buffer.from(chunk));
          cb();
        },
        final(cb) {
          const bytes = Buffer.concat(parts),
            request = JSON.parse(bytes);
          writes.push(bytes);
          spawned.push(request.protocolVersion);
          cb();
          queueMicrotask(() => {
            if (request.protocolVersion === 2) {
              const events = structuredClone(metadata.java.events);
              events.at(-1).payload.integrityChecksum =
                'sha256:' +
                crypto
                  .createHash('sha256')
                  .update(
                    events
                      .slice(0, -1)
                      .map((e) => JSON.stringify(e) + '\n')
                      .join(''),
                  )
                  .digest('hex');
              child.stdout.end(events.map((e) => JSON.stringify(e) + '\n').join(''));
            } else
              child.stdout.end(mode === 'transport-failure' ? Buffer.from('bad\n') : syntaxOutput);
            setImmediate(() => close(0));
          });
        },
      });
      queueMicrotask(() => child.emit('spawn'));
      return child;
    };
    syncBuiltinESMExports();
    const j = stageAPI.readMixedJavaPreparation(stage, template.preparation.contracts);
    const {
      sourceFiles: _files,
      irSchemaVersion: _ir,
      ...javaFields
    } = metadata.java.request.payload;
    const javaRequest = construct.prepareMixedJavaRequest(
      { preparation: j, ...javaFields, requestId: metadata.java.request.requestId },
      p.budget,
    );
    const actualJava = await executeNativeRequest(javaRequest, {
      executablePath: process.execPath,
      timeoutMs: 1000,
    });
    metadata.java = {
      ...metadata.java,
      request: actualJava.request,
      events: actualJava.events,
      terminal: actualJava.terminal,
    };
    assert.deepEqual(
      actualJava.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
      rebind(template.metadata.java.events.filter((e) => e.type === 'NODE').map((e) => e.payload)),
    );
    const ownerInput =
      mode === 'settled-owner'
        ? (
            await import('../../providers/dist/native-composition-input.js')
          ).projectSettledJavaOwner(metadata)
        : metadata;
    if (mode === 'settled-owner') {
      assert.equal(Object.hasOwn(ownerInput, 'codeSyntax'), false);
      assert.equal(Object.hasOwn(ownerInput.snapshot, 'completedAt'), false);
    }
    const owner = stage.prepareOwner(ownerInput, template.preparation);
    if (mode === 'foreign-owner') {
      assert.throws(
        () => stageAPI.readMixedCodeSyntaxPreparation(stage, {}),
        (e) => e.code === 'INVALID_CANDIDATE',
      );
      assert.equal(db.database.prepare('SELECT count(*) n FROM active_history_pointer').get().n, 0);
      assert.deepEqual(spawned, [2]);
      return;
    }
    const projection = stageAPI.readMixedCodeSyntaxPreparation(stage, owner.ownerHandle);
    assert.ok(projection.inventory.some((x) => x.path === 'notes.txt'));
    assert.ok(!projection.sourceFiles.some((x) => x.path === 'notes.txt'));
    const old = originalRequest.payload;
    const requestBytes = construct.prepareMixedCodeSyntaxRequest(
      {
        preparation: projection,
        repository: metadata.java.request.payload.repository,
        requestId: originalRequest.requestId,
        providerVersion: old.providerVersion,
        providerSnapshotId: old.providerSnapshotId,
        extractorVersion: old.extractorVersion,
        languages: old.languages,
        deadlineEpochMs: old.deadlineEpochMs,
        resourceBudget: old.resourceBudget,
      },
      p.budget,
    );
    const request = JSON.parse(requestBytes);
    mapped.set(old.ownerBinding.stageDigest, request.payload.ownerBinding.stageDigest);
    mapped.set(old.ownerBinding.ownerMapDigest, request.payload.ownerBinding.ownerMapDigest);
    const sealed = reseal(request, rebind(originalEvents));
    assert.deepEqual(sealed.requestBytes, requestBytes);
    syntaxOutput = sealed.outputBytes;
    const before = p.budget.serializedBytes;
    if (mode === 'transport-failure') {
      await assert.rejects(
        observe(requestBytes, { executablePath: process.execPath, timeoutMs: 1000 }, null),
      );
      assert.equal(db.database.prepare('SELECT count(*) n FROM active_history_pointer').get().n, 0);
      assert.deepEqual(spawned, [2, 5]);
      assert.equal(closed.length, 2);
      return;
    }
    const raw = await observe(
      requestBytes,
      { executablePath: process.execPath, timeoutMs: 1000 },
      null,
    );
    assert.deepEqual(raw.requestBytes, requestBytes);
    assert.deepEqual(raw.outputBytes, syntaxOutput);
    if (mode === 'settled-owner') {
      const timing = JSON.parse(
        await fs.readFile('fixtures/phase1/mixed-runtime-readiness/java-owner-timing/cases.json'),
      );
      metadata.codeSyntax.startedAt = timing.finalCodeSyntaxStartedAt;
      metadata.codeSyntax.settledAt = timing.finalCodeSyntaxSettledAt;
      metadata.snapshot.completedAt = timing.finalCompletedAt;
    }
    stage.acceptObservation(owner.ownerHandle, {
      metadata,
      requestBytes: raw.requestBytes,
      outputBytes: raw.outputBytes,
    });
    const token = stage.freeze();
    if (mode === 'source-change') {
      await fs.writeFile(path.join(f.root, 'new-note.txt'), 'new selected OTHER');
      await assert.rejects(p.verifySelection(), (e) => e.code === 'SOURCE_CHANGED');
      assert.equal(db.database.prepare('SELECT count(*) n FROM active_history_pointer').get().n, 0);
      assert.equal(p.effects.sourceCommit, 'COMMITTED');
    } else {
      await p.verifySelection();
      assert.ok(p.budget.serializedBytes > before);
      assert.match(
        new MixedAnalysisStore(db.database).apply(token.lease, historyLimits),
        /^activation:/,
      );
      assert.equal(
        db.database.prepare('SELECT indexed_content_fingerprint f FROM repository_state').get().f,
        p.state.revision.contentFingerprint,
      );
      assert.throws(
        () => p.account.checkpoint(),
        (e) => e.code === 'STAGE_RELEASED',
      );
      if (mode === 'settled-owner') {
        assert.equal(
          db.database
            .prepare('SELECT completed_at AS t FROM provider_snapshots WHERE id=?')
            .get(metadata.snapshot.id).t,
          Date.parse(metadata.snapshot.completedAt),
        );
        const row = db.database
          .prepare(
            'SELECT manifest_json AS m FROM activation_history WHERE id=(SELECT activation_id FROM active_history_pointer)',
          )
          .get();
        const history = JSON.parse(row.m);
        assert.equal(
          history.state.snapshots.find((x) => x.id === metadata.snapshot.id).completedAt,
          metadata.snapshot.completedAt,
        );
        assert.equal(Object.hasOwn(history.state.snapshots[0], 'kind'), false);
      }
      stage.close();
      f.request.config.exclude.push('notes.txt');
      const removedOther = await prepare(prepareInput);
      const removedCapture = captureActivationContext(
        db.database,
        'repo:a2',
        removedOther.budget.remaining(),
      );
      stage = new stageAPI.MixedAnalysisStage(
        db.database,
        removedCapture.handle,
        'DELTA',
        historyLimits,
        createMixedAnalysisRules(),
        removedOther.budget,
      );
      assert.deepEqual(
        stageAPI.readMixedJavaPreparation(stage, template.preparation.contracts).javaSourceFiles,
        [],
      );
      const removedOwner = stage.prepareOwner(null, template.preparation),
        removedProjection = stageAPI.readMixedCodeSyntaxPreparation(
          stage,
          removedOwner.ownerHandle,
        );
      assert.deepEqual(removedProjection.removedSourceFiles, []);
      assert.equal(
        construct.prepareMixedCodeSyntaxRequest(
          { preparation: removedProjection, repository: metadata.java.request.payload.repository },
          removedOther.budget,
        ),
        null,
      );
      stage.acceptObservation(removedOwner.ownerHandle, null);
      const removedToken = stage.freeze();
      await removedOther.verifySelection();
      new MixedAnalysisStore(db.database).apply(removedToken.lease, historyLimits);
      stage.close();
      for (const changed of ['java', 'python']) {
        for (const file of template.metadata.inventory) {
          const bytes = await fs.readFile(
            'fixtures/phase1/code-syntax-completeness/sources/mixed/' + file.path,
          );
          await fs.writeFile(
            path.join(f.root, file.path),
            Buffer.concat([
              bytes,
              Buffer.from(
                file.languageHint === changed
                  ? changed === 'java'
                    ? '\n// changed'
                    : '\n# changed'
                  : '',
              ),
            ]),
          );
        }
        const q = await api({
          request: f.request,
          policy: policy(),
          sourceState: db.sourceState,
          limits: historyLimits,
          control: { ...f.control, maxInputBytes: Number.MAX_SAFE_INTEGER },
        });
        const c = captureActivationContext(db.database, 'repo:a2', historyLimits);
        stage = new stageAPI.MixedAnalysisStage(
          db.database,
          c.handle,
          'DELTA',
          historyLimits,
          createMixedAnalysisRules(),
          q.budget,
        );
        const delta = stageAPI.readMixedJavaPreparation(stage, template.preparation.contracts);
        assert.deepEqual(
          delta.javaSourceFiles.map((x) => x.path),
          changed === 'java' ? ['Box.java'] : [],
        );
        stage.close();
      }
      // Only the normal Source selection/CAS removes Java.
      for (const file of template.metadata.inventory)
        await fs.copyFile(
          'fixtures/phase1/code-syntax-completeness/sources/mixed/' + file.path,
          path.join(f.root, file.path),
        );
      f.request.config.exclude.push('Box.java');
      const removedJava = await api({
        request: f.request,
        policy: policy(),
        sourceState: db.sourceState,
        limits: historyLimits,
        control: { ...f.control, maxInputBytes: Number.MAX_SAFE_INTEGER },
      });
      const javaCapture = captureActivationContext(db.database, 'repo:a2', historyLimits);
      stage = new stageAPI.MixedAnalysisStage(
        db.database,
        javaCapture.handle,
        'DELTA',
        historyLimits,
        createMixedAnalysisRules(),
        removedJava.budget,
      );
      const removedHandle = stage.prepareOwner(null, template.preparation);
      const javaRemoval = stageAPI.readMixedCodeSyntaxPreparation(stage, removedHandle.ownerHandle);
      const oldJava = rebind(template.metadata.inventory.find((x) => x.languageHint === 'java'));
      assert.deepEqual(javaRemoval.removedSourceFiles, [
        {
          id: oldJava.id,
          path: oldJava.path,
          previousContentFingerprint: oldJava.contentFingerprint,
        },
      ]);
      assert.equal(
        construct.prepareMixedCodeSyntaxRequest(
          { preparation: javaRemoval, repository: metadata.java.request.payload.repository },
          removedJava.budget,
        ),
        null,
      );
      stage.close();
    }
    assert.deepEqual(spawned, [2, 5]);
    assert.equal(closed.length, 2);
    assert.deepEqual(writes[1], requestBytes);
  });
