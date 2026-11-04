import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  HistoryReadBudget,
  encodeHistoryValue,
  requireHistory,
} from '../analysis/activation-history-format.js';
export const runtimeHash = (domain: string, json: string) =>
  createHash('sha256')
    .update(domain + '\0' + json)
    .digest('hex');
export function runtimeSql(db: DatabaseSync, b: HistoryReadBudget) {
  const identifier = (s: string) => {
    requireHistory(/^[a-z_]+$/.test(s));
    return '"' + s + '"';
  };
  const read = (
    table: string,
    columns: readonly string[],
    where: string,
    args: SQLInputValue[],
  ) => {
    const from = ' FROM ' + identifier(table) + ' WHERE ' + where;
    b.own(args);
    b.add('rows', 1);
    const p = db
      .prepare(
        'SELECT count(*) n,coalesce(sum(' +
          columns.map((c) => 'coalesce(length(CAST(' + identifier(c) + ' AS BLOB)),0)').join('+') +
          '),0) bytes' +
          from,
      )
      .get(...args)!;
    requireHistory(
      typeof p.n === 'number' &&
        Number.isSafeInteger(p.n) &&
        p.n >= 0 &&
        typeof p.bytes === 'number' &&
        Number.isSafeInteger(p.bytes) &&
        p.bytes >= 0,
    );
    b.add('rows', p.n);
    b.add('serializedBytes', p.bytes);
    b.pin(p.bytes);
    const rows = db
      .prepare('SELECT ' + columns.map(identifier).join(',') + from + ' ORDER BY rowid')
      .all(...args);
    requireHistory(rows.length === p.n);
    b.own(rows, false);
    return rows;
  };
  const run = (sql: string, args: SQLInputValue[]) => {
    b.own(args);
    b.add('rows', 1);
    b.add(
      'serializedBytes',
      args.reduce<number>((n, v) => n + (typeof v === 'string' ? Buffer.byteLength(v) : 0), 0),
    );
    return db.prepare(sql).run(...args);
  };
  const insert = (table: string, row: Record<string, SQLInputValue>) =>
    run(
      'INSERT INTO ' +
        identifier(table) +
        '(' +
        Object.keys(row).map(identifier).join(',') +
        ')VALUES(' +
        Object.keys(row)
          .map(() => '?')
          .join(',') +
        ')',
      Object.values(row),
    );
  const json = (v: unknown) => encodeHistoryValue(v, b);
  const payload = (schema: string, value: unknown) => {
    const raw = json(value);
    return {
      schema_name: schema,
      schema_version: 1,
      payload_json: raw,
      value_digest: runtimeHash('runtime-storage-value-v1', raw),
    };
  };
  return { read, run, insert, json, payload };
}
