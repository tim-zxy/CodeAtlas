import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { loadMigrationPlan } from '../migrations/manifest.js';
import { applyMigrationPlan } from '../migrations/runner.js';
import type { runtimeSql } from '../runtime/runtime-sql.js';
let reference: unknown;
const normalize = (rows: Record<string, unknown>[]) =>
  rows
    .map((r) => ({
      type: r.type,
      name: r.name,
      tbl_name: r.tbl_name,
      sql: typeof r.sql === 'string' ? r.sql.replace(/\r\n?/g, '\n') : r.sql,
    }))
    .sort((a, b) =>
      String(a.name) < String(b.name) ? -1 : String(a.name) > String(b.name) ? 1 : 0,
    );
/** Creates only an owned in-memory reference. Never migrates a borrowed connection. */
export async function prepareSchema11ReadReference(): Promise<void> {
  if (reference) return;
  const plan = await loadMigrationPlan(
    new URL('../../migrations/workspace/manifest.json', import.meta.url),
    'WORKSPACE',
  );
  if (plan.latestVersion !== 8) throw Error('READ11_BASE_CHANGED');
  const db = new DatabaseSync(':memory:');
  try {
    applyMigrationPlan(db, plan);
    for (const [file, digest] of [
      ['009_knowledge.sql', '3feb15ef9a84bf26ef3c11724b9acc43b7b841d3388240d928f5d28cab9870ee'],
      ['010_lifecycle.sql', '854544c5565b3fc6cfb6491b19872151c83c8776db37105a57d714c683650b2d'],
      [
        '011_read_candidate.sql',
        'b66151142399dd0e84d5f6318c83ef56fb0fa2bff690e4f57e8b7b9ffb07dc69',
      ],
    ]) {
      const sql = (
        await readFile(
          new URL('../../migrations/workspace-proposed/' + file, import.meta.url),
          'utf8',
        )
      ).replace(/\r\n?/g, '\n');
      if (createHash('sha256').update(sql).digest('hex') !== digest)
        throw Error('READ11_DDL_CHANGED');
      db.exec(sql);
    }
    reference = normalize(
      db
        .prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'")
        .all(),
    );
  } finally {
    db.close();
  }
}
export function exactSchema11Read(sql: ReturnType<typeof runtimeSql>): boolean {
  return (
    !!reference &&
    isDeepStrictEqual(
      normalize(
        sql.read(
          'sqlite_schema',
          ['type', 'name', 'tbl_name', 'sql'],
          "name NOT LIKE 'sqlite_%'",
          [],
        ),
      ),
      reference,
    )
  );
}
