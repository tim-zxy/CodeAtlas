import { DatabaseSync } from 'node:sqlite';
import { types } from 'node:util';
import type { RuntimeRequestControl } from '../../application/dist/owned-freshness-wiki.js';
import { parseOwnedWikiRequest } from '../../application/dist/owned-freshness-wiki.js';
import { releaseCompilationSource } from '../../application/dist/compilation-source.js';
import {
  OwnedFreshnessError,
  reconcileOwnedFreshnessWiki,
} from '../../application/dist/owned-freshness-wiki.js';
import { openSchema11OwnedPublicationStore } from '../../storage/dist/knowledge/schema11-read-store.js';
import { RuntimeFactStore } from '../../storage/dist/runtime/runtime-fact-store.js';
import { ContractStore } from '../../storage/dist/runtime/contract-store.js';
import {
  HistoryReadBudget,
  type HistoryReadLimits,
} from '../../storage/dist/analysis/activation-history-format.js';
import { createOwnedCompilationInputPorts } from './compilation-input.js';

/** Private OWNED_ONE_SHOT only. Takes ownership of memory DB and Source contexts
 * after entry admission. Does not prepare Source, open databases, or issue permission. */
export async function runOwnedFreshnessWiki(
  requestInput: unknown,
  options: {
    database: DatabaseSync;
    workspaceStore: ContractStore;
    repositories: ReadonlyMap<string, RuntimeFactStore>;
    sources: ReadonlyMap<string, object>;
    limits: HistoryReadLimits;
    authorize: (manifest: {
      workspaceId: string;
      repositoryIds: readonly string[];
      selectedRefs: readonly { itemId: string; revisionId: string }[];
      fields: readonly string[];
    }) => unknown;
    currentPolicyVersions: () => unknown;
  },
  control: RuntimeRequestControl,
) {
  const descriptors = Object.getOwnPropertyDescriptors(control);
  for (const name of ['maxItems', 'maxDepth', 'deadlineEpochMs', 'signal'])
    if (!descriptors[name] || !Object.hasOwn(descriptors[name]!, 'value'))
      throw Error('FRESHNESS_CONTROL_INVALID');
  control = Object.freeze({
    maxItems: descriptors.maxItems!.value as number,
    maxDepth: descriptors.maxDepth!.value as number,
    deadlineEpochMs: descriptors.deadlineEpochMs!.value as number,
    signal: descriptors.signal!.value as AbortSignal,
  });
  const request = parseOwnedWikiRequest(requestInput, control);
  const db = options.database;
  if (
    !(db instanceof DatabaseSync) ||
    types.isProxy(db) ||
    !db.isOpen ||
    db.isTransaction ||
    !db
      .prepare('PRAGMA database_list')
      .all()
      .every((r) => r.file === '' && (r.name === 'main' || r.name === 'temp')) ||
    !(options.workspaceStore instanceof ContractStore) ||
    [...options.repositories.values()].some((s) => !(s instanceof RuntimeFactStore))
  )
    throw Error('FRESHNESS_OWNER_UNAVAILABLE');
  const manifest = Object.freeze({
    workspaceId: request.workspaceId,
    repositoryIds: Object.freeze([...request.repositoryIds]),
    selectedRefs: Object.freeze(
      request.selectedPublishedRevisionRefs.map((r) => Object.freeze({ ...r })),
    ),
    fields: Object.freeze([
      'SOURCE_OBSERVATION',
      'FRESHNESS_CAS',
      'CANONICAL_BODY',
      'REFERENCES',
    ] as string[]),
  });
  const authorize = options.authorize.bind(options),
    policy = options.currentPolicyVersions.bind(options);
  const check = (): undefined => {
    const value = authorize(manifest);
    if (types.isPromise(value)) void value.catch(() => undefined);
    if (value !== undefined) throw Error('FRESHNESS_PERMISSION_INVALID');
    return undefined;
  };
  const issuer = Object.freeze({});
  const sources = new Map(options.sources);
  // Construction has no acquisition; resources transfer to the Application finally below.
  let delegated = false;
  try {
    const inputs = createOwnedCompilationInputPorts({
      workspaceStore: options.workspaceStore,
      repositories: options.repositories,
      budget: new HistoryReadBudget(options.limits),
      control,
      syncCheck: check,
    });
    const store = await openSchema11OwnedPublicationStore(db, request.workspaceId, issuer);
    const query = () => check();
    delegated = true;
    return await reconcileOwnedFreshnessWiki(
      request,
      {
        issuer,
        workspaceId: request.workspaceId,
        sources,
        assertPermission: check,
        currentPolicyVersions: policy,
        readBasis: () =>
          store.readOwnedFreshnessBasis(
            request.selectedPublishedRevisionRefs,
            options.limits,
            control,
            query,
          ),
        reconcile: (handle) =>
          store.reconcileOwnedFreshness(handle, options.limits, control, query),
        read: async (refs, c) =>
          store.readSelectedCoveredProjection(refs, options.limits, c, query),
        inputs,
        close: () => {
          if (db.isTransaction) throw Error('FRESHNESS_TRANSACTION_UNSETTLED');
          db.close();
          if (db.isOpen) throw Error('FRESHNESS_CLOSE_UNKNOWN');
        },
      },
      control,
    );
  } catch (error) {
    if (delegated) throw error;
    let cleanup: 'SETTLED' | 'UNKNOWN' = 'SETTLED';
    for (const handle of new Set(sources.values())) {
      try {
        releaseCompilationSource(handle);
      } catch {
        cleanup = 'UNKNOWN';
      }
    }
    try {
      if (db.isTransaction) throw Error();
      db.close();
      if (db.isOpen) throw Error();
    } catch {
      cleanup = 'UNKNOWN';
    }
    throw new OwnedFreshnessError('FRESHNESS_INITIALIZATION_REFUSED', 'NOT_ATTEMPTED', cleanup);
  }
}
