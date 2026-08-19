/**
 * Avi Code addition: tracks whether a preview tab is mid-drag toward the
 * split drop zone.
 *
 * The desktop preview is a native view that always paints above the DOM, so a
 * DOM drop-zone overlay would be hidden behind it. While a preview tab is being
 * dragged, mounted previews read this flag and hide their native slot, letting
 * the overlay show. It flips back on drop, restoring the webview.
 */
import { create } from "zustand";

interface PreviewTabDragState {
  dragging: boolean;
  setDragging: (dragging: boolean) => void;
}

export const usePreviewTabDragStore = create<PreviewTabDragState>((set) => ({
  dragging: false,
  setDragging: (dragging) => set((state) => (state.dragging === dragging ? state : { dragging })),
}));
