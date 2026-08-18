import { describe, expect, it } from "vite-plus/test";

import {
  resolveAppliedThreadSidebarWidth,
  resolveInitialThreadSidebarWidth,
  THREAD_MAIN_CONTENT_MIN_WIDTH,
  THREAD_SIDEBAR_DEFAULT_WIDTH,
  THREAD_SIDEBAR_MIN_WIDTH,
} from "./threadSidebarWidth";

describe("thread sidebar width", () => {
  it("uses the default width when no preference is stored", () => {
    expect(resolveInitialThreadSidebarWidth(null, 1200)).toBe(THREAD_SIDEBAR_DEFAULT_WIDTH);
  });

  it("uses a stored width in the initial render", () => {
    expect(resolveInitialThreadSidebarWidth(360, 1200)).toBe(360);
  });

  it("clamps a stored width to the sidebar minimum", () => {
    expect(resolveInitialThreadSidebarWidth(120, 1200)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
  });

  it("leaves enough room for the main content on a smaller window", () => {
    const viewportWidth = 1000;

    expect(resolveInitialThreadSidebarWidth(900, viewportWidth)).toBe(
      viewportWidth - THREAD_MAIN_CONTENT_MIN_WIDTH,
    );
  });

  it("keeps the sidebar minimum when the whole layout is narrower than its minimums", () => {
    expect(resolveInitialThreadSidebarWidth(900, 700)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
  });

  it("applies the preferred width unchanged when it fits the viewport", () => {
    expect(resolveAppliedThreadSidebarWidth(256, 1600)).toBe(256);
  });

  it("re-clamps the applied width to leave room for the main content when the window shrank", () => {
    expect(resolveAppliedThreadSidebarWidth(900, 1000)).toBe(1000 - THREAD_MAIN_CONTENT_MIN_WIDTH);
  });

  it("never drops the applied width below the sidebar minimum on a tiny window", () => {
    expect(resolveAppliedThreadSidebarWidth(900, 700)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
  });
});
