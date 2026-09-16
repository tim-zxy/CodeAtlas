import { z } from 'zod';

function exactNonBlankString(label: string) {
  return z
    .string()
    .refine((value) => value.length > 0 && value.trim().length > 0 && value === value.trim(), {
      message: `${label} must be exact and non-blank`,
    });
}

export const ProviderFactIdSchema =
  exactNonBlankString('Provider Fact ID').brand<'ProviderFactId'>();
export type ProviderFactId = z.infer<typeof ProviderFactIdSchema>;

export const NodeFactKeySchema = exactNonBlankString('Node FactKey').brand<'NodeFactKey'>();
export type NodeFactKey = z.infer<typeof NodeFactKeySchema>;

export const EdgeFactKeySchema = exactNonBlankString('Edge FactKey').brand<'EdgeFactKey'>();
export type EdgeFactKey = z.infer<typeof EdgeFactKeySchema>;

export const CodeFactNameSchema = exactNonBlankString('Code Fact name').brand<'CodeFactName'>();
export type CodeFactName = z.infer<typeof CodeFactNameSchema>;

export const QualifiedCodeFactNameSchema = exactNonBlankString(
  'Qualified Code Fact name',
).brand<'QualifiedCodeFactName'>();
export type QualifiedCodeFactName = z.infer<typeof QualifiedCodeFactNameSchema>;

export const ProviderFactKindSchema =
  exactNonBlankString('Provider Fact kind').brand<'ProviderFactKind'>();
export type ProviderFactKind = z.infer<typeof ProviderFactKindSchema>;

export const UnresolvedTargetHintSchema =
  exactNonBlankString('Unresolved target hint').brand<'UnresolvedTargetHint'>();
export type UnresolvedTargetHint = z.infer<typeof UnresolvedTargetHintSchema>;
