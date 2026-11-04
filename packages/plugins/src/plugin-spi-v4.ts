import type { FrameworkContext } from './framework-bindings.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  ensurePhase1Data,
  parseIr,
  phase1Assert,
  supportKey,
  entityRefKey,
  parseRuntimeFactSet,
  parseFrameworkBindingSet,
  FrameworkBindingSetSchema,
  SupportRefSchema,
  EntityIdSchema,
  basisKey,
  Phase1CoverageSchema,
} from '@codeatlas/ir';
import { PluginDescriptorSchema, MAX_PLUGIN_CONTEXT_FACTS } from './plugin-spi.js';
import {
  PluginV2CandidateSchema,
  PluginV2DetectionSchema,
  type PluginV2Detection,
} from './plugin-spi-v2.js';
import {
  PluginV4ContextSchema,
  validatePluginV4Context,
  type PluginV4Context,
} from './plugin-context-v4.js';
import { canonical } from './framework-draft.js';
export const PluginDescriptorV4Schema = PluginDescriptorSchema.extend({
  contextVersion: z.literal(4),
  syntaxSchemaVersion: z.literal(3),
});
export const PluginV4CandidateSchema = PluginV2CandidateSchema.extend({
  coverage: Phase1CoverageSchema,
});
export const PluginV4ExtractionContextSchema = PluginV4ContextSchema.extend({
  detection: PluginV2DetectionSchema,
  maxItems: z.number().int().safe().positive().max(MAX_PLUGIN_CONTEXT_FACTS),
});
function freeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
}
export function validatePluginDescriptorV4(input: unknown) {
  ensurePhase1Data(input);
  return freeze(parseIr(PluginDescriptorV4Schema, input));
}
function checkSupport(c: FrameworkContext, support: PluginV2Detection['support']) {
  const keys = new Set<string>();
  for (const s of support) {
    const key = canonical(s);
    phase1Assert(!keys.has(key));
    keys.add(key);
    phase1Assert(
      s.kind === 'SYNTAX'
        ? c.syntaxEvidence.some((v) => v.id === s.id)
        : (s.ref.factType === 'NODE' ? c.nodes : c.edges).some((v) => v.id === s.ref.id),
    );
  }
}
export function validatePluginV4Detection(context: unknown, input: unknown) {
  const c = validatePluginV4Context(context);
  ensurePhase1Data(input);
  const d = parseIr(PluginV2DetectionSchema, input);
  phase1Assert(d.matched === d.support.length > 0);
  checkSupport(c, d.support);
  for (const diagnostic of d.diagnostics)
    if (diagnostic.sourceRange)
      phase1Assert(c.sourceFiles.some((f) => f.id === diagnostic.sourceRange!.sourceFileId));
  return freeze(d);
}
export function validatePluginV4ExtractionContext(input: unknown) {
  ensurePhase1Data(input);
  const p = parseIr(PluginV4ExtractionContextSchema, input);
  const { detection, maxItems, ...base } = p,
    c = validatePluginV4Context(base);
  const d = validatePluginV4Detection(c, detection);
  phase1Assert(d.matched);
  return freeze({ ...c, detection: d, maxItems });
}
export type PluginV4ExtractionContext = ReturnType<typeof validatePluginV4ExtractionContext>;
export function validatePluginV4Candidate(
  context: unknown,
  descriptor: unknown,
  input: unknown,
  runtimeInput?: unknown,
) {
  const c = validatePluginV4ExtractionContext(context),
    d = validatePluginDescriptorV4(descriptor);
  return validateFrameworkPluginCandidateFromContext(c, d, input, runtimeInput);
}
/** Private shared support validator; versioned public wrappers validate their own contexts. */
export function validateFrameworkPluginCandidateFromContext(
  c: FrameworkContext & { maxItems: number },
  d: Pick<ReturnType<typeof validatePluginDescriptorV4>, 'producedSemanticCapabilities'>,
  input: unknown,
  runtimeInput?: unknown,
) {
  ensurePhase1Data(input);
  const out = parseIr(PluginV4CandidateSchema, input);
  phase1Assert(d.producedSemanticCapabilities.includes(out.capability));
  checkSupport(c, out.support);
  const payload =
    out.capability === 'RUNTIME_FACT_SET'
      ? parseRuntimeFactSet(out.value).payload
      : out.capability === 'FRAMEWORK_BINDING_SET'
        ? parseFrameworkBindingSet(out.value, runtimeInput).payload
        : undefined;
  phase1Assert(payload);
  phase1Assert(basisKey(payload.basis) === basisKey(c.basis));
  const inventory = new Set(c.supportInventory.map(supportKey));
  for (const s of c.syntaxEvidence) {
    const support = {
      basis: c.basis,
      entity: { kind: 'SYNTAX_EVIDENCE', id: s.id, revisionId: c.basis.revisionId },
      valueDigest: createHash('sha256')
        .update(
          'runtime-syntax-support-v1\0' +
            canonical({
              schema: 'codeatlas.syntax-evidence',
              version: c.contextVersion === 5 ? 4 : 3,
              payload: s,
            }),
        )
        .digest('hex'),
    };
    inventory.add(supportKey(SupportRefSchema.parse(support)));
  }
  const known = new Set(
    [
      ...c.nodes.map((n) => ({ kind: 'CODE_NODE', id: n.id })),
      ...c.edges.map((n) => ({ kind: 'CODE_EDGE', id: n.id })),
      ...c.sourceFiles.map((n) => ({ kind: 'SOURCE_FILE', id: n.id })),
      ...c.syntaxEvidence.map((n) => ({ kind: 'SYNTAX_EVIDENCE', id: n.id })),
    ].map((r) =>
      entityRefKey({ ...r, id: EntityIdSchema.parse(r.id), revisionId: c.basis.revisionId }),
    ),
  );
  for (const s of payload.supportInventory) phase1Assert(inventory.has(supportKey(s)));
  for (const r of payload.externalRefs)
    phase1Assert(
      r.scope === 'REPOSITORY' &&
        r.repositoryId === c.basis.repositoryId &&
        known.has(entityRefKey(r.entity)),
    );
  phase1Assert(pluginV4CandidateUnits(out) <= c.maxItems);
  return freeze(out);
}
/** Existing SPI unit definition, reused by request-wide composition. No new budget or default. */
export function pluginV4CandidateUnits(out: z.infer<typeof PluginV4CandidateSchema>): number {
  const payload =
    out.capability === 'RUNTIME_FACT_SET'
      ? parseRuntimeFactSet(out.value).payload
      : out.capability === 'FRAMEWORK_BINDING_SET'
        ? FrameworkBindingSetSchema.parse(out.value.payload)
        : undefined;
  phase1Assert(payload);
  const records =
    'bindings' in payload
      ? payload.bindings
      : [
          ...payload.entryPoints,
          ...payload.tasks,
          ...payload.dataResources,
          ...payload.triggers,
          ...payload.contracts,
          ...payload.contexts,
          ...payload.nodes,
          ...payload.edges,
          ...payload.flows,
        ];
  const units =
    records.reduce((n, r) => n + 1 + r.supportRefs.length, 0) +
    payload.externalRefs.length +
    payload.supportInventory.length +
    out.support.length +
    out.coverage.limitations.length +
    out.coverage.unverifiedRefs.length;
  return units;
}
export type PluginV4Candidate = ReturnType<typeof validatePluginV4Candidate>;
export interface FrameworkPluginV4 {
  describe(): ReturnType<typeof validatePluginDescriptorV4>;
  detect(input: PluginV4Context): Promise<PluginV2Detection>;
  extract(input: PluginV4ExtractionContext): AsyncIterable<PluginV4Candidate>;
}
