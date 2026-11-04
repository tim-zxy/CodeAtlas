// Explicit foreground approved library-test driver; never a production process or collector.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const task = path.join(
  root,
  '.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/ab-local-closure',
);
const json = (p) => JSON.parse(fs.readFileSync(p));
const save = (p, v) =>
  fs.writeFileSync(
    p,
    typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v, null, 2) + '\n',
    { flag: 'wx' },
  );
const sha = (b) => createHash('sha256').update(b).digest('hex');
assert.equal(json(path.join(task, 'approval.json')).user, '批准');
const fixtureRoot = path.join(root, 'fixtures/phase1'),
  oracle = json(path.join(fixtureRoot, 'syntax-contract/surface-closure/expected.json'));
assert.deepEqual(
  oracle.cases.map((c) => c.id),
  ['J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7', 'P1', 'P2', 'P3', 'P4', 'P5'],
);
const tools = 'C:/Users/Freya/.rustup/toolchains/1.98.1-x86_64-pc-windows-msvc/bin';
const env = {
  ...process.env,
  RUSTC: path.join(tools, 'rustc.exe'),
  RUSTUP_TOOLCHAIN: '1.98.1-x86_64-pc-windows-msvc',
  CARGO_NET_OFFLINE: 'true',
};
for (const k of Object.keys(env)) if (k.startsWith('CODEATLAS_')) delete env[k];
function recordRun(name, exe, args, extra = {}) {
  const stdout = fs.openSync(path.join(task, name + '.stdout.log'), 'wx'),
    stderr = fs.openSync(path.join(task, name + '.stderr.log'), 'wx');
  const startedAt = new Date().toISOString();
  let r;
  try {
    r = spawnSync(exe, args, {
      cwd: root,
      env: { ...env, ...extra },
      windowsHide: true,
      shell: false,
      stdio: ['ignore', stdout, stderr],
    });
  } finally {
    fs.closeSync(stdout);
    fs.closeSync(stderr);
  }
  save(path.join(task, name + '.run.json'), {
    executable: exe,
    executableSha256: sha(fs.readFileSync(exe)),
    args,
    startedAt,
    settledAt: new Date().toISOString(),
    status: r.status,
    signal: r.signal,
    error: r.error ? String(r.error) : null,
    kind: 'EXPLICIT_LIBRARY_OPERATION',
  });
  assert.equal(r.error, undefined);
  assert.equal(r.status, 0, 'operation failed; raw retained, no automatic retry');
}
const command = process.argv[2];
if (command === 'prepare') {
  const sources = path.join(task, 'owned-sources-01'),
    inputs = path.join(task, 'inputs-01');
  fs.mkdirSync(sources);
  fs.mkdirSync(inputs);
  const requests = [],
    identities = [];
  const template = json(path.join(root, 'fixtures/ipc/protocol-v2/valid/request.jsonl'));
  for (const c of oracle.cases) {
    const original = path.resolve(fixtureRoot, c.source);
    assert(original.startsWith(fixtureRoot + path.sep));
    const actual = fs.realpathSync(original);
    assert(actual.startsWith(fs.realpathSync(fixtureRoot) + path.sep));
    assert(!fs.lstatSync(original).isSymbolicLink());
    const bytes = fs.readFileSync(original);
    assert(bytes.length <= 65536);
    const owned = path.join(sources, c.id),
      destination = path.join(owned, c.source);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    save(destination, bytes);
    const repositoryId = 'repo:ab:' + c.id,
      revisionId = 'revision:ab:' + c.id,
      sourceFile = {
        id: 'file:ab:' + c.id,
        repositoryId,
        revisionId,
        path: c.source,
        contentFingerprint: 'sha256:' + sha(bytes),
        classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
        languageHint: c.id.startsWith('J') ? 'java' : 'python',
        sensitivity: 'INTERNAL',
      };
    identities.push({
      id: c.id,
      source: c.source,
      originalSha256: sha(bytes),
      ownedRoot: owned,
      sourceFile,
      revision: {
        id: revisionId,
        repositoryId,
        kind: 'WORKTREE',
        contentFingerprint: 'sha256:' + sha(bytes),
        baseRevisionId: null,
      },
    });
    if (c.id.startsWith('J')) {
      const r = structuredClone(template);
      r.requestId = 'ab-code:' + c.id;
      Object.assign(r.payload, {
        repository: { id: repositoryId, rootPath: owned.replaceAll('\\', '/') },
        providerSnapshotId: 'snapshot:ab:' + c.id,
        revision: identities.at(-1).revision,
        sourceFiles: [sourceFile],
        requestedCapabilities: ['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'],
      });
      r.payload.resourceBudget.maxEvents = 10000;
      requests.push({ id: c.id, request: r });
    }
  }
  save(path.join(inputs, 'code-requests.json'), {
    kind: 'FIXED_AB_CODE_INPUT_V1',
    cases: requests,
  });
  save(path.join(inputs, 'source-identities.json'), identities);
  save(path.join(inputs, 'oracle.json'), oracle);
  console.log('Prepared 12 byte-identical owned Source roots; seven Java requests. No parser run.');
} else if (command === 'compile') {
  const label = process.argv[3];
  assert(['prepare-01', 'prepare-02'].includes(label));
  const frozen = {};
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.rs'))
        frozen[path.relative(root, p).replaceAll('\\', '/')] = sha(fs.readFileSync(p));
    }
  }
  walk(path.join(root, 'crates/native-analyzer/src'));
  for (const p of ['Cargo.lock', 'crates/native-analyzer/Cargo.toml'])
    frozen[p] = sha(fs.readFileSync(path.join(root, p)));
  for (const t of ['cargo.exe', 'rustc.exe']) frozen[t] = sha(fs.readFileSync(path.join(tools, t)));
  save(path.join(task, label + '.freeze.json'), frozen);
  recordRun(label, path.join(tools, 'cargo.exe'), [
    'test',
    '--locked',
    '--offline',
    '-p',
    'codeatlas-native-analyzer',
    '--no-run',
    '--lib',
    '--bin',
    'codeatlas-native-analyzer',
    '--message-format=json',
  ]);
  const artifacts = fs
    .readFileSync(path.join(task, label + '.stdout.log'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter(
      (r) =>
        r.reason === 'compiler-artifact' &&
        r.executable &&
        r.profile.test &&
        r.target.name.replaceAll('_', '-') === 'codeatlas-native-analyzer',
    )
    .map((r) => ({
      kind: r.target.kind,
      path: r.executable,
      sha256: sha(fs.readFileSync(r.executable)),
    }));
  assert.equal(artifacts.length, 2);
  save(path.join(task, label + '.artifacts.json'), artifacts);
  console.log('Offline compile complete; two actual test artifacts recorded.');
} else if (command === 'code') {
  const artifacts = json(path.join(task, 'prepare-01.artifacts.json')),
    a = artifacts.find((a) => a.kind.includes('bin'));
  assert(a);
  assert.equal(sha(fs.readFileSync(a.path)), a.sha256);
  const output = path.join(task, 'code-capture-01');
  fs.mkdirSync(output);
  recordRun(
    'code-capture-01',
    a.path,
    [
      'analyze::tests::phase1_ab_code_source_capture',
      '--exact',
      '--ignored',
      '--nocapture',
      '--test-threads=1',
    ],
    { CODEATLAS_AB_BATCH_INPUT: path.join(task, 'inputs-01'), CODEATLAS_AB_BATCH_OUTPUT: output },
  );
  console.log('Seven actual Java Code library requests captured; no CLI/main.');
} else if (command === 'syntax-red' || command === 'syntax-green') {
  const { DatabaseSync } = await import('node:sqlite');
  const { openR010FixtureDatabase, prefixPlan, historyLimits } =
    await import('../packages/storage/test/helpers/r011-history-fixture.mjs');
  const { applyMigrationPlan } = await import('../packages/storage/dist/migrations/runner.js');
  const { captureRuntimeActivationContext: captureActivationContext } =
    await import('../packages/storage/dist/analysis/activation-history.js');
  const { MixedAnalysisStage, readMixedCodeSyntaxPreparation } =
    await import('../packages/storage/dist/analysis/mixed-analysis-stage.js');
  const { createMixedAnalysisRules } = await import('../packages/runtime/dist/mixed-analysis.js');
  const { computeSyntaxOwnerMapDigest } =
    await import('../packages/providers/dist/native-syntax-owner-binding.js');
  const { normalizeNativeAnalysis } =
    await import('../packages/providers/dist/canonical-normalizer.js');
  const { mergeCanonicalObservations } = await import('../packages/providers/dist/fact-merger.js');
  const { ProviderSnapshotSchema } = await import('../packages/ir/dist/index.js');
  const { FrameworkSurfaceRequestSchema } =
    await import('../packages/providers/dist/native-framework-surface-contract.js');
  const label = command === 'syntax-red' ? 'syntax-red-04' : 'syntax-green-01',
    inputDir = path.join(task, label + '-inputs'),
    dbDir = path.join(task, label + '-databases'),
    output = path.join(task, label);
  fs.mkdirSync(inputDir);
  fs.mkdirSync(dbDir);
  fs.mkdirSync(output);
  const sourceIdentities = json(path.join(task, 'inputs-01/source-identities.json')),
    cases = [],
    live = [];
  const artifacts = json(
      path.join(
        task,
        command === 'syntax-red' ? 'prepare-01.artifacts.json' : 'prepare-02.artifacts.json',
      ),
    ),
    artifact = artifacts.find((a) => a.kind.includes('lib'));
  assert(artifact);
  assert.equal(sha(fs.readFileSync(artifact.path)), artifact.sha256);
  const contracts = [
    {
      providerId: 'native',
      extractor: 'syntax-v2',
      normalizer: 'syntax-canonical-mapper-v4',
      contract: 'SYNTAX_BINDING_V4',
      policy: 'syntax-surface-support-v2',
    },
  ];
  try {
    for (const info of sourceIdentities) {
      const source = fs.readFileSync(path.join(info.ownedRoot, info.source));
      assert.equal(sha(source), info.originalSha256);
      const opened = await openR010FixtureDatabase(
        path.join(dbDir, info.id + '.sqlite'),
        info.revision.repositoryId,
        info.ownedRoot.replaceAll('\\', '/'),
      );
      const db = opened.database;
      live.push({ db, stage: null });
      applyMigrationPlan(db, await prefixPlan(13));
      opened.sourceState.replace(null, { revision: info.revision, files: [info.sourceFile] });
      const capture = captureActivationContext(db, info.revision.repositoryId, historyLimits),
        stage = new MixedAnalysisStage(
          db,
          capture.handle,
          'FULL',
          historyLimits,
          createMixedAnalysisRules(),
        );
      live.at(-1).stage = stage;
      let javaRows = null,
        merged = null;
      const targetSource = {
        repositoryId: info.revision.repositoryId,
        revisionId: info.revision.id,
        contentFingerprint: info.revision.contentFingerprint,
      };
      if (info.id.startsWith('J')) {
        const codeRoot = path.join(task, 'code-capture-01'),
          request = json(path.join(codeRoot, info.id + '.request.jsonl')),
          events = fs
            .readFileSync(path.join(codeRoot, info.id + '.output.jsonl'), 'utf8')
            .trim()
            .split('\n')
            .map(JSON.parse),
          settlement = json(path.join(codeRoot, info.id + '.settlement.json')),
          terminal = events.at(-1);
        const startedAt = new Date(settlement.startedAtEpochMs).toISOString(),
          settledAt = new Date(settlement.settledAtEpochMs).toISOString(),
          tool = { target: 'x86_64-pc-windows-msvc', profile: 'debug' };
        const snapshot = ProviderSnapshotSchema.parse({
          id: request.payload.providerSnapshotId,
          repositoryId: targetSource.repositoryId,
          providerId: 'native',
          providerVersion: '0.0.0',
          runtimeVersion: '0.0.0',
          requestedRevisionId: targetSource.revisionId,
          requestedRevisionFingerprint: targetSource.contentFingerprint,
          startedAt,
          completedAt: settledAt,
          capabilities: terminal.payload.capabilities,
          diagnostics: events.filter((e) => e.type === 'DIAGNOSTIC').map((e) => e.payload),
          outcome: terminal.payload.outcome,
        });
        const normalized = normalizeNativeAnalysis({ request, events, terminal });
        merged = mergeCanonicalObservations({
          repositoryId: targetSource.repositoryId,
          revisionId: targetSource.revisionId,
          observations: [{ snapshot, nodes: normalized.nodes, edges: normalized.edges }],
        });
        save(path.join(inputDir, info.id + '.code-owner-preview.json'), {
          kind: 'JAVA_CODE_ONLY_PREVIEW_NOT_MIXED_SNAPSHOT',
          snapshot,
          merged,
        });
        javaRows = {
          kind: 'SETTLED_JAVA_OWNER',
          schemaVersion: 1,
          targetSource,
          inventory: [info.sourceFile],
          snapshot: {
            id: snapshot.id,
            providerId: 'native',
            providerVersion: '0.0.0',
            runtimeVersion: '0.0.0',
            startedAt,
          },
          tool,
          java: {
            providerVersion: '0.0.0',
            runtimeVersion: '0.0.0',
            tool,
            startedAt,
            settledAt,
            request,
            events,
            terminal,
          },
        };
      }
      const owner = stage.prepareOwner(javaRows, {
          contracts,
          qualificationRef: 'AB_LIBRARY_COMPONENT_ONLY_NOT_PHYSICALLY_QUALIFIED',
        }),
        preparation = readMixedCodeSyntaxPreparation(stage, owner.ownerHandle);
      if (merged)
        for (const owner of preparation.owners) {
          assert(merged.nodes.some((n) => n.id === owner.canonicalRef.entity.id));
          assert(
            merged.bindings.some(
              (b) =>
                b.providerFact.factType === 'NODE' &&
                b.providerFact.providerFactId === owner.providerNodeRef.providerFactId &&
                b.canonicalFact.id === owner.canonicalRef.entity.id,
            ),
          );
        }
      const request = structuredClone(
        json(path.join(fixtureRoot, 'syntax-contract/binding-pipeline/inputs.json'))
          .requestTemplate,
      );
      request.protocolVersion = 8;
      request.requestId = 'ab-surface:' + info.id;
      const payload = request.payload;
      Object.assign(payload, {
        repository: {
          id: targetSource.repositoryId,
          rootPath: info.ownedRoot.replaceAll('\\', '/'),
        },
        providerSnapshotId: javaRows ? javaRows.snapshot.id : 'snapshot:ab:' + info.id,
        extractorVersion: 'syntax-v2',
        syntaxContract: 'SYNTAX_BINDING_V4',
        expectedActivationBasis: preparation.expectedActivationBasis,
        targetSource: preparation.targetSource,
        sourceFiles: preparation.sourceFiles,
        removedSourceFiles: preparation.removedSourceFiles,
        owners: preparation.owners,
        languages: [
          {
            languageId: info.sourceFile.languageHint,
            grammarVersion: info.id.startsWith('J') ? '0.23.5' : '0.25.0',
            analyzerVersion: '0.0.0',
            compatibilityVersion: 'syntax-v2',
          },
        ],
        deadlineEpochMs: null,
        ownerBinding: {
          kind: 'PROVISIONAL_CODE',
          stageDigest: owner.stageDigest,
          ownerMapDigest: '0'.repeat(64),
        },
      });
      payload.resourceBudget.maxEvents = 10000;
      payload.ownerBinding.ownerMapDigest = computeSyntaxOwnerMapDigest({
        expectedActivationBasis: payload.expectedActivationBasis,
        targetSource: payload.targetSource,
        providerId: payload.providerId,
        providerSnapshotId: payload.providerSnapshotId,
        sourceFiles: payload.sourceFiles,
        owners: payload.owners,
        ownerBinding: { kind: 'PROVISIONAL_CODE', stageDigest: owner.stageDigest },
      });
      FrameworkSurfaceRequestSchema.parse(request);
      save(path.join(inputDir, info.id + '.stage-preparation.json'), {
        kind: 'ACTUAL_OWNED_STAGE_PREPARATION',
        preparation,
        javaRows,
      });
      cases.push({ id: info.id, request });
    }
    save(path.join(inputDir, 'syntax-requests.json'), { kind: 'FIXED_AB_SURFACE_INPUT_V1', cases });
    save(path.join(inputDir, 'operation-identity.json'), {
      driverSha256: sha(fs.readFileSync(import.meta.filename)),
      nodeSha256: sha(fs.readFileSync(process.execPath)),
      libraryArtifact: artifact,
      sourceBasisKind: 'DECLARED_CONTROLLED_TEST_REVISION_REAL_VERIFIED_FILE_BYTES',
      liveStages: live.length,
      physicalQualification: false,
    });
    recordRun(
      label,
      artifact.path,
      command === 'syntax-red'
        ? [
            'framework_surface::tests::surface_source_truth',
            '--exact',
            '--ignored',
            '--test-threads=1',
          ]
        : ['framework_surface::tests::', '--include-ignored', '--test-threads=1'],
      { CODEATLAS_AB_BATCH_INPUT: inputDir, CODEATLAS_AB_BATCH_OUTPUT: output },
    );
  } finally {
    for (const entry of live.reverse()) {
      try {
        entry.stage?.close();
      } finally {
        if (entry.db.isOpen) entry.db.close();
      }
    }
  }
} else
  throw Error(
    'Explicit command required: prepare | compile prepare-01/prepare-02 | code | syntax-red',
  );
