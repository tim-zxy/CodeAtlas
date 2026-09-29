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
const expectedPackageDependencies = Object.fromEntries(packageNames.map((name) => [name, {}]));
expectedPackageDependencies.ir = { zod: '4.6.1' };
expectedPackageDependencies.providers = { '@codeatlas/ir': 'workspace:*', zod: '4.6.1' };
expectedPackageDependencies.plugins = { '@codeatlas/ir': 'workspace:*', zod: '4.6.1' };
expectedPackageDependencies.evaluation = { '@codeatlas/ir': 'workspace:*' };
expectedPackageDependencies.source = { '@codeatlas/ir': 'workspace:*' };
expectedPackageDependencies.storage = { '@codeatlas/ir': 'workspace:*' };
expectedPackageDependencies.application = {
  '@codeatlas/ir': 'workspace:*',
  '@codeatlas/source': 'workspace:*',
};
const expectedAppDependencies = {
  cli: { '@codeatlas/runtime': 'workspace:*' },
  daemon: {},
  mcp: { '@codeatlas/runtime': 'workspace:*' },
};

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
    assert.deepEqual(manifest.files, name === 'storage' ? ['dist', 'migrations'] : ['dist']);
    assert.equal(manifest.scripts.build, 'tsc -p tsconfig.json');
    assert.deepEqual(manifest.dependencies ?? {}, expectedPackageDependencies[name]);
    assert.deepEqual(manifest.devDependencies ?? {}, {});
    await readFile(`packages/${name}/tsconfig.json`, 'utf8');
    const source = await readFile(`packages/${name}/src/index.ts`, 'utf8');
    if (name === 'runtime') {
      assert.match(source, /RuntimeBuilder/);
      assert.match(source, /KnowledgeRuntime/);
    } else if (name === 'ir') {
      assert.match(source, /EntityIdSchema/);
      assert.match(source, /SourceRangeSchema/);
      assert.match(source, /parseSchemaEnvelope/);
    } else if (name === 'storage') {
      assert.equal(
        source,
        "export * from './migrations/index.js';\nexport * from './source-state/index.js';\nexport * from './analysis/activation-state.js';\n",
      );
    } else if (name === 'application') {
      assert.match(source, /reconcileGitWorktree/);
    } else if (name === 'providers') {
      assert.equal(
        source,
        "export * from './native-client.js';\nexport * from './native-ipc.js';\nexport * from './native-ipc-v2.js';\nexport * from './coverage-summary.js';\nexport * from './provider-routing.js';\nexport * from './provider-spi.js';\nexport { normalizeNativeAnalysis } from './canonical-normalizer.js';\nexport type {\n  NormalizedCanonicalAnalysis,\n  NormalizedNodePair,\n  NormalizedEdgePair,\n} from './canonical-normalizer.js';\nexport { CanonicalNormalizationError } from './java-node-normalizer.js';\nexport type { CanonicalNormalizationErrorCode } from './java-node-normalizer.js';\nexport { mergeCanonicalObservations } from './fact-merger.js';\nexport type { MergedCanonicalAnalysis } from './fact-merger.js';\nexport { FactMergeError } from './fact-merger-input.js';\nexport type { FactMergeErrorCode, MergeInput, MergeObservation } from './fact-merger-input.js';\nexport type { MergeExplanation, MergeSupportSummary } from './fact-merger-selection.js';\n",
      );
    } else if (name === 'plugins') {
      assert.equal(
        source,
        "export * from './plugin-routing.js';\nexport * from './plugin-spi.js';\n",
      );
    } else if (name === 'evaluation') {
      assert.equal(
        source,
        "export * from './canonical-comparator.js';\nexport * from './comparator-error.js';\nexport * from './fixture-error.js';\nexport * from './fixture-manifest.js';\nexport * from './fixture-registry.js';\nexport * from './metric-engine.js';\nexport * from './quality-gates.js';\n",
      );
    } else if (name === 'source') {
      assert.match(source, /scanGitRepository/);
    } else {
      assert.equal(source, 'export {};\n');
    }
  });
}

for (const name of appNames) {
  test(`app ${name} has an isolated TypeScript project`, async () => {
    const manifest = await readJson(`apps/${name}/package.json`);

    assert.equal(manifest.name, `@codeatlas/${name}`);
    assert.equal(manifest.private, true);
    assert.equal(manifest.type, 'module');
    assert.equal(manifest.scripts.build, 'tsc -p tsconfig.json');
    assert.deepEqual(manifest.dependencies ?? {}, expectedAppDependencies[name]);
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
    'pnpm architecture:check',
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

test('workspace scripts expose and compose the architecture dependency gate', async () => {
  const manifest = await readJson('package.json');

  assert.equal(manifest.scripts['architecture:check'], 'node scripts/check-architecture.mjs');
  assert.equal(
    manifest.scripts['test:native-handshake'],
    'node --test packages/providers/test/native-handshake.test.mjs',
  );
  assert.match(manifest.scripts.test, /scripts\/test-architecture-rules\.mjs/);
  assert.match(manifest.scripts.test, /packages\/storage\/test\/migration-runner\.test\.mjs/);
  assert.match(
    manifest.scripts.test,
    /packages\/storage\/test\/migration-runner-application\.test\.mjs/,
  );
  assert.match(
    manifest.scripts.test,
    /packages\/storage\/test\/migration-runner-failures\.test\.mjs/,
  );
  assert.match(manifest.scripts.test, /packages\/providers\/test\/native-ipc\.test\.mjs/);
  assert.match(manifest.scripts.test, /packages\/source\/test\/source-scan\.test\.mjs/);
  assert.match(manifest.scripts.test, /packages\/providers\/test\/native-ipc-bytes\.test\.mjs/);
  assert.match(manifest.scripts.test, /packages\/providers\/test\/provider-routing\.test\.mjs/);
  assert.match(manifest.scripts.test, /packages\/providers\/test\/provider-spi\.test\.mjs/);
  assert.match(manifest.scripts.test, /packages\/plugins\/test\/plugin-routing\.test\.mjs/);
  assert.match(manifest.scripts.test, /packages\/plugins\/test\/plugin-spi\.test\.mjs/);
  assert.match(manifest.scripts.test, /packages\/evaluation\/test\/fixture-manifest\.test\.mjs/);
  assert.match(manifest.scripts.test, /packages\/evaluation\/test\/fixture-registry\.test\.mjs/);
  assert.match(
    manifest.scripts.test,
    /packages\/evaluation\/test\/canonical-comparator\.test\.mjs/,
  );
  assert.match(manifest.scripts.verify, /pnpm architecture:check/);
  assert.ok(
    manifest.scripts.verify.indexOf('cargo build --workspace') <
      manifest.scripts.verify.indexOf('pnpm test:native-handshake'),
  );
  assert.ok(
    manifest.scripts.verify.indexOf('pnpm test:native-handshake') <
      manifest.scripts.verify.indexOf('cargo clippy --workspace'),
  );
});

test('Rust toolchain is pinned to the verified compiler release', async () => {
  const toolchain = await readFile('rust-toolchain.toml', 'utf8');

  assert.match(toolchain, /^channel = "1\.98\.1"$/m);
  assert.match(toolchain, /^profile = "default"$/m);
  assert.match(toolchain, /^components = \["rustfmt", "clippy"\]$/m);
});
