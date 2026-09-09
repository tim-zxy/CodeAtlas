import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const packageNames = [
  'runtime',
  'application',
  'agent-api',
  'ir',
  'storage',
  'source',
  'providers',
  'plugins',
  'contracts',
  'execution',
  'documents',
  'knowledge',
  'evaluation',
];

const appNames = ['cli', 'mcp', 'daemon'];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

for (const name of packageNames) {
  test(`package ${name} exposes an independent shell`, async () => {
    const manifest = await readJson(`packages/${name}/package.json`);

    assert.equal(manifest.name, `@codeatlas/${name}`);
    assert.equal(manifest.private, true);
    assert.equal(manifest.type, 'module');
    assert.equal(manifest.scripts.build, 'tsc -p tsconfig.json');
    assert.deepEqual(manifest.dependencies ?? {}, {});
    assert.deepEqual(manifest.devDependencies ?? {}, {});
    await readFile(`packages/${name}/tsconfig.json`, 'utf8');
    await readFile(`packages/${name}/src/index.ts`, 'utf8');
  });
}

for (const name of appNames) {
  test(`app ${name} has an isolated TypeScript project`, async () => {
    const manifest = await readJson(`apps/${name}/package.json`);

    assert.equal(manifest.name, `@codeatlas/${name}`);
    assert.equal(manifest.private, true);
    assert.equal(manifest.type, 'module');
    assert.equal(manifest.scripts.build, 'tsc -p tsconfig.json');
    assert.deepEqual(manifest.dependencies ?? {}, {});
    assert.deepEqual(manifest.devDependencies ?? {}, {});
    await readFile(`apps/${name}/tsconfig.json`, 'utf8');
  });
}

test('continuous integration runs every bootstrap gate', async () => {
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  const requiredCommands = [
    'pnpm install --frozen-lockfile',
    'pnpm format:check',
    'pnpm build',
    'pnpm test',
    'cargo fmt --all --check',
    'cargo build --workspace',
    'cargo clippy --workspace --all-targets -- -D warnings',
    'cargo test --workspace',
  ];

  for (const command of requiredCommands) {
    assert.match(workflow, new RegExp(command.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
