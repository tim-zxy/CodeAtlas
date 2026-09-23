import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { FixtureRegistryError } from './fixture-error.js';
import { parseFixtureManifest } from './fixture-manifest.js';
import type { FixtureManifestV1 } from './fixture-manifest.js';

export interface RegisteredFixture {
  readonly manifest: FixtureManifestV1;
  readonly manifestPath: string;
  readonly directory: string;
  readonly inputs: Readonly<Record<string, string>>;
  readonly expected: Readonly<Record<string, string>>;
}

function isInside(base: string, target: string): boolean {
  const path = relative(base, target);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function displayPath(root: string, target: string): string {
  return relative(root, target).split(sep).join('/');
}

async function collectManifests(root: string, directory: string, output: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (cause) {
    throw new FixtureRegistryError(
      'ROOT_INVALID',
      displayPath(root, directory) || root,
      '',
      'cannot read Fixture directory',
      { cause },
    );
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.name === 'fixture.json' && entry.isSymbolicLink()) {
      throw new FixtureRegistryError(
        'MANIFEST_INVALID',
        displayPath(root, path),
        '',
        'manifest must be a regular file',
      );
    }
    if (entry.isDirectory()) await collectManifests(root, path, output);
    else if (entry.name === 'fixture.json' && entry.isFile()) output.push(path);
  }
}

async function resolveArtifacts(
  fixtureDirectory: string,
  artifacts: Readonly<Record<string, string>>,
  manifestPath: string,
  parentField: 'inputs' | 'expected',
): Promise<Record<string, string>> {
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [name, path] of Object.entries(artifacts)) {
    const fieldPath = `${parentField}.${name}`;
    let target: string;
    try {
      target = await realpath(resolve(fixtureDirectory, ...path.split('/')));
      const info = await stat(target);
      if (!isInside(fixtureDirectory, target) || (!info.isFile() && !info.isDirectory())) {
        throw new FixtureRegistryError(
          'ARTIFACT_INVALID',
          manifestPath,
          fieldPath,
          'artifact is not a file or directory inside its Fixture',
        );
      }
    } catch (cause) {
      if (cause instanceof FixtureRegistryError) throw cause;
      throw new FixtureRegistryError(
        'ARTIFACT_INVALID',
        manifestPath,
        fieldPath,
        'artifact cannot be resolved',
        { cause },
      );
    }
    result[name] = target;
  }
  return result;
}

export async function discoverFixtures(root: string): Promise<readonly RegisteredFixture[]> {
  let rootPath: string;
  try {
    rootPath = await realpath(resolve(root));
    if (!(await stat(rootPath)).isDirectory()) {
      throw new FixtureRegistryError('ROOT_INVALID', root, '', 'Fixture root must be a directory');
    }
  } catch (cause) {
    if (cause instanceof FixtureRegistryError) throw cause;
    throw new FixtureRegistryError('ROOT_INVALID', root, '', 'Fixture root cannot be resolved', {
      cause,
    });
  }

  const manifestFiles: string[] = [];
  await collectManifests(rootPath, rootPath, manifestFiles);
  manifestFiles.sort((a, b) => {
    const left = displayPath(rootPath, a);
    const right = displayPath(rootPath, b);
    return left < right ? -1 : left > right ? 1 : 0;
  });

  const byId = new Map<string, string>();
  const fixtures: RegisteredFixture[] = [];
  for (const file of manifestFiles) {
    const manifestPath = displayPath(rootPath, file);
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(file, 'utf8')) as unknown;
    } catch (cause) {
      throw new FixtureRegistryError(
        'MANIFEST_INVALID',
        manifestPath,
        '',
        'manifest cannot be read as JSON',
        { cause },
      );
    }
    const manifest = parseFixtureManifest(raw, manifestPath);
    const first = byId.get(manifest.id);
    if (first !== undefined) {
      throw new FixtureRegistryError(
        'DUPLICATE_ID',
        manifestPath,
        'id',
        `duplicate Fixture ID ${manifest.id}; first declared in ${first}`,
      );
    }
    byId.set(manifest.id, manifestPath);
    const directory = resolve(file, '..');
    fixtures.push({
      manifest,
      manifestPath,
      directory,
      inputs: await resolveArtifacts(directory, manifest.inputs, manifestPath, 'inputs'),
      expected: await resolveArtifacts(directory, manifest.expected, manifestPath, 'expected'),
    });
  }
  return fixtures;
}
