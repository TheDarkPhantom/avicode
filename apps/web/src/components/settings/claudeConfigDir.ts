/**
 * Avi Code addition: keep Claude instances off each other's credentials.
 *
 * A Claude instance with an empty `CLAUDE_CONFIG_DIR` resolves to `~/.claude`,
 * which is also where the default instance lives. Two such instances are not
 * two accounts — they are one credential with two names, and signing either one
 * in silently re-authenticates the other. That is invisible in the UI until the
 * account label on an unrelated instance changes underneath you.
 *
 * This module supplies both halves of the guard: a distinct directory to
 * prefill when an instance is created, and the sharing check the sign-in dialog
 * warns with.
 *
 * @module components/settings/claudeConfigDir
 */
import type { ProviderInstanceConfigMap, ProviderInstanceId } from "@t3tools/contracts";

import { CLAUDE_DRIVER_KIND } from "./claudeDriverKind";

/** What an empty `homePath` resolves to on the server. */
export const DEFAULT_CLAUDE_CONFIG_DIR = "~/.claude";

/**
 * Compare two config directories the way the filesystem does. Separators are
 * unified and case is dropped: Windows and macOS both treat `\` vs `/` and
 * `.Claude` vs `.claude` as the same directory, so a comparison that did not
 * would miss real collisions and warn about nothing.
 */
export const normalizeClaudeConfigDir = (value: string): string =>
  value.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** Resolve an instance's configured directory, treating empty as the default. */
export const resolveClaudeConfigDir = (homePath: string | undefined): string => {
  const trimmed = homePath?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : DEFAULT_CLAUDE_CONFIG_DIR;
};

/**
 * Suggest a directory for a new instance, derived from its id.
 *
 * Kept beside `~/.claude` rather than inside it, because Claude Code owns that
 * directory's contents. The driver prefix is dropped from the slug so the id
 * `claudeAgent_avi` reads as `~/.claude-avi` instead of `~/.claude-claudeagent-avi`.
 *
 * `takenDirs` is not optional in spirit: suggesting a directory another
 * instance already uses would recreate the exact sharing this is meant to
 * prevent, and shortening the slug makes that collision far more likely.
 */
export const suggestClaudeConfigDir = (
  instanceId: string,
  takenDirs: ReadonlyArray<string> = [],
): string => {
  const slug = instanceId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^claude-?agent-?/, "")
    .replace(/^claude-?/, "")
    .replace(/^-+|-+$/g, "");
  if (slug.length === 0) return DEFAULT_CLAUDE_CONFIG_DIR;

  const taken = new Set(takenDirs.map(normalizeClaudeConfigDir));
  const base = `~/.claude-${slug}`;
  if (!taken.has(normalizeClaudeConfigDir(base))) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(normalizeClaudeConfigDir(candidate))) return candidate;
  }
  return base;
};

/** Every config directory currently claimed by a Claude instance. */
export const collectClaudeConfigDirs = (input: {
  readonly instances: ProviderInstanceConfigMap | undefined;
  readonly legacyClaudeHomePath: string | undefined;
}): ReadonlyArray<string> => {
  const dirs = [resolveClaudeConfigDir(input.legacyClaudeHomePath)];
  for (const entry of Object.values(input.instances ?? {})) {
    if (entry.driver !== CLAUDE_DRIVER_KIND) continue;
    const homePath = (entry.config as { readonly homePath?: unknown } | undefined)?.homePath;
    dirs.push(resolveClaudeConfigDir(typeof homePath === "string" ? homePath : undefined));
  }
  return dirs;
};

export interface ClaudeConfigDirSibling {
  readonly instanceId: ProviderInstanceId;
  readonly label: string;
}

/**
 * Other Claude instances that would share this instance's credential.
 *
 * `legacyClaudeHomePath` is the pre-migration `providers.claudeAgent` block,
 * which still backs the default instance until the user edits it. Leaving it
 * out would miss the most common collision of all: a new instance sharing
 * `~/.claude` with the default one.
 */
export const findClaudeConfigDirSiblings = (input: {
  readonly instances: ProviderInstanceConfigMap | undefined;
  readonly legacyClaudeHomePath: string | undefined;
  readonly instanceId: ProviderInstanceId;
  readonly defaultInstanceId: ProviderInstanceId;
}): ReadonlyArray<ClaudeConfigDirSibling> => {
  const instances = input.instances ?? {};
  const entries = Object.entries(instances) as ReadonlyArray<
    readonly [ProviderInstanceId, ProviderInstanceConfigMap[ProviderInstanceId]]
  >;

  const configDirFor = (instanceId: ProviderInstanceId): string | undefined => {
    const entry = instances[instanceId];
    if (entry) {
      if (entry.driver !== CLAUDE_DRIVER_KIND) return undefined;
      const homePath = (entry.config as { readonly homePath?: unknown } | undefined)?.homePath;
      return resolveClaudeConfigDir(typeof homePath === "string" ? homePath : undefined);
    }
    // Absent from the map: only the default instance still resolves, and it
    // does so through the legacy block.
    return instanceId === input.defaultInstanceId
      ? resolveClaudeConfigDir(input.legacyClaudeHomePath)
      : undefined;
  };

  const target = configDirFor(input.instanceId);
  if (target === undefined) return [];
  const normalizedTarget = normalizeClaudeConfigDir(target);

  const siblings: ClaudeConfigDirSibling[] = [];
  const seen = new Set<string>();

  const consider = (instanceId: ProviderInstanceId, displayName: string | undefined) => {
    if (instanceId === input.instanceId || seen.has(instanceId)) return;
    const dir = configDirFor(instanceId);
    if (dir === undefined || normalizeClaudeConfigDir(dir) !== normalizedTarget) return;
    seen.add(instanceId);
    siblings.push({ instanceId, label: displayName?.trim() || instanceId });
  };

  for (const [instanceId, entry] of entries) {
    consider(instanceId, entry.displayName);
  }
  // The default instance is only in the map once it has been edited.
  if (!(input.defaultInstanceId in instances)) {
    consider(input.defaultInstanceId, "Claude");
  }

  return siblings;
};
