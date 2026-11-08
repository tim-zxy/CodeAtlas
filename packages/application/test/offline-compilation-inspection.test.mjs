import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  fixture,
  account,
  control,
  canonical,
  hash,
} from './helpers/captured-integration-fixture.mjs';
import { createCompilationInputSnapshot } from '../dist/compilation-input-contract.js';
import {
  createOfflineCompilationInspection,
  runOfflineCompilationInspection,
} from '../dist/offline-compilation-inspection.js';
async function setup(t, text = 'const value = 1;\n') {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-offline-inspection-'));
  t.after(async () => {
    assert.equal(path.dirname(root), tmpdir());
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(path.join(root, 'a.java'), text);
  const baseline = await stat(path.join(root, 'a.java'));
  const f = fixture(),
    source = f.raw.repositories[0].supports[0];
  source.value.contentFingerprint = 'sha256:' + hash(text);
  f.support.valueDigest = hash('codeatlas-phase1-support-value-v1\0' + canonical(source.value));
  source.capturedValueDigest = hash(
    'codeatlas.capture-value.v1\n' +
      canonical({ value: source.value, valueSchemaRef: 'SourceFile@1' }),
  );
  const requirement = {
    key: JSON.stringify(['SOURCE_FILE', 'w', 'r', 'v', 'f']),
    kind: 'SOURCE_FILE',
    workspaceId: 'w',
    repositoryId: 'r',
    revisionId: 'v',
    entityId: 'f',
    path: 'a.java',
    contentFingerprint: source.value.contentFingerprint,
  };
  const binding = {
    operationId: 'offline-one',
    workspaceId: 'w',
    revisionSetId: 'rs',
    scope: f.raw.scope,
    policyVersions: f.raw.policyVersions,
  };
  let grants = 0,
    reads = 0,
    settles = 0,
    consumes = 0,
    seen;
  const events = [];
  const ports = {
    evidenceKind: 'TEST_PORTS_NOT_AUTHORITY',
    async readMetadata() {
      events.push('metadata');
      return [requirement];
    },
    async authorizeOriginal(file) {
      assert.equal(file.path, 'a.java');
      grants++;
      events.push('auth');
    },
    async readOriginal(file) {
      assert.ok(grants > reads);
      reads++;
      events.push('read');
      assert.equal(path.basename(file.path), file.path);
      return readFile(path.join(root, file.path));
    },
    async materializeSnapshot(originals) {
      events.push('materialize');
      assert.equal(Buffer.from(originals.get(requirement.key)).toString(), text);
      return createCompilationInputSnapshot(f.raw, control());
    },
    async recheck() {
      events.push('recheck');
      const now = await stat(path.join(root, 'a.java'));
      assert.equal(now.ino, baseline.ino);
      assert.equal(now.size, baseline.size);
      assert.equal(now.mtimeMs, baseline.mtimeMs);
    },
    async settle() {
      settles++;
      events.push('settle');
    },
    async consume(snapshot) {
      consumes++;
      seen = snapshot;
      events.push('consume');
      assert.ok(Object.isFrozen(snapshot));
    },
  };
  return {
    root,
    f,
    requirement,
    binding,
    ports,
    events,
    handle: () =>
      createOfflineCompilationInspection({
        binding,
        ports,
        control: control(),
        account: account(),
      }),
    get counts() {
      return { grants, reads, settles, consumes };
    },
    get seen() {
      return seen;
    },
  };
}
test('real temporary originals authorize before reads and bind same frozen final payload without clearance', async (t) => {
  const f = await setup(t),
    h = f.handle(),
    result = await runOfflineCompilationInspection(h);
  assert.deepEqual(f.events, [
    'metadata',
    'auth',
    'read',
    'materialize',
    'recheck',
    'settle',
    'auth',
    'recheck',
    'consume',
  ]);
  assert.equal(result.clearance, false);
  assert.equal(result.evidenceKind, 'TEST_PORTS_NOT_AUTHORITY');
  assert.equal(result.authorization, 'NOT_ESTABLISHED');
  assert.equal(result.originalSource, 'SUPPLIED_BYTES_ONLY');
  assert.equal(result.payloadDigest, hash(canonical(f.seen)));
  assert.equal(result.inputDigest, f.seen.inputDigest);
  await assert.rejects(runOfflineCompilationInspection(h));
});
test('permission denial has no body reads and always settles', async (t) => {
  const f = await setup(t);
  f.ports.authorizeOriginal = async () => {
    throw Error('denied');
  };
  await assert.rejects(runOfflineCompilationInspection(f.handle()));
  assert.deepEqual(f.counts, { grants: 0, reads: 0, settles: 1, consumes: 0 });
});
test('extra metadata and TOCTOU contents refuse instead of successful subset', async (t) => {
  for (const mode of ['extra', 'changed']) {
    const f = await setup(t);
    if (mode === 'extra')
      f.ports.readMetadata = async () => [
        f.requirement,
        {
          ...f.requirement,
          key: JSON.stringify(['SOURCE_FILE', 'w', 'r', 'v', 'other']),
          entityId: 'other',
        },
      ];
    else await writeFile(path.join(f.root, 'a.java'), 'changed');
    await assert.rejects(runOfflineCompilationInspection(f.handle()));
    assert.equal(f.counts.consumes, 0);
    assert.equal(f.counts.settles, 1);
  }
});
test('detected original rejects no matter supplied test permission', async (t) => {
  const f = await setup(t, 'password=synthetic-only');
  await assert.rejects(runOfflineCompilationInspection(f.handle()), {
    code: 'OFFLINE_SECRET_DETECTED',
  });
  assert.equal(f.counts.consumes, 0);
  assert.equal(f.counts.settles, 1);
});
test('settle unknown or revocation during settle stops consumer; consumer failure preserves UNKNOWN', async (t) => {
  for (const mode of ['unknown', 'revoke', 'consume']) {
    const f = await setup(t);
    if (mode === 'unknown')
      f.ports.settle = async () => {
        throw Error('unsettled');
      };
    if (mode === 'revoke') {
      let revoked = false;
      const auth = f.ports.authorizeOriginal;
      f.ports.authorizeOriginal = async (file) => {
        if (revoked) throw Error('revoked');
        return auth(file);
      };
      f.ports.settle = async () => {
        revoked = true;
      };
    }
    if (mode === 'consume')
      f.ports.consume = async () => {
        throw Error('after-taking-payload');
      };
    await assert.rejects(runOfflineCompilationInspection(f.handle()), (e) => {
      assert.equal(e.consumption, mode === 'consume' ? 'UNKNOWN' : 'NOT_CONSUMED');
      if (mode === 'unknown') assert.equal(e.cleanupState, 'UNKNOWN');
      return true;
    });
  }
});
test('cancellation and invalid replacement handles do not consume', async (t) => {
  const f = await setup(t);
  const c = new AbortController();
  const h = createOfflineCompilationInspection({
    binding: f.binding,
    ports: f.ports,
    control: control({ signal: c.signal }),
    account: account(),
  });
  c.abort();
  await assert.rejects(runOfflineCompilationInspection(h));
  assert.equal(f.counts.settles, 1);
  assert.equal(f.counts.reads, 0);
  await assert.rejects(runOfflineCompilationInspection({}));
});

test('designated metadata permission port rejects binary classification before body reads', async (t) => {
  const f = await setup(t);
  f.f.raw.repositories[0].supports[0].value.classification.contentKind = 'BINARY';
  f.ports.authorizeOriginal = async () => {
    if (f.f.raw.repositories[0].supports[0].value.classification.contentKind !== 'TEXT')
      throw Error('uninspectable');
  };
  await assert.rejects(runOfflineCompilationInspection(f.handle()));
  assert.equal(f.counts.reads, 0);
  assert.equal(f.counts.settles, 1);
});
test('source changes during materialization are caught by designated recheck', async (t) => {
  const f = await setup(t),
    materialize = f.ports.materializeSnapshot;
  f.ports.materializeSnapshot = async (bytes) => {
    const s = await materialize(bytes);
    await writeFile(path.join(f.root, 'a.java'), 'later changed');
    return s;
  };
  await assert.rejects(runOfflineCompilationInspection(f.handle()));
  assert.equal(f.counts.consumes, 0);
  assert.equal(f.counts.settles, 1);
});

test('materializer byte/map mutation immediately or during cleanup refuses', async (t) => {
  for (const mode of ['bytes', 'keys', 'cleanup']) {
    const f = await setup(t),
      materialize = f.ports.materializeSnapshot;
    let retained;
    f.ports.materializeSnapshot = async (map) => {
      retained = map;
      const snapshot = await materialize(map);
      if (mode === 'bytes') map.values().next().value[0] ^= 1;
      if (mode === 'keys') map.clear();
      return snapshot;
    };
    if (mode === 'cleanup')
      f.ports.settle = async () => {
        retained.values().next().value[0] ^= 1;
      };
    await assert.rejects(runOfflineCompilationInspection(f.handle()));
    assert.equal(f.counts.consumes, 0);
  }
});
test('top-level accessors do not execute and malformed metadata never reaches body reads', async (t) => {
  const f = await setup(t);
  let calls = 0;
  const input = { binding: f.binding, ports: f.ports, control: control(), account: account() };
  Object.defineProperty(input, 'ports', {
    enumerable: true,
    get() {
      calls++;
      return f.ports;
    },
  });
  assert.throws(() => createOfflineCompilationInspection(input));
  assert.equal(calls, 0);
  for (const field of ['revisionId', 'entityId', 'repositoryId']) {
    const item = { ...f.requirement, [field]: '' };
    f.ports.readMetadata = async () => [item];
    await assert.rejects(runOfflineCompilationInspection(f.handle()));
    assert.equal(f.counts.reads, 0);
  }
});
test('helper failure with failed invalidation preserves UNKNOWN without retrying invalidation', async (t) => {
  const f = await setup(t),
    a = account();
  let count = 0;
  f.ports.materializeSnapshot = async () => {
    const raw = structuredClone(f.f.raw);
    const sup = raw.repositories[0].supports[0];
    sup.value.classification.contentKind = 'BINARY';
    sup.ref.valueDigest = hash('codeatlas-phase1-support-value-v1\0' + canonical(sup.value));
    sup.capturedValueDigest = hash(
      'codeatlas.capture-value.v1\n' +
        canonical({ value: sup.value, valueSchemaRef: 'SourceFile@1' }),
    );
    return createCompilationInputSnapshot(raw, control());
  };
  a.invalidate = () => {
    count++;
    throw Error('unsettled');
  };
  const h = createOfflineCompilationInspection({
    binding: f.binding,
    ports: f.ports,
    control: control(),
    account: a,
  });
  await assert.rejects(runOfflineCompilationInspection(h), { cleanupState: 'UNKNOWN' });
  assert.equal(count, 1);
});

test('retry after consumer uncertainty preserves sticky UNKNOWN effect', async (t) => {
  const f = await setup(t);
  f.ports.consume = async () => {
    throw Error('after-receipt');
  };
  const h = f.handle();
  await assert.rejects(runOfflineCompilationInspection(h), { consumption: 'UNKNOWN' });
  await assert.rejects(runOfflineCompilationInspection(h), {
    code: 'OFFLINE_OWNER_UNAVAILABLE',
    consumption: 'UNKNOWN',
  });
});
