/**
 * Archives threads that have stayed settled for `aviCodeArchiveSettledAfterDays`.
 *
 * Threads a scheduled task posts into are kept: an archived thread refuses messages, so every
 * later run of that task would fail.
 *
 * @module SettledThreadArchiver
 */
import { CommandId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Semaphore from "effect/Semaphore";
import * as SqlClient from "effect/sql/SqlClient";
import * as Stream from "effect/Stream";

import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import { forkParked } from "../serverActivation.ts";
import * as ServerSettings from "../serverSettings.ts";

/** Listed threads settled before `settledBefore` (ISO) that no scheduled task posts into. */
export const selectArchivableSettledThreadIds = Effect.fn(
  "SettledThreadArchiver.selectArchivableSettledThreadIds",
)(function* (settledBefore: string) {
  const sql = yield* SqlClient.SqlClient;
  // ISO strings in one format, so string order is time order.
  const rows = yield* sql<{ readonly thread_id: string }>`
    SELECT t.thread_id FROM orchestration_v2_projection_threads t
    WHERE t.deleted_at IS NULL
      AND t.archived_at IS NULL
      AND json_extract(t.payload_json, '$.lineage.relationshipToParent') IS NOT 'subagent'
      AND json_extract(t.payload_json, '$.lineage.sideChat') IS NOT 1
      AND json_extract(t.payload_json, '$.settledOverride') = 'settled'
      AND json_extract(t.payload_json, '$.settledAt') < ${settledBefore}
      AND NOT EXISTS (SELECT 1 FROM scheduled_tasks s WHERE s.thread_id = t.thread_id)
    ORDER BY json_extract(t.payload_json, '$.settledAt') ASC
  `;
  return rows.map((row) => ThreadId.make(row.thread_id));
});

const make = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const settingsService = yield* ServerSettings.ServerSettingsService;
  const random = yield* SecureRandom.SecureRandom;
  const sql = yield* SqlClient.SqlClient;
  // The hourly sweep and a settings change can overlap; one at a time archives each thread once.
  const sweeping = yield* Semaphore.make(1);

  const archiveThread = Effect.fnUntraced(
    function* (threadId: ThreadId) {
      const uuid = yield* random.uuidV4();
      yield* orchestrator.dispatch({
        type: "thread.archive",
        commandId: CommandId.make(`server:avicode-auto-archive:${threadId}:${uuid}`),
        threadId,
      });
    },
    (effect, threadId) =>
      effect.pipe(
        Effect.catchCauseIf(
          (cause) => !Cause.hasInterruptsOnly(cause),
          (cause) =>
            Effect.logWarning("automatic archive of settled thread skipped", {
              threadId,
              cause: Cause.pretty(cause),
            }),
        ),
      ),
  );

  const sweep = Effect.fn("SettledThreadArchiver.sweep")(function* () {
    const { aviCodeArchiveSettledAfterDays: days } = yield* settingsService.getSettings;
    if (days === null) return;
    const settledBefore = DateTime.formatIso(DateTime.subtract(yield* DateTime.now, { days }));
    const threadIds = yield* selectArchivableSettledThreadIds(settledBefore).pipe(
      Effect.provideService(SqlClient.SqlClient, sql),
    );
    yield* Effect.forEach(threadIds, archiveThread, { discard: true });
  });

  const safeSweep = sweep().pipe(
    sweeping.withPermits(1),
    Effect.catchCauseIf(
      (cause) => !Cause.hasInterruptsOnly(cause),
      (cause) => Effect.logWarning("settled thread archive sweep failed", { cause }),
    ),
  );

  const start = Effect.fn("SettledThreadArchiver.start")(function* () {
    const settingsChanges = yield* settingsService.subscribeChanges;
    yield* forkParked(safeSweep.pipe(Effect.repeat(Schedule.spaced("1 hour")), Effect.asVoid));
    yield* forkParked(
      settingsChanges.pipe(
        Stream.map((settings) => settings.aviCodeArchiveSettledAfterDays),
        Stream.changes,
        Stream.runForEach(() => safeSweep),
      ),
    );
  });

  return { start };
});

export const layer = Layer.effectDiscard(make.pipe(Effect.flatMap((service) => service.start())));
