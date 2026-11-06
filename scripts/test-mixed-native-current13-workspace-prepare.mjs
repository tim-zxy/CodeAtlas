import { readHistoricalInputOrLocal } from '../fixtures/phase1/syntax-contract/ci-portability/historical-inputs.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
const originalSpawn = cp.spawn;
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
let prepareRepo;
try {
  ({ prepareCurrent13WorkspaceRepo: prepareRepo } =
    await import('./mixed-native-current13-workspace-repo-fixture.mjs'));
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const evidenceRoot = new URL(
  '../.superpowers/sdd/2026-11-05-current13-workspace-entry/',
  import.meta.url,
);
const manual = JSON.parse(
  readHistoricalInputOrLocal(
    '.superpowers/sdd/2026-11-05-current13-workspace-entry/prepare-manual-expectations.json',
    'utf8',
    path.resolve(import.meta.dirname, '..'),
  ),
);
for (const caseId of ['J7', 'P5'])
  test(
    'real Source identity preparation fixes schema selectors without canonical publication ' +
      caseId,
    async (t) => {
      assert.equal(
        typeof prepareRepo,
        'function',
        'independent Source/TEMP preview prepare helper is required',
      );
      const f = await prepareRepo(t, caseId);
      t.after(() => {
        assert.equal(cp.spawn, originalSpawn);
        assert.equal(fs.existsSync(f.sourceRoot), false);
      });
      const before = f.sourcePreparation.before,
        after = f.sourcePreparation.withSchema;
      assert.equal(after.revision.id, before.revision.id);
      const old = before.files.find((s) => s.path === f.expectedSource.path),
        now = after.files.find((s) => s.path === f.expectedSource.path);
      assert.ok(old && now);
      assert.equal(now.id, old.id);
      assert.equal(now.contentFingerprint, 'sha256:' + f.expectedSource.sha256);
      assert.notEqual(after.revision.contentFingerprint, before.revision.contentFingerprint);
      assert.deepEqual(f.preview.beforeSchemaKeys, f.preview.afterSchemaKeys);
      assert.equal(
        f.schemaDocument.contractFactKeys.length,
        manual.schemaOracle.bindingCounts[caseId],
      );
      const bytes = fs.readFileSync(path.join(f.sourceRoot, f.schemaDocument.path));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), f.schemaDocument.sha256);
      assert.equal(bytes.toString(), f.schemaDocument.contentUtf8);
      const doc = JSON.parse(bytes),
        schemaSource = after.files.find((s) => s.path === f.schemaDocument.path);
      assert.equal(schemaSource.classification.role, 'OTHER');
      assert.equal(schemaSource.languageHint, null);
      assert.equal(schemaSource.contentFingerprint, 'sha256:' + f.schemaDocument.sha256);
      assert.deepEqual(
        doc.bindings.map((b) => b.contractFactKey).sort(),
        f.schemaDocument.contractFactKeys,
      );
      for (const { contractFactKey, ...meaning } of doc.bindings)
        assert.deepEqual(meaning, manual.schemaOracle.exactLiteralSemantics);
      const db = new DatabaseSync(f.databasePath, {
        readOnly: true,
        allowExtension: false,
        enableForeignKeyConstraints: true,
      });
      try {
        for (const table of manual.mustRemainEmpty)
          assert.equal(
            db.prepare('SELECT count(*) AS n FROM ' + table).get().n,
            0,
            table + ' must remain empty',
          );
      } finally {
        db.close();
      }
      assert.equal(f.sourcePreparation.actualSourceOperations, 2);
      assert.equal(f.flags.executionAuthorized, false);
      fs.mkdirSync(evidenceRoot, { recursive: true });
      fs.writeFileSync(
        new URL('prepare-' + caseId + '-final-summary.json', evidenceRoot),
        JSON.stringify(f.descriptor, null, 2) + '\n',
        { flag: 'wx' },
      );
      t.diagnostic(
        'PREPARE=' +
          JSON.stringify({
            caseId,
            sourceOperations: 2,
            contractKeys: f.schemaDocument.contractFactKeys.length,
            canonicalPublication: false,
            sourceIdsPreserved: true,
            aggregateChanged: true,
          }),
      );
    },
  );
