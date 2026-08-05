import { create } from "zustand";

/**
 * Avi Code addition: a request to start a thread's dev server, raised from a
 * surface that cannot start it itself.
 *
 * Running a project action needs the thread's terminal machinery, which lives in
 * ChatView and only exists for the active thread. The sidebar's "start dev
 * server" button navigates to the thread and then leaves a request here; ChatView
 * consumes it once that thread is active. The value is a nonce, so asking again
 * for the already-active thread still fires.
 */
interface DevServerStartIntentState {
  readonly pendingByThreadKey: Record<string, number>;
  readonly request: (threadKey: string) => void;
  readonly consume: (threadKey: string) => void;
}

export const useDevServerStartIntent = create<DevServerStartIntentState>()((set) => ({
  pendingByThreadKey: {},
  request: (threadKey) =>
    set((state) => ({
      pendingByThreadKey: {
        ...state.pendingByThreadKey,
        [threadKey]: (state.pendingByThreadKey[threadKey] ?? 0) + 1,
      },
    })),
  consume: (threadKey) =>
    set((state) => {
      if (!(threadKey in state.pendingByThreadKey)) return state;
      const next = { ...state.pendingByThreadKey };
      delete next[threadKey];
      return { pendingByThreadKey: next };
    }),
}));
