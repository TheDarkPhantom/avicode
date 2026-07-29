import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { makeProviderAuthAudit, type ProviderAuthAuditEvent } from "./providerAuthAudit.ts";

const instanceId = ProviderInstanceId.make("claude_personal");
const driver = ProviderDriverKind.make("claudeAgent");

const makeProvider = (
  authStatus: ServerProvider["auth"]["status"],
  checkedAt: string,
): ServerProvider => ({
  instanceId,
  driver,
  displayName: "Claude - Personal",
  enabled: true,
  installed: true,
  version: "2.1.220",
  status: authStatus === "unauthenticated" ? "error" : "ready",
  auth: { status: authStatus },
  checkedAt,
  models: [],
  slashCommands: [],
  skills: [],
});

const readEvents = Effect.fn("readEvents")(function* (filePath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const raw = yield* fileSystem.readFileString(filePath);
  return raw
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as ProviderAuthAuditEvent);
});

it.layer(NodeServices.layer)("providerAuthAudit", (it) => {
  it.effect("records only definitive per-instance authentication transitions", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-provider-auth-audit-",
      });
      const filePath = `${tempDir}/auth-audit.jsonl`;
      const initialProvider = makeProvider("authenticated", "2026-07-29T10:00:00.000Z");
      const audit = yield* makeProviderAuthAudit({
        filePath,
        initialProviders: [initialProvider],
      });

      yield* audit.observe([initialProvider]);
      yield* audit.observe([makeProvider("unknown", "2026-07-29T10:01:00.000Z")]);
      assert.isFalse(yield* fileSystem.exists(filePath));

      const loggedOut = makeProvider("unauthenticated", "2026-07-29T10:02:00.000Z");
      yield* audit.observe([loggedOut]);
      yield* audit.observe([loggedOut]);
      yield* audit.observe([makeProvider("authenticated", "2026-07-29T10:03:00.000Z")]);

      const events = yield* readEvents(filePath);
      assert.lengthOf(events, 2);
      assert.deepInclude(events[0], {
        event: "provider.auth.logged_out",
        instanceId,
        driver,
        displayName: "Claude - Personal",
        previousStatus: "authenticated",
        status: "unauthenticated",
        providerCheckedAt: "2026-07-29T10:02:00.000Z",
      });
      assert.deepInclude(events[1], {
        event: "provider.auth.authenticated",
        instanceId,
        driver,
        displayName: "Claude - Personal",
        previousStatus: "unauthenticated",
        status: "authenticated",
        providerCheckedAt: "2026-07-29T10:03:00.000Z",
      });
      assert.match(events[0]!.timestamp, /^\d{4}-\d{2}-\d{2}T/u);
    }),
  );

  it.effect("uses the first definitive state as a baseline without fabricating a transition", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-provider-auth-observed-",
      });
      const filePath = `${tempDir}/auth-audit.jsonl`;
      const audit = yield* makeProviderAuthAudit({
        filePath,
        initialProviders: [],
      });

      yield* audit.observe([makeProvider("unauthenticated", "2026-07-29T10:00:00.000Z")]);

      assert.isFalse(yield* fileSystem.exists(filePath));
      yield* audit.observe([makeProvider("authenticated", "2026-07-29T10:01:00.000Z")]);
      assert.deepInclude((yield* readEvents(filePath))[0], {
        event: "provider.auth.authenticated",
        previousStatus: "unauthenticated",
        status: "authenticated",
      });
    }),
  );
});
