import * as NodeAssert from "node:assert/strict";

import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe } from "vite-plus/test";
import { DEFAULT_MODEL, ThreadId } from "@t3tools/contracts";
import * as CodexErrors from "effect-codex-app-server/errors";
import * as CodexRpc from "effect-codex-app-server/rpc";

import {
  buildCodexAdditionalContext,
  buildCodexDeveloperInstructions,
  CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
  CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS,
} from "../CodexDeveloperInstructions.ts";
import { codexSessionAppServerArgs } from "./codexLaunchArgs.ts";
import {
  buildAdditionalContextInjection,
  buildTurnStartParams,
  hasConfiguredMcpServer,
  isRootContextCompaction,
  isRecoverableThreadResumeError,
  openCodexThread,
  readCodexThread,
  rollbackCodexThread,
} from "./CodexSessionRuntime.ts";
const isCodexAppServerRequestError = Schema.is(CodexErrors.CodexAppServerRequestError);

describe("Codex thread history", () => {
  for (const numTurns of [1, 2, 3, 5]) {
    it.effect(`reverts ${numTurns} paginated turns at the durable boundary`, () =>
      Effect.gen(function* () {
        let retained = ["turn-1", "turn-2", "turn-3"];
        const revertedBefore: Array<string> = [];
        const client: Parameters<typeof rollbackCodexThread>[0] = {
          request: () => Effect.die("Legacy history API must not be used for paginated threads"),
          raw: {
            request: (method, params) =>
              Effect.sync(() => {
                if (method === "thread/read") return { thread: { historyMode: "paginated" } };
                if (method === "thread/turns/list") {
                  const { cursor } = params as { cursor: string | null };
                  const start = cursor === null ? 0 : Number(cursor);
                  const ids = retained.slice(start, start + 2);
                  return {
                    data: ids.map((id) => ({ id, items: [], status: "completed" })),
                    nextCursor: start + 2 < retained.length ? String(start + 2) : null,
                  };
                }
                NodeAssert.equal(method, "thread/revert");
                const { beforeTurnId } = params as { beforeTurnId: string };
                revertedBefore.push(beforeTurnId);
                retained = retained.slice(0, retained.indexOf(beforeTurnId));
                return { thread: { id: "thread-1", turns: [] } };
              }),
          },
        };
        const result = yield* rollbackCodexThread(client, "thread-1", numTurns);
        const expected = ["turn-1", "turn-2", "turn-3"].slice(0, Math.max(0, 3 - numTurns));
        NodeAssert.deepEqual(revertedBefore, [
          ["turn-1", "turn-2", "turn-3"][Math.max(0, 3 - numTurns)],
        ]);
        NodeAssert.deepEqual(
          result.turns.map((turn) => turn.id),
          expected,
        );
        NodeAssert.deepEqual(
          (yield* readCodexThread(client, "thread-1")).turns.map((turn) => turn.id),
          expected,
        );
      }),
    );
  }

  it.effect("does not revert a paginated thread that has no turns", () =>
    Effect.gen(function* () {
      const client: Parameters<typeof rollbackCodexThread>[0] = {
        request: () => Effect.die("Legacy history API must not be used for paginated threads"),
        raw: {
          request: (method) =>
            Effect.sync(() => {
              if (method === "thread/read") return { thread: { historyMode: "paginated" } };
              NodeAssert.equal(method, "thread/turns/list");
              return { data: [], nextCursor: null };
            }),
        },
      };
      NodeAssert.deepEqual(yield* rollbackCodexThread(client, "thread-1", 1), {
        threadId: "thread-1",
        turns: [],
      });
    }),
  );

  for (const cursors of [
    ["next", "next"],
    ["first", "second", "first"],
  ]) {
    it.effect(`rejects a pagination cursor cycle: ${cursors.join(", ")}`, () =>
      Effect.gen(function* () {
        let pageCount = 0;
        const client: Parameters<typeof readCodexThread>[0] = {
          request: () => Effect.die("Unexpected legacy request"),
          raw: {
            request: (method) =>
              Effect.sync(() => {
                if (method === "thread/read") return { thread: { historyMode: "paginated" } };
                NodeAssert.ok(pageCount < cursors.length, "Repeated cursor was requested");
                return { data: [], nextCursor: cursors[pageCount++] };
              }),
          },
        };
        const error = yield* Effect.flip(readCodexThread(client, "thread-1"));
        NodeAssert.ok(isCodexAppServerRequestError(error));
        NodeAssert.equal(pageCount, cursors.length);
      }),
    );
  }

  // Codex versions before paginated history report no historyMode and have no
  // thread/revert, so legacy threads keep the count-based rollback.
  for (const thread of [{}, { historyMode: "legacy" }]) {
    it.effect(
      `keeps the count-based rollback API for legacy threads: ${JSON.stringify(thread)}`,
      () =>
        Effect.gen(function* () {
          const client: Parameters<typeof rollbackCodexThread>[0] = {
            raw: {
              request: (method) => {
                NodeAssert.equal(method, "thread/read");
                return Effect.succeed({ thread });
              },
            },
            request: <M extends CodexRpc.ClientRequestMethod>(
              method: M,
              params: CodexRpc.ClientRequestParamsByMethod[M],
            ) => {
              NodeAssert.equal(method, "thread/rollback");
              NodeAssert.deepEqual(params, { threadId: "legacy-thread", numTurns: 2 });
              return Effect.succeed({
                thread: { id: "legacy-thread", turns: [{ id: "turn-1", items: [] }] },
              } as unknown as CodexRpc.ClientRequestResponsesByMethod[M]);
            },
          };
          NodeAssert.deepEqual(yield* rollbackCodexThread(client, "legacy-thread", 2), {
            threadId: "legacy-thread",
            turns: [{ id: "turn-1", items: [] }],
          });
        }),
    );
  }

  it.effect("surfaces Codex rejecting the legacy rollback", () =>
    Effect.gen(function* () {
      const rejection = CodexErrors.CodexAppServerRequestError.methodNotFound("thread/rollback");
      const client: Parameters<typeof rollbackCodexThread>[0] = {
        raw: { request: () => Effect.succeed({ thread: { historyMode: "legacy" } }) },
        request: <M extends CodexRpc.ClientRequestMethod>(method: M) => {
          NodeAssert.equal(method, "thread/rollback");
          return Effect.fail(rejection);
        },
      };
      const error = yield* Effect.flip(rollbackCodexThread(client, "legacy-thread", 1));
      NodeAssert.strictEqual(error, rejection);
    }),
  );

  it.effect("reads legacy threads with inline turns", () =>
    Effect.gen(function* () {
      const client: Parameters<typeof readCodexThread>[0] = {
        raw: { request: () => Effect.succeed({ thread: {} }) },
        request: <M extends CodexRpc.ClientRequestMethod>(
          method: M,
          params: CodexRpc.ClientRequestParamsByMethod[M],
        ) => {
          NodeAssert.equal(method, "thread/read");
          NodeAssert.deepEqual(params, { threadId: "legacy-thread", includeTurns: true });
          return Effect.succeed({
            thread: { id: "legacy-thread", turns: [{ id: "turn-1", items: [] }] },
          } as unknown as CodexRpc.ClientRequestResponsesByMethod[M]);
        },
      };
      NodeAssert.deepEqual(
        (yield* readCodexThread(client, "legacy-thread")).turns.map((turn) => turn.id),
        ["turn-1"],
      );
    }),
  );
});

describe("CodexSessionRuntimeIdentifierGenerationError", () => {
  it("retains identifier purpose and the random source failure", () => {
    const cause = new Error("random source unavailable");
    const error = new CodexErrors.CodexAppServerIdentifierGenerationError({
      purpose: "provider-event",
      cause,
    });

    NodeAssert.equal(error.purpose, "provider-event");
    NodeAssert.strictEqual(error.cause, cause);
    NodeAssert.equal(
      error.message,
      "Failed to generate Codex App Server identifier for provider-event.",
    );
  });
});

function makeThreadOpenResponse(
  threadId: string,
): CodexRpc.ClientRequestResponsesByMethod["thread/start"] {
  return {
    cwd: "/tmp/project",
    model: "gpt-5.3-codex",
    modelProvider: "openai",
    approvalPolicy: "never",
    approvalsReviewer: "user",
    sandbox: { type: "danger-full-access" },
    thread: {
      id: threadId,
      createdAt: "2026-04-18T00:00:00.000Z",
      source: { session: "cli" },
      turns: [],
      status: {
        state: "idle",
        activeFlags: [],
      },
    },
  } as unknown as CodexRpc.ClientRequestResponsesByMethod["thread/start"];
}

describe("buildTurnStartParams", () => {
  it("keeps invalid turn values only in the schema cause", () => {
    const secret = "codex-turn-input-secret-sentinel";
    const error = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "full-access",
        attachments: [
          {
            type: "image",
            url: { secret } as unknown as string,
          },
        ],
      }).pipe(Effect.flip),
    );
    const { cause, ...directDiagnostics } = error;

    NodeAssert.equal(error.operation, "decode-request-payload");
    NodeAssert.equal(error.method, "turn/start");
    NodeAssert.ok((error.issueCount ?? 0) > 0);
    NodeAssert.ok(error.issueKinds?.includes("Pointer"));
    NodeAssert.ok((error.maximumPathDepth ?? 0) > 0);
    NodeAssert.ok(Schema.isSchemaError(cause));
    NodeAssert.doesNotMatch(error.message, new RegExp(secret));
    NodeAssert.doesNotMatch(JSON.stringify(directDiagnostics), new RegExp(secret));
  });

  it("includes plan collaboration mode when requested", () => {
    const params = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "full-access",
        prompt: "Make a plan",
        model: "gpt-5.3-codex",
        effort: "medium",
        interactionMode: "plan",
      }),
    );

    NodeAssert.deepStrictEqual(params, {
      threadId: "provider-thread-1",
      approvalPolicy: "never",
      approvalsReviewer: "user",
      sandboxPolicy: {
        type: "dangerFullAccess",
      },
      input: [
        {
          type: "text",
          text: "Make a plan",
        },
      ],
      model: "gpt-5.3-codex",
      effort: "medium",
      collaborationMode: {
        mode: "plan",
        settings: {
          model: "gpt-5.3-codex",
          reasoning_effort: "medium",
          developer_instructions: CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS,
        },
      },
      additionalContext: buildCodexAdditionalContext({
        model: "gpt-5.3-codex",
        reasoningEffort: "medium",
      }),
    });
  });

  it("includes default collaboration mode and image attachments", () => {
    const params = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "auto-accept-edits",
        prompt: "Implement it",
        model: "gpt-5.3-codex",
        interactionMode: "default",
        attachments: [
          {
            type: "image",
            url: "data:image/png;base64,abc",
          },
        ],
      }),
    );

    NodeAssert.deepStrictEqual(params, {
      threadId: "provider-thread-1",
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      sandboxPolicy: {
        type: "workspaceWrite",
      },
      input: [
        {
          type: "text",
          text: "Implement it",
        },
        {
          type: "image",
          url: "data:image/png;base64,abc",
        },
      ],
      model: "gpt-5.3-codex",
      collaborationMode: {
        mode: "default",
        settings: {
          model: "gpt-5.3-codex",
          reasoning_effort: "medium",
          developer_instructions: CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
        },
      },
      additionalContext: buildCodexAdditionalContext({
        model: "gpt-5.3-codex",
        reasoningEffort: "medium",
      }),
    });
  });

  it("reports the same fallback model and effort in settings and runtime context", () => {
    const params = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "full-access",
        prompt: "Go",
        interactionMode: "default",
      }),
    );

    const settings = params.collaborationMode?.settings;
    NodeAssert.equal(settings?.model, DEFAULT_MODEL);
    NodeAssert.equal(settings?.reasoning_effort, "medium");
    NodeAssert.ok(
      params.additionalContext?.avi_code_runtime?.value.includes(`as ${DEFAULT_MODEL} with medium`),
    );
  });

  // Newer models replace `developer_instructions` with the catalog's own mode
  // text, so Avi's runtime and tool context must ride in `additionalContext`,
  // which every model receives.
  it.effect("keeps runtime and browser context out of the mode prompt", () =>
    Effect.gen(function* () {
      for (const interactionMode of ["default", "plan"] as const) {
        const params = yield* buildTurnStartParams({
          threadId: "provider-thread-1",
          runtimeMode: "full-access",
          prompt: "Go",
          model: "gpt-5.4",
          effort: "high",
          interactionMode,
        });
        const instructions = params.collaborationMode?.settings.developer_instructions ?? "";
        NodeAssert.doesNotMatch(instructions, /runtime_info|preview_status/);
        NodeAssert.deepStrictEqual(Object.keys(params.additionalContext ?? {}), [
          "avi_code_runtime",
          "avi_code_tools",
        ]);
        NodeAssert.match(
          params.additionalContext?.avi_code_runtime?.value ?? "",
          /as gpt-5\.4 with high reasoning effort/,
        );
      }
    }),
  );

  it.effect("routes approvals to the auto reviewer in auto mode", () =>
    Effect.gen(function* () {
      const params = yield* buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "auto",
        prompt: "Ship it",
      });

      NodeAssert.deepStrictEqual(params, {
        threadId: "provider-thread-1",
        approvalPolicy: "on-request",
        approvalsReviewer: "auto_review",
        sandboxPolicy: {
          type: "workspaceWrite",
        },
        input: [
          {
            type: "text",
            text: "Ship it",
          },
        ],
      });
    }),
  );

  it("omits collaboration mode when interaction mode is absent", () => {
    const params = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "approval-required",
        prompt: "Review",
      }),
    );

    NodeAssert.deepStrictEqual(params, {
      threadId: "provider-thread-1",
      approvalPolicy: "untrusted",
      approvalsReviewer: "user",
      sandboxPolicy: {
        type: "readOnly",
      },
      input: [
        {
          type: "text",
          text: "Review",
        },
      ],
    });
  });
});

describe("buildCodexDeveloperInstructions", () => {
  it("returns the mode prompt for each interaction mode", () => {
    NodeAssert.equal(
      buildCodexDeveloperInstructions("default"),
      CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
    );
    NodeAssert.equal(
      buildCodexDeveloperInstructions("plan"),
      CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS,
    );
  });
});

describe("buildCodexAdditionalContext", () => {
  const runtimeText = (runtime: { model: string; reasoningEffort: string }) =>
    buildCodexAdditionalContext(runtime).avi_code_runtime?.value ?? "";

  it("describes the Avi Code runtime", () => {
    const context = buildCodexAdditionalContext({
      model: "gpt-5.3-codex",
      reasoningEffort: "high",
    });

    NodeAssert.equal(context.avi_code_runtime?.kind, "application");
    NodeAssert.match(context.avi_code_runtime?.value ?? "", /Avi Code/);
    NodeAssert.match(context.avi_code_runtime?.value ?? "", /Codex harness/);
    NodeAssert.match(
      context.avi_code_runtime?.value ?? "",
      /as gpt-5\.3-codex with high reasoning effort/,
    );
  });

  it("varies with the model and effort of each turn", () => {
    NodeAssert.notEqual(
      runtimeText({ model: "gpt-5.3-codex", reasoningEffort: "medium" }),
      runtimeText({ model: "gpt-5.4", reasoningEffort: "high" }),
    );
  });

  it("flattens multiline metadata into single-line runtime info", () => {
    const text = runtimeText({ model: "gpt\n5.3\ncodex", reasoningEffort: " high\neffort " });

    NodeAssert.match(text, /as gpt 5\.3 codex with high effort reasoning effort/);
    NodeAssert.doesNotMatch(text, /<runtime_info>[^<]*\n/);
  });

  it("prefers the product-native preview tools", () => {
    const tools =
      buildCodexAdditionalContext({ model: "gpt-5.4", reasoningEffort: "medium" }).avi_code_tools
        ?.value ?? "";
    NodeAssert.match(tools, /t3-code/);
    NodeAssert.match(tools, /preview_status/);
    NodeAssert.match(tools, /preview_open/);
    NodeAssert.match(tools, /Do not switch to global browser skills/);
  });
});

describe("additional context after compaction", () => {
  const compacted = (threadId: string) =>
    ({
      method: "item/completed",
      params: {
        threadId,
        turnId: `${threadId}-turn`,
        completedAtMs: 0,
        item: { type: "contextCompaction", id: `compaction-${threadId}` },
      },
    }) as unknown as Parameters<typeof isRootContextCompaction>[0];

  it("reacts only to the root thread's own compaction", () => {
    NodeAssert.equal(isRootContextCompaction(compacted("root"), "root"), true);
    // A child agent's compaction must not inject into the root thread.
    NodeAssert.equal(isRootContextCompaction(compacted("child"), "root"), false);
    NodeAssert.equal(isRootContextCompaction(compacted("root"), undefined), false);
    const otherItem = {
      method: "item/completed",
      params: { threadId: "root", turnId: "t", item: { type: "agentMessage", id: "m" } },
    } as unknown as Parameters<typeof isRootContextCompaction>[0];
    NodeAssert.equal(isRootContextCompaction(otherItem, "root"), false);
  });

  it.effect("re-sends the last turn's context as developer messages", () =>
    Effect.gen(function* () {
      const params = yield* buildTurnStartParams({
        threadId: "root",
        runtimeMode: "full-access",
        prompt: "Go",
        model: "gpt-5.4",
        interactionMode: "default",
      });
      NodeAssert.ok(params.additionalContext);
      const injection = buildAdditionalContextInjection("root", params.additionalContext);

      NodeAssert.equal(injection.threadId, "root");
      const items = injection.items as ReadonlyArray<{
        type: string;
        role: string;
        content: ReadonlyArray<{ type: string; text: string }>;
      }>;
      NodeAssert.deepStrictEqual(
        items.map((item) => [item.type, item.role, item.content[0]?.type]),
        [
          ["message", "developer", "input_text"],
          ["message", "developer", "input_text"],
        ],
      );
      NodeAssert.match(
        items[0]?.content[0]?.text ?? "",
        /^<avi_code_runtime><runtime_info>.*as gpt-5\.4 with medium reasoning effort.*<\/avi_code_runtime>$/s,
      );
      NodeAssert.match(items[1]?.content[0]?.text ?? "", /^<avi_code_tools>## Avi Code/);
    }),
  );
});

describe("hasConfiguredMcpServer", () => {
  it("detects inline Codex MCP configuration arguments", () => {
    NodeAssert.equal(hasConfiguredMcpServer(undefined), false);
    NodeAssert.equal(hasConfiguredMcpServer(["--model", "gpt-5.4"]), false);
    NodeAssert.equal(
      hasConfiguredMcpServer(["-c", 'mcp_servers.t3-code.url="http://127.0.0.1/mcp"']),
      true,
    );
  });
});

describe("codexSessionAppServerArgs", () => {
  it("keeps the app-server subcommand when explicit args are provided", () => {
    NodeAssert.deepStrictEqual(codexSessionAppServerArgs(["-c", "model=gpt-5"], undefined), [
      "app-server",
      "-c",
      "model=gpt-5",
    ]);
  });

  it("keeps launch args when explicit app-server args are provided", () => {
    NodeAssert.deepStrictEqual(
      codexSessionAppServerArgs(
        ["-c", "mcp_servers.t3-code.url=http://127.0.0.1/mcp"],
        "--strict-config --enable foo",
      ),
      [
        "app-server",
        "--strict-config",
        "--enable",
        "foo",
        "-c",
        "mcp_servers.t3-code.url=http://127.0.0.1/mcp",
      ],
    );
  });
});

describe("isRecoverableThreadResumeError", () => {
  it("matches missing thread errors", () => {
    NodeAssert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "Thread does not exist",
        }),
      ),
      true,
    );
  });

  it("matches a missing rollout for a known thread id", () => {
    NodeAssert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "no rollout found for thread id 019fdf74-aaa9-7950-b252-7cc7a8650470",
        }),
      ),
      true,
    );
  });

  it("ignores non-recoverable resume errors", () => {
    NodeAssert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "Permission denied",
        }),
      ),
      false,
    );
  });

  it("ignores unrelated missing-resource errors that do not mention threads", () => {
    NodeAssert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "Config file not found",
        }),
      ),
      false,
    );
    NodeAssert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "Model does not exist",
        }),
      ),
      false,
    );
  });
});

describe("openCodexThread", () => {
  it.effect("falls back to thread/start when resume fails recoverably", () =>
    Effect.gen(function* () {
      const calls: Array<{ method: "thread/start" | "thread/resume"; payload: unknown }> = [];
      const started = makeThreadOpenResponse("fresh-thread");
      const client = {
        request: <M extends "thread/start" | "thread/resume">(
          method: M,
          payload: CodexRpc.ClientRequestParamsByMethod[M],
        ) => {
          calls.push({ method, payload });
          if (method === "thread/resume") {
            return Effect.fail(
              new CodexErrors.CodexAppServerRequestError({
                code: -32603,
                errorMessage: "thread not found",
              }),
            );
          }
          return Effect.succeed(started as CodexRpc.ClientRequestResponsesByMethod[M]);
        },
      };

      const opened = yield* openCodexThread({
        client,
        threadId: ThreadId.make("thread-1"),
        runtimeMode: "full-access",
        cwd: "/tmp/project",
        requestedModel: "gpt-5.3-codex",
        serviceTier: undefined,
        resumeThreadId: "stale-thread",
      });

      NodeAssert.equal(opened.thread.id, "fresh-thread");
      NodeAssert.deepStrictEqual(
        calls.map((call) => call.method),
        ["thread/resume", "thread/start"],
      );
    }),
  );

  it.effect("propagates non-recoverable resume failures", () =>
    Effect.gen(function* () {
      const client = {
        request: <M extends "thread/start" | "thread/resume">(
          method: M,
          _payload: CodexRpc.ClientRequestParamsByMethod[M],
        ) => {
          if (method === "thread/resume") {
            return Effect.fail(
              new CodexErrors.CodexAppServerRequestError({
                code: -32603,
                errorMessage: "timed out waiting for server",
              }),
            );
          }
          return Effect.succeed(
            makeThreadOpenResponse("fresh-thread") as CodexRpc.ClientRequestResponsesByMethod[M],
          );
        },
      };

      const error = yield* openCodexThread({
        client,
        threadId: ThreadId.make("thread-1"),
        runtimeMode: "full-access",
        cwd: "/tmp/project",
        requestedModel: "gpt-5.3-codex",
        serviceTier: undefined,
        resumeThreadId: "stale-thread",
      }).pipe(Effect.flip);

      NodeAssert.ok(isCodexAppServerRequestError(error));
      NodeAssert.equal(error.errorMessage, "timed out waiting for server");
    }),
  );
});
