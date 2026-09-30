import * as Schema from "effect/Schema";
import { Minimize2Icon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";
import { type ContextWindowSnapshot, formatContextWindowTokens } from "~/lib/contextWindow";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";
import {
  hasDismissedResumeCompaction,
  resumeCompactionOfferTime,
} from "./ContextWindowMeter.logic";

const EMPTY_DISMISSED_KEYS: ReadonlySet<string> = new Set();

/**
 * Avi Code addition (upstream #8144): the "Resume with less context" banner.
 *
 * Offers `/compact` when a Claude thread returns after Claude's own old-session
 * thresholds (70 minutes idle, 100k tokens). "Keep full history" dismisses it
 * for this snapshot; answering Claude's native resume dialog with "Don't ask
 * again" silences it for the provider instance on this device.
 *
 * Eligibility is time based, so one timer fires when the snapshot crosses the
 * idle threshold rather than a clock re-rendering the chat view.
 */
export function useResumeCompactionBanner(input: {
  readonly environmentId: string;
  readonly providerInstanceId: string | null;
  readonly threadId: string | null;
  readonly provider: string;
  readonly contextWindow: ContextWindowSnapshot | null;
  readonly activities: ReadonlyArray<{ readonly kind: string; readonly payload: unknown }>;
  readonly blocked: boolean;
  readonly compactDisabled: boolean;
  readonly compactDisabledReason: string | null;
  readonly onCompact: () => void;
}): ComposerBannerStackItem | null {
  const [permanentlyDismissed, setPermanentlyDismissed] = useLocalStorage(
    `avicode:resume-compaction-dismissed:${input.environmentId}:${input.providerInstanceId ?? "claudeAgent"}`,
    false,
    Schema.Boolean,
  );
  const nativeDismissed = useMemo(
    () => hasDismissedResumeCompaction(input.activities),
    [input.activities],
  );
  useEffect(() => {
    if (nativeDismissed && !permanentlyDismissed) {
      setPermanentlyDismissed(true);
    }
  }, [nativeDismissed, permanentlyDismissed, setPermanentlyDismissed]);

  // Session-scoped dismissals, one key per (thread, snapshot), so dismissing
  // one thread does not resurface another dismissed earlier.
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(EMPTY_DISMISSED_KEYS);
  const snapshotKey =
    input.threadId && input.contextWindow
      ? `${input.threadId}:${input.contextWindow.updatedAt}`
      : null;

  const offerAt = input.contextWindow
    ? resumeCompactionOfferTime({
        provider: input.provider,
        usedTokens: input.contextWindow.usedTokens,
        updatedAt: input.contextWindow.updatedAt,
      })
    : null;
  const [eligibleOfferAt, setEligibleOfferAt] = useState<number | null>(null);
  useEffect(() => {
    if (offerAt === null) return;
    const delay = offerAt - Date.now();
    if (delay <= 0) {
      setEligibleOfferAt(offerAt);
      return;
    }
    const timeout = setTimeout(() => setEligibleOfferAt(offerAt), delay);
    return () => clearTimeout(timeout);
  }, [offerAt]);
  const eligible = offerAt !== null && eligibleOfferAt === offerAt;

  // Read through a ref so a new callback each render keeps the item stable.
  const onCompactRef = useRef(input.onCompact);
  useEffect(() => {
    onCompactRef.current = input.onCompact;
  });
  const { compactDisabled, compactDisabledReason } = input;
  const usedTokens = input.contextWindow?.usedTokens ?? null;
  return useMemo<ComposerBannerStackItem | null>(() => {
    if (
      snapshotKey === null ||
      !eligible ||
      input.blocked ||
      permanentlyDismissed ||
      nativeDismissed ||
      dismissedKeys.has(snapshotKey)
    ) {
      return null;
    }
    const compactAction = (
      <Button
        size="xs"
        variant="outline"
        disabled={compactDisabled}
        onClick={() => {
          if (!compactDisabled) onCompactRef.current();
        }}
      >
        Compact
      </Button>
    );
    return {
      id: `resume-compaction:${snapshotKey}`,
      variant: "info",
      icon: <Minimize2Icon />,
      title: "Resume with less context",
      description: `${formatContextWindowTokens(usedTokens)} tokens from earlier`,
      actions: compactDisabledReason ? (
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex">{compactAction}</span>} />
          <TooltipPopup side="top">{compactDisabledReason}</TooltipPopup>
        </Tooltip>
      ) : (
        compactAction
      ),
      dismissLabel: "Keep full history",
      onDismiss: () => setDismissedKeys((keys) => new Set(keys).add(snapshotKey)),
    };
  }, [
    compactDisabled,
    compactDisabledReason,
    dismissedKeys,
    eligible,
    input.blocked,
    nativeDismissed,
    permanentlyDismissed,
    snapshotKey,
    usedTokens,
  ]);
}
