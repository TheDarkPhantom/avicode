import type { ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";

type AuditableAuthStatus = Extract<
  ServerProvider["auth"]["status"],
  "authenticated" | "unauthenticated"
>;

export interface ProviderAuthAuditEvent {
  readonly timestamp: string;
  readonly event: "provider.auth.authenticated" | "provider.auth.logged_out";
  readonly instanceId: ProviderInstanceId;
  readonly driver: ServerProvider["driver"];
  readonly displayName?: string | undefined;
  readonly previousStatus: AuditableAuthStatus;
  readonly status: AuditableAuthStatus;
  readonly providerCheckedAt: string;
}

const auditableStatus = (provider: ServerProvider): AuditableAuthStatus | undefined => {
  switch (provider.auth.status) {
    case "authenticated":
    case "unauthenticated":
      return provider.auth.status;
    default:
      return undefined;
  }
};

const initialStatuses = (
  providers: ReadonlyArray<ServerProvider>,
): ReadonlyMap<ProviderInstanceId, AuditableAuthStatus> => {
  const statuses = new Map<ProviderInstanceId, AuditableAuthStatus>();
  for (const provider of providers) {
    const status = auditableStatus(provider);
    if (status !== undefined) {
      statuses.set(provider.instanceId, status);
    }
  }
  return statuses;
};

const eventName = (status: AuditableAuthStatus): ProviderAuthAuditEvent["event"] => {
  return status === "authenticated" ? "provider.auth.authenticated" : "provider.auth.logged_out";
};

/**
 * Persist definitive provider authentication observations as newline-delimited
 * JSON. Cached snapshots seed the baseline, so restarting Avi Code does not
 * manufacture a transition. Unknown/checking states are ignored.
 */
export const makeProviderAuthAudit = Effect.fn("makeProviderAuthAudit")(function* (input: {
  readonly filePath: string;
  readonly initialProviders: ReadonlyArray<ServerProvider>;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const statusesRef = yield* Ref.make(initialStatuses(input.initialProviders));
  const semaphore = yield* Semaphore.make(1);

  const observeBase = Effect.fn("ProviderAuthAudit.observe")(function* (
    providers: ReadonlyArray<ServerProvider>,
  ) {
    const previousStatuses = yield* Ref.get(statusesRef);
    const nextStatuses = new Map(previousStatuses);
    const timestamp = DateTime.formatIso(yield* DateTime.now);
    const events: Array<ProviderAuthAuditEvent> = [];

    for (const provider of providers) {
      const status = auditableStatus(provider);
      if (status === undefined) {
        continue;
      }

      const previousStatus = previousStatuses.get(provider.instanceId);
      if (previousStatus === undefined) {
        nextStatuses.set(provider.instanceId, status);
        continue;
      }
      if (previousStatus === status) {
        continue;
      }

      events.push({
        timestamp,
        event: eventName(status),
        instanceId: provider.instanceId,
        driver: provider.driver,
        ...(provider.displayName ? { displayName: provider.displayName } : {}),
        previousStatus,
        status,
        providerCheckedAt: provider.checkedAt,
      });
      nextStatuses.set(provider.instanceId, status);
    }

    if (events.length === 0) {
      yield* Ref.set(statusesRef, nextStatuses);
      return;
    }

    yield* fileSystem.writeFileString(
      input.filePath,
      `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
      { flag: "a" },
    );
    yield* Ref.set(statusesRef, nextStatuses);
  });
  const observe = (providers: ReadonlyArray<ServerProvider>) =>
    semaphore.withPermits(1)(observeBase(providers));

  return { observe } as const;
});
