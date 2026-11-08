import { randomUUID } from 'node:crypto';
import { types } from 'node:util';
import { type RuntimeRequestControl } from '@codeatlas/ir';
import { KnowledgeBudget, immutable } from '../../knowledge/dist/comparison-contract.js';
import {
  parseOwnedWikiRequest,
  projectOwnedWiki,
  wikiDigest,
  WikiProjectionError,
  type OwnedWikiRequest,
  type OwnedWikiProjection,
} from '../../knowledge/dist/offline-wiki.js';

type ExactWikiQuery = Pick<
  OwnedWikiRequest,
  'workspaceId' | 'repositoryIds' | 'selectedPublishedRevisionRefs'
>;
export type OwnedWikiArtifact = {
  kind: 'OWNED_TEST_WIKI';
  artifactId: string;
  artifactRevisionId: string;
  createdAt: string;
  projection: OwnedWikiProjection;
};
export type OwnedWikiResult = {
  projection: OwnedWikiProjection;
  artifactEffect: 'CREATED' | 'UNCHANGED' | 'NOT_WRITTEN';
  artifact: OwnedWikiArtifact | null;
};
/** Private owned-data copy-on-write memory writer. No public query or filesystem route. */
export class OfflineWikiProjector {
  readonly #query: (query: ExactWikiQuery, control: RuntimeRequestControl) => Promise<unknown>;
  readonly #history = new Map<string, OwnedWikiArtifact>();
  #current: OwnedWikiArtifact | null = null;
  #busy = false;
  #scopeDigest: string | null = null;
  constructor(ports: {
    knowledgeQuery: (query: ExactWikiQuery, control: RuntimeRequestControl) => Promise<unknown>;
  }) {
    if (!ports || typeof ports !== 'object' || types.isProxy(ports))
      throw new WikiProjectionError('WIKI_INVALID_PORT');
    const descriptor = Object.getOwnPropertyDescriptor(ports, 'knowledgeQuery');
    if (
      !descriptor ||
      !('value' in descriptor) ||
      typeof descriptor.value !== 'function' ||
      types.isProxy(descriptor.value)
    )
      throw new WikiProjectionError('WIKI_INVALID_PORT');
    this.#query = descriptor.value.bind(ports);
  }
  getCurrent(): OwnedWikiArtifact | null {
    return this.#current;
  }
  getRevision(artifactRevisionId: string): OwnedWikiArtifact | null {
    return this.#history.get(artifactRevisionId) ?? null;
  }
  async project(value: unknown, control: RuntimeRequestControl): Promise<OwnedWikiResult> {
    if (this.#busy) throw new WikiProjectionError('WIKI_PROJECTION_BUSY');
    this.#busy = true;
    try {
      const budget = new KnowledgeBudget(control),
        request = parseOwnedWikiRequest(value, budget.control);
      const scopeDigest = wikiDigest(
        'codeatlas.owned-wiki.scope.v1',
        { workspaceId: request.workspaceId, repositoryIds: request.repositoryIds },
        budget.control,
      );
      if (this.#scopeDigest !== null && this.#scopeDigest !== scopeDigest)
        throw new WikiProjectionError('WIKI_SCOPE_DENIED');
      this.#scopeDigest = scopeDigest;
      const exactRequest = immutable({
        workspaceId: request.workspaceId,
        repositoryIds: request.repositoryIds,
        selectedPublishedRevisionRefs: request.selectedPublishedRevisionRefs,
      });
      // Empty selection has no queryable published revision and gives explicit missing diagnostics.
      const selectionDigest = wikiDigest(
        'codeatlas.offline-knowledge.selection.v1',
        { workspaceId: request.workspaceId, refs: request.selectedPublishedRevisionRefs },
        budget.control,
      );
      const response = request.selectedPublishedRevisionRefs.length
        ? await this.#query(exactRequest, budget.control)
        : {
            kind: 'OWNED_TEST_PUBLICATION',
            workspaceId: request.workspaceId,
            selectionDigest,
            records: [],
            productionQuery: 'NOT_AUTHORIZED',
            quality: 'NOT_EVALUABLE',
          };
      budget.tick();
      budget.data(response);
      const owned = JSON.parse(JSON.stringify(response));
      if (owned.selectionDigest !== selectionDigest)
        throw new WikiProjectionError('WIKI_QUERY_MISMATCH');
      const projection = projectOwnedWiki(request, owned, budget.control);
      budget.data(projection);
      budget.tick();
      if (!projection.canMaterialize)
        return immutable({ projection, artifactEffect: 'NOT_WRITTEN', artifact: this.#current });
      if (this.#current?.projection.contentFingerprint === projection.contentFingerprint)
        return immutable({ projection, artifactEffect: 'UNCHANGED', artifact: this.#current });
      const artifactId = wikiDigest(
        'codeatlas.owned-wiki.artifact.v1',
        {
          workspaceId: request.workspaceId,
          repositoryIds: request.repositoryIds,
          specId: projection.profile.specId,
          audience: 'OWNED_TEST',
        },
        budget.control,
      );
      // Assignment follows the final control check; no await or externally fallible work follows it.
      const artifact: OwnedWikiArtifact = immutable({
        kind: 'OWNED_TEST_WIKI',
        artifactId,
        artifactRevisionId: randomUUID(),
        createdAt: new Date().toISOString(),
        projection,
      });
      budget.data(artifact);
      budget.tick();
      this.#history.set(artifact.artifactRevisionId, artifact);
      this.#current = artifact;
      return immutable({ projection, artifactEffect: 'CREATED', artifact });
    } finally {
      this.#busy = false;
    }
  }
}
