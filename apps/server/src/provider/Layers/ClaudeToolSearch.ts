/**
 * Avi Code addition (ported from upstream #24654): pins Claude Code's tool
 * search on when a user's settings or environment choose `auto`.
 *
 * Claude Code's auto tool search sends every MCP schema in full while they fit
 * under a share of the context window, which the injected MCP tools do on 1M
 * models, and that costs a cache write per turn. `resolveClaudeToolSearchOverride`
 * reads the same settings Claude Code reads and returns `"true"` when the
 * effective value is an `auto` mode. The adapter passes it as flag settings
 * (`settings.env.ENABLE_TOOL_SEARCH`), because a settings.json env beats the
 * process env in Claude Code.
 *
 * @module provider/Layers/ClaudeToolSearch
 */
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

// auto:0 already means on and auto:100 off.
export function claudeToolSearchOverride(value: string | undefined): "true" | undefined {
  if (value === undefined) return undefined;
  if (value === "auto") return "true";
  if (!value.startsWith("auto:")) return undefined;
  const percent = parseClaudeInteger(value.slice("auto:".length));
  // Claude Code treats an unparsable auto:N as auto, and clamps N to 0..100.
  if (Number.isNaN(percent)) return "true";
  const clamped = Math.min(100, Math.max(0, percent));
  return clamped > 0 && clamped < 100 ? "true" : undefined;
}

// Claude Code 2.1.310's integer parsing for auto:N. Scientific notation counts only when it is an
// integer, grouped digits (1_000, 1,000, or 1 000) are joined, and anything else uses parseInt.
const CLAUDE_SCIENTIFIC_INTEGER = /^[+-]?(\d+(\.\d*)?|\.\d+)[eE][+-]?\d+$/;
const CLAUDE_GROUPED_INTEGER = /^[+-]?\d{1,3}([_,   ])\d{3}(?:\1\d{3})*$/;
function parseClaudeInteger(text: string): number {
  const value = text.trim();
  if (value.length <= 32 && CLAUDE_SCIENTIFIC_INTEGER.test(value)) {
    const number = Number(value);
    return Number.isInteger(number) ? number : Number.NaN;
  }
  if (value.length <= 32 && CLAUDE_GROUPED_INTEGER.test(value)) {
    return Number.parseInt(value.replace(/[_,   ]/g, ""), 10);
  }
  return Number.parseInt(value, 10);
}

const ClaudeEnvSettings = Schema.StructWithRest(
  Schema.Struct({ env: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)) }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);
const decodeClaudeEnvSettings = Schema.decodeUnknownEffect(
  Schema.fromJsonString(ClaudeEnvSettings),
);

const readToolSearchSetting = (fileSystem: FileSystem.FileSystem, filePath: string) =>
  fileSystem.readFileString(filePath).pipe(
    Effect.flatMap(decodeClaudeEnvSettings),
    Effect.map((settings) => {
      const value = settings.env?.ENABLE_TOOL_SEARCH;
      return typeof value === "string" ? value : undefined;
    }),
    Effect.orElseSucceed(() => undefined),
  );

/**
 * Resolves the flag-settings override for one Claude query. Settings env beats
 * the process env, local over project over user, and a local file an older
 * Claude Code left in cwd applies under the root one.
 */
export const resolveClaudeToolSearchOverride = Effect.fn("resolveClaudeToolSearchOverride")(
  function* (input: {
    readonly cwd: string | undefined;
    readonly userSettingsPath: string;
    readonly homeDirectory: string;
    readonly environment: NodeJS.ProcessEnv;
  }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const platform = yield* HostProcessPlatform;

    // A worktree's .git file points at <main>/.git/worktrees/<name>, whose commondir leads back to
    // <main>/.git. A bare repository has no main checkout, so its worktree keeps its own file.
    const mainCheckoutRoot = (checkout: string) =>
      fileSystem.readFileString(path.join(checkout, ".git")).pipe(
        Effect.flatMap((pointer) => {
          const gitDir = /^gitdir:\s*(.+)$/m.exec(pointer)?.[1]?.trim();
          if (gitDir === undefined) return Effect.succeed(checkout);
          const worktreeGitDir = path.resolve(checkout, gitDir);
          return fileSystem.readFileString(path.join(worktreeGitDir, "commondir")).pipe(
            Effect.map((commonDir) => {
              const common = path.resolve(worktreeGitDir, commonDir.trim());
              return path.basename(common) === ".git" ? path.dirname(common) : checkout;
            }),
          );
        }),
        Effect.orElseSucceed(() => checkout),
      );

    // Claude Code keeps .claude/settings.local.json at the repository root, or in cwd outside a
    // repository, on Windows, or when the root is home. Its owner check is skipped: missing it
    // only leaves tool search on, Claude Code's default.
    const localSettingsDirectory = Effect.fn("resolveClaudeToolSearchOverride.localDirectory")(
      function* (cwd: string) {
        if (platform === "win32") return cwd;
        for (let directory = cwd; ; directory = path.dirname(directory)) {
          const isCheckout = yield* fileSystem
            .exists(path.join(directory, ".git"))
            .pipe(Effect.orElseSucceed(() => false));
          if (isCheckout) {
            const root = yield* mainCheckoutRoot(directory);
            return root === input.homeDirectory ? cwd : root;
          }
          if (path.dirname(directory) === directory) return cwd;
        }
      },
    );

    const cwd = input.cwd;
    const localDirectory = cwd === undefined ? undefined : yield* localSettingsDirectory(cwd);
    const settingsFiles = [
      ...(cwd === undefined || localDirectory === undefined
        ? []
        : [
            path.join(localDirectory, ".claude", "settings.local.json"),
            ...(localDirectory === cwd ? [] : [path.join(cwd, ".claude", "settings.local.json")]),
            path.join(cwd, ".claude", "settings.json"),
          ]),
      input.userSettingsPath,
    ];
    for (const settingsFile of settingsFiles) {
      const value = yield* readToolSearchSetting(fileSystem, settingsFile);
      if (value !== undefined) return claudeToolSearchOverride(value);
    }
    return claudeToolSearchOverride(input.environment.ENABLE_TOOL_SEARCH);
  },
);
