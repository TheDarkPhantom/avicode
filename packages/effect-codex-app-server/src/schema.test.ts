import * as Schema from "effect/Schema";
import { assert, it } from "@effect/vitest";

import * as CodexSchema from "./schema.ts";

const decodeAccountResponse = Schema.decodeUnknownSync(CodexSchema.V2GetAccountResponse);
const isHookStartedNotification = Schema.is(CodexSchema.V2HookStartedNotification);
const isHookCompletedNotification = Schema.is(CodexSchema.V2HookCompletedNotification);

it("accepts account plan slugs newer than the pinned protocol", () => {
  const planTypes = ["pro", "promax", "edu_plus", "some_future_plan"];

  for (const planType of planTypes) {
    const decoded = decodeAccountResponse({
      account: { email: "user@example.com", planType, type: "chatgpt" },
      requiresOpenaiAuth: true,
    });
    assert.deepStrictEqual(decoded.account, {
      email: "user@example.com",
      planType,
      type: "chatgpt",
    });
  }
});

it("accepts Codex model-request hook runs", () => {
  for (const eventName of ["preModelRequest", "postModelRequest"]) {
    const notification = {
      threadId: "thread-1",
      turnId: "turn-1",
      run: {
        id: `hook-${eventName}`,
        eventName,
        executionMode: "sync",
        handlerType: "command",
        scope: "turn",
        sourcePath: "/tmp/project/.codex/hooks.json",
        startedAt: 1,
        status: "stopped",
        displayOrder: 0,
        entries: [{ kind: "stop", text: "Stop reason supplied by hook" }],
      },
    };
    assert.equal(isHookStartedNotification(notification), true);
    assert.equal(isHookCompletedNotification(notification), true);
  }
});
