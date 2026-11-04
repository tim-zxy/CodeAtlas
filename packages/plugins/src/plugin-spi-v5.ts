import {
  Phase1DigestSchema,
  RuntimeSitePlanV1Schema,
  parseRuntimeSitePlan,
  parseFrameworkBindingSet,
} from '@codeatlas/ir';
import {
  PluginV4CandidateSchema,
  validateFrameworkPluginCandidateFromContext,
  pluginV4CandidateUnits,
} from './plugin-spi-v4.js';
import type { PluginV5Context } from './plugin-context-v5.js';
import { z } from 'zod';
import { ensurePhase1Data, parseIr, phase1Assert } from '@codeatlas/ir';
import { PluginDescriptorSchema, MAX_PLUGIN_CONTEXT_FACTS } from './plugin-spi.js';
import { PluginV2DetectionSchema } from './plugin-spi-v2.js';
import { PluginV5ContextSchema, validatePluginV5Context } from './plugin-context-v5.js';
export const PluginDescriptorV5Schema = PluginDescriptorSchema.extend({
  contextVersion: z.literal(5),
  syntaxSchemaVersion: z.literal(4),
});
export const PluginV5ExtractionContextSchema = PluginV5ContextSchema.extend({
  detection: PluginV2DetectionSchema,
  syntaxMembershipDigest: Phase1DigestSchema,
  maxItems: z.number().int().safe().positive().max(MAX_PLUGIN_CONTEXT_FACTS),
});
function freeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
}
export function validatePluginDescriptorV5(input: unknown) {
  ensurePhase1Data(input);
  return freeze(parseIr(PluginDescriptorV5Schema, input));
}
export function validatePluginV5Detection(context: unknown, input: unknown) {
  const c = validatePluginV5Context(context);
  ensurePhase1Data(input);
  const d = parseIr(PluginV2DetectionSchema, input);
  phase1Assert(d.matched === d.support.length > 0);
  const seen = new Set<string>();
  for (const s of d.support) {
    const key = JSON.stringify(s);
    phase1Assert(!seen.has(key));
    seen.add(key);
    phase1Assert(
      s.kind === 'SYNTAX'
        ? c.syntaxEvidence.some((r) => r.id === s.id)
        : (s.ref.factType === 'NODE' ? c.nodes : c.edges).some((r) => r.id === s.ref.id),
    );
  }
  for (const diagnostic of d.diagnostics)
    if (diagnostic.sourceRange)
      phase1Assert(c.sourceFiles.some((f) => f.id === diagnostic.sourceRange!.sourceFileId));
  return freeze(d);
}
export function validatePluginV5ExtractionContext(input: unknown) {
  ensurePhase1Data(input);
  const p = parseIr(PluginV5ExtractionContextSchema, input),
    { detection, maxItems, syntaxMembershipDigest, ...base } = p;
  const c = validatePluginV5Context(base),
    d = validatePluginV5Detection(c, detection);
  phase1Assert(d.matched);
  return freeze({ ...c, detection: d, maxItems, syntaxMembershipDigest });
}
export type PluginV5ExtractionContext = ReturnType<typeof validatePluginV5ExtractionContext>;

export const PluginV5CandidateSchema = PluginV4CandidateSchema.extend({
  sitePlan: RuntimeSitePlanV1Schema,
});
export function validatePluginV5Candidate(
  context: unknown,
  descriptor: unknown,
  input: unknown,
  runtimeInput: unknown,
  bindingInput: unknown,
) {
  const c = validatePluginV5ExtractionContext(context),
    d = validatePluginDescriptorV5(descriptor);
  ensurePhase1Data(input);
  const { sitePlan, ...legacy } = parseIr(PluginV5CandidateSchema, input),
    out = validateFrameworkPluginCandidateFromContext(c, d, legacy, runtimeInput),
    bindings = parseFrameworkBindingSet(bindingInput, runtimeInput);
  const availableEntities = c.supportInventory.map((s) => ({
    scope: 'REPOSITORY',
    repositoryId: c.basis.repositoryId,
    entity: s.entity,
  }));
  const plan = parseRuntimeSitePlan(sitePlan, {
    basis: c.basis,
    syntaxMembershipDigest: c.syntaxMembershipDigest,
    syntaxEvidence: c.syntaxEvidence,
    syntaxContext: {
      references: { availableEntities, availableSupports: c.supportInventory },
      codeNodes: c.nodes,
      codeEdges: c.edges,
      sourceFiles: c.sourceFiles,
    },
    bindings: bindings.payload.bindings,
  });
  phase1Assert(
    pluginV4CandidateUnits(out) +
      plan.entries.reduce((n, e) => n + 1 + e.proofSyntaxKeys.length + e.bindingIds.length, 0) <=
      c.maxItems,
  );
  return freeze({ ...out, sitePlan: plan });
}
export type PluginV5Candidate = ReturnType<typeof validatePluginV5Candidate>;
export interface FrameworkPluginV5 {
  describe(): ReturnType<typeof validatePluginDescriptorV5>;
  detect(input: PluginV5Context): Promise<ReturnType<typeof validatePluginV5Detection>>;
  extract(input: PluginV5ExtractionContext): AsyncIterable<PluginV5Candidate>;
}
