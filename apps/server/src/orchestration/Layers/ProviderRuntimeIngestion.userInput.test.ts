import {
  EventId,
  ProviderDriverKind,
  RuntimeRequestId,
  ThreadId,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { runtimeEventToActivities } from "./ProviderRuntimeIngestion.ts";

const resolvedEvent = (payload: {
  answers: Record<string, unknown>;
  reason?: "expired";
}): ProviderRuntimeEvent => ({
  type: "user-input.resolved",
  eventId: EventId.make("evt-user-input-resolved"),
  provider: ProviderDriverKind.make("claudeAgent"),
  createdAt: "2026-07-18T00:00:00.000Z",
  threadId: ThreadId.make("thread-1"),
  requestId: RuntimeRequestId.make("user-input-1"),
  payload,
});

describe("runtimeEventToActivities user-input closures", () => {
  it("reads an answered resolution as a submission", () => {
    const [activity] = runtimeEventToActivities(
      resolvedEvent({ answers: { sandbox_mode: "workspace-write" } }),
    );

    expect(activity?.kind).toBe("user-input.resolved");
    expect(activity?.tone).toBe("info");
    expect(activity?.summary).toBe("User input submitted");
    expect((activity?.payload as Record<string, unknown> | undefined)?.expired).toBeUndefined();
  });

  it("reads an expired resolution as a question nobody answered", () => {
    const [activity] = runtimeEventToActivities(resolvedEvent({ answers: {}, reason: "expired" }));

    // Same kind, so every consumer that already clears on it still clears.
    expect(activity?.kind).toBe("user-input.resolved");
    expect(activity?.tone).toBe("info");
    expect(activity?.summary).toBe("Question expired");
    expect(activity?.payload).toMatchObject({
      requestId: "user-input-1",
      expired: true,
    });
  });
});
