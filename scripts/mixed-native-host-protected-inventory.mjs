// Coordinator-only pure projection. No file reads, resolution, launch or platform proof.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
const code = 'INVALID_MIXED_NATIVE_HOST_PROTECTED_INVENTORY';
const need = (ok) => {
  if (!ok) throw Object.assign(Error(code), { code });
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
const digest = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const exact = (v, keys) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join('|') === [...keys].sort().join('|');
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const key = (s) => s.toLowerCase();
function local(s) {
  need(typeof s === 'string' && /^[A-Za-z]:\//.test(s));
  need(
    s.length === 3 ||
      s
        .slice(3)
        .split('/')
        .every(
          (p) =>
            p &&
            p !== '.' &&
            p !== '..' &&
            p.trim() === p &&
            !/[\\:<>"|?*%\x00-\x1f]/.test(p) &&
            !/[. ]$/.test(p) &&
            !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p),
        ),
  );
  return s[0].toUpperCase() + s.slice(1);
}
function relative(s) {
  need(typeof s === 'string' && !/^[A-Za-z]:/.test(s));
  local('C:/' + s);
  return s;
}
function raw(bytes, value) {
  need(bytes instanceof Uint8Array);
  const b = Buffer.from(bytes);
  need(isDeepStrictEqual(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b)), value));
  return b;
}
const requiredHelpers = [
  ['Bootstrap', 'mixed-native-host-bootstrap.mjs'],
  ['PrehookOwner', 'mixed-native-owner-context.mjs'],
  ['PrehookLoader', 'mixed-native-host-module-loader.mjs'],
];
const flags = {
  executionAuthorized: false,
  productionAdmission: false,
  measurementEligible: false,
  moduleClosureAuthenticated: false,
  contextAuthenticated: false,
  liveTransportConnected: false,
};
export function projectMixedNativeHostProtectedInventory(input) {
  try {
    need(input && typeof input === 'object');
    const { manifest: m, descriptor: d, graph: g, pins, supplement, excludedPaths } = input;
    const root = local(input.root),
      manifestPath = relative(input.manifestPath);
    need(digest(input.manifestSha256));
    const manifestBytes = raw(input.manifestBytes, m),
      descriptorBytes = raw(input.descriptorBytes, d);
    need(sha(manifestBytes) === input.manifestSha256);
    need(
      m.kind === 'MIXED_NATIVE_OFFLINE_OWNER_CONTEXT' &&
        m.schemaVersion === 1 &&
        m.status === 'PROPOSED' &&
        m.liveContext === null &&
        ['executionAuthorized', 'productionAdmission', 'measurementEligible'].every(
          (k) => m[k] === false,
        ),
    );
    need(
      Array.isArray(m.artifacts) &&
        m.artifacts.length > 0 &&
        m.bindings &&
        typeof m.bindings === 'object',
    );
    need(
      d.kind === 'MIXED_NATIVE_HOST_BOOTSTRAP_DESCRIPTOR' &&
        d.schemaVersion === 1 &&
        d.artifactLimits &&
        Number.isSafeInteger(d.artifactLimits.maxFiles) &&
        m.artifacts.length + 1 <= d.artifactLimits.maxFiles &&
        manifestBytes.length <= d.artifactLimits.maxManifestBytes,
    );
    need(
      g.kind === 'MIXED_NATIVE_HOST_PRODUCT_GRAPH' &&
        g.schemaVersion === 1 &&
        Object.keys(flags).every((k) => g[k] === false),
    );
    need(
      Array.isArray(g.artifacts) &&
        Array.isArray(g.edges) &&
        Array.isArray(g.sourceFiles) &&
        Array.isArray(g.hostModuleArtifactIds) &&
        pins &&
        ['artifactsSha256', 'edgesSha256', 'sourceFilesSha256'].every((k) => digest(pins[k])),
    );
    need(
      sha(JSON.stringify(g.artifacts)) === pins.artifactsSha256 &&
        sha(JSON.stringify(g.edges)) === pins.edgesSha256 &&
        sha(JSON.stringify(g.sourceFiles)) === pins.sourceFilesSha256,
    );
    const files = new Map(),
      paths = new Map(),
      artifacts = new Map();
    function add(e) {
      need(typeof e.id === 'string' && /^[A-Za-z0-9_-]+$/.test(e.id) && digest(e.sha256));
      const p = local(e.path),
        k = key(p);
      need(!files.has(e.id) && !paths.has(k));
      const entry = { id: e.id, path: p, kind: e.kind, parentId: null, sha256: e.sha256 };
      files.set(e.id, entry);
      paths.set(k, entry);
    }
    for (const a of m.artifacts) {
      need(
        exact(a, ['id', 'path', 'sizeBytes', 'sha256']) &&
          Number.isSafeInteger(a.sizeBytes) &&
          a.sizeBytes >= 0 &&
          !Object.is(a.sizeBytes, -0) &&
          a.sizeBytes <= d.artifactLimits.maxArtifactBytes,
      );
      relative(a.path);
      const p = root + (root.endsWith('/') ? '' : '/') + a.path;
      add({
        ...a,
        path: p,
        kind: a.id === 'bootstrap' || a.id === 'operation' ? 'Descriptor' : 'PathData',
      });
      artifacts.set(a.id, a);
    }
    need(Object.values(m.bindings).every((id) => artifacts.has(id)));
    const bootstrap = artifacts.get('bootstrap');
    need(
      bootstrap &&
        artifacts.has('operation') &&
        sha(descriptorBytes) === bootstrap.sha256 &&
        descriptorBytes.length === bootstrap.sizeBytes,
    );
    const modules = g.artifacts.filter((a) => /^module-[0-9]+$/.test(a.id)).map((a) => a.id);
    need(
      modules.length > 0 &&
        modules.every((id, i) => id === 'module-' + i) &&
        isDeepStrictEqual(g.hostModuleArtifactIds, modules) &&
        g.hostEntryArtifactId === modules[0] &&
        d.hostEntryArtifactId === g.hostEntryArtifactId &&
        isDeepStrictEqual(d.hostModuleArtifactIds, modules) &&
        isDeepStrictEqual(d.edges, g.edges),
    );
    let dataCount = 0;
    for (const a of g.artifacts) {
      need(
        exact(a, ['id', 'path', 'sizeBytes', 'sha256']) &&
          isDeepStrictEqual(artifacts.get(a.id), a),
      );
      if (modules.includes(a.id)) files.get(a.id).kind = 'Module';
      else need(a.id === 'data-' + dataCount++);
    }
    need(dataCount > 0);
    for (const e of g.edges)
      need(
        exact(e, ['from', 'specifier', 'to']) &&
          modules.includes(e.from) &&
          typeof e.specifier === 'string' &&
          e.specifier.length > 0 &&
          (modules.includes(e.to) ||
            (typeof e.to === 'string' && /^node:[a-zA-Z0-9_/-]+$/.test(e.to))),
      );
    add({
      id: 'owner-context-manifest',
      path: root + (root.endsWith('/') ? '' : '/') + manifestPath,
      kind: 'Manifest',
      sha256: input.manifestSha256,
    });
    need(Array.isArray(supplement) && Array.isArray(excludedPaths));
    const supplied = new Set();
    for (const e of supplement) {
      need(
        exact(e, ['id', 'path', 'kind', 'parentId', 'sha256']) &&
          e.parentId === null &&
          ['Bootstrap', 'PrehookOwner', 'PrehookLoader', 'Tool'].includes(e.kind) &&
          !supplied.has(e.id),
      );
      supplied.add(e.id);
      const p = local(e.path),
        old = files.get(e.id);
      if (old) {
        need(p === old.path && e.sha256 === old.sha256);
        const helper = requiredHelpers.some(
          ([kind, name]) => e.kind === kind && p.endsWith('/' + name),
        );
        need(
          old.kind === 'Module'
            ? helper
            : old.kind === 'PathData' && !g.artifacts.some((a) => a.id === e.id),
        );
        old.kind = e.kind;
      } else add(e);
    }
    for (const [kind, name] of requiredHelpers) {
      const selected = [...files.values()].filter((e) => e.kind === kind);
      need(selected.length === 1 && selected[0].path.endsWith('/' + name));
    }
    for (const binding of ['host', 'observer', 'git', 'native'])
      need(supplement.some((e) => e.id === m.bindings[binding] && e.kind === 'Tool'));
    const excluded = new Set(excludedPaths.map((p) => key(local(p))));
    need([...files.values()].every((e) => !excluded.has(key(e.path))));
    // Build namespace ancestors only. Never expand graph.sourceFiles or walk a Source/DB.
    const directories = new Map();
    for (const file of files.values()) {
      let parent = local(path.win32.dirname(file.path).replaceAll('\\', '/'));
      for (;;) {
        const k = key(parent);
        need(!paths.has(k) && !excluded.has(k));
        if (!directories.has(k)) directories.set(k, parent);
        const next = local(path.win32.dirname(parent).replaceAll('\\', '/'));
        if (next === parent) break;
        parent = next;
      }
    }
    const ancestors = [...directories.values()].sort((a, b) => compare(key(a), key(b)));
    const ancestorIds = new Map(ancestors.map((p, i) => [key(p), 'ancestor-' + i]));
    need([...ancestorIds.values()].every((id) => !files.has(id)));
    const entries = ancestors.map((p) => ({
      id: ancestorIds.get(key(p)),
      path: p,
      kind: 'Ancestor',
      parentId:
        p.length === 3
          ? null
          : ancestorIds.get(key(local(path.win32.dirname(p).replaceAll('\\', '/')))),
      sha256: null,
    }));
    for (const e of [...files.values()].sort((a, b) => compare(key(a.path), key(b.path)))) {
      e.parentId = ancestorIds.get(key(local(path.win32.dirname(e.path).replaceAll('\\', '/'))));
      need(e.parentId);
      entries.push(e);
    }
    return Object.freeze({
      entries: Object.freeze(entries.map(Object.freeze)),
      ...flags,
      liveAdmission: 'NOT_READY',
    });
  } catch {
    throw Object.assign(Error(code), { code });
  }
}
