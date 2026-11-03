import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readSurfaceCapture } from '../../../../fixtures/phase1/syntax-contract/surface-closure/corpus.mjs';
import {
  loadCompositionCase,
  reseal,
} from '../../../providers/test/fixtures/native-composition-helpers.mjs';
import {
  historyFixture,
  historyLimits,
} from '../../../storage/test/helpers/r011-history-fixture.mjs';
import { RepositorySourceStateStore } from '../../../storage/dist/index.js';
import { captureRuntimeActivationContext } from '../../../storage/dist/analysis/activation-history.js';
import {
  MixedAnalysisStage,
  readMixedCodeSyntaxPreparation,
} from '../../../storage/dist/analysis/mixed-analysis-stage.js';
import { computeSyntaxOwnerMapDigest } from '../../../providers/dist/native-syntax-owner-binding.js';
export async function withFrozenStage(
  t,
  run,
  id = 'P5',
  initialOther = false,
  sourceDocuments = [],
) {
  const runtime = await import('../../dist/mixed-analysis.js');
  assert.equal(typeof runtime.createFrameworkSurfaceMixedAnalysisRules, 'function');
  const f = await historyFixture(t, 'available', { seed: false, version: 13 }),
    saved = readSurfaceCapture(id),
    request = JSON.parse(saved.syntax.request),
    p = request.payload,
    root = path.join(f.directory, 'source');
  const source = p.sourceFiles[0];
  fs.mkdirSync(path.dirname(path.join(root, source.path)), { recursive: true });
  fs.copyFileSync(
    new URL('../../../../fixtures/phase1/' + source.path, import.meta.url),
    path.join(root, source.path),
  );
  f.db
    .prepare('INSERT INTO repository(slot,id,root_path)VALUES(1,?,?)')
    .run(p.targetSource.repositoryId, root.replaceAll('\\', '/'));
  f.db
    .prepare('INSERT INTO repository_state(repository_id)VALUES(?)')
    .run(p.targetSource.repositoryId);
  const inventory = [...p.sourceFiles];
  if (initialOther || sourceDocuments.length) {
    const { createHash } = await import('node:crypto'),
      { fingerprintInventory } = await import('../../../source/dist/fingerprint.js');
    const extras = [
      ...(initialOther
        ? [{ path: 'notes.md', id: 'file:ab:other', contentUtf8: 'owned OTHER note\n' }]
        : []),
      ...sourceDocuments,
    ];
    for (const extra of extras) {
      const bytes = Buffer.from(extra.contentUtf8);
      fs.mkdirSync(path.dirname(path.join(root, extra.path)), { recursive: true });
      fs.writeFileSync(path.join(root, extra.path), bytes);
      inventory.push({
        ...p.sourceFiles[0],
        id: extra.id,
        path: extra.path,
        contentFingerprint: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
        classification: { role: 'OTHER', provenance: 'AUTHORED', contentKind: 'TEXT' },
        languageHint: null,
      });
    }
    inventory.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    p.targetSource.contentFingerprint = fingerprintInventory(
      inventory.map((file) => ({
        ...file,
        sizeBytes: fs.statSync(path.join(root, file.path)).size,
      })),
    );
  }
  new RepositorySourceStateStore(f.db).replace(null, {
    revision: {
      id: p.targetSource.revisionId,
      repositoryId: p.targetSource.repositoryId,
      kind: 'WORKTREE',
      contentFingerprint: p.targetSource.contentFingerprint,
      baseRevisionId: null,
    },
    files: inventory,
  });
  const capture = captureRuntimeActivationContext(f.db, p.targetSource.repositoryId, historyLimits),
    stage = new MixedAnalysisStage(
      f.db,
      capture.handle,
      'FULL',
      historyLimits,
      runtime.createFrameworkSurfaceMixedAnalysisRules(),
    );
  try {
    const metadata = structuredClone(
      (await loadCompositionCase(saved.code ? 'java-only' : 'python-only')).metadata,
    );
    metadata.targetSource = p.targetSource;
    metadata.inventory = inventory;
    metadata.snapshot.id = p.providerSnapshotId;
    metadata.snapshot.providerId = p.providerId;
    metadata.snapshot.providerVersion = p.providerVersion;
    metadata.codeSyntax.providerVersion = p.providerVersion;
    let javaOwner = null;
    if (saved.code) {
      const javaEvents = saved.code.output.toString().trim().split('\n').map(JSON.parse);
      Object.assign(metadata.java, {
        request: JSON.parse(saved.code.request),
        events: javaEvents,
        terminal: javaEvents.at(-1),
        providerVersion: p.providerVersion,
      });
      metadata.java.request.payload.repository.rootPath = root.replaceAll('\\', '/');
      if (sourceDocuments.length) {
        // RECORDED_REPLAY: rebind the v2 request and both revision echoes to the new full Source inventory.
        const { createHash } = await import('node:crypto');
        const checksum = () =>
          'sha256:' +
          createHash('sha256')
            .update(
              javaEvents
                .slice(0, -1)
                .map((e) => JSON.stringify(e) + '\n')
                .join(''),
            )
            .digest('hex');
        assert.equal(checksum(), metadata.java.terminal.payload.integrityChecksum);
        metadata.java.request.payload.revision.contentFingerprint =
          p.targetSource.contentFingerprint;
        for (const e of javaEvents)
          if (e.type === 'ANALYSIS_STARTED' || e.type === 'ANALYSIS_COMPLETED')
            e.payload.revisionFingerprint = p.targetSource.contentFingerprint;
        const digest = checksum();
        metadata.java.terminal.payload.integrityChecksum = digest;
        metadata.java.terminal.payload.contentFingerprint = digest;
      }

      metadata.codeSyntax.startedAt = metadata.java.settledAt;
      const { projectSettledJavaOwner } =
        await import('../../../providers/dist/native-composition-input.js');
      javaOwner = projectSettledJavaOwner(metadata);
    } else metadata.java = null;
    const contracts = [
        {
          providerId: 'native',
          extractor: 'syntax-v2',
          normalizer: 'syntax-canonical-mapper-v4',
          contract: 'SYNTAX_BINDING_V4',
          policy: 'syntax-surface-support-v2',
        },
      ],
      owner = stage.prepareOwner(javaOwner, {
        contracts,
        qualificationRef: 'RECORDED_REPLAY_COMPONENT_NOT_PHYSICAL',
      }),
      preparation = readMixedCodeSyntaxPreparation(stage, owner.ownerHandle);
    p.repository.rootPath = root.replaceAll('\\', '/');
    p.expectedActivationBasis = preparation.expectedActivationBasis;
    p.targetSource = preparation.targetSource;
    p.sourceFiles = preparation.sourceFiles;
    p.owners = preparation.owners;
    p.ownerBinding = {
      kind: 'PROVISIONAL_CODE',
      stageDigest: owner.stageDigest,
      ownerMapDigest: '0'.repeat(64),
    };
    p.ownerBinding.ownerMapDigest = computeSyntaxOwnerMapDigest({
      expectedActivationBasis: p.expectedActivationBasis,
      targetSource: p.targetSource,
      ownerBinding: { kind: 'PROVISIONAL_CODE', stageDigest: owner.stageDigest },
      providerId: p.providerId,
      providerSnapshotId: p.providerSnapshotId,
      sourceFiles: p.sourceFiles,
      owners: p.owners,
    });
    const events = saved.syntax.output.toString().trim().split('\n').map(JSON.parse);
    for (const e of events)
      if (e.type === 'OBSERVATION_STARTED' || e.type === 'OBSERVATION_COMPLETED') {
        e.payload.ownerBinding = structuredClone(p.ownerBinding);
        e.payload.targetSource = structuredClone(p.targetSource);
      }
    const raw = reseal(request, events);
    stage.acceptObservation(owner.ownerHandle, { metadata, ...raw });
    const frozen = stage.freeze();
    assert.match(frozen.basis.codeActivationDigest, /^[a-f0-9]{64}$/);
    assert(frozen.lease);
    await run({ f, stage, frozen, repositoryId: p.targetSource.repositoryId });
  } finally {
    stage.close();
  }
}

export function workflowRequest(repositoryId, operation) {
  return {
    control: {
      maxItems: 10000,
      maxDepth: 10,
      deadlineEpochMs: Date.now() + 60000,
      signal: new AbortController().signal,
    },
    policy: {
      operation,
      phase: 'PRIMARY',
      scope: { workspaceId: 'workspace:owned', repositoryId },
      callerCapabilities: [operation],
      permissionContext: {
        workspaceId: 'workspace:owned',
        repositoryIds: [repositoryId],
        allowedOperations: [operation],
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
    },
  };
}
