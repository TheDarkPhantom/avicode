import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const liveThoughtByThreadId = new Map<string, string>([["thread-live", "Found the cause."]]);

vi.mock("../../state/threadLiveThoughts", () => ({
  useThreadLiveThought: (_environmentId: string, threadId: string) =>
    liveThoughtByThreadId.get(threadId) ?? null,
}));

const { SidebarLiveThought } = await import("./SidebarLiveThought");

const environmentId = EnvironmentId.make("environment-local");

describe("SidebarLiveThought", () => {
  it("shows the thread's latest thought as one truncated muted line", () => {
    const markup = renderToStaticMarkup(
      <SidebarLiveThought environmentId={environmentId} threadId={ThreadId.make("thread-live")} />,
    );

    expect(markup).toContain('data-testid="sidebar-live-thought"');
    expect(markup).toContain("Found the cause.");
    expect(markup).toContain("truncate");
    expect(markup).not.toContain("animate");
  });

  it("renders nothing, or the fallback, for a thread without thoughts", () => {
    const quietThread = ThreadId.make("thread-cursor");
    expect(
      renderToStaticMarkup(
        <SidebarLiveThought environmentId={environmentId} threadId={quietThread} />,
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <SidebarLiveThought
          environmentId={environmentId}
          threadId={quietThread}
          fallback={<span>feature/branch</span>}
        />,
      ),
    ).toBe("<span>feature/branch</span>");
  });
});
