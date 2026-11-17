import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { claudeToolSearchOverride, resolveClaudeToolSearchOverride } from "./ClaudeToolSearch.ts";

describe("claudeToolSearchOverride", () => {
  it("pins Claude's auto tool search on", () => {
    for (const value of ["auto", "auto:10", "auto:99.5", "auto:x", "auto:Infinity"]) {
      assert.equal(claudeToolSearchOverride(value), "true", value);
    }
    for (const value of [
      undefined,
      "true",
      "false",
      "auto:0",
      "auto:-5",
      "auto:100",
      "auto:1e2",
      "auto:1_000",
      "auto:1,000",
      "AUTO",
    ]) {
      assert.isUndefined(claudeToolSearchOverride(value), String(value));
    }
  });
});

it.layer(NodeServices.layer)("resolveClaudeToolSearchOverride", (it) => {
  it.effect("reads local, project, and user settings before the process env", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fileSystem.makeTempDirectoryScoped({ prefix: "avicode-claude-home-" });
      const userSettingsPath = path.join(home, "settings.json");
      const resolve = (
        userSettingsJson: string,
        cwd: string | undefined,
        environment: NodeJS.ProcessEnv = {},
      ) =>
        fileSystem.writeFileString(userSettingsPath, userSettingsJson).pipe(
          Effect.andThen(
            resolveClaudeToolSearchOverride({
              cwd,
              userSettingsPath,
              homeDirectory: home,
              environment,
            }),
          ),
          Effect.provideService(HostProcessPlatform, "linux"),
        );

      assert.equal(yield* resolve('{"env":{"ENABLE_TOOL_SEARCH":"auto"}}', undefined), "true");
      assert.isUndefined(yield* resolve('{"env":{"ENABLE_TOOL_SEARCH":"false"}}', undefined));
      assert.isUndefined(yield* resolve("{}", undefined));

      // Claude Code keeps the local file at the repository root, the main checkout's root in a
      // worktree, and that file beats the user's settings.
      const repo = yield* fileSystem.makeTempDirectoryScoped({ prefix: "avicode-claude-repo-" });
      const worktree = yield* fileSystem.makeTempDirectoryScoped({ prefix: "avicode-claude-wt-" });
      const worktreeGitDir = path.join(repo, ".git", "worktrees", "wt");
      yield* fileSystem.makeDirectory(worktreeGitDir, { recursive: true });
      yield* fileSystem.writeFileString(path.join(worktreeGitDir, "commondir"), "../..\n");
      yield* fileSystem.writeFileString(path.join(worktree, ".git"), `gitdir: ${worktreeGitDir}\n`);
      yield* fileSystem.makeDirectory(path.join(repo, ".claude"));
      yield* fileSystem.makeDirectory(path.join(repo, "packages", "app"), { recursive: true });
      const rootLocal = (value: string) =>
        fileSystem.writeFileString(
          path.join(repo, ".claude", "settings.local.json"),
          `{"env":{"ENABLE_TOOL_SEARCH":"${value}"}}`,
        );
      const userAuto = '{"env":{"ENABLE_TOOL_SEARCH":"auto"}}';
      yield* rootLocal("auto");
      assert.equal(yield* resolve("{}", worktree), "true");
      yield* rootLocal("false");
      assert.isUndefined(yield* resolve(userAuto, worktree));
      assert.isUndefined(yield* resolve(userAuto, path.join(repo, "packages", "app")));

      // Project settings beat user settings, and the process env applies only when no file sets it.
      const project = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "avicode-claude-project-",
      });
      yield* fileSystem.makeDirectory(path.join(project, ".claude"));
      yield* fileSystem.writeFileString(
        path.join(project, ".claude", "settings.json"),
        '{"env":{"ENABLE_TOOL_SEARCH":"auto"}}',
      );
      assert.equal(yield* resolve('{"env":{"ENABLE_TOOL_SEARCH":"false"}}', project), "true");
      assert.equal(yield* resolve("{}", undefined, { ENABLE_TOOL_SEARCH: "auto" }), "true");
    }).pipe(Effect.scoped),
  );
});
