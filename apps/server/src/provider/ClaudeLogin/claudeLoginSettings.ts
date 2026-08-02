/**
 * Avi Code addition: resolve the Claude config an instance id signs in against.
 *
 * The login flow needs the same `binaryPath` + `homePath` the driver would use,
 * but it runs outside the instance registry — a user signs in precisely when
 * the instance is *not* working, and an unauthenticated instance may not have a
 * live adapter to ask. So this reads settings directly, mirroring how
 * `ProviderInstanceRegistry` materializes an entry:
 *
 *   - `providerInstances[id]` wins when present, with its opaque `config`
 *     envelope decoded through `ClaudeSettings`.
 *   - the default instance falls back to legacy `providers.claudeAgent`, which
 *     is still the source of truth until the per-driver migration completes.
 *
 * An id belonging to another driver resolves to `undefined` rather than
 * throwing: sign-in is Claude-specific and callers surface that as an
 * unsupported-instance error.
 *
 * @module provider/ClaudeLogin/claudeLoginSettings
 */
import {
  ClaudeSettings,
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  type ProviderInstanceEnvironment,
  type ProviderInstanceId,
  type ServerSettings,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const decodeClaudeSettings = Schema.decodeUnknownOption(ClaudeSettings);

/** Claude's driver kind. Not `"claude"` — the registry key is `claudeAgent`. */
export const CLAUDE_DRIVER_KIND = ProviderDriverKind.make("claudeAgent");

export interface ResolvedClaudeLoginTarget {
  readonly settings: ClaudeSettings;
  /** Per-instance environment overrides, applied beneath `CLAUDE_CONFIG_DIR`. */
  readonly environment: ProviderInstanceEnvironment | undefined;
  readonly displayName: string | undefined;
}

/**
 * Resolve the Claude settings behind an instance id, or `undefined` when the id
 * is unknown or belongs to a different driver.
 */
export const resolveClaudeLoginTarget = (
  settings: Pick<ServerSettings, "providerInstances" | "providers">,
  instanceId: ProviderInstanceId,
): ResolvedClaudeLoginTarget | undefined => {
  const entry = settings.providerInstances?.[instanceId];
  if (entry) {
    if (entry.driver !== CLAUDE_DRIVER_KIND) return undefined;
    // `config` is deliberately opaque at the envelope layer. An entry whose
    // config fails to decode is the same case the registry treats as a shadow
    // snapshot; there is nothing to sign in against, so report it as unknown.
    const decoded = decodeClaudeSettings(entry.config ?? {});
    if (Option.isNone(decoded)) return undefined;
    return {
      settings: decoded.value,
      environment: entry.environment,
      displayName: entry.displayName,
    };
  }

  if (instanceId !== defaultInstanceIdForDriver(CLAUDE_DRIVER_KIND)) return undefined;
  return {
    settings: settings.providers.claudeAgent,
    environment: undefined,
    displayName: undefined,
  };
};
