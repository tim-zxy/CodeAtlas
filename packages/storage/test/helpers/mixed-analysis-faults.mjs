export const writePoints = [
  'snapshot',
  'capabilities',
  'evidence-retire',
  'evidence-insert',
  'binding',
  'candidate',
  'node',
  'edge',
  'coverage',
  'code-identity',
  'native-state-clear',
  'origin',
  'projection',
  'history',
  'members',
  'pointer',
  'pre-commit',
  'commit-unknown',
  'post-commit-close',
];
const patterns = {
  snapshot: /^INSERT INTO provider_snapshots\(/,
  capabilities: /^INSERT INTO provider_capabilities\(/,
  'evidence-retire': /^DELETE FROM provider_fact_bindings /,
  'evidence-insert': /^INSERT INTO evidence\(/,
  binding: /^INSERT INTO provider_fact_bindings\(/,
  candidate: /^INSERT INTO active_support_candidates\(/,
  node: /^INSERT INTO canonical_nodes\(/,
  edge: /^INSERT INTO canonical_edges\(/,
  coverage: /^INSERT INTO analysis_coverage\(/,
  'native-state-clear': /^DELETE FROM native_analysis_state /,
  origin: /^INSERT INTO syntax_origins\(/,
  projection: /^INSERT INTO syntax_projections\(/,
  history: /^INSERT INTO activation_history\(/,
  members: /^INSERT INTO activation_syntax_members\(/,
  pointer: /^INSERT INTO active_history_pointer\(/,
};
export function injectWriteBoundary(db, point, fail) {
  const originalPrepare = db.prepare,
    originalExec = db.exec;
  let indexed = false,
    hits = 0;
  const hit = () => {
    hits++;
    fail();
  };
  db.prepare = function (sql) {
    if (point === 'code-identity' && indexed) {
      indexed = false;
      hit();
    }
    const stmt = originalPrepare.call(this, sql),
      run = stmt.run;
    stmt.run = function (...args) {
      const result = run.apply(this, args);
      if (/^UPDATE repository_state SET indexed_revision_id=/.test(sql)) indexed = true;
      if (patterns[point]?.test(sql)) hit();
      return result;
    };
    return stmt;
  };
  db.exec = function (sql) {
    if (point === 'pre-commit' && sql === 'COMMIT') hit();
    const result = originalExec.call(this, sql);
    if (point === 'commit-unknown' && sql === 'COMMIT') hit();
    if (point === 'post-commit-close' && sql === 'DROP TABLE temp.mixed_stage') hit();
    return result;
  };
  return {
    restore() {
      db.prepare = originalPrepare;
      db.exec = originalExec;
    },
    hits: () => hits,
  };
}
