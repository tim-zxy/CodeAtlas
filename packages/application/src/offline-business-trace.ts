import { types } from 'node:util';
import { EntityIdSchema, type RuntimeRequestControl } from '@codeatlas/ir';
import { KnowledgeBudget, immutable } from '../../knowledge/dist/comparison-contract.js';
import {
  BusinessTraceError,
  parseOwnedBusinessTraceRequest,
  traceOwnedBusinessFlow,
  type OwnedBusinessTrace,
} from '../../knowledge/dist/offline-business-trace.js';
import { type OwnedPublishedScope } from '../../knowledge/dist/offline-wiki.js';
/** Fixed owned published read port only; no update, Source, filesystem or runtime producer. */
export class OfflineBusinessFlowTracer {
  readonly #workspaceId: string;
  readonly #query: (scope: OwnedPublishedScope, control: RuntimeRequestControl) => Promise<unknown>;
  constructor(ports: {
    workspaceId: string;
    knowledgeQuery: (
      scope: OwnedPublishedScope,
      control: RuntimeRequestControl,
    ) => Promise<unknown>;
  }) {
    if (!ports || typeof ports !== 'object' || types.isProxy(ports))
      throw new BusinessTraceError('BUSINESS_TRACE_INVALID_INPUT');
    const d = Object.getOwnPropertyDescriptors(ports);
    if (
      !d.workspaceId ||
      !('value' in d.workspaceId) ||
      !d.knowledgeQuery ||
      !('value' in d.knowledgeQuery) ||
      typeof d.knowledgeQuery.value !== 'function' ||
      types.isProxy(d.knowledgeQuery.value)
    )
      throw new BusinessTraceError('BUSINESS_TRACE_INVALID_INPUT');
    this.#workspaceId = EntityIdSchema.parse(d.workspaceId.value);
    this.#query = d.knowledgeQuery.value.bind(ports);
    Object.freeze(this);
  }
  async trace(value: unknown, control: RuntimeRequestControl): Promise<OwnedBusinessTrace> {
    const budget = new KnowledgeBudget(control),
      request = parseOwnedBusinessTraceRequest(value, budget.control);
    if (request.workspaceId !== this.#workspaceId)
      throw new BusinessTraceError('BUSINESS_TRACE_INVALID_INPUT');
    const exact = immutable({
      workspaceId: request.workspaceId,
      repositoryIds: request.repositoryIds,
      selectedPublishedRevisionRefs: [request.knowledgeRef],
    });
    const knowledge = await this.#query(exact, budget.control);
    budget.tick();
    return traceOwnedBusinessFlow(request, knowledge, budget.control);
  }
}
