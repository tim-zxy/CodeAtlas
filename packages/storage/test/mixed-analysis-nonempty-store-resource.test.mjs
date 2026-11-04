import { modelNonemptyStore } from '../../../fixtures/phase1/mixed-analysis-stage/independent-nonempty-store-resource-model.mjs';
import { readComponentReference as readComponent } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  historyFixture,
  seedLiteral,
  historyLimits,
  referenceCanonical,
} from './helpers/r011-history-fixture.mjs';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { MixedAnalysisStore } from '../dist/analysis/mixed-analysis-store.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
const ref = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../fixtures/phase1/mixed-analysis-stage/nonempty-store-resource-reference.json',
        import.meta.url,
      ),
    ),
  ),
  sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),
  values = (b) => ({
    rows: b.rows,
    serializedBytes: b.serializedBytes,
    items: b.items,
    retainedLogicalBytes: b.retainedLogicalBytes,
  }),
  sortRows = (v) =>
    [...v].sort((a, b) =>
      referenceCanonical(a) < referenceCanonical(b)
        ? -1
        : referenceCanonical(a) > referenceCanonical(b)
          ? 1
          : 0,
    );
for (const c of ref.cases)
  test(
    'independent whole nonempty initial Stage Runtime Provider Store exact and one-below ' + c.id,
    async (t) => {
      assert.equal(sha(c.source.assetPath), c.source.assetSha256);
      assert.equal(
        crypto.createHash('sha256').update(readComponent(c.source.path)).digest('hex'),
        c.source.sha256,
      );
      assert.equal(sha(ref.sourcePath), ref.sourceSha256);
      assert.equal(sha(ref.modelPath), ref.modelSha256);
      assert.equal(sha(ref.manifestPath), ref.manifestSha256);
      assert.equal(sha(ref.schemaSource.path), ref.schemaSource.sha256);
      const schema = JSON.parse(fs.readFileSync(ref.schemaSource.path));
      for (const s of schema.sources) assert.equal(sha(s.path), s.sha256);
      assert.deepEqual(
        modelNonemptyStore(c.input, c.preparation, c.javaRows, c.raw, schema),
        c.expected,
      );
      const previous = JSON.parse(fs.readFileSync(ref.sourcePath)).cases.find((v) => v.id === c.id);
      assert.deepEqual(c.input, previous.input);
      assert.deepEqual(c.raw, previous.raw);
      assert.deepEqual(c.javaRows, previous.javaRows);
      assert.deepEqual(c.preparation, previous.preparation);
      assert.deepEqual(c.expected.frozen, previous.expected.frozen);
      const old = JSON.parse(readComponent(c.source.path));
      assert.deepEqual(
        Object.fromEntries(Object.entries(c.expected.tables).map(([k, v]) => [k, sortRows(v)])),
        Object.fromEntries(
          schema.tables.map((table) => [
            table.name,
            sortRows(old.tables[table.name] ?? c.input.tables[table.name] ?? []),
          ]),
        ),
      );
      const run = async (key) => {
        const f = await historyFixture(t, 'available', { seed: false });
        seedLiteral(f.db, c.input);
        const before = allRows(f.db),
          limits = { ...c.expected.committed.required };
        if (key) limits[key]--;
        const add = HistoryReadBudget.prototype.add;
        let b, stage;
        HistoryReadBudget.prototype.add = function (...args) {
          if ((new Error().stack.split('\n')[2] ?? '').includes('at acquireMixedAnalysisLease'))
            b = this;
          return add.apply(this, args);
        };
        const operation = () => {
          const h = captureActivationContext(f.db, c.input.repositoryId, historyLimits);
          stage = new MixedAnalysisStage(
            f.db,
            h.handle,
            'FULL',
            limits,
            createMixedAnalysisRules(),
          );
          const owner = stage.prepareOwner(c.javaRows, c.preparation);
          stage.acceptObservation(owner.ownerHandle, {
            metadata: c.raw.metadata,
            requestBytes: Buffer.from(c.raw.requestText),
            outputBytes: Buffer.from(c.raw.outputText),
          });
          const token = stage.freeze();
          return new MixedAnalysisStore(f.db).apply(token.lease, limits);
        };
        try {
          if (key) {
            assert.throws(operation, (e) => e.code === 'STAGE_LIMIT_EXCEEDED', key);
            assert.equal(f.db.isTransaction, false);
            assert.deepEqual(allRows(f.db), before);
            assert.deepEqual(allRows(f.reopen(true)), before);
          } else {
            assert.equal(operation(), c.expected.activationId);
            assert.deepEqual(values(b), c.expected.committed.state);
            const expected = Object.fromEntries(
              Object.entries(c.expected.tables).map(([k, v]) => [k, sortRows(v)]),
            );
            assert.deepEqual(allRows(f.db), expected);
            assert.deepEqual(allRows(f.reopen(true)), expected);
            assert.equal(
              f.db
                .prepare("SELECT count(*) AS n FROM sqlite_temp_schema WHERE name='mixed_stage'")
                .get().n,
              0,
            );
            const spent = values(b);
            stage.close();
            assert.deepEqual(values(b), spent);
          }
        } finally {
          HistoryReadBudget.prototype.add = add;
          if (stage) stage.close();
        }
      };
      await run(null);
      for (const key of Object.keys(c.expected.committed.required)) await run(key);
    },
  );
