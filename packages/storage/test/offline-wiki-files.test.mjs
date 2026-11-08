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
