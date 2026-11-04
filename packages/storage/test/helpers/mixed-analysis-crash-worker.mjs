import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { mixedAnalysisTestRoot } from '../../../../scripts/mixed-analysis-test-root.mjs';
import { freezeOnConnection } from './mixed-analysis-store-fixture.mjs';
import { injectWriteBoundary, writePoints } from './mixed-analysis-faults.mjs';
import { MixedAnalysisStore } from '../../dist/analysis/mixed-analysis-store.js';
import { historyLimits } from './r011-history-fixture.mjs';
const [databasePath, point, id] = process.argv.slice(2),
  root = fs.realpathSync(mixedAnalysisTestRoot(process.cwd())),
  target = fs.realpathSync(databasePath),
  relative = path.relative(root, target);
if (
  !relative ||
  relative.startsWith('..') ||
  path.isAbsolute(relative) ||
  !writePoints.includes(point) ||
  !['mixed', 'python-only'].includes(id)
)
  throw Error('unsafe crash input');
const db = new DatabaseSync(target, { enableForeignKeyConstraints: true }),
  f = freezeOnConnection(db, id);
injectWriteBoundary(db, point, () => process.exit(73));
new MixedAnalysisStore(db).apply(f.token.lease, historyLimits);
throw Error('requested crash boundary not reached');
