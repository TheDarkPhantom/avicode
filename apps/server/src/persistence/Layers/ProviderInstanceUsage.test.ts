import { ProviderDriverKind, ProviderInstanceId, ThreadId, TurnId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ProviderInstanceUsageRepository } from "../Services/ProviderInstanceUsage.ts";
import { ProviderInstanceUsageRepositoryLive } from "./ProviderInstanceUsage.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";

const codexDriver = ProviderDriverKind.make("codex");
const claudeDriver = ProviderDriverKind.make("claudeAgent");

// The layer — and therefore the database — is shared across the block, so
// every test scopes itself to its own instance id and filters on it.
const layer = it.layer(
  ProviderInstanceUsageRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
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
