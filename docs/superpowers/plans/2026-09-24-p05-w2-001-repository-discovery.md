# P05-W2-001 Repository Discovery and Source Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return a deterministic, policy-filtered inventory and Git observation for one registered repository, with the three P05-W2-001 Fixtures passing.

**Architecture:** `@codeatlas/source` exposes one Git-only scan operation. Git discovery and ignore decisions are adapters around a Git-independent filesystem walker, path selector, and classifier; the caller supplies stable Repository identity and validated in-memory configuration. The result is an observation, not Canonical `SourceFile`, a persisted revision, or a CLI operation.

**Tech Stack:** TypeScript 7, Node.js 24 filesystem/child-process APIs, Git CLI, existing `@codeatlas/ir` schemas, Node test runner, existing Fixture registry.

**Spec:** [P05-W2-001 approved design](../specs/2026-09-24-p05-w2-001-repository-discovery-design.md); [2026-09-24 compatibility amendment](../../handoff/DESIGN_AMENDMENT_REPORT_2026-09-24.md).

## Global Constraints

- Read the repository `AGENTS.md` Handoff sequence before editing; this plan implements P05-W2-001 only.
- Use an already validated stable `Repository.id`; never derive it from root path or Git remote. Repositories may be outside the workspace root.
- Use in-memory include/exclude only; no `.ekp` YAML, fingerprint, Revision, database, Provider, Java parser, product CLI, or non-Git adapter.
- Selection precedence is metadata/security deny, explicit exclude, explicit include, then `.gitignore`/default exclude. A normal include cannot override security denial.
- Use shell-free Git calls with explicit arguments. All returned paths use Canonical IR `/` repository-relative syntax. Do not follow symbolic links or return partial success.
- The three version-1 Fixture IDs are `basic-java-repo`, `gitignore`, and `generated-vendor`. Do not add a numeric Quality Gate.
- On implementation completion, run tests/Fixtures/build/architecture/format and update `CURRENT_STATUS.md` and `DESIGN_TRACEABILITY.md` with fresh reproducible evidence.

## File map

| File | Single responsibility |
| --- | --- |
| `packages/source/src/types.ts` | Public request/result observation types; no persistence-shaped Canonical `SourceFile`. |
| `packages/source/src/errors.ts` | Closed typed scan failures and safe diagnostics. |
| `packages/source/src/git.ts` | Git root/branch/HEAD observation and ignore queries only. |
| `packages/source/src/path-policy.ts` | Host-independent rooted glob validation and selection precedence. |
| `packages/source/src/classify.ts` | Language, role, provenance, and bounded text/binary classification. |
| `packages/source/src/walk.ts` | Non-following, deterministic filesystem candidate enumeration and race/path validation. |
| `packages/source/src/scan.ts` | Compose the preceding units and return one immutable, sorted result atomically. |
| `packages/source/src/index.ts` | Export the documented public API only. |
| `packages/source/test/*.test.mjs` | Focused Git, policy, walker, classifier, and full-scan tests. |
| `packages/source/test/helpers.mjs` | Shared temporary Git repository materializer and test assertions. |
| `fixtures/source/{basic-java-repo,gitignore,generated-vendor}/` | Version-1 manifests, declarative repository inputs, and expected inventory artifacts. |
| `packages/source/package.json`, `pnpm-lock.yaml`, `package.json` | Declare allowed `source -> ir` workspace dependency and register root tests. |
| `docs/handoff/CURRENT_STATUS.md`, `docs/handoff/DESIGN_TRACEABILITY.md` | Record evidence and executable Fixture paths after implementation passes. |

## Review Focus

1. An ignored directory containing a specifically included descendant must be traversed and only that descendant re-admitted (Task 2 policy test; Task 4 Fixture).
2. Git-ignored names with spaces or newlines must survive NUL-delimited Git input/output unchanged (Task 2 test).
3. A symlink or normalized-path collision must not escape, loop, or silently alias two logical files (Task 3 tests).
4. A file disappearing or changing while inspected must fail the entire scan without returning an incomplete inventory (Task 3 unit test; Task 4 public-operation test).
5. An unborn repository, detached HEAD, and a repository outside the workspace must not fabricate a commit, branch, or workspace-relative identity (Task 1 tests; Task 4 Fixture).

The three Fixture `setup.json` files use the same declarative shape: `{ "branch": "main", "commit": true, "files": [{ "path": "src/Main.java", "text": "class Main {}\n" }], "config": { "include": [], "exclude": [] } }`. A file entry uses exactly one of `text` or `base64`; the test helper creates all paths in a temporary directory, initializes Git, and commits only when `commit` is true. Each `expected.json` lists exact sorted `paths` and per-path classification; branch/HEAD values are compared with an independent Git query because a commit hash depends on Git's object encoding. Manifests point only to these checked-in artifacts; none stores a live `.git` directory.

Each Fixture manifest has this complete shape, changing only `id` and artifact directory for the other two Fixtures:

```json
{
  "schemaVersion": 1,
  "id": "basic-java-repo",
  "category": "code-intelligence",
  "phase": "0.5",
  "languages": ["java"],
  "frameworks": [],
  "capabilities": ["SOURCE_SCAN"],
  "inputs": { "setup": "setup.json" },
  "expected": { "inventory": "expected.json" },
  "criticalFacts": [],
  "qualityGates": {}
}
```

---

### Task 1: Git observation and source boundary

**Files:** Create `packages/source/src/types.ts`, `errors.ts`, `git.ts`, `packages/source/test/helpers.mjs`, `git.test.mjs`, `fixtures/source/basic-java-repo/fixture.json`, `setup.json`, `expected.json`; modify `packages/source/package.json`, `pnpm-lock.yaml`, `packages/source/src/index.ts`.

**Interfaces:** Produces `discoverGitContext(startingPath: string, workspaceRoot: string): Promise<GitContext>` and `SourceScanError`. `GitContext` has `rootPath`, `branchName: string | null`, `headCommit: CommitIdentity | null`, and `workspacePosition: {kind:'ROOT'} | {kind:'CHILD'; path: RepositoryRelativePath} | {kind:'EXTERNAL'}`. The public request/result types are defined now for Task 4:

```ts
export interface GitContext {
  readonly rootPath: string;
  readonly branchName: string | null;
  readonly headCommit: CommitIdentity | null;
  readonly workspacePosition:
    | { readonly kind: 'ROOT' }
    | { readonly kind: 'CHILD'; readonly path: RepositoryRelativePath }
    | { readonly kind: 'EXTERNAL' };
}
export interface SourceScanRequest {
  readonly repositoryId: EntityId;
  readonly startingPath: string;
  readonly workspaceRoot: string;
  readonly config: Readonly<{ include: readonly string[]; exclude: readonly string[] }>;
}
export interface SourceScanResult extends GitContext {
  readonly repositoryId: EntityId;
  readonly files: readonly ScannedFile[];
}
export interface ScannedFile {
  readonly path: RepositoryRelativePath;
  readonly languageHint: string | null;
  readonly classification: SourceFileClassification;
}
```

- [ ] **Step 1: Create the first Fixture and failing Git tests.** Make `fixture.json` a strict version-1 `code-intelligence`/`"0.5"` manifest with `inputs: { setup: "setup.json" }`, `expected: { inventory: "expected.json" }`, empty `criticalFacts` and `qualityGates`; `setup.json` uses the declared shape above with a Java file and `main` commit. `helpers.mjs` materializes it with shell-free `git init -b main`, fixed author identity and dates, and a commit. Assert `discoverGitContext` returns Git root/HEAD; add unborn, detached, nested-starting-path, external-workspace, and non-Git assertions. The helper exports these concrete functions for every focused test:

```js
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { RepositoryRelativePathSchema } from '@codeatlas/ir';
import { SourceScanError } from '../dist/errors.js';

export const git = (cwd, args) =>
  execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' },
  });
export const repoPath = (value) => RepositoryRelativePathSchema.parse(value);
export const hasCode = (code) => (error) => error instanceof SourceScanError && error.code === code;
export async function materialize(setup, baseDirectory) {
  const repo = join(baseDirectory, 'repo');
  await mkdir(repo, { recursive: true });
  git(repo, ['init', '-b', setup.branch]);
  for (const file of setup.files) {
    const target = join(repo, ...file.path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, 'text' in file ? file.text : Buffer.from(file.base64, 'base64'));
  }
  if (setup.commit) {
    git(repo, ['add', '--all']);
    git(repo, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'fixture']);
  }
  return repo;
}
```

```js
const context = await discoverGitContext(join(repo, 'src'), workspace);
assert.equal(context.rootPath, await realpath(repo));
assert.equal(context.headCommit, git(repo, ['rev-parse', 'HEAD']).trim());
assert.deepEqual(context.workspacePosition, { kind: 'EXTERNAL' });
await assert.rejects(discoverGitContext(nonGit, workspace), hasCode('NON_GIT_DIRECTORY'));
```

- [ ] **Step 2: Run the focused test before implementation.** Run `node --test packages/source/test/git.test.mjs`. Expected: module/export not found or assertions fail.
- [ ] **Step 3: Add the boundary and Git adapter.** Add `"@codeatlas/ir": "workspace:*"` to the source package and the corresponding `packages/source` lockfile importer; use the project's normal offline workspace install/link flow rather than modifying other dependencies. Define closed codes `NON_GIT_DIRECTORY | INVALID_INPUT | GIT_FAILED | FILE_READ_FAILED | SOURCE_CHANGED`. Use `realpath`/`relative` to derive workspace position, `git rev-parse --show-toplevel`, `git symbolic-ref --quiet --short HEAD`, and `git rev-parse --verify HEAD` with explicit arguments and no shell. Treat the known unborn/detached exit states as nullable observations, not arbitrary Git failure. Parse the commit through `CommitIdentitySchema`; never derive an Entity ID. Export public types and `SourceScanError` from the package root; keep `discoverGitContext` internal and test it through `dist/git.js`.

```ts
export type SourceScanErrorCode =
  | 'NON_GIT_DIRECTORY'
  | 'INVALID_INPUT'
  | 'GIT_FAILED'
  | 'FILE_READ_FAILED'
  | 'SOURCE_CHANGED';
export class SourceScanError extends Error {
  constructor(
    readonly code: SourceScanErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SourceScanError';
  }
}
```

- [ ] **Step 4: Build and rerun.** Run the local TypeScript compiler for `packages/source/tsconfig.json`, then `node --test packages/source/test/git.test.mjs`; expect all Task 1 cases to pass. Run `node scripts/check-architecture.mjs`; expect 17 allowed projects. Do not change `packages/runtime/src/configuration.ts` or load YAML.
- [ ] **Step 5: Commit only Task 1 files.** Suggested message: `feat(source): discover Git repository context`.

### Task 2: Rooted path policy and Git ignore adapter

**Files:** Create `packages/source/src/path-policy.ts`, `packages/source/test/path-policy.test.mjs`, `fixtures/source/gitignore/fixture.json`, `setup.json`, `expected.json`; modify `packages/source/src/git.ts` and `index.ts` only for needed exports.

**Interfaces:** Produces `compilePathPolicy(config: SourceScanRequest['config']): CompiledPathPolicy` with `decision(path: RepositoryRelativePath): 'DENY' | 'INCLUDE' | 'DEFAULT'`, `mayDescend(directory: string): boolean`, and `couldIncludeDescendant(directory: string): boolean`, plus `gitIgnoredPaths(rootPath: string, paths: readonly RepositoryRelativePath[]): Promise<ReadonlySet<string>>`. `mayDescend` refuses metadata, security-denied, explicitly excluded, or default-excluded subtrees unless `couldIncludeDescendant` is true. Task 4 additionally prunes Git-ignored directories with no possible explicit include; Git/default exclusion applies only to `DEFAULT` files.

- [ ] **Step 1: Write policy and ignore tests first.** Declare `files` containing `.gitignore` text `ignored/\n`, `ignored/.gitignore` text `*.java\n`, `ignored/Keep.java`, `ignored/Skip.java`, and `src/Main.java` in `gitignore/setup.json`; set include `ignored/Keep.java` and exclude `ignored/Skip.java`. `expected.json` lists `ignored/Keep.java` and `src/Main.java` only. Test invalid absolute, backslash, empty, `.`/`..`, and negated patterns; `?`, `*`, and `**` matching; explicit exclude beating include; secret denial beating include; metadata denial; default `build`, `dist`, `target`, `vendor`, and VCS exclusions; and NUL-safe Git ignore results for spaces/newlines.

```js
const policy = compilePathPolicy({ include: ['build/generated/**'], exclude: ['**/Skip.java'] });
assert.equal(policy.decision(repoPath('build/generated/Keep.java')), 'INCLUDE');
assert.equal(policy.decision(repoPath('build/generated/Skip.java')), 'DENY');
assert.equal(policy.decision(repoPath('config/.env.local')), 'DENY');
```

- [ ] **Step 2: Run `node --test packages/source/test/path-policy.test.mjs`;** expect failure before implementation.
- [ ] **Step 3: Implement one anchored matcher and one Git query.** Validate rooted `/` glob syntax; split path and pattern into segments, match literal characters and `?`/`*` within one segment, and use a memoized `(patternIndex,pathIndex)` recursion for `**` matching zero or more segments. Preserve ordinal case and canonical paths. Metadata and mandatory secret patterns are hard denies; explicit excludes win; explicit includes bypass ordinary defaults and Git ignore. Define a private `defaultExcluded(path)` for the approved build/dist/target/vendor defaults and use it consistently for both file selection and directory pruning. Send NUL-delimited candidate paths to `git -C <root> check-ignore --no-index -z --stdin`, parse NUL-delimited output, accept exit 0/1, and map other exits to `GIT_FAILED`. Bound each batch by both path count and encoded byte length; never parse line-delimited path output.

```ts
export function selectPath(
  path: RepositoryRelativePath,
  policy: CompiledPathPolicy,
  ignoredByGit: boolean,
): boolean {
  const decision = policy.decision(path);
  return decision === 'INCLUDE' || (decision === 'DEFAULT' && !ignoredByGit && !defaultExcluded(path));
}
```

- [ ] **Step 4: Build and rerun** the focused policy test and architecture check; expect pass. Verify the Fixture manifest with the existing `discoverFixtures` registry; `qualityGates` remains `{}`.
- [ ] **Step 5: Commit only Task 2 files.** Suggested message: `feat(source): apply safe include and Git ignore policy`.

### Task 3: Filesystem walker and orthogonal classification

**Files:** Create `packages/source/src/walk.ts`, `classify.ts`, `packages/source/test/walk-classify.test.mjs`, `fixtures/source/generated-vendor/fixture.json`, `setup.json`, `expected.json`.

**Interfaces:** Produces `walkCandidates(rootPath: string, mayDescend: (directory: string) => boolean | Promise<boolean>): AsyncIterable<Candidate>` where `Candidate = { readonly absolutePath: string; readonly path: RepositoryRelativePath }`, and `classifyFile(absolutePath: string, path: RepositoryRelativePath): Promise<Pick<ScannedFile, 'languageHint' | 'classification'>>`. Task 4 calls these without Git-specific imports.

- [ ] **Step 1: Write failing walker/classifier tests and Fixture input.** Cover source/test/other, authored/generated/vendor precedence, generated test, `.java` hint/unknown hint, NUL or invalid UTF-8 binary sample, skipped file/directory symlinks, path escape/cycle, canonical-path collision, and a file removed or modified during inspection. `generated-vendor/setup.json` declares `src/main/java/Main.java`, `src/test/java/MainTest.java`, `build/generated/TestGenerated.java`, `vendor/lib/Other.java`, `docs/readme.md`, and `assets/blob.bin` with `base64: "AAECAw=="`; include `build/generated/**` and `vendor/**` so classification is observable. Its expected artifact lists their sorted paths and orthogonal role/provenance/contentKind values.

```js
assert.deepEqual(await classifyFile(javaFile, repoPath('src/test/java/Generated.java')), {
  languageHint: 'java',
  classification: { role: 'TEST', provenance: 'AUTHORED', contentKind: 'TEXT' },
});
assert.equal((await classifyFile(binaryFile, repoPath('assets/blob.bin'))).classification.contentKind, 'BINARY');
```

- [ ] **Step 2: Run `node --test packages/source/test/walk-classify.test.mjs`;** expect failure before implementation.
- [ ] **Step 3: Implement deterministic enumeration and classification.** Use `readdir(..., {withFileTypes:true})` in ordinal name order, `lstat` rather than following links, validate each candidate with `RepositoryRelativePathSchema`, track canonical path collisions, and fail with `FILE_READ_FAILED` or `SOURCE_CHANGED` on detected read/race errors. Read a bounded prefix for content-kind detection, reject NUL/invalid UTF-8 as binary, and compare pre/post file metadata to detect mutation. Role is `TEST` for `test`, `tests`, `src/test`, or `__tests__` path conventions, `SOURCE` for non-test `.java`, otherwise `OTHER`; provenance is `VENDOR` before `GENERATED` before `AUTHORED`. Never return raw contents. The walker is an async generator with this concrete traversal core:

```ts
async function* visit(directory: string): AsyncIterable<Candidate> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = join(directory, entry.name);
    const relativePath = relative(rootPath, absolutePath).split(sep).join('/');
    if (entry.isDirectory() && (await mayDescend(relativePath))) yield* visit(absolutePath);
    if (entry.isFile()) {
      yield { absolutePath, path: RepositoryRelativePathSchema.parse(relativePath) };
    }
  }
}
```

- [ ] **Step 4: Build and rerun** walker/classifier tests plus architecture check; expect pass. Verify `generated-vendor` manifest with `discoverFixtures` and no numerical gate.
- [ ] **Step 5: Commit only Task 3 files.** Suggested message: `feat(source): walk and classify source candidates`.

### Task 4: Atomic public scan, declared Fixtures, and completion evidence

**Files:** Create `packages/source/src/scan.ts`, `packages/source/test/source-scan.test.mjs`; modify `packages/source/src/index.ts`, root `package.json`, `docs/handoff/CURRENT_STATUS.md`, and `docs/handoff/DESIGN_TRACEABILITY.md`; refine the three Fixture expected artifacts only when a reviewed mismatch is a Fixture defect.

**Interfaces:** Produces public `scanGitRepository(request: SourceScanRequest): Promise<SourceScanResult>` and an internal `scanWithDependencies(request: SourceScanRequest, dependencies: ScanDependencies): Promise<SourceScanResult>` for deterministic failure tests. `ScanDependencies` supplies `discoverGitContext`, `gitIgnoredPaths`, `walkCandidates`, and `classifyFile` with the exact Task 1-3 signatures; only `scanGitRepository`, public types, and typed errors are exported from the package root. The public method returns no partial result on failure; arrays/records are immutable. The input repository ID is parsed through the existing IR scalar, but no Canonical `SourceFile` is created.

- [ ] **Step 1: Write failing public-operation tests against all three Fixture manifests.** Use the registry to load each `setup.json` and `expected.json`, materialize the declared temporary Git repository, call `scanGitRepository`, compare stable inventory/classification and independently verify branch/HEAD. Add a deterministic failure-atomicity test against an internal `scanWithDependencies` seam whose injected walker yields one file then throws `SOURCE_CHANGED`; assert the promise rejects and exposes no result. This seam is not exported from the package root. Assert a non-Git root has `NON_GIT_DIRECTORY`, output is sorted and immutable, and an explicit include rescues one file inside an ignored directory while an explicit exclude and secret deny still win.

```js
const result = await scanGitRepository({ repositoryId, startingPath: repo, workspaceRoot, config });
assert.deepEqual(result.files.map((file) => file.path), expected.paths);
assert.ok(Object.isFrozen(result) && Object.isFrozen(result.files));
await assert.rejects(
  scanGitRepository({ ...request, startingPath: nonGit }),
  hasCode('NON_GIT_DIRECTORY'),
);
```

- [ ] **Step 2: Run `node --test packages/source/test/source-scan.test.mjs`;** expect failure before implementation.
- [ ] **Step 3: Compose only the existing units.** Define an internal `scanWithDependencies(request, dependencies)` whose `dependencies` supply the Task 1-3 functions and whose public wrapper binds the production functions. Validate the request, including null/shape errors and malformed Entity IDs, and translate these to `INVALID_INPUT`; discover Git context; compile policy; enumerate candidates, preserving ignored/default-excluded directories when an include could match descendants and pruning them otherwise; query Git ignore in bounded NUL-delimited batches for files and before descending ignored directories; classify included files; stable-sort and deeply freeze the final result. A caught failure discards the local accumulation and raises a safe typed error, preserving an existing `SourceScanError` code. Do not add hashing, startup reconciliation, persistence, or CLI flags.

```ts
interface ScanDependencies {
  readonly discoverGitContext: typeof discoverGitContext;
  readonly gitIgnoredPaths: typeof gitIgnoredPaths;
  readonly walkCandidates: typeof walkCandidates;
  readonly classifyFile: typeof classifyFile;
}
export async function scanWithDependencies(
  request: SourceScanRequest,
  dependencies: ScanDependencies,
): Promise<SourceScanResult> {
  const { discoverGitContext, gitIgnoredPaths, walkCandidates, classifyFile } = dependencies;
  const parsedId = EntityIdSchema.safeParse(request?.repositoryId);
  if (!parsedId.success) throw new SourceScanError('INVALID_INPUT', 'Invalid repository ID');
  const repositoryId = parsedId.data;
  const context = await discoverGitContext(request.startingPath, request.workspaceRoot);
  const policy = compilePathPolicy(request.config);
  const files: ScannedFile[] = [];
  const pending: Array<{ absolutePath: string; path: RepositoryRelativePath }> = [];
  const flush = async () => {
    const ignored = await gitIgnoredPaths(context.rootPath, pending.map((entry) => entry.path));
    for (const entry of pending) {
      if (!selectPath(entry.path, policy, ignored.has(entry.path))) continue;
      const observed = await classifyFile(entry.absolutePath, entry.path);
      files.push(Object.freeze({
        path: entry.path,
        languageHint: observed.languageHint,
        classification: Object.freeze(observed.classification),
      }));
    }
    pending.length = 0;
  };
  const mayDescend = async (directory: string) => {
    if (!policy.mayDescend(directory)) return false;
    if (policy.couldIncludeDescendant(directory)) return true;
    const path = RepositoryRelativePathSchema.parse(directory);
    return !(await gitIgnoredPaths(context.rootPath, [path])).has(path);
  };
  for await (const candidate of walkCandidates(context.rootPath, mayDescend)) {
    pending.push(candidate);
    if (pending.length >= 128) await flush();
  }
  if (pending.length > 0) await flush();
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return Object.freeze({
    ...context,
    workspacePosition: Object.freeze(context.workspacePosition),
    repositoryId,
    files: Object.freeze(files),
  });
}
const productionDependencies: ScanDependencies = Object.freeze({
  discoverGitContext, gitIgnoredPaths, walkCandidates, classifyFile,
});
export const scanGitRepository = (request: SourceScanRequest) =>
  scanWithDependencies(request, productionDependencies);
```

- [ ] **Step 4: Register and verify.** Add `packages/source/test/git.test.mjs`, `path-policy.test.mjs`, `walk-classify.test.mjs`, and `source-scan.test.mjs` to root `package.json` test command. Run the four focused suites and verify the `basic-java-repo`, `gitignore`, and `generated-vendor` manifests and expected artifacts. Then run `pnpm verify` when the local toolchain can execute it; if it cannot, run and record the direct equivalent checks without claiming a full verify pass. Run `node scripts/check-architecture.mjs` and the local Prettier checker explicitly.
- [ ] **Step 5: Record task completion and commit.** Update `CURRENT_STATUS.md` with task ID, commit/revision, exact test/Fixture commands and pass counts, schema/migration changes (expected none), limitations, and P05-W2-002 as next task; update the P05-W2-001 traceability row with executable Fixture/test paths. Commit only Task 4 files. Do not mark Phase 0.5 complete from this one task.

## Completion and execution gate

Before claiming P05-W2-001 complete, confirm unit tests, three declared Fixtures, all applicable Quality Gates, architecture guardrail, no early DEFERRED capability, synchronized documentation, and fresh reproducible evidence. If the implementation contradicts an authoritative FROZEN decision or needs a new IR/IPC contract, stop for an ADR/Design Change Proposal. An EVOLVABLE change needs Fixture/Evaluation evidence and synchronized baselines, not weakened tests.
