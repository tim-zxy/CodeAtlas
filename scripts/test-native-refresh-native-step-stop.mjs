import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createR9StopControl } from './helpers/native-refresh-r9-stop.mjs';

if (!process.execArgv.includes('--experimental-test-module-mocks')) {
  test('corpus main/oracle and boundary call sites forward the original control', async () => {
    const source = await readFile(
      new URL(
        '../packages/runtime/test/helpers/native-refresh-transport-replay.mjs',
        import.meta.url,
      ),
      'utf8',
    );
    const body = source
      .split('export async function prepareRefreshTransportCorpus(')[1]
      .split('\nasync function fileAsset(')[0];
    const calls = [...body.matchAll(/await preparedSourceRefresh\(([\s\S]*?)\n\s*\);/g)];
    assert.equal(calls.length, 2, 'main and independent FULL oracle bootstrap');
    for (const call of calls) assert.match(call[1], /fixtureContext,\s*control,\s*$/);
    assert.match(
      body,
      /await boundary\(\s*lifetime,\s*undefined,\s*workspacePath,\s*fixtureContext,\s*control,?\s*\)/,
    );
    assert.match(
      body,
      /await prepareDenseUpsertBoundary\(\s*lifetime,\s*undefined,\s*fixtureContext,\s*control,?\s*\)/,
    );
  });
  test('per-Native preparation stop uses an isolated module-double lane', () => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = childProcess.spawnSync(
      process.execPath,
      [
        '--experimental-test-module-mocks',
        '--test',
        '--test-concurrency=1',
        fileURLToPath(import.meta.url),
      ],
      { env, encoding: 'utf8', shell: false, windowsHide: true, maxBuffer: 1_000_000 },
    );
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stdout + child.stderr);
  });
} else {
  // These doubles prove orchestration only, never Native output or resource qualification.
  let current,
    unexpectedStarts = 0,
    frame;
  childProcess.spawn = () => {
    unexpectedStarts++;
    throw Error('Actual process forbidden');
  };
  syncBuiltinESMExports();
  const realProviders = await import('../packages/providers/dist/index.js');
  const sha = (v) => createHash('sha256').update(v).digest('hex');
  const summary = (file, fields = 0) => ({
    sourceFile: file,
    symbols: Array.from({ length: fields + 1 }, (_, i) => ({ providerFactId: `s-${i}` })),
    relationSites: [],
    emittedFacts: [],
    coverage: [],
    diagnostics: [],
  });
  async function originalCall(kind, operation, request, options) {
    current.requests.push(
      JSON.parse(
        JSON.stringify({ kind, request, options }, (key, value) =>
          typeof value === 'string' && value.startsWith(current.root)
            ? 'TEST_DOUBLE_OWNED_ROOT'
            : value,
        ),
      ),
    );
    current.calls.push(kind);
    await writeFile(
      path.join(current.root, 'original-call.json'),
      JSON.stringify({ kind, completed: false }),
    );
    if (current.entered) {
      current.entered();
      await current.wait;
    }
    if (current.failure && kind === current.failureKind) {
      if (current.stopOnFailure) await writeFile(path.join(current.root, 'STOP_REQUESTED'), '');
      throw current.failure;
    }
    const result = await operation();
    await writeFile(
      path.join(current.root, 'original-call.json'),
      JSON.stringify({ kind, completed: true }),
    );
    if (current.stopFromCall) await writeFile(path.join(current.root, 'STOP_REQUESTED'), '');
    return result;
  }
  await mock.module(new URL('../packages/providers/dist/index.js', import.meta.url).href, {
    exports: {
      ...realProviders,
      executeNativeRequest: (request, options) =>
        originalCall(
          'DESCRIBE',
          async () => ({
            terminal: {
              payload: {
                providerId: 'native',
                providerVersion: '0.0.0',
                runtimeVersion: 'TEST_DOUBLE',
              },
            },
          }),
          request,
          options,
        ),
      streamNativeFullAnalysisV3: (request, options, sink) =>
        originalCall(
          'FULL',
          async () => {
            const file = request.payload.sourceFiles[0];
            if (current.realBootstrap) return { terminal: { payload: { outcome: 'SUCCEEDED' } } };
            const raw = await readFile(
              path.join(request.payload.repository.rootPath, file.path),
              'utf8',
            );
            const fields = (raw.match(/int f/g) ?? []).length;
            await sink.accept({ type: 'ANALYSIS_SUMMARY', payload: summary(file, fields) });
            return { terminal: { payload: { outcome: 'SUCCEEDED' } } };
          },
          request,
          options,
        ),
      streamNativeRefreshV3: (request, baseline, options, sink) =>
        originalCall(
          'REFRESH',
          async () => {
            const file = request.payload.targetSourceFiles[0];
            const raw = await readFile(
              path.join(request.payload.repository.rootPath, file.path),
              'utf8',
            );
            const fields = (raw.match(/int f/g) ?? []).length;
            if (fields >= 1983) {
              current.wire =
                JSON.stringify({
                  type: 'REFRESH_FAILED',
                  payload: {
                    error: {
                      code: 'RESOURCE_LIMIT_EXCEEDED',
                      message: 'Summary workspace or size exceeds budget',
                    },
                  },
                }) + '\n';
              throw Object.assign(Error('synthetic producer boundary'), {
                code: 'ANALYZER_FAILED',
              });
            }
            await sink.accept({ type: 'ANALYSIS_SUMMARY', payload: summary(file, fields) });
            return { terminal: { payload: { outcome: 'SUCCEEDED' } } };
          },
          request,
          options,
        ),
    },
  });
  const realSource =
    await import('../packages/runtime/test/helpers/native-refresh-source-fixture.mjs');
  const providersCorpus =
    await import('../packages/providers/test/helpers/native-refresh-v3-corpus.mjs');
  await mock.module(
    new URL('../packages/providers/test/helpers/native-refresh-v3-corpus.mjs', import.meta.url)
      .href,
    {
      exports: {
        ...providersCorpus,
        requestBytes(request, baseline) {
          const sites = baseline.summaries[0].sourceFile.path === 'Sites.java';
          const overflow = sites
            ? baseline.summaries[0].symbols.length - 1 >=
              (request.requestId.includes('dense-remove') ? 1982 : 1983)
            : baseline.summaries.length >=
              (request.payload.repository.id.includes('complete-coverage') ? 5 : 3);
          const bytes = Buffer.alloc(overflow ? 1_000_001 : 100, 'x');
          for (let i = 99; i < bytes.length; i += 100) bytes[i] = 10;
          bytes[bytes.length - 1] = 10;
          return bytes;
        },
      },
    },
  );
  const makeFile = (name, raw) => ({
    id: name,
    path: name,
    contentFingerprint: raw === undefined ? 'TEST_DOUBLE_STATIC_SOURCE' : 'sha256:' + sha(raw),
  });
  await mock.module(
    new URL('../packages/runtime/test/helpers/native-refresh-source-fixture.mjs', import.meta.url)
      .href,
    {
      exports: {
        ...realSource,
        sourceTransitions: realSource.sourceTransitions,
        activationImage: () => ({ fixture: 'unchanged' }),
        async preparedSourceRefresh(
          lifetime,
          row,
          workers,
          diagnostic,
          replayRoot,
          dContext,
          control,
        ) {
          assert.equal(
            control,
            current.expectedControl,
            'Preparation control must reach every bootstrap',
          );
          const directory = await mkdtemp(path.join(current.root, 'owned-seed-'));
          const databasePath = path.join(directory, 'seed.sqlite'),
            db = new DatabaseSync(databasePath);
          db.exec('CREATE TABLE fixture(value INTEGER); INSERT INTO fixture VALUES(1)');
          const resource = {
            directory,
            db,
            close() {
              db.close();
              if (current.cleanupFailure) throw current.cleanupFailure;
            },
          };
          lifetime.ownRefreshFixture?.(resource);
          const files = (entries) =>
            Object.entries(entries)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, artifact]) => makeFile(name, row.generatedSources?.[artifact]));
          const summaries = files(row.baseline).map((file) =>
            summary(
              file,
              (row.generatedSources?.[row.baseline[file.path]]?.match(/int f/g) ?? []).length,
            ),
          );
          const targetFiles = files(row.target);
          const template = {
            requestId: `source-refresh-${row.id}`,
            payload: {
              repository: { id: row.id, rootPath: directory },
              baselineState: {},
              targetRevision: {},
              targetSourceFiles: targetFiles,
              changes: {
                added: targetFiles.filter(
                  (file) => !summaries.some((s) => s.sourceFile.id === file.id),
                ),
                modified: targetFiles.filter((file) =>
                  summaries.some(
                    (s) =>
                      s.sourceFile.id === file.id &&
                      s.sourceFile.contentFingerprint !== file.contentFingerprint,
                  ),
                ),
                deleted: summaries
                  .map((s) => s.sourceFile)
                  .filter((file) => !targetFiles.some((target) => target.id === file.id)),
              },
            },
          };
          const framed = frame(template, summaries, targetFiles);
          return {
            db,
            databasePath,
            prepared: {
              request: framed.request,
              baseline: framed.baseline,
              limits: { memoryBudgetBytes: 1_000_000_000 },
            },
            options: {},
            targetFiles,
          };
        },
      },
    },
  );
  await mock.module(
    new URL('../packages/runtime/test/helpers/native-refresh-wire-probe.mjs', import.meta.url).href,
    {
      exports: {
        async observeNativeWire(operation, observe) {
          try {
            return { value: await operation(), threw: false, wire: [] };
          } catch (error) {
            if (current.wire) observe?.(Buffer.from(current.wire));
            return { error, threw: true, wire: [] };
          }
        },
      },
    },
  );
  const input =
    await import('../packages/runtime/test/helpers/native-refresh-source-input-boundary.mjs');
  const retained =
    await import('../packages/runtime/test/helpers/native-refresh-retained-sites-boundary.mjs');
  const remove =
    await import('../packages/runtime/test/helpers/native-refresh-dense-remove-boundary.mjs');
  const upsert =
    await import('../packages/runtime/test/helpers/native-refresh-dense-upsert-boundary.mjs');
  const cleanup =
    await import('../packages/runtime/test/helpers/native-refresh-transport-replay.mjs');
  frame = input.frameSourceRefreshBoundary;
  async function setup(t) {
    const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-native-step-stop-'));
    const state = { root, calls: [], requests: [], resources: [], after: [] };
    current = state;
    t.after(async () => {
      for (const resource of state.resources) if (resource.db?.isOpen) resource.db.close();
      assert.equal(path.dirname(root), path.resolve(tmpdir()));
      assert.ok(path.basename(root).startsWith('codeatlas-native-step-stop-'));
      await rm(root, { recursive: true, force: true });
      assert.equal(unexpectedStarts, 0);
    });
    state.control = await createR9StopControl(root);
    state.lifetime = {
      after: (fn) => state.after.push(fn),
      ownRefreshFixture: (r) => state.resources.push(r),
    };
    return state;
  }
  async function preserveFailure(f, error) {
    const diagnostics = [];
    const result = cleanup.closeRefreshPreparationResources(f.resources, diagnostics);
    await assert.rejects(
      () =>
        cleanup.failRefreshPreparation(
          f.root,
          error,
          f.resources.map((r) => r.directory),
          diagnostics,
        ),
      (e) => e === error,
    );
    const receipt = JSON.parse(await readFile(path.join(f.root, 'preparation-failure.json')));
    assert.equal(receipt.retainedFixturePaths.length, f.resources.length);
    for (const resource of f.resources)
      assert.ok(
        (
          await readFile(
            path.join(resource.directory, resource.db ? 'seed.sqlite' : 'repository.sqlite'),
          )
        ).length > 0,
      );
    return { result, receipt };
  }
  test('bootstrap stop before DESCRIBE preserves owned database without launching', async (t) => {
    const f = await setup(t);
    f.realBootstrap = true;
    await writeFile(path.join(f.root, 'STOP_REQUESTED'), '');
    let failure;
    try {
      await realSource.preparedSourceRefresh(
        f.lifetime,
        { baseline: {}, target: {} },
        1,
        undefined,
        path.join(f.root, 'bootstrap'),
        undefined,
        f.control,
      );
    } catch (error) {
      failure = error;
    }
    assert.equal(failure?.code, 'R9_STOP_REQUESTED');
    assert.deepEqual(f.calls, []);
    const saved = await preserveFailure(f, failure);
    assert.equal(saved.result.failed, false);
  });
  test('bootstrap waits for in-flight FULL then stops before subsequent work and closes owned resources', async (t) => {
    const f = await setup(t);
    f.realBootstrap = true;
    let release, entered;
    const waiting = new Promise((r) => {
      entered = r;
    });
    // Delay only the FULL double, after the DESCRIBE double has settled.
    const control = {
      ...f.control,
      async checkpoint(boundary) {
        if (boundary === 'PREPARE_FULL:BEFORE') {
          f.wait = new Promise((r) => {
            release = r;
          });
          f.entered = entered;
        }
        await f.control.checkpoint(boundary);
      },
    };
    const work = assert.rejects(
      () =>
        f.control.stage('BOOTSTRAP', () =>
          realSource.preparedSourceRefresh(
            f.lifetime,
            { baseline: {}, target: {} },
            1,
            undefined,
            path.join(f.root, 'bootstrap'),
            undefined,
            control,
          ),
        ),
      { code: 'R9_STOP_REQUESTED' },
    );
    await waiting;
    await writeFile(path.join(f.root, 'STOP_REQUESTED'), '');
    assert.equal(
      JSON.parse(await readFile(path.join(f.root, 'original-call.json'))).completed,
      false,
    );
    release();
    await work;
    assert.deepEqual(f.calls, ['DESCRIBE', 'FULL']);
    assert.equal(
      JSON.parse(await readFile(path.join(f.root, 'original-call.json'))).completed,
      true,
    );
    cleanup.closeRefreshPreparationResources(f.resources, []);
    await assert.rejects(() =>
      f.control.worker('NEXT', async () => {
        f.calls.push('forbidden');
      }),
    );
  });
  test('bootstrap original failure wins over a concurrent stop and preserves failure evidence', async (t) => {
    const f = await setup(t);
    f.realBootstrap = true;
    f.failure = Error('synthetic original Native failure');
    f.failureKind = 'FULL';
    f.stopOnFailure = true;
    await assert.rejects(
      () =>
        f.control.stage('BOOTSTRAP', () =>
          realSource.preparedSourceRefresh(
            f.lifetime,
            { baseline: {}, target: {} },
            1,
            undefined,
            path.join(f.root, 'bootstrap'),
            undefined,
            f.control,
          ),
        ),
      (error) => error === f.failure,
    );
    assert.deepEqual(f.calls, ['DESCRIBE', 'FULL']);
    const saved = await preserveFailure(f, f.failure);
    assert.equal(saved.result.failed, false);
    assert.match(saved.receipt.failure, /synthetic original Native failure/);
    await assert.rejects(() =>
      f.control.worker('NEXT', async () => {
        f.calls.push('forbidden');
      }),
    );
    assert.deepEqual(f.calls, ['DESCRIBE', 'FULL']);
  });
  test('a stop detected immediately before boundary FULL prevents that launch', async (t) => {
    const f = await setup(t);
    const control = {
      ...f.control,
      async checkpoint(boundary) {
        if (boundary === 'BOUNDARY_FILE:BEFORE')
          await writeFile(path.join(f.root, 'STOP_REQUESTED'), '');
        await f.control.checkpoint(boundary);
      },
    };
    f.expectedControl = control;
    await assert.rejects(
      () =>
        f.control.stage('BOUNDARY', () =>
          input.preparedSourceInputBoundary(f.lifetime, undefined, undefined, undefined, control),
        ),
      { code: 'R9_STOP_REQUESTED' },
    );
    assert.deepEqual(f.calls, []);
    cleanup.closeRefreshPreparationResources(f.resources, []);
  });
  const boundaries = [
    input.preparedSourceInputBoundary,
    input.preparedSharedOwnersBoundary,
    input.preparedCompleteCoverageBoundary,
    retained.preparedRetainedSitesBoundary,
    retained.generateRetainedSitesBoundary,
    remove.preparedDenseRemoveBoundary,
    upsert.prepareDenseUpsertBoundary,
  ];
  const invokeBoundary = (operation, f, control) => {
    if (operation === retained.generateRetainedSitesBoundary)
      return operation(f.lifetime, undefined, control);
    if (operation === upsert.prepareDenseUpsertBoundary)
      return operation(f.lifetime, undefined, undefined, control);
    return operation(f.lifetime, undefined, undefined, undefined, control);
  };
  for (const operation of boundaries) {
    test(
      operation.name + ' stops after one settled Native call and preserves cleanup evidence',
      async (t) => {
        const f = await setup(t);
        f.expectedControl = f.control;
        f.stopFromCall = true;
        const run = () => invokeBoundary(operation, f, f.control);
        let failure;
        try {
          await f.control.stage('BOUNDARY', run);
        } catch (error) {
          failure = error;
        }
        assert.equal(failure?.code, 'R9_STOP_REQUESTED');
        assert.equal(f.calls.length, 1);
        f.cleanupFailure = Error('synthetic cleanup failure');
        const saved = await preserveFailure(f, failure);
        assert.equal(saved.result.failed, true);
        assert.ok(saved.receipt.cleanupFailures.length > 0);
        await assert.rejects(() =>
          f.control.worker('NEXT', async () => {
            f.calls.push('forbidden');
          }),
        );
        assert.equal(f.calls.length, 1);
      },
    );
    if (operation === retained.generateRetainedSitesBoundary) continue;
    test(
      operation.name + ' preserves successful Native call sequence with optional control',
      async (t) => {
        const f = await setup(t);
        const run = (control) => invokeBoundary(operation, f, control);
        const baseline = await run(undefined);
        const expected = [...f.calls];
        const expectedRequests = structuredClone(f.requests);
        f.calls = [];
        f.requests = [];
        f.expectedControl = f.control;
        const controlled = await f.control.stage('BOUNDARY', () => run(f.control));
        assert.deepEqual(f.calls, expected);
        assert.deepEqual(f.requests, expectedRequests);
        assert.equal(
          controlled.accepted.metrics?.memberCount ??
            controlled.accepted.memberCount ??
            controlled.accepted.metrics?.fileCount,
          baseline.accepted.metrics?.memberCount ??
            baseline.accepted.memberCount ??
            baseline.accepted.metrics?.fileCount,
        );
        assert.equal(
          controlled.next.metrics?.memberCount ??
            controlled.next.memberCount ??
            controlled.next.metrics?.fileCount,
          baseline.next.metrics?.memberCount ??
            baseline.next.memberCount ??
            baseline.next.metrics?.fileCount,
        );
      },
    );
  }
}
