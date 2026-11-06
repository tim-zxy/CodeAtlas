// Coordinator devtool only: resolves and copies bytes; never imports a product module.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { registerHooks, isBuiltin } from 'node:module';
import { parsers } from 'prettier/plugins/acorn';
const code = 'INVALID_MIXED_NATIVE_HOST_PRODUCT_GRAPH';
const check = (ok) => {
  if (!ok) throw Object.assign(Error(code), { code });
};
const hash = (b) => createHash('sha256').update(b).digest('hex');
const identity = (s) =>
  ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].map((k) => String(s[k])).join(':');
const within = (file, root) =>
  file === root ||
  (!path.relative(root, file).startsWith('..' + path.sep) &&
    path.relative(root, file) !== '..' &&
    !path.isAbsolute(path.relative(root, file)));
function resolveOnly(specifier, parentURL) {
  let result;
  const probe = 'codeatlas-product-graph:resolve';
  const hook = registerHooks({
    resolve(s, context, next) {
      check(s === probe);
      result = next(specifier, { ...context, parentURL });
      return result;
    },
    load() {
      throw Object.assign(Error(code), { code });
    },
  });
  try {
    import.meta.resolve(probe);
    check(result);
    return result;
  } finally {
    hook.deregister();
  }
}
function imports(source, file, assetReferences) {
  const tree = parsers.acorn.parse(source, {}),
    found = new Set();
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'ImportDeclaration' ||
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportAllDeclaration'
    ) {
      if (node.source) {
        check(node.source.type === 'Literal' && typeof node.source.value === 'string');
        check(!node.attributes?.length && !node.assertions?.length);
        found.add(node.source.value);
      }
    }
    if (node.type === 'ImportExpression') {
      check(
        node.source?.type === 'Literal' && typeof node.source.value === 'string' && !node.options,
      );
      found.add(node.source.value);
    }
    if (
      node.type === 'NewExpression' &&
      node.callee?.name === 'URL' &&
      node.arguments?.[1]?.type === 'MemberExpression' &&
      node.arguments[1].object?.type === 'MetaProperty' &&
      node.arguments[1].object.meta?.name === 'import' &&
      node.arguments[1].property?.name === 'url'
    ) {
      check(
        node.arguments.length === 2 &&
          node.arguments[0]?.type === 'Literal' &&
          typeof node.arguments[0].value === 'string',
      );
      const url = new URL(node.arguments[0].value, pathToFileURL(file));
      check(url.protocol === 'file:' && !url.search && !url.hash);
      assetReferences.push({
        from: file,
        specifier: node.arguments[0].value,
        path: fileURLToPath(url),
      });
    }
    if (node.type === 'Identifier') check(node.name !== 'require' && node.name !== 'createRequire');
    if (node.type === 'AssignmentExpression' && node.left?.type === 'MemberExpression')
      check(!['exports', 'module'].includes(node.left.object?.name));
    for (const [key, value] of Object.entries(node)) {
      if (['comments', 'tokens', 'loc', 'range'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(tree);
  return [...found];
}
export async function buildMixedNativeHostProductGraph(input) {
  check(input && typeof input === 'object');
  const { entryPath, authorizedRoots, outputRoot, caps, deadlineEpochMs, dataPaths } = input;
  const names = ['maxFiles', 'maxFileBytes', 'maxTotalBytes', 'maxEdges', 'maxPlanBytes'];
  check(
    caps &&
      Object.keys(caps).sort().join('|') === [...names].sort().join('|') &&
      names.every((k) => Number.isSafeInteger(caps[k]) && caps[k] > 0),
  );
  check(
    Array.isArray(dataPaths) &&
      dataPaths.every((p) => typeof p === 'string' && path.isAbsolute(p)) &&
      new Set(dataPaths).size === dataPaths.length,
  );
  check(
    Number.isSafeInteger(deadlineEpochMs) &&
      deadlineEpochMs > 0 &&
      path.isAbsolute(entryPath) &&
      path.isAbsolute(outputRoot) &&
      Array.isArray(authorizedRoots) &&
      authorizedRoots.length > 0,
  );
  const alive = () => check(Date.now() < deadlineEpochMs);
  alive();
  const roots = [];
  for (const root of authorizedRoots) {
    check(typeof root === 'string' && path.isAbsolute(root));
    const canonical = await fs.realpath(root);
    check((await fs.stat(canonical)).isDirectory());
    roots.push(canonical);
  }
  const allowed = (p) => roots.some((root) => within(p, root));
  const records = new Map(),
    physical = new Map(),
    modules = new Map(),
    edges = [],
    assets = [];
  let total = 0;
  async function readStable(file) {
    alive();
    check(allowed(file));
    const before = await fs.lstat(file, { bigint: true });
    check(before.isFile() && !before.isSymbolicLink() && before.size <= BigInt(caps.maxFileBytes));
    const handle = await fs.open(file, 'r');
    try {
      check(identity(before) === identity(await handle.stat({ bigint: true })));
      const bytes = Buffer.alloc(Number(before.size) + 1);
      let used = 0;
      while (used < bytes.length) {
        alive();
        const result = await handle.read(bytes, used, bytes.length - used, null);
        if (!result.bytesRead) break;
        used += result.bytesRead;
      }
      const after = await handle.stat({ bigint: true });
      check(
        used === Number(before.size) &&
          identity(before) === identity(after) &&
          identity(after) === identity(await fs.lstat(file, { bigint: true })) &&
          (await fs.realpath(file)) === file,
      );
      return {
        bytes: bytes.subarray(0, used),
        identity: identity(after),
        physical: String(after.dev) + ':' + String(after.ino),
      };
    } finally {
      await handle.close();
    }
  }
  async function remember(file) {
    const fresh = await readStable(file),
      old = records.get(file);
    if (old) {
      check(old.identity === fresh.identity && old.sha256 === hash(fresh.bytes));
      return old;
    }
    check(records.size < caps.maxFiles && fresh.bytes.length <= caps.maxTotalBytes - total);
    total += fresh.bytes.length;
    check(!physical.has(fresh.physical) || physical.get(fresh.physical) === file);
    physical.set(fresh.physical, file);
    const record = { ...fresh, sha256: hash(fresh.bytes) };
    records.set(file, record);
    return record;
  }
  // Package metadata used by Node's ESM resolution is a source input, not a load fallback.
  async function packageInputs(file) {
    let dir = path.dirname(file);
    while (allowed(dir)) {
      const name = path.join(dir, 'package.json');
      try {
        await fs.lstat(name);
        await remember(await fs.realpath(name));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  async function walk(candidate) {
    const file = await fs.realpath(candidate);
    check(allowed(file) && ['.js', '.mjs'].includes(path.extname(file)));
    await packageInputs(file);
    const resolved = resolveOnly(pathToFileURL(file).href, import.meta.url);
    check(resolved.format === 'module' && fileURLToPath(resolved.url) === file);
    const record = await remember(file);
    if (modules.has(file)) return modules.get(file);
    const id = 'module-' + modules.size;
    modules.set(file, id);
    const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(record.bytes);
    for (const specifier of imports(source, file, assets)) {
      alive();
      check(
        specifier.length > 0 &&
          !/[\x00-\x20?#%\\]/.test(specifier) &&
          !/^(?:file|https?|data):/.test(specifier),
      );
      let to;
      if (specifier.startsWith('node:')) {
        check(isBuiltin(specifier));
        to = specifier;
      } else {
        check(!isBuiltin(specifier));
        const target = resolveOnly(specifier, pathToFileURL(file).href);
        check(target.format === 'module' && target.url.startsWith('file:'));
        const targetURL = new URL(target.url);
        check(!targetURL.search && !targetURL.hash);
        to = await walk(fileURLToPath(targetURL));
      }
      check(edges.length < caps.maxEdges);
      edges.push({ from: id, specifier, to });
      check(Buffer.byteLength(JSON.stringify(edges)) <= caps.maxPlanBytes);
    }
    return id;
  }
  const entry = await walk(entryPath);
  const data = new Map();
  for (const inputPath of dataPaths) {
    const file = await fs.realpath(inputPath);
    check(!modules.has(file) && !data.has(file));
    await remember(file);
    data.set(file, 'data-' + data.size);
  }
  for (const asset of assets) {
    let file;
    try {
      file = await fs.realpath(asset.path);
    } catch {
      throw Object.assign(Error(code), { code, assetPath: asset.path });
    }
    if (!data.has(file) && !modules.has(file))
      throw Object.assign(Error(code), { code, assetPath: asset.path });
    asset.path = file;
  }
  alive();
  const parent = await fs.realpath(path.dirname(outputRoot));
  check(path.join(parent, path.basename(outputRoot)) === path.resolve(outputRoot));
  await fs.mkdir(outputRoot);
  const artifacts = [];
  for (const [file, id] of [...modules, ...data]) {
    alive();
    const record = records.get(file),
      rootIndex = roots.findIndex((root) => within(file, root));
    const relative =
      (rootIndex === 0 ? '' : 'root-' + rootIndex + '/') +
      path.relative(roots[rootIndex], file).split(path.sep).join('/');
    check(relative && !relative.split('/').includes('..'));
    const destination = path.join(outputRoot, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, record.bytes, { flag: 'wx' });
    const s = await fs.lstat(destination);
    check(
      s.isFile() &&
        !s.isSymbolicLink() &&
        s.nlink === 1 &&
        hash(await fs.readFile(destination)) === record.sha256,
    );
    artifacts.push({ id, path: relative, sizeBytes: record.bytes.length, sha256: record.sha256 });
  }
  for (const [file, record] of records) {
    const current = await readStable(file);
    check(current.identity === record.identity && hash(current.bytes) === record.sha256);
  }
  alive();
  return {
    kind: 'MIXED_NATIVE_HOST_PRODUCT_GRAPH',
    schemaVersion: 1,
    status: 'PROPOSED',
    hostEntryArtifactId: entry,
    hostModuleArtifactIds: [...modules.values()],
    edges,
    artifacts,
    assets,
    sourceFiles: [...records].map(([file, r]) => ({
      path: file,
      sha256: r.sha256,
      sizeBytes: r.bytes.length,
      identity: r.identity,
    })),
    executionAuthorized: false,
    productionAdmission: false,
    measurementEligible: false,
    moduleClosureAuthenticated: false,
    contextAuthenticated: false,
    liveTransportConnected: false,
  };
}
