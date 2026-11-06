import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const code = 'INVALID_MIXED_NATIVE_OWNER_CONTEXT';
const fail = () => {
  throw Object.assign(new Error(code), { code });
};
const hash = (b) => createHash('sha256').update(b).digest('hex');
const exact = (v, keys) =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join('|') === [...keys].sort().join('|');
const positive = (n) => Number.isSafeInteger(n) && n > 0;
const sha = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const id = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]+$/.test(s);
const hostClosures = new WeakMap();
function relative(s) {
  if (
    typeof s !== 'string' ||
    !s ||
    s
      .split('/')
      .some(
        (p) =>
          !p ||
          p === '.' ||
          p === '..' ||
          /[\\:<>"|?*\x00-\x1f]/.test(p) ||
          /[. ]$/.test(p) ||
          /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p),
      )
  )
    fail();
  return s;
}
const normalized = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
const pin = (s) =>
  Object.fromEntries(
    ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].map((k) => [k, String(s[k])]),
  );
const same = (a, b) => JSON.stringify(pin(a)) === JSON.stringify(pin(b));
const freeze = (v) => {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
};
export async function loadMixedNativeOwnerContext(root, manifestPath, expectedSha, caps) {
  return loadContext(root, manifestPath, expectedSha, caps);
}
// Deep-private offline snapshot path. The original metadata API remains unchanged.
export async function loadMixedNativeHostModuleClosure(
  root,
  manifestPath,
  expectedSha,
  caps,
  moduleIds,
) {
  if (
    !Array.isArray(moduleIds) ||
    !moduleIds.length ||
    !moduleIds.every(id) ||
    new Set(moduleIds).size !== moduleIds.length
  )
    fail();
  return loadContext(root, manifestPath, expectedSha, caps, [...moduleIds]);
}
// Fixed descriptor ID; no manifest schema/binding expansion or HOST-selected descriptor.
export async function loadMixedNativeHostBootstrapDescriptor(
  root,
  manifestPath,
  expectedSha,
  caps,
) {
  return loadContext(root, manifestPath, expectedSha, caps, undefined, true);
}
export async function loadMixedNativeCurrent13OperationDescriptor(
  root,
  manifestPath,
  expectedSha,
  caps,
) {
  return loadContext(root, manifestPath, expectedSha, caps, undefined, false, true);
}
export function readMixedNativeHostModuleClosure(closure) {
  const snapshot = hostClosures.get(closure);
  if (!snapshot) fail();
  return snapshot;
}
async function loadContext(
  root,
  manifestPath,
  expectedSha,
  caps,
  moduleIds,
  bootstrap = false,
  operation = false,
) {
  try {
    if (
      typeof root !== 'string' ||
      !path.isAbsolute(root) ||
      !sha(expectedSha) ||
      !exact(caps, ['maxManifestBytes', 'maxArtifactBytes', 'maxTotalBytes', 'maxFiles']) ||
      !Object.values(caps).every(positive) ||
      caps.maxManifestBytes > 2147483646 ||
      caps.maxArtifactBytes > 2147483646
    )
      fail();
    const limits = { ...caps },
      base = path.resolve(root),
      manifestRelative = relative(manifestPath);
    let total = 0;
    async function ancestry(p) {
      let current = p;
      for (;;) {
        const s = await fs.lstat(current, { bigint: true });
        if (
          !s.isDirectory() ||
          s.isSymbolicLink() ||
          normalized(await fs.realpath(current)) !== normalized(current)
        )
          fail();
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
    await ancestry(base);
    const rootPin = pin(await fs.lstat(base, { bigint: true }));
    async function read(rel, cap, expectedSize, expectedHash, previous) {
      relative(rel);
      const file = path.resolve(base, ...rel.split('/'));
      if (!file.startsWith(base + path.sep)) fail();
      await ancestry(path.dirname(file));
      const named = await fs.lstat(file, { bigint: true });
      if (
        !named.isFile() ||
        named.isSymbolicLink() ||
        named.nlink !== 1n ||
        normalized(await fs.realpath(file)) !== normalized(file) ||
        named.size > BigInt(cap) ||
        named.size > BigInt(Number.MAX_SAFE_INTEGER) ||
        (expectedSize !== undefined && named.size !== BigInt(expectedSize)) ||
        (previous && !same(named, previous))
      )
        fail();
      const size = Number(named.size);
      if (size + 1 > limits.maxTotalBytes - total) fail();
      const handle = await fs.open(file, 'r');
      try {
        const opened = await handle.stat({ bigint: true });
        if (!same(named, opened)) fail();
        const bytes = Buffer.alloc(size + 1);
        let used = 0;
        while (used < bytes.length) {
          const n = (await handle.read(bytes, used, bytes.length - used, null)).bytesRead;
          total += n;
          if (n === 0) break;
          used += n;
        }
        const after = await handle.stat({ bigint: true }),
          final = await fs.lstat(file, { bigint: true });
        if (
          used !== size ||
          !same(opened, after) ||
          !same(after, final) ||
          normalized(await fs.realpath(file)) !== normalized(file)
        )
          fail();
        const data = bytes.subarray(0, used),
          digest = hash(data);
        if (expectedHash && digest !== expectedHash) fail();
        return { rel, data, digest, stat: after };
      } finally {
        await handle.close();
      }
    }
    const first = await read(manifestRelative, limits.maxManifestBytes, undefined, expectedSha);
    const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(first.data));
    if (!Buffer.from(JSON.stringify(manifest, null, 2) + '\n').equals(first.data)) fail();
    if (
      !exact(manifest, [
        'kind',
        'schemaVersion',
        'status',
        'artifacts',
        'bindings',
        'liveContext',
        'executionAuthorized',
        'productionAdmission',
        'measurementEligible',
      ]) ||
      manifest.kind !== 'MIXED_NATIVE_OFFLINE_OWNER_CONTEXT' ||
      manifest.schemaVersion !== 1 ||
      manifest.status !== 'PROPOSED' ||
      manifest.liveContext !== null ||
      manifest.executionAuthorized !== false ||
      manifest.productionAdmission !== false ||
      manifest.measurementEligible !== false ||
      !Array.isArray(manifest.artifacts) ||
      !manifest.artifacts.length ||
      manifest.artifacts.length + 1 > limits.maxFiles
    )
      fail();
    const keys = [
      'owner',
      'host',
      'observer',
      'git',
      'native',
      'oracle',
      'repository',
      'workspace',
      'source',
    ];
    if (!exact(manifest.bindings, keys)) fail();
    const ids = new Set(),
      paths = new Set([normalized(manifestRelative)]),
      physical = new Set([String(first.stat.dev) + ':' + String(first.stat.ino)]),
      receipts = [];
    for (const a of manifest.artifacts) {
      if (
        !exact(a, ['id', 'path', 'sizeBytes', 'sha256']) ||
        !id(a.id) ||
        ids.has(a.id) ||
        !Number.isSafeInteger(a.sizeBytes) ||
        a.sizeBytes < 0 ||
        Object.is(a.sizeBytes, -0) ||
        !sha(a.sha256)
      )
        fail();
      relative(a.path);
      if (paths.has(normalized(a.path))) fail();
      ids.add(a.id);
      paths.add(normalized(a.path));
      const r = await read(a.path, limits.maxArtifactBytes, a.sizeBytes, a.sha256);
      const identity = String(r.stat.dev) + ':' + String(r.stat.ino);
      if (physical.has(identity)) fail();
      physical.add(identity);
      receipts.push({ a: { ...a }, r });
    }
    if (!Object.values(manifest.bindings).every((v) => typeof v === 'string' && ids.has(v))) fail();
    for (const { a, r } of receipts)
      await read(a.path, limits.maxArtifactBytes, a.sizeBytes, a.sha256, r.stat);
    await read(
      manifestRelative,
      limits.maxManifestBytes,
      first.data.length,
      expectedSha,
      first.stat,
    );
    await ancestry(base);
    if (JSON.stringify(rootPin) !== JSON.stringify(pin(await fs.lstat(base, { bigint: true }))))
      fail();
    const artifacts = receipts.map(({ a, r }) => ({ ...a, identity: pin(r.stat) }));
    const contextSha256 = hash(
      Buffer.from(
        'codeatlas-mixed-native-owner-context-v1\0' +
          JSON.stringify({
            root: base,
            rootIdentity: rootPin,
            manifest: { path: manifestRelative, sha256: expectedSha, identity: pin(first.stat) },
            artifacts,
          }),
      ),
    );
    const metadata = freeze({
      status: 'OFFLINE_OWNER_CONTEXT_BOUND',
      contextSha256,
      manifestSha256: expectedSha,
      artifacts,
      bindings: { ...manifest.bindings },
      executionAuthorized: false,
      productionAdmission: false,
      measurementEligible: false,
      databaseStateVerified: false,
      sourceHistoryAuthenticated: false,
      toolImagesAuthenticated: false,
    });
    const artifactJSON = (artifactId) => {
      const item = receipts.find(({ a }) => a.id === artifactId);
      if (!item || !item.a.path.endsWith('.json')) fail();
      const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(item.r.data));
      if (!Buffer.from(JSON.stringify(data, null, 2) + '\n').equals(item.r.data)) fail();
      return data;
    };
    if (operation) return freeze({ context: metadata, operation: artifactJSON('operation') });
    if (moduleIds === undefined && !bootstrap) return metadata;
    let descriptor;
    if (bootstrap) {
      descriptor = artifactJSON('bootstrap');
      moduleIds = descriptor?.hostModuleArtifactIds;
    }
    if (
      !Array.isArray(moduleIds) ||
      !moduleIds.length ||
      moduleIds.length > limits.maxFiles ||
      !moduleIds.every(id) ||
      new Set(moduleIds).size !== moduleIds.length
    )
      fail();
    const modules = moduleIds.map((moduleId) => {
      const item = receipts.find(({ a }) => a.id === moduleId);
      if (!item || !/\.m?js$/.test(item.a.path)) fail();
      const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(item.r.data);
      // Return the verified read bytes as immutable source, never re-read by import(path).
      return {
        id: moduleId,
        path: item.a.path,
        fileURL: pathToFileURL(path.resolve(base, ...item.a.path.split('/'))).href,
        sha256: item.a.sha256,
        source,
      };
    });
    const closure = freeze({
      kind: 'OFFLINE_HOST_MODULE_CLOSURE',
      contextSha256,
      moduleArtifactIds: [...moduleIds],
      maxPlanBytes: limits.maxManifestBytes,
      executionAuthorized: false,
      productionAdmission: false,
      measurementEligible: false,
      moduleClosureAuthenticated: false,
      contextAuthenticated: false,
      liveTransportConnected: false,
    });
    hostClosures.set(closure, freeze({ modules, maxPlanBytes: limits.maxManifestBytes }));
    return bootstrap ? freeze({ context: metadata, descriptor, closure }) : closure;
  } catch {
    fail();
  }
}
