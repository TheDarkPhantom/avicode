// Avi Code addition: pending background task tracking on projection_threads.
import {
  CommandId,
  CorrelationId,
  EventId,
  type OrchestrationSessionStatus,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { ServerConfig } from "../../config.ts";
import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { OrchestrationEventStore } from "../../persistence/Services/OrchestrationEventStore.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { OrchestrationProjectionPipeline } from "../Services/ProjectionPipeline.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";

const TestLayer = Layer.mergeAll(
  OrchestrationProjectionPipelineLive,
  OrchestrationProjectionSnapshotQueryLive,
).pipe(
  Layer.provideMerge(RepositoryIdentityResolver.layer),
  Layer.provideMerge(OrchestrationEventStoreLive),
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-bg-tasks-test-" })),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeServices.layer),
);

it.layer(TestLayer)("projection pending background tasks", (it) => {
  const setup = (name: string) =>
    Effect.gen(function* () {
      const pipeline = yield* OrchestrationProjectionPipeline;
      const eventStore = yield* OrchestrationEventStore;
      const sql = yield* SqlClient.SqlClient;
      const snapshotQuery = yield* ProjectionSnapshotQuery;
      const threadId = ThreadId.make(`thread-${name}`);
      let seq = 0;
      const base = () => {
        seq += 1;
        const at = new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString();
        const id = `${name}-${seq}`;
        return {
          at,
          envelope: {
            eventId: EventId.make(`evt-${id}`),
            aggregateKind: "thread" as const,
            aggregateId: threadId,
            occurredAt: at,
            commandId: CommandId.make(`cmd-${id}`),
            causationEventId: null,
            correlationId: CorrelationId.make(`cmd-${id}`),
            metadata: {},
          },
        };
      };
      const project = (event: Parameters<typeof eventStore.append>[0]) =>
        eventStore.append(event).pipe(Effect.andThen(pipeline.bootstrap));

      const { at: createdAt, envelope } = base();
      yield* project({
        ...envelope,
        type: "thread.created",
        payload: {
          threadId,
          projectId: ProjectId.make(`project-${name}`),
          title: "Background tasks",
          modelSelection: { instanceId: ProviderInstanceId.make("claude"), model: "claude-opus" },
          runtimeMode: "full-access",
          branch: null,
          worktreePath: null,
          createdAt,
          updatedAt: createdAt,
        },
      });

      const task = (kind: "task.started" | "task.completed", taskId: string) => {
        const { at, envelope } = base();
        return project({
          ...envelope,
          type: "thread.activity-appended",
          payload: {
            threadId,
            activity: {
              id: envelope.eventId,
              tone: "info",
              kind,
              summary: kind === "task.started" ? "local_bash task started" : "Task completed",
              payload:
                kind === "task.started"
                  ? { taskId, taskType: "local_bash" }
                  : { taskId, status: "completed" },
              turnId: null,
              createdAt: at,
            },
          },
        });
      };
      const session = (status: OrchestrationSessionStatus) => {
        const { at, envelope } = base();
        return project({
          ...envelope,
          type: "thread.session-set",
          payload: {
            threadId,
            session: {
              threadId,
              status,
              providerName: "claude",
              runtimeMode: "full-access",
              activeTurnId: null,
              lastError: null,
              updatedAt: at,
            },
          },
        });
      };
      const pending = Effect.gen(function* () {
        const rows = yield* sql<{ readonly ids: string }>`
          SELECT pending_background_task_ids_json AS "ids"
          FROM projection_threads
          WHERE thread_id = ${threadId}
        `;
        return JSON.parse(rows[0]?.ids ?? "null") as ReadonlyArray<string>;
      });
      const shellFlag = snapshotQuery
        .getThreadShellById(threadId)
        .pipe(
          Effect.map((shell) =>
            shell._tag === "Some" ? shell.value.hasPendingBackgroundTasks : "missing",
          ),
        );

      return { task, session, pending, shellFlag };
    });

  it.effect("keeps a task pending across turn end and new turns until it completes", () =>
    Effect.gen(function* () {
      const t = yield* setup("lifecycle");
      assert.deepEqual(yield* t.pending, []);
      assert.strictEqual(yield* t.shellFlag, undefined);

      yield* t.session("running");
      yield* t.task("task.started", "bg-1");
      yield* t.task("task.started", "bg-1");
      yield* t.session("ready");
      assert.deepEqual(yield* t.pending, ["bg-1"]);
      assert.strictEqual(yield* t.shellFlag, true);

      yield* t.session("starting");
      yield* t.session("running");
      assert.deepEqual(yield* t.pending, ["bg-1"]);

      yield* t.task("task.completed", "bg-1");
      assert.deepEqual(yield* t.pending, []);
      assert.strictEqual(yield* t.shellFlag, undefined);
    }),
  );

  for (const status of ["stopped", "error", "interrupted"] as const) {
    it.effect(`clears pending tasks when the session becomes ${status}`, () =>
      Effect.gen(function* () {
        const t = yield* setup(`clear-${status}`);
        yield* t.task("task.started", "bg-1");
        yield* t.task("task.started", "bg-2");
        assert.deepEqual(yield* t.pending, ["bg-1", "bg-2"]);
        yield* t.session(status);
        assert.deepEqual(yield* t.pending, []);
      }),
    );
  }
});
