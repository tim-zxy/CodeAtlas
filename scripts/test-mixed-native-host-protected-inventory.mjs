import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
let project;
try {
  ({ projectMixedNativeHostProtectedInventory: project } =
    await import('./mixed-native-host-protected-inventory.mjs'));
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}
const sha = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => JSON.stringify(value, null, 2) + '\n';
// Literal independent oracle/pins fixed before implementation. Numbers are fixture data only.
const graph = {
  kind: 'MIXED_NATIVE_HOST_PRODUCT_GRAPH',
  schemaVersion: 1,
  status: 'PROPOSED',
  hostEntryArtifactId: 'module-0',
  hostModuleArtifactIds: ['module-0', 'module-1'],
  edges: [
    {
      from: 'module-0',
      specifier: './worker.mjs',
      to: 'module-1',
    },
    {
      from: 'module-1',
      specifier: 'node:path',
      to: 'node:path',
    },
  ],
  artifacts: [
    {
      id: 'module-0',
      path: 'entry.mjs',
      sizeBytes: 11,
      sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    {
      id: 'module-1',
      path: 'lib/worker.mjs',
      sizeBytes: 13,
      sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
    {
      id: 'data-0',
      path: 'migrations/manifest.json',
      sizeBytes: 2,
      sha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    },
    {
      id: 'data-1',
      path: 'migrations/001.sql',
      sizeBytes: 4,
      sha256: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    },
  ],
  assets: [],
  sourceFiles: [
    {
      path: 'C:\\mutable\\source.py',
      sha256: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      sizeBytes: 8,
      identity: 'fixture',
    },
    {
      path: 'C:\\mutable\\repo.sqlite',
      sha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      sizeBytes: 12,
      identity: 'fixture',
    },
  ],
  executionAuthorized: false,
  productionAdmission: false,
  measurementEligible: false,
  moduleClosureAuthenticated: false,
  contextAuthenticated: false,
  liveTransportConnected: false,
};
const descriptor = {
  kind: 'MIXED_NATIVE_HOST_BOOTSTRAP_DESCRIPTOR',
  schemaVersion: 1,
  artifactLimits: {
    maxManifestBytes: 10000,
    maxArtifactBytes: 10000,
    maxTotalBytes: 100000,
    maxFiles: 50,
  },
  deadlineEpochMs: 1000,
  hostEntryArtifactId: 'module-0',
  hostModuleArtifactIds: ['module-0', 'module-1'],
  workspaceId: 'workspace:fixed',
  repositoryId: 'repo:fixed',
  slots: [],
  controlLimits: {
    maxFrameBytes: 1000,
    maxTotalBytes: 10000,
    maxFrames: 10,
  },
  edges: [
    {
      from: 'module-0',
      specifier: './worker.mjs',
      to: 'module-1',
    },
    {
      from: 'module-1',
      specifier: 'node:path',
      to: 'node:path',
    },
  ],
};
const manifest = {
  kind: 'MIXED_NATIVE_OFFLINE_OWNER_CONTEXT',
  schemaVersion: 1,
  status: 'PROPOSED',
  artifacts: [
    {
      id: 'module-0',
      path: 'entry.mjs',
      sizeBytes: 11,
      sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    {
      id: 'module-1',
      path: 'lib/worker.mjs',
      sizeBytes: 13,
      sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
    {
      id: 'data-0',
      path: 'migrations/manifest.json',
      sizeBytes: 2,
      sha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    },
    {
      id: 'data-1',
      path: 'migrations/001.sql',
      sizeBytes: 4,
      sha256: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    },
    {
      id: 'bootstrap',
      path: 'bootstrap.json',
      sizeBytes: 736,
      sha256: 'b8ea71bceefa0b485c785f64cdd31615cc647fd9188d1813fc363ffd3219f294',
    },
    {
      id: 'operation',
      path: 'operation.json',
      sizeBytes: 2,
      sha256: '1111111111111111111111111111111111111111111111111111111111111111',
    },
    {
      id: 'host',
      path: 'tools/host.exe',
      sizeBytes: 3,
      sha256: '2222222222222222222222222222222222222222222222222222222222222222',
    },
    {
      id: 'observer',
      path: 'tools/observer.exe',
      sizeBytes: 3,
      sha256: '3333333333333333333333333333333333333333333333333333333333333333',
    },
    {
      id: 'git',
      path: 'tools/git.exe',
      sizeBytes: 3,
      sha256: '4444444444444444444444444444444444444444444444444444444444444444',
    },
    {
      id: 'native',
      path: 'tools/native.exe',
      sizeBytes: 3,
      sha256: '5555555555555555555555555555555555555555555555555555555555555555',
    },
  ],
  bindings: {
    owner: 'operation',
    host: 'host',
    observer: 'observer',
    git: 'git',
    native: 'native',
    oracle: 'operation',
    repository: 'operation',
    workspace: 'operation',
    source: 'operation',
  },
  liveContext: null,
  executionAuthorized: false,
  productionAdmission: false,
  measurementEligible: false,
};
function input() {
  return structuredClone({
    root: 'C:/bundle',
    manifestPath: 'context.json',
    manifestSha256: '302f4f49c47f84594cae13343c7ffbbf120f5839729594d64516d4195f649f33',
    manifest,
    descriptor,
    graph,
    manifestBytes: Buffer.from(canonical(manifest)),
    descriptorBytes: Buffer.from(canonical(descriptor)),
    pins: {
      artifactsSha256: '02bb209216c5904b7e1692f106db10409889ac2591bcab1d886b8b2f04b7b0f1',
      edgesSha256: '88efb39c3d4546f971b74af769b5b65a65ea1785974e05496d7b51c88de1c9a0',
      sourceFilesSha256: '49d9d9af56e7e4bfae86db1cd3ba2dd719846b3c4a567c65ff3f98b7e64e12b7',
    },
    supplement: [
      {
        id: 'bootstrap-script',
        path: 'C:/start/mixed-native-host-bootstrap.mjs',
        kind: 'Bootstrap',
        parentId: null,
        sha256: '7777777777777777777777777777777777777777777777777777777777777777',
      },
      {
        id: 'prehook-owner',
        path: 'C:/start/mixed-native-owner-context.mjs',
        kind: 'PrehookOwner',
        parentId: null,
        sha256: '8888888888888888888888888888888888888888888888888888888888888888',
      },
      {
        id: 'prehook-loader',
        path: 'C:/start/mixed-native-host-module-loader.mjs',
        kind: 'PrehookLoader',
        parentId: null,
        sha256: '9999999999999999999999999999999999999999999999999999999999999999',
      },
      {
        id: 'host',
        path: 'C:/bundle/tools/host.exe',
        kind: 'Tool',
        parentId: null,
        sha256: '2222222222222222222222222222222222222222222222222222222222222222',
      },
      {
        id: 'observer',
        path: 'C:/bundle/tools/observer.exe',
        kind: 'Tool',
        parentId: null,
        sha256: '3333333333333333333333333333333333333333333333333333333333333333',
      },
      {
        id: 'git',
        path: 'C:/bundle/tools/git.exe',
        kind: 'Tool',
        parentId: null,
        sha256: '4444444444444444444444444444444444444444444444444444444444444444',
      },
      {
        id: 'native',
        path: 'C:/bundle/tools/native.exe',
        kind: 'Tool',
        parentId: null,
        sha256: '5555555555555555555555555555555555555555555555555555555555555555',
      },
    ],
    excludedPaths: [
      'C:/mutable/source.py',
      'C:/mutable/repo.sqlite',
      'C:/mutable/repo.sqlite-wal',
      'C:/mutable/repo.sqlite-shm',
    ],
  });
}
function repinManifest(x) {
  x.manifestBytes = Buffer.from(canonical(x.manifest));
  x.manifestSha256 = sha(x.manifestBytes);
}
function repinDescriptor(x) {
  const bytes = canonical(x.descriptor),
    a = x.manifest.artifacts.find((a) => a.id === 'bootstrap');
  x.descriptorBytes = Buffer.from(bytes);
  a.sha256 = sha(bytes);
  a.sizeBytes = Buffer.byteLength(bytes);
  repinManifest(x);
}
function refuse(x) {
  assert.throws(() => project(x), { code: 'INVALID_MIXED_NATIVE_HOST_PROTECTED_INVENTORY' });
}
test('literal full manifest plus explicit helpers/tools projects every lexical ancestor and existing Entry fields', () => {
  assert.equal(typeof project, 'function');
  const x = input(),
    r = project(x);
  assert.deepEqual(
    r.entries.map((e) => e.path),
    [
      'C:/',
      'C:/bundle',
      'C:/bundle/lib',
      'C:/bundle/migrations',
      'C:/bundle/tools',
      'C:/start',
      'C:/bundle/bootstrap.json',
      'C:/bundle/context.json',
      'C:/bundle/entry.mjs',
      'C:/bundle/lib/worker.mjs',
      'C:/bundle/migrations/001.sql',
      'C:/bundle/migrations/manifest.json',
      'C:/bundle/operation.json',
      'C:/bundle/tools/git.exe',
      'C:/bundle/tools/host.exe',
      'C:/bundle/tools/native.exe',
      'C:/bundle/tools/observer.exe',
      'C:/start/mixed-native-host-bootstrap.mjs',
      'C:/start/mixed-native-host-module-loader.mjs',
      'C:/start/mixed-native-owner-context.mjs',
    ],
  );
  const byId = new Map(r.entries.map((e) => [e.id, e]));
  for (const e of r.entries) {
    assert.deepEqual(Object.keys(e).sort(), ['id', 'kind', 'parentId', 'path', 'sha256']);
    if (e.parentId !== null) assert.equal(byId.get(e.parentId).kind, 'Ancestor');
  }
  for (const [child, parent] of [
    ['C:/bundle', 'C:/'],
    ['C:/bundle/lib', 'C:/bundle'],
    ['C:/bundle/migrations', 'C:/bundle'],
    ['C:/bundle/lib/worker.mjs', 'C:/bundle/lib'],
    ['C:/bundle/migrations/001.sql', 'C:/bundle/migrations'],
    ['C:/bundle/tools/host.exe', 'C:/bundle/tools'],
    ['C:/start/mixed-native-owner-context.mjs', 'C:/start'],
  ]) {
    const entry = r.entries.find((e) => e.path === child);
    assert.equal(byId.get(entry.parentId).path, parent);
  }
  assert.equal(r.entries.find((e) => e.path === 'C:/').parentId, null);
  assert.equal(r.entries.find((e) => e.id === 'module-1').kind, 'Module');
  assert.equal(r.entries.find((e) => e.id === 'data-1').kind, 'PathData');
  assert.equal(r.entries.find((e) => e.id === 'host').kind, 'Tool');
  assert.ok(r.entries.every((e) => !e.path.startsWith('C:/mutable')));
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.entries) && r.entries.every(Object.isFrozen));
  for (const k of [
    'executionAuthorized',
    'productionAdmission',
    'measurementEligible',
    'moduleClosureAuthenticated',
    'contextAuthenticated',
    'liveTransportConnected',
  ])
    assert.equal(r[k], false);
  assert.equal(r.liveAdmission, 'NOT_READY');
  x.supplement[0].path = 'C:/changed';
  assert.ok(!r.entries.some((e) => e.path === 'C:/changed'));
});
for (const missing of ['module-1', 'data-0', 'data-1', 'operation', 'bootstrap']) {
  test('missing declared ' + missing + ' refuses even after manifest reseal', () => {
    const x = input();
    x.manifest.artifacts = x.manifest.artifacts.filter((a) => a.id !== missing);
    repinManifest(x);
    refuse(x);
  });
}
for (const missing of [
  'bootstrap-script',
  'prehook-owner',
  'prehook-loader',
  'host',
  'observer',
  'git',
  'native',
]) {
  test('missing independently fixed supplement ' + missing + ' refuses', () => {
    const x = input();
    x.supplement = x.supplement.filter((a) => a.id !== missing);
    refuse(x);
  });
}
for (const bad of [
  'C:/start/../other.mjs',
  'C:/start/file:stream',
  'C:/start/CON.mjs',
  'C:/start/end.',
  'C:/start/white\nname',
  'C:/start//file.mjs',
  'C:/start/%alias.mjs',
]) {
  test('ambiguous supplement path refuses ' + JSON.stringify(bad), () => {
    const x = input();
    x.supplement[0].path = bad;
    refuse(x);
  });
}
test('graph omission cannot be blessed by resealing manifest', () => {
  const x = input();
  x.graph.artifacts.pop();
  repinManifest(x);
  refuse(x);
});
test('stale graph module SHA refuses independently fixed pins', () => {
  const x = input();
  x.graph.artifacts[0].sha256 = '0000000000000000000000000000000000000000000000000000000000000000';
  refuse(x);
});
test('changed manifest cannot reuse expected manifest SHA', () => {
  const x = input();
  x.manifest.artifacts[0].sha256 =
    '0000000000000000000000000000000000000000000000000000000000000000';
  refuse(x);
});
test('descriptor module omission refuses after its byte and manifest reseal', () => {
  const x = input();
  x.descriptor.hostModuleArtifactIds = ['module-0'];
  repinDescriptor(x);
  refuse(x);
});
test('changed entry refuses after descriptor reseal', () => {
  const x = input();
  x.descriptor.hostEntryArtifactId = 'module-1';
  repinDescriptor(x);
  refuse(x);
});
test('descriptor bytes must match independently declared manifest artifact', () => {
  const x = input();
  x.descriptor.repositoryId = 'different';
  refuse(x);
});
test('same ID different hash supplement refuses', () => {
  const x = input();
  x.supplement.find((a) => a.id === 'host').sha256 =
    '0000000000000000000000000000000000000000000000000000000000000000';
  refuse(x);
});
test('case alias / duplicate physical named path refuses', () => {
  const x = input();
  x.supplement.push({
    ...x.supplement[0],
    id: 'alias',
    path: 'c:/START/mixed-native-host-bootstrap.mjs',
  });
  refuse(x);
});
test('same ID different path refuses', () => {
  const x = input();
  x.supplement.find((a) => a.id === 'host').path = 'C:/else/host.exe';
  refuse(x);
});
test('mutable exact path overlap refuses instead of silently dropping protected entry', () => {
  const x = input();
  x.excludedPaths.push('C:/bundle/lib/worker.mjs');
  refuse(x);
});
test('tool marker input never becomes actual tool identity evidence', () => {
  const r = project(input());
  assert.equal(r.liveAdmission, 'NOT_READY');
  assert.equal(r.executionAuthorized, false);
});

test('raw manifest whitespace is hashed exactly; projector does not invent encoding admissibility', () => {
  const x = input();
  x.manifestBytes = Buffer.from(JSON.stringify(x.manifest, null, 4) + '\r\n');
  x.manifestSha256 = sha(x.manifestBytes);
  assert.equal(project(x).liveAdmission, 'NOT_READY');
});
test('raw structures cannot disagree with their supplied parsed counterparts', () => {
  const x = input();
  x.manifest.repository = 'foreign';
  refuse(x);
});

test('ordinary embedded spaces preserve exact Windows paths accepted by existing Entry contract', () => {
  const x = input();
  x.root = 'C:/Program Files/bundle';
  for (const e of x.supplement)
    if (e.path.startsWith('C:/bundle/'))
      e.path = e.path.replace('C:/bundle/', 'C:/Program Files/bundle/');
  const r = project(x);
  assert.ok(r.entries.some((e) => e.path === 'C:/Program Files/bundle/tools/host.exe'));
});

for (const id of [
  'owner-context-manifest',
  'bootstrap',
  'operation',
  'data-0',
  'data-1',
  'module-1',
]) {
  test('reserved role cannot be overwritten with Tool: ' + id, () => {
    const x = input();
    const a =
      id === 'owner-context-manifest'
        ? { path: 'context.json', sha256: x.manifestSha256 }
        : x.manifest.artifacts.find((a) => a.id === id);
    x.supplement.push({
      id,
      path: 'C:/bundle/' + a.path,
      kind: 'Tool',
      parentId: null,
      sha256: a.sha256,
    });
    refuse(x);
  });
}
test('same exact module artifact may additionally serve its fixed prehook filename', () => {
  const x = input();
  x.graph.artifacts.find((a) => a.id === 'module-1').path = 'lib/mixed-native-owner-context.mjs';
  x.manifest.artifacts.find((a) => a.id === 'module-1').path = 'lib/mixed-native-owner-context.mjs';
  x.pins.artifactsSha256 = sha(JSON.stringify(x.graph.artifacts));
  repinManifest(x);
  x.supplement = x.supplement.filter((a) => a.id !== 'prehook-owner');
  x.supplement.push({
    id: 'module-1',
    path: 'C:/bundle/lib/mixed-native-owner-context.mjs',
    kind: 'PrehookOwner',
    parentId: null,
    sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  });
  const result = project(x);
  assert.equal(result.entries.find((a) => a.id === 'module-1').kind, 'PrehookOwner');
  assert.equal(
    result.entries.filter((a) => a.path === 'C:/bundle/lib/mixed-native-owner-context.mjs').length,
    1,
  );
  assert.equal(result.liveAdmission, 'NOT_READY');
});
