import normalizeSyntaxObservationCore from './syntax-normalizer-core.js';
import type { SyntaxEvidenceV4 } from '@codeatlas/ir';
import type { CodeSyntaxCompositionBudget } from './native-code-syntax-budget.js';
export default function normalizeFrameworkSurfaceObservation(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
): SyntaxEvidenceV4 {
  return normalizeSyntaxObservationCore(input, context, 4) as SyntaxEvidenceV4;
}
