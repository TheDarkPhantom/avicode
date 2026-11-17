import { assert, describe, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { vi } from "vite-plus/test";

vi.mock("electron", () => ({}));

import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopIpc from "./DesktopIpc.ts";

const invokeMethod: DesktopIpc.DesktopIpcMethod<never, never> = {
  channel: "desktop.test.invoke",
  handler: () => Effect.void,
};

const syncMethod: DesktopIpc.DesktopSyncIpcMethod<never, never> = {
  channel: "desktop.test.sync",
  handler: () => Effect.void,
};

function makeIpcMain(
  overrides: Partial<DesktopIpc.DesktopIpcMain> = {},
): DesktopIpc.DesktopIpcMain {
  return {
    removeHandler: vi.fn(),
    handle: vi.fn(),
    removeAllListeners: vi.fn(),
    on: vi.fn(),
    ...overrides,
  };
}

describe("DesktopIpc", () => {
  it.effect("preserves invoke registration context and cause", () =>
    Effect.gen(function* () {
      const cause = new Error("invoke registration failed");
      const ipcMain = makeIpcMain({
        handle: () => {
          throw cause;
        },
      });
      const ipc = DesktopIpc.make(ipcMain, () => Effect.succeed(true));

      const error = yield* Effect.flip(Effect.scoped(ipc.handle(invokeMethod)));

      assert.instanceOf(error, DesktopIpc.DesktopIpcRegistrationError);
      assert.isTrue(DesktopIpc.isDesktopIpcError(error));
      assert.strictEqual(error.handlerKind, "invoke");
      assert.strictEqual(error.channel, invokeMethod.channel);
      assert.strictEqual(error.cause, cause);
      assert.include(error.message, "invoke");
      assert.include(error.message, invokeMethod.channel);
      assert.notInclude(error.message, cause.message);
    }),
  );

  it.effect("preserves sync unregistration context and cause in the finalizer defect", () =>
    Effect.gen(function* () {
      const cause = new Error("sync unregistration failed");
      let removeCount = 0;
      const ipcMain = makeIpcMain({
        removeAllListeners: () => {
          removeCount += 1;
          if (removeCount === 2) throw cause;
        },
      });
      const ipc = DesktopIpc.make(ipcMain, () => Effect.succeed(true));

      const exit = yield* Effect.exit(Effect.scoped(ipc.handleSync(syncMethod)));

      assert.isTrue(exit._tag === "Failure");
      if (exit._tag === "Success") return;
      const error = Cause.squash(exit.cause);
      assert.instanceOf(error, DesktopIpc.DesktopIpcUnregistrationError);
      assert.isTrue(DesktopIpc.isDesktopIpcError(error));
      assert.strictEqual(error.handlerKind, "sync");
      assert.strictEqual(error.channel, syncMethod.channel);
      assert.strictEqual(error.cause, cause);
      assert.notInclude(error.message, cause.message);
    }),
  );

  it.effect("answers only the main window's top frame", () =>
    Effect.gen(function* () {
      const mainFrame = {};
      const invoke = new Map<string, DesktopIpc.DesktopIpcHandleListener>();
      const sync = new Map<string, DesktopIpc.DesktopIpcSyncListener>();
      const ipc = yield* DesktopIpc.DesktopIpc.pipe(
        Effect.provide(
          DesktopIpc.layer({
            removeHandler: (channel) => void invoke.delete(channel),
            handle: (channel, listener) => void invoke.set(channel, listener),
            removeAllListeners: (channel) => void sync.delete(channel),
            on: (channel, listener) => void sync.set(channel, listener),
          }).pipe(
            Layer.provide(
              Layer.mock(ElectronWindow.ElectronWindow, {
                main: Effect.succeedSome({
                  webContents: { id: 1, mainFrame },
                } as unknown as Electron.BrowserWindow),
              }),
            ),
          ),
        ),
      );
      yield* ipc.handle(
        DesktopIpc.makeIpcMethod({
          channel: "token",
          payload: Schema.Void,
          result: Schema.String,
          handler: () => Effect.succeed("secret"),
        }),
      );
      yield* ipc.handleSync({ channel: "token-sync", handler: () => Effect.succeed("secret") });

      const senders = {
        app: { sender: { id: 1 }, senderFrame: mainFrame },
        appSubframe: { sender: { id: 1 }, senderFrame: {} },
        previewGuest: { sender: { id: 2 }, senderFrame: {} },
      };
      const results: Record<string, unknown> = {};
      for (const [name, sender] of Object.entries(senders)) {
        const event = { ...sender, returnValue: "unset" as unknown };
        sync.get("token-sync")!(event);
        results[name] = [
          yield* Effect.promise(() =>
            Promise.resolve(invoke.get("token")!(sender, undefined)).catch(() => "rejected"),
          ),
          event.returnValue,
        ];
      }
      assert.deepEqual(results, {
        app: ["secret", "secret"],
        appSubframe: ["rejected", undefined],
        previewGuest: ["rejected", undefined],
      });
    }).pipe(Effect.scoped),
  );
});
