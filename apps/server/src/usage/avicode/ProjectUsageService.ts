/**
 * Token usage and cost per repository, and for one thread, split by provider account and model.
 *
 * Reads Avi Code 2's provider turns and, when the first Avi Code's history was imported, its
 * `provider_instance_usage` rows. Both are grouped in SQL; only the groups leave the database.
 *
 * @module ProjectUsageService
 */
import {
  ProjectUsageReadError,
  type ProjectUsageEntry,
  type ProjectUsageInput,
  type ProjectUsageProject,
  type ProjectUsageSummary,
  type ThreadUsageInput,
  type ThreadUsageSummary,
} from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import type * as Statement from "effect/sql/Statement";

import * as ServerConfig from "../../config.ts";
import * as ServerSettings from "../../serverSettings.ts";
import { resolveModelAliases } from "../usageAggregation.ts";
import {
  createOverrideRateTable,
  parseRateTable,
  priceUsage,
  type RateTable,
} from "../usagePricing.ts";

// UsageService keeps the LiteLLM rate table here; reusing it avoids a second download.
const RATES_CACHE_FILE_NAME = "usage-model-rates.json";
const decodeRatesCache = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Struct({ document: Schema.Unknown })),
);
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

interface GroupRow {
  readonly projectId: string | null;
  readonly providerInstanceId: string;
  readonly driver: string;
  readonly model: string | null;
  readonly turns: number;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheCreationTokens: number;
  readonly outputTokens: number;
}

interface TurnGroupRow extends GroupRow {
  readonly tier: number;
}

interface LegacyGroupRow extends GroupRow {
  readonly costUsd: number | null;
  readonly unpricedTurns: number;
}

interface ProjectRow {
  readonly projectId: string;
  readonly title: string;
  readonly workspaceRoot: string;
}

export class ProjectUsageService extends Context.Service<
  ProjectUsageService,
  {
    readonly read: (
      input: ProjectUsageInput,
    ) => Effect.Effect<ProjectUsageSummary, ProjectUsageReadError>;
    readonly readThread: (
      input: ThreadUsageInput,
    ) => Effect.Effect<ThreadUsageSummary, ProjectUsageReadError>;
  }
>()("t3/usage/avicode/ProjectUsageService") {}

function zoneMidnightMs(day: string, timeZone: string): number | null {
  const [year, month, dayOfMonth] = day.split("-").map((part) => Number.parseInt(part, 10));
  if (year === undefined || month === undefined || dayOfMonth === undefined) return null;
  const zoned = DateTime.makeZoned(
    { year, month, day: dayOfMonth },
    { timeZone, adjustForTimeZone: true },
  );
  return Option.isSome(zoned) ? DateTime.toEpochMillis(zoned.value) : null;
}

function nextDay(day: string): string {
  return DateTime.formatIsoDate(DateTime.add(DateTime.makeUnsafe(`${day}T00:00:00Z`), { days: 1 }));
}

const isoFromMs = (ms: number) => DateTime.formatIso(DateTime.makeUnsafe(ms));

/** The half-open UTC range the Usage page's window covers. */
function windowBounds(
  input: ProjectUsageInput,
): { readonly since: string; readonly until: string } | null {
  const sinceMs =
    input.sinceTime !== undefined && input.untilTime !== undefined
      ? Date.parse(input.sinceTime)
      : zoneMidnightMs(input.sinceDay, input.timeZone);
  const untilMs =
    input.sinceTime !== undefined && input.untilTime !== undefined
      ? Date.parse(input.untilTime)
      : zoneMidnightMs(nextDay(input.untilDay), input.timeZone);
  if (sinceMs === null || untilMs === null || !(sinceMs < untilMs)) return null;
  return { since: isoFromMs(sinceMs), until: isoFromMs(untilMs) };
}

/** Every context-tier threshold the table prices, so SQL keeps turns on each side apart. */
function contextThresholds(rates: RateTable): number[] {
  const thresholds = new Set<number>();
  for (const rate of rates.values()) {
    for (const tier of rate.contextTiers) thresholds.add(tier.thresholdTokens);
  }
  return [...thresholds].toSorted((a, b) => a - b);
}

/**
 * Prices a group as its average turn times its turn count. Every turn in a group sits between the
 * same two context thresholds, so the average lands on the tier each of them would.
 */
function priceGroup(
  rates: RateTable,
  overrides: RateTable,
  model: string | null,
  row: GroupRow,
): number | null {
  if (model === null || row.turns === 0) return null;
  const perTurn = (tokens: number) => tokens / row.turns;
  const priced = priceUsage(
    rates,
    {
      model,
      totals: {
        uncachedInputTokens: perTurn(
          Math.max(0, row.inputTokens - row.cachedInputTokens - row.cacheCreationTokens),
        ),
        cachedInputTokens: perTurn(row.cachedInputTokens),
        cacheCreationTokens: perTurn(row.cacheCreationTokens),
        outputTokens: perTurn(row.outputTokens),
        reasoningTokens: 0,
      },
      speed: "standard",
      reportedCostUsd: null,
    },
    overrides,
  );
  return priced.costSource === "unpriced" ? null : priced.costUsd * row.turns;
}

const addCost = (left: number | null, right: number | null) =>
  left === null ? right : right === null ? left : left + right;

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig.ServerConfig;
  const settingsService = yield* ServerSettings.ServerSettingsService;
  const ratesPath = path.join(config.stateDir, RATES_CACHE_FILE_NAME);

  let cachedRates: { readonly mtimeMs: number; readonly rates: RateTable } | null = null;
  // Without a saved table every turn stays unpriced rather than failing the read.
  const loadRates = Effect.fn("ProjectUsageService.loadRates")(
    function* () {
      const info = yield* fileSystem.stat(ratesPath);
      const mtimeMs = Option.match(info.mtime, {
        onNone: () => 0,
        onSome: (date) => date.getTime(),
      });
      if (cachedRates !== null && cachedRates.mtimeMs === mtimeMs) return cachedRates.rates;
      const saved = yield* fileSystem
        .readFileString(ratesPath)
        .pipe(Effect.flatMap(decodeRatesCache));
      const rates = parseRateTable(saved.document);
      cachedRates = { mtimeMs, rates };
      return rates;
    },
    Effect.orElseSucceed((): RateTable => new Map()),
  );

  const queryFailed = (cause: unknown) =>
    new ProjectUsageReadError({ reason: "queryFailed", cause });

  const turnsInWindow = (since: string, until: string) => sql`
    COALESCE(turn.completed_at, turn.started_at) >= ${since}
      AND COALESCE(turn.completed_at, turn.started_at) < ${until}
  `;
  const legacyInWindow = (since: string, until: string) =>
    sql`usage.created_at >= ${since} AND usage.created_at < ${until}`;

  const readTurnGroups = (where: Statement.Fragment, thresholdsJson: string) =>
    sql<TurnGroupRow>`
      WITH turns AS (
        SELECT
          turn.thread_id AS thread_id,
          turn.provider_thread_id AS provider_thread_id,
          COALESCE(
            json_extract(turn.payload_json, '$.model'),
            json_extract(turn.payload_json, '$.turnTokenUsage.models[0]')
          ) AS model,
          COALESCE(json_extract(turn.payload_json, '$.turnTokenUsage.inputTokens'), 0) AS input_tokens,
          COALESCE(json_extract(turn.payload_json, '$.turnTokenUsage.cachedInputTokens'), 0)
            AS cached_input_tokens,
          COALESCE(json_extract(turn.payload_json, '$.turnTokenUsage.cacheCreationTokens'), 0)
            AS cache_creation_tokens,
          COALESCE(json_extract(turn.payload_json, '$.turnTokenUsage.outputTokens'), 0)
            AS output_tokens
        FROM orchestration_v2_projection_provider_turns AS turn
        WHERE ${where}
          AND json_extract(turn.payload_json, '$.turnTokenUsage') IS NOT NULL
          AND COALESCE(json_extract(turn.payload_json, '$.turnTokenUsage.localCommand'), 0) = 0
      )
      SELECT
        thread.project_id AS "projectId",
        COALESCE(json_extract(provider.payload_json, '$.providerInstanceId'), provider.provider)
          AS "providerInstanceId",
        provider.provider AS "driver",
        turns.model AS "model",
        (SELECT COUNT(*) FROM json_each(${thresholdsJson}) WHERE json_each.value < turns.input_tokens)
          AS "tier",
        COUNT(*) AS "turns",
        SUM(turns.input_tokens) AS "inputTokens",
        SUM(turns.cached_input_tokens) AS "cachedInputTokens",
        SUM(turns.cache_creation_tokens) AS "cacheCreationTokens",
        SUM(turns.output_tokens) AS "outputTokens"
      FROM turns
      JOIN orchestration_v2_projection_provider_threads AS provider
        ON provider.provider_thread_id = turns.provider_thread_id
      LEFT JOIN orchestration_v2_projection_threads AS thread ON thread.thread_id = turns.thread_id
      GROUP BY 1, 2, 3, 4, 5
    `;

  // The first Avi Code stored Claude's input without cache reads and writes, and Codex's with them.
  const readLegacyGroups = (where: Statement.Fragment) =>
    sql<LegacyGroupRow>`
      SELECT
        COALESCE(thread.project_id, legacy_thread.project_id) AS "projectId",
        usage.provider_instance_id AS "providerInstanceId",
        usage.driver_kind AS "driver",
        NULLIF(TRIM(usage.model), '') AS "model",
        COUNT(*) AS "turns",
        SUM(
          CASE WHEN usage.driver_kind = 'codex' THEN usage.input_tokens
          ELSE usage.input_tokens + usage.cached_input_tokens + usage.cache_creation_input_tokens END
        ) AS "inputTokens",
        SUM(usage.cached_input_tokens) AS "cachedInputTokens",
        SUM(usage.cache_creation_input_tokens) AS "cacheCreationTokens",
        SUM(usage.output_tokens) AS "outputTokens",
        SUM(usage.cost_usd) AS "costUsd",
        SUM(usage.cost_usd IS NULL) AS "unpricedTurns"
      FROM provider_instance_usage AS usage
      LEFT JOIN orchestration_v2_projection_threads AS thread ON thread.thread_id = usage.thread_id
      LEFT JOIN projection_threads AS legacy_thread ON legacy_thread.thread_id = usage.thread_id
      WHERE ${where}
      GROUP BY 1, 2, 3, 4
    `;

  const hasLegacyUsage = sql<{ readonly found: number }>`
    SELECT 1 AS "found" FROM sqlite_master
    WHERE type = 'table' AND name = 'provider_instance_usage'
  `.pipe(Effect.map((rows) => rows.length > 0));

  const readProjects = (projectIds: readonly string[]) =>
    sql<ProjectRow>`
      SELECT project_id AS "projectId", title, workspace_root AS "workspaceRoot"
      FROM projection_projects
      WHERE project_id IN (SELECT value FROM json_each(${encodeJson(projectIds)}))
    `;

  /** Prices the matching turns and merges them with the legacy rows, one entry per account and model in each bucket. */
  const readEntries = Effect.fn("ProjectUsageService.readEntries")(function* (filter: {
    readonly turns: Statement.Fragment;
    readonly legacy: Statement.Fragment;
    readonly bucketOf: (row: GroupRow) => string | null;
  }) {
    const rates = yield* loadRates();
    const settings = yield* settingsService.getSettings.pipe(Effect.option);
    const overrides = createOverrideRateTable(
      Option.match(settings, { onNone: () => ({}), onSome: (s) => s.usagePriceOverrides }),
    );
    const aliases = resolveModelAliases(
      Option.match(settings, { onNone: () => ({}), onSome: (s) => s.usageModelAliases }),
    );

    const { turnGroups, legacyGroups } = yield* Effect.gen(function* () {
      const turnGroups = yield* readTurnGroups(filter.turns, encodeJson(contextThresholds(rates)));
      const legacyGroups = (yield* hasLegacyUsage) ? yield* readLegacyGroups(filter.legacy) : [];
      return { turnGroups, legacyGroups };
    }).pipe(NodeSqliteClient.readOnly, Effect.mapError(queryFailed));

    const buckets = new Map<string | null, Map<string, ProjectUsageEntry>>();
    const add = (row: GroupRow, costUsd: number | null, unpricedTurns: number) => {
      const model = row.model === null ? null : (aliases.get(row.model) ?? row.model);
      const bucket = filter.bucketOf(row);
      let entries = buckets.get(bucket);
      if (entries === undefined) {
        entries = new Map();
        buckets.set(bucket, entries);
      }
      const key = `${row.providerInstanceId}\0${row.driver}\0${model ?? ""}`;
      const existing = entries.get(key);
      entries.set(key, {
        providerInstanceId: row.providerInstanceId,
        driver: row.driver,
        model,
        turns: (existing?.turns ?? 0) + row.turns,
        inputTokens: (existing?.inputTokens ?? 0) + row.inputTokens,
        cachedInputTokens: (existing?.cachedInputTokens ?? 0) + row.cachedInputTokens,
        cacheCreationTokens: (existing?.cacheCreationTokens ?? 0) + row.cacheCreationTokens,
        outputTokens: (existing?.outputTokens ?? 0) + row.outputTokens,
        costUsd: existing === undefined ? costUsd : addCost(existing.costUsd, costUsd),
        unpricedTurns: (existing?.unpricedTurns ?? 0) + unpricedTurns,
      });
    };
    for (const row of turnGroups) {
      const model = row.model === null ? null : (aliases.get(row.model) ?? row.model);
      const costUsd = priceGroup(rates, overrides, model, row);
      add(row, costUsd, costUsd === null ? row.turns : 0);
    }
    for (const row of legacyGroups) add(row, row.costUsd, row.unpricedTurns);
    return buckets;
  });

  const read = Effect.fn("ProjectUsageService.read")(function* (input: ProjectUsageInput) {
    const bounds = windowBounds(input);
    if (bounds === null) return yield* new ProjectUsageReadError({ reason: "invalidWindow" });

    const byProject = yield* readEntries({
      turns: turnsInWindow(bounds.since, bounds.until),
      legacy: legacyInWindow(bounds.since, bounds.until),
      bucketOf: (row) => row.projectId,
    });
    const projectIds = [...byProject.keys()].flatMap((projectId) =>
      projectId === null ? [] : [projectId],
    );
    const projects =
      projectIds.length === 0
        ? []
        : yield* readProjects(projectIds).pipe(
            NodeSqliteClient.readOnly,
            Effect.mapError(queryFailed),
          );

    const projectRows = new Map(projects.map((project) => [project.projectId, project]));
    const summaryProjects: ProjectUsageProject[] = [...byProject].map(([projectId, entries]) => {
      const project = projectId === null ? undefined : projectRows.get(projectId);
      return {
        projectId,
        title: project?.title ?? null,
        workspaceRoot: project?.workspaceRoot ?? null,
        entries: [...entries.values()],
      };
    });
    const readAt = DateTime.formatIso(yield* DateTime.now);
    return { readAt, projects: summaryProjects };
  });

  const readThread = Effect.fn("ProjectUsageService.readThread")(function* (
    input: ThreadUsageInput,
  ) {
    const byThread = yield* readEntries({
      turns: sql`turn.thread_id = ${input.threadId}`,
      legacy: sql`usage.thread_id = ${input.threadId}`,
      bucketOf: () => null,
    });
    const readAt = DateTime.formatIso(yield* DateTime.now);
    return { readAt, entries: [...(byThread.get(null)?.values() ?? [])] };
  });

  return ProjectUsageService.of({ read, readThread });
});

export const layer = Layer.effect(ProjectUsageService, make);
