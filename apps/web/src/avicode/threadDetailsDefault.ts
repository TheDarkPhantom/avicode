// rightPanelStore cannot import hooks/useSettings without a module cycle, so useSettings registers
// the setting here and the store reads it, like newThreadInteractionMode.
let readShowThreadDetails: () => boolean = () => true;
const listeners = new Set<() => void>();

export function registerShowThreadDetailsSource(
  read: () => boolean,
  subscribe: (listener: () => void) => () => void,
): void {
  readShowThreadDetails = read;
  let current = read();
  subscribe(() => {
    const next = read();
    if (next === current) return;
    current = next;
    for (const listener of listeners) listener();
  });
}

/** Whether a thread's inline details card is open before the user toggles it there. */
export function readThreadDetailsOpenByDefault(): boolean {
  return readShowThreadDetails();
}

export function onThreadDetailsDefaultChange(listener: () => void): void {
  listeners.add(listener);
}
