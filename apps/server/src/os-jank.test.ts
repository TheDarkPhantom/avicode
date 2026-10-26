import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import { HostProcessEnvironment, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { CommandAvailability, WindowsShellEnvironment } from "@t3tools/shared/shell";
import * as Effect from "effect/Effect";
import { assert } from "vite-plus/test";

import { fixPath } from "./os-jank.ts";

it.effect("replaces a Path-spelled Windows PATH instead of adding a second key", () =>
  Effect.gen(function* () {
    const env: NodeJS.ProcessEnv = { Path: "C:\\Windows" };

    yield* fixPath().pipe(
      Effect.provideService(HostProcessPlatform, "win32"),
      Effect.provideService(HostProcessEnvironment, env),
      Effect.provideService(WindowsShellEnvironment, () => ({ PATH: "C:\\Tools" })),
      Effect.provideService(CommandAvailability, () => Effect.succeed(true)),
      Effect.provide(NodeServices.layer),
    );

    assert.deepEqual(env, { PATH: "C:\\Tools;C:\\Windows" });
  }),
);
