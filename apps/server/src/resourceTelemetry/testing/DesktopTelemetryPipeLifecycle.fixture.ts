// @effect-diagnostics nodeBuiltinImport:off - Entry point for the inherited-pipe shutdown regression test.
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../../config.ts";
import * as ServerSettings from "../../serverSettings.ts";
import * as DesktopTelemetryReceiver from "../DesktopTelemetryReceiver.ts";

// Avi Code addition: the fork has no desktop browser channel, so this fixture covers only the
// telemetry pipe from upstream's DesktopPipeLifecycle fixture (#17386).
Effect.gen(function* () {
  const base = yield* ServerConfig.ServerConfig.pipe(
    Effect.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-pipe-lifecycle-" })),
  );
  const context = yield* Layer.build(
    DesktopTelemetryReceiver.layer.pipe(
      Layer.provide(ServerSettings.layerTest()),
      Layer.provide(
        Layer.succeed(ServerConfig.ServerConfig, {
          ...base,
          desktopTelemetryFd: 4,
          desktopTelemetryControlFd: 5,
        }),
      ),
    ),
  );
  const telemetry = Context.get(context, DesktopTelemetryReceiver.DesktopTelemetryReceiver);
  const health = yield* telemetry.subscribeHealth;
  const healthy = yield* health.changes.pipe(
    Stream.filter((value) => value.status === "healthy"),
    Stream.runHead,
    Effect.forkScoped,
  );
  yield* Console.log("ready");
  yield* Fiber.join(healthy);
  yield* Console.log("verified");
}).pipe(Effect.scoped, Effect.provide(NodeServices.layer), NodeRuntime.runMain);
