import {
  type EnvironmentId,
  isProviderSkillsSnapshotCurrent,
  PROVIDER_SKILLS_SNAPSHOT_TTL_MS,
  type ServerProvider,
} from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import type { ComposerTriggerKind } from "../../composer-logic";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";

/**
 * Asks the server to rescan the selected provider's skills and slash commands
 * when the composer's skill or command menu opens on a snapshot older than
 * `PROVIDER_SKILLS_SNAPSHOT_TTL_MS`. Nothing watches skill directories, so this
 * is how a skill added since the last check reaches the menu without a server
 * restart. The menu re-renders when the refreshed snapshot streams in.
 *
 * Avi Code addition: upstream (#16750) rescans per-workspace snapshots on
 * composer mount. This fork's skills live on the provider snapshot, and a
 * rescan is a full provider probe, so it waits until the user opens a menu
 * that lists skills or commands. That keeps battery-saver's longer health
 * interval meaningful while typing.
 */
export function useRefreshStaleProviderSkills(input: {
  readonly environmentId: EnvironmentId;
  readonly provider: ServerProvider | null;
  readonly menuKind: ComposerTriggerKind | null;
}): void {
  const { environmentId, provider, menuKind } = input;
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  // The last rescan this composer asked for. A request inside the TTL is not
  // repeated, so a client clock ahead of the server's cannot loop rescans.
  const lastRequestRef = useRef<{ key: string; requestedAt: number } | null>(null);
  const listsSkills = menuKind === "slash-command" || menuKind === "skill";

  useEffect(() => {
    if (!listsSkills || !provider?.enabled) return;
    const key = `${environmentId}:${provider.instanceId}`;
    const now = Date.now();
    const lastRequest = lastRequestRef.current;
    if (lastRequest?.key === key && now - lastRequest.requestedAt < PROVIDER_SKILLS_SNAPSHOT_TTL_MS)
      return;
    if (isProviderSkillsSnapshotCurrent(provider, now)) return;
    lastRequestRef.current = { key, requestedAt: now };
    // The server re-checks staleness on its own clock and answers from its
    // cache when another client already rescanned.
    void refreshProviders({
      environmentId,
      input: { instanceId: provider.instanceId, ifStale: true },
    });
  }, [environmentId, listsSkills, provider, refreshProviders]);
}
