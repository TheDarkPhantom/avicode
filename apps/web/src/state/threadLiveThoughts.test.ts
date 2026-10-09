import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { selectThreadLiveThought } from "./threadLiveThoughts";

describe("selectThreadLiveThought", () => {
  const snapshot = {
    thoughts: [
      { threadId: ThreadId.make("thread-a"), line: "Reading the adapter." },
      { threadId: ThreadId.make("thread-b"), line: "Found the cause." },
    ],
  };

  it("picks the thread's own line", () => {
    expect(selectThreadLiveThought(snapshot, ThreadId.make("thread-b"))).toBe("Found the cause.");
  });

  it("is null for a thread without a line or before the stream has data", () => {
    expect(selectThreadLiveThought(snapshot, ThreadId.make("thread-c"))).toBeNull();
    expect(selectThreadLiveThought(null, ThreadId.make("thread-a"))).toBeNull();
  });
});
