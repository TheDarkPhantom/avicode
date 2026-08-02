import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { SpawnExecutableResolution } from "@t3tools/shared/shell";
import * as ExternalLauncher from "./externalLauncher.ts";
import { isAbsolutePathForPlatform } from "./launchTargetPath.ts";

function makeMockDetachedHandle(onUnref: () => void = () => undefined) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
    isRunning: Effect.succeed(true),
    kill: () => Effect.void,
    unref: Effect.sync(() => {
      onUnref();
      return Effect.void;
    }),
    stdin: Sink.drain,
    stdout: Stream.empty,
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

const testLayer = (input: {
  readonly platform: NodeJS.Platform;
  readonly env?: Record<string, string>;
  readonly resolveExecutable?: (command: string) => string | undefined;
  readonly onSpawn?: (command: ChildProcess.StandardCommand) => void;
  readonly onUnref?: () => void;
}) => {
  const spawnerLayer = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.sync(() => {
        assert.equal(ChildProcess.isStandardCommand(command), true);
        if (!ChildProcess.isStandardCommand(command)) {
          throw new Error("Expected a standard command");
        }
        input.onSpawn?.(command);
        return makeMockDetachedHandle(input.onUnref);
      }),
    ),
  );

  return Layer.mergeAll(
    ExternalLauncher.layer.pipe(Layer.provide(Layer.merge(NodeServices.layer, spawnerLayer))),
    Layer.succeed(HostProcessPlatform, input.platform),
    Layer.succeed(
      SpawnExecutableResolution,
      (command) => input.resolveExecutable?.(command) ?? command,
    ),
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: input.env ?? {} })),
  );
};

it.effect("launches the default browser through the platform command", () => {
  let spawned: ChildProcess.StandardCommand | undefined;
  let didUnref = false;
  return Effect.gen(function* () {
    const launcher = yield* ExternalLauncher.ExternalLauncher;

    yield* launcher.launchBrowser("https://example.com/some path");

    assert.ok(spawned);
    assert.equal(spawned.command, "xdg-open");
    assert.deepEqual(spawned.args, ["https://example.com/some path"]);
    assert.equal(spawned.options.detached, true);
    assert.equal(didUnref, true);
  }).pipe(
    Effect.provide(
      testLayer({
        platform: "linux",
        onSpawn: (command) => {
          spawned = command;
        },
        onUnref: () => {
          didUnref = true;
        },
      }),
    ),
  );
});

it.effect("launches an installed editor with platform-safe arguments", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const binDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-editors-" });
    yield* fileSystem.writeFileString(path.join(binDir, "code.CMD"), "@echo off\r\n");

    let spawned: ChildProcess.StandardCommand | undefined;
    yield* Effect.gen(function* () {
      const launcher = yield* ExternalLauncher.ExternalLauncher;
      yield* launcher.launchEditor({
        editor: "vscode",
        cwd: "C:\\workspace with spaces\\src\\index.ts:12:4",
      });
    }).pipe(
      Effect.provide(
        testLayer({
          platform: "win32",
          env: { PATH: binDir, PATHEXT: ".COM;.EXE;.BAT;.CMD" },
          resolveExecutable: (command) =>
            command === "code" ? "C:\\Program Files\\Microsoft VS Code\\bin\\code.CMD" : command,
          onSpawn: (command) => {
            spawned = command;
          },
        }),
      ),
    );

    assert.ok(spawned);
    assert.equal(spawned.command, '^"C:\\Program^ Files\\Microsoft^ VS^ Code\\bin\\code.CMD^"');
    assert.deepEqual(spawned.args, [
      '^"--goto^"',
      '^"C:\\workspace^ with^ spaces\\src\\index.ts:12:4^"',
    ]);
    assert.equal(spawned.options.shell, true);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("discovers editors through the service API", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const binDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-editors-" });
    yield* fileSystem.writeFileString(path.join(binDir, "code.CMD"), "@echo off\r\n");
    yield* fileSystem.writeFileString(path.join(binDir, "explorer.CMD"), "@echo off\r\n");

    const editors = yield* Effect.gen(function* () {
      const launcher = yield* ExternalLauncher.ExternalLauncher;
      return yield* launcher.resolveAvailableEditors();
    }).pipe(
      Effect.provide(
        testLayer({
          platform: "win32",
          env: { PATH: binDir, PATHEXT: ".COM;.EXE;.BAT;.CMD" },
        }),
      ),
    );

    assert.equal(editors.includes("vscode"), true);
    assert.equal(editors.includes("file-manager"), true);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("rejects unknown editors through the service API", () =>
  Effect.gen(function* () {
    const launcher = yield* ExternalLauncher.ExternalLauncher;
    const error = yield* launcher
      .launchEditor({ editor: "missing-editor" as never, cwd: "/tmp/workspace" })
      .pipe(Effect.flip);
    assert.instanceOf(error, ExternalLauncher.ExternalLauncherUnknownEditorError);
    assert.equal(error.editor, "missing-editor");
    assert.equal(error.message, "Unknown editor: missing-editor");
  }).pipe(Effect.provide(testLayer({ platform: "linux", env: { PATH: "" } }))),
);

// Avi Code addition: the target used to reach the file manager verbatim, and
// every one of these shapes made explorer.exe open the user's Documents folder
// instead of saying anything. These are pure so they can assert each platform
// without depending on the host the suite happens to run on.
describe("splitLaunchTarget", () => {
  it("splits a line and column off a Windows path", () => {
    assert.deepEqual(ExternalLauncher.splitLaunchTarget("C:\\repo\\src\\index.ts:12:4", "win32"), {
      path: "C:\\repo\\src\\index.ts",
      position: ":12:4",
    });
  });

  it("splits a bare line number", () => {
    assert.deepEqual(ExternalLauncher.splitLaunchTarget("/repo/src/index.ts:12", "linux"), {
      path: "/repo/src/index.ts",
      position: ":12",
    });
  });

  it("puts a git-reported forward-slashed Windows path into native form", () => {
    assert.deepEqual(
      ExternalLauncher.splitLaunchTarget("C:/Users/avi/repo/apps/web/x.ts", "win32"),
      { path: "C:\\Users\\avi\\repo\\apps\\web\\x.ts", position: "" },
    );
  });

  it("leaves a drive path with no position alone", () => {
    assert.deepEqual(ExternalLauncher.splitLaunchTarget("C:\\repo\\src", "win32"), {
      path: "C:\\repo\\src",
      position: "",
    });
  });
});

describe("isAbsolutePathForPlatform", () => {
  it("accepts absolute paths per platform", () => {
    assert.equal(isAbsolutePathForPlatform("C:\\repo\\x.ts", "win32"), true);
    assert.equal(isAbsolutePathForPlatform("/repo/x.ts", "linux"), true);
  });

  it("rejects the repo-relative path the diff panel can send", () => {
    assert.equal(isAbsolutePathForPlatform("apps\\web\\src\\x.ts", "win32"), false);
    assert.equal(isAbsolutePathForPlatform("apps/web/src/x.ts", "linux"), false);
  });
});

describe("fileManagerLaunchArgs", () => {
  it("reveals a file inside its folder on Windows", () => {
    assert.deepEqual(
      ExternalLauncher.fileManagerLaunchArgs({
        platform: "win32",
        path: "C:\\repo\\src\\index.ts",
        isDirectory: false,
      }),
      ["/select,C:\\repo\\src\\index.ts"],
    );
  });

  it("reveals a file inside its folder on macOS", () => {
    assert.deepEqual(
      ExternalLauncher.fileManagerLaunchArgs({
        platform: "darwin",
        path: "/repo/src/index.ts",
        isDirectory: false,
      }),
      ["-R", "/repo/src/index.ts"],
    );
  });

  it("opens the parent folder on Linux, which has no portable reveal", () => {
    assert.deepEqual(
      ExternalLauncher.fileManagerLaunchArgs({
        platform: "linux",
        path: "/repo/src/index.ts",
        isDirectory: false,
      }),
      ["/repo/src"],
    );
  });

  it("opens a directory target directly rather than revealing it", () => {
    assert.deepEqual(
      ExternalLauncher.fileManagerLaunchArgs({
        platform: "win32",
        path: "C:\\repo",
        isDirectory: true,
      }),
      ["C:\\repo"],
    );
  });
});

it.effect("refuses a relative target instead of letting the file manager guess", () =>
  Effect.gen(function* () {
    const launcher = yield* ExternalLauncher.ExternalLauncher;
    const error = yield* launcher
      .launchEditor({ editor: "file-manager", cwd: "apps/web/src/components/DiffPanel.tsx" })
      .pipe(Effect.flip);
    assert.instanceOf(error, ExternalLauncher.ExternalLauncherRelativeTargetError);
    assert.equal(error.target, "apps/web/src/components/DiffPanel.tsx");
  }).pipe(Effect.provide(testLayer({ platform: "linux", env: { PATH: "" } }))),
);

it.effect("reports a target that no longer exists, which explorer cannot", () =>
  Effect.gen(function* () {
    const launcher = yield* ExternalLauncher.ExternalLauncher;
    const error = yield* launcher
      .launchEditor({ editor: "file-manager", cwd: "/t3-code-missing-target-xyz/file.md" })
      .pipe(Effect.flip);
    assert.instanceOf(error, ExternalLauncher.ExternalLauncherTargetNotFoundError);
  }).pipe(Effect.provide(testLayer({ platform: "win32", env: { PATH: "" } }))),
);

it.effect("strips a line number before handing a real path to the file manager", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-reveal-" });
    const filePath = path.join(dir, "notes.md");
    yield* fileSystem.writeFileString(filePath, "# notes\n");
    // Follow the host so the temp path is absolute under the simulated platform.
    const hostPlatform = path.sep === "\\" ? ("win32" as const) : ("linux" as const);

    yield* Effect.gen(function* () {
      const launcher = yield* ExternalLauncher.ExternalLauncher;
      // A `:3` from a markdown link used to reach the file manager intact, and
      // the resulting path does not exist. Reaching the command-not-found stage
      // proves the position was dropped and the stat found the real file.
      const error = yield* launcher
        .launchEditor({ editor: "file-manager", cwd: `${filePath}:3` })
        .pipe(Effect.flip);
      assert.instanceOf(error, ExternalLauncher.ExternalLauncherCommandNotFoundError);
    }).pipe(Effect.provide(testLayer({ platform: hostPlatform, env: { PATH: "" } })));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
