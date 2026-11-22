// @effect-diagnostics nodeBuiltinImport:off
// node:child_process directly: the Claude Agent SDK takes a synchronous spawn
// callback, and this one must behave exactly like the SDK's own default.
/**
 * Avi Code addition: a Claude CLI spawn that reports the CLI's pid.
 *
 * The SDK spawns the CLI itself and never exposes the child, so port discovery
 * could not tell which listeners an agent's jobs opened. This spawns the CLI the
 * way the SDK's `spawnLocalProcess` does (piped stdin and stdout, stderr ignored,
 * hidden window, the SDK's own abort signal) and counts the child as the thread's
 * agent until it exits.
 *
 * @module provider/Layers/claudeTrackedSpawn
 */
import * as NodeChildProcess from "node:child_process";

import type { SpawnedProcess, SpawnOptions } from "@anthropic-ai/claude-agent-sdk";

export function makeTrackedClaudeSpawn(
  track: (pid: number) => () => void,
): (options: SpawnOptions) => SpawnedProcess {
  return (options) => {
    const child = NodeChildProcess.spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      signal: options.signal,
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"],
    });
    // A spawn that fails has no pid and emits only "error".
    if (child.pid !== undefined) {
      const release = track(child.pid);
      child.once("exit", release);
      child.once("error", release);
    }
    return child;
  };
}
