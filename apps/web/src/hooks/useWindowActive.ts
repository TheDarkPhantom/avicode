import { useSyncExternalStore } from "react";

/**
 * The document surface this predicate reads. Narrowed to the two signals so
 * tests can pass a plain object instead of standing up a DOM.
 */
export type WindowActivityDocument = Pick<Document, "visibilityState" | "hasFocus">;

/**
 * Whether this window is the one the user is actually looking at.
 *
 * Focus is checked as well as visibility because visibility alone is not
 * enough on the desktop app: a window sitting behind the editor stays
 * `visibilityState === "visible"`, so anything that treats visible as "the
 * user saw it" would count work they never looked at.
 */
export function isWindowActive(doc: WindowActivityDocument): boolean {
  return doc.visibilityState === "visible" && doc.hasFocus();
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // `focus`/`blur` fire on the window, `visibilitychange` only on the
  // document — both inputs of isWindowActive need their own listener.
  window.addEventListener("focus", callback);
  window.addEventListener("blur", callback);
  document.addEventListener("visibilitychange", callback);
  return () => {
    window.removeEventListener("focus", callback);
    window.removeEventListener("blur", callback);
    document.removeEventListener("visibilitychange", callback);
  };
}

function getSnapshot(): boolean {
  if (typeof document === "undefined") return true;
  return isWindowActive(document);
}

// Outside a browser there is no window to be away from: report active so
// nothing gates itself off permanently.
function getServerSnapshot(): boolean {
  return true;
}

export function useWindowActive(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
