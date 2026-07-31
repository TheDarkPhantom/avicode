import { ProviderDriverKind } from "@t3tools/contracts";
import { ClaudeAI, CursorIcon, GrokIcon, Icon, OpenAI, OpenCodeIcon } from "../Icons";
import { PROVIDER_OPTIONS } from "../../session-logic";

export const PROVIDER_ICON_BY_PROVIDER: Partial<Record<ProviderDriverKind, Icon>> = {
  [ProviderDriverKind.make("codex")]: OpenAI,
  [ProviderDriverKind.make("claudeAgent")]: ClaudeAI,
  [ProviderDriverKind.make("opencode")]: OpenCodeIcon,
  [ProviderDriverKind.make("cursor")]: CursorIcon,
  [ProviderDriverKind.make("grok")]: GrokIcon,
};

function isAvailableProviderOption(option: (typeof PROVIDER_OPTIONS)[number]): option is {
  value: ProviderDriverKind;
  label: string;
  available: true;
  pickerSidebarBadge?: "new" | "soon";
} {
  return option.available;
}

export const AVAILABLE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter(isAvailableProviderOption);

export type ModelEsque = {
  slug: string;
  name: string;
  shortName?: string | undefined;
  subProvider?: string | undefined;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingQualifier(value: string, qualifier: string | null | undefined): string {
  const trimmedQualifier = qualifier?.trim();
  if (!trimmedQualifier) {
    return value;
  }

  const pattern = new RegExp(`^${escapeRegExp(trimmedQualifier)}(?:\\s*[.:/-]\\s*|\\s+)`, "iu");
  return value.replace(pattern, "").trim() || value;
}

export function getDisplayModelName(
  model: ModelEsque,
  options?: { preferShortName?: boolean },
): string {
  const name = options?.preferShortName && model.shortName ? model.shortName : model.name;
  return stripLeadingQualifier(name, model.subProvider);
}

export function getTriggerDisplayModelName(model: ModelEsque): string {
  return getDisplayModelName(model, { preferShortName: true });
}

/**
 * Avi Code addition: vendor words the composer trigger drops, because the
 * provider icon immediately to the left of the label already says who made the
 * model. Only prefixes that leave a self-sufficient name behind belong here —
 * "Grok 4" would degrade to a bare "4", so Grok is deliberately absent, and
 * Codex and OpenCode models carry no vendor prefix to begin with.
 */
const REDUNDANT_VENDOR_PREFIXES = ["Claude"];

/**
 * Strip the vendor word from a model name for display next to a provider icon.
 * Falls back to the full name whenever stripping would leave something that
 * cannot stand alone, so an unforeseen "Claude 4.5" keeps its vendor word
 * rather than rendering as "4.5".
 */
export function stripRedundantVendorPrefix(value: string): string {
  for (const prefix of REDUNDANT_VENDOR_PREFIXES) {
    const stripped = stripLeadingQualifier(value, prefix);
    if (stripped !== value && !/^[\d.]/u.test(stripped)) {
      return stripped;
    }
  }
  return value;
}

/**
 * The trigger label for a model rendered beside its provider icon. Callers
 * without an icon must use {@link getTriggerDisplayModelName} instead, or the
 * label loses the only thing naming the vendor.
 */
export function getIconAdjacentModelName(model: ModelEsque): string {
  return stripRedundantVendorPrefix(getTriggerDisplayModelName(model));
}

export function getTriggerDisplayModelLabel(model: ModelEsque): string {
  return getTriggerDisplayModelName(model);
}
