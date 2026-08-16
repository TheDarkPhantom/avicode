import {
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ProviderInstanceUsageRepository } from "../Services/ProviderInstanceUsage.ts";
import { ProjectionProjectRepository } from "../Services/ProjectionProjects.ts";
import { ProjectionThreadRepository } from "../Services/ProjectionThreads.ts";
import { ProviderInstanceUsageRepositoryLive } from "./ProviderInstanceUsage.ts";
import { ProjectionProjectRepositoryLive } from "./ProjectionProjects.ts";
import { ProjectionThreadRepositoryLive } from "./ProjectionThreads.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";

// Seed the projection rows the per-project join reads, via the real
// repositories so the fixtures track the live schema. `summarizeByProject`
// only reads `project_id`, `title`, and `workspace_root`; a project row is
// optional so the LEFT JOIN can be exercised with a missing one.
const seedThread = (input: { threadId: string; projectId: string }) =>
  Effect.gen(function* () {
    const threads = yield* ProjectionThreadRepository;
    yield* threads.upsert({
      threadId: ThreadId.make(input.threadId),
      projectId: ProjectId.make(input.projectId),
      title: "T",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      forkParentThreadId: null,
      forkPointMessageId: null,
      latestTurnId: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      snoozedUntil: null,
      snoozedAt: null,
      latestUserMessageAt: null,
      pendingApprovalCount: 0,
      pendingUserInputCount: 0,
      hasActionableProposedPlan: 0,
      deletedAt: null,
    });
  });

const seedProject = (input: { projectId: string; title: string; workspaceRoot: string }) =>
  Effect.gen(function* () {
    const projects = yield* ProjectionProjectRepository;
    yield* projects.upsert({
      projectId: ProjectId.make(input.projectId),
      title: input.title,
      workspaceRoot: input.workspaceRoot,
      defaultModelSelection: null,
      scripts: [],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      deletedAt: null,
    });
  });

const codexDriver = ProviderDriverKind.make("codex");
const claudeDriver = ProviderDriverKind.make("claudeAgent");

// The layer — and therefore the database — is shared across the block, so
// every test scopes itself to its own instance id and filters on it.
const layer = it.layer(
  Layer.mergeAll(
    ProviderInstanceUsageRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    ProjectionThreadRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    ProjectionProjectRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    SqlitePersistenceMemory,
  ),
);

const row = (input: {
  readonly instanceId: ProviderInstanceId;
  readonly turnId: string;
  readonly model?: string | null;
  readonly driverKind?: ProviderDriverKind;
  readonly threadId?: string;
  readonly inputTokens?: number;
  readonly costUsd?: number | null;
  readonly createdAt?: string;
}) => ({
  turnId: TurnId.make(input.turnId),
  threadId: ThreadId.make(input.threadId ?? "thread-1"),
  providerInstanceId: input.instanceId,
  driverKind: input.driverKind ?? codexDriver,
  model: input.model === undefined ? "gpt-5" : input.model,
  inputTokens: input.inputTokens ?? 100,
  cachedInputTokens: 20,
  cacheCreationInputTokens: 5,
  outputTokens: 50,
  reasoningOutputTokens: 10,
  costUsd: input.costUsd ?? null,
  durationMs: 1000,
  createdAt: input.createdAt ?? "2026-07-29T12:00:00.000Z",
});

layer("ProviderInstanceUsageRepository", (it) => {
  it.effect("sums token counts per instance and model", () =>
    Effect.gen(function* () {
      const repository = yield* ProviderInstanceUsageRepository;
      const instanceId = ProviderInstanceId.make("sums");

      yield* repository.record(row({ instanceId, turnId: "sums-1" }));
      yield* repository.record(row({ instanceId, turnId: "sums-2", inputTokens: 400 }));

      const totals = (yield* repository.summarize({})).filter(
        (total) => total.providerInstanceId === instanceId,
      );

      assert.lengthOf(totals, 1);
      assert.deepStrictEqual(totals[0], {
        providerInstanceId: instanceId,
        driverKind: codexDriver,
        model: "gpt-5",
        turns: 2,
        inputTokens: 500,
        cachedInputTokens: 40,
        cacheCreationInputTokens: 10,
        outputTokens: 100,
        reasoningOutputTokens: 20,
        costUsd: null,
      });
    }),
  );

  it.effect("upserts by turn id so a replayed turn does not double-count", () =>
    Effect.gen(function* () {
      const repository = yield* ProviderInstanceUsageRepository;
      const instanceId = ProviderInstanceId.make("replay");

      yield* repository.record(row({ instanceId, turnId: "replay-1" }));
      yield* repository.record(row({ instanceId, turnId: "replay-1" }));

      const totals = (yield* repository.summarize({})).filter(
        (total) => total.providerInstanceId === instanceId,
      );

      assert.strictEqual(totals[0]?.turns, 1);
      assert.strictEqual(totals[0]?.inputTokens, 100);
    }),
  );

  it.effect("keeps models within one instance in separate groups", () =>
    Effect.gen(function* () {
      const repository = yield* ProviderInstanceUsageRepository;
      const instanceId = ProviderInstanceId.make("multimodel");

      yield* repository.record(row({ instanceId, turnId: "mm-1", model: "gpt-5" }));
      yield* repository.record(row({ instanceId, turnId: "mm-2", model: "gpt-5-mini" }));
      yield* repository.record(row({ instanceId, turnId: "mm-3", model: "gpt-5" }));

      const totals = (yield* repository.summarize({})).filter(
        (total) => total.providerInstanceId === instanceId,
      );

      assert.deepStrictEqual(
        totals.map((total) => [total.model, total.turns]),
        [
          ["gpt-5", 2],
          ["gpt-5-mini", 1],
        ],
      );
    }),
  );

  it.effect("reports summed cost only for providers that reported one", () =>
    Effect.gen(function* () {
      const repository = yield* ProviderInstanceUsageRepository;
      const freeInstance = ProviderInstanceId.make("cost_free");
      const paidInstance = ProviderInstanceId.make("cost_paid");

      yield* repository.record(row({ instanceId: freeInstance, turnId: "cost-free-1" }));
      yield* repository.record(
        row({
          instanceId: paidInstance,
          turnId: "cost-paid-1",
          driverKind: claudeDriver,
          model: "claude-opus-5",
          costUsd: 0.1,
        }),
      );
      yield* repository.record(
        row({
          instanceId: paidInstance,
          turnId: "cost-paid-2",
          driverKind: claudeDriver,
          model: "claude-opus-5",
          costUsd: 0.15,
        }),
      );

      const totals = yield* repository.summarize({});
      const free = totals.find((total) => total.providerInstanceId === freeInstance);
      const paid = totals.find((total) => total.providerInstanceId === paidInstance);

      // Null, not zero: "spent nothing" and "does not report spend" must stay
      // distinguishable, so the UI can show "—" rather than a fake $0.00.
      assert.strictEqual(free?.costUsd, null);
      assert.closeTo(paid?.costUsd ?? 0, 0.25, 1e-9);
    }),
  );

  it.effect("filters by the since cutoff", () =>
    Effect.gen(function* () {
      const repository = yield* ProviderInstanceUsageRepository;
      const instanceId = ProviderInstanceId.make("cutoff");

      yield* repository.record(
        row({ instanceId, turnId: "cutoff-old", createdAt: "2026-07-01T00:00:00.000Z" }),
      );
      yield* repository.record(
        row({
          instanceId,
          turnId: "cutoff-new",
          createdAt: "2026-07-29T00:00:00.000Z",
          inputTokens: 7,
        }),
      );

      const all = (yield* repository.summarize({})).filter(
        (total) => total.providerInstanceId === instanceId,
      );
      const recent = (yield* repository.summarize({ since: "2026-07-15T00:00:00.000Z" })).filter(
        (total) => total.providerInstanceId === instanceId,
      );

      assert.strictEqual(all[0]?.turns, 2);
      assert.strictEqual(recent[0]?.turns, 1);
      assert.strictEqual(recent[0]?.inputTokens, 7);
    }),
  );

  it.effect("drops a thread's rows on delete", () =>
    Effect.gen(function* () {
      const repository = yield* ProviderInstanceUsageRepository;
      const instanceId = ProviderInstanceId.make("deletion");

      yield* repository.record(row({ instanceId, turnId: "del-a", threadId: "thread-delete-me" }));
      yield* repository.record(row({ instanceId, turnId: "del-b", threadId: "thread-keep" }));

      yield* repository.deleteByThreadId({ threadId: ThreadId.make("thread-delete-me") });

      const totals = (yield* repository.summarize({})).filter(
        (total) => total.providerInstanceId === instanceId,
      );
      assert.strictEqual(totals[0]?.turns, 1);
    }),
  );

  it.effect("summarizes one thread's totals scoped to that thread", () =>
    Effect.gen(function* () {
      const repository = yield* ProviderInstanceUsageRepository;
      const instanceId = ProviderInstanceId.make("thread_scope");

      // Two turns on the target thread, one on another thread that must not leak
      // into the total.
      yield* repository.record(
        row({ instanceId, turnId: "ts-1", threadId: "thread-target", inputTokens: 100 }),
      );
      yield* repository.record(
        row({ instanceId, turnId: "ts-2", threadId: "thread-target", inputTokens: 400 }),
      );
      yield* repository.record(
        row({ instanceId, turnId: "ts-other", threadId: "thread-other", inputTokens: 999 }),
      );

      const totals = yield* repository.summarizeByThread({
        threadId: ThreadId.make("thread-target"),
      });

      assert.lengthOf(totals, 1);
      assert.deepStrictEqual(totals[0], {
        model: "gpt-5",
        turns: 2,
        inputTokens: 500,
        cachedInputTokens: 40,
        cacheCreationInputTokens: 10,
        outputTokens: 100,
        reasoningOutputTokens: 20,
        costUsd: null,
      });
    }),
  );

  it.effect("keeps a thread's models in separate groups", () =>
    Effect.gen(function* () {
      const repository = yield* ProviderInstanceUsageRepository;
      const instanceId = ProviderInstanceId.make("thread_models");

      yield* repository.record(
        row({ instanceId, turnId: "tm-1", threadId: "thread-multimodel", model: "gpt-5" }),
      );
      yield* repository.record(
        row({ instanceId, turnId: "tm-2", threadId: "thread-multimodel", model: "gpt-5-mini" }),
      );

      const totals = yield* repository.summarizeByThread({
        threadId: ThreadId.make("thread-multimodel"),
      });

      assert.deepStrictEqual(
        totals.map((total) => total.model),
        ["gpt-5", "gpt-5-mini"],
      );
    }),
  );

  it.effect("reports a thread's cost only when a turn reported one", () =>
    Effect.gen(function* () {
      const repository = yield* ProviderInstanceUsageRepository;
      const freeInstance = ProviderInstanceId.make("thread_free");
      const paidInstance = ProviderInstanceId.make("thread_paid");

      yield* repository.record(
        row({ instanceId: freeInstance, turnId: "tf-1", threadId: "thread-free" }),
      );
      yield* repository.record(
        row({
          instanceId: paidInstance,
          turnId: "tp-1",
          threadId: "thread-paid",
          driverKind: claudeDriver,
          model: "claude-opus-5",
          costUsd: 0.2,
        }),
      );

      const free = yield* repository.summarizeByThread({ threadId: ThreadId.make("thread-free") });
      const paid = yield* repository.summarizeByThread({ threadId: ThreadId.make("thread-paid") });

      // Null, not zero: a Codex-only thread must stay distinguishable from one
      // that genuinely spent nothing, so the UI can show "—".
      assert.strictEqual(free[0]?.costUsd, null);
      assert.closeTo(paid[0]?.costUsd ?? 0, 0.2, 1e-9);
    }),
  );

  it.effect("returns no rows for a thread with no usage", () =>
    Effect.gen(function* () {
      const repository = yield* ProviderInstanceUsageRepository;

      const totals = yield* repository.summarizeByThread({
        threadId: ThreadId.make("thread-never-used"),
      });

      assert.lengthOf(totals, 0);
    }),
  );

  it.effect("groups usage by project and instance, joining the project label", () =>
    Effect.gen(function* () {
      const repository = yield* ProviderInstanceUsageRepository;
      const instanceA = ProviderInstanceId.make("proj_a_inst");
      const instanceB = ProviderInstanceId.make("proj_b_inst");

      yield* seedProject({
        projectId: "proj-a",
        title: "Repo A",
        workspaceRoot: "/repos/a",
      });
      yield* seedThread({ threadId: "proj-a-thread", projectId: "proj-a" });
      yield* seedThread({ threadId: "proj-b-thread", projectId: "proj-b" });

      yield* repository.record(
        row({ instanceId: instanceA, turnId: "pa-1", threadId: "proj-a-thread" }),
      );
      yield* repository.record(
        row({ instanceId: instanceB, turnId: "pb-1", threadId: "proj-b-thread" }),
      );

      const totals = yield* repository.summarizeByProject({});
      const projA = totals.find((total) => total.projectId === "proj-a");
      const projB = totals.find((total) => total.projectId === "proj-b");

      assert.strictEqual(projA?.projectTitle, "Repo A");
      assert.strictEqual(projA?.workspaceRoot, "/repos/a");
      assert.strictEqual(projA?.providerInstanceId, instanceA);
      // proj-b has no project row: the LEFT JOIN keeps the usage but leaves the
      // label null so the UI can fall back to the id.
      assert.strictEqual(projB?.projectTitle, null);
      assert.strictEqual(projB?.providerInstanceId, instanceB);
    }),
  );

  it.effect("filters per-project totals by the since cutoff", () =>
    Effect.gen(function* () {
      const repository = yield* ProviderInstanceUsageRepository;
      const instanceId = ProviderInstanceId.make("proj_cutoff_inst");

      yield* seedThread({ threadId: "proj-cutoff-thread", projectId: "proj-cutoff" });
      yield* repository.record(
        row({
          instanceId,
          turnId: "pc-old",
          threadId: "proj-cutoff-thread",
          createdAt: "2026-07-01T00:00:00.000Z",
        }),
      );
      yield* repository.record(
        row({
          instanceId,
          turnId: "pc-new",
          threadId: "proj-cutoff-thread",
          createdAt: "2026-07-29T00:00:00.000Z",
        }),
      );

      const all = (yield* repository.summarizeByProject({})).filter(
        (total) => total.projectId === "proj-cutoff",
      );
      const recent = (yield* repository.summarizeByProject({
        since: "2026-07-15T00:00:00.000Z",
      })).filter((total) => total.projectId === "proj-cutoff");

      assert.strictEqual(all[0]?.turns, 2);
      assert.strictEqual(recent[0]?.turns, 1);
    }),
  );

  it.effect("stores a null model for providers that do not name one", () =>
    Effect.gen(function* () {
      const repository = yield* ProviderInstanceUsageRepository;
      const instanceId = ProviderInstanceId.make("nomodel");

      yield* repository.record(row({ instanceId, turnId: "nomodel-1", model: null }));

      const totals = (yield* repository.summarize({})).filter(
        (total) => total.providerInstanceId === instanceId,
      );
      assert.strictEqual(totals[0]?.model, null);
      assert.strictEqual(totals[0]?.turns, 1);
    }),
  );
});
