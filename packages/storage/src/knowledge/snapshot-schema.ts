import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { loadMigrationPlan } from '../migrations/manifest.js';
import { applyMigrationPlan } from '../migrations/runner.js';
import type { runtimeSql } from '../runtime/runtime-sql.js';

// Explicit private preparation; never migrates a supplied database or registers
// a production migration. Exact schema shape is not permission or provenance.
let schemas: Map<number, unknown[]> | undefined;
const normalized = (rows: Record<string, unknown>[]) =>
  rows
    .map((row) => ({
      type: row.type,
      name: row.name,
      tbl_name: row.tbl_name,
      sql: typeof row.sql === 'string' ? row.sql.replace(/\r\n?/g, '\n') : row.sql,
    }))
    .sort((a, b) =>
      String(a.name) < String(b.name) ? -1 : String(a.name) > String(b.name) ? 1 : 0,
    );
export async function prepareSnapshotSchemas(): Promise<void> {
  if (schemas) return;
  const plan = await loadMigrationPlan(
    new URL('../../migrations/workspace/manifest.json', import.meta.url),
    'WORKSPACE',
  );
  if (plan.latestVersion !== 8) throw Error('SNAPSHOT_SCHEMA_BASE_CHANGED');
  const db = new DatabaseSync(':memory:');
  try {
    applyMigrationPlan(db, plan);
    const prepared = new Map<number, unknown[]>();
    for (const [version, file, digest] of [
      [9, '009_knowledge.sql', '3feb15ef9a84bf26ef3c11724b9acc43b7b841d3388240d928f5d28cab9870ee'],
      [10, '010_lifecycle.sql', '854544c5565b3fc6cfb6491b19872151c83c8776db37105a57d714c683650b2d'],
    ] as const) {
      const sql = (
        await readFile(
          new URL('../../migrations/workspace-proposed/' + file, import.meta.url),
          'utf8',
        )
      ).replace(/\r\n?/g, '\n');
      if (createHash('sha256').update(sql).digest('hex') !== digest)
        throw Error('SNAPSHOT_DDL_CHANGED');
      db.exec(sql);
      prepared.set(
        version,
        normalized(
          db
            .prepare(
              "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
            )
            .all(),
        ),
      );
    }
    schemas = prepared;
  } finally {
    db.close();
  }
}
export function captureSchemaPrepared(version: unknown): boolean {
  return (version === 9 || version === 10) && !!schemas?.has(version);
}
export function exactCaptureSchema(sql: ReturnType<typeof runtimeSql>, version: unknown): boolean {
  if (!captureSchemaPrepared(version)) return false;
  return isDeepStrictEqual(
    normalized(
      sql.read(
        'sqlite_schema',
        ['type', 'name', 'tbl_name', 'sql'],
        "name NOT LIKE 'sqlite_%'",
        [],
      ),
    ),
    schemas!.get(version as number),
  );
}
