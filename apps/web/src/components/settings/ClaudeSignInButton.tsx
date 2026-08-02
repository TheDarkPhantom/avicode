"use client";

/**
 * Avi Code addition: per-instance "Sign in" action for Claude providers.
 *
 * Rendered through `ProviderInstanceCard`'s existing `headerAction` slot rather
 * than as a new card prop, so the upstream card stays untouched and an upstream
 * rewrite of it cannot conflict with this feature.
 *
 * @module components/settings/ClaudeSignInButton
 */
import { LogInIcon } from "lucide-react";
import { type ProviderInstanceId } from "@t3tools/contracts";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useAtomCommand } from "../../state/use-atom-command";
import { usePrimaryEnvironment } from "../../state/environments";
import { claudeLoginStartCommand, openClaudeLoginSession } from "./claudeLoginSession";

export function ClaudeSignInButton({
  instanceId,
  displayName,
  needsAuth,
}: {
  readonly instanceId: ProviderInstanceId;
  readonly displayName: string;
  /** Emphasised when the instance has no working credential. */
  readonly needsAuth: boolean;
}) {
  const primaryEnvironment = usePrimaryEnvironment();
  const startLogin = useAtomCommand(claudeLoginStartCommand, { reportFailure: false });

  const handleClick = () => {
    if (!primaryEnvironment) return;
    // The promise resolves when the dialog closes; the command races it so
    // cancelling interrupts the stream and kills the server-side CLI.
    const cancelled = openClaudeLoginSession(instanceId, displayName);
    void startLogin({
      environmentId: primaryEnvironment.environmentId,
      instanceId,
      cancelled,
    });
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="xs"
            variant={needsAuth ? "secondary" : "ghost"}
            className="h-6 gap-1 px-2 text-xs"
            onClick={handleClick}
            disabled={!primaryEnvironment}
          >
            <LogInIcon className="size-3 shrink-0" aria-hidden />
            Sign in
          </Button>
        }
      />
      <TooltipPopup side="top">
        Run `claude auth login` against this instance's config directory
      </TooltipPopup>
    </Tooltip>
  );
}
