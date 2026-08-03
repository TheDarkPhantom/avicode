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
import { cn } from "../../lib/utils";
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
          // Icon-only: this sits in the card's title row beside the reset and
          // delete icons, which is too tight for a labelled button. The label
          // lives in the tooltip instead.
          <Button
            size="icon-xs"
            variant="ghost"
            className={cn(
              "size-5 rounded-sm p-0",
              needsAuth ? "text-warning hover:text-warning" : "text-muted-foreground",
              "hover:text-foreground",
            )}
            onClick={handleClick}
            disabled={!primaryEnvironment}
            aria-label={
              needsAuth
                ? `Sign in to ${displayName}, not authenticated`
                : `Sign in to ${displayName}`
            }
          >
            <LogInIcon className="size-3 shrink-0" aria-hidden />
          </Button>
        }
      />
      <TooltipPopup side="top">
        {needsAuth ? "Not signed in. Sign in to this instance" : "Sign in to this instance"}
      </TooltipPopup>
    </Tooltip>
  );
}
