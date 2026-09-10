import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';
import { LanguageVariant, SyntaxKind, createScanner } from 'typescript/unstable/ast';

const codeatlasPrefix = '@codeatlas/';
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

const allowedPackageDependencies = new Map([
  ['agent-api', new Set(['application', 'ir'])],
  ['application', new Set(['contracts', 'documents', 'execution', 'ir', 'knowledge', 'source'])],
  ['contracts', new Set(['ir'])],
  ['documents', new Set(['ir'])],
  ['evaluation', new Set(['agent-api', 'ir'])],
  ['execution', new Set(['contracts', 'ir'])],
  ['ir', new Set()],
  ['knowledge', new Set(['contracts', 'documents', 'execution', 'ir'])],
  ['plugins', new Set(['ir', 'providers'])],
  ['providers', new Set(['ir', 'source'])],
  ['runtime', new Set(['application', 'plugins', 'providers', 'storage'])],
  ['source', new Set(['ir'])],
  ['storage', new Set(['ir'])],
]);

const allowedAppDependencies = new Set(['agent-api', 'application', 'runtime']);
const forbiddenNativeDependencies = new Set([
  'codeatlas-storage',
  'libsqlite3-sys',
  'rusqlite',
  'sqlite',
  'sqlite3',
]);
const sqliteFeatureDependencies = new Set(['diesel', 'sqlx']);

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function packageSegment(packageName) {
  return packageName.startsWith(codeatlasPrefix)
    ? packageName.slice(codeatlasPrefix.length).split('/')[0]
    : undefined;
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function childDirectories(root) {
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function discoverProjects(workspaceRoot) {
  const projects = [];

  for (const group of ['apps', 'packages']) {
    for (const directory of await childDirectories(path.join(workspaceRoot, group))) {
      const id = `${group}/${directory}`;
      const root = path.join(workspaceRoot, group, directory);
      const manifestPath = path.join(root, 'package.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      projects.push({
        id,
        group,
        directory,
        root,
        manifest,
        manifestPath,
      });
    }
  }

  return projects;
}

async function sourceFiles(root) {
  const files = [];

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'dist' || entry.name === 'node_modules') continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (/\.(?:cts|mts|tsx?|d\.ts)$/.test(entry.name)) {
        files.push(entryPath);
      }
    }
  }

  const sourceRoot = path.join(root, 'src');
  try {
    await visit(sourceRoot);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  return files.sort();
}

function stripTomlComment(line) {
  let quote;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? undefined : (quote ?? character);
      continue;
    }
    if (character === '#' && !quote) return line.slice(0, index);
  }

  return line;
}

function unquoteTomlKey(key) {
  const trimmed = key.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isNativeDependencySection(section) {
  return /^(?:target\..+\.)?(?:build-|dev-)?dependencies$/.test(section);
}

function nativeDependencyTableName(section) {
  const match = section.match(/^(?:target\..+\.)?(?:build-|dev-)?dependencies\.(.+)$/);
  return match ? unquoteTomlKey(match[1]) : undefined;
}

function nativeDependencyLine(sourceText, alias) {
  let section = '';

  for (const [index, rawLine] of sourceText.split(/\r?\n/).entries()) {
    const line = stripTomlComment(rawLine).trim();
    const sectionMatch = line.match(/^\[([^\]]+)]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      if (nativeDependencyTableName(section) === alias) return index + 1;
      continue;
    }
    if (!isNativeDependencySection(section)) continue;
    const assignment = line.match(/^("(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_-]+)\s*=/);
    if (assignment && unquoteTomlKey(assignment[1]) === alias) return index + 1;
  }

  return undefined;
}

function cargoDependencyGroups(manifest) {
  const groups = [
    manifest.dependencies,
    manifest['dev-dependencies'],
    manifest['build-dependencies'],
  ];

  for (const target of Object.values(manifest.target ?? {})) {
    groups.push(target.dependencies, target['dev-dependencies'], target['build-dependencies']);
  }

  return groups.filter((group) => group && typeof group === 'object');
}

function cargoDependencyConfig(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function resolveCargoDependency(alias, value, workspaceDependencies, manifestFeatures) {
  const local = cargoDependencyConfig(value);
  const inherited =
    local.workspace === true ? cargoDependencyConfig(workspaceDependencies[alias]) : {};
  const packageName = local.package ?? inherited.package ?? alias;
  const features = new Set([...(inherited.features ?? []), ...(local.features ?? [])]);

  for (const featureReferences of Object.values(manifestFeatures)) {
    for (const reference of featureReferences ?? []) {
      if (reference === `${alias}/sqlite` || reference === `${alias}?/sqlite`) {
        features.add('sqlite');
      }
    }
  }

  return { packageName, features: [...features] };
}

function isForbiddenNativeDependency(name, features) {
  const normalizedName = name.toLowerCase();
  return (
    forbiddenNativeDependencies.has(normalizedName) ||
    /sqlite/i.test(name) ||
    (sqliteFeatureDependencies.has(normalizedName) &&
      features.some((feature) => String(feature).toLowerCase() === 'sqlite'))
  );
}

async function readOptionalText(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function checkNativeAnalyzer(workspaceRoot) {
  const manifestPath = path.join(workspaceRoot, 'crates', 'native-analyzer', 'Cargo.toml');
  const sourceText = await readOptionalText(manifestPath);
  if (sourceText === undefined) return { diagnostics: [], projectCount: 0 };

  const diagnostics = new Set();
  const relativeManifest = normalizePath(path.relative(workspaceRoot, manifestPath));
  const manifest = parseToml(sourceText);
  const workspaceSource = await readOptionalText(path.join(workspaceRoot, 'Cargo.toml'));
  const workspaceManifest = workspaceSource ? parseToml(workspaceSource) : {};
  const workspaceDependencies = workspaceManifest.workspace?.dependencies ?? {};
  const manifestFeatures = manifest.features ?? {};

  for (const group of cargoDependencyGroups(manifest)) {
    for (const [alias, value] of Object.entries(group)) {
      const dependency = resolveCargoDependency(
        alias,
        value,
        workspaceDependencies,
        manifestFeatures,
      );
      if (!isForbiddenNativeDependency(dependency.packageName, dependency.features)) continue;
      const line = nativeDependencyLine(sourceText, alias);
      const origin = line ? `${relativeManifest}:${line}` : relativeManifest;
      diagnostics.add(
        `FORBIDDEN_NATIVE_DEPENDENCY: codeatlas-native-analyzer -> ${dependency.packageName} (${origin})`,
      );
    }
  }

  return { diagnostics: [...diagnostics], projectCount: 1 };
}

function importSpecifiers(filePath, sourceText) {
  const scanner = createScanner(true, LanguageVariant.Standard, sourceText);
  const tokens = [];
  const imports = [];

  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
    tokens.push({
      kind,
      start: scanner.getTokenStart(),
      value: scanner.getTokenValue(),
    });
  }

  function isStringLiteral(token) {
    return (
      token?.kind === SyntaxKind.StringLiteral ||
      token?.kind === SyntaxKind.NoSubstitutionTemplateLiteral
    );
  }

  function isRequireToken(token) {
    return (
      token?.kind === SyntaxKind.RequireKeyword ||
      (token?.kind === SyntaxKind.Identifier && token.value === 'require')
    );
  }

  function lineNumber(position) {
    let line = 1;
    for (let index = 0; index < position; index += 1) {
      if (sourceText[index] === '\n') line += 1;
    }
    return line;
  }

  function record(originIndex, specifierIndex) {
    if (!isStringLiteral(tokens[specifierIndex])) return;
    imports.push({
      specifier: tokens[specifierIndex].value,
      line: lineNumber(tokens[originIndex].start),
    });
  }

  function statementEnd(startIndex) {
    for (let index = startIndex; index < tokens.length; index += 1) {
      if (tokens[index].kind === SyntaxKind.SemicolonToken) return index;
    }
    return tokens.length;
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.kind === SyntaxKind.ImportKeyword) {
      if (tokens[index + 1]?.kind === SyntaxKind.OpenParenToken) {
        record(index, index + 2);
        continue;
      }

      if (isStringLiteral(tokens[index + 1])) {
        record(index, index + 1);
        continue;
      }

      const end = statementEnd(index + 1);
      for (let cursor = index + 1; cursor < end; cursor += 1) {
        if (tokens[cursor].kind === SyntaxKind.FromKeyword && isStringLiteral(tokens[cursor + 1])) {
          record(index, cursor + 1);
          break;
        }
        if (
          isRequireToken(tokens[cursor]) &&
          tokens[cursor + 1]?.kind === SyntaxKind.OpenParenToken
        ) {
          record(index, cursor + 2);
          break;
        }
      }
      continue;
    }

    if (token.kind === SyntaxKind.ExportKeyword) {
      const end = statementEnd(index + 1);
      for (let cursor = index + 1; cursor < end; cursor += 1) {
        if (tokens[cursor].kind === SyntaxKind.FromKeyword && isStringLiteral(tokens[cursor + 1])) {
          record(index, cursor + 1);
          break;
        }
      }
      continue;
    }

    if (
      (token.kind === SyntaxKind.ModuleKeyword ||
        (token.kind === SyntaxKind.Identifier && token.value === 'module')) &&
      tokens[index + 1]?.kind === SyntaxKind.DotToken &&
      isRequireToken(tokens[index + 2]) &&
      tokens[index + 3]?.kind === SyntaxKind.OpenParenToken
    ) {
      record(index, index + 4);
      continue;
    }

    if (
      isRequireToken(token) &&
      tokens[index - 1]?.kind !== SyntaxKind.DotToken &&
      tokens[index + 1]?.kind === SyntaxKind.OpenParenToken
    ) {
      record(index, index + 2);
    }
  }

  return imports.filter(
    (entry, index) =>
      imports.findIndex(
        (candidate) => candidate.specifier === entry.specifier && candidate.line === entry.line,
      ) === index,
  );
}

function allowedTargets(project) {
  if (project.group === 'apps') return allowedAppDependencies;
  return allowedPackageDependencies.get(project.directory);
}

function canonicalCycle(cycle) {
  const nodes = cycle.slice(0, -1);
  const rotations = nodes.map((_, index) => [...nodes.slice(index), ...nodes.slice(0, index)]);
  rotations.sort((left, right) => left.join('\0').localeCompare(right.join('\0')));
  return [...rotations[0], rotations[0][0]];
}

function findCycles(projects, edges) {
  const state = new Map();
  const stack = [];
  const cycles = new Map();
  const projectNames = [...projects].map((project) => project.manifest.name).sort();

  function visit(name) {
    state.set(name, 'visiting');
    stack.push(name);

    for (const target of [...(edges.get(name) ?? [])].sort()) {
      if (state.get(target) === 'visiting') {
        const start = stack.indexOf(target);
        const cycle = canonicalCycle([...stack.slice(start), target]);
        cycles.set(cycle.join('\0'), cycle);
      } else if (!state.has(target)) {
        visit(target);
      }
    }

    stack.pop();
    state.set(name, 'visited');
  }

  for (const name of projectNames) {
    if (!state.has(name)) visit(name);
  }

  return [...cycles.values()].sort((left, right) =>
    left.join('\0').localeCompare(right.join('\0')),
  );
}

export async function checkArchitecture(workspaceRoot) {
  const projects = await discoverProjects(workspaceRoot);
  const byName = new Map(projects.map((project) => [project.manifest.name, project]));
  const diagnostics = new Set();
  const edges = new Map(projects.map((project) => [project.manifest.name, new Set()]));
  const edgeOrigins = new Map();

  function addEdge(source, target, origin) {
    edges.get(source.manifest.name).add(target.manifest.name);
    const key = `${source.manifest.name}\0${target.manifest.name}`;
    const origins = edgeOrigins.get(key) ?? [];
    origins.push(origin);
    edgeOrigins.set(key, origins);
  }

  for (const project of projects) {
    if (!allowedTargets(project)) {
      diagnostics.add(`UNCLASSIFIED_PROJECT: ${project.manifest.name} (${project.id})`);
    }

    const declaredDependencies = new Set();
    for (const field of dependencyFields) {
      for (const dependency of Object.keys(project.manifest[field] ?? {})) {
        declaredDependencies.add(dependency);
      }
    }

    for (const dependency of [...declaredDependencies].sort()) {
      if (!dependency.startsWith(codeatlasPrefix)) continue;
      const target = byName.get(dependency);
      if (!target) {
        diagnostics.add(
          `UNKNOWN_PROJECT_DEPENDENCY: ${project.manifest.name} -> ${dependency} (${project.id}/package.json)`,
        );
      } else if (target !== project) {
        addEdge(project, target, `${project.id}/package.json`);
      }
    }

    for (const filePath of await sourceFiles(project.root)) {
      const relativeFile = normalizePath(path.relative(workspaceRoot, filePath));
      const sourceText = await readFile(filePath, 'utf8');
      for (const imported of importSpecifiers(filePath, sourceText)) {
        let target;
        let internalName;

        if (imported.specifier.startsWith(codeatlasPrefix)) {
          internalName = `${codeatlasPrefix}${packageSegment(imported.specifier)}`;
          target = byName.get(internalName);
        } else if (imported.specifier.startsWith('.')) {
          const resolved = path.resolve(path.dirname(filePath), imported.specifier);
          target = projects.find((candidate) => isWithin(candidate.root, resolved));
          internalName = target?.manifest.name;
        }

        if (!internalName) continue;
        const origin = `${relativeFile}:${imported.line}`;
        if (!target) {
          diagnostics.add(
            `UNKNOWN_PROJECT_DEPENDENCY: ${project.manifest.name} -> ${internalName} (${origin})`,
          );
          continue;
        }
        if (target === project) continue;

        addEdge(project, target, origin);
        if (!declaredDependencies.has(target.manifest.name)) {
          diagnostics.add(
            `UNDECLARED_PROJECT_DEPENDENCY: ${project.manifest.name} -> ${target.manifest.name} (${origin})`,
          );
        }
      }
    }
  }

  for (const project of projects) {
    const allowed = allowedTargets(project);
    if (!allowed) continue;
    for (const targetName of [...edges.get(project.manifest.name)].sort()) {
      const target = byName.get(targetName);
      if (target && !allowed.has(target.directory)) {
        const origins = edgeOrigins.get(`${project.manifest.name}\0${targetName}`).sort();
        diagnostics.add(
          `FORBIDDEN_DEPENDENCY: ${project.manifest.name} -> ${targetName} (${origins[0]})`,
        );
      }
    }
  }

  for (const cycle of findCycles(projects, edges)) {
    diagnostics.add(`DEPENDENCY_CYCLE: ${cycle.join(' -> ')}`);
  }

  const nativeAnalyzer = await checkNativeAnalyzer(workspaceRoot);
  for (const diagnostic of nativeAnalyzer.diagnostics) diagnostics.add(diagnostic);

  return {
    diagnostics: [...diagnostics].sort(),
    projectCount: projects.length + nativeAnalyzer.projectCount,
  };
}

async function main() {
  const workspaceRoot = path.resolve(process.argv[2] ?? process.cwd());
  const result = await checkArchitecture(workspaceRoot);

  if (result.diagnostics.length > 0) {
    process.stderr.write(`${result.diagnostics.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Architecture dependency check passed for ${result.projectCount} projects.\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
