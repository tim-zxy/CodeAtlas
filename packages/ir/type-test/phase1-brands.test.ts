import {
  RuntimeEntityIdSchema,
  DocumentIdSchema,
  KnowledgeItemIdSchema,
  type RuntimeEntityId,
  type KnowledgeItemId,
} from '../src/index.js';
const runtime: RuntimeEntityId = RuntimeEntityIdSchema.parse('runtime:one');
const knowledge: KnowledgeItemId = KnowledgeItemIdSchema.parse('knowledge:one');
const takeRuntime = (id: RuntimeEntityId) => id;
const takeKnowledge = (id: KnowledgeItemId) => id;
takeRuntime(runtime);
takeKnowledge(knowledge);
// @ts-expect-error Knowledge identity is not a runtime fact identity.
takeRuntime(knowledge);
// @ts-expect-error Runtime fact identity cannot become knowledge identity.
takeKnowledge(runtime);
// @ts-expect-error Document identity cannot become knowledge identity.
takeKnowledge(DocumentIdSchema.parse('doc:one'));
