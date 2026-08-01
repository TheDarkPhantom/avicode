import { memo } from "react";

import { cn } from "~/lib/utils";
import { LEVEL_WINDOW, type DictationSignalState } from "~/voice/audioLevel";
import type { DictationStatus } from "~/voice/useDictation";

/**
 * Avi Code addition: shows that the microphone is actually hearing something.
 *
 * Dictation's silent failure looks identical to success. The button lights, the
 * stream opens, Deepgram answers, and a muted or wrongly-routed microphone
 * transcribes to nothing with no error anywhere. These bars are the only place
 * that distinction becomes visible.
 *
 * Bars are scaled with a transform and a short transition rather than animated
 * frame by frame, so the browser composites them instead of repainting. They
 * also only exist while dictation runs, which is a bounded, user-initiated
 * window rather than an always-on animation.
 */

/** Floor so an idle meter reads as bars at rest rather than as missing UI. */
const MIN_BAR_SCALE = 0.16;

/**
 * Stable identities for the bars. A bar is its slot in the meter, not the
 * sample currently in it, so these never reorder and React never remounts one
 * mid-session.
 */
const BAR_IDS = Array.from({ length: LEVEL_WINDOW }, (_, index) => `bar-${index}`);

function signalLabel(input: {
  readonly signal: DictationSignalState;
  readonly status: DictationStatus;
}): string {
  if (input.status === "stopping") return "Finishing up";
  if (input.status === "starting") return "Connecting";
  switch (input.signal) {
    case "silent":
      return "No sound detected";
    case "hearing":
      return "Listening";
    case "waiting":
      return "Say something";
  }
}

export const DictationLevelMeter = memo(function DictationLevelMeter({
  levels,
  signal,
  status,
}: {
  readonly levels: readonly number[];
  readonly signal: DictationSignalState;
  readonly status: DictationStatus;
}) {
  const isSilent = signal === "silent" && status === "recording";
  const label = signalLabel({ signal, status });

  return (
    <div
      className="flex shrink-0 items-center gap-1.5"
      // One live region for the whole meter: the bars are decorative, the
      // words are the part a screen reader needs, and it should not be
      // announced on every sample.
      role="status"
      aria-live="polite"
      data-testid="dictation-level-meter"
      data-dictation-signal={signal}
    >
      <div className="flex h-3.5 items-center gap-[2px]" aria-hidden="true">
        {BAR_IDS.map((barId, index) => (
          <span
            key={barId}
            className={cn(
              "w-[2px] origin-center rounded-full transition-transform duration-100 ease-out",
              isSilent ? "bg-muted-foreground/40" : "bg-destructive/80",
            )}
            style={{
              height: "100%",
              transform: `scaleY(${Math.max(MIN_BAR_SCALE, levels[index] ?? 0)})`,
            }}
          />
        ))}
      </div>
      <span
        className={cn(
          "whitespace-nowrap text-[11px] leading-none",
          isSilent ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
});
