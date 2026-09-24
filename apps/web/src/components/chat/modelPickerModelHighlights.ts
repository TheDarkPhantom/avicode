import type { ProviderDriverKind } from "@t3tools/contracts";

/**
 * Model slugs that show a gold "NEW" chip in the model picker list.
 * Add entries as `provider:slug` when you want to highlight freshly shipped models.
 */
const NEW_MODEL_KEYS = new Set<string>([
  // Avi Code addition: highlight Claude Opus 5.5 as newly shipped.
  "claudeAgent:claude-opus-5-5",
]);

export function isModelPickerNewModel(provider: ProviderDriverKind, slug: string): boolean {
  return NEW_MODEL_KEYS.has(`${provider}:${slug}`);
}
