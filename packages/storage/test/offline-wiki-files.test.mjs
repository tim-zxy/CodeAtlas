import {
  parseReceiptWikiArtifact,
  receiptWikiDigest,
} from '../../ir/dist/receipt-wiki-artifact-contract.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { OfflineWikiProjector } from '../../application/dist/offline-wiki.js';
import {
  canonical,
  control,
} from '../../application/test/helpers/captured-integration-fixture.mjs';
import {
  createOwnedWikiArtifactDirectory,
  OwnedWikiArtifactFiles,
} from '../dist/knowledge/offline-wiki-files.js';

const allowance = 1000000;
const vectors = JSON.parse(
  fs.readFileSync(
    new URL('../../../fixtures/phase1/knowledge-identity/inputs.json', import.meta.url),
    'utf8',
  ),
);
async function artifacts() {
  const c = control(),
    vector = vectors.subjects.find((row) => row.name === 'COMPONENT'),
    existing = structuredClone(vector.existing);
  const item = existing.itemEnvelope.payload,
    revision = existing.revisionEnvelope.payload;
  const row = {
    itemEnvelope: existing.itemEnvelope,
    revisionEnvelope: existing.revisionEnvelope,
    referenceContext: existing.referenceContext,
    coverage: structuredClone(vector.candidate.candidateEnvelope.payload.coverage),
    provenance: {
      attemptId: 'owned-wiki-files:synthetic',
      runId: revision.compilationRunId,
      snapshotId: revision.inputSnapshotRef.id,
      revisionSetId: revision.revisionSetId,
      evaluationId: revision.evaluationRef.id,
    },
    currentHeadRevisionId: revision.id,
    isCurrentHead: true,
    warnings: ['LIVE_SOURCE_NOT_OBSERVED'],
  };
  const projector = new OfflineWikiProjector({
    knowledgeQuery: async (request) => ({
      kind: 'OWNED_TEST_PUBLICATION',
      workspaceId: request.workspaceId,
      selectionDigest: createHash('sha256')
        .update(
          'codeatlas.offline-knowledge.selection.v1\0' +
            canonical({
              workspaceId: request.workspaceId,
              refs: request.selectedPublishedRevisionRefs,
            }),
        )
        .digest('hex'),
      records: [structuredClone(row)],
      productionQuery: 'NOT_AUTHORIZED',
      quality: 'NOT_EVALUABLE',
    }),
  });
  const request = () => ({
    workspaceId: 'workspace:one',
    repositoryIds: ['repo:one'],
    selectedPublishedRevisionRefs: [{ itemId: item.id, revisionId: revision.id }],
    customizationPolicy: 'LOCKED',
    allowPartial: true,
  });
  const first = (await projector.project(request(), c)).artifact;
  assert.equal(first.kind, 'OWNED_TEST_WIKI');
  assert.equal(first.projection.status, 'PARTIAL');
  assert.equal(first.projection.quality, 'NOT_EVALUABLE');
  assert.equal(first.projection.productionPublication, 'NOT_AUTHORIZED');
  const previous = revision.id;
  revision.id += ':next';
  revision.previousRevisionId = previous;
  item.publishedRevisionId = revision.id;
  row.currentHeadRevisionId = revision.id;
  const second = (await projector.project(request(), c)).artifact;
  assert.notEqual(first.artifactRevisionId, second.artifactRevisionId);
  return { c, first, second };
}
function owned(c) {
  const receipt = createOwnedWikiArtifactDirectory(c);
  assert.match(path.basename(receipt.directory), /^codeatlas-owned-wiki-/);
  assert.equal(typeof receipt.ownerId, 'string');
  // Deliberately retain these newly owned small directories, including failures,
  // as evidence. Never adopt or recursively clean any old output directory.
  return { receipt, writer: new OwnedWikiArtifactFiles(receipt, allowance) };
}

test('fresh owned directory has no current artifact; real projector artifact persists and reopens unchanged', async () => {
  const { c, first } = await artifacts(),
    { receipt, writer } = owned(c);
  assert.equal(writer.readCurrent(c), null);
  assert.ok(fs.existsSync(path.join(receipt.directory, 'owner.json')));
  const committed = writer.commit(first, null, c);
  assert.equal(committed.effect, 'COMMITTED');
  assert.deepEqual(committed.artifact, first);
  const reopened = new OwnedWikiArtifactFiles(receipt, allowance);
  assert.deepEqual(reopened.readCurrent(c), first);
  assert.deepEqual(reopened.readRevision(first.artifactRevisionId, c), first);
  const before = fs.readFileSync(path.join(receipt.directory, 'current.json'));
  assert.equal(reopened.commit(first, first.artifactRevisionId, c).effect, 'UNCHANGED');
  assert.deepEqual(fs.readFileSync(path.join(receipt.directory, 'current.json')), before);
  assert.ok(Object.isFrozen(reopened.readCurrent(c).projection));
});

test('new revision preserves old history and compare-and-swap failure never moves current', async () => {
  const { c, first, second } = await artifacts(),
    { receipt, writer } = owned(c);
  writer.commit(first, null, c);
  assert.throws(() => writer.commit(second, 'wrong-current', c), {
    code: 'OUTPUT_TARGET_CONFLICT',
  });
  assert.deepEqual(writer.readCurrent(c), first);
  assert.equal(writer.commit(second, first.artifactRevisionId, c).effect, 'COMMITTED');
  const reopened = new OwnedWikiArtifactFiles(receipt, allowance);
  assert.deepEqual(reopened.readCurrent(c), second);
  assert.deepEqual(reopened.readRevision(first.artifactRevisionId, c), first);
  assert.deepEqual(reopened.readRevision(second.artifactRevisionId, c), second);
});

test('changed bytes under the same artifact revision are refused without overwriting history', async () => {
  const { c, first } = await artifacts(),
    { writer } = owned(c);
  writer.commit(first, null, c);
  const changed = structuredClone(first);
  changed.createdAt = '2026-11-09T00:00:00.000Z';
  assert.notEqual(changed.createdAt, first.createdAt);
  assert.throws(() => writer.commit(changed, first.artifactRevisionId, c), {
    code: 'OUTPUT_TARGET_CONFLICT',
  });
  assert.deepEqual(writer.readCurrent(c), first);
  assert.deepEqual(writer.readRevision(first.artifactRevisionId, c), first);
});

test('explicit byte limit and cancellation preserve the last current artifact', async () => {
  const { c, first, second } = await artifacts(),
    { receipt, writer } = owned(c);
  writer.commit(first, null, c);
  const bounded = new OwnedWikiArtifactFiles(receipt, 1);
  assert.throws(() => bounded.commit(second, first.artifactRevisionId, c), {
    code: 'ARTIFACT_LIMIT',
  });
  const abort = new AbortController();
  abort.abort();
  assert.throws(() =>
    writer.commit(second, first.artifactRevisionId, { ...c, signal: abort.signal }),
  );
  assert.deepEqual(writer.readCurrent(c), first);
  assert.deepEqual(writer.readRevision(first.artifactRevisionId, c), first);
});

test('foreign owner marker and transplanted path receipts cannot adopt an output directory', async () => {
  const { c, first } = await artifacts(),
    a = owned(c),
    b = owned(c);
  a.writer.commit(first, null, c);
  assert.throws(
    () => new OwnedWikiArtifactFiles({ ...a.receipt, directory: b.receipt.directory }, allowance),
    { code: 'OUTPUT_TARGET_CONFLICT' },
  );
  assert.equal(b.writer.readCurrent(c), null);
  assert.deepEqual(a.writer.readCurrent(c), first);
  const markerPath = path.join(a.receipt.directory, 'owner.json'),
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  marker.ownerId = 'foreign-owner';
  fs.writeFileSync(markerPath, JSON.stringify(marker));
  assert.throws(() => new OwnedWikiArtifactFiles(a.receipt, allowance), {
    code: 'OUTPUT_TARGET_CONFLICT',
  });
  assert.throws(() => a.writer.readCurrent(c), { code: 'OUTPUT_TARGET_CONFLICT' });
});

for (const outcome of ['before-rename', 'after-rename'])
  test(
    'current manifest ' +
      outcome +
      ' failure reports UNKNOWN, blocks repeat writes and permits inspection',
    async () => {
      const { c, first, second } = await artifacts(),
        { receipt, writer } = owned(c);
      writer.commit(first, null, c);
      const rename = fs.renameSync;
      let injected = 0;
      fs.renameSync = function (source, target) {
        if (path.resolve(String(target)) === path.join(receipt.directory, 'current.json')) {
          injected++;
          if (outcome === 'after-rename') rename.call(fs, source, target);
          throw Error('OWNED_CURRENT_RENAME_' + outcome);
        }
        return rename.call(fs, source, target);
      };
      try {
        assert.throws(() => writer.commit(second, first.artifactRevisionId, c), {
          code: 'ARTIFACT_COMMIT_UNKNOWN',
          publicationEffect: 'UNKNOWN',
        });
      } finally {
        fs.renameSync = rename;
      }
      assert.equal(injected, 1);
      assert.throws(() => writer.commit(second, first.artifactRevisionId, c), {
        code: 'ARTIFACT_WRITER_BLOCKED',
      });
      assert.deepEqual(writer.readCurrent(c), outcome === 'before-rename' ? first : second);
      assert.deepEqual(writer.readRevision(first.artifactRevisionId, c), first);
      const reopened = new OwnedWikiArtifactFiles(receipt, allowance);
      assert.deepEqual(reopened.readCurrent(c), outcome === 'before-rename' ? first : second);
      assert.throws(() => reopened.commit(second, first.artifactRevisionId, c), {
        code: 'ARTIFACT_WRITER_BLOCKED',
      });
    },
  );

test('confirmed commit with lock cleanup failure remains committed and blocks later writes', async () => {
  const { c, first, second } = await artifacts(),
    { receipt, writer } = owned(c);
  writer.commit(first, null, c);
  const unlink = fs.unlinkSync;
  let injected = 0,
    result;
  fs.unlinkSync = function (target) {
    if (
      path.resolve(String(target)) === path.join(receipt.directory, 'writer.lock') &&
      injected === 0
    ) {
      injected++;
      throw Error('OWNED_LOCK_CLEANUP_FAILURE');
    }
    return unlink.call(fs, target);
  };
  try {
    result = writer.commit(second, first.artifactRevisionId, c);
  } finally {
    fs.unlinkSync = unlink;
  }
  assert.equal(injected, 1);
  assert.equal(result.effect, 'COMMITTED');
  assert.equal(result.cleanupState, 'UNKNOWN');
  assert.deepEqual(result.artifact, second);
  assert.deepEqual(writer.readCurrent(c), second);
  assert.deepEqual(writer.readRevision(first.artifactRevisionId, c), first);
  assert.throws(() => writer.commit(second, second.artifactRevisionId, c), {
    code: 'ARTIFACT_WRITER_BLOCKED',
  });
});

test('lost lock-unlink acknowledgement requires explicit inspection on reopen before unchanged detection', async () => {
  const { c, first, second } = await artifacts(),
    { receipt, writer } = owned(c);
  writer.commit(first, null, c);
  const unlink = fs.unlinkSync;
  let injected = 0,
    result;
  fs.unlinkSync = function (target) {
    const removed = unlink.call(fs, target);
    if (
      path.resolve(String(target)) === path.join(receipt.directory, 'writer.lock') &&
      injected === 0
    ) {
      injected++;
      throw Error('OWNED_LOCK_UNLINK_ACKNOWLEDGEMENT_LOST');
    }
    return removed;
  };
  try {
    result = writer.commit(second, first.artifactRevisionId, c);
  } finally {
    fs.unlinkSync = unlink;
  }
  assert.equal(injected, 1);
  assert.equal(result.effect, 'COMMITTED');
  assert.equal(result.cleanupState, 'UNKNOWN');
  assert.deepEqual(result.artifact, second);
  assert.throws(() => writer.commit(second, second.artifactRevisionId, c), {
    code: 'ARTIFACT_WRITER_BLOCKED',
  });
  const reopened = new OwnedWikiArtifactFiles(receipt, allowance);
  assert.throws(() => reopened.commit(second, second.artifactRevisionId, c), {
    code: 'ARTIFACT_INSPECTION_REQUIRED',
  });
  assert.deepEqual(reopened.readCurrent(c), second);
  assert.equal(fs.existsSync(path.join(receipt.directory, 'pending.json')), false);
  assert.equal(fs.existsSync(path.join(receipt.directory, 'writer.lock')), false);
  const before = fs.readFileSync(path.join(receipt.directory, 'current.json'));
  const unchanged = reopened.commit(second, second.artifactRevisionId, c);
  assert.equal(unchanged.effect, 'UNCHANGED');
  assert.deepEqual(fs.readFileSync(path.join(receipt.directory, 'current.json')), before);
  assert.deepEqual(reopened.readRevision(first.artifactRevisionId, c), first);
  assert.deepEqual(reopened.readRevision(second.artifactRevisionId, c), second);
  assert.deepEqual(writer.readCurrent(c), second);
  assert.throws(() => writer.commit(second, second.artifactRevisionId, c), {
    code: 'ARTIFACT_WRITER_BLOCKED',
  });
});

test('acknowledged current rename followed by cancellation preserves the confirmed commit', async () => {
  const { c, first, second } = await artifacts(),
    { receipt, writer } = owned(c);
  writer.commit(first, null, c);
  const rename = fs.renameSync,
    abort = new AbortController();
  let injected = 0,
    result;
  fs.renameSync = function (source, target) {
    const renamed = rename.call(fs, source, target);
    if (path.resolve(String(target)) === path.join(receipt.directory, 'current.json')) {
      injected++;
      abort.abort();
    }
    return renamed;
  };
  try {
    result = writer.commit(second, first.artifactRevisionId, { ...c, signal: abort.signal });
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(injected, 1);
  assert.equal(result.effect, 'COMMITTED');
  assert.equal(result.cleanupState, 'UNKNOWN');
  assert.deepEqual(result.artifact, second);
  const inspectionControl = control();
  assert.deepEqual(writer.readCurrent(inspectionControl), second);
  assert.throws(() => writer.commit(second, second.artifactRevisionId, inspectionControl), {
    code: 'ARTIFACT_WRITER_BLOCKED',
  });
});

test('temporary file close acknowledgement failure blocks writes and preserves inspectable old current', async () => {
  const { c, first, second } = await artifacts(),
    { receipt, writer } = owned(c);
  writer.commit(first, null, c);
  const open = fs.openSync,
    close = fs.closeSync;
  let temporaryFd = null,
    injected = 0;
  fs.openSync = function (target, ...args) {
    const fd = open.call(fs, target, ...args);
    const resolved = path.resolve(String(target));
    if (
      path.dirname(resolved) === receipt.directory &&
      path.basename(resolved).startsWith('temporary-')
    )
      temporaryFd = fd;
    return fd;
  };
  fs.closeSync = function (fd) {
    const result = close.call(fs, fd);
    if (fd === temporaryFd && injected === 0) {
      injected++;
      throw Error('OWNED_TEMPORARY_CLOSE_ACKNOWLEDGEMENT_FAILURE');
    }
    return result;
  };
  try {
    assert.throws(() => writer.commit(second, first.artifactRevisionId, c), {
      code: 'ARTIFACT_IO_UNKNOWN',
      cleanupState: 'UNKNOWN',
    });
  } finally {
    fs.openSync = open;
    fs.closeSync = close;
  }
  assert.equal(injected, 1);
  assert.deepEqual(writer.readCurrent(c), first);
  assert.deepEqual(writer.readRevision(first.artifactRevisionId, c), first);
  assert.throws(() => writer.commit(second, first.artifactRevisionId, c), {
    code: 'ARTIFACT_WRITER_BLOCKED',
  });
});

test('hardlinked current manifest is refused within the newly owned directory', async () => {
  const { c, first } = await artifacts(),
    { receipt, writer } = owned(c);
  writer.commit(first, null, c);
  const current = path.join(receipt.directory, 'current.json'),
    alias = path.join(receipt.directory, 'retained-hardlink-evidence.json');
  fs.linkSync(current, alias);
  assert.ok(fs.lstatSync(current).nlink > 1);
  assert.throws(() => writer.readCurrent(c), { code: 'OUTPUT_TARGET_CONFLICT' });
  assert.deepEqual(writer.readRevision(first.artifactRevisionId, c), first);
});

test('a sibling root directory link or junction cannot substitute for its owned receipt', async () => {
  const { c, first } = await artifacts(),
    { receipt, writer } = owned(c);
  writer.commit(first, null, c);
  const alias = receipt.directory + 'Alias';
  assert.ok(path.isAbsolute(alias));
  assert.equal(path.dirname(alias), path.dirname(receipt.directory));
  assert.match(path.basename(alias), /^codeatlas-owned-wiki-[A-Za-z0-9]+$/);
  assert.equal(fs.existsSync(alias), false);
  fs.symlinkSync(receipt.directory, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => new OwnedWikiArtifactFiles({ ...receipt, directory: alias }, allowance), {
    code: 'OUTPUT_TARGET_CONFLICT',
  });
  assert.deepEqual(writer.readCurrent(c), first);
  assert.deepEqual(writer.readRevision(first.artifactRevisionId, c), first);
  // Preserve both the original owned directory and alias as failure evidence.
});

test('receipt file flavor is distinct from the legacy artifact writer', async () => {
  const api = await import('../dist/knowledge/offline-wiki-files.js');
  assert.equal(typeof api.ReceiptWikiArtifactFiles, 'function');
});

import { ReceiptWikiArtifactFiles } from '../dist/knowledge/offline-wiki-files.js';
import { ReceiptWikiArtifactPreparer } from '../../application/dist/owned-freshness-wiki.js';
import { runOwnedFreshnessWiki } from '../../runtime/dist/owned-freshness-wiki.js';
import { withFreshnessPublication } from '../../runtime/test/helpers/owned-freshness-fixture.mjs';
import { withReadyPublication } from './helpers/schema11-publication-fixture.mjs';
async function observedReceipt(t) {
  let observed;
  await withReadyPublication(
    t,
    async (f) => {
      f.writer.publishOwnedPrepared(f.ready.handle, f.limits, f.c);
      const source = f.owned.freshness;
      observed = await runOwnedFreshnessWiki(
        {
          workspaceId: f.w,
          repositoryIds: f.owned.repositoryIds,
          selectedPublishedRevisionRefs: f.refs,
          customizationPolicy: 'LOCKED',
          allowPartial: true,
        },
        {
          database: f.db,
          workspaceStore: source.workspaceStore,
          repositories: source.repositories,
          sources: new Map([[f.owned.repositoryIds[0], source.prepared.handle]]),
          limits: f.limits,
          authorize: () => undefined,
          currentPolicyVersions: () => source.policyVersions,
        },
        f.c,
      );
    },
    undefined,
    withFreshnessPublication,
  );
  return observed;
}
test('genuine observed receipt Wiki writes and reopens as historical-only with exact real sources and unchanged preparation', async (t) => {
  const result = await observedReceipt(t),
    c = control(),
    preparer = new ReceiptWikiArtifactPreparer();
  assert.throws(
    () => preparer.prepare(JSON.parse(JSON.stringify(result)), c),
    /OBSERVATION_UNAVAILABLE/,
  );
  const prepared = preparer.prepare(result, c),
    receipt = createOwnedWikiArtifactDirectory(c),
    writer = new ReceiptWikiArtifactFiles(receipt, allowance, preparer.identity);
  assert.throws(() => writer.commit({}, null, c), /HANDLE_UNAVAILABLE/);
  const first = writer.commit(prepared.handle, null, c);
  assert.equal(first.effect, 'COMMITTED');
  assert.equal(first.cleanupState, 'SETTLED');
  assert.equal(first.artifact.kind, 'SCHEMA11_RECEIPT_WIKI_ARTIFACT');
  assert.equal(first.artifact.version, 2);
  assert.equal(first.artifact.projection.status, 'PARTIAL');
  assert.equal(first.artifact.projection.quality, 'NOT_EVALUABLE');
  assert.equal(first.artifact.observation.state, 'HISTORICAL_MATCHED_WINDOW');
  assert.equal(first.artifact.observation.validity, 'ENDED');
  assert.equal(first.artifact.observation.currentFreshness, 'UNASSESSED');
  assert.ok(first.artifact.markdown.startsWith('# Historical observed Wiki'));
  assert.ok(first.artifact.markdown.includes('does not guarantee current Source freshness'));
  assert.ok(
    first.artifact.source.records.every(
      (r) => r.publicationId && r.candidateId && r.inputDigest && !Object.hasOwn(r, 'attemptId'),
    ),
  );
  // Pure structural order vector only: not a new observation or a file publication.
  const multi = structuredClone(first.artifact),
    row = multi.source.records[0];
  multi.source.records = [
    { ...row, itemId: 'item:a', revisionId: 'revision:z' },
    { ...row, itemId: 'item:z', revisionId: 'revision:a' },
  ];
  multi.projection.provenance.selectedPublishedRevisionRefs = multi.source.records.map((r) => ({
    itemId: r.itemId,
    revisionId: r.revisionId,
  }));
  multi.projection.provenance.knowledgeRevisionRefs = ['revision:a', 'revision:z'];
  multi.observation.sourceDigest = receiptWikiDigest(
    'codeatlas.receipt-wiki.source.v2',
    multi.source,
    c,
  );
  multi.observation.projectionDigest = receiptWikiDigest(
    'codeatlas.receipt-wiki.projection.v2',
    multi.projection,
    c,
  );
  assert.equal(parseReceiptWikiArtifact(multi, c).source.records.length, 2);
  const reopened = new ReceiptWikiArtifactFiles(
    receipt,
    allowance,
    new ReceiptWikiArtifactPreparer().identity,
  );
  assert.deepEqual(reopened.readCurrent(c), first.artifact);
  assert.ok(Object.isFrozen(reopened.readCurrent(c).observation));
  assert.deepEqual(reopened.readRevision(first.artifact.artifactRevisionId, c), first.artifact);
  assert.throws(
    () => new OwnedWikiArtifactFiles(receipt, allowance).readCurrent(c),
    /ARTIFACT_INVALID/,
  );
  assert.throws(
    () => writer.commit(prepared.handle, first.artifact.artifactRevisionId, c),
    /HANDLE_UNAVAILABLE/,
  );
  const repeat = preparer.prepare(result, c);
  assert.equal(
    writer.commit(repeat.handle, first.artifact.artifactRevisionId, c).effect,
    'UNCHANGED',
  );
  assert.throws(
    () => new ReceiptWikiArtifactPreparer().prepare(reopened.readCurrent(c), c),
    /OBSERVATION_UNAVAILABLE/,
  );
  const another = new ReceiptWikiArtifactPreparer();
  const anotherWriter = new ReceiptWikiArtifactFiles(receipt, allowance, another.identity);
  anotherWriter.readCurrent(c);
  assert.equal(
    anotherWriter.commit(another.prepare(result, c).handle, first.artifact.artifactRevisionId, c)
      .effect,
    'UNCHANGED',
  );
});
test('receipt writer refuses foreign issuer and legacy artifacts without changing either format', async (t) => {
  const result = await observedReceipt(t),
    c = control(),
    preparer = new ReceiptWikiArtifactPreparer(),
    receipt = createOwnedWikiArtifactDirectory(c);
  const foreign = new ReceiptWikiArtifactPreparer(),
    writer = new ReceiptWikiArtifactFiles(receipt, allowance, preparer.identity);
  assert.throws(
    () => writer.commit(foreign.prepare(result, c).handle, null, c),
    /HANDLE_UNAVAILABLE/,
  );
  const old = (await artifacts()).first;
  const legacy = new OwnedWikiArtifactFiles(receipt, allowance);
  legacy.commit(old, null, c);
  assert.throws(() => writer.readCurrent(c), /ARTIFACT_INVALID/);
  assert.throws(
    () => writer.commit(preparer.prepare(result, c).handle, old.artifactRevisionId, c),
    /ARTIFACT_INVALID/,
  );
  assert.deepEqual(legacy.readCurrent(c), old);
});
test('receipt source/window tampering remains invalid after resealing file-level hashes', async (t) => {
  const result = await observedReceipt(t),
    c = control(),
    preparer = new ReceiptWikiArtifactPreparer(),
    receipt = createOwnedWikiArtifactDirectory(c),
    writer = new ReceiptWikiArtifactFiles(receipt, allowance, preparer.identity);
  writer.commit(preparer.prepare(result, c).handle, null, c);
  const pointerPath = path.join(receipt.directory, 'current.json'),
    originalPointer = fs.readFileSync(pointerPath, 'utf8'),
    pointer = JSON.parse(originalPointer),
    revisionPath = path.join(receipt.directory, 'revision-' + pointer.revisionKey + '.json'),
    originalRevision = fs.readFileSync(revisionPath, 'utf8');
  for (const mutate of [
    (a) => {
      a.source.records[0].candidateId = 'substituted';
    },
    (a) => {
      a.observation.currentFreshness = 'FRESH';
    },
    (a) => {
      a.projection.kind = 'OWNED_TEST_WIKI';
    },
    (a) => {
      a.markdown = a.projection.markdown;
    },
  ]) {
    const revision = JSON.parse(originalRevision);
    mutate(revision.artifact);
    revision.artifactSha256 = createHash('sha256')
      .update(canonical(revision.artifact))
      .digest('hex');
    const text = canonical(revision);
    fs.writeFileSync(revisionPath, text);
    fs.writeFileSync(
      pointerPath,
      canonical({ ...pointer, sha256: createHash('sha256').update(text).digest('hex') }),
    );
    assert.throws(() =>
      new ReceiptWikiArtifactFiles(receipt, allowance, preparer.identity).readCurrent(c),
    );
  }
  fs.writeFileSync(revisionPath, originalRevision);
  fs.writeFileSync(pointerPath, originalPointer);
  assert.equal(
    new ReceiptWikiArtifactFiles(receipt, allowance, preparer.identity).readCurrent(c).observation
      .currentFreshness,
    'UNASSESSED',
  );
});
test('receipt historical revisions retain original evidence and uncertain pointer acknowledgement never retries', async (t) => {
  const firstResult = await observedReceipt(t),
    secondResult = await observedReceipt(t),
    c = control(),
    preparer = new ReceiptWikiArtifactPreparer(),
    receipt = createOwnedWikiArtifactDirectory(c),
    writer = new ReceiptWikiArtifactFiles(receipt, allowance, preparer.identity);
  const first = writer.commit(preparer.prepare(firstResult, c).handle, null, c).artifact;
  const originalRename = fs.renameSync;
  fs.renameSync = (...args) => {
    originalRename(...args);
    throw Error('OWNED_LOST_ACK');
  };
  try {
    assert.throws(
      () => writer.commit(preparer.prepare(secondResult, c).handle, first.artifactRevisionId, c),
      (e) => e.publicationEffect === 'UNKNOWN' && e.cleanupState === 'UNKNOWN',
    );
  } finally {
    fs.renameSync = originalRename;
  }
  const reopened = new ReceiptWikiArtifactFiles(receipt, allowance, preparer.identity),
    current = reopened.readCurrent(c);
  assert.notEqual(current.artifactRevisionId, first.artifactRevisionId);
  assert.deepEqual(reopened.readRevision(first.artifactRevisionId, c), first);
  assert.equal(current.observation.currentFreshness, 'UNASSESSED');
  assert.ok(fs.existsSync(path.join(receipt.directory, 'pending.json')));
  assert.throws(
    () => reopened.commit(preparer.prepare(secondResult, c).handle, current.artifactRevisionId, c),
    /ARTIFACT_WRITER_BLOCKED/,
  );
});
