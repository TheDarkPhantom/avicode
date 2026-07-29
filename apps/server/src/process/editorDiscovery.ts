import type { EditorDiscoveryStatus, EditorId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as ExternalLauncher from "./externalLauncher.ts";

/**
 * Discovery probes every known editor command against every PATH entry, so a
 * cold filesystem cache can push a full scan into the multi-second range. It
 * runs in the background rather than inline in server config loading: nothing
 * waits on the result, so this budget only exists to release a scan that is
 * never going to finish, not to keep clients responsive.
 */
export const EDITOR_DISCOVERY_TIMEOUT = Duration.seconds(30);
const EDITOR_DISCOVERY_RETRY_DELAY = Duration.seconds(10);
const EDITOR_DISCOVERY_ATTEMPTS = 3;

export interface EditorDiscoverySnapshot {
  readonly availableEditors: ReadonlyArray<EditorId>;
  readonly editorDiscoveryStatus: EditorDiscoveryStatus;
}

/** Bound a discovery run, reporting `None` when the budget expires. */
export const discoverWithinBudget = <A, E, R>(discovery: Effect.Effect<ReadonlyArray<A>, E, R>) =>
  discovery.pipe(Effect.timeoutOption(EDITOR_DISCOVERY_TIMEOUT));

/**
 * EditorDiscovery - Background scan for installed editors.
 *
 * Server config reads the latest snapshot without ever blocking on the scan;
 * subscribers are told once it settles.
 */
export class EditorDiscovery extends Context.Service<
  EditorDiscovery,
  {
    /** Latest discovery result. Resolves immediately, even mid-scan. */
    readonly current: Effect.Effect<EditorDiscoverySnapshot>;
    /** Emits whenever discovery settles on a new result. */
    readonly streamChanges: Stream.Stream<EditorDiscoverySnapshot>;
    /** Re-run discovery, publishing the result if it completes. */
    readonly refresh: Effect.Effect<void>;
  }
>()("t3/process/editorDiscovery") {}

export const make = Effect.gen(function* () {
  const externalLauncher = yield* ExternalLauncher.ExternalLauncher;
  const snapshotRef = yield* Ref.make<EditorDiscoverySnapshot>({
    availableEditors: [],
    editorDiscoveryStatus: "pending",
  });
  const changesPubSub = yield* PubSub.unbounded<EditorDiscoverySnapshot>();

  const publish = (snapshot: EditorDiscoverySnapshot) =>
    Effect.gen(function* () {
      yield* Ref.set(snapshotRef, snapshot);
      yield* PubSub.publish(changesPubSub, snapshot);
    });

  const runOnce = Effect.gen(function* () {
    const discovered = yield* discoverWithinBudget(externalLauncher.resolveAvailableEditors());
    if (Option.isNone(discovered)) {
      yield* Effect.logWarning("Editor discovery timed out before completing.", {
        timeoutMs: Duration.toMillis(EDITOR_DISCOVERY_TIMEOUT),
      });
      return false;
    }
    yield* publish({
      availableEditors: discovered.value,
      editorDiscoveryStatus: "ready",
    });
    return true;
  });

  const refresh = Effect.gen(function* () {
    for (let attempt = 1; attempt <= EDITOR_DISCOVERY_ATTEMPTS; attempt += 1) {
      if (yield* runOnce) {
        return;
      }
      if (attempt < EDITOR_DISCOVERY_ATTEMPTS) {
        yield* Effect.sleep(EDITOR_DISCOVERY_RETRY_DELAY);
      }
    }
    // Every attempt hit the budget. Settle on what we have so clients stop
    // waiting on a scan this host is evidently never going to finish.
    yield* publish({
      availableEditors: (yield* Ref.get(snapshotRef)).availableEditors,
      editorDiscoveryStatus: "ready",
    });
  });

  yield* refresh.pipe(Effect.ignoreCause({ log: true }), Effect.forkScoped);

  return EditorDiscovery.of({
    current: Ref.get(snapshotRef),
    get streamChanges() {
      return Stream.fromPubSub(changesPubSub);
    },
    refresh,
  });
});

export const layer = Layer.effect(EditorDiscovery, make);
