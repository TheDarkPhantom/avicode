import { describe, expect, it } from "@effect/vitest";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { AtomRegistry } from "effect/unstable/reactivity";

import { createThreadCommandSchedulers } from "./threadCommands.ts";
import type { AtomCommandResult } from "./runtime.ts";

describe("thread command scheduling", () => {
  it("lets an interrupt bypass a stalled regular command for the same thread", async () => {
    const registry = AtomRegistry.make();
    const schedulers = createThreadCommandSchedulers();
    const concurrency = { mode: "serial" as const, key: () => "environment:thread" };
    let releaseRegular!: () => void;
    const stalled = schedulers.regular.schedule(
      registry,
      concurrency,
      undefined,
      () =>
        new Promise<AtomCommandResult<void, never>>((resolve) => {
          releaseRegular = () => resolve(AsyncResult.success(undefined));
        }),
    );

    const interrupt = await schedulers.interrupt.schedule(
      registry,
      concurrency,
      undefined,
      async () => AsyncResult.success("stopped"),
    );

    expect(interrupt).toMatchObject({ _tag: "Success", value: "stopped" });
    releaseRegular();
    await stalled;
    registry.dispose();
  });
});
