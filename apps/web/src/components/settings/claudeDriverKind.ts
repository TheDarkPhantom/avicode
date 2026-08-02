/**
 * Avi Code addition: the driver kind Claude instances are registered under.
 *
 * Its own module so the constant is constructed once rather than per render,
 * and so the fork's Claude-specific settings UI has a single place to check
 * against. Note the value is `claudeAgent`, not `claude` — the shorter name is
 * only ever the display label.
 *
 * @module components/settings/claudeDriverKind
 */
import { ProviderDriverKind } from "@t3tools/contracts";

export const CLAUDE_DRIVER_KIND = ProviderDriverKind.make("claudeAgent");
