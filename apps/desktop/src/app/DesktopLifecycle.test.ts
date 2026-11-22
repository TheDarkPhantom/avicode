import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";

import type * as Electron from "electron";

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronTheme from "../electron/ElectronTheme.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopLifecycle from "./DesktopLifecycle.ts";
import * as DesktopShutdown from "./DesktopShutdown.ts";
import * as DesktopState from "./DesktopState.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";

function makeLifecycleLayer(
  platform: NodeJS.Platform,
  appListeners: Map<string, (...args: readonly unknown[]) => void>,
  exit: (code: number) => Effect.Effect<void> = () => Effect.void,
) {
  const electronAppLayer = Layer.succeed(ElectronApp.ElectronApp, {
    metadata: Effect.die("unexpected metadata read"),
    name: Effect.succeed("T3 Code"),
    whenReady: Effect.void,
    quit: Effect.void,
    exit,
    relaunch: () => Effect.void,
    setPath: () => Effect.void,
    setName: () => Effect.void,
    setAboutPanelOptions: () => Effect.void,
    setAppUserModelId: () => Effect.void,
    requestSingleInstanceLock: Effect.succeed(true),
    getAppMetrics: Effect.succeed([]),
    isDefaultProtocolClient: () => Effect.succeed(false),
    setAsDefaultProtocolClient: () => Effect.succeed(true),
    setDesktopName: () => Effect.void,
    setDockIcon: () => Effect.void,
    appendCommandLineSwitch: () => Effect.void,
    onBeforeQuitForUpdate: (listener) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          appListeners.set("before-quit-for-update", listener);
        }),
        () =>
          Effect.sync(() => {
            appListeners.delete("before-quit-for-update");
          }),
      ).pipe(Effect.asVoid),
    on: (eventName, listener) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          appListeners.set(eventName, listener as unknown as (...args: readonly unknown[]) => void);
        }),
        () =>
          Effect.sync(() => {
            appListeners.delete(eventName);
          }),
      ).pipe(Effect.asVoid),
  } satisfies ElectronApp.ElectronApp["Service"]);

  const electronThemeLayer = Layer.succeed(ElectronTheme.ElectronTheme, {
    shouldUseDarkColors: Effect.succeed(false),
    setSource: () => Effect.void,
    onUpdated: () => Effect.void,
  });

  const desktopWindowLayer = Layer.succeed(DesktopWindow.DesktopWindow, {
    createMain: Effect.die("unexpected window creation"),
    ensureMain: Effect.die("unexpected window creation"),
    revealOrCreateMain: Effect.die("unexpected window creation"),
    activate: Effect.void,
    createMainIfBackendReady: Effect.void,
    showConnectingSplash: Effect.void,
    handleBackendReady: () => Effect.void,
    handleBackendNotReady: Effect.void,
    flushMainWindowBounds: Effect.void,
    setPanelWindowReservation: () => Effect.void,
    dispatchMenuAction: () => Effect.void,
    runMainContentsCommand: () => Effect.void,
    syncAppearance: Effect.void,
  });

  const environmentLayer = Layer.succeed(DesktopEnvironment.DesktopEnvironment, {
    platform,
    isDevelopment: false,
  } as DesktopEnvironment.DesktopEnvironment["Service"]);

  return DesktopLifecycle.layer.pipe(
    Layer.provideMerge(electronAppLayer),
    Layer.provideMerge(electronThemeLayer),
    Layer.provideMerge(desktopWindowLayer),
    Layer.provideMerge(environmentLayer),
    Layer.provideMerge(DesktopShutdown.layer),
    Layer.provideMerge(DesktopState.layer),
  );
}

describe("DesktopLifecycle", () => {
  for (const platform of ["darwin", "win32", "linux"] satisfies ReadonlyArray<NodeJS.Platform>) {
    it.effect(`lets the updater's quit event proceed on ${platform}`, () => {
      const appListeners = new Map<string, (...args: readonly unknown[]) => void>();

      const layer = makeLifecycleLayer(platform, appListeners);

      return Effect.scoped(
        Effect.gen(function* () {
          const lifecycle = yield* DesktopLifecycle.DesktopLifecycle;
          yield* lifecycle.register;

          appListeners.get("before-quit-for-update")?.();

          let prevented = false;
          const event = {
            preventDefault: () => {
              prevented = true;
            },
          } as Electron.Event;
          appListeners.get("before-quit")?.(event);

          assert.isFalse(
            prevented,
            "cancelling this event prevents the updater from completing its relaunch",
          );

          const state = yield* DesktopState.DesktopState;
          assert.isTrue(yield* Ref.get(state.quitting));
        }),
      ).pipe(Effect.provide(layer));
    });
  }

  it.effect("exits on a repeated quit only once shutdown has stalled", () =>
    Effect.gen(function* () {
      const appListeners = new Map<string, (...args: readonly unknown[]) => void>();
      const exitCodes: number[] = [];
      const exit = (code: number) =>
        Effect.sync(() => {
          exitCodes.push(code);
        });
      // Nothing marks this shutdown complete, so it stays pending.
      const layer = makeLifecycleLayer("darwin", appListeners, exit);

      yield* Effect.scoped(
        Effect.gen(function* () {
          const lifecycle = yield* DesktopLifecycle.DesktopLifecycle;
          yield* lifecycle.register;

          let prevented = 0;
          const event = {
            preventDefault: () => {
              prevented += 1;
            },
          } as Electron.Event;
          appListeners.get("before-quit")?.(event);
          appListeners.get("before-quit")?.(event);
          yield* TestClock.adjust("9999 millis");
          appListeners.get("before-quit")?.(event);
          assert.deepEqual(
            exitCodes,
            [],
            "a repeat before the threshold must not cut shutdown short",
          );

          yield* TestClock.adjust("1 millis");
          appListeners.get("before-quit")?.(event);

          assert.deepEqual(exitCodes, [0]);
          assert.equal(prevented, 4);
        }),
      ).pipe(Effect.provide(layer));
    }),
  );
});
