import fs, { type BigIntStats } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import { EntityIdSchema, type RuntimeRequestControl } from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../../ir/dist/compilation-input-contract.js';

export class OwnedWikiFileError extends Error {
  constructor(
    readonly code: string,
    readonly publicationEffect: 'NOT_COMMITTED' | 'COMMITTED' | 'UNKNOWN' = 'NOT_COMMITTED',
    readonly cleanupState: 'SETTLED' | 'UNKNOWN' = 'SETTLED',
  ) {
    super(code);
    this.name = 'OwnedWikiFileError';
  }
}
export type OwnedWikiDirectory = { directory: string; ownerId: string };
export type OwnedWikiFileArtifact = {
  kind: 'OWNED_TEST_WIKI';
  artifactId: string;
  artifactRevisionId: string;
  createdAt: string;
  projection: Record<string, unknown>;
};
const requireFile = (value: unknown, code = 'OUTPUT_TARGET_CONFLICT'): void => {
  if (!value) throw new OwnedWikiFileError(code);
};
const sha = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const same = (a: BigIntStats, b: BigIntStats): boolean => a.dev === b.dev && a.ino === b.ino;
const sameFile = (a: BigIntStats, b: BigIntStats): boolean =>
  same(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
const regular = (s: BigIntStats): boolean => s.isFile() && !s.isSymbolicLink() && s.nlink === 1n;
const checkControl = (c: RuntimeRequestControl): void => {
  canonicalCompilationJson(null, c);
};
function directories(directory: string): { path: string; stat: BigIntStats }[] {
  const paths: string[] = [];
  let current = directory;
  while (true) {
    paths.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return paths.reverse().map((path) => {
    const stat = fs.lstatSync(path, { bigint: true });
    requireFile(stat.isDirectory() && !stat.isSymbolicLink());
    return { path, stat };
  });
}
function readBounded(
  path: string,
  maxBytes: number,
  guard: () => void,
  control?: RuntimeRequestControl,
): Buffer {
  guard();
  if (control) checkControl(control);
  const before = fs.lstatSync(path, { bigint: true });
  requireFile(regular(before));
  requireFile(before.size <= BigInt(maxBytes), 'ARTIFACT_LIMIT');
  const fd = fs.openSync(path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    requireFile(sameFile(before, fs.fstatSync(fd, { bigint: true })));
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let used = 0;
    while (used < bytes.length) {
      if (control) checkControl(control);
      const n = fs.readSync(fd, bytes, used, bytes.length - used, null);
      if (n === 0) break;
      used += n;
    }
    requireFile(BigInt(used) === before.size, 'ARTIFACT_INVALID');
    requireFile(
      sameFile(before, fs.fstatSync(fd, { bigint: true })) &&
        sameFile(before, fs.lstatSync(path, { bigint: true })),
    );
    guard();
    return bytes.subarray(0, used);
  } finally {
    fs.closeSync(fd);
  }
}
function exists(path: string): boolean {
  try {
    fs.lstatSync(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
}
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  requireFile(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'ARTIFACT_INVALID',
  );
  const r = value as Record<string, unknown>;
  requireFile(Object.keys(r).sort().join('\0') === keys.sort().join('\0'), 'ARTIFACT_INVALID');
  return r;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function parseArtifact(value: unknown, c: RuntimeRequestControl): OwnedWikiFileArtifact {
  const owned = JSON.parse(canonicalCompilationJson(value, c));
  const a = exact(owned, ['kind', 'artifactId', 'artifactRevisionId', 'createdAt', 'projection']);
  requireFile(
    a.kind === 'OWNED_TEST_WIKI' &&
      typeof a.artifactId === 'string' &&
      /^[a-f0-9]{64}$/.test(a.artifactId),
    'ARTIFACT_INVALID',
  );
  EntityIdSchema.parse(a.artifactRevisionId);
  requireFile(
    typeof a.createdAt === 'string' &&
      !Number.isNaN(Date.parse(a.createdAt)) &&
      new Date(a.createdAt).toISOString() === a.createdAt,
    'ARTIFACT_INVALID',
  );
  const p = a.projection as Record<string, unknown>;
  requireFile(
    p &&
      p.kind === 'OWNED_TEST_WIKI' &&
      p.quality === 'NOT_EVALUABLE' &&
      p.productionPublication === 'NOT_AUTHORIZED' &&
      p.canMaterialize === true &&
      (p.status === 'COMPLETE' || p.status === 'PARTIAL'),
    'ARTIFACT_INVALID',
  );
  return freeze(owned as OwnedWikiFileArtifact);
}
export function createOwnedWikiArtifactDirectory(
  control: RuntimeRequestControl,
): OwnedWikiDirectory {
  checkControl(control);
  const base = fs.realpathSync(tmpdir());
  directories(base);
  const directory = fs.mkdtempSync(join(base, 'codeatlas-owned-wiki-')),
    ownerId = randomUUID();
  const file = join(directory, 'owner.json'),
    fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(
      fd,
      JSON.stringify({ schema: 'codeatlas.owned-wiki-files', version: 1, ownerId }),
      'utf8',
    );
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  checkControl(control);
  return Object.freeze({ directory, ownerId });
}
type Pointer = {
  schema: 'codeatlas.owned-wiki-current';
  version: 1;
  ownerId: string;
  artifactId: string;
  artifactRevisionId: string;
  revisionKey: string;
  sha256: string;
};
/** Experimental fresh-temp-root persistence only; not a trusted production outputTarget. */
export class OwnedWikiArtifactFiles {
  readonly #receipt: OwnedWikiDirectory;
  readonly #maxBytes: number;
  readonly #ancestors: { path: string; stat: BigIntStats }[];
  readonly #marker: BigIntStats;
  readonly #ownerText: string;
  #blocked = false;
  readonly #reopened: boolean;
  #inspected = false;
  #lease: { stat: BigIntStats } | null = null;
  constructor(receipt: OwnedWikiDirectory, maxArtifactBytes: number) {
    const d = Object.getOwnPropertyDescriptors(receipt ?? {});
    requireFile(
      d.directory &&
        'value' in d.directory &&
        typeof d.directory.value === 'string' &&
        d.ownerId &&
        'value' in d.ownerId &&
        typeof d.ownerId.value === 'string',
    );
    const directory = d.directory!.value as string,
      ownerId = d.ownerId!.value as string;
    requireFile(
      isAbsolute(directory) &&
        resolve(directory) === directory &&
        dirname(directory) === fs.realpathSync(tmpdir()) &&
        /^codeatlas-owned-wiki-[A-Za-z0-9]+$/.test(basename(directory)) &&
        /^[a-f0-9-]{36}$/.test(ownerId),
    );
    requireFile(Number.isSafeInteger(maxArtifactBytes) && maxArtifactBytes > 0, 'ARTIFACT_LIMIT');
    this.#receipt = Object.freeze({ directory, ownerId });
    this.#maxBytes = maxArtifactBytes;
    this.#ancestors = directories(directory);
    this.#marker = fs.lstatSync(join(directory, 'owner.json'), { bigint: true });
    requireFile(regular(this.#marker));
    this.#ownerText = JSON.stringify({ schema: 'codeatlas.owned-wiki-files', version: 1, ownerId });
    this.guard();
    this.#reopened = exists(this.path('current.json'));
  }
  private path(name: string): string {
    return join(this.#receipt.directory, name);
  }
  private ancestors(): void {
    for (const item of this.#ancestors) {
      const s = fs.lstatSync(item.path, { bigint: true });
      requireFile(s.isDirectory() && !s.isSymbolicLink() && same(item.stat, s));
    }
  }
  private guard(): void {
    this.ancestors();
    const marker = readBounded(this.path('owner.json'), Buffer.byteLength(this.#ownerText), () =>
      this.ancestors(),
    );
    requireFile(
      marker.toString('utf8') === this.#ownerText &&
        sameFile(this.#marker, fs.lstatSync(this.path('owner.json'), { bigint: true })),
    );
    if (this.#lease && !this.#blocked)
      requireFile(
        sameFile(this.#lease.stat, fs.lstatSync(this.path('writer.lock'), { bigint: true })) &&
          regular(fs.lstatSync(this.path('writer.lock'), { bigint: true })),
      );
  }
  private text(name: string, c: RuntimeRequestControl): string {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      readBounded(this.path(name), this.#maxBytes, () => this.guard(), c),
    );
  }
  private envelope(
    key: string,
    c: RuntimeRequestControl,
  ): { artifact: OwnedWikiFileArtifact; text: string } {
    requireFile(/^[a-f0-9]{64}$/.test(key));
    const text = this.text('revision-' + key + '.json', c);
    const e = exact(JSON.parse(text), [
      'schema',
      'version',
      'ownerId',
      'artifactSha256',
      'artifact',
    ]);
    requireFile(
      e.schema === 'codeatlas.owned-wiki-revision' &&
        e.version === 1 &&
        e.ownerId === this.#receipt.ownerId,
      'ARTIFACT_INVALID',
    );
    const artifact = parseArtifact(e.artifact, c);
    requireFile(
      sha(artifact.artifactRevisionId) === key &&
        e.artifactSha256 === sha(canonicalCompilationJson(artifact, c)),
      'ARTIFACT_INVALID',
    );
    return { artifact, text };
  }
  readCurrent(control: RuntimeRequestControl): OwnedWikiFileArtifact | null {
    this.guard();
    checkControl(control);
    if (!exists(this.path('current.json'))) return null;
    const p = exact(JSON.parse(this.text('current.json', control)), [
      'schema',
      'version',
      'ownerId',
      'artifactId',
      'artifactRevisionId',
      'revisionKey',
      'sha256',
    ]) as Pointer;
    requireFile(
      p.schema === 'codeatlas.owned-wiki-current' &&
        p.version === 1 &&
        p.ownerId === this.#receipt.ownerId &&
        typeof p.revisionKey === 'string' &&
        /^[a-f0-9]{64}$/.test(p.revisionKey),
      'ARTIFACT_INVALID',
    );
    const e = this.envelope(p.revisionKey, control);
    requireFile(
      sha(e.text) === p.sha256 &&
        e.artifact.artifactId === p.artifactId &&
        e.artifact.artifactRevisionId === p.artifactRevisionId,
      'ARTIFACT_INVALID',
    );
    this.guard();
    checkControl(control);
    if (!exists(this.path('pending.json')) && !exists(this.path('writer.lock')))
      this.#inspected = true;
    return e.artifact;
  }
  readRevision(artifactRevisionId: string, control: RuntimeRequestControl): OwnedWikiFileArtifact {
    this.guard();
    checkControl(control);
    EntityIdSchema.parse(artifactRevisionId);
    const e = this.envelope(sha(artifactRevisionId), control);
    requireFile(e.artifact.artifactRevisionId === artifactRevisionId, 'ARTIFACT_INVALID');
    return e.artifact;
  }
  private write(name: string, text: string, c: RuntimeRequestControl): BigIntStats {
    this.guard();
    checkControl(c);
    requireFile(Buffer.byteLength(text) <= this.#maxBytes, 'ARTIFACT_LIMIT');
    const fd = fs.openSync(this.path(name), 'wx', 0o600);
    try {
      try {
        fs.writeFileSync(fd, text, 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      const stat = fs.lstatSync(this.path(name), { bigint: true });
      requireFile(regular(stat));
      requireFile(this.text(name, c) === text, 'ARTIFACT_INVALID');
      return stat;
    } catch {
      this.#blocked = true;
      throw new OwnedWikiFileError('ARTIFACT_IO_UNKNOWN', 'NOT_COMMITTED', 'UNKNOWN');
    }
  }
  private removeOwned(name: string, stat: BigIntStats): void {
    this.guard();
    const now = fs.lstatSync(this.path(name), { bigint: true });
    requireFile(regular(now) && sameFile(stat, now));
    fs.unlinkSync(this.path(name));
  }
  commit(
    value: unknown,
    expectedCurrentRevisionId: string | null,
    control: RuntimeRequestControl,
  ): {
    effect: 'COMMITTED' | 'UNCHANGED';
    artifact: OwnedWikiFileArtifact;
    cleanupState: 'SETTLED' | 'UNKNOWN';
  } {
    if (this.#blocked)
      throw new OwnedWikiFileError('ARTIFACT_WRITER_BLOCKED', 'UNKNOWN', 'UNKNOWN');
    if (this.#lease) throw new OwnedWikiFileError('OUTPUT_TARGET_CONFLICT');
    const artifact = parseArtifact(value, control),
      artifactText = canonicalCompilationJson(artifact, control);
    requireFile(Buffer.byteLength(artifactText) <= this.#maxBytes, 'ARTIFACT_LIMIT');
    this.guard();
    if (exists(this.path('pending.json'))) {
      this.#blocked = true;
      throw new OwnedWikiFileError('ARTIFACT_WRITER_BLOCKED', 'UNKNOWN', 'UNKNOWN');
    }
    requireFile(!this.#reopened || this.#inspected, 'ARTIFACT_INSPECTION_REQUIRED');
    if (expectedCurrentRevisionId !== null) EntityIdSchema.parse(expectedCurrentRevisionId);
    let pending: BigIntStats | null = null,
      renameAttempted = false,
      committed = false,
      result: {
        effect: 'COMMITTED' | 'UNCHANGED';
        artifact: OwnedWikiFileArtifact;
        cleanupState: 'SETTLED' | 'UNKNOWN';
      } | null = null;
    const temps: { name: string; stat: BigIntStats }[] = [];
    try {
      const lockText = JSON.stringify({ ownerId: this.#receipt.ownerId, attemptId: randomUUID() });
      try {
        const stat = this.write('writer.lock', lockText, control);
        this.#lease = { stat };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST')
          throw new OwnedWikiFileError('OUTPUT_TARGET_CONFLICT');
        throw e;
      }
      const current = this.readCurrent(control);
      if (current?.artifactRevisionId === artifact.artifactRevisionId) {
        requireFile(canonicalCompilationJson(current, control) === artifactText);
        result = { effect: 'UNCHANGED', artifact: current, cleanupState: 'SETTLED' };
      } else {
        requireFile(
          (current?.artifactRevisionId ?? null) === expectedCurrentRevisionId &&
            (!current || current.artifactId === artifact.artifactId),
        );
        const key = sha(artifact.artifactRevisionId),
          name = 'revision-' + key + '.json';
        requireFile(!exists(this.path(name)));
        const revisionText = canonicalCompilationJson(
          {
            schema: 'codeatlas.owned-wiki-revision',
            version: 1,
            ownerId: this.#receipt.ownerId,
            artifactSha256: sha(artifactText),
            artifact,
          },
          control,
        );
        requireFile(Buffer.byteLength(revisionText) <= this.#maxBytes, 'ARTIFACT_LIMIT');
        pending = this.write(
          'pending.json',
          JSON.stringify({
            ownerId: this.#receipt.ownerId,
            revisionKey: key,
            expectedCurrentRevisionId,
          }),
          control,
        );
        const temporary = 'temporary-' + randomUUID() + '.json',
          stat = this.write(temporary, revisionText, control);
        temps.push({ name: temporary, stat });
        this.guard();
        checkControl(control);
        // link is atomic create-if-absent: it cannot overwrite an immutable version.
        fs.linkSync(this.path(temporary), this.path(name));
        fs.unlinkSync(this.path(temporary));
        temps.pop();
        requireFile(this.envelope(key, control).text === revisionText, 'ARTIFACT_INVALID');
        const pointer: Pointer = {
          schema: 'codeatlas.owned-wiki-current',
          version: 1,
          ownerId: this.#receipt.ownerId,
          artifactId: artifact.artifactId,
          artifactRevisionId: artifact.artifactRevisionId,
          revisionKey: key,
          sha256: sha(revisionText),
        };
        const pointerText = canonicalCompilationJson(pointer, control),
          pointerName = 'temporary-' + randomUUID() + '.json',
          pointerStat = this.write(pointerName, pointerText, control);
        temps.push({ name: pointerName, stat: pointerStat });
        this.guard();
        checkControl(control);
        renameAttempted = true;
        fs.renameSync(this.path(pointerName), this.path('current.json'));
        committed = true;
        result = { effect: 'COMMITTED', artifact, cleanupState: 'SETTLED' };
        temps.pop();
        const observed = this.readCurrent(control);
        requireFile(
          observed?.artifactRevisionId === artifact.artifactRevisionId &&
            canonicalCompilationJson(observed, control) === artifactText,
          'ARTIFACT_INVALID',
        );
      }
    } catch (error) {
      if (committed && result) {
        this.#blocked = true;
        result.cleanupState = 'UNKNOWN';
      } else if (renameAttempted) {
        this.#blocked = true;
        throw new OwnedWikiFileError('ARTIFACT_COMMIT_UNKNOWN', 'UNKNOWN', 'UNKNOWN');
      } else throw error;
    } finally {
      try {
        // Preserve the pending attempt after an uncertain pointer outcome, including across reopen.
        if (!this.#blocked) {
          for (const temp of temps) this.removeOwned(temp.name, temp.stat);
          if (pending) this.removeOwned('pending.json', pending);
        }
        if (this.#lease) {
          const lease = this.#lease;
          this.removeOwned('writer.lock', lease.stat);
          this.#lease = null;
        }
      } catch {
        this.#blocked = true;
        if (committed && result) result.cleanupState = 'UNKNOWN';
        else if (!renameAttempted)
          throw new OwnedWikiFileError('ARTIFACT_CLEANUP_UNKNOWN', 'NOT_COMMITTED', 'UNKNOWN');
      }
    }
    requireFile(result !== null, 'ARTIFACT_INVALID');
    return result!;
  }
}
