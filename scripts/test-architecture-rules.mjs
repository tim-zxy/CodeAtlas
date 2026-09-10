import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const checkerPath = fileURLToPath(new URL('./check-architecture.mjs', import.meta.url));
const repositoryRoot = path.resolve(path.dirname(checkerPath), '..');

async function createFixture(t, projects) {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-architecture-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const project of projects) {
    const projectRoot = path.join(root, project.id);
    await mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: project.name,
          private: true,
          type: 'module',
          ...(project.dependencies ? { dependencies: project.dependencies } : {}),
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      path.join(projectRoot, 'src', project.fileName ?? 'index.ts'),
      project.source ?? 'export {};\n',
    );
  }

  return root;
}

async function createNativeFixture(t, cargoManifest, workspaceManifest) {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-native-architecture-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const crateRoot = path.join(root, 'crates', 'native-analyzer');
  await mkdir(crateRoot, { recursive: true });
  await writeFile(path.join(crateRoot, 'Cargo.toml'), cargoManifest);
  if (workspaceManifest) await writeFile(path.join(root, 'Cargo.toml'), workspaceManifest);

  return root;
}

function runChecker(root) {
  return spawnSync(process.execPath, [checkerPath, root], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
}

test('fixture valid-layered-imports accepts the approved dependency direction', async (t) => {
  const root = await createFixture(t, [
    { id: 'packages/ir', name: '@codeatlas/ir' },
    {
      id: 'packages/source',
      name: '@codeatlas/source',
      dependencies: { '@codeatlas/ir': 'workspace:*' },
      source: "export * from '@codeatlas/ir';\n",
    },
    {
      id: 'packages/application',
      name: '@codeatlas/application',
      dependencies: { '@codeatlas/source': 'workspace:*' },
      source: "import '@codeatlas/source';\n",
    },
    {
      id: 'packages/runtime',
      name: '@codeatlas/runtime',
      dependencies: { '@codeatlas/application': 'workspace:*' },
      source: "import('@codeatlas/application');\n",
    },
    {
      id: 'apps/cli',
      name: '@codeatlas/cli',
      dependencies: { '@codeatlas/runtime': 'workspace:*' },
      source: "import '@codeatlas/runtime';\n",
    },
  ]);

  const result = runChecker(root);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'Architecture dependency check passed for 5 projects.\n');
  assert.equal(result.stderr, '');
});

for (const fixture of [
  {
    name: 'forbidden-ir-upper-layer',
    source: { id: 'packages/ir', name: '@codeatlas/ir' },
    target: { id: 'packages/runtime', name: '@codeatlas/runtime' },
  },
  {
    name: 'forbidden-provider-knowledge',
    source: { id: 'packages/providers', name: '@codeatlas/providers' },
    target: { id: 'packages/knowledge', name: '@codeatlas/knowledge' },
  },
  {
    name: 'forbidden-app-storage',
    source: { id: 'apps/cli', name: '@codeatlas/cli' },
    target: { id: 'packages/storage', name: '@codeatlas/storage' },
  },
]) {
  test(`fixture ${fixture.name} rejects its forbidden import`, async (t) => {
    const root = await createFixture(t, [
      {
        ...fixture.source,
        dependencies: { [fixture.target.name]: 'workspace:*' },
        source: `import '${fixture.target.name}';\n`,
      },
      fixture.target,
    ]);

    const result = runChecker(root);

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      new RegExp(
        `FORBIDDEN_DEPENDENCY: ${fixture.source.name} -> ${fixture.target.name.replace('/', '\\/')}`,
      ),
    );
  });
}

test('fixture forbidden-domain-cycle reports a dependency cycle', async (t) => {
  const root = await createFixture(t, [
    {
      id: 'packages/application',
      name: '@codeatlas/application',
      dependencies: { '@codeatlas/source': 'workspace:*' },
      source: "import '@codeatlas/source';\n",
    },
    {
      id: 'packages/source',
      name: '@codeatlas/source',
      dependencies: { '@codeatlas/application': 'workspace:*' },
      source: "import '@codeatlas/application';\n",
    },
  ]);

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /DEPENDENCY_CYCLE: @codeatlas\/application -> @codeatlas\/source -> @codeatlas\/application/,
  );
});

test('fixture undeclared-internal-import rejects an import missing from the manifest', async (t) => {
  const root = await createFixture(t, [
    { id: 'packages/ir', name: '@codeatlas/ir' },
    {
      id: 'packages/source',
      name: '@codeatlas/source',
      source: "import '@codeatlas/ir';\n",
    },
  ]);

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /UNDECLARED_PROJECT_DEPENDENCY: @codeatlas\/source -> @codeatlas\/ir/,
  );
});

test('fixture unknown-codeatlas-package rejects an unknown internal package name', async (t) => {
  const root = await createFixture(t, [
    {
      id: 'packages/source',
      name: '@codeatlas/source',
      dependencies: { '@codeatlas/missing': 'workspace:*' },
      source: "import '@codeatlas/missing';\n",
    },
  ]);

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /UNKNOWN_PROJECT_DEPENDENCY: @codeatlas\/source -> @codeatlas\/missing/,
  );
});

test('fixture forbidden-module-require rejects a CommonJS import', async (t) => {
  const root = await createFixture(t, [
    {
      id: 'apps/cli',
      name: '@codeatlas/cli',
      fileName: 'index.cts',
      source: "module.require('@codeatlas/storage');\n",
    },
    { id: 'packages/storage', name: '@codeatlas/storage' },
  ]);

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /FORBIDDEN_DEPENDENCY: @codeatlas\/cli -> @codeatlas\/storage \(apps\/cli\/src\/index\.cts:1\)/,
  );
});

for (const fixture of [
  {
    name: 'forbidden-native-sqlite',
    dependency: 'rusqlite = "0.32"',
  },
  {
    name: 'forbidden-native-renamed-sqlite',
    dependency: 'database = { package = "rusqlite", version = "0.32" }',
  },
]) {
  test(`fixture ${fixture.name} rejects SQLite ownership in the native analyzer`, async (t) => {
    const root = await createNativeFixture(
      t,
      `[package]\nname = "codeatlas-native-analyzer"\nversion = "0.0.0"\nedition = "2024"\n\n[dependencies]\n${fixture.dependency}\n`,
    );

    const result = runChecker(root);

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /FORBIDDEN_NATIVE_DEPENDENCY: codeatlas-native-analyzer -> rusqlite \(crates\/native-analyzer\/Cargo\.toml:7\)/,
    );
  });
}

for (const fixture of [
  {
    name: 'forbidden-native-sqlx-sqlite-feature',
    packageName: 'sqlx',
    dependency: 'sqlx = { version = "0.8", features = ["sqlite"] }',
  },
  {
    name: 'forbidden-native-diesel-sqlite-feature',
    packageName: 'diesel',
    dependency: 'diesel = { version = "2", features = ["sqlite"] }',
  },
]) {
  test(`fixture ${fixture.name} rejects an SQLite feature in the native analyzer`, async (t) => {
    const root = await createNativeFixture(
      t,
      `[package]\nname = "codeatlas-native-analyzer"\nversion = "0.0.0"\nedition = "2024"\n\n[dependencies]\n${fixture.dependency}\n`,
    );

    const result = runChecker(root);

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      new RegExp(
        `FORBIDDEN_NATIVE_DEPENDENCY: codeatlas-native-analyzer -> ${fixture.packageName} \\(crates/native-analyzer/Cargo\\.toml:7\\)`,
      ),
    );
  });
}

test('fixture forbidden-native-renamed-sqlx-table rejects an SQLite feature', async (t) => {
  const root = await createNativeFixture(
    t,
    '[package]\nname = "codeatlas-native-analyzer"\nversion = "0.0.0"\nedition = "2024"\n\n[dependencies.database]\npackage = "sqlx"\nfeatures = [\n  "sqlite",\n]\n',
  );

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /FORBIDDEN_NATIVE_DEPENDENCY: codeatlas-native-analyzer -> sqlx \(crates\/native-analyzer\/Cargo\.toml:6\)/,
  );
});

test('fixture forbidden-native-sqlx-multiline-feature rejects SQLite ownership', async (t) => {
  const root = await createNativeFixture(
    t,
    '[package]\nname = "codeatlas-native-analyzer"\nversion = "0.0.0"\nedition = "2024"\n\n[dependencies.sqlx]\nfeatures = [\n  "runtime-tokio",\n  "sqlite",\n]\n',
  );

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /FORBIDDEN_NATIVE_DEPENDENCY: codeatlas-native-analyzer -> sqlx \(crates\/native-analyzer\/Cargo\.toml:6\)/,
  );
});

test('fixture forbidden-native-escaped-package rejects SQLite ownership', async (t) => {
  const root = await createNativeFixture(
    t,
    '[package]\nname = "codeatlas-native-analyzer"\nversion = "0.0.0"\nedition = "2024"\n\n[dependencies.database]\npackage = "rusql\\u0069te"\n',
  );

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /FORBIDDEN_NATIVE_DEPENDENCY: codeatlas-native-analyzer -> rusqlite \(crates\/native-analyzer\/Cargo\.toml/,
  );
});

test('fixture forbidden-native-escaped-feature rejects SQLite ownership', async (t) => {
  const root = await createNativeFixture(
    t,
    '[package]\nname = "codeatlas-native-analyzer"\nversion = "0.0.0"\nedition = "2024"\n\n[dependencies.sqlx]\nfeatures = ["sql\\u0069te"]\n',
  );

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /FORBIDDEN_NATIVE_DEPENDENCY: codeatlas-native-analyzer -> sqlx \(crates\/native-analyzer\/Cargo\.toml/,
  );
});

test('fixture forbidden-native-workspace-inheritance rejects renamed SQLite ownership', async (t) => {
  const root = await createNativeFixture(
    t,
    '[package]\nname = "codeatlas-native-analyzer"\nversion = "0.0.0"\nedition = "2024"\n\n[dependencies]\ndatabase = { workspace = true }\n',
    '[workspace]\nmembers = ["crates/native-analyzer"]\n\n[workspace.dependencies]\ndatabase = { package = "rusqlite", version = "0.32" }\n',
  );

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /FORBIDDEN_NATIVE_DEPENDENCY: codeatlas-native-analyzer -> rusqlite \(crates\/native-analyzer\/Cargo\.toml:7\)/,
  );
});

test('fixture forbidden-native-feature-forwarding rejects SQLite ownership', async (t) => {
  const root = await createNativeFixture(
    t,
    '[package]\nname = "codeatlas-native-analyzer"\nversion = "0.0.0"\nedition = "2024"\n\n[dependencies]\nsqlx = "0.8"\n\n[features]\ndefault = ["sqlx/sqlite"]\n',
  );

  const result = runChecker(root);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /FORBIDDEN_NATIVE_DEPENDENCY: codeatlas-native-analyzer -> sqlx \(crates\/native-analyzer\/Cargo\.toml:7\)/,
  );
});

test('the real workspace satisfies the architecture dependency rules', () => {
  const result = runChecker(repositoryRoot);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'Architecture dependency check passed for 17 projects.\n');
  assert.equal(result.stderr, '');
});
