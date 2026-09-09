import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
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

async function directoryNames(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

test('workspace contains exactly the approved module inventory', async () => {
  assert.deepEqual(await directoryNames('packages'), [...packageNames].sort());
  assert.deepEqual(await directoryNames('apps'), [...appNames].sort());
  assert.deepEqual(await directoryNames('crates'), ['native-analyzer']);
});

for (const name of packageNames) {
  test(`package ${name} exposes an independent shell`, async () => {
    const manifest = await readJson(`packages/${name}/package.json`);

    assert.equal(manifest.name, `@codeatlas/${name}`);
    assert.equal(manifest.private, true);
    assert.equal(manifest.type, 'module');
    assert.equal(manifest.sideEffects, false);
    assert.equal(manifest.main, './dist/index.js');
    assert.equal(manifest.types, './dist/index.d.ts');
    assert.deepEqual(manifest.exports, {
      '.': {
        types: './dist/index.d.ts',
        default: './dist/index.js',
      },
    });
    assert.deepEqual(manifest.files, ['dist']);
    assert.equal(manifest.scripts.build, 'tsc -p tsconfig.json');
    assert.deepEqual(manifest.dependencies ?? {}, {});
    assert.deepEqual(manifest.devDependencies ?? {}, {});
    await readFile(`packages/${name}/tsconfig.json`, 'utf8');
    assert.equal(await readFile(`packages/${name}/src/index.ts`, 'utf8'), 'export {};\n');
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
    'rustup toolchain install 1.98.1 --profile default --component rustfmt --component clippy',
  ];

  for (const command of requiredCommands) {
    assert.match(workflow, new RegExp(command.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Rust toolchain is pinned to the verified compiler release', async () => {
  const toolchain = await readFile('rust-toolchain.toml', 'utf8');

  assert.match(toolchain, /^channel = "1\.98\.1"$/m);
  assert.match(toolchain, /^profile = "default"$/m);
  assert.match(toolchain, /^components = \["rustfmt", "clippy"\]$/m);
});
