import { useEffect, useRef } from "react";

/**
 * Avi Code addition: reloads a file preview that failed only because the file did
 * not exist yet, so a path an agent is about to write opens itself the moment it
 * lands instead of stranding the tab on a read error.
 *
 * Two triggers, because a checkpoint is the reliable "files changed" push but it
 * usually lands at turn end, not the instant a file is written:
 *  - push: re-read once whenever the owning thread's checkpoint signal changes.
 *  - bounded poll: while the thread is actively working and the file is still
 *    missing, retry on a short interval, capped so nothing repaints once the
 *    thread goes idle or the file appears.
 *
 * The read/asset atom is shared, so a successful reload flips `shouldReload`
 * false and both effects stop on their own.
 */
const AUTO_RELOAD_INTERVAL_MS = 1500;
const AUTO_RELOAD_MAX_ATTEMPTS = 20;

interface MissingFileAutoReloadInput {
  /** True while the preview is failed specifically because the file is missing. */
  readonly shouldReload: boolean;
  /** True while the owning thread is running a turn. */
  readonly isThreadWorking: boolean;
  /** Changes whenever the thread checkpoints, i.e. when files may have appeared. */
  readonly reloadSignal: string;
  readonly onReload: () => void;
}

export function useMissingFileAutoReload({
  shouldReload,
  isThreadWorking,
  reloadSignal,
  onReload,
}: MissingFileAutoReloadInput): void {
  const onReloadRef = useRef(onReload);
  onReloadRef.current = onReload;

  const lastSignalRef = useRef(reloadSignal);
  useEffect(() => {
    if (lastSignalRef.current === reloadSignal) return;
    lastSignalRef.current = reloadSignal;
    if (shouldReload) onReloadRef.current();
  }, [reloadSignal, shouldReload]);

  useEffect(() => {
    if (!shouldReload || !isThreadWorking) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      onReloadRef.current();
      if (attempts >= AUTO_RELOAD_MAX_ATTEMPTS) clearInterval(timer);
    }, AUTO_RELOAD_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [shouldReload, isThreadWorking]);
}
