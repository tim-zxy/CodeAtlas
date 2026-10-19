import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import {
  refreshTransportCases,
  buildRefreshTransportFinalObservation,
  buildRefreshTransportCandidate,
  collectRefreshTransportObservations,
  checkRefreshTransportInputFeasibility,
} from '../../../../scripts/native-refresh-transport-memory.mjs';
import { nativeRefreshTransportProfiles } from '../../dist/native-metadata-profiles.js';
import { compareCanonicalFacts } from '../../../evaluation/dist/index.js';
import {
  activationImage,
  assertSourceRelations,
  preparedSourceRefresh,
  sourceTransitions,
} from './native-refresh-source-fixture.mjs';
import {
  preparedSourceInputBoundary,
  preparedSharedOwnersBoundary,
  preparedCompleteCoverageBoundary,
} from './native-refresh-source-input-boundary.mjs';
import { preparedRetainedSitesBoundary } from './native-refresh-retained-sites-boundary.mjs';
import { preparedDenseRemoveBoundary } from './native-refresh-dense-remove-boundary.mjs';
import {
  prepareDenseUpsertBoundary,
  denseUpsertTransition,
} from './native-refresh-dense-upsert-boundary.mjs';
import { refreshTransportRecipes } from './native-refresh-transport-worker.mjs';
import { snapshotDRefreshFixtureContext } from './native-refresh-d-context.mjs';
import { nativeMetadataEnvironment } from '../../dist/native-metadata-admission.js';
import { hashRefreshCiFile } from '../../../../scripts/helpers/native-refresh-ci-layout.mjs';
import { createNativeRefreshPreparation } from '../../dist/native-refresh-preparation.js';
import { readNativeRefreshBaseline } from '../../../storage/dist/index.js';
import { validateNativeStateCandidate } from '../../../providers/dist/index.js';
import {
  validateRefreshOutputContract,
  verifyRefreshCancelledPrefix,
} from './native-refresh-cancel-prefix.mjs';

const replayOwners = new WeakMap();
export async function readRefreshReplayWorkloadControls(workloadCase, dContext) {
  const fixtureContext =
    dContext === undefined ? undefined : snapshotDRefreshFixtureContext(dContext);
  workloadCase = decodeRefreshReplayJson(encodeRefreshReplayJson(workloadCase));
  const exact = (value, keys) => assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
  exact(workloadCase, [
    ...(workloadCase.schemaVersion === 2 ? ['schemaVersion', 'outputContract'] : []),
    'name',
    'workspacePath',
    'databasePath',
    'coverage',
    'inputContract',
    'workload',
  ]);
  const { name, workspacePath, databasePath, workload } = workloadCase;
  assert.ok(workloadCase.schemaVersion === undefined || workloadCase.schemaVersion === 2);
  assert.ok(Object.hasOwn(refreshTransportRecipes, name), 'Unknown replay class');
  exact(workload, ['invocationPath', 'optionsPath', 'fault']);
  assert.equal(
    workload.fault,
    refreshTransportRecipes[name][1] !== 'SUCCEEDED' || ['d-slow-sink', 'd-reopen'].includes(name)
      ? name
      : null,
  );
  for (const target of [
    workspacePath,
    databasePath,
    workload.invocationPath,
    workload.optionsPath,
  ]) {
    assert.ok(path.isAbsolute(target) && path.resolve(target) === target);
    assert.equal(
      await realpath(target),
      target,
      'Replay path must retain its original real binding',
    );
    assert.equal((await lstat(target)).isSymbolicLink(), false);
  }
  assert.equal(path.dirname(databasePath), workspacePath);
  assert.ok((await lstat(databasePath)).isFile());
  assert.ok((await lstat(workload.invocationPath)).isFile());
  assert.ok((await lstat(workload.optionsPath)).isFile());
  const invocation = decodeRefreshReplayJson(await readFile(workload.invocationPath));
  const options = decodeRefreshReplayJson(await readFile(workload.optionsPath));
  exact(invocation, ['requestId', 'descriptor', 'trustedContext', 'payload']);
  exact(options, ['executablePath', 'arguments', 'timeoutMs', 'allowedEnvironment']);
  assert.equal(
    options.executablePath,
    fixtureContext?.executablePath ??
      fileURLToPath(
        new URL(
          `../../../../target/debug/codeatlas-native-analyzer${process.platform === 'win32' ? '.exe' : ''}`,
          import.meta.url,
        ),
      ),
  );
  assert.deepEqual(options.arguments, ['--parse-workers', '1']);
  assert.equal(options.timeoutMs, 10_000);
  assert.deepEqual(
    options.allowedEnvironment,
    fixtureContext?.allowedEnvironment ??
      Object.fromEntries(
        ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
          .filter((key) => process.env[key] !== undefined)
          .map((key) => [key, process.env[key]]),
      ),
  );
  for (const key of [
    'baseRevisionId',
    'baseRevisionFingerprint',
    'baselineState',
    'changes',
    'targetSourceFiles',
  ])
    assert.equal(
      Object.hasOwn(invocation.payload, key),
      false,
      'Cached derived input is forbidden',
    );
  assert.equal(invocation.payload.repository.rootPath, workspacePath);
  if (fixtureContext)
    assert.equal(
      invocation.payload.resourceBudget.maxMemoryBytes,
      fixtureContext.memoryBudgetBytes,
      'D fixture context caller input budget mismatch',
    );

  return { invocation, options };
}

const replayReceipts = new WeakMap();
async function writeReplayArtifact(file, bytes) {
  const writer = await open(file, 'wx');
  try {
    await writer.writeFile(bytes);
    await writer.sync();
  } finally {
    await writer.close();
  }
}

async function realRegular(file) {
  canonicalAbsolutePath(file);
  assert.equal(await realpath(file), file, 'Aliased replay path');
  const info = await lstat(file, { bigint: true });
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.nlink === 1n, 'Nonregular replay file');
  return info;
}
async function realDirectory(directory) {
  canonicalAbsolutePath(directory);
  assert.equal(await realpath(directory), directory, 'Aliased replay root');
  const info = await lstat(directory, { bigint: true });
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'Nonregular replay directory');
  return info;
}
const bytesHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pinFields = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'];
const samePin = (a, b, fields = pinFields) => fields.every((field) => a[field] === b[field]);

async function guardReplayLocation(owner, databasePresent = true) {
  assert.ok(
    samePin(await realDirectory(owner.workspacePath), owner.rootInfo, ['dev', 'ino']),
    'Workspace ownership changed',
  );
  const inventory = [];
  const walk = async (relative = '') => {
    for (const entry of await readdir(path.join(owner.workspacePath, relative), {
      withFileTypes: true,
    })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      assert.equal(entry.isSymbolicLink(), false, 'Linked replay destination');
      if (entry.isDirectory()) await walk(name);
      else {
        assert.ok(entry.isFile());
        inventory.push(name);
      }
    }
  };
  await walk();
  const databaseRelative = path
    .relative(owner.workspacePath, owner.databasePath)
    .split(path.sep)
    .join('/');
  assert.deepEqual(
    inventory.sort(),
    [
      ...owner.item.sourceFiles.map((file) => file.destinationPath),
      ...(databasePresent ? [databaseRelative] : []),
    ].sort(),
    'Unexpected replay files',
  );
  for (const file of owner.item.sourceFiles) {
    const source = owner.item.assets.find((asset) => asset.path === file.assetPath);
    const destination = path.join(owner.workspacePath, file.destinationPath);
    await realRegular(destination);
    assert.equal(bytesHash(await readFile(destination)), source.sha256, 'Replay source changed');
  }
  if (databasePresent) {
    assert.ok(
      samePin(await realRegular(owner.databasePath), owner.databaseInfo, ['dev', 'ino']),
      'Database ownership changed',
    );
    await assertClosedFile(owner.databasePath);
  }
}

async function revalidateReplayInputs(owner) {
  for (const pin of owner.pins) {
    assert.ok(samePin(await realRegular(pin.file), pin.info), 'Immutable replay input changed');
    assert.equal(bytesHash(await readFile(pin.file)), pin.sha256, 'Immutable replay bytes changed');
  }
  await verifyRefreshReplayDependencyCatalog(
    await discoverRefreshReplayDependencies(owner.dContext, owner.manifest.generator.revision),
    owner.binding.dependencyRoots,
    owner.manifest.generator.dependencies,
  );
}

// Full-corpus validation precedes the selected handoff. This establishes an
// original pristine binding, not admission, R1 coverage or a measured outcome.
export async function readRefreshTransportReplay(manifestPath, bindingPath, name, dContext) {
  assert.ok(refreshTransportCases.includes(name), 'Unknown replay case');
  return (await readRefreshTransportReplays(manifestPath, bindingPath, [name], dContext))[0];
}

export async function readRefreshTransportReplayCorpus(manifestPath, bindingPath, dContext) {
  return readRefreshTransportReplays(manifestPath, bindingPath, refreshTransportCases, dContext);
}

async function readRefreshTransportReplays(manifestPath, bindingPath, names, dContext) {
  const fixtureContext =
    dContext === undefined ? undefined : snapshotDRefreshFixtureContext(dContext);
  await realRegular(manifestPath);
  await realRegular(bindingPath);
  const manifestBytes = await readFile(manifestPath),
    bindingBytes = await readFile(bindingPath);
  const manifest = validateRefreshReplayManifestRecord(decodeRefreshReplayJson(manifestBytes));
  const binding = validateRefreshReplayLocalBindingRecord(
    decodeRefreshReplayJson(bindingBytes),
    manifest,
  );
  await realDirectory(binding.artifactRoot);
  await realDirectory(binding.replayRoot);
  for (const [a, b] of [
    [binding.artifactRoot, binding.replayRoot],
    [binding.replayRoot, binding.artifactRoot],
  ]) {
    const relative = path.relative(a, b);
    assert.ok(
      path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep),
      'Mutable and immutable replay roots overlap',
    );
  }
  await verifyRefreshReplayDependencyCatalog(
    await discoverRefreshReplayDependencies(fixtureContext, manifest.generator.revision),
    binding.dependencyRoots,
    manifest.generator.dependencies,
  );
  const pins = [];
  const pin = async (file, sha256) => pins.push({ file, sha256, info: await realRegular(file) });
  await pin(manifestPath, bytesHash(manifestBytes));
  await pin(bindingPath, bytesHash(bindingBytes));
  const selected = [];
  for (const item of manifest.cases) {
    assert.deepEqual(
      item.coverage,
      replayCoverage(item.name),
      'Case coverage differs from the producer catalog',
    );
    for (const asset of item.assets) {
      const file = path.join(binding.artifactRoot, asset.path);
      await realRegular(file);
      await verifyRefreshReplayAsset(binding.artifactRoot, asset);
      await pin(file, asset.sha256);
      if (asset.kind === 'SQLITE') await assertClosedFile(file);
    }
    const capsule = validateRefreshReplayCapsuleRecord(
      decodeRefreshReplayJson(await readFile(path.join(binding.artifactRoot, item.capsulePath))),
      manifest,
      binding,
    );
    const workspacePath = capsule.workspacePath,
      databasePath = capsule.databasePath;
    const rootInfo = await realDirectory(workspacePath),
      databaseInfo = await realRegular(databasePath);
    const seed = item.assets.find((asset) => asset.path === item.seedPath);
    assert.equal(
      bytesHash(await readFile(databasePath)),
      seed.sha256,
      'Initial working image is not the original pristine seed',
    );
    const owner = {
      manifestPath,
      bindingPath,
      manifest,
      binding,
      item,
      capsule,
      workspacePath,
      databasePath,
      rootInfo,
      databaseInfo,
      pins,
      stage: 'PRISTINE',
      active: false,
      sequence: 0,
      currentReceipt: null,
      dContext: fixtureContext,
    };
    await guardReplayLocation(owner);
    const { invocation, options } = await readRefreshReplayWorkloadControls(
      {
        ...capsule,
        workload: {
          ...capsule.workload,
          invocationPath: path.join(binding.artifactRoot, capsule.workload.invocationPath),
          optionsPath: path.join(binding.artifactRoot, capsule.workload.optionsPath),
        },
      },
      fixtureContext,
    );
    recordKeys(invocation, ['requestId', 'descriptor', 'trustedContext', 'payload']);
    for (const key of [
      'baseRevisionId',
      'baseRevisionFingerprint',
      'baselineState',
      'changes',
      'targetSourceFiles',
    ])
      assert.equal(
        Object.hasOwn(invocation.payload, key),
        false,
        'Cached derived invocation field',
      );
    assert.equal(invocation.payload.repository.rootPath, workspacePath);
    assert.equal(invocation.payload.repository.id, item.binding.repositoryId);
    assert.equal(invocation.requestId, `source-refresh-${item.sourceTransition}`);
    assert.equal(invocation.payload.providerSnapshotId, 'snapshot-source-refresh');
    // Reuse the production validator against the immutable seed outside the
    // measured role. Discard its preparation; the fresh child must read again.
    readSnapshot(path.join(binding.artifactRoot, item.seedPath), (db) => {
      assert.deepEqual(
        db
          .prepare('SELECT id,root_path FROM repository')
          .all()
          .map((row) => ({ ...row })),
        [{ id: item.binding.repositoryId, root_path: workspacePath }],
      );
      const sources = db
        .prepare('SELECT path,content_fingerprint FROM source_files ORDER BY path')
        .all();
      assert.deepEqual(
        sources.map((row) => row.path),
        item.sourceFiles.map((file) => file.destinationPath),
      );
      for (const source of sources) {
        const declared = item.sourceFiles.find((file) => file.destinationPath === source.path);
        assert.equal(
          source.content_fingerprint,
          'sha256:' + item.assets.find((asset) => asset.path === declared.assetPath).sha256,
        );
      }
      const budget = invocation.payload.resourceBudget.maxMemoryBytes;
      const baseline = readNativeRefreshBaseline(
        db,
        invocation.trustedContext,
        validateNativeStateCandidate,
        { maxSerializedBytes: 1_000_000, memoryBudgetBytes: budget },
      );
      if (item.name === 'd-sql-preflight') {
        assert.deepEqual(baseline, { status: 'UNAVAILABLE', reason: 'RESOURCE_LIMIT_EXCEEDED' });
        assert.throws(
          () => createNativeRefreshPreparation(invocation, baseline, budget, options),
          (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
        );
      } else {
        assert.equal(baseline.status, 'AVAILABLE');
        createNativeRefreshPreparation(invocation, baseline, budget, options);
      }
    });
    const golden = decodeRefreshReplayJson(
      await readFile(path.join(binding.artifactRoot, item.oracle.sourceGoldenPath)),
    );
    recordKeys(golden, ['transition', 'trials']);
    assert.equal(golden.transition.id, item.sourceTransition);
    assert.equal(golden.trials.length, 2);
    assert.deepEqual(
      Object.keys(golden.transition.target).sort(),
      item.sourceFiles.map((file) => file.destinationPath),
    );
    const original = sourceTransitions.find(
      (transition) => transition.id === item.sourceTransition,
    );
    if (original)
      assert.deepEqual(
        golden.transition,
        original,
        'Source golden differs from the original Fixture',
      );
    for (const trial of golden.trials) {
      recordKeys(trial, ['receiptPath', 'databasePath']);
      assert.equal(item.assets.find((asset) => asset.path === trial.receiptPath)?.kind, 'ORACLE');
      assert.equal(item.assets.find((asset) => asset.path === trial.databasePath)?.kind, 'SQLITE');
    }
    if (manifest.schemaVersion === 2 && item.name === 'd-cancel') {
      const { qualifyRefreshCancelReference } =
        await import('./native-refresh-cancel-reference.mjs');
      owner.cancelReference = await qualifyRefreshCancelReference(
        binding.artifactRoot,
        {
          ...item,
          sourceHashes: item.sourceFiles.map((file) => ({
            path: file.destinationPath,
            sha256: item.assets.find((asset) => asset.path === file.assetPath).sha256,
          })),
        },
        {
          invocationPath: path.join(binding.artifactRoot, capsule.workload.invocationPath),
          optionsPath: path.join(binding.artifactRoot, capsule.workload.optionsPath),
        },
      );
    }
    if (names.includes(item.name)) selected.push(owner);
  }
  await revalidateReplayInputs(selected[0]);
  return selected.map((owner) => {
    const value = freezeReplayRecord({
      ...(manifest.schemaVersion === 2
        ? {
            schemaVersion: 2,
            outputContract: owner.item.outputContract,
            evidenceRoot: path.dirname(path.dirname(binding.replayRoot)),
          }
        : {}),
      name: owner.item.name,
      manifestPath,
      bindingPath,
      workspacePath: owner.workspacePath,
      databasePath: owner.databasePath,
      identity: {
        environment: nativeMetadataEnvironment(),
        corpus: manifest.corpus,
        inputs: Object.fromEntries(
          manifest.cases.map((item) => [
            item.name,
            {
              ...item.inputContract,
              ...(manifest.schemaVersion === 2
                ? {
                    outputContract: item.outputContract,
                    outputReference:
                      item.name === 'd-cancel'
                        ? {
                            responseSha256: item.assets.find(
                              (asset) => asset.path === item.outputContract.referencePath,
                            ).sha256,
                            provenanceSha256: item.assets.find(
                              (asset) => asset.path === item.outputContract.provenancePath,
                            ).sha256,
                          }
                        : null,
                  }
                : {}),
            },
          ]),
        ),
      },
      coverage: owner.item.coverage,
      caseDigest: owner.item.caseDigest,
      oraclePaths: owner.item.assets
        .filter(
          (asset) =>
            ['ORACLE', 'SQLITE'].includes(asset.kind) && asset.path !== owner.item.seedPath,
        )
        .map((asset) => path.join(binding.artifactRoot, asset.path)),
      capsulePath: path.join(binding.artifactRoot, owner.item.capsulePath),
      capsuleSha256: owner.item.assets.find((asset) => asset.path === owner.item.capsulePath)
        .sha256,
    });
    replayOwners.set(value, owner);
    return value;
  });
}

export async function restoreRefreshTransportReplay(value) {
  const owner = replayOwners.get(value);
  assert.ok(owner, 'Replay requires its original issued ownership record');
  assert.equal(owner.active, false, 'Replay operation is active');
  await revalidateReplayInputs(owner);
  await guardReplayLocation(owner);
  const seed = owner.item.assets.find((asset) => asset.path === owner.item.seedPath);
  if (owner.stage === 'PRISTINE') {
    // An initial restore is idempotent and writes nothing. Changed/unowned state
    // cannot be adopted merely because a caller supplies a matching case shape.
    assert.equal(
      bytesHash(await readFile(owner.databasePath)),
      seed.sha256,
      'Unverified working state',
    );
    return { workspacePath: owner.workspacePath, databasePath: owner.databasePath };
  }
  assert.equal(
    owner.stage,
    'VERIFIED',
    'A settled parent-owned verification receipt is required before restoration',
  );
  const issued = replayReceipts.get(owner.currentReceipt);
  assert.ok(
    issued && issued.owner === owner && issued.verification,
    'Original verification receipt required',
  );
  await guardIssuedReplayReceipt(issued);
  assert.equal(owner.currentReceipt.transactionClosed, true);
  assert.equal(owner.currentReceipt.tempClosed, true);
  const archive = path.join(issued.artifactDirectory, 'original-result.sqlite');
  try {
    await lstat(archive);
    assert.fail('Restore archive already exists');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await guardReplayLocation(owner);
  owner.stage = 'RESTORING';
  await rename(owner.databasePath, archive);
  assert.ok(samePin(await realRegular(archive), owner.databaseInfo, ['dev', 'ino']));
  assert.equal(bytesHash(await readFile(archive)), issued.resultSha256);
  await guardReplayLocation(owner, false);
  await copyFile(
    path.join(owner.binding.artifactRoot, owner.item.seedPath),
    owner.databasePath,
    constants.COPYFILE_EXCL,
  );
  owner.databaseInfo = await realRegular(owner.databasePath);
  assert.equal(bytesHash(await readFile(owner.databasePath)), seed.sha256);
  await guardReplayLocation(owner);
  owner.stage = 'PRISTINE';
  owner.currentReceipt = null;
  return { workspacePath: owner.workspacePath, databasePath: owner.databasePath };
}

// One fixed fresh functional child, not a callback/receipt registration API or
// measurement path. Parent-owned capture is the authority for later restore.
export async function runRefreshTransportFunctionalReplay(value) {
  return runOwnedRefreshReplay(value);
}

export async function runRefreshTransportMeasuredReplay(value, mode, repetition) {
  assert.ok(['offline', 'actual'].includes(mode));
  nonnegative(repetition);
  return runOwnedRefreshReplay(value, { mode, repetition });
}

// File-backed independent candidate/holdout check. One full original corpus
// traversal per collector, then only the cancelled rows' archived evidence.
export async function createRefreshTransportPrefixAudit(root, identity, dContext) {
  const manifestPath = path.join(root, 'corpus/artifacts/manifest.json');
  const bindingPath = path.join(root, 'corpus/local-binding.json');
  const values = await readRefreshTransportReplayCorpus(manifestPath, bindingPath, dContext);
  const value = values.find((entry) => entry.name === 'd-cancel');
  const owner = replayOwners.get(value);
  assert.equal(value.schemaVersion, 2);
  assert.deepEqual(value.identity, identity, 'Prefix evidence corpus identity changed');
  assert.equal(value.evidenceRoot, root);
  return async (row) => {
    assert.equal(row.name, 'd-cancel');
    await revalidateReplayInputs(owner);
    const descriptor = row.outputProof.artifact;
    recordKeys(descriptor, ['path', 'sha256']);
    const proofFile = await confinedFile(root, descriptor.path);
    await realRegular(proofFile);
    const proofBytes = await readFile(proofFile);
    assert.equal(bytesHash(proofBytes), descriptor.sha256, 'Prefix proof artifact changed');
    const artifact = decodeRefreshReplayJson(proofBytes);
    recordKeys(artifact, [
      'schemaVersion',
      'kind',
      'caseDigest',
      'corpusDigest',
      'manifestSha256',
      'verification',
      'assets',
    ]);
    assert.equal(artifact.schemaVersion, 2);
    assert.equal(artifact.kind, 'CANCELLED_PREFIX_VERIFICATION');
    assert.equal(artifact.caseDigest, value.caseDigest);
    assert.equal(artifact.corpusDigest, identity.corpus.digest);
    assert.equal(artifact.manifestSha256, bytesHash(await readFile(manifestPath)));
    recordKeys(artifact.assets, ['envelope', 'sidecar', 'process', 'result']);
    const opened = {};
    for (const [name, asset] of Object.entries(artifact.assets)) {
      recordKeys(asset, ['path', 'bytes', 'sha256']);
      const file = await confinedFile(root, asset.path);
      await realRegular(file);
      const bytes = await readFile(file);
      assert.equal(bytes.length, asset.bytes);
      assert.equal(bytesHash(bytes), asset.sha256);
      opened[name] = { file, bytes };
    }
    const envelope = decodeRefreshReplayJson(opened.envelope.bytes);
    recordKeys(envelope, ['pid', 'processIdentity', 'receipt', 'sidecar']);
    const sidecar = decodeRefreshReplayJson(opened.sidecar.bytes);
    recordKeys(sidecar, [
      'schemaVersion',
      'wireEvidence',
      'snapshotMetadata',
      'mainApplyCalls',
      'competitorCommits',
      'cleanupFailureText',
    ]);
    assert.equal(sidecar.schemaVersion, 2);
    assert.equal(sidecar.mainApplyCalls, 0);
    assert.equal(sidecar.competitorCommits, 0);
    assert.equal(sidecar.cleanupFailureText, null);
    assert.equal(envelope.sidecar.path, opened.sidecar.file);
    assert.equal(envelope.sidecar.sha256, artifact.assets.sidecar.sha256);
    assert.deepEqual(envelope.receipt.artifactPaths, [opened.sidecar.file]);
    const processRecord = decodeRefreshReplayJson(opened.process.bytes);
    recordKeys(processRecord, ['pid', 'status', 'signal', 'error']);
    assert.equal(processRecord.pid, envelope.pid);
    assert.equal(envelope.processIdentity.pid, envelope.pid);
    assert.ok(Number.isSafeInteger(envelope.pid) && envelope.pid > 0);
    assert.ok(
      typeof envelope.processIdentity.nonce === 'string' && envelope.processIdentity.nonce.length,
    );
    assert.equal(processRecord.status, 0);
    assert.equal(processRecord.signal, null);
    assert.equal(processRecord.error, null);
    const receipt = envelope.receipt;
    assert.equal(receipt.observedOutcome, 'CANCELLED');
    assert.equal(
      receipt.operationFailureText?.split('\n')[0],
      'NativeClientError: Native request was cancelled',
    );
    assert.equal(sidecar.wireEvidence.outputBytes, receipt.physical.outputBytes);
    assert.equal(sidecar.wireEvidence.eventCount, receipt.physical.eventCount);
    const outputProof = {
      ...(await verifyRefreshCancelledPrefix(
        owner.binding.artifactRoot,
        owner.cancelReference.referenceAsset,
        {
          requestSha256: owner.cancelReference.requestSha256,
          wireEvidence: sidecar.wireEvidence,
        },
      )),
      provenanceSha256: owner.cancelReference.provenanceAsset.sha256,
    };
    const seed = owner.item.assets.find((asset) => asset.path === owner.item.seedPath);
    const seedFile = path.join(owner.binding.artifactRoot, seed.path);
    const oracle = { ...seed, path: path.relative(root, seedFile).split(path.sep).join('/') };
    assert.equal(
      await verifyRefreshReplayPreservedSourceActivation(root, artifact.assets.result.path, oracle),
      true,
    );
    const schema = (db) => ({
      version: db.prepare('PRAGMA user_version').get().user_version,
      objects: db
        .prepare(
          "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
        )
        .all()
        .map((row) => ({ ...row })),
      foreignKeys: db
        .prepare('PRAGMA foreign_key_check')
        .all()
        .map((row) => ({ ...row })),
    });
    assert.deepEqual(readSnapshot(opened.result.file, schema), readSnapshot(seedFile, schema));
    const proof = {
      outputProof,
      persistentStateVerified: true,
      transactionClosed: true,
      tempClosed: true,
      expectedOutcomeVerified: true,
    };
    const core = {
      ...proof,
      verificationDigest: identityHash('p05-refresh-replay-verification-v2', {
        caseDigest: value.caseDigest,
        resultSha256: artifact.assets.result.sha256,
        receiptSha256: artifact.assets.envelope.sha256,
        sidecarSha256: artifact.assets.sidecar.sha256,
        proof,
      }),
    };
    assert.deepEqual(artifact.verification, core, 'Forged prefix verification');
    assert.deepEqual(
      row,
      buildRefreshTransportFinalObservation(
        value,
        receipt,
        { ...core, proofArtifact: descriptor },
        row.repetition,
      ),
    );
    for (const [name, asset] of Object.entries(artifact.assets))
      assert.equal(bytesHash(await readFile(opened[name].file)), asset.sha256);
    assert.equal(bytesHash(await readFile(proofFile)), descriptor.sha256);
    await assertClosedFile(opened.result.file);
    await revalidateReplayInputs(owner);
    return Object.freeze({
      artifactSha256: descriptor.sha256,
      processNonce: envelope.processIdentity.nonce,
    });
  };
}

// Fixed CLI owner: no supplied child runner, receipt registration or admission
// override. All preparation/oracles remain outside each measured process.
export async function runRefreshTransportCommand(args, dContext) {
  const fixtureContext =
    dContext === undefined ? undefined : snapshotDRefreshFixtureContext(dContext);
  const [command, a, b, c] = args;
  let actualExportRoot;
  const paths = (root) => ({
    manifestPath: path.join(root, 'corpus', 'artifacts', 'manifest.json'),
    bindingPath: path.join(root, 'corpus', 'local-binding.json'),
  });
  const readCases = async (root) => {
    const { manifestPath, bindingPath } = paths(root);
    const values = await readRefreshTransportReplayCorpus(
      manifestPath,
      bindingPath,
      fixtureContext,
    );
    assert.equal(values[0].schemaVersion, 2, 'Operational evidence requires v2 corpus');
    return values;
  };
  const measure = async (value, mode, repetition) => {
    let primaryFailure;
    try {
      const result = await runRefreshTransportMeasuredReplay(value, mode, repetition);
      // Recheck the original pinned receipt and metadata immediately before final
      // projection. A copied record or post-verification sidecar drift refuses.
      await verifyRefreshTransportReplay(value, result.receipt);
      let row;
      try {
        row = buildRefreshTransportFinalObservation(
          value,
          result.receipt,
          result.verification,
          repetition,
        );
        await writeReplayArtifact(
          path.join(result.artifactDirectory, 'observation.json'),
          encodeRefreshReplayJson(row),
        );
      } finally {
        // Restoration is allowed only after owned verification and preservation.
        await restoreRefreshTransportReplay(value);
      }
      return row;
    } catch (error) {
      primaryFailure = error;
      throw error;
    } finally {
      const owner = replayOwners.get(value);
      if (actualExportRoot && owner?.lastAttemptArtifactDirectory) {
        try {
          await exportRefreshTransportAttempt(value, path.join(actualExportRoot, value.name));
        } catch (error) {
          await writeReplayArtifact(
            path.join(actualExportRoot, value.name + '-export-failure.json'),
            encodeRefreshReplayJson({
              code: 'ACTUAL_ARTIFACT_EXPORT_FAILED',
              name: value.name,
              hasPrimaryFailure: primaryFailure !== undefined,
            }),
          );
          if (primaryFailure)
            throw new AggregateError(
              [primaryFailure, error],
              'Actual attempt and artifact export failed',
            );
          throw error;
        }
      }
    }
  };
  if (command === 'candidate') {
    assert.equal(args.length, 4);
    const root = await realpath(b);
    const destination = path.resolve(c);
    assert.equal(path.dirname(destination), root, 'Candidate must be beside its evidence');
    const [value] = await readCases(root);
    const candidate = await buildRefreshTransportCandidate(a, root, value.identity, fixtureContext);
    await writeReplayArtifact(destination, Buffer.from(JSON.stringify(candidate, null, 2) + '\n'));
    return candidate;
  }
  assert.ok(
    (command === 'bench' && args.length === 2) ||
      (command === 'collect' && args.length === 4 && ['candidate', 'approved'].includes(a)),
  );
  const output = path.resolve(command === 'bench' ? a : c);
  await realDirectory(path.dirname(output));
  await mkdir(output); // Never adopt or overwrite another run's directory.
  try {
    if (command === 'bench') {
      await prepareRefreshTransportCorpus(path.join(output, 'corpus'), fixtureContext);
      const values = await readCases(output);
      const identity = values[0].identity;
      const qualification = { cases: [], failures: [] };
      const qualificationRows = [];
      for (const value of values) {
        try {
          qualificationRows.push(await measure(value, 'offline', 0));
          qualification.cases.push({ name: value.name, passed: true });
        } catch (error) {
          qualification.failures.push({ name: value.name, message: String(error.message) });
        }
      }
      await writeReplayArtifact(
        path.join(output, 'qualification.json'),
        encodeRefreshReplayJson(qualification),
      );
      assert.equal(
        qualification.failures.length,
        0,
        'Full22 qualification failed; calibration not started',
      );
      if (fixtureContext !== undefined) {
        const references = nativeRefreshTransportProfiles.filter(
          (profile) =>
            profile.workspace === 'REFRESH_TRANSPORT' &&
            Object.entries(identity.environment).every(([key, value]) => profile[key] === value),
        );
        assert.ok(references.length > 0, 'Missing known reviewed D feasibility reference');
        const feasibility = checkRefreshTransportInputFeasibility(
          fixtureContext.memoryBudgetBytes,
          Math.max(...references.map((profile) => profile.reservationBytes)),
          qualificationRows,
        );
        await writeReplayArtifact(
          path.join(output, 'input-feasibility.json'),
          encodeRefreshReplayJson(feasibility),
        );
      }
      const report = {
        schemaVersion: 2,
        workspace: 'REFRESH_TRANSPORT',
        environment: identity.environment,
        corpus: identity.corpus,
        observations: [],
        failures: [],
      };
      const reportPath = path.join(output, 'raw.json');
      await writeReplayArtifact(reportPath, Buffer.from(JSON.stringify(report, null, 2) + '\n'));
      for (const value of values)
        for (let repetition = 0; repetition < 5; repetition++) {
          try {
            report.observations.push(await measure(value, 'offline', repetition));
          } catch (error) {
            report.failures.push({ name: value.name, repetition, message: String(error.message) });
          }
          await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
        }
      await writeReplayArtifact(
        path.join(output, 'evidence-manifest.json'),
        Buffer.from(
          JSON.stringify(
            {
              schemaVersion: 2,
              workspace: 'REFRESH_TRANSPORT',
              environment: identity.environment,
              corpus: identity.corpus,
              reports: [{ path: 'raw.json', sha256: bytesHash(await readFile(reportPath)) }],
              priorApprovals: [],
            },
            null,
            2,
          ) + '\n',
        ),
      );
      return report;
    }
    const candidatePath = await realpath(b);
    if (a === 'approved') {
      actualExportRoot = path.join(output, 'originals');
      await mkdir(actualExportRoot);
    }
    const root = path.dirname(candidatePath);
    // Verification output is not calibration history; do not mutate the frozen
    // evidence tree or make its own in-progress holdout an input to itself.
    const relative = path.relative(root, output);
    assert.ok(
      path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep),
      'Collection output must be outside frozen evidence',
    );
    const candidateBytes = await readFile(candidatePath);
    const candidate = JSON.parse(candidateBytes);
    const manifestPath = await confinedFile(root, candidate.manifest.path);
    const values = await readCases(root);
    const identity = values[0].identity;
    assert.deepEqual(
      candidate,
      await buildRefreshTransportCandidate(manifestPath, root, identity, fixtureContext),
    );
    if (a === 'approved')
      assert.ok(
        nativeRefreshTransportProfiles.some(
          (profile) =>
            profile.workspace === 'REFRESH_TRANSPORT' &&
            Object.entries(identity.environment).every(([key, value]) => profile[key] === value) &&
            profile.transportCorpusRevision === identity.corpus.revision &&
            profile.transportCorpusDigest === identity.corpus.digest &&
            profile.memoryCandidateEvidenceDigest === bytesHash(candidateBytes) &&
            profile.memoryPolicyRevision === candidate.policyRevision &&
            profile.reservationBytes === candidate.reservationBytes,
        ),
        'Missing exact approved REFRESH_TRANSPORT profile',
      );
    return await collectRefreshTransportObservations(
      candidatePath,
      path.join(output, 'workers'),
      path.join(output, 'holdout.json'),
      async (name, repetition) => {
        const value = values.find((item) => item.name === name);
        const row = await measure(value, a === 'approved' ? 'actual' : 'offline', repetition);
        return { status: 0, stderr: '', error: null, stdout: JSON.stringify(row) };
      },
      identity,
      a === 'approved' ? 'ACTUAL_ADMITTED' : 'OFFLINE_CALIBRATION_ONLY',
      fixtureContext,
    );
  } catch (error) {
    await writeReplayArtifact(
      path.join(output, 'command-failure.json'),
      encodeRefreshReplayJson({ failure: String(error.message) }),
    );
    throw error;
  }
}

async function runOwnedRefreshReplay(value, measurement) {
  const owner = replayOwners.get(value);
  assert.ok(owner, 'Original replay ownership required');
  assert.equal(owner.active, false);
  assert.equal(owner.stage, 'PRISTINE');
  owner.active = true;
  let result;
  try {
    await revalidateReplayInputs(owner);
    await guardReplayLocation(owner);
    const seed = owner.item.assets.find((asset) => asset.path === owner.item.seedPath);
    assert.equal(bytesHash(await readFile(owner.databasePath)), seed.sha256);
    await realDirectory(path.dirname(owner.workspacePath));
    const artifactDirectory = await mkdtemp(
      path.join(path.dirname(owner.workspacePath), `qualification-${owner.sequence++}-`),
    );
    owner.lastAttemptArtifactDirectory = artifactDirectory;
    owner.lastAttemptArtifactInfo = await realDirectory(artifactDirectory);
    const capsule = owner.capsule;
    const envelope = measurement
      ? await runMeasuredReplay(value, artifactDirectory, measurement, owner.dContext)
      : await runFunctionalReplay(
          {
            ...capsule,
            inputContract: owner.item.inputContract,
            workload: {
              ...capsule.workload,
              invocationPath: path.join(
                owner.binding.artifactRoot,
                capsule.workload.invocationPath,
              ),
              optionsPath: path.join(owner.binding.artifactRoot, capsule.workload.optionsPath),
            },
          },
          artifactDirectory,
          0,
          owner.dContext,
        );
    let receipt = freezeReplayRecord(
      decodeRefreshReplayJson(encodeRefreshReplayJson(envelope.receipt)),
    );
    let functionalReceipt = receipt;
    if (measurement) {
      recordKeys(receipt, [
        ...(owner.manifest.schemaVersion === 2 ? ['schemaVersion'] : []),
        'name',
        'repetition',
        'mode',
        'caseDigest',
        'environment',
        'corpus',
        'physical',
        'sqlLifetime',
        'samples',
        'peakResidentBytes',
        'peakMethod',
        'peakUnits',
        'observedOutcome',
        'operationThrew',
        'operationFailureText',
        'captureFailed',
        'transactionClosed',
        'tempClosed',
        'admitted',
        'workspacePath',
        'artifactPaths',
      ]);
      assert.equal(receipt.name, value.name);
      assert.equal(receipt.mode, measurement.mode);
      assert.equal(receipt.repetition, measurement.repetition);
      assert.equal(receipt.caseDigest, value.caseDigest);
      assert.deepEqual(receipt.environment, value.identity.environment);
      assert.deepEqual(receipt.corpus, value.identity.corpus);
      assert.equal(receipt.workspacePath, value.workspacePath);
      const sidecar = decodeRefreshReplayJson(await readFile(envelope.sidecar.path));
      recordKeys(sidecar, [
        ...(owner.manifest.schemaVersion === 2 ? ['schemaVersion', 'wireEvidence'] : []),
        'snapshotMetadata',
        'mainApplyCalls',
        'competitorCommits',
        'cleanupFailureText',
      ]);
      functionalReceipt = freezeReplayRecord({
        ...(owner.manifest.schemaVersion === 2 ? { wireEvidence: sidecar.wireEvidence } : {}),
        observedOutcome: receipt.observedOutcome,
        operationThrew: receipt.operationThrew,
        operationFailureText: receipt.operationFailureText,
        transactionClosed: receipt.transactionClosed,
        tempClosed: receipt.tempClosed,
        physical: receipt.physical,
        snapshotMetadata: sidecar.snapshotMetadata,
        mainApplyCalls: sidecar.mainApplyCalls,
        competitorCommits: sidecar.competitorCommits,
      });
    }
    recordKeys(functionalReceipt, [
      ...(owner.manifest.schemaVersion === 2 ? ['wireEvidence'] : []),
      'observedOutcome',
      'operationThrew',
      'operationFailureText',
      'transactionClosed',
      'tempClosed',
      'mainApplyCalls',
      'competitorCommits',
      'physical',
      'snapshotMetadata',
    ]);
    const receiptPath = path.join(artifactDirectory, 'receipt.json');
    await writeReplayArtifact(receiptPath, encodeRefreshReplayJson(envelope));
    await guardReplayLocation(owner);
    const resultPath = path.join(artifactDirectory, 'result.sqlite');
    await copyFile(owner.databasePath, resultPath, constants.COPYFILE_EXCL);
    await assertClosedFile(resultPath);
    const artifacts = [];
    for (const file of [
      path.join(artifactDirectory, measurement ? 'worker.stdout' : 'trial-0.stdout'),
      path.join(artifactDirectory, measurement ? 'worker.stderr' : 'trial-0.stderr'),
      receiptPath,
      resultPath,
      ...(measurement ? [envelope.sidecar.path, path.join(artifactDirectory, 'process.json')] : []),
    ])
      artifacts.push({
        file,
        sha256: bytesHash(await readFile(file)),
        info: await realRegular(file),
      });
    const issued = {
      owner,
      receipt,
      functionalReceipt,
      artifactDirectory,
      artifacts,
      resultSha256: bytesHash(await readFile(resultPath)),
      verification: null,
      measurement: measurement ?? null,
    };
    assert.equal(bytesHash(await readFile(owner.databasePath)), issued.resultSha256);
    replayReceipts.set(receipt, issued);
    owner.currentReceipt = receipt;
    owner.stage = 'AWAITING_VERIFICATION';
    result = { receipt, artifactDirectory };
  } catch (error) {
    owner.stage = 'FAILED';
    throw error;
  } finally {
    owner.active = false;
  }
  const verification = await verifyRefreshTransportReplay(value, result.receipt);
  return { ...result, verification };
}

async function guardIssuedReplayReceipt(issued) {
  for (const pin of issued.artifacts) {
    assert.ok(samePin(await realRegular(pin.file), pin.info), 'Original receipt/artifact changed');
    assert.equal(bytesHash(await readFile(pin.file)), pin.sha256, 'Original receipt bytes changed');
  }
  assert.equal(
    bytesHash(await readFile(issued.owner.databasePath)),
    issued.resultSha256,
    'Unverified post-receipt database mutation',
  );
}

// A byte-preserving diagnostic copy, never replay/restore/admission authority.
export async function copyRefreshReplayAttemptArtifacts(sourceRoot, destinationRoot) {
  const rootInfo = await realDirectory(sourceRoot);
  await realDirectory(path.dirname(destinationRoot));
  for (const [a, b] of [
    [sourceRoot, destinationRoot],
    [destinationRoot, sourceRoot],
  ]) {
    const relative = path.relative(a, b);
    assert.ok(
      path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep),
      'Attempt export roots overlap',
    );
  }
  await mkdir(destinationRoot);
  const files = [];
  async function visit(relative) {
    const source = path.join(sourceRoot, relative);
    const info = await lstat(source, { bigint: true });
    if (info.isDirectory()) {
      await realDirectory(source);
      if (relative) await mkdir(path.join(destinationRoot, relative));
      const names = (await readdir(source)).sort();
      for (const name of names) await visit(relative ? relative + '/' + name : name);
      assert.deepEqual(
        (await readdir(source)).sort(),
        names,
        'Original attempt membership changed',
      );
      return;
    }
    canonicalRelativePath(relative);
    await realRegular(source);
    if (relative.endsWith('.sqlite')) await assertClosedFile(source);
    const sha256 = await hashRefreshCiFile(source);
    const destination = path.join(destinationRoot, relative);
    await copyFile(source, destination, constants.COPYFILE_EXCL);
    assert.equal(await hashRefreshCiFile(destination), sha256, 'Attempt export copy changed');
    assert.equal(await hashRefreshCiFile(source), sha256, 'Original attempt changed during export');
    assert.ok(samePin(await realRegular(source), info), 'Original attempt identity changed');
    files.push({ path: relative, bytes: Number(info.size), sha256 });
  }
  await visit('');
  assert.ok(samePin(await realDirectory(sourceRoot), rootInfo, ['dev', 'ino']));
  const record = {
    schemaVersion: 1,
    sourceRoot,
    files: files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  };
  await writeReplayArtifact(
    path.join(destinationRoot, 'export-manifest.json'),
    encodeRefreshReplayJson(record),
  );
  return freezeReplayRecord(record);
}

export async function exportRefreshTransportAttempt(value, destinationRoot) {
  const owner = replayOwners.get(value);
  assert.ok(
    owner?.lastAttemptArtifactDirectory && owner.lastAttemptArtifactInfo,
    'Original parent-owned attempt required',
  );
  assert.equal(owner.active, false, 'Attempt must settle before export');
  assert.ok(
    samePin(
      await realDirectory(owner.lastAttemptArtifactDirectory),
      owner.lastAttemptArtifactInfo,
      ['dev', 'ino'],
    ),
    'Original attempt directory changed',
  );
  return copyRefreshReplayAttemptArtifacts(owner.lastAttemptArtifactDirectory, destinationRoot);
}

// Independent read-only verification uses the actual pre-close flags issued by
// the original child. Reopening a verifier never substitutes for those flags.
export async function verifyRefreshTransportReplay(value, receiptValue) {
  const owner = replayOwners.get(value),
    issued = replayReceipts.get(receiptValue);
  assert.ok(
    owner && issued?.owner === owner && owner.currentReceipt === receiptValue,
    'Original parent-issued receipt required',
  );
  assert.equal(owner.active, false);
  assert.ok(['AWAITING_VERIFICATION', 'VERIFIED'].includes(owner.stage));
  await revalidateReplayInputs(owner);
  await guardReplayLocation(owner);
  await guardIssuedReplayReceipt(issued);
  const receipt = issued.functionalReceipt;
  const { item, binding } = owner;
  const oracle = item.assets.find((asset) => asset.path === item.oracle.statePath);
  const oraclePath = await verifyRefreshReplayAsset(binding.artifactRoot, oracle);
  const golden = decodeRefreshReplayJson(
    await readFile(path.join(binding.artifactRoot, item.oracle.sourceGoldenPath)),
  );
  const reference = decodeRefreshReplayJson(
    await readFile(path.join(binding.artifactRoot, golden.trials[0].receiptPath)),
  ).receipt;
  const invocation = decodeRefreshReplayJson(
    await readFile(path.join(binding.artifactRoot, owner.capsule.workload.invocationPath)),
  );
  const snapshots =
    item.expectedOutcome === 'SUCCEEDED'
      ? [{ role: 'MAIN', snapshotId: invocation.payload.providerSnapshotId }]
      : item.name === 'd-token-race'
        ? [{ role: 'COMPETITOR', snapshotId: 'snapshot-d5-competitor' }]
        : [];
  let persistentStateVerified = false;
  if (receipt.snapshotMetadata) {
    validateBoundSourceActivationParameters({
      actual: receipt.snapshotMetadata,
      reference: reference.snapshotMetadata,
      snapshots,
    });
    const expected = readSnapshot(oraclePath, sourceActivationImage);
    const actual = readSnapshot(owner.databasePath, sourceActivationImage);
    persistentStateVerified = compareBoundSourceActivationImages(actual, expected, {
      actual: receipt.snapshotMetadata,
      reference: reference.snapshotMetadata,
      snapshots,
    });
  }
  const schema = (db) => ({
    version: db.prepare('PRAGMA user_version').get().user_version,
    objects: db
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
      )
      .all()
      .map((row) => ({ ...row })),
    foreignKeys: db
      .prepare('PRAGMA foreign_key_check')
      .all()
      .map((row) => ({ ...row })),
  });
  persistentStateVerified &&= isDeepStrictEqual(
    readSnapshot(owner.databasePath, schema),
    readSnapshot(oraclePath, schema),
  );
  if (item.expectedOutcome === 'SUCCEEDED') {
    const graph = item.assets.find((asset) => asset.path === item.oracle.graphPath);
    const full = await verifyRefreshReplayAsset(binding.artifactRoot, graph);
    const comparison = compareCanonicalFacts({
      actual: readSnapshot(owner.databasePath, canonicalGraph),
      expected: readSnapshot(full, canonicalGraph),
    });
    persistentStateVerified &&= comparison.entries.every(
      (entry) =>
        entry.classification === null &&
        entry.differences.length === 0 &&
        entry.expected.id === entry.actual.id &&
        entry.expected.factKey === entry.actual.factKey,
    );
    try {
      readSnapshot(owner.databasePath, (db) =>
        assertSourceRelations(db, golden.transition.targetRelations),
      );
    } catch {
      persistentStateVerified = false;
    }
    await verifyRefreshReplayAsset(binding.artifactRoot, graph);
  }
  const { corpusPayloadDigest, expectedOutcome, ...physical } = item.inputContract;
  const cancelledPrefix = owner.manifest.schemaVersion === 2 && item.name === 'd-cancel';
  let outputProof = null;
  const fixedPhysical = (value) =>
    cancelledPrefix
      ? {
          inputBytes: value.inputBytes,
          largestLineBytes: value.largestLineBytes,
          summaryBytes: value.summaryBytes,
        }
      : value;
  if (cancelledPrefix) {
    const wire = receipt.wireEvidence;
    assert.equal(wire?.outputBytes, receipt.physical.outputBytes);
    assert.equal(wire?.eventCount, receipt.physical.eventCount);
    outputProof = {
      ...(await verifyRefreshCancelledPrefix(
        owner.binding.artifactRoot,
        owner.cancelReference.referenceAsset,
        {
          requestSha256: owner.cancelReference.requestSha256,
          wireEvidence: wire,
        },
      )),
      provenanceSha256: owner.cancelReference.provenanceAsset.sha256,
    };
  }
  const actualPreflight = receiptValue.mode === 'actual' && item.name === 'd-sql-preflight';
  let expectedOutcomeVerified =
    receipt.observedOutcome === item.expectedOutcome &&
    isDeepStrictEqual(fixedPhysical(receipt.physical), fixedPhysical(physical)) &&
    receipt.operationThrew ===
      (actualPreflight ||
        !['SUCCEEDED', 'RESOURCE_LIMIT_EXCEEDED'].includes(item.expectedOutcome)) &&
    receipt.mainApplyCalls ===
      (item.expectedOutcome === 'SUCCEEDED' || item.name === 'd-rollback' ? 1 : 0) &&
    receipt.competitorCommits === (['d-token-race', 'd-source-race'].includes(item.name) ? 1 : 0);
  expectedOutcomeVerified &&= actualPreflight
    ? receipt.operationFailureText?.split('\n')[0] ===
      'NativeStateValidationError: Native refresh baseline unavailable'
    : item.expectedOutcome === 'SUCCEEDED'
      ? receipt.operationFailureText === null
      : receipt.operationFailureText === null
        ? item.oracle.refusal.message === receipt.observedOutcome
        : receipt.operationFailureText.split('\n')[0] === item.oracle.refusal.message;
  await verifyRefreshReplayAsset(binding.artifactRoot, oracle);
  await guardIssuedReplayReceipt(issued);
  await revalidateReplayInputs(owner);
  const proof = {
    ...(owner.manifest.schemaVersion === 2 ? { outputProof } : {}),
    persistentStateVerified,
    transactionClosed: receipt.transactionClosed === true,
    tempClosed: receipt.tempClosed === true,
    expectedOutcomeVerified,
  };
  const core = {
    ...proof,
    verificationDigest: identityHash(
      `p05-refresh-replay-verification-v${owner.manifest.schemaVersion}`,
      {
        caseDigest: value.caseDigest,
        resultSha256: issued.resultSha256,
        ...(owner.manifest.schemaVersion === 2
          ? {
              receiptSha256: bytesHash(
                await readFile(path.join(issued.artifactDirectory, 'receipt.json')),
              ),
              sidecarSha256: issued.measurement
                ? bytesHash(await readFile(path.join(issued.artifactDirectory, 'metadata.json')))
                : null,
            }
          : { receipt: bytesHash(encodeRefreshReplayJson(receiptValue)) }),
        proof,
      },
    ),
  };
  let proofArtifact = null;
  if (cancelledPrefix && issued.measurement && !issued.verification) {
    assert.ok(
      proof.persistentStateVerified &&
        proof.expectedOutcomeVerified &&
        proof.transactionClosed &&
        proof.tempClosed,
      'Cancelled state/closure not verified',
    );
    const descriptor = async (name) => {
      const file = path.join(issued.artifactDirectory, name);
      const info = await realRegular(file);
      return {
        path: path.relative(value.evidenceRoot, file).split(path.sep).join('/'),
        bytes: Number(info.size),
        sha256: bytesHash(await readFile(file)),
      };
    };
    const artifact = {
      schemaVersion: 2,
      kind: 'CANCELLED_PREFIX_VERIFICATION',
      caseDigest: value.caseDigest,
      corpusDigest: owner.manifest.corpus.digest,
      manifestSha256: bytesHash(await readFile(owner.manifestPath)),
      verification: core,
      assets: {
        envelope: await descriptor('receipt.json'),
        sidecar: await descriptor('metadata.json'),
        process: await descriptor('process.json'),
        result: await descriptor('result.sqlite'),
      },
    };
    const file = path.join(issued.artifactDirectory, 'prefix-proof.json');
    await writeReplayArtifact(file, encodeRefreshReplayJson(artifact));
    const pin = { file, info: await realRegular(file), sha256: bytesHash(await readFile(file)) };
    issued.artifacts.push(pin);
    proofArtifact = {
      path: path.relative(value.evidenceRoot, file).split(path.sep).join('/'),
      sha256: pin.sha256,
    };
  } else if (issued.verification) proofArtifact = issued.verification.proofArtifact ?? null;
  const verification = freezeReplayRecord({
    ...core,
    ...(owner.manifest.schemaVersion === 2 ? { proofArtifact } : {}),
  });
  if (issued.verification) assert.deepEqual(verification, issued.verification);
  else {
    const file = path.join(issued.artifactDirectory, 'verification.json');
    const bytes = encodeRefreshReplayJson(verification);
    await writeReplayArtifact(file, bytes);
    issued.artifacts.push({ file, sha256: bytesHash(bytes), info: await realRegular(file) });
  }
  issued.verification = verification;
  owner.stage = 'VERIFIED';
  return verification;
}

// Expected call-path requirements, not observed lifetime evidence. Task2 must
// independently prove every disposition before any Task4 row can be eligible.
function replayCoverage(name) {
  const families = ['BASELINE_READ', 'PREPARATION', 'COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'];
  const main = Object.fromEntries(families.map((family) => [family, 'OBSERVED']));
  if (
    [
      'd-empty',
      'd-zero-fact',
      'd-preparation-input',
      'd-retained-sites',
      'd-shared-owners',
      'd-token-race',
    ].includes(name)
  )
    main.COMPLETION = main.NORMALIZE = 'PROVEN_NO_TEXT';
  if (['d-slow-stdin', 'd-cancel', 'd-corrupt', 'd-late-exit'].includes(name))
    for (const family of families.slice(2)) main[family] = 'PROVEN_NOT_REACHED';
  if (name === 'd-partial') {
    main.COMPLETION = 'PROVEN_NO_TEXT';
    for (const family of families.slice(3)) main[family] = 'PROVEN_NOT_REACHED';
  }
  if (name === 'd-source-race') {
    main.SEAL = 'PROVEN_NO_TEXT';
    main.APPLY = 'PROVEN_NOT_REACHED';
  }
  if (name === 'd-token-race') main.APPLY = 'PROVEN_NOT_REACHED';
  if (name === 'd-sql-preflight') {
    main.BASELINE_READ = 'PROVEN_NO_TEXT';
    for (const family of families.slice(1)) main[family] = 'PROVEN_NOT_REACHED';
  }
  const requirements = families.map((family) => ({
    family,
    role: 'MAIN',
    disposition: main[family],
  }));
  if (name === 'd-token-race')
    for (const family of families)
      requirements.push({
        family,
        role: 'COMPETITOR',
        disposition: ['COMPLETION', 'NORMALIZE'].includes(family) ? 'PROVEN_NO_TEXT' : 'OBSERVED',
      });
  if (name === 'd-source-race')
    requirements.push({ family: 'BASELINE_READ', role: 'COMPETITOR', disposition: 'OBSERVED' });
  if (name === 'd-reopen')
    for (const family of ['BASELINE_READ', 'PREPARATION', 'APPLY'])
      requirements.push({
        family,
        role: 'RETRY',
        disposition: family === 'APPLY' ? 'PROVEN_NOT_REACHED' : 'OBSERVED',
      });
  return requirements.sort((a, b) => lexical(a.family + '\0' + a.role, b.family + '\0' + b.role));
}
const lexical = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Own only the exclusively created output tree. Failed generation/reference
// artifacts remain here; never publish a partial Manifest or adopt an old tree.
export async function prepareRefreshTransportCorpus(outputDirectory, dContext) {
  const fixtureContext =
    dContext === undefined ? undefined : snapshotDRefreshFixtureContext(dContext);
  canonicalAbsolutePath(outputDirectory);
  assert.equal(await realpath(path.dirname(outputDirectory)), path.dirname(outputDirectory));
  await mkdir(outputDirectory);
  const artifactRoot = path.join(outputDirectory, 'artifacts');
  const replayRoot = path.join(outputDirectory, 'replay');
  await mkdir(artifactRoot);
  await mkdir(replayRoot);
  const catalog = await discoverRefreshReplayDependencies(fixtureContext);
  const cases = [];
  const retainedFixturePaths = [];
  const cleanupFailures = [];
  const save = async (relative, bytes) => {
    const destination = path.join(artifactRoot, relative);
    await writeReplayArtifact(destination, bytes);
    return {
      path: relative,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  };
  const copy = async (source, relative) => {
    await copyFile(source, path.join(artifactRoot, relative), constants.COPYFILE_EXCL);
    const bytes = await readFile(path.join(artifactRoot, relative));
    return {
      path: relative,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  };
  try {
    for (const name of [...refreshTransportCases].sort()) {
      const prefix = `cases/${name}`;
      await mkdir(path.join(artifactRoot, prefix), { recursive: true });
      await mkdir(path.join(replayRoot, name));
      const workspacePath = path.join(replayRoot, name, 'workspace');
      const cleanup = [];
      const resources = [];
      const lifetime = {
        after: (fn) => cleanup.push(fn),
        ownRefreshFixture: (resource) => resources.push(resource),
      };
      let f;
      let caseFailure;
      try {
        const boundary = ['d-preparation-input', 'd-slow-stdin'].includes(name)
          ? preparedSourceInputBoundary
          : name === 'd-shared-owners'
            ? preparedSharedOwnersBoundary
            : ['d-complete-coverage', 'd-overlay-retention'].includes(name)
              ? preparedCompleteCoverageBoundary
              : name === 'd-retained-sites'
                ? preparedRetainedSitesBoundary
                : name === 'd-dense-remove'
                  ? preparedDenseRemoveBoundary
                  : null;
        let transition = sourceTransitions.find(
          (row) => row.id === refreshTransportRecipes[name][0],
        );
        if (boundary) {
          const generated = await boundary(lifetime, undefined, workspacePath, fixtureContext);
          f = generated.fixture;
          transition = generated.transition;
          await save(
            `${prefix}/boundary.json`,
            encodeRefreshReplayJson({
              accepted: generated.accepted.metrics,
              next: generated.next.metrics,
            }),
          );
        } else {
          if (name === 'd-dense-upsert') {
            const generated = await prepareDenseUpsertBoundary(lifetime, undefined, fixtureContext);
            transition = denseUpsertTransition(generated.accepted.memberCount);
            await save(`${prefix}/boundary.json`, encodeRefreshReplayJson(generated));
          }
          f = await preparedSourceRefresh(
            lifetime,
            transition,
            1,
            undefined,
            workspacePath,
            fixtureContext,
          );
        }
        const {
          baseRevisionId,
          baseRevisionFingerprint,
          baselineState,
          changes,
          targetSourceFiles,
          ...payload
        } = f.prepared.request.payload;
        const invocation = {
          requestId: f.prepared.request.requestId,
          descriptor: f.prepared.descriptor,
          trustedContext: f.prepared.trustedContext,
          payload,
        };
        const assets = [];
        const add = (entry, kind) => {
          const asset = { ...entry, kind };
          assets.push(asset);
          return asset;
        };
        // Boundary receipts are preparation evidence; include their actual bytes.
        try {
          add(await fileAsset(artifactRoot, `${prefix}/boundary.json`), 'ORACLE');
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        const invocationPath = `${prefix}/invocation.json`,
          optionsPath = `${prefix}/options.json`;
        add(await save(invocationPath, encodeRefreshReplayJson(invocation)), 'REPLAY_CAPSULE');
        add(await save(optionsPath, encodeRefreshReplayJson(f.options)), 'REPLAY_CAPSULE');
        const sourceFiles = [];
        await mkdir(path.join(artifactRoot, prefix, 'source'));
        for (const file of [...f.targetFiles].sort((a, b) => lexical(a.path, b.path))) {
          canonicalRelativePath(file.path);
          const assetPath = `${prefix}/source/${file.path}`;
          await mkdir(path.dirname(path.join(artifactRoot, assetPath)), { recursive: true });
          const asset = add(await copy(path.join(workspacePath, file.path), assetPath), 'SOURCE');
          assert.equal('sha256:' + asset.sha256, file.contentFingerprint);
          sourceFiles.push({ destinationPath: file.path, assetPath });
        }
        if (name === 'd-sql-preflight')
          f.db
            .prepare(
              "UPDATE native_analysis_file SET summary_json=json_quote(printf('%.*c',?,'x')) WHERE source_file_id=(SELECT source_file_id FROM native_analysis_file ORDER BY source_path LIMIT 1)",
            )
            .run(f.prepared.limits.maxSerializedBytes - 1);
        f.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        f.db.close();
        for (const settle of cleanup.reverse()) await settle();
        cleanup.length = 0;
        resources.length = 0;
        await assertClosedFile(f.databasePath);
        const seedPath = `${prefix}/seed.sqlite`;
        const seed = add(await copy(f.databasePath, seedPath), 'SQLITE');
        const seedImage = readSnapshot(path.join(artifactRoot, seedPath), sourceActivationImage);
        const rootInfo = await lstat(workspacePath, { bigint: true });
        let databaseInfo = await lstat(f.databasePath, { bigint: true });
        const guardOwned = async (databasePresent = true) => {
          const currentRoot = await lstat(workspacePath, { bigint: true });
          assert.equal(await realpath(workspacePath), workspacePath);
          assert.ok(currentRoot.isDirectory() && !currentRoot.isSymbolicLink());
          assert.equal(currentRoot.dev, rootInfo.dev);
          assert.equal(currentRoot.ino, rootInfo.ino);
          if (databasePresent) {
            const current = await lstat(f.databasePath, { bigint: true });
            assert.ok(current.isFile() && !current.isSymbolicLink() && current.nlink === 1n);
            assert.equal(current.dev, databaseInfo.dev);
            assert.equal(current.ino, databaseInfo.ino);
          }
          const inventory = [];
          const walk = async (relative = '') => {
            for (const entry of await readdir(path.join(workspacePath, relative), {
              withFileTypes: true,
            })) {
              const part = relative ? `${relative}/${entry.name}` : entry.name;
              assert.equal(entry.isSymbolicLink(), false, 'Linked replay destination');
              if (entry.isDirectory()) await walk(part);
              else {
                assert.ok(entry.isFile());
                inventory.push(part);
              }
            }
          };
          await walk();
          assert.deepEqual(
            inventory.sort(),
            [
              ...sourceFiles.map((file) => file.destinationPath),
              ...(databasePresent ? ['repository.sqlite'] : []),
            ].sort(),
            'Unexpected replay file inventory',
          );
          for (const file of sourceFiles) {
            const source = assets.find((asset) => asset.path === file.assetPath);
            const current = await lstat(path.join(workspacePath, file.destinationPath), {
              bigint: true,
            });
            assert.ok(current.isFile() && !current.isSymbolicLink() && current.nlink === 1n);
            assert.equal(
              await realpath(path.join(workspacePath, file.destinationPath)),
              path.join(workspacePath, file.destinationPath),
            );
            assert.equal(
              createHash('sha256')
                .update(await readFile(path.join(workspacePath, file.destinationPath)))
                .digest('hex'),
              source.sha256,
            );
          }
        };
        assert.deepEqual(
          readSnapshot(
            path.join(artifactRoot, seedPath),
            (db) => db.prepare('SELECT root_path FROM repository').get().root_path,
          ),
          workspacePath,
        );
        const coverage = replayCoverage(name);
        const expectedOutcome = refreshTransportRecipes[name][1];
        const controlled =
          expectedOutcome !== 'SUCCEEDED' || ['d-slow-sink', 'd-reopen'].includes(name);
        const snapshots =
          expectedOutcome === 'SUCCEEDED'
            ? [{ role: 'MAIN', snapshotId: payload.providerSnapshotId }]
            : name === 'd-token-race'
              ? [{ role: 'COMPETITOR', snapshotId: 'snapshot-d5-competitor' }]
              : [];
        const workload = { invocationPath, optionsPath, fault: controlled ? name : null };
        const outputContract =
          name === 'd-cancel'
            ? {
                kind: 'CANCELLED_PREFIX',
                referencePath: `${prefix}/reference-0.jsonl`,
                provenancePath: `${prefix}/reference-provenance.json`,
              }
            : { kind: 'EXACT' };
        let cancelReference;
        if (name === 'd-cancel') {
          const { prepareRefreshCancelReference } =
            await import('./native-refresh-cancel-reference.mjs');
          cancelReference = await prepareRefreshCancelReference(
            {
              schemaVersion: 2,
              name,
              workspacePath,
              databasePath: f.databasePath,
              coverage,
              outputContract,
              inputContract: {
                corpusPayloadDigest: '0'.repeat(64),
                expectedOutcome,
                inputBytes: 0,
                largestLineBytes: 0,
                summaryBytes: 0,
                outputBytes: null,
                eventCount: null,
              },
              workload: {
                ...workload,
                invocationPath: path.join(artifactRoot, invocationPath),
                optionsPath: path.join(artifactRoot, optionsPath),
              },
            },
            path.join(artifactRoot, prefix),
            `${prefix}/`,
            fixtureContext,
          );
          for (const asset of cancelReference.assets) add(asset, asset.kind);
          await guardOwned();
        }
        const trials = [];
        let reference;
        for (let repetition = 0; repetition < 2; repetition++) {
          await guardOwned();
          const envelope = await runFunctionalReplay(
            {
              schemaVersion: 2,
              outputContract,
              name,
              workspacePath,
              databasePath: f.databasePath,
              coverage,
              inputContract: {
                corpusPayloadDigest: '0'.repeat(64),
                expectedOutcome,
                inputBytes: 0,
                largestLineBytes: 0,
                outputBytes: 0,
                eventCount: 0,
                summaryBytes: 0,
              },
              workload: {
                ...workload,
                invocationPath: path.join(artifactRoot, invocationPath),
                optionsPath: path.join(artifactRoot, optionsPath),
              },
            },
            path.join(artifactRoot, prefix),
            repetition,
            fixtureContext,
          );
          const receiptPath = `${prefix}/trial-${repetition}.json`;
          for (const stream of ['stdout', 'stderr'])
            add(await fileAsset(artifactRoot, `${prefix}/trial-${repetition}.${stream}`), 'ORACLE');
          add(await save(receiptPath, encodeRefreshReplayJson(envelope)), 'ORACLE');
          const receipt = envelope.receipt;
          if (name === 'd-cancel') {
            assert.equal(receipt.wireEvidence.outputBytes, receipt.physical.outputBytes);
            assert.equal(receipt.wireEvidence.eventCount, receipt.physical.eventCount);
            await verifyRefreshCancelledPrefix(artifactRoot, cancelReference.referenceAsset, {
              requestSha256: cancelReference.provenance.requestSha256,
              wireEvidence: receipt.wireEvidence,
            });
          }
          assert.equal(receipt.observedOutcome, expectedOutcome);
          assert.equal(receipt.transactionClosed, true);
          assert.equal(receipt.tempClosed, true);
          assert.ok(receipt.snapshotMetadata, 'Production snapshot capture unavailable');
          assert.deepEqual(
            receipt.snapshotMetadata.entries.map(({ role, snapshotId }) => ({ role, snapshotId })),
            snapshots,
          );
          assert.equal(
            receipt.mainApplyCalls,
            expectedOutcome === 'SUCCEEDED' || name === 'd-rollback' ? 1 : 0,
          );
          assert.equal(
            receipt.competitorCommits,
            ['d-token-race', 'd-source-race'].includes(name) ? 1 : 0,
          );
          await assertClosedFile(f.databasePath);
          await guardOwned();
          const databasePath = `${prefix}/trial-${repetition}.sqlite`;
          // Preserve the original result before exclusive original-location restore.
          await rename(f.databasePath, path.join(artifactRoot, databasePath));
          const image = add(await fileAsset(artifactRoot, databasePath), 'SQLITE');
          trials.push({ receiptPath, databasePath });
          if (repetition === 0) reference = { receipt, image };
          else {
            const fixedPhysical = (physical) =>
              name === 'd-cancel'
                ? {
                    inputBytes: physical.inputBytes,
                    largestLineBytes: physical.largestLineBytes,
                    summaryBytes: physical.summaryBytes,
                  }
                : physical;
            assert.deepEqual(
              fixedPhysical(receipt.physical),
              fixedPhysical(reference.receipt.physical),
              'Unstable physical identity; contract review required',
            );
            assert.equal(receipt.operationThrew, reference.receipt.operationThrew);
            assert.equal(
              receipt.operationFailureText?.split('\n')[0],
              reference.receipt.operationFailureText?.split('\n')[0],
            );
            assert.equal(
              await verifyRefreshReplayBoundSourceActivation(
                artifactRoot,
                databasePath,
                reference.image,
                {
                  actual: receipt.snapshotMetadata,
                  reference: reference.receipt.snapshotMetadata,
                  snapshots,
                },
              ),
              true,
            );
          }
          if (expectedOutcome !== 'SUCCEEDED' && !['d-token-race', 'd-source-race'].includes(name))
            assert.equal(
              await verifyRefreshReplayPreservedSourceActivation(artifactRoot, databasePath, seed),
              true,
            );
          if (name === 'd-source-race') {
            const files = f.targetFiles.map((file) => ({
              ...file,
              classification: { ...file.classification, role: 'TEST' },
            }));
            const fingerprint =
              'sha256:' + createHash('sha256').update(JSON.stringify(files)).digest('hex');
            const expected = {
              ...seedImage,
              revisions: seedImage.revisions
                .map((raw) => {
                  const row = JSON.parse(raw);
                  row.content_fingerprint = fingerprint;
                  return JSON.stringify(row);
                })
                .sort(),
              source_files: seedImage.source_files
                .map((raw) => {
                  const row = JSON.parse(raw);
                  row.role = 'TEST';
                  return JSON.stringify(row);
                })
                .sort(),
            };
            assert.deepEqual(
              readSnapshot(path.join(artifactRoot, databasePath), sourceActivationImage),
              expected,
            );
          }
          const db = new DatabaseSync(path.join(artifactRoot, databasePath), { readOnly: true });
          try {
            if (expectedOutcome === 'SUCCEEDED')
              assertSourceRelations(db, transition.targetRelations);
          } finally {
            db.close();
          }
          await verifyRefreshReplayAsset(artifactRoot, seed);
          await guardOwned(false);
          await copyFile(
            path.join(artifactRoot, seedPath),
            f.databasePath,
            constants.COPYFILE_EXCL,
          );
          databaseInfo = await lstat(f.databasePath, { bigint: true });
          await guardOwned();
          assert.deepEqual(
            await readFile(f.databasePath),
            await readFile(path.join(artifactRoot, seedPath)),
          );
        }
        let graphPath = null;
        if (expectedOutcome === 'SUCCEEDED') {
          const fullCleanup = [];
          const fullResources = [];
          let fullSucceeded = false;
          try {
            const full = await preparedSourceRefresh(
              {
                after: (fn) => fullCleanup.push(fn),
                ownRefreshFixture: (resource) => fullResources.push(resource),
              },
              {
                ...transition,
                baseline: transition.target,
                target: transition.target,
                baselineRelations: transition.targetRelations,
              },
              1,
              undefined,
              undefined,
              fixtureContext,
            );
            full.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
            full.db.close();
            graphPath = `${prefix}/target-full.sqlite`;
            const graph = add(await copy(full.databasePath, graphPath), 'SQLITE');
            const comparison = await compareRefreshReplayCanonicalGraph(
              artifactRoot,
              reference.image.path,
              graph,
            );
            assert.ok(
              comparison.entries.every(
                (entry) =>
                  entry.classification === null &&
                  entry.differences.length === 0 &&
                  entry.expected.id === entry.actual.id &&
                  entry.expected.factKey === entry.actual.factKey,
              ),
              'Independent target FULL differs',
            );
            fullSucceeded = true;
          } finally {
            for (const resource of fullResources) {
              try {
                resource.close();
              } catch (error) {
                cleanupFailures.push(String(error));
              }
            }
            if (fullSucceeded) for (const settle of fullCleanup.reverse()) await settle();
            else retainedFixturePaths.push(...fullResources.map((resource) => resource.directory));
          }
        }
        if (['d-partial', 'd-corrupt', 'd-late-exit', 'd-slow-stdin'].includes(name))
          add(
            await copy(
              fileURLToPath(new URL('./native-refresh-fault-process.mjs', import.meta.url)),
              `${prefix}/fault-child.mjs`,
            ),
            'FAULT_CHILD',
          );
        const sourceGoldenPath = `${prefix}/source-golden.json`;
        add(
          await save(sourceGoldenPath, encodeRefreshReplayJson({ transition, trials })),
          'ORACLE',
        );
        const inputContract = {
          expectedOutcome,
          ...reference.receipt.physical,
          ...(name === 'd-cancel' ? { outputBytes: null, eventCount: null } : {}),
        };
        const capsulePath = `${prefix}/capsule.json`;
        add(
          await save(
            capsulePath,
            encodeRefreshReplayJson({
              schemaVersion: 2,
              outputContract,
              name,
              workspacePath,
              databasePath: f.databasePath,
              coverage,
              inputContract,
              workload,
            }),
          ),
          'REPLAY_CAPSULE',
        );
        const item = {
          name,
          sourceTransition: transition.id,
          expectedOutcome,
          assets: assets.sort((a, b) => lexical(a.path, b.path)),
          seedPath,
          sourceFiles,
          capsulePath,
          oracle: {
            graphPath,
            statePath: reference.image.path,
            sourceGoldenPath,
            refusal:
              expectedOutcome === 'SUCCEEDED'
                ? null
                : {
                    code: expectedOutcome,
                    message:
                      reference.receipt.operationFailureText?.split('\n')[0] ?? expectedOutcome,
                    mainApplyCalls: reference.receipt.mainApplyCalls,
                    competitorCommits: reference.receipt.competitorCommits,
                  },
          },
          binding: {
            repositoryId: 'repo-fixture',
            workspacePath: 'workspace',
            databasePath: 'workspace/repository.sqlite',
          },
          coverage,
          inputContract,
          outputContract,
        };
        item.caseDigest = identityHash('p05-refresh-replay-case-v2', item);
        item.inputContract = { ...inputContract, corpusPayloadDigest: item.caseDigest };
        cases.push(item);
      } catch (error) {
        caseFailure = error;
        throw error;
      } finally {
        for (const resource of resources) {
          try {
            resource.close();
          } catch (error) {
            cleanupFailures.push(String(error));
            if (caseFailure === undefined) throw error;
          }
        }
        if (cleanup.length)
          retainedFixturePaths.push(...resources.map((resource) => resource.directory));
      }
    }
    await verifyRefreshReplayDependencyCatalog(
      await discoverRefreshReplayDependencies(fixtureContext),
      catalog.roots,
      catalog.dependencies,
    );
    const manifest = {
      schemaVersion: 2,
      workspace: 'REFRESH_TRANSPORT',
      corpus: { revision: 'p05-native-refresh-transport-memory-v1' },
      generator: { revision: 'p05-refresh-replay-v3', dependencies: catalog.dependencies },
      cases,
    };
    manifest.corpus.digest = identityHash('p05-refresh-replay-corpus-v2', manifest);
    validateRefreshReplayManifestRecord(manifest);
    const binding = {
      schemaVersion: 2,
      workspace: 'REFRESH_TRANSPORT',
      corpusDigest: manifest.corpus.digest,
      artifactRoot,
      replayRoot,
      dependencyRoots: catalog.roots,
    };
    validateRefreshReplayLocalBindingRecord(binding, manifest);
    const bindingPath = path.join(outputDirectory, 'local-binding.json');
    await writeReplayArtifact(bindingPath, encodeRefreshReplayJson(binding));
    const manifestPath = path.join(artifactRoot, 'manifest.json');
    await writeReplayArtifact(manifestPath, encodeRefreshReplayJson(manifest));
    return { manifestPath, bindingPath };
  } catch (error) {
    await writeFile(
      path.join(outputDirectory, 'preparation-failure.json'),
      encodeRefreshReplayJson({
        failure: String(error?.stack ?? error),
        retainedFixturePaths: [...new Set(retainedFixturePaths)].sort(),
        cleanupFailures,
      }),
      { flag: 'wx' },
    );
    throw error;
  }
}

async function fileAsset(root, relative) {
  const bytes = await readFile(path.join(root, relative));
  return {
    path: relative,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
async function assertClosedFile(file) {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    try {
      await lstat(file + suffix);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    assert.fail('SQLite sidecar remains; closed seed cannot be copied');
  }
  readSnapshot(file, (db) =>
    assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok'),
  );
}
async function runFunctionalReplay(value, directory, repetition, dContext) {
  const worker = new URL('./native-refresh-transport-worker.mjs', import.meta.url).href;
  const child = spawnSync(
    process.execPath,
    [
      '--disable-warning=ExperimentalWarning',
      '--input-type=module',
      '-e',
      `import {readFileSync} from 'node:fs'; import {executeRefreshTransportReplayCase,refreshReplayProcessIdentity} from ${JSON.stringify(worker)};
     const dContext=process.argv[1] === undefined ? undefined : JSON.parse(process.argv[1]);
     const receipt=await executeRefreshTransportReplayCase(JSON.parse(readFileSync(0,'utf8')), {dContext});
     process.stdout.write(JSON.stringify({pid:process.pid,processIdentity:refreshReplayProcessIdentity,receipt})+'\\n');`,
    ].concat(dContext === undefined ? [] : [JSON.stringify(dContext)]),
    {
      input: JSON.stringify(value),
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 1_000_000,
      ...(dContext === undefined
        ? {}
        : { env: { ...process.env, ...dContext.allowedEnvironment } }),
    },
  );
  await writeReplayArtifact(path.join(directory, `trial-${repetition}.stdout`), child.stdout ?? '');
  await writeReplayArtifact(path.join(directory, `trial-${repetition}.stderr`), child.stderr ?? '');
  if (child.error) throw child.error;
  assert.equal(child.status, 0, child.stderr);
  const envelope = JSON.parse(child.stdout);
  assert.equal(
    envelope.pid,
    child.pid,
    'Child-reported process must match the original spawned handle',
  );
  assert.equal(envelope.processIdentity.pid, child.pid);
  assert.ok(Number.isSafeInteger(envelope.pid) && envelope.pid !== process.pid);
  return envelope;
}

async function runMeasuredReplay(value, directory, { mode, repetition }, dContext) {
  const worker = fileURLToPath(
    new URL('./native-refresh-transport-replay-worker.mjs', import.meta.url),
  );
  const child = spawnSync(
    process.execPath,
    [
      '--disable-warning=ExperimentalWarning',
      worker,
      mode,
      value.capsulePath,
      value.capsuleSha256,
      value.caseDigest,
      value.identity.corpus.digest,
      String(repetition),
      ...(dContext === undefined ? [] : [JSON.stringify(dContext)]),
    ],
    {
      cwd: directory,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 1_000_000,
      ...(dContext === undefined
        ? {}
        : { env: { ...process.env, ...dContext.allowedEnvironment } }),
    },
  );
  await writeReplayArtifact(path.join(directory, 'worker.stdout'), child.stdout ?? '');
  await writeReplayArtifact(path.join(directory, 'worker.stderr'), child.stderr ?? '');
  await writeReplayArtifact(
    path.join(directory, 'process.json'),
    encodeRefreshReplayJson({
      pid: child.pid ?? null,
      status: child.status,
      signal: child.signal,
      error: child.error ? String(child.error.message) : null,
    }),
  );
  if (child.error) throw child.error;
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, '', 'Unexpected measurement diagnostics');
  const envelope = decodeRefreshReplayJson(Buffer.from(child.stdout));
  recordKeys(envelope, ['pid', 'processIdentity', 'receipt', 'sidecar']);
  assert.equal(envelope.pid, child.pid);
  assert.equal(envelope.processIdentity.pid, child.pid);
  assert.ok(
    typeof envelope.processIdentity.nonce === 'string' && envelope.processIdentity.nonce.length > 0,
  );
  assert.ok(Number.isSafeInteger(child.pid) && child.pid !== process.pid);
  recordKeys(envelope.sidecar, ['path', 'sha256']);
  assert.equal(envelope.sidecar.path, path.join(directory, 'metadata.json'));
  await realRegular(envelope.sidecar.path);
  assert.equal(bytesHash(await readFile(envelope.sidecar.path)), envelope.sidecar.sha256);
  assert.deepEqual(envelope.receipt.artifactPaths, [envelope.sidecar.path]);
  return envelope;
}

export async function discoverRefreshReplayDependencies(
  dContext,
  generatorRevision = 'p05-refresh-replay-v3',
) {
  const fixtureContext =
    dContext === undefined ? undefined : snapshotDRefreshFixtureContext(dContext);
  const repositoryPath = fileURLToPath(new URL('../../../../', import.meta.url));
  return discoverRefreshReplayDependenciesAt({
    repositoryPath,
    generatorRevision,
    nativeExecutablePath:
      fixtureContext?.executablePath ??
      path.join(
        repositoryPath,
        'target/debug',
        `codeatlas-native-analyzer${process.platform === 'win32' ? '.exe' : ''}`,
      ),
  });
}

// Private physical root-resolution seam for test fixtures; never accepts Manifest membership.
export async function discoverRefreshReplayDependenciesAt({
  repositoryPath,
  nativeExecutablePath,
  resolvePackageRoot = resolveInstalledPackage,
  generatorRevision = 'p05-refresh-replay-v3',
}) {
  assert.ok(
    ['p05-refresh-replay-v2', 'p05-refresh-replay-v3'].includes(generatorRevision),
    'Unsupported replay generator revision',
  );
  const repository = await realpath(repositoryPath);
  const native = await realpath(nativeExecutablePath);
  assert.ok((await lstat(nativeExecutablePath)).isFile(), 'Nonregular Native executable');
  const roots = new Map([
    ['repository', repository],
    ['native', path.dirname(native)],
  ]);
  const dependencies = new Map();
  const physicalPackages = new Set();
  const packageInventories = new Map();
  const packageIdentities = new Map();

  async function inventory(root, relative = '', skip = () => false) {
    const destination = path.join(root, relative);
    const info = await lstat(destination);
    assert.ok(!info.isSymbolicLink(), `Nonregular symbolic catalog path: ${destination}`);
    if (skip(relative)) {
      // Only the new workspace cache exception adds a single-link file rule.
      // Installed-package node_modules directories retain their original skip.
      if (relative.endsWith('/dist/.tsbuildinfo'))
        assert.ok(
          info.isFile() && info.nlink === 1,
          `Excluded catalog cache must be regular and unlinked: ${destination}`,
        );
      return [];
    }
    if (info.isDirectory()) {
      const entries = await readdir(destination);
      const files = [];
      for (const name of entries.sort()) {
        files.push(...(await inventory(root, relative ? `${relative}/${name}` : name, skip)));
      }
      return files;
    }
    assert.ok(info.isFile(), `Nonregular catalog path: ${destination}`);
    canonicalRelativePath(relative);
    const hash = createHash('sha256');
    const handle = await open(destination, 'r');
    try {
      const before = await handle.stat();
      for await (const bytes of handle.createReadStream({ autoClose: false })) hash.update(bytes);
      const after = await handle.stat();
      for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
        assert.equal(after[field], before[field], 'Catalog file changed during discovery');
      }
      assert.equal(await realpath(destination), destination, 'Catalog resolution changed');
      return [{ path: relative, sha256: hash.digest('hex') }];
    } finally {
      await handle.close();
    }
  }

  function include(name, entries) {
    for (const entry of entries) {
      const key = `${name}/${entry.path}`;
      assert.ok(
        !dependencies.has(key) || dependencies.get(key) === entry.sha256,
        'Catalog duplicate drift',
      );
      dependencies.set(key, entry.sha256);
    }
  }

  async function manifest(directory) {
    assert.ok(
      (await lstat(path.join(directory, 'package.json'))).isFile(),
      'Nonregular package manifest',
    );
    const value = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    assert.ok(
      typeof value.name === 'string' &&
        value.name.length > 0 &&
        typeof value.version === 'string' &&
        value.version.length > 0,
      'Invalid package identity',
    );
    return value;
  }

  // This repository's finite workspace syntax. Refuse unsupported YAML instead of
  // quietly enumerating only a subset of an unfamiliar installation layout.
  const workspace = await readFile(path.join(repository, 'pnpm-workspace.yaml'), 'utf8');
  const lines = workspace
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, '').trim())
    .filter((line) => line && !line.startsWith('#'));
  assert.equal(lines.shift(), 'packages:', 'Unsupported workspace catalog configuration');
  const patterns = lines.map((line) => {
    const match = /^-\s+(?:'([^']+)'|"([^"]+)"|([^\s]+))$/.exec(line);
    assert.ok(match, 'Unsupported workspace catalog configuration');
    const pattern = match[1] ?? match[2] ?? match[3];
    assert.ok(/^[a-zA-Z0-9_-]+\/\*$/.test(pattern), 'Unsupported workspace catalog pattern');
    return pattern;
  });
  assert.ok(
    patterns.length > 0 && new Set(patterns).size === patterns.length,
    'Invalid workspace patterns',
  );
  const workspaces = new Map();
  for (const pattern of patterns) {
    const parent = path.join(repository, pattern.slice(0, -2));
    assert.equal(await realpath(parent), parent, 'Workspace package parent escapes catalog root');
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), 'Nonregular symbolic workspace package');
      if (entry.isFile()) continue;
      assert.ok(entry.isDirectory(), 'Nonregular workspace package');
      const directory = path.join(parent, entry.name);
      assert.equal(await realpath(directory), directory, 'Workspace package escapes catalog root');
      try {
        await lstat(path.join(directory, 'package.json'));
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      const value = await manifest(directory);
      assert.ok(!workspaces.has(value.name), 'Duplicate workspace package name');
      workspaces.set(value.name, { directory, value });
    }
  }
  assert.ok(workspaces.size > 0, 'Empty workspace catalog');
  for (const filename of ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']) {
    include('repository', await inventory(repository, filename));
  }
  for (const { directory } of workspaces.values()) {
    const relative = path.relative(repository, directory).replaceAll('\\', '/');
    include('repository', await inventory(repository, `${relative}/package.json`));
    include(
      'repository',
      await inventory(
        repository,
        `${relative}/dist`,
        (file) =>
          (generatorRevision === 'p05-refresh-replay-v3' &&
            file === `${relative}/dist/.tsbuildinfo`) ||
          file === 'packages/runtime/dist/native-metadata-profiles.js' ||
          file === 'packages/runtime/dist/native-metadata-profiles.js.map' ||
          file === 'packages/runtime/dist/native-metadata-profiles.d.ts.map',
      ),
    );
    try {
      await lstat(path.join(directory, 'test/helpers'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    include('repository', await inventory(repository, `${relative}/test/helpers`));
  }
  for (const relative of [
    'scripts',
    'fixtures/native',
    'fixtures/ipc/handshake-v1',
    'packages/storage/migrations',
  ]) {
    include('repository', await inventory(repository, relative));
  }
  include('native', await inventory(path.dirname(native), path.basename(native)));

  async function visitDependencies(directory, value, tooling = false) {
    const required = { ...(tooling ? value.devDependencies : {}), ...value.dependencies };
    const optional = value.optionalDependencies ?? {};
    for (const name of Object.keys({ ...required, ...optional }).sort()) {
      if (name.startsWith('node:')) continue;
      if (workspaces.has(name)) {
        // Workspace packages are all enumerated and traversed independently below.
        assert.ok(
          String(required[name] ?? optional[name]).startsWith('workspace:'),
          'Workspace package resolution is not explicit',
        );
        continue;
      }
      let resolved;
      try {
        resolved = await resolvePackageRoot(name, directory);
      } catch (error) {
        if (Object.hasOwn(optional, name) && error.code === 'MODULE_NOT_FOUND') continue;
        throw error;
      }
      const physical = await realpath(resolved);
      const external = await manifest(physical);
      assert.equal(external.name, name, 'Package alias resolution topology is not represented');
      if (physicalPackages.has(physical)) continue;
      physicalPackages.add(physical);
      const rootName =
        'package-' +
        createHash('sha256').update(`${external.name}\0${external.version}`).digest('hex');
      assert.ok(
        !packageIdentities.has(name) || packageIdentities.get(name) === rootName,
        'Multiple versions have unbound package resolution topology',
      );
      packageIdentities.set(name, rootName);
      const entries = await inventory(physical, '', (relative) => relative === 'node_modules');
      if (packageInventories.has(rootName)) {
        assert.deepEqual(
          entries,
          packageInventories.get(rootName),
          'Conflicting package installations',
        );
        // A flat name/version root cannot identify each importer's physical
        // resolution. Even identical bytes do not prove that topology.
        assert.fail('Multiple physical package installations need catalog contract review');
      } else {
        packageInventories.set(rootName, entries);
        roots.set(rootName, physical);
        include(rootName, entries);
      }
      await visitDependencies(physical, external);
    }
  }
  for (const { directory, value } of workspaces.values()) await visitDependencies(directory, value);
  await visitDependencies(repository, await manifest(repository), true);
  return Object.freeze({
    roots: Object.freeze(
      [...roots]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([name, directory]) => Object.freeze({ name, path: directory })),
    ),
    dependencies: Object.freeze(
      [...dependencies]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([relative, sha256]) => Object.freeze({ path: relative, sha256 })),
    ),
  });
}

async function resolveInstalledPackage(name, importer) {
  const require = createRequire(path.join(importer, 'package.json'));
  let entry;
  try {
    entry = require.resolve(`${name}/package.json`);
  } catch (error) {
    if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED' && error.code !== 'MODULE_NOT_FOUND')
      throw error;
    entry = require.resolve(name);
  }
  let directory = path.dirname(await realpath(entry));
  for (;;) {
    try {
      const value = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
      if (value.name === name) return directory;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(directory);
    assert.notEqual(parent, directory, `Missing resolved package root: ${name}`);
    directory = parent;
  }
}

export async function verifyRefreshReplayDependencyCatalog(
  current,
  declaredRoots,
  declaredDependencies,
) {
  // Compare full independent membership before any replay consumer receives a case.
  assert.deepEqual(declaredRoots, current.roots, 'Dependency root resolution drift');
  assert.deepEqual(
    declaredDependencies,
    current.dependencies,
    'Dependency catalog membership/hash drift',
  );
  for (const root of current.roots) {
    const prefix = root.name + '/';
    const entries = current.dependencies
      .filter((entry) => entry.path.startsWith(prefix))
      .map((entry) => ({ ...entry, path: entry.path.slice(prefix.length) }));
    await verifyRefreshReplayDependencies(root.path, entries);
  }
}

// Canonical bytes only: schema, file integrity and corpus eligibility are separate gates.
export function encodeRefreshReplayJson(value) {
  const active = new Set();
  function encode(item) {
    if (item === null || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'string') {
      assert.ok(item.isWellFormed(), 'Invalid JSON Unicode');
      return JSON.stringify(item);
    }
    if (typeof item === 'number') {
      assert.ok(Number.isSafeInteger(item) && !Object.is(item, -0), 'Invalid JSON integer');
      return JSON.stringify(item);
    }
    assert.ok(item && typeof item === 'object', 'Invalid JSON value');
    assert.ok(!active.has(item), 'Cyclic JSON value');
    active.add(item);
    try {
      if (Array.isArray(item)) {
        denseArray(item, 'Invalid JSON array');
        const values = [];
        for (let index = 0; index < item.length; index++)
          values.push(encode(Object.getOwnPropertyDescriptor(item, String(index)).value));
        return '[' + values.join(',') + ']';
      }
      const prototype = Object.getPrototypeOf(item);
      assert.ok(prototype === Object.prototype || prototype === null, 'Invalid JSON object');
      const keys = Reflect.ownKeys(item);
      assert.ok(
        keys.every((key) => typeof key === 'string' && key.isWellFormed()),
        'Invalid JSON key',
      );
      const members = keys.sort().map((key) => {
        const slot = Object.getOwnPropertyDescriptor(item, key);
        assert.ok('value' in slot && slot.enumerable, 'Invalid JSON data field');
        return JSON.stringify(key) + ':' + encode(slot.value);
      });
      return '{' + members.join(',') + '}';
    } finally {
      active.delete(item);
    }
  }
  return Buffer.from(encode(value) + '\n', 'utf8');
}

export function decodeRefreshReplayJson(bytes) {
  assert.ok(Buffer.isBuffer(bytes), 'Expected JSON bytes');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  assert.ok(encodeRefreshReplayJson(value).equals(bytes), 'Noncanonical JSON bytes');
  return value;
}

function recordKeys(value, keys) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Invalid replay record');
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...keys].sort(), 'Invalid replay fields');
}
function digest(value) {
  assert.ok(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'Invalid replay digest');
}
function nonnegative(value) {
  assert.ok(Number.isSafeInteger(value) && value >= 0, 'Invalid replay counter');
}
function nonempty(value) {
  assert.ok(typeof value === 'string' && value.length > 0, 'Invalid replay string');
}
function ordered(items, key) {
  denseArray(items, 'Invalid replay list');
  for (let index = 1; index < items.length; index++)
    assert.ok(key(items[index - 1]) < key(items[index]), 'Unsorted or duplicate replay list');
}
function identityHash(domain, value) {
  return createHash('sha256')
    .update(domain + '\0')
    .update(encodeRefreshReplayJson(value))
    .digest('hex');
}

function freezeReplayRecord(item) {
  if (item && typeof item === 'object') {
    for (const member of Object.values(item)) freezeReplayRecord(member);
    Object.freeze(item);
  }
  return item;
}

function canonicalAbsolutePath(value) {
  assert.ok(
    typeof value === 'string' &&
      !value.includes('\0') &&
      path.isAbsolute(value) &&
      path.resolve(value) === value,
    'Invalid canonical absolute locator',
  );
}

// Locator syntax and corpus agreement only; resolved catalog/physical roots remain mandatory.
export function validateRefreshReplayLocalBindingRecord(value, manifestValue) {
  const manifest = validateRefreshReplayManifestRecord(manifestValue);
  const binding = decodeRefreshReplayJson(encodeRefreshReplayJson(value));
  recordKeys(binding, [
    'schemaVersion',
    'workspace',
    'corpusDigest',
    'artifactRoot',
    'replayRoot',
    'dependencyRoots',
  ]);
  assert.equal(binding.schemaVersion, manifest.schemaVersion, 'Mixed replay locator version');
  assert.equal(binding.workspace, 'REFRESH_TRANSPORT');
  assert.equal(binding.corpusDigest, manifest.corpus.digest, 'Locator corpus differs');
  canonicalAbsolutePath(binding.artifactRoot);
  canonicalAbsolutePath(binding.replayRoot);
  assert.notEqual(binding.artifactRoot, binding.replayRoot, 'Mutable and immutable roots coincide');
  ordered(binding.dependencyRoots, (root) => root.name);
  for (const root of binding.dependencyRoots) {
    recordKeys(root, ['name', 'path']);
    assert.ok(
      typeof root.name === 'string' && /^(repository|native|package-[a-f0-9]{64})$/.test(root.name),
      'Invalid named dependency root',
    );
    canonicalAbsolutePath(root.path);
  }
  assert.ok(
    binding.dependencyRoots.some((root) => root.name === 'repository'),
    'Missing repository root',
  );
  assert.ok(
    binding.dependencyRoots.some((root) => root.name === 'native'),
    'Missing native root',
  );
  return freezeReplayRecord(binding);
}

// Frozen control-record agreement only: does not read invocation/options assets or qualify replay.
export function validateRefreshReplayCapsuleRecord(value, manifestValue, bindingValue) {
  const manifest = validateRefreshReplayManifestRecord(manifestValue);
  const binding = validateRefreshReplayLocalBindingRecord(bindingValue, manifest);
  const capsule = decodeRefreshReplayJson(encodeRefreshReplayJson(value));
  recordKeys(capsule, [
    ...(manifest.schemaVersion === 2 ? ['schemaVersion', 'outputContract'] : []),
    'name',
    'workspacePath',
    'databasePath',
    'coverage',
    'inputContract',
    'workload',
  ]);
  const item = manifest.cases.find((entry) => entry.name === capsule.name);
  assert.ok(item, 'Unknown capsule case');
  if (manifest.schemaVersion === 2) {
    assert.equal(capsule.schemaVersion, 2, 'Mixed replay capsule version');
    assert.deepEqual(capsule.outputContract, item.outputContract);
  }
  canonicalAbsolutePath(capsule.workspacePath);
  canonicalAbsolutePath(capsule.databasePath);
  assert.equal(
    capsule.workspacePath,
    path.join(binding.replayRoot, item.name, item.binding.workspacePath),
    'Capsule workspace binding differs',
  );
  assert.equal(
    capsule.databasePath,
    path.join(binding.replayRoot, item.name, item.binding.databasePath),
    'Capsule database binding differs',
  );
  assert.deepEqual(capsule.coverage, item.coverage, 'Capsule coverage differs');
  const { corpusPayloadDigest, ...input } = item.inputContract;
  assert.deepEqual(
    capsule.inputContract,
    input,
    'Capsule physical input differs or has a digest cycle',
  );
  recordKeys(capsule.workload, ['invocationPath', 'optionsPath', 'fault']);
  for (const key of ['invocationPath', 'optionsPath']) {
    canonicalRelativePath(capsule.workload[key]);
    assert.equal(
      item.assets.find((asset) => asset.path === capsule.workload[key])?.kind,
      'REPLAY_CAPSULE',
      'Undeclared or wrong-kind workload reference',
    );
  }
  const controlled =
    item.expectedOutcome !== 'SUCCEEDED' || ['d-slow-sink', 'd-reopen'].includes(item.name);
  assert.equal(capsule.workload.fault, controlled ? item.name : null, 'Wrong case control recipe');
  return freezeReplayRecord(capsule);
}

// Structure/semantic digests only; no file lookup, dependency completeness or qualification.
export function validateRefreshReplayManifestRecord(value) {
  // Snapshot own-data JSON before accessing fields; also validates scalars/accessors/cycles.
  const manifest = decodeRefreshReplayJson(encodeRefreshReplayJson(value));
  recordKeys(manifest, ['schemaVersion', 'workspace', 'corpus', 'generator', 'cases']);
  assert.ok([1, 2].includes(manifest.schemaVersion), 'Unsupported replay manifest version');
  assert.equal(manifest.workspace, 'REFRESH_TRANSPORT');
  recordKeys(manifest.corpus, ['revision', 'digest']);
  assert.equal(manifest.corpus.revision, 'p05-native-refresh-transport-memory-v1');
  digest(manifest.corpus.digest);
  recordKeys(manifest.generator, ['revision', 'dependencies']);
  nonempty(manifest.generator.revision);
  ordered(manifest.generator.dependencies, (item) => item.path);
  for (const item of manifest.generator.dependencies) {
    recordKeys(item, ['path', 'sha256']);
    canonicalRelativePath(item.path);
    digest(item.sha256);
  }
  denseArray(manifest.cases, 'Invalid replay cases');
  assert.deepEqual(
    manifest.cases.map((item) => item.name),
    [...refreshTransportCases].sort(),
  );
  for (const item of manifest.cases) {
    recordKeys(item, [
      ...(manifest.schemaVersion === 2 ? ['outputContract'] : []),
      'name',
      'sourceTransition',
      'expectedOutcome',
      'assets',
      'seedPath',
      'sourceFiles',
      'capsulePath',
      'oracle',
      'binding',
      'coverage',
      'inputContract',
      'caseDigest',
    ]);
    assert.deepEqual(
      [item.sourceTransition, item.expectedOutcome],
      refreshTransportRecipes[item.name],
    );
    ordered(item.assets, (asset) => asset.path);
    const assets = new Map();
    for (const asset of item.assets) {
      assetFields(asset);
      assert.ok(asset.path.startsWith(`cases/${item.name}/`), 'Asset outside case directory');
      assets.set(asset.path, asset);
    }
    const reference = (relativePath, kind) => {
      canonicalRelativePath(relativePath);
      assert.equal(
        assets.get(relativePath)?.kind,
        kind,
        'Undeclared or wrong-kind asset reference',
      );
    };
    reference(item.seedPath, 'SQLITE');
    reference(item.capsulePath, 'REPLAY_CAPSULE');
    if (manifest.schemaVersion === 2) {
      validateRefreshOutputContract(item.name, item.inputContract, item.outputContract);
      if (item.name === 'd-cancel') {
        reference(item.outputContract.referencePath, 'ORACLE');
        reference(item.outputContract.provenancePath, 'ORACLE');
      }
    }
    ordered(item.sourceFiles, (file) => file.destinationPath);
    for (const file of item.sourceFiles) {
      recordKeys(file, ['destinationPath', 'assetPath']);
      canonicalRelativePath(file.destinationPath);
      reference(file.assetPath, 'SOURCE');
    }
    recordKeys(item.binding, ['repositoryId', 'workspacePath', 'databasePath']);
    nonempty(item.binding.repositoryId);
    canonicalRelativePath(item.binding.workspacePath);
    canonicalRelativePath(item.binding.databasePath);
    assert.ok(
      item.binding.databasePath.startsWith(item.binding.workspacePath + '/'),
      'Database outside workspace',
    );
    recordKeys(item.oracle, ['graphPath', 'statePath', 'sourceGoldenPath', 'refusal']);
    reference(item.oracle.statePath, 'SQLITE');
    reference(item.oracle.sourceGoldenPath, 'ORACLE');
    if (item.expectedOutcome === 'SUCCEEDED') {
      reference(item.oracle.graphPath, 'SQLITE');
      assert.equal(item.oracle.refusal, null);
    } else {
      assert.equal(item.oracle.graphPath, null);
      recordKeys(item.oracle.refusal, ['code', 'message', 'mainApplyCalls', 'competitorCommits']);
      assert.equal(item.oracle.refusal.code, item.expectedOutcome);
      nonempty(item.oracle.refusal.message);
      nonnegative(item.oracle.refusal.mainApplyCalls);
      nonnegative(item.oracle.refusal.competitorCommits);
    }
    ordered(item.coverage, (entry) => entry.family + '\0' + entry.role);
    for (const entry of item.coverage) {
      recordKeys(entry, ['family', 'role', 'disposition']);
      assert.ok(
        ['BASELINE_READ', 'PREPARATION', 'COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'].includes(
          entry.family,
        ),
      );
      assert.ok(['MAIN', 'COMPETITOR', 'RETRY'].includes(entry.role));
      assert.ok(['OBSERVED', 'PROVEN_NOT_REACHED', 'PROVEN_NO_TEXT'].includes(entry.disposition));
    }
    recordKeys(item.inputContract, [
      'corpusPayloadDigest',
      'expectedOutcome',
      'inputBytes',
      'largestLineBytes',
      'outputBytes',
      'eventCount',
      'summaryBytes',
    ]);
    assert.equal(item.inputContract.expectedOutcome, item.expectedOutcome);
    for (const field of [
      'inputBytes',
      'largestLineBytes',
      'outputBytes',
      'eventCount',
      'summaryBytes',
    ])
      if (!(
        manifest.schemaVersion === 2 &&
        item.name === 'd-cancel' &&
        ['outputBytes', 'eventCount'].includes(field)
      ))
        nonnegative(item.inputContract[field]);
    digest(item.caseDigest);
    digest(item.inputContract.corpusPayloadDigest);
    const { caseDigest, inputContract, ...rest } = item;
    const { corpusPayloadDigest, ...input } = inputContract;
    assert.equal(
      caseDigest,
      identityHash(`p05-refresh-replay-case-v${manifest.schemaVersion}`, {
        ...rest,
        inputContract: input,
      }),
      'Case digest mismatch',
    );
    assert.equal(corpusPayloadDigest, caseDigest, 'Payload digest mismatch');
  }
  const { digest: corpusDigest, ...corpus } = manifest.corpus;
  assert.equal(
    corpusDigest,
    identityHash(`p05-refresh-replay-corpus-v${manifest.schemaVersion}`, { ...manifest, corpus }),
    'Corpus digest mismatch',
  );
  return freezeReplayRecord(manifest);
}

function canonicalRelativePath(relativePath) {
  assert.ok(
    typeof relativePath === 'string' &&
      relativePath.length > 0 &&
      !path.isAbsolute(relativePath) &&
      !/[\\:\0]/.test(relativePath) &&
      relativePath.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
    'Invalid asset path',
  );
}

async function confinedFile(rootPath, relativePath) {
  canonicalRelativePath(relativePath);
  const root = await realpath(rootPath);
  const file = await realpath(path.join(root, relativePath));
  const confined = path.relative(root, file);
  assert.ok(
    confined &&
      confined !== '..' &&
      !confined.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(confined),
    'Asset path escapes confined root',
  );
  return file;
}

function assetFields(asset) {
  const keys = ['path', 'kind', 'bytes', 'sha256'];
  assert.ok(asset && typeof asset === 'object', 'Invalid replay asset');
  assert.deepEqual(Reflect.ownKeys(asset).sort(), [...keys].sort(), 'Invalid asset fields');
  assert.ok(
    keys.every((key) => 'value' in Object.getOwnPropertyDescriptor(asset, key)),
    'Invalid asset data fields',
  );
  const { path: relativePath, kind, bytes, sha256 } = asset;
  assert.ok(
    ['SOURCE', 'SQLITE', 'ORACLE', 'FAULT_CHILD', 'REPLAY_CAPSULE'].includes(kind),
    'Invalid asset kind',
  );
  assert.ok(Number.isSafeInteger(bytes) && bytes >= 0, 'Invalid asset bytes');
  assert.ok(typeof sha256 === 'string' && /^[a-f0-9]{64}$/.test(sha256), 'Invalid asset hash');
  canonicalRelativePath(relativePath);
  return { path: relativePath, kind, bytes, sha256 };
}

function denseArray(value, message) {
  assert.ok(Array.isArray(value), message);
  assert.equal(Reflect.ownKeys(value).length, value.length + 1, message);
  for (let index = 0; index < value.length; index++) {
    const slot = Object.getOwnPropertyDescriptor(value, String(index));
    assert.ok(slot && 'value' in slot, message);
  }
}

// Names only: does not certify case semantics, assets, binding or independent oracles.
export function validateRefreshReplayCaseNames(names) {
  denseArray(names, 'Invalid case inventory');
  assert.equal(names.length, refreshTransportCases.length, 'Invalid case inventory count');
  assert.ok(
    names.every((name) => typeof name === 'string'),
    'Invalid case inventory name',
  );
  const ordered = [...names].sort();
  assert.deepEqual(ordered, [...refreshTransportCases].sort(), 'Invalid case inventory membership');
  return ordered;
}

// No partial handoff: sequential streaming keeps at most one asset handle open.
export async function verifyRefreshReplayAssets(rootPath, assets) {
  denseArray(assets, 'Invalid asset list');
  const records = assets.map(assetFields);
  for (let index = 1; index < records.length; index++) {
    assert.ok(
      records[index - 1].path < records[index].path,
      'Unsorted or duplicate asset list path',
    );
  }
  const verified = [];
  for (const asset of records) verified.push(await verifyRefreshReplayAsset(rootPath, asset));
  return verified;
}

// Declared dependency bytes only, not discovery of the complete generator dependency closure.
export async function verifyRefreshReplayDependencies(rootPath, dependencies) {
  denseArray(dependencies, 'Invalid dependency list');
  const records = dependencies.map((item) => {
    const keys = ['path', 'sha256'];
    assert.ok(item && typeof item === 'object', 'Invalid dependency');
    assert.deepEqual(Reflect.ownKeys(item).sort(), [...keys].sort(), 'Invalid dependency fields');
    assert.ok(
      keys.every((key) => 'value' in Object.getOwnPropertyDescriptor(item, key)),
      'Invalid dependency data fields',
    );
    const { path: relativePath, sha256 } = item;
    canonicalRelativePath(relativePath);
    assert.ok(
      typeof sha256 === 'string' && /^[a-f0-9]{64}$/.test(sha256),
      'Invalid dependency hash',
    );
    return { path: relativePath, sha256 };
  });
  for (let index = 1; index < records.length; index++) {
    assert.ok(
      records[index - 1].path < records[index].path,
      'Unsorted or duplicate dependency path',
    );
  }
  const verified = [];
  for (const record of records) verified.push(await verifyPhysicalFile(rootPath, record, false));
  return verified;
}

// Point-in-time physical integrity only; replay consumers must revalidate their inputs.
export async function verifyRefreshReplayAsset(rootPath, asset) {
  const metadata = assetFields(asset);
  return verifyPhysicalFile(rootPath, metadata, metadata.kind !== 'SQLITE');
}

async function verifyPhysicalFile(
  rootPath,
  { path: relativePath, bytes: declaredBytes, sha256 },
  text,
) {
  const file = await confinedFile(rootPath, relativePath);
  const handle = await open(file, 'r');
  try {
    const before = await handle.stat();
    assert.ok(before.isFile(), 'Asset path is not a file');
    const bytes = declaredBytes ?? before.size;
    assert.ok(Number.isSafeInteger(bytes) && bytes >= 0, 'Invalid physical file bytes');
    assert.equal(before.size, bytes, 'Asset bytes mismatch');
    const hash = createHash('sha256');
    const decoder = text ? new TextDecoder('utf-8', { fatal: true }) : null;
    let observed = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      observed += chunk.length;
      assert.ok(Number.isSafeInteger(observed) && observed <= bytes, 'Asset bytes changed');
      hash.update(chunk);
      if (decoder) {
        assert.ok(!chunk.includes(13), 'Asset text must use LF');
        decoder.decode(chunk, { stream: true });
      }
    }
    decoder?.decode();
    assert.equal(observed, bytes, 'Asset bytes mismatch');
    assert.equal(hash.digest('hex'), sha256, 'Asset hash mismatch');
    const after = await handle.stat();
    for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
      assert.equal(after[field], before[field], 'Asset changed during verification');
    }
    assert.equal(await confinedFile(rootPath, relativePath), file, 'Asset path changed');
    return file;
  } finally {
    await handle.close();
  }
}

// Seed root/identity only, not the complete binding sidecar or physical-input contract.
export async function verifyRefreshReplayRootBinding(
  rootPath,
  seedAsset,
  workspaceRelativePath,
  repositoryId,
) {
  const metadata = assetFields(seedAsset);
  assert.equal(metadata.kind, 'SQLITE', 'Seed must be a SQLite asset');
  canonicalRelativePath(workspaceRelativePath);
  assert.ok(typeof repositoryId === 'string' && repositoryId.length > 0, 'Invalid repository ID');
  const workspace = await confinedFile(rootPath, workspaceRelativePath);
  assert.equal(
    workspace,
    path.join(await realpath(rootPath), workspaceRelativePath),
    'Workspace binding must be canonical, not an alias',
  );
  assert.ok((await stat(workspace)).isDirectory(), 'Workspace must be a directory');
  const seed = await verifyRefreshReplayAsset(rootPath, metadata);
  const rows = readSnapshot(seed, (db) =>
    db.prepare('SELECT id, root_path FROM repository ORDER BY slot').all(),
  );
  assert.deepEqual(
    rows.map((row) => ({ ...row })),
    [{ id: repositoryId, root_path: workspace }],
    'Replay seed repository binding differs',
  );
  assert.equal(await verifyRefreshReplayAsset(rootPath, metadata), seed, 'Seed path changed');
  assert.equal(
    await confinedFile(rootPath, workspaceRelativePath),
    workspace,
    'Workspace path changed',
  );
  return workspace;
}

function readSnapshot(file, readImage) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec('BEGIN');
    return readImage(db);
  } finally {
    try {
      if (db.isTransaction) db.exec('ROLLBACK');
    } finally {
      db.close();
    }
  }
}

// Existing activationImage scope only; no original-worker closure or full-case eligibility proof.
export async function verifyRefreshReplayPreservedActivation(rootPath, actualPath, oracleAsset) {
  const { expected, actual } = await readIndependentImages(
    rootPath,
    actualPath,
    oracleAsset,
    activationImage,
  );
  return isDeepStrictEqual(actual, expected);
}

// Existing 13 activation tables plus the 3 source/root tables; not the entire database/filesystem.
export async function verifyRefreshReplayPreservedSourceActivation(
  rootPath,
  actualPath,
  oracleAsset,
) {
  const resultFile = await confinedFile(rootPath, actualPath);
  await assertClosedFile(resultFile);
  const { expected, actual } = await readIndependentImages(
    rootPath,
    actualPath,
    oracleAsset,
    sourceActivationImage,
  );
  await assertClosedFile(resultFile);
  return isDeepStrictEqual(actual, expected);
}

function sourceActivationImage(db) {
  return {
    ...activationImage(db),
    ...Object.fromEntries(
      ['repository', 'revisions', 'source_files'].map((table) => [
        table,
        db
          .prepare(`SELECT * FROM ${table}`)
          .all()
          .map((row) => JSON.stringify(row))
          .sort(),
      ]),
    ),
  };
}

// Private 16-table comparison prerequisite, not receipt authentication or full
// ReplayVerification. The owning parent must bind both original production
// captures and its invocation-derived actor/ID list before calling this reader.
export async function verifyRefreshReplayBoundSourceActivation(
  rootPath,
  actualPath,
  oracleAsset,
  parameterValue,
) {
  validateBoundSourceActivationParameters(parameterValue);
  const { expected, actual } = await readIndependentImages(
    rootPath,
    actualPath,
    oracleAsset,
    sourceActivationImage,
  );
  return compareBoundSourceActivationImages(actual, expected, parameterValue);
}

function validateBoundSourceActivationParameters(parameterValue) {
  const parameters = freezeReplayRecord(parameterValue);
  recordKeys(parameters, ['actual', 'reference', 'snapshots']);
  ordered(parameters.snapshots, (entry) => `${entry.role}\0${entry.snapshotId}`);
  const snapshotIds = new Set();
  for (const entry of parameters.snapshots) {
    recordKeys(entry, ['role', 'snapshotId']);
    assert.ok(['MAIN', 'COMPETITOR', 'RETRY'].includes(entry.role));
    nonempty(entry.snapshotId);
    assert.ok(!snapshotIds.has(entry.snapshotId), 'Duplicate snapshot binding');
    snapshotIds.add(entry.snapshotId);
  }
  for (const metadata of [parameters.actual, parameters.reference]) {
    recordKeys(metadata, ['invocationStartedAt', 'invocationFinishedAt', 'entries']);
    nonnegative(metadata.invocationStartedAt);
    nonnegative(metadata.invocationFinishedAt);
    assert.ok(metadata.invocationStartedAt <= metadata.invocationFinishedAt);
    ordered(metadata.entries, (entry) => `${entry.role}\0${entry.snapshotId}`);
    for (const entry of metadata.entries) {
      recordKeys(entry, ['role', 'snapshotId', 'startedAt', 'completedAt']);
      nonnegative(entry.startedAt);
      nonnegative(entry.completedAt);
      assert.ok(
        metadata.invocationStartedAt <= entry.startedAt &&
          entry.startedAt <= entry.completedAt &&
          entry.completedAt <= metadata.invocationFinishedAt,
      );
    }
    assert.deepEqual(
      metadata.entries.map(({ role, snapshotId }) => ({ role, snapshotId })),
      parameters.snapshots,
      'Metadata does not match declared snapshot bindings',
    );
  }
  return parameters;
}

function compareBoundSourceActivationImages(actual, expected, parameterValue) {
  const parameters = validateBoundSourceActivationParameters(parameterValue);
  const replacements = new Map(parameters.actual.entries.map((entry) => [entry.snapshotId, entry]));
  const reference = new Map(parameters.reference.entries.map((entry) => [entry.snapshotId, entry]));
  const found = new Set();
  expected.provider_snapshots = expected.provider_snapshots
    .map((encoded) => {
      const row = JSON.parse(encoded);
      const entry = reference.get(row.id);
      if (entry) {
        assert.equal(row.started_at, entry.startedAt, 'Reference snapshot metadata differs');
        assert.equal(row.completed_at, entry.completedAt, 'Reference snapshot metadata differs');
        found.add(row.id);
        row.started_at = replacements.get(row.id).startedAt;
        row.completed_at = replacements.get(row.id).completedAt;
      }
      return JSON.stringify(row);
    })
    .sort();
  assert.equal(found.size, parameters.snapshots.length, 'Declared snapshot absent from reference');
  return isDeepStrictEqual(actual, expected);
}

async function readIndependentImages(rootPath, actualPath, oracleAsset, readImage) {
  const metadata = assetFields(oracleAsset);
  assert.equal(metadata.kind, 'SQLITE', 'Oracle must be a closed SQLite asset');
  const oracle = await verifyRefreshReplayAsset(rootPath, metadata);
  const actual = await confinedFile(rootPath, actualPath);
  const expectedStat = await stat(oracle, { bigint: true });
  const actualStat = await stat(actual, { bigint: true });
  assert.ok(actualStat.isFile(), 'Result must be a regular file');
  assert.ok(
    oracle !== actual &&
      (expectedStat.dev !== actualStat.dev || expectedStat.ino !== actualStat.ino),
    'Oracle must be independent of result',
  );
  const expectedImage = readSnapshot(oracle, readImage);
  const actualImage = readSnapshot(actual, readImage);
  // Recheck the declared immutable oracle after both read-only snapshots settle.
  assert.equal(await verifyRefreshReplayAsset(rootPath, metadata), oracle, 'Oracle path changed');
  return { expected: expectedImage, actual: actualImage };
}

function canonicalGraph(db) {
  const confidence = (row) => ({
    score: row.confidence_score,
    method: row.confidence_method,
    reasons: JSON.parse(row.confidence_reasons_json),
  });
  const nodes = db
    .prepare('SELECT * FROM canonical_nodes')
    .all()
    .map((row) => {
      assert.ok(row.kind === 'TYPE' || row.type_kind === null, 'Unexpected type kind');
      assert.ok(row.kind === 'SYMBOL' || row.symbol_kind === null, 'Unexpected symbol kind');
      return {
        id: row.id,
        factKey: row.fact_key,
        repositoryId: row.repository_id,
        revisionId: row.revision_id,
        kind: row.kind,
        name: row.name,
        qualifiedName: row.qualified_name,
        sourceRange: JSON.parse(row.source_range_json),
        confidence: confidence(row),
        ...(row.kind === 'TYPE' ? { typeKind: row.type_kind } : {}),
        ...(row.kind === 'SYMBOL' ? { symbolKind: row.symbol_kind } : {}),
      };
    });
  let unresolved = 0;
  const edges = db
    .prepare(
      `SELECT e.*, u.original_hint, u.candidates_json
    FROM canonical_edges e LEFT JOIN unresolved_targets u
    ON u.revision_id=e.revision_id AND u.edge_id=e.id`,
    )
    .all()
    .map((row) => {
      let target;
      if (row.target_state === 'RESOLVED') {
        assert.equal(row.original_hint, null, 'Resolved edge has unresolved data');
        target = {
          state: row.target_state,
          resolution: row.resolution,
          target: { factType: 'NODE', id: row.target_node_id },
        };
      } else {
        assert.equal(row.target_node_id, null, 'Unresolved edge has resolved data');
        unresolved++;
        target = {
          state: row.target_state,
          resolution: row.resolution,
          originalHint: row.original_hint,
          candidates: JSON.parse(row.candidates_json),
        };
      }
      return {
        id: row.id,
        factKey: row.fact_key,
        repositoryId: row.repository_id,
        revisionId: row.revision_id,
        kind: row.kind,
        source: { factType: 'NODE', id: row.source_node_id },
        target,
        sourceRange: JSON.parse(row.source_range_json),
        confidence: confidence(row),
      };
    });
  assert.equal(
    db.prepare('SELECT count(*) AS n FROM unresolved_targets').get().n,
    unresolved,
    'Unresolved target inventory differs from graph',
  );
  return { nodes, edges };
}

// Differential semantic graph only, outside measurement; not full-state/closure eligibility.
export async function compareRefreshReplayCanonicalGraph(rootPath, actualPath, oracleAsset) {
  return compareCanonicalFacts(
    await readIndependentImages(rootPath, actualPath, oracleAsset, canonicalGraph),
  );
}
