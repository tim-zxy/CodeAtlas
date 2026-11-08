import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { loadMigrationPlan } from '../dist/migrations/manifest.js';
import { applyMigrationPlan } from '../dist/migrations/runner.js';
const plan = await loadMigrationPlan(
  new URL('../migrations/workspace/manifest.json', import.meta.url),
  'WORKSPACE',
);
const api = await import('../dist/documents/document-store.js');
const limits = {
  maxRows: 10000,
  maxSerializedBytes: 2_000_000,
  maxItems: 200000,
  maxDepth: 80,
  memoryBudgetBytes: 20_000_000,
};
function bundle(id = 'rev:one', text = 'hello', fingerprint = 'a') {
  const range = {
    documentRevisionId: id,
    startLine: 0,
    startColumn: 0,
    endLine: 0,
    endColumn: text.length,
  };
  return {
    schema: 'codeatlas.document-bundle',
    version: 1,
    payload: {
      document: {
        id: 'doc:one',
        workspaceId: 'ws:one',
        repositoryId: 'repo:one',
        logicalPath: 'docs/note.md',
        mediaType: 'text/markdown',
        sourceKind: 'MARKDOWN',
        currentRevisionId: null,
      },
      revision: {
        id,
        documentId: 'doc:one',
        sourceFingerprint: 'sha256:' + fingerprint.repeat(64),
        parserVersion: 'literal-v1',
        policyVersion: 'block-secret-v1',
        sourceBasis: {
          repositoryId: 'repo:one',
          revisionId: 'source:one',
          contentFingerprint: 'sha256:' + 'b'.repeat(64),
          codeActivationDigest: 'c'.repeat(64),
        },
        blockRefs: [{ kind: 'DOCUMENT_BLOCK', id: 'block:one', revisionId: id }],
        diagnostics: [],
        completeness: 'COMPLETE',
      },
      externalRefs: [],
      supportInventory: [],
      sections: [],
      blocks: [
        {
          id: 'block:one',
          documentRevisionId: id,
          sectionId: null,
          ordinal: 0,
          sourceRange: range,
          kind: 'PARAGRAPH',
          payload: { text },
        },
      ],
      tables: [],
      links: [],
      codeSnippets: [],
      mentions: [],
      chunks: [],
      claims: [],
    },
  };
}
function setup(t, file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys=ON');
  applyMigrationPlan(db, plan);
  db.exec(
    "INSERT INTO workspace VALUES(1,'ws:one','/owned');INSERT INTO repositories VALUES('repo:one','ws:one','/owned/repo')",
  );
  t.after(() => {
    if (db.isOpen) db.close();
  });
  return { db, store: new api.DocumentStore(db, 'ws:one') };
}
const apply = (store, b = bundle(), expected = null, check = () => {}) =>
  store.applyDocuments({ bundle: b, expectedCurrentRevisionId: expected }, limits, check);
const image = (db) =>
  [
    'documents',
    'document_revisions',
    'document_sections',
    'document_blocks',
    'document_links',
    'claims',
    'claim_evidence',
  ].map((n) => db.prepare('SELECT * FROM ' + n + ' ORDER BY rowid').all());
test('private DocumentStore draft API exists', () =>
  assert.equal(typeof api.DocumentStore, 'function'));
test('complete bundle activates atomically; revision and normalized block persist', (t) => {
  const { db, store } = setup(t);
  const r = apply(store);
  assert.equal(r.status, 'COMMITTED');
  assert.equal(r.revisionId, 'rev:one');
  assert.equal(r.reused, false);
  assert.equal(db.prepare('SELECT current_revision_id id FROM documents').get().id, 'rev:one');
  assert.equal(db.prepare('SELECT count(*) n FROM document_blocks').get().n, 1);
  assert.deepEqual(
    store.readCurrent('doc:one', limits).bundle.payload.blocks,
    bundle().payload.blocks,
  );
});
test('same tuple proposed revision ID reuses actual old ID with no revision rewrite', (t) => {
  const { db, store } = setup(t);
  apply(store);
  const before = image(db);
  const r = apply(store, bundle('rev:proposed'), 'rev:one');
  assert.equal(r.revisionId, 'rev:one');
  assert.equal(r.reused, true);
  assert.deepEqual(image(db), before);
});
for (const [label, change] of [
  [
    'payload',
    (b) => {
      b.payload.blocks[0].payload.text = 'changed';
    },
  ],
  [
    'provenance',
    (b) => {
      b.payload.revision.sourceBasis.revisionId = 'source:other';
    },
  ],
  [
    'entity IDs',
    (b) => {
      b.payload.blocks[0].id = 'block:other';
      b.payload.revision.blockRefs[0].id = 'block:other';
    },
  ],
])
  test('same tuple different ' + label + ' refuses and keeps rows', (t) => {
    const { db, store } = setup(t);
    apply(store);
    const before = image(db),
      b = bundle('rev:proposed');
    change(b);
    assert.throws(() => apply(store, b, 'rev:one'), {
      code: 'DOCUMENT_TUPLE_CONFLICT',
    });
    assert.deepEqual(image(db), before);
  });
test('second writer CAS refuses and preserves last good', (t) => {
  const { db, store } = setup(t);
  apply(store);
  const before = image(db);
  assert.throws(() => apply(store, bundle('rev:two', 'new', 'd'), null), {
    code: 'DOCUMENT_HEAD_CHANGED',
  });
  assert.deepEqual(image(db), before);
});
test('PARTIAL has no writes, even when no document exists', (t) => {
  const { db, store } = setup(t);
  const b = bundle();
  b.payload.revision.completeness = 'PARTIAL';
  const before = image(db);
  assert.equal(apply(store, b).status, 'NOT_COMMITTED');
  assert.deepEqual(image(db), before);
});
test('workspace and repository membership rejects foreign binding', (t) => {
  const { db, store } = setup(t);
  const b = bundle();
  b.payload.document.workspaceId = 'ws:foreign';
  assert.throws(() => apply(store, b), { code: 'DOCUMENT_SCOPE_CHANGED' });
});
test('unknown repository foreign key does not create a document', (t) => {
  const { db, store } = setup(t);
  const b = bundle();
  b.payload.document.repositoryId = 'repo:absent';
  b.payload.revision.sourceBasis.repositoryId = 'repo:absent';
  assert.throws(() => apply(store, b), { code: 'DOCUMENT_SCOPE_CHANGED' });
  assert.equal(db.prepare('SELECT count(*) n FROM documents').get().n, 0);
});
test('claims nonempty explicitly unsupported before publication', (t) => {
  const { db, store } = setup(t);
  const b = bundle();
  b.payload.claims = [{}];
  assert.throws(() => apply(store, b), { code: 'DOCUMENT_CLAIMS_UNSUPPORTED' });
  assert.equal(db.prepare('SELECT count(*) n FROM claims').get().n, 0);
});
test('incomplete structural closure refuses with no rows', (t) => {
  const { db, store } = setup(t);
  const b = bundle();
  b.payload.revision.blockRefs[0].id = 'absent';
  assert.throws(() => apply(store, b));
  assert.equal(db.prepare('SELECT count(*) n FROM documents').get().n, 0);
});
test('foreign current revision pointer and immutable SQL rows refused', (t) => {
  const { db, store } = setup(t);
  apply(store);
  assert.throws(() => db.exec("UPDATE documents SET current_revision_id='absent'"));
  assert.throws(() => db.exec("UPDATE document_revisions SET parser_version='mutated'"));
  assert.throws(() => db.exec('DELETE FROM document_blocks'));
  assert.throws(() =>
    db.exec(
      "INSERT INTO documents(id,workspace_id,repository_id,logical_path,media_type,source_kind) VALUES('doc:other','missing',NULL,'x.md','text/markdown','MARKDOWN')",
    ),
  );
});
test('beforeCommit refusal rolls back inserted rows and old pointer remains', (t) => {
  const { db, store } = setup(t);
  apply(store);
  const before = image(db);
  let calls = 0;
  assert.throws(
    () =>
      apply(store, bundle('rev:two', 'new', 'd'), 'rev:one', () => {
        if (++calls === 2) throw Error('control-stop');
      }),
    /control-stop/,
  );
  assert.equal(calls, 2);
  assert.deepEqual(image(db), before);
});
for (const [name, fn] of [
  ['async', async () => {}],
  ['Promise', () => Promise.resolve()],
  [
    'thenable',
    () => ({
      then() {
        throw Error('must-not-call');
      },
    }),
  ],
])
  test('synchronous check rejects ' + name + ' without adopting async authority', (t) => {
    const { db, store } = setup(t);
    const before = image(db);
    assert.throws(() => apply(store, bundle(), null, fn), {
      code: 'DOCUMENT_SYNC_CHECK_REQUIRED',
    });
    assert.deepEqual(image(db), before);
  });
test('COMMIT acknowledgement error reports UNKNOWN, real commit not retried', (t) => {
  const { db, store } = setup(t);
  const exec = db.exec;
  let commits = 0;
  db.exec = function (sql) {
    const v = exec.call(this, sql);
    if (sql === 'COMMIT') {
      commits++;
      throw Error('lost-ack');
    }
    return v;
  };
  const r = apply(store);
  assert.equal(r.status, 'COMMIT_OUTCOME_UNKNOWN');
  assert.equal(commits, 1);
  assert.equal(db.prepare('SELECT current_revision_id id FROM documents').get().id, 'rev:one');
});
test('COMMIT error with transaction still active rolls back and remains UNKNOWN', (t) => {
  const { db, store } = setup(t);
  const exec = db.exec;
  db.exec = function (sql) {
    if (sql === 'COMMIT') throw Error('pre-commit-failure');
    return exec.call(this, sql);
  };
  assert.equal(apply(store).status, 'COMMIT_OUTCOME_UNKNOWN');
  assert.equal(db.isTransaction, false);
  assert.equal(db.prepare('SELECT count(*) n FROM documents').get().n, 0);
});
test('caller outer transaction is never committed or rolled back by Store', (t) => {
  const { db, store } = setup(t);
  db.exec('BEGIN');
  assert.throws(() => apply(store), { code: 'DOCUMENT_TRANSACTION_ACTIVE' });
  assert.equal(db.isTransaction, true);
  db.exec('ROLLBACK');
});
test('explicit bounds refuse before writes', (t) => {
  const { db, store } = setup(t);
  assert.throws(() =>
    store.applyDocuments(
      { bundle: bundle(), expectedCurrentRevisionId: null },
      { ...limits, maxItems: 1 },
      () => {},
    ),
  );
  assert.equal(db.prepare('SELECT count(*) n FROM documents').get().n, 0);
});
test('reopen retains last good and new complete revision updates history', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'codeatlas-document-store-draft-'));
  let reopened;
  t.after(() => {
    if (reopened?.isOpen) reopened.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const { db, store } = setup(t, join(dir, 'owned.sqlite'));
  apply(store);
  db.close();
  reopened = new DatabaseSync(join(dir, 'owned.sqlite'));
  reopened.exec('PRAGMA foreign_keys=ON');
  const s = new api.DocumentStore(reopened, 'ws:one');
  assert.equal(s.readCurrent('doc:one', limits).revisionId, 'rev:one');
  assert.equal(apply(s, bundle('rev:two', 'new', 'd'), 'rev:one').status, 'COMMITTED');
  assert.equal(reopened.prepare('SELECT count(*) n FROM document_revisions').get().n, 2);
});

test('sync checker cannot swap expected head by mutating caller input', (t) => {
  const { db, store } = setup(t);
  apply(store);
  const input = {
    bundle: bundle('rev:two', 'new', 'd'),
    expectedCurrentRevisionId: null,
  };
  assert.throws(
    () =>
      store.applyDocuments(input, limits, () => {
        input.expectedCurrentRevisionId = 'rev:one';
      }),
    { code: 'DOCUMENT_HEAD_CHANGED' },
  );
  assert.equal(db.prepare('SELECT current_revision_id id FROM documents').get().id, 'rev:one');
});
test('readCurrent refuses extra normalized rows inconsistent with immutable bundle', (t) => {
  const { db, store } = setup(t);
  apply(store);
  db.prepare('INSERT INTO document_blocks VALUES(?,?,?,?,?)').run(
    'rev:one',
    'block:forged',
    null,
    9,
    JSON.stringify({ untrusted: true }),
  );
  assert.throws(() => store.readCurrent('doc:one', limits), {
    code: 'DOCUMENT_STORAGE_CORRUPT',
  });
});

test('connection with disabled FK checks cannot instantiate Store', (t) => {
  const { db } = setup(t);
  db.exec('PRAGMA foreign_keys=OFF');
  assert.throws(() => new api.DocumentStore(db, 'ws:one'), {
    code: 'DOCUMENT_FOREIGN_KEYS_REQUIRED',
  });
});
test('Promise returned only at final synchronous check rolls back all writes', (t) => {
  const { db, store } = setup(t);
  let n = 0;
  assert.throws(
    () => apply(store, bundle(), null, () => (++n === 2 ? Promise.resolve() : undefined)),
    { code: 'DOCUMENT_SYNC_CHECK_REQUIRED' },
  );
  assert.equal(n, 2);
  assert.equal(db.prepare('SELECT count(*) n FROM documents').get().n, 0);
});

test('W008 keeps governing Claim columns without invented publication state', (t) => {
  const { db } = setup(t);
  const names = db
    .prepare('PRAGMA table_info(claims)')
    .all()
    .map((r) => r.name);
  for (const n of ['subject_json', 'predicate', 'value_json', 'scope_json', 'confidence_json'])
    assert.ok(names.includes(n), n);
  assert.equal(names.includes('publication_state'), false);
});

test('unknown future schema rejects constructor/apply/read without broad >= support', (t) => {
  const { db, store } = setup(t);
  db.exec('PRAGMA user_version=9');
  assert.throws(() => new api.DocumentStore(db, 'ws:one'), { code: 'DOCUMENT_SCHEMA_UNSUPPORTED' });
  assert.throws(() => apply(store), { code: 'DOCUMENT_SCHEMA_UNSUPPORTED' });
  assert.throws(() => store.readCurrent('doc:one', limits), {
    code: 'DOCUMENT_SCHEMA_UNSUPPORTED',
  });
});

test('tuple reuse correctly rebinds local resolved document link references', (t) => {
  const { store } = setup(t);
  const linked = (id) => {
    const b = bundle(id);
    const ref = { kind: 'DOCUMENT_BLOCK', id: 'block:one', revisionId: id };
    b.payload.links.push({
      id: 'link:one',
      documentRevisionId: id,
      blockRef: ref,
      sourceRange: b.payload.blocks[0].sourceRange,
      typedContent: {
        label: 'self',
        target: '#self',
        resolution: 'RESOLVED',
        targetRef: { scope: 'WORKSPACE', workspaceId: 'ws:one', entity: ref },
        candidates: [],
      },
    });
    return b;
  };
  apply(store, linked('rev:one'));
  assert.equal(apply(store, linked('rev:two'), 'rev:one').reused, true);
});
test('tuple reuse never aliases an external entity merely because its opaque ID collides', (t) => {
  const { store } = setup(t);
  const first = bundle();
  first.payload.externalRefs.push({
    scope: 'WORKSPACE',
    workspaceId: 'ws:one',
    entity: { kind: 'CODE_NODE', id: 'block:one', revisionId: 'rev:one' },
  });
  apply(store, first);
  const next = bundle('rev:two');
  next.payload.externalRefs.push({
    scope: 'WORKSPACE',
    workspaceId: 'ws:one',
    entity: { kind: 'CODE_NODE', id: 'block:one', revisionId: 'rev:two' },
  });
  assert.throws(() => apply(store, next, 'rev:one'), { code: 'DOCUMENT_TUPLE_CONFLICT' });
});
test('rejected Promise from synchronous guard is refused without unhandled child failure', async () => {
  const { spawnSync } = await import('node:child_process');
  const moduleUrl = new URL('../dist/documents/document-store.js', import.meta.url).href;
  const loaderUrl = new URL('../dist/migrations/manifest.js', import.meta.url).href;
  const runnerUrl = new URL('../dist/migrations/runner.js', import.meta.url).href;
  const manifestUrl = new URL('../migrations/workspace/manifest.json', import.meta.url).href;
  const code = `import {DatabaseSync} from 'node:sqlite';import {DocumentStore} from ${JSON.stringify(moduleUrl)};
 import {loadMigrationPlan} from ${JSON.stringify(loaderUrl)};import {applyMigrationPlan} from ${JSON.stringify(runnerUrl)};
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');applyMigrationPlan(db,await loadMigrationPlan(new URL(${JSON.stringify(manifestUrl)}),'WORKSPACE'));
 db.exec("INSERT INTO workspace VALUES(1,'ws:one','/owned');INSERT INTO repositories VALUES('repo:one','ws:one','/owned/repo')");
 const make=${bundle.toString()};try{new DocumentStore(db,'ws:one').applyDocuments({bundle:make(),expectedCurrentRevisionId:null},${JSON.stringify(limits)},()=>Promise.reject(new Error('invalid async guard')));process.exitCode=5;}
 catch(e){if(e.code!=='DOCUMENT_SYNC_CHECK_REQUIRED')throw e;}finally{db.close();}await new Promise(r=>setImmediate(r));`;
  const env = {};
  for (const key of ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'])
    if (process.env[key]) env[key] = process.env[key];
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '--unhandled-rejections=strict', '-e', code],
    { encoding: 'utf8', env, windowsHide: true, timeout: 10000 },
  );
  assert.equal(child.status, 0, child.stderr || String(child.error));
});

test('read request includes schema and FK admission deliveries in its row budget', (t) => {
  const { store } = setup(t);
  assert.throws(() => store.readCurrent('absent', { ...limits, maxRows: 3 }), {
    code: 'HISTORY_LIMIT_EXCEEDED',
  });
});
test('apply request counts workspace and repository membership deliveries before writes', (t) => {
  const { db, store } = setup(t);
  assert.throws(
    () =>
      store.applyDocuments(
        { bundle: bundle(), expectedCurrentRevisionId: null },
        { ...limits, maxRows: 10 },
        () => {},
      ),
    { code: 'HISTORY_LIMIT_EXCEEDED' },
  );
  assert.equal(db.prepare('SELECT count(*) n FROM documents').get().n, 0);
});

test('tight item budget refuses before allocating the revision-rebinding clone', (t) => {
  const { store } = setup(t);
  const original = globalThis.structuredClone;
  let copies = 0;
  globalThis.structuredClone = (...args) => {
    copies++;
    return original(...args);
  };
  try {
    assert.throws(
      () =>
        store.applyDocuments(
          { bundle: bundle(), expectedCurrentRevisionId: null },
          { ...limits, maxItems: 180 },
          () => {},
        ),
      { code: 'HISTORY_LIMIT_EXCEEDED' },
    );
    assert.equal(copies, 0);
  } finally {
    globalThis.structuredClone = original;
  }
});
for (const column of ['normalized-ordinal', 'revision-tuple', 'document-locator'])
  test('readCurrent rejects conflicting persisted ' + column, (t) => {
    const { db, store } = setup(t);
    apply(store);
    if (column === 'normalized-ordinal') {
      db.exec('DROP TRIGGER document_blocks_immutable_update');
      db.prepare('UPDATE document_blocks SET ordinal=7').run();
    }
    if (column === 'revision-tuple') {
      db.exec('DROP TRIGGER document_revisions_immutable_update');
      db.prepare("UPDATE document_revisions SET parser_version='forged'").run();
    }
    if (column === 'document-locator') {
      db.exec('DROP TRIGGER document_identity_update');
      db.prepare("UPDATE documents SET logical_path='different.md'").run();
    }
    assert.throws(() => store.readCurrent('doc:one', limits), { code: 'DOCUMENT_STORAGE_CORRUPT' });
  });

for (const change of ['schema', 'foreign-keys'])
  test('transaction snapshot refuses ' + change + ' changed by the preflight guard', (t) => {
    const { db, store } = setup(t);
    let calls = 0;
    assert.throws(
      () =>
        apply(store, bundle(), null, () => {
          if (++calls === 1)
            db.exec(change === 'schema' ? 'PRAGMA user_version=9' : 'PRAGMA foreign_keys=OFF');
        }),
      {
        code:
          change === 'schema' ? 'DOCUMENT_SCHEMA_UNSUPPORTED' : 'DOCUMENT_FOREIGN_KEYS_REQUIRED',
      },
    );
    assert.equal(db.isTransaction, false);
    assert.equal(db.prepare('SELECT count(*) n FROM documents').get().n, 0);
  });

test('pinned historical DocumentRevision survives a changed current head without fallback', (t) => {
  const { db, store } = setup(t);
  apply(store);
  apply(store, bundle('rev:two', 'world', 'b'), 'rev:one');
  let checks = 0;
  const old = store.readRevision('doc:one', 'rev:one', limits, () => {
    checks++;
  });
  assert.equal(old.revisionId, 'rev:one');
  assert.equal(old.bundle.payload.blocks[0].payload.text, 'hello');
  assert.ok(Object.isFrozen(old.bundle.payload.blocks[0]));
  assert.ok(checks > 1);
  assert.equal(store.readCurrent('doc:one', limits).revisionId, 'rev:two');
  assert.equal(
    store.readRevision('doc:one', 'rev:missing', limits, () => {}),
    null,
  );
  assert.equal(
    store.readRevision('doc:foreign', 'rev:one', limits, () => {}),
    null,
  );
  assert.equal(db.isTransaction, false);
});
test('historical read requires synchronous control and cancels without writes or open snapshot', (t) => {
  const { db, store } = setup(t);
  apply(store);
  const before = image(db);
  for (const control of [
    undefined,
    async () => {},
    () => Promise.resolve(),
    () => ({ then() {} }),
  ]) {
    assert.throws(() => store.readRevision('doc:one', 'rev:one', limits, control), {
      code: 'DOCUMENT_SYNC_CHECK_REQUIRED',
    });
    assert.equal(db.isTransaction, false);
  }
  let calls = 0;
  assert.throws(
    () =>
      store.readRevision('doc:one', 'rev:one', limits, () => {
        if (++calls === 4) throw Object.assign(Error('cancel'), { code: 'CANCELLED' });
      }),
    { code: 'CANCELLED' },
  );
  assert.equal(db.isTransaction, false);
  assert.deepEqual(image(db), before);
  assert.equal(store.readRevision('doc:one', 'rev:one', limits, () => {}).revisionId, 'rev:one');
});
test('readCurrent accepts final cancellation without returning stale result', (t) => {
  const { db, store } = setup(t);
  apply(store);
  assert.throws(
    () =>
      store.readCurrent('doc:one', limits, () => {
        throw Object.assign(Error('cancel'), { code: 'CANCELLED' });
      }),
    { code: 'CANCELLED' },
  );
  assert.equal(db.isTransaction, false);
});
test('historical read retains corruption and explicit bounds refusal', (t) => {
  const { db, store } = setup(t);
  apply(store);
  assert.throws(() =>
    store.readRevision('doc:one', 'rev:one', { ...limits, maxRows: 1 }, () => {}),
  );
  assert.equal(db.isTransaction, false);
  db.exec('DROP TRIGGER document_blocks_immutable_update');
  db.exec('UPDATE document_blocks SET ordinal=99');
  assert.throws(() => store.readRevision('doc:one', 'rev:one', limits, () => {}), {
    code: 'DOCUMENT_STORAGE_CORRUPT',
  });
  assert.equal(db.isTransaction, false);
});

test('read cancellation inside SQLite snapshot rolls back before returning any historical data', (t) => {
  const { db, store } = setup(t);
  apply(store);
  assert.throws(
    () =>
      store.readRevision('doc:one', 'rev:one', limits, () => {
        if (db.isTransaction) throw Object.assign(Error('cancel'), { code: 'CANCELLED' });
      }),
    { code: 'CANCELLED' },
  );
  assert.equal(db.isTransaction, false);
  let count = 0;
  store.readCurrent('doc:one', limits, () => {
    count++;
  });
  let next = 0;
  assert.throws(
    () =>
      store.readCurrent('doc:one', limits, () => {
        if (++next === count) {
          assert.equal(db.isTransaction, true);
          throw Object.assign(Error('cancel'), { code: 'CANCELLED' });
        }
      }),
    { code: 'CANCELLED' },
  );
  assert.equal(db.isTransaction, false);
});
test('read control cannot make Store adopt or finish a newly opened caller transaction', (t) => {
  const { db, store } = setup(t);
  apply(store);
  let opened = false;
  assert.throws(
    () =>
      store.readRevision('doc:one', 'rev:one', limits, () => {
        if (!opened) {
          db.exec('BEGIN');
          opened = true;
        }
      }),
    { code: 'DOCUMENT_TRANSACTION_ACTIVE' },
  );
  assert.equal(db.isTransaction, true);
  db.exec('ROLLBACK');
});

function secondDocument(id = 'rev:b1', text = 'world', fingerprint = 'b') {
  const b = bundle(id, text, fingerprint);
  b.payload.document.id = 'doc:two';
  b.payload.document.logicalPath = 'docs/second.md';
  b.payload.revision.documentId = 'doc:two';
  return b;
}
test('batch current reads share a real SQLite WAL snapshot despite concurrent head update', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'codeatlas-doc-batch-'));
  t.after(() => {
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('codeatlas-doc-batch-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const file = join(directory, 'owned.sqlite');
  const { db, store } = setup(t, file);
  let writer;
  try {
    db.exec('PRAGMA journal_mode=WAL');
    apply(store);
    apply(store, secondDocument());
    writer = new DatabaseSync(file);
    writer.exec('PRAGMA foreign_keys=ON');
    const other = new api.DocumentStore(writer, 'ws:one');
    const original = db.prepare.bind(db);
    let changed = false;
    db.prepare = (sql) => {
      const statement = original(sql);
      if (sql.startsWith('SELECT "id","workspace_id"') && sql.includes('FROM "documents"')) {
        const all = statement.all.bind(statement);
        statement.all = (...args) => {
          const rows = all(...args);
          if (args[0] === 'doc:one' && !changed) {
            changed = true;
            apply(other, secondDocument('rev:b2', 'later', 'c'), 'rev:b1');
          }
          return rows;
        };
      }
      return statement;
    };
    const before = db.prepare('SELECT total_changes() n').get().n;
    const values = store.readCurrentBatch(['doc:one', 'doc:two'], limits, () => {});
    assert.equal(changed, true);
    assert.deepEqual(
      values.map((v) => v.revisionId),
      ['rev:one', 'rev:b1'],
    );
    assert.equal(values[1].bundle.payload.blocks[0].payload.text, 'world');
    assert.ok(
      Object.isFrozen(values) && Object.isFrozen(values[1]) && Object.isFrozen(values[1].bundle),
    );
    assert.equal(db.prepare('SELECT total_changes() n').get().n, before);
    assert.equal(db.isTransaction, false);
    assert.equal(store.readCurrent('doc:two', limits).revisionId, 'rev:b2');
  } finally {
    if (writer?.isOpen) writer.close();
    if (db.isOpen) db.close();
  }
});
test('batch missing required document refuses whole result, preserves existing single read and caller order', (t) => {
  const { db, store } = setup(t);
  apply(store);
  apply(store, secondDocument());
  assert.throws(() => store.readCurrentBatch(['doc:one', 'doc:missing'], limits, () => {}), {
    code: 'DOCUMENT_REQUIRED_DOCUMENT_MISSING',
  });
  assert.equal(db.isTransaction, false);
  assert.deepEqual(
    store.readCurrentBatch(['doc:two', 'doc:one'], limits, () => {}).map((v) => v.revisionId),
    ['rev:b1', 'rev:one'],
  );
  assert.equal(store.readCurrent('doc:one', limits).revisionId, 'rev:one');
  const empty = store.readCurrentBatch([], limits, () => {});
  assert.deepEqual(empty, []);
  assert.ok(Object.isFrozen(empty));
});
test('batch selection is owned/strict and rejects duplicates/accessors before SQL', (t) => {
  const { db, store } = setup(t);
  apply(store);
  const original = db.prepare.bind(db);
  let queries = 0,
    getters = 0;
  db.prepare = (...args) => {
    queries++;
    return original(...args);
  };
  assert.throws(() => store.readCurrentBatch(['doc:one', 'doc:one'], limits, () => {}), {
    code: 'DOCUMENT_DUPLICATE_SELECTION',
  });
  const unsafe = [];
  Object.defineProperty(unsafe, '0', {
    enumerable: true,
    get() {
      getters++;
      return 'doc:one';
    },
  });
  unsafe.length = 1;
  assert.throws(() => store.readCurrentBatch(unsafe, limits, () => {}));
  assert.equal(getters, 0);
  assert.equal(queries, 0);
  assert.equal(db.isTransaction, false);
});
test('batch uses one cumulative row budget and mandatory synchronous control', (t) => {
  const { db, store } = setup(t);
  apply(store);
  apply(store, secondDocument());
  assert.equal(store.readCurrent('doc:one', { ...limits, maxRows: 16 }).revisionId, 'rev:one');
  assert.equal(store.readCurrentBatch(['doc:one'], { ...limits, maxRows: 16 }, () => {}).length, 1);
  assert.throws(() =>
    store.readCurrentBatch(['doc:one', 'doc:two'], { ...limits, maxRows: 16 }, () => {}),
  );
  for (const control of [undefined, async () => {}, () => Promise.resolve()])
    assert.throws(() => store.readCurrentBatch(['doc:one'], limits, control), {
      code: 'DOCUMENT_SYNC_CHECK_REQUIRED',
    });
  assert.equal(db.isTransaction, false);
});
test('batch refuses corrupted later document instead of returning a successful prefix', (t) => {
  const { db, store } = setup(t);
  apply(store);
  apply(store, secondDocument());
  db.exec('DROP TRIGGER document_blocks_immutable_update');
  db.exec("UPDATE document_blocks SET ordinal=99 WHERE revision_id='rev:b1'");
  assert.throws(() => store.readCurrentBatch(['doc:one', 'doc:two'], limits, () => {}), {
    code: 'DOCUMENT_STORAGE_CORRUPT',
  });
  assert.equal(db.isTransaction, false);
  assert.equal(store.readCurrent('doc:one', limits).revisionId, 'rev:one');
});

test('batch owns selection before the first permission/control callback can mutate caller array', (t) => {
  const { store } = setup(t);
  apply(store);
  const ids = ['doc:one'];
  let first = true;
  const values = store.readCurrentBatch(ids, limits, () => {
    if (first) {
      first = false;
      ids[0] = 'doc:missing';
    }
  });
  assert.equal(values.length, 1);
  assert.equal(values[0].revisionId, 'rev:one');
});

test('exact revision batch preserves caller order and immutable history without advancing heads', (t) => {
  const { db, store } = setup(t);
  apply(store);
  apply(store, bundle('rev:two', 'later', 'c'), 'rev:one');
  apply(store, secondDocument());
  const before = db.prepare('SELECT total_changes() n').get().n;
  const rows = store.readRevisionBatch(
    [
      { documentId: 'doc:one', revisionId: 'rev:one' },
      { documentId: 'doc:two', revisionId: 'rev:b1' },
      { documentId: 'doc:one', revisionId: 'rev:two' },
    ],
    limits,
    () => {},
  );
  assert.deepEqual(
    rows.map((x) => x.revisionId),
    ['rev:one', 'rev:b1', 'rev:two'],
  );
  assert.deepEqual(
    rows.map((x) => x.bundle.payload.blocks[0].payload.text),
    ['hello', 'world', 'later'],
  );
  assert.ok(
    Object.isFrozen(rows) && rows.every((x) => Object.isFrozen(x) && Object.isFrozen(x.bundle)),
  );
  assert.equal(db.prepare('SELECT total_changes() n').get().n, before);
  assert.equal(store.readCurrent('doc:one', limits).revisionId, 'rev:two');
});

test('exact revision batch refuses missing or foreign revision without falling back to head', (t) => {
  const { db, store } = setup(t);
  apply(store);
  apply(store, secondDocument());
  for (const selection of [
    [
      { documentId: 'doc:one', revisionId: 'rev:one' },
      { documentId: 'doc:two', revisionId: 'missing' },
    ],
    [{ documentId: 'doc:one', revisionId: 'rev:b1' }],
    [{ documentId: 'missing', revisionId: 'rev:one' }],
  ]) {
    assert.throws(() => store.readRevisionBatch(selection, limits, () => {}), {
      code: 'DOCUMENT_REQUIRED_DOCUMENT_MISSING',
    });
    assert.equal(db.isTransaction, false);
  }
  assert.deepEqual(
    store.readRevisionBatch([], limits, () => {}),
    [],
  );
});

test('exact revision batch owns strict selection before control and shares cumulative budget', (t) => {
  const { db, store } = setup(t);
  apply(store);
  apply(store, secondDocument());
  const selected = [{ documentId: 'doc:one', revisionId: 'rev:one' }];
  const rows = store.readRevisionBatch(selected, limits, () => {
    selected[0].revisionId = 'missing';
    selected.push({ documentId: 'missing', revisionId: 'missing' });
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].revisionId, 'rev:one');
  const one = { documentId: 'doc:one', revisionId: 'rev:one' };
  assert.equal(store.readRevisionBatch([one], { ...limits, maxRows: 16 }, () => {}).length, 1);
  assert.throws(() =>
    store.readRevisionBatch(
      [one, { documentId: 'doc:two', revisionId: 'rev:b1' }],
      { ...limits, maxRows: 16 },
      () => {},
    ),
  );
  for (const control of [undefined, async () => {}, () => Promise.resolve()])
    assert.throws(() => store.readRevisionBatch([one], limits, control), {
      code: 'DOCUMENT_SYNC_CHECK_REQUIRED',
    });
  const prepare = db.prepare.bind(db);
  let queries = 0,
    getters = 0;
  db.prepare = (...args) => {
    queries++;
    return prepare(...args);
  };
  const unsafe = { documentId: 'doc:one' };
  Object.defineProperty(unsafe, 'revisionId', {
    enumerable: true,
    get() {
      getters++;
      return 'rev:one';
    },
  });
  for (const selection of [[one, one], [unsafe], [{ ...one, extra: true }]])
    assert.throws(() => store.readRevisionBatch(selection, limits, () => {}));
  assert.equal(queries, 0);
  assert.equal(getters, 0);
  assert.equal(db.isTransaction, false);
});

test('exact revision batch cannot see a revision committed after its SQLite WAL snapshot began', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'codeatlas-doc-batch-'));
  t.after(() => {
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('codeatlas-doc-batch-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const file = join(directory, 'owned.sqlite');
  const { db, store } = setup(t, file);
  let writer;
  try {
    db.exec('PRAGMA journal_mode=WAL');
    apply(store);
    apply(store, secondDocument());
    writer = new DatabaseSync(file);
    writer.exec('PRAGMA foreign_keys=ON');
    const other = new api.DocumentStore(writer, 'ws:one');
    const prepare = db.prepare.bind(db);
    let changed = false;
    db.prepare = (sql) => {
      const statement = prepare(sql);
      if (sql.startsWith('SELECT "id","workspace_id"') && sql.includes('FROM "documents"')) {
        const all = statement.all.bind(statement);
        statement.all = (...args) => {
          const rows = all(...args);
          if (args[0] === 'doc:one' && !changed) {
            changed = true;
            apply(other, secondDocument('rev:b2', 'later', 'c'), 'rev:b1');
          }
          return rows;
        };
      }
      return statement;
    };
    const selection = [
      { documentId: 'doc:one', revisionId: 'rev:one' },
      { documentId: 'doc:two', revisionId: 'rev:b2' },
    ];
    assert.throws(() => store.readRevisionBatch(selection, limits, () => {}), {
      code: 'DOCUMENT_REQUIRED_DOCUMENT_MISSING',
    });
    assert.equal(changed, true);
    assert.equal(db.isTransaction, false);
    assert.deepEqual(
      store.readRevisionBatch(selection, limits, () => {}).map((x) => x.revisionId),
      ['rev:one', 'rev:b2'],
    );
  } finally {
    if (writer?.isOpen) writer.close();
    if (db.isOpen) db.close();
  }
});

import { readFile } from 'node:fs/promises';
import { prepareSnapshotSchemas } from '../dist/knowledge/snapshot-schema.js';
async function extendOwnedSchema(db, version) {
  await prepareSnapshotSchemas();
  for (let v = 9; v <= version; v++) {
    db.exec(
      await readFile(
        new URL(
          '../migrations/workspace-proposed/' +
            (v === 9 ? '009_knowledge.sql' : '010_lifecycle.sql'),
          import.meta.url,
        ),
        'utf8',
      ),
    );
    db.exec('PRAGMA user_version=' + v);
  }
}
test('new schema requires explicit reference preparation before read admission', async (t) => {
  const { db, store } = setup(t);
  db.exec(
    await readFile(
      new URL('../migrations/workspace-proposed/009_knowledge.sql', import.meta.url),
      'utf8',
    ),
  );
  db.exec('PRAGMA user_version=9');
  assert.throws(() => new api.DocumentStore(db, 'ws:one'), { code: 'DOCUMENT_SCHEMA_UNSUPPORTED' });
  assert.throws(() => store.readCurrent('absent', limits), { code: 'DOCUMENT_SCHEMA_UNSUPPORTED' });
});
for (const version of [9, 10]) {
  test(
    'exact document schema' + version + ' reads last-good history but refuses all writes',
    async (t) => {
      const { db, store } = setup(t);
      apply(store);
      const before = image(db);
      await extendOwnedSchema(db, version);
      const reader = new api.DocumentStore(db, 'ws:one');
      db.exec('PRAGMA query_only=ON');
      assert.equal(reader.readCurrent('doc:one', limits).revisionId, 'rev:one');
      assert.equal(
        reader.readRevision('doc:one', 'rev:one', limits, () => {}).revisionId,
        'rev:one',
      );
      assert.equal(reader.readCurrentBatch(['doc:one'], limits, () => {}).length, 1);
      assert.equal(
        reader.readRevisionBatch(
          [{ documentId: 'doc:one', revisionId: 'rev:one' }],
          limits,
          () => {},
        ).length,
        1,
      );
      db.exec('PRAGMA query_only=OFF');
      assert.throws(() => apply(reader, bundle('rev:two'), 'rev:one'), {
        code: 'DOCUMENT_SCHEMA_UNSUPPORTED',
      });
      assert.deepEqual(image(db), before);
      assert.throws(() => reader.readCurrent('doc:one', { ...limits, maxRows: 1 }), {
        code: 'HISTORY_LIMIT_EXCEEDED',
      });
      db.exec('PRAGMA foreign_keys=OFF');
      assert.throws(() => reader.readCurrent('doc:one', limits), {
        code: 'DOCUMENT_FOREIGN_KEYS_REQUIRED',
      });
      db.exec('PRAGMA foreign_keys=ON');
      db.exec('DROP TRIGGER proposed_knowledge_revisions_no_update');
      assert.throws(() => reader.readCurrent('doc:one', limits), {
        code: 'DOCUMENT_SCHEMA_UNSUPPORTED',
      });
      assert.equal(db.isTransaction, false);
      db.exec('PRAGMA user_version=11');
      assert.throws(() => new api.DocumentStore(db, 'ws:one'), {
        code: 'DOCUMENT_SCHEMA_UNSUPPORTED',
      });
    },
  );
}
