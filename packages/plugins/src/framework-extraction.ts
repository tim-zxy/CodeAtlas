import {
  springSurfaceRules,
  type SurfaceHttpDeclaration,
  mongoSurfaceRules,
} from './framework-surface-compiler.js';
import { validatePluginV5Context } from './plugin-context-v5.js';
import type { FrameworkContext } from './framework-bindings.js';
import {
  phase1Assert,
  ProviderSnapshotDiagnosticSchema,
  type ProviderSnapshotDiagnostic,
} from '@codeatlas/ir';
import { validatePluginV4Context } from './plugin-context-v4.js';
import { MAX_PLUGIN_CONTEXT_FACTS } from './plugin-spi.js';
import {
  createFrameworkBindingIndex,
  combineSupport,
  syntaxSupport,
} from './framework-bindings.js';
import {
  createFrameworkDraftFromValidatedContext,
  type FrameworkDraft,
} from './framework-draft.js';
import {
  springRules,
  mongoRules,
  kafkaRules,
  fastapiRules,
  type Emit,
  type Diagnose,
} from './framework-rules.js';
export type FrameworkExtractionResult = {
  drafts: FrameworkDraft[];
  diagnostics: ProviderSnapshotDiagnostic[];
};
function freeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
}
export function extractFrameworkDrafts(
  input: unknown,
  framework: 'spring' | 'mongo' | 'kafka' | 'fastapi',
): FrameworkExtractionResult {
  return extractFrameworkDraftsFromValidatedContext(validatePluginV4Context(input), framework);
}
/** Private shared fixed-rule extraction; callers must validate Context4 first. */
export function extractFrameworkDraftsFromValidatedContext(
  c: FrameworkContext,
  framework: 'spring' | 'mongo' | 'kafka' | 'fastapi',
  includeFeign = false,
): FrameworkExtractionResult {
  phase1Assert(['spring', 'mongo', 'kafka', 'fastapi'].includes(framework));
  const index = createFrameworkBindingIndex(c);
  const drafts = new Map<string, FrameworkDraft>(),
    diagnostics = new Map<string, ProviderSnapshotDiagnostic>();
  const prefixes = {
    spring: ['org.springframework'],
    mongo: ['org.springframework.data.mongodb', 'com.mongodb'],
    kafka: ['org.springframework.kafka', 'org.apache.kafka'],
    fastapi: ['fastapi'],
  }[framework];
  if (
    !c.syntaxEvidence.some(
      (s) =>
        s.syntaxKind === 'IMPORT_BINDING' &&
        prefixes.some(
          (p) => s.payload.qualifiedName === p || s.payload.qualifiedName?.startsWith(p + '.'),
        ),
    )
  )
    return freeze({ drafts: [], diagnostics: [] });
  const reserve = () => phase1Assert(drafts.size + diagnostics.size < MAX_PLUGIN_CONTEXT_FACTS);
  const emit: Emit = (ruleId, site, proposal, support) => {
    const all = combineSupport(support, [syntaxSupport(site)]);
    const draft = createFrameworkDraftFromValidatedContext(c, {
      framework,
      ruleId,
      sourceRange: site.sourceRange,
      proposal,
      support: all,
    });
    const key = draft.value.payload.draftKey,
      old = drafts.get(key);
    if (!old) {
      reserve();
      drafts.set(key, draft);
    } else if (
      ruleId < old.value.payload.ruleId ||
      (ruleId === old.value.payload.ruleId && JSON.stringify(all) < JSON.stringify(old.support))
    )
      drafts.set(key, draft);
  };
  const diagnose: Diagnose = (site, code = 'FRAMEWORK_BINDING_UNPROVEN') => {
    const d = ProviderSnapshotDiagnosticSchema.parse({
      code,
      severity: 'WARNING',
      message: 'Framework declaration could not be proved',
      sourceRange: site.sourceRange,
    });
    const key = JSON.stringify([d.sourceRange, code]);
    if (!diagnostics.has(key)) {
      reserve();
      diagnostics.set(key, d);
    }
  };
  if (framework === 'spring') {
    const declarations: SurfaceHttpDeclaration[] = [];
    springRules(
      index,
      (rule, site, proposal, support) => {
        emit(rule, site, proposal, support);
        if (proposal.kind === 'HTTP' && proposal.direction === 'CONSUMER')
          declarations.push({ site, proposal, support });
      },
      diagnose,
      includeFeign,
    );
    if (c.contextVersion === 5) springSurfaceRules(index, emit, diagnose, declarations);
  } else if (framework === 'mongo') {
    mongoRules(index, emit, diagnose);
    if (c.contextVersion === 5) mongoSurfaceRules(index, emit, diagnose);
  } else if (framework === 'kafka') kafkaRules(index, emit, diagnose);
  else fastapiRules(index, emit, diagnose);
  return freeze({
    drafts: [...drafts.values()].sort((a, b) =>
      a.value.payload.draftKey < b.value.payload.draftKey
        ? -1
        : a.value.payload.draftKey > b.value.payload.draftKey
          ? 1
          : 0,
    ),
    diagnostics: [...diagnostics.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, v]) => v),
  });
}

/** Strict V5 entry; old extraction remains Context4-only. */
export function extractFrameworkSurfaceDrafts(
  input: unknown,
  framework: 'spring' | 'mongo' | 'kafka' | 'fastapi',
): FrameworkExtractionResult {
  return extractFrameworkDraftsFromValidatedContext(
    validatePluginV5Context(input),
    framework,
    true,
  );
}
