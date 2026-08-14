import { ProviderInstanceId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { ProviderQuotaTracker } from "../Services/ProviderQuotaTracker.ts";
import { ProviderQuotaTrackerLive } from "./ProviderQuotaTracker.ts";

const lawrence = ProviderInstanceId.make("claude_lawrence");
const other = ProviderInstanceId.make("claude_other");

it.effect("replaces stale partial quota with an authoritative snapshot", () =>
  Effect.gen(function* () {
    const tracker = yield* ProviderQuotaTracker;
    yield* tracker.record({
      instanceId: lawrence,
      quota: {
        windows: [
          { id: "five_hour", label: "5-hour", usedPercent: 10 },
          { id: "seven_day", label: "Weekly", usedPercent: 1 },
          { id: "nimbus_quill", label: "Fable", usedPercent: 0 },
        ],
        capturedAt: "2026-08-14T01:00:00.000Z",
      },
    });
    yield* tracker.record({
      instanceId: other,
      quota: {
        windows: [{ id: "five_hour", label: "5-hour", usedPercent: 40 }],
        capturedAt: "2026-08-14T01:00:00.000Z",
      },
    });

    yield* tracker.record({
      instanceId: lawrence,
      authoritative: true,
      quota: {
        windows: [
          { id: "five_hour", label: "5-hour", usedPercent: 13 },
          { id: "seven_day", label: "Weekly", usedPercent: 78 },
          { id: "nimbus_quill", label: "Fable", usedPercent: 55 },
        ],
        planType: "max",
        capturedAt: "2026-08-14T02:00:00.000Z",
      },
    });

    assert.deepStrictEqual((yield* tracker.get(lawrence))?.windows, [
      { id: "five_hour", label: "5-hour", usedPercent: 13 },
      { id: "seven_day", label: "Weekly", usedPercent: 78 },
      { id: "nimbus_quill", label: "Fable", usedPercent: 55 },
    ]);
    assert.strictEqual((yield* tracker.get(other))?.windows[0]?.usedPercent, 40);
  }).pipe(Effect.provide(ProviderQuotaTrackerLive)),
);

it.effect("merges later single-window runtime quota patches", () =>
  Effect.gen(function* () {
    const tracker = yield* ProviderQuotaTracker;
    yield* tracker.record({
      instanceId: lawrence,
      authoritative: true,
      quota: {
        windows: [
          { id: "five_hour", label: "5-hour", usedPercent: 13 },
          { id: "seven_day", label: "Weekly", usedPercent: 78 },
        ],
        planType: "max",
        capturedAt: "2026-08-14T02:00:00.000Z",
      },
    });
    yield* tracker.record({
      instanceId: lawrence,
      quota: {
        windows: [{ id: "five_hour", label: "5-hour", usedPercent: 14 }],
        status: "ok",
        capturedAt: "2026-08-14T02:01:00.000Z",
      },
    });

    const quota = yield* tracker.get(lawrence);
    assert.deepStrictEqual(quota?.windows, [
      { id: "five_hour", label: "5-hour", usedPercent: 14 },
      { id: "seven_day", label: "Weekly", usedPercent: 78 },
    ]);
    assert.strictEqual(quota?.planType, "max");
    assert.strictEqual(quota?.status, "ok");
  }).pipe(Effect.provide(ProviderQuotaTrackerLive)),
);
