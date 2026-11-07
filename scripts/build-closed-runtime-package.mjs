#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readClosedRuntimePackage } from '../packages/runtime/dist/closed-runtime-package.js';

// Explicit directory packaging only. No install, ACL mutation, Native/Principal
// query, build, migration, archive extraction or production trust follows.
const workspace = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const dllSource = path.join(
  workspace,
  '.superpowers',
  'principal-artifact-2S6bWj',
  'windows-process-principal.dll',
);
const dllHash = '4ee3e48cfa2f6c4d883a983a2f7b5739ecf7b01d515c94cecbed9f87e3bb7147';
const dllRelative =
  'packages/runtime/dist/principal/win32-x64/' + dllHash + '/windows-process-principal.dll';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) =>
  value && typeof value === 'object'
    ? Array.isArray(value)
      ? '[' + value.map(canonical).join(',') + ']'
      : '{' +
        Object.keys(value)
          .sort()
          .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
          .join(',') +
        '}'
    : JSON.stringify(value);
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const need = (value, code) => {
  if (!value) throw Error(code);
};
const args = process.argv.slice(2);
need(
  args.length === 7 &&
    args[1] === '--max-file-bytes' &&
    args[3] === '--max-items' &&
    args[5] === '--max-depth',
  'EXPLICIT_PACK_ARGUMENTS_REQUIRED',
);
const [outputName, , byteText, , itemText, , depthText] = args;
need(/^\.superpowers\/closed-runtime-[a-zA-Z0-9-]+$/.test(outputName), 'OWNED_NEW_OUTPUT_REQUIRED');
function positive(text) {
  need(/^[1-9][0-9]*$/.test(text), 'INVALID_PACK_LIMIT');
  const value = Number(text);
  need(Number.isSafeInteger(value), 'INVALID_PACK_LIMIT');
  return value;
}
const limits = {
  maxFileBytes: positive(byteText),
  maxItems: positive(itemText),
  maxDepth: positive(depthText),
  check: () => undefined,
};
const output = path.resolve(workspace, outputName),
  stage = path.join(output, 'staging');
need(path.dirname(output) === path.join(workspace, '.superpowers'), 'OWNED_NEW_OUTPUT_REQUIRED');
let entries = 0;
const tick = (depth = 0) => {
  need(++entries <= limits.maxItems && depth <= limits.maxDepth, 'PACK_LIMIT_EXCEEDED');
};
function safeRelative(name) {
  need(
    typeof name === 'string' &&
      name.length &&
      !name.includes('\\') &&
      !name.includes(':') &&
      !/[\u0000-\u001f\u007f<>\"|?*]/.test(name) &&
      name
        .split('/')
        .every(
          (part) =>
            part &&
            part !== '.' &&
            part !== '..' &&
            !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part) &&
            !/[. ]$/.test(part),
        ),
    'INVALID_PACK_PATH',
  );
}
function credential(name) {
  return /^\.env(?:$|\.)|^\.npmrc$|^\.netrc$|^\.git-credentials$|^credentials(?:$|\.)|^id_(?:rsa|dsa|ed25519)(?:$|\.)|\.(?:pem|key|p12|pfx)$/i.test(
    name,
  );
}
function stamp(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
}
const sources = new Map(),
  files = [],
  links = [];
async function readSource(filename) {
  tick();
  const before = await fs.lstat(filename, { bigint: true });
  const prior = sources.get(filename);
  need(prior === undefined || prior === stamp(before), 'PACK_SOURCE_CHANGED');
  need(
    before.isFile() && !before.isSymbolicLink() && before.size <= BigInt(limits.maxFileBytes),
    'INVALID_PACK_SOURCE',
  );
  const file = await fs.open(filename, 'r');
  try {
    need(stamp(await file.stat({ bigint: true })) === stamp(before), 'PACK_SOURCE_CHANGED');
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await file.read(bytes, length, bytes.length - length, length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    need(
      length === Number(before.size) &&
        stamp(await file.stat({ bigint: true })) === stamp(before) &&
        stamp(await fs.lstat(filename, { bigint: true })) === stamp(before),
      'PACK_SOURCE_CHANGED',
    );
    sources.set(filename, stamp(before));
    return bytes.subarray(0, length);
  } finally {
    await file.close();
  }
}
async function write(relative, bytes) {
  safeRelative(relative);
  need(bytes.length <= limits.maxFileBytes, 'PACK_LIMIT_EXCEEDED');
  const destination = path.join(stage, ...relative.split('/'));
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, bytes, { flag: 'wx' });
  files.push({ path: relative, bytes: bytes.length, sha256: hash(bytes) });
}
async function copyFile(source, relative) {
  await write(relative, await readSource(source));
}
async function copyDirectory(source, relative, depth = 0) {
  tick(depth);
  const before = await fs.lstat(source, { bigint: true });
  need(before.isDirectory() && !before.isSymbolicLink(), 'INVALID_PACK_SOURCE');
  for (const item of await fs.readdir(source, { withFileTypes: true })) {
    tick(depth + 1);
    if (item.name === 'node_modules') continue;
    need(!credential(item.name), 'CREDENTIAL_NAME_REFUSED');
    const filename = path.join(source, item.name),
      name = relative + '/' + item.name;
    const stat = await fs.lstat(filename, { bigint: true });
    need(!stat.isSymbolicLink(), 'SYMLINK_CONTENT_REFUSED');
    if (stat.isDirectory()) await copyDirectory(filename, name, depth + 1);
    else {
      need(stat.isFile(), 'INVALID_PACK_SOURCE');
      await copyFile(filename, name);
    }
  }
  need(stamp(await fs.lstat(source, { bigint: true })) === stamp(before), 'PACK_SOURCE_CHANGED');
}
async function resolveDependency(source, name) {
  let current = source;
  while (true) {
    const candidate = path.join(current, 'node_modules', ...name.split('/'));
    try {
      const target = await fs.realpath(candidate);
      await fs.access(path.join(target, 'package.json'));
      return target;
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
    }
    const parent = path.dirname(current);
    need(parent !== current, 'DEPENDENCY_UNRESOLVED');
    current = parent;
  }
}
const packages = new Map();
async function discover(source) {
  tick();
  source = await fs.realpath(source);
  const manifestBytes = await readSource(path.join(source, 'package.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  need(
    typeof manifest.name === 'string' && typeof manifest.version === 'string',
    'INVALID_PACKAGE_MANIFEST',
  );
  const prior = packages.get(manifest.name);
  if (prior) {
    need(
      prior.manifest.version === manifest.version && prior.source === source,
      'DUPLICATE_PACKAGE_IDENTITY',
    );
    return;
  }
  const workspaceRelative = path.relative(workspace, source).split(path.sep).join('/');
  const isWorkspace = /^(packages|apps)\/[^/]+$/.test(workspaceRelative);
  const item = {
    source,
    manifest,
    manifestBytes,
    workspaceRelative: isWorkspace ? workspaceRelative : null,
  };
  packages.set(manifest.name, item);
  const dependencies = { ...manifest.dependencies, ...manifest.optionalDependencies };
  for (const name of Object.keys(dependencies).sort(compare))
    await discover(await resolveDependency(source, name));
}
function head() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: workspace,
    windowsHide: true,
    shell: false,
    encoding: 'utf8',
    maxBuffer: limits.maxFileBytes,
  }).trim();
}
async function buildInputs(workspaces, lockBytes) {
  const names = new Set([
    'package.json',
    'pnpm-workspace.yaml',
    'tsconfig.base.json',
    'pnpm-lock.yaml',
    'Cargo.lock',
    'rust-toolchain.toml',
    'scripts/windows-process-principal.cs',
  ]);
  async function sourceFiles(directory, prefix, depth = 0) {
    tick(depth);
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      tick(depth + 1);
      const filename = path.join(directory, entry.name),
        relative = prefix + '/' + entry.name;
      need(!entry.isSymbolicLink(), 'SYMLINK_CONTENT_REFUSED');
      if (entry.isDirectory()) await sourceFiles(filename, relative, depth + 1);
      else if (entry.isFile() && entry.name.endsWith('.ts')) names.add(relative);
    }
  }
  for (const item of workspaces) {
    names.add(item.workspaceRelative + '/package.json');
    names.add(item.workspaceRelative + '/tsconfig.json');
    await sourceFiles(path.join(item.source, 'src'), item.workspaceRelative + '/src');
  }
  const inputs = [];
  for (const name of [...names].sort(compare)) {
    safeRelative(name);
    const bytes =
      name === 'pnpm-lock.yaml'
        ? lockBytes
        : await readSource(path.join(workspace, ...name.split('/')));
    inputs.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
  }
  return inputs;
}
try {
  await fs.mkdir(output);
  await fs.mkdir(stage);
  const revision = head();
  need(/^[0-9a-f]{40,64}$/.test(revision), 'INVALID_SOURCE_REVISION');
  const lockBytes = await readSource(path.join(workspace, 'pnpm-lock.yaml'));
  const runtimeRequire = createRequire(path.join(workspace, 'packages', 'runtime', 'package.json'));
  const lock = runtimeRequire('yaml').parse(lockBytes.toString('utf8'), { uniqueKeys: true });
  await discover(path.join(workspace, 'apps', 'cli'));
  const workspaces = [...packages.values()].filter((item) => item.workspaceRelative);
  const external = [...packages.values()].filter((item) => !item.workspaceRelative);
  need(
    workspaces.length === 11 && workspaces.some((item) => item.workspaceRelative === 'apps/cli'),
    'WORKSPACE_CLOSURE_CHANGED',
  );
  need(external.length === 71, 'EXTERNAL_CLOSURE_CHANGED');
  for (const item of external)
    need(
      typeof lock.packages?.[item.manifest.name + '@' + item.manifest.version]?.resolution
        ?.integrity === 'string',
      'DEPENDENCY_INTEGRITY_MISSING',
    );
  const inputs = await buildInputs(workspaces, lockBytes);
  for (const item of workspaces) {
    await write(item.workspaceRelative + '/package.json', item.manifestBytes);
    await copyDirectory(path.join(item.source, 'dist'), item.workspaceRelative + '/dist');
    if (item.manifest.name === '@codeatlas/storage')
      await copyDirectory(
        path.join(item.source, 'migrations'),
        item.workspaceRelative + '/migrations',
      );
  }
  for (const item of external)
    await copyDirectory(item.source, 'node_modules/' + item.manifest.name);
  for (const name of ['Cargo.lock', 'rust-toolchain.toml', 'scripts/windows-process-principal.cs'])
    await copyFile(path.join(workspace, ...name.split('/')), name);
  const dll = await readSource(dllSource);
  need(dll.length === 6656 && hash(dll) === dllHash, 'PRECOMPILED_DLL_IDENTITY_MISMATCH');
  const existingDll = files.find((file) => file.path === dllRelative);
  if (existingDll)
    need(
      existingDll.bytes === dll.length && existingDll.sha256 === dllHash,
      'PRECOMPILED_DLL_IDENTITY_MISMATCH',
    );
  else await write(dllRelative, dll);
  for (const item of workspaces)
    links.push({ path: 'node_modules/' + item.manifest.name, target: item.workspaceRelative });
  await write(
    'source-state.json',
    Buffer.from(
      canonical({
        schema: 'codeatlas.closed-runtime-build-inputs',
        version: 1,
        head: revision,
        sourceMayBeDirty: true,
        dependencyLockSha256: hash(lockBytes),
        buildInputs: inputs,
      }),
    ),
  );
  need(head() === revision, 'SOURCE_REVISION_CHANGED');
  for (const [filename, expected] of sources)
    need(stamp(await fs.lstat(filename, { bigint: true })) === expected, 'PACK_SOURCE_CHANGED');
  files.sort((a, b) => compare(a.path, b.path));
  links.sort((a, b) => compare(a.path, b.path));
  const manifest = Buffer.from(
    canonical({
      schema: 'codeatlas.closed-runtime-package',
      version: 1,
      sourceRevision: revision,
      dependencyLockSha256: hash(lockBytes),
      files,
      links,
    }),
  );
  need(manifest.length <= limits.maxFileBytes, 'PACK_LIMIT_EXCEEDED');
  await fs.writeFile(path.join(stage, 'closed-runtime.json'), manifest, { flag: 'wx' });
  const contentDigest = hash(manifest);
  const release = path.join(output, 'release-' + contentDigest);
  need(
    path.dirname(release) === output && path.dirname(stage) === output,
    'OWNED_RELEASE_PATH_REQUIRED',
  );
  await fs.rename(stage, release);
  for (const link of links) {
    const target = path.join(release, ...link.target.split('/'));
    const alias = path.join(release, ...link.path.split('/'));
    await fs.mkdir(path.dirname(alias), { recursive: true });
    await fs.symlink(target, alias, 'junction');
    need((await fs.realpath(alias)) === target, 'WORKSPACE_ALIAS_IDENTITY_MISMATCH');
  }
  const resolver = createRequire(path.join(release, 'apps', 'cli', 'package.json'));
  for (const item of workspaces)
    if (item.manifest.main)
      need(
        (await fs.realpath(resolver.resolve(item.manifest.name))) ===
          (await fs.realpath(
            path.join(release, ...item.workspaceRelative.split('/'), item.manifest.main),
          )),
        'WORKSPACE_MODULE_IDENTITY_MISMATCH',
      );
  const verified = await readClosedRuntimePackage(release, dllRelative, dllHash, limits);
  await verified.recheck();
  process.stdout.write(
    JSON.stringify({
      kind: 'CLOSED_RUNTIME_DIRECTORY_PACKAGE_ONLY',
      root: release,
      contentDigest: verified.contentDigest,
      artifactRelativePath: dllRelative,
      artifactSha256: dllHash,
      workspacePackages: workspaces.length,
      libraryPackages: workspaces.length - 1,
      cliPackages: 1,
      externalPackages: external.length,
      files: files.length,
      aliases: links.length,
      productionTrusted: false,
    }) + '\n',
  );
} catch (error) {
  // Preserve only newly owned partial output for inspection. Never delete or
  // overwrite a previous package, user directory or unknown cleanup target.
  process.stderr.write(
    JSON.stringify({
      code: 'CLOSED_RUNTIME_PACK_FAILED',
      diagnostic: /^[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'PACK_INVALID',
      partialOwnedOutput: outputName,
    }) + '\n',
  );
  process.exitCode = 1;
}
