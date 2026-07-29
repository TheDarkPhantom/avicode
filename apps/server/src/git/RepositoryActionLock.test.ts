import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import { afterEach, describe, expect } from "vite-plus/test";

import {
  __resetRepositoryLocksForTests,
  repositoryLockKey,
  withRepositoryLock,
} from "./RepositoryActionLock.ts";

afterEach(() => {
  __resetRepositoryLocksForTests();
});

describe("repositoryLockKey", () => {
  // The whole point of keying on the common dir: two worktrees of one
  // repository must contend for the same permit, because they share the refs
  // and the remote branch that concurrent agents collide on.
  it.effect("gives every worktree of a repository the same key", () =>
    Effect.sync(() => {
      const mainCheckout = repositoryLockKey(
        { metadataPath: "/repos/app/.git", rootPath: "/repos/app" },
        { platform: "linux" },
      );
      const worktree = repositoryLockKey(
        { metadataPath: "/repos/app/.git", rootPath: "/repos/app-feature-x" },
        { platform: "linux" },
      );
      expect(worktree).toBe(mainCheckout);
    }),
  );

  it.effect("keys distinct repositories apart", () =>
    Effect.sync(() => {
      expect(
        repositoryLockKey(
          { metadataPath: "/repos/app/.git", rootPath: "/repos/app" },
          { platform: "linux" },
        ),
      ).not.toBe(
        repositoryLockKey(
          { metadataPath: "/repos/other/.git", rootPath: "/repos/other" },
          { platform: "linux" },
        ),
      );
    }),
  );

  it.effect("falls back to the checkout root when the common dir is unknown", () =>
    Effect.sync(() => {
      expect(
        repositoryLockKey({ metadataPath: null, rootPath: "/repos/app" }, { platform: "linux" }),
      ).toBe("/repos/app");
    }),
  );

  // `rev-parse --git-common-dir` answers ".git" from a checkout root and the
  // driver does not absolutize it. Keying on that raw value would collapse
  // every repository onto one permit — a global merge lock.
  it.effect("resolves a relative common dir against the checkout root", () =>
    Effect.sync(() => {
      const app = repositoryLockKey(
        { metadataPath: ".git", rootPath: "/repos/app" },
        { platform: "linux" },
      );
      const other = repositoryLockKey(
        { metadataPath: ".git", rootPath: "/repos/other" },
        { platform: "linux" },
      );
      expect(app).toBe("/repos/app/.git");
      expect(other).not.toBe(app);
    }),
  );

  it.effect("collapses redundant segments and trailing separators", () =>
    Effect.sync(() => {
      const canonical = repositoryLockKey(
        { metadataPath: "/repos/app/.git", rootPath: "/repos/app" },
        { platform: "linux" },
      );
      expect(
        repositoryLockKey(
          { metadataPath: "/repos//app/./.git/", rootPath: "/repos/app" },
          { platform: "linux" },
        ),
      ).toBe(canonical);
      expect(
        repositoryLockKey(
          { metadataPath: "/repos/app/worktrees/../.git", rootPath: "/repos/app" },
          { platform: "linux" },
        ),
      ).toBe(canonical);
    }),
  );

  it.effect("treats case-different spellings as one repository off Linux", () =>
    Effect.sync(() => {
      expect(
        repositoryLockKey(
          { metadataPath: "C:\\Repos\\App\\.git", rootPath: "C:\\Repos\\App" },
          { platform: "win32" },
        ),
      ).toBe(
        repositoryLockKey(
          { metadataPath: "c:\\repos\\app\\.git", rootPath: "c:\\repos\\app" },
          { platform: "win32" },
        ),
      );
    }),
  );

  it.effect("keeps case-different spellings apart on Linux", () =>
    Effect.sync(() => {
      expect(
        repositoryLockKey(
          { metadataPath: "/repos/App/.git", rootPath: "/repos/App" },
          {
            platform: "linux",
          },
        ),
      ).not.toBe(
        repositoryLockKey(
          { metadataPath: "/repos/app/.git", rootPath: "/repos/app" },
          {
            platform: "linux",
          },
        ),
      );
    }),
  );
});

describe("withRepositoryLock", () => {
  // The failure this exists to prevent: two agents interleaving their
  // commit/push/PR sequences on one repository.
  it.effect("runs actions on the same repository one at a time", () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const firstMayFinish = yield* Deferred.make<void>();

      const first = yield* Effect.forkChild(
        withRepositoryLock(
          "repo-a",
          Effect.gen(function* () {
            events.push("first:start");
            yield* Deferred.await(firstMayFinish);
            events.push("first:end");
          }),
        ),
        { startImmediately: true },
      );

      // Let the first action take the permit before the second asks for it.
      yield* Effect.yieldNow;

      const second = yield* Effect.forkChild(
        withRepositoryLock(
          "repo-a",
          Effect.sync(() => {
            events.push("second:start");
          }),
        ),
        { startImmediately: true },
      );

      yield* Effect.yieldNow;
      // The second action must not have begun while the first holds the permit.
      expect(events).toEqual(["first:start"]);

      yield* Deferred.succeed(firstMayFinish, undefined);
      yield* Fiber.join(first);
      yield* Fiber.join(second);

      expect(events).toEqual(["first:start", "first:end", "second:start"]);
    }),
  );

  it.effect("lets different repositories proceed concurrently", () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const blocked = yield* Deferred.make<void>();

      const held = yield* Effect.forkChild(withRepositoryLock("repo-a", Deferred.await(blocked)), {
        startImmediately: true,
      });
      yield* Effect.yieldNow;

      yield* withRepositoryLock(
        "repo-b",
        Effect.sync(() => {
          events.push("other-repo-ran");
        }),
      );

      expect(events).toEqual(["other-repo-ran"]);
      yield* Deferred.succeed(blocked, undefined);
      yield* Fiber.join(held);
    }),
  );

  // A cancelled or failed turn must not strand every other thread on the repo.
  it.effect("releases the permit when an action fails", () =>
    Effect.gen(function* () {
      const failure = yield* withRepositoryLock("repo-a", Effect.fail("boom")).pipe(Effect.flip);
      expect(failure).toBe("boom");

      const ran = yield* withRepositoryLock("repo-a", Effect.succeed("next action ran"));
      expect(ran).toBe("next action ran");
    }),
  );

  it.effect("releases the permit when an action is interrupted", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const held = yield* Effect.forkChild(
        withRepositoryLock(
          "repo-a",
          Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined);
            return yield* Effect.never;
          }),
        ),
        { startImmediately: true },
      );

      yield* Deferred.await(started);
      yield* Fiber.interrupt(held);

      const ran = yield* withRepositoryLock("repo-a", Effect.succeed("next action ran"));
      expect(ran).toBe("next action ran");
    }),
  );
});
