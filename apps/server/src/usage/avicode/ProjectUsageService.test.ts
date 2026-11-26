import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import type { ProjectUsageInput, ProjectUsageSummary } from "@t3tools/contracts";
import { UsageDay } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as SqlClient from "effect/sql/SqlClient";

import * as ServerConfig from "../../config.ts";
import * as Sqlite from "../../persistence/Sqlite.ts";
import * as ServerSettings from "../../serverSettings.ts";
import * as ProjectUsageService from "./ProjectUsageService.ts";

const testLayer = ProjectUsageService.layer.pipe(
  Layer.provideMerge(Sqlite.layerMemory),
  Layer.provideMerge(ServerSettings.layerTest()),
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "project-usage-test-" })),
  Layer.provideMerge(NodeServices.layer),
);

const NOVEMBER: ProjectUsageInput = {
  sinceDay: UsageDay.make("2026-11-01"),
  untilDay: UsageDay.make("2026-11-30"),
  timeZone: "UTC",
};

// Standard rates, and a tier that prices every token of a prompt above 200k at double.
const RATES = {
  "claude-test-model": {
    input_cost_per_token: 1e-6,
    output_cost_per_token: 2e-6,
    cache_read_input_token_cost: 1e-7,
    cache_creation_input_token_cost: 1e-6,
    input_cost_per_token_above_200k_tokens: 2e-6,
    output_cost_per_token_above_200k_tokens: 4e-6,
  },
};

const saveRates = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { stateDir } = yield* ServerConfig.ServerConfig;
  yield* fileSystem.writeFileString(
    path.join(stateDir, "usage-model-rates.json"),
    JSON.stringify({ fetchedAtMs: 0, document: RATES }),
  );
});

const seedProject = (projectId: string, title: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO projection_projects (
        project_id, title, workspace_root, scripts_json, created_at, updated_at
      ) VALUES (
        ${projectId}, ${title}, ${`/repos/${title}`}, '[]',
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      )
    `;
  });

const seedThread = (input: {
  readonly threadId: string;
  readonly projectId: string;
  readonly providerThreadId: string;
  readonly instanceId: string;
  readonly driver: string;
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO orchestration_v2_projection_threads (
        thread_id, project_id, title, default_provider, runtime_mode, interaction_mode,
        created_at, updated_at, payload_json
      ) VALUES (
        ${input.threadId}, ${input.projectId}, ${input.threadId}, ${input.driver}, 'full-access',
        'default', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z', '{}'
      )
    `;
    yield* sql`
      INSERT INTO orchestration_v2_projection_provider_threads (
        provider_thread_id, thread_id, provider, status, updated_at, payload_json
      ) VALUES (
        ${input.providerThreadId}, ${input.threadId}, ${input.driver}, 'idle',
        '2026-11-01T00:00:00.000Z',
        ${JSON.stringify({ providerInstanceId: input.instanceId })}
      )
    `;
  });

let turnOrdinal = 0;
const seedTurn = (input: {
  readonly threadId: string;
  readonly providerThreadId: string;
  readonly completedAt: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly cachedInputTokens?: number;
  readonly cacheCreationTokens?: number;
  readonly outputTokens: number;
  readonly localCommand?: boolean;
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    turnOrdinal += 1;
    const payload = {
      model: input.model,
      turnTokenUsage: {
        usageScope: "main_agent",
        usageStatus: "complete",
        hasSubagents: false,
        inputTokens: input.inputTokens,
        cachedInputTokens: input.cachedInputTokens,
        cacheCreationTokens: input.cacheCreationTokens,
        outputTokens: input.outputTokens,
        localCommand: input.localCommand,
      },
    };
    yield* sql`
      INSERT INTO orchestration_v2_projection_provider_turns (
        provider_turn_id, thread_id, provider_thread_id, node_id, ordinal, status,
        started_at, completed_at, payload_json
      ) VALUES (
        ${`turn-${turnOrdinal}`}, ${input.threadId}, ${input.providerThreadId}, 'node',
        ${turnOrdinal}, 'completed', ${input.completedAt}, ${input.completedAt},
        ${JSON.stringify(payload)}
      )
    `;
  });

const createLegacyUsageTable = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE provider_instance_usage (
      turn_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      provider_instance_id TEXT NOT NULL,
      driver_kind TEXT NOT NULL,
      model TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL,
      duration_ms INTEGER,
      created_at TEXT NOT NULL
    )
  `;
});

const seedLegacyUsage = (row: {
  readonly turnId: string;
  readonly threadId: string;
  readonly instanceId: string;
  readonly driver: string;
  readonly model: string | null;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheCreationTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number | null;
  readonly createdAt: string;
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO provider_instance_usage (
        turn_id, thread_id, provider_instance_id, driver_kind, model, input_tokens,
        cached_input_tokens, cache_creation_input_tokens, output_tokens, cost_usd, created_at
      ) VALUES (
        ${row.turnId}, ${row.threadId}, ${row.instanceId}, ${row.driver}, ${row.model},
        ${row.inputTokens}, ${row.cachedInputTokens}, ${row.cacheCreationTokens},
        ${row.outputTokens}, ${row.costUsd}, ${row.createdAt}
      )
    `;
  });

// A thread the first Avi Code ran that Avi Code 2 has not opened, so only its V1 row names the project.
const seedLegacyOnlyThread = (threadId: string, projectId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO projection_threads (
        thread_id, project_id, title, model_selection_json, runtime_mode, interaction_mode,
        created_at, updated_at
      ) VALUES (
        ${threadId}, ${projectId}, 'Old thread', '{"provider":"codex","model":"gpt-x"}',
        'full-access', 'default', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z'
      )
    `;
  });

const seedAlpha = Effect.gen(function* () {
  yield* saveRates;
  yield* seedProject("project-alpha", "alpha");
  yield* seedThread({
    threadId: "thread-alpha",
    projectId: "project-alpha",
    providerThreadId: "provider-alpha",
    instanceId: "claudeAgent_lawrence",
    driver: "claudeAgent",
  });
  const turn = { threadId: "thread-alpha", providerThreadId: "provider-alpha" };
  yield* seedTurn({
    ...turn,
    completedAt: "2026-11-10T00:00:00.000Z",
    model: "claude-test-model",
    inputTokens: 1_000,
    cachedInputTokens: 400,
    cacheCreationTokens: 100,
    outputTokens: 100,
  });
  yield* seedTurn({
    ...turn,
    completedAt: "2026-11-11T00:00:00.000Z",
    model: "claude-test-model",
    inputTokens: 300_000,
    outputTokens: 1_000,
  });
  yield* seedTurn({
    ...turn,
    completedAt: "2026-11-12T00:00:00.000Z",
    model: "mystery-model",
    inputTokens: 50,
    outputTokens: 5,
  });
  yield* seedTurn({
    ...turn,
    completedAt: "2026-10-15T00:00:00.000Z",
    model: "claude-test-model",
    inputTokens: 999,
    outputTokens: 999,
  });
  yield* seedTurn({
    ...turn,
    completedAt: "2026-11-13T00:00:00.000Z",
    model: "claude-test-model",
    inputTokens: 777,
    outputTokens: 777,
    localCommand: true,
  });
});

const read = (input: ProjectUsageInput) =>
  Effect.flatMap(ProjectUsageService.ProjectUsageService, (service) => service.read(input));

const project = (summary: ProjectUsageSummary, projectId: string) => {
  const found = summary.projects.find((entry) => entry.projectId === projectId);
  assert.isDefined(found);
  return found!;
};

// 500 uncached + 400 cache reads + 100 cache writes + 100 output, then a 300k prompt at the tier.
const STANDARD_TURN_COST = 500 * 1e-6 + 400 * 1e-7 + 100 * 1e-6 + 100 * 2e-6;
const LONG_TURN_COST = 300_000 * 2e-6 + 1_000 * 4e-6;

describe("ProjectUsageService", () => {
  it.effect("groups turns by repository, account and model and prices each context tier", () =>
    Effect.gen(function* () {
      yield* seedAlpha;
      const summary = yield* read(NOVEMBER);
      assert.lengthOf(summary.projects, 1);
      const alpha = project(summary, "project-alpha");
      assert.strictEqual(alpha.title, "alpha");
      assert.strictEqual(alpha.workspaceRoot, "/repos/alpha");

      const priced = alpha.entries.find((entry) => entry.model === "claude-test-model");
      assert.deepInclude(priced, {
        providerInstanceId: "claudeAgent_lawrence",
        driver: "claudeAgent",
        turns: 2,
        inputTokens: 301_000,
        cachedInputTokens: 400,
        cacheCreationTokens: 100,
        outputTokens: 1_100,
        unpricedTurns: 0,
      });
      assert.closeTo(priced!.costUsd!, STANDARD_TURN_COST + LONG_TURN_COST, 1e-9);

      const unpriced = alpha.entries.find((entry) => entry.model === "mystery-model");
      assert.deepInclude(unpriced, { turns: 1, costUsd: null, unpricedTurns: 1 });
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("adds the first Avi Code's rows with their stored cost", () =>
    Effect.gen(function* () {
      yield* seedAlpha;
      yield* seedProject("project-beta", "beta");
      yield* seedLegacyOnlyThread("thread-old", "project-beta");
      yield* createLegacyUsageTable;
      yield* seedLegacyUsage({
        turnId: "legacy-claude",
        threadId: "thread-alpha",
        instanceId: "claudeAgent_lawrence",
        driver: "claudeAgent",
        model: "claude-test-model",
        inputTokens: 10,
        cachedInputTokens: 20,
        cacheCreationTokens: 30,
        outputTokens: 40,
        costUsd: 1.5,
        createdAt: "2026-11-05T00:00:00.000Z",
      });
      yield* seedLegacyUsage({
        turnId: "legacy-codex",
        threadId: "thread-old",
        instanceId: "codex",
        driver: "codex",
        model: "gpt-x",
        inputTokens: 1_000,
        cachedInputTokens: 800,
        cacheCreationTokens: 0,
        outputTokens: 10,
        costUsd: null,
        createdAt: "2026-11-06T00:00:00.000Z",
      });
      yield* seedLegacyUsage({
        turnId: "legacy-old",
        threadId: "thread-old",
        instanceId: "codex",
        driver: "codex",
        model: "gpt-x",
        inputTokens: 5,
        cachedInputTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 5,
        costUsd: 9,
        createdAt: "2026-10-01T00:00:00.000Z",
      });

      const summary = yield* read(NOVEMBER);
      const merged = project(summary, "project-alpha").entries.find(
        (entry) => entry.model === "claude-test-model",
      );
      // Claude's legacy input excluded cache reads and writes; it is added back.
      assert.deepInclude(merged, {
        turns: 3,
        inputTokens: 301_060,
        cachedInputTokens: 420,
        cacheCreationTokens: 130,
        outputTokens: 1_140,
      });
      assert.closeTo(merged!.costUsd!, STANDARD_TURN_COST + LONG_TURN_COST + 1.5, 1e-9);

      const beta = project(summary, "project-beta");
      assert.strictEqual(beta.title, "beta");
      // Codex's legacy input already counted cache reads; a missing cost stays unreported.
      assert.deepStrictEqual(beta.entries, [
        {
          providerInstanceId: "codex",
          driver: "codex",
          model: "gpt-x",
          turns: 1,
          inputTokens: 1_000,
          cachedInputTokens: 800,
          cacheCreationTokens: 0,
          outputTokens: 10,
          costUsd: null,
          unpricedTurns: 1,
        },
      ]);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("leaves every turn unpriced without a saved rate table", () =>
    Effect.gen(function* () {
      yield* seedProject("project-alpha", "alpha");
      yield* seedThread({
        threadId: "thread-alpha",
        projectId: "project-alpha",
        providerThreadId: "provider-alpha",
        instanceId: "claudeAgent",
        driver: "claudeAgent",
      });
      yield* seedTurn({
        threadId: "thread-alpha",
        providerThreadId: "provider-alpha",
        completedAt: "2026-11-10T00:00:00.000Z",
        model: "claude-test-model",
        inputTokens: 100,
        outputTokens: 10,
      });
      const summary = yield* read(NOVEMBER);
      assert.deepInclude(project(summary, "project-alpha").entries[0], {
        turns: 1,
        costUsd: null,
        unpricedTurns: 1,
      });
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("reads whole days in the page's time zone", () =>
    Effect.gen(function* () {
      yield* seedAlpha;
      // 2026-11-10T00:00Z is still 9 November in New York, so only the next two turns count.
      const summary = yield* read({
        sinceDay: UsageDay.make("2026-11-10"),
        untilDay: UsageDay.make("2026-11-12"),
        timeZone: "America/New_York",
      });
      const models = project(summary, "project-alpha").entries.map((entry) => [
        entry.model,
        entry.turns,
      ]);
      assert.sameDeepMembers(models, [
        ["claude-test-model", 1],
        ["mystery-model", 1],
      ]);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("rejects a window that ends before it starts", () =>
    Effect.gen(function* () {
      const error = yield* read({
        ...NOVEMBER,
        sinceTime: "2026-11-02T00:00:00.000Z",
        untilTime: "2026-11-01T00:00:00.000Z",
      }).pipe(Effect.flip);
      assert.strictEqual(error.reason, "invalidWindow");
    }).pipe(Effect.provide(testLayer)),
  );
});
