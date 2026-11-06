import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectMixedNativeHostProtectedInventory } from './mixed-native-host-protected-inventory.mjs';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const raw = (v) => Buffer.from(JSON.stringify(v, null, 2) + '\n');
const artifact = (id, path, sizeBytes, sha256) => ({ id, path, sizeBytes, sha256 });
function projected() {
  // Independent synthetic literal data only. No filesystem, current graph, real tools or expected-output builder.
  const graph = {
    kind: 'MIXED_NATIVE_HOST_PRODUCT_GRAPH',
    schemaVersion: 1,
    status: 'PROPOSED',
    hostEntryArtifactId: 'module-0',
    hostModuleArtifactIds: ['module-0', 'module-1'],
    edges: [{ from: 'module-0', specifier: './mixed-native-owner-context.mjs', to: 'module-1' }],
    artifacts: [
      artifact(
        'module-0',
        'entry.mjs',
        10,
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ),
      artifact(
        'module-1',
        'mixed-native-owner-context.mjs',
        11,
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ),
      artifact(
        'data-0',
        'migrations/001.sql',
        12,
        'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      ),
    ],
    assets: [],
    sourceFiles: [],
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
    workspaceId: 'workspace:receiver',
    repositoryId: 'repo:receiver',
    slots: [],
    controlLimits: { maxFrameBytes: 1000, maxTotalBytes: 10000, maxFrames: 10 },
    edges: graph.edges,
  };
  const descriptorBytes = raw(descriptor);
  const manifest = {
    kind: 'MIXED_NATIVE_OFFLINE_OWNER_CONTEXT',
    schemaVersion: 1,
    status: 'PROPOSED',
    artifacts: [
      ...graph.artifacts,
      artifact('bootstrap', 'bootstrap.json', descriptorBytes.length, hash(descriptorBytes)),
      artifact(
        'operation',
        'operation.json',
        2,
        '1111111111111111111111111111111111111111111111111111111111111111',
      ),
      artifact(
        'host',
        'tools/node.exe',
        3,
        '2222222222222222222222222222222222222222222222222222222222222222',
      ),
      artifact(
        'observer',
        'tools/observer.exe',
        3,
        '3333333333333333333333333333333333333333333333333333333333333333',
      ),
      artifact(
        'git',
        'tools/git.exe',
        3,
        '4444444444444444444444444444444444444444444444444444444444444444',
      ),
      artifact(
        'native',
        'tools/native.exe',
        3,
        '5555555555555555555555555555555555555555555555555555555555555555',
      ),
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
  const manifestBytes = raw(manifest);
  const supplement = [
    {
      id: 'bootstrap-script',
      path: 'C:/receiver-bootstrap/mixed-native-host-bootstrap.mjs',
      kind: 'Bootstrap',
      parentId: null,
      sha256: '7777777777777777777777777777777777777777777777777777777777777777',
    },
    {
      id: 'prehook-loader',
      path: 'C:/receiver-bootstrap/mixed-native-host-module-loader.mjs',
      kind: 'PrehookLoader',
      parentId: null,
      sha256: '8888888888888888888888888888888888888888888888888888888888888888',
    },
    {
      id: 'module-1',
      path: 'C:/receiver-bundle/mixed-native-owner-context.mjs',
      kind: 'PrehookOwner',
      parentId: null,
      sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
    {
      id: 'host',
      path: 'C:/receiver-bundle/tools/node.exe',
      kind: 'Tool',
      parentId: null,
      sha256: '2222222222222222222222222222222222222222222222222222222222222222',
    },
    {
      id: 'observer',
      path: 'C:/receiver-bundle/tools/observer.exe',
      kind: 'Tool',
      parentId: null,
      sha256: '3333333333333333333333333333333333333333333333333333333333333333',
    },
    {
      id: 'git',
      path: 'C:/receiver-bundle/tools/git.exe',
      kind: 'Tool',
      parentId: null,
      sha256: '4444444444444444444444444444444444444444444444444444444444444444',
    },
    {
      id: 'native',
      path: 'C:/receiver-bundle/tools/native.exe',
      kind: 'Tool',
      parentId: null,
      sha256: '5555555555555555555555555555555555555555555555555555555555555555',
    },
  ];
  return projectMixedNativeHostProtectedInventory({
    root: 'C:/receiver-bundle',
    manifestPath: 'context.json',
    manifestSha256: hash(manifestBytes),
    manifest,
    descriptor,
    graph,
    manifestBytes,
    descriptorBytes,
    supplement,
    excludedPaths: [],
    pins: {
      artifactsSha256: hash(JSON.stringify(graph.artifacts)),
      edgesSha256: hash(JSON.stringify(graph.edges)),
      sourceFilesSha256: hash(JSON.stringify(graph.sourceFiles)),
    },
  }).entries;
}
const complete = projected();
const missing = complete.filter((e) => e.kind !== 'Manifest');
const parent = structuredClone(complete);
parent.find((e) => e.id === 'module-0').parentId = 'absent-parent';
const unknown = structuredClone(complete);
unknown.find((e) => e.id === 'module-0').kind = 'UNKNOWN_KIND';
const child =
  process.platform === 'win32'
    ? spawnSync(
        'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-File',
          fileURLToPath(
            new URL('./test-mixed-native-host-protected-inventory-receiver.ps1', import.meta.url),
          ),
        ],
        {
          input: JSON.stringify([complete, missing, parent, unknown]),
          windowsHide: true,
          encoding: 'utf8',
          timeout: 30000,
          maxBuffer: 1000000,
        },
      )
    : null;
function received(index) {
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const results = JSON.parse(child.stdout.trim());
  assert.equal(results.length, 4);
  return results[index];
}
test(
  'projected complete Entry fields with a shared module/prehook construct and acquire in original C#',
  { skip: process.platform !== 'win32' },
  (t) => {
    const r = received(0);
    assert.equal(r.accepted, true, JSON.stringify(r));
    assert.equal(r.entries.length, 17);
    assert.equal(r.entries.find((e) => e.path === 'C:/').parentId, null);
    assert.equal(r.entries.find((e) => e.path === 'C:/').sha256, null);
    assert.equal(r.opened, 17);
    assert.deepEqual(r.closed, [17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    assert.equal(r.beforeRelease, 'OFFLINE_OWNERSHIP_READY');
    assert.equal(r.afterRelease, 'RELEASED');
    assert.equal(r.entries.find((e) => e.id === 'module-1').kind, 'PrehookOwner');
    assert.equal(r.entries.filter((e) => e.id === 'module-1').length, 1);
    assert.equal(
      r.entries.find((e) => e.id === 'module-0').parentId,
      r.entries.find((e) => e.path === 'C:/receiver-bundle').id,
    );
    assert.equal(r.executionAuthorized, false);
    assert.equal(r.productionAdmission, false);
    assert.equal(r.measurementEligible, false);
    assert.equal(r.liveAdmission, 'NOT_READY');
    assert.equal(r.actualWindowsCalls, 0);
    assert.equal(r.actualHostStarts, 0);
    t.diagnostic(
      JSON.stringify({
        compilerTesthostProcesses: 1,
        addTypeCompilations: 1,
        cases: JSON.parse(child.stdout).map((v) => ({
          accepted: v.accepted,
          opened: v.opened,
          closed: v.closed,
          stage: v.stage,
          errorType: v.errorType,
          liveAdmission: v.liveAdmission,
        })),
      }),
    );
  },
);
for (const [index, label] of [
  [1, 'missing Manifest'],
  [2, 'wrong parent'],
  [3, 'unknown enum kind'],
]) {
  test(
    'original C# receiver refuses ' + label + ' before acquiring any handle',
    { skip: process.platform !== 'win32' },
    () => {
      const r = received(index);
      assert.equal(r.accepted, false);
      assert.equal(
        r.stage,
        index === 3 ? 'ENTRY_CONSTRUCTION' : 'LIFETIME_CONSTRUCTION',
        JSON.stringify(r),
      );
      if (index === 3) assert.match(r.error, /UNKNOWN_KIND/);
      assert.equal(r.opened, 0);
      assert.deepEqual(r.closed, []);
      assert.equal(r.liveAdmission, 'NOT_READY');
      assert.equal(r.actualWindowsCalls, 0);
      assert.equal(r.actualHostStarts, 0);
    },
  );
}
