import { describe, expect, it } from "vite-plus/test";

import {
  isClosedCodeFence,
  isShellFenceLanguage,
  resolveRunnableShellCommand,
} from "./runnableCodeBlock";

describe("isShellFenceLanguage", () => {
  it("accepts shell fence languages only", () => {
    for (const language of ["sh", "bash", "zsh", "fish", "shell", "powershell", "pwsh"]) {
      expect(isShellFenceLanguage(language)).toBe(true);
    }
    for (const language of ["text", "typescript", "console", "bashrc", "cmd", "Bash", ""]) {
      expect(isShellFenceLanguage(language)).toBe(false);
    }
  });
});

describe("resolveRunnableShellCommand", () => {
  it("returns the trimmed command for a finished one-line shell block", () => {
    expect(resolveRunnableShellCommand("echo hello\n", "bash")).toBe("echo hello");
    expect(resolveRunnableShellCommand("  Get-ChildItem  \n", "pwsh")).toBe("Get-ChildItem");
  });

  it("offers nothing for blocks that could send something other than what is shown", () => {
    expect(resolveRunnableShellCommand("echo hello\n", "typescript")).toBeNull();
    expect(resolveRunnableShellCommand("echo one\necho two\n", "bash")).toBeNull();
    expect(resolveRunnableShellCommand("echo hello\n\n", "bash")).toBeNull();
    expect(resolveRunnableShellCommand("\n", "bash")).toBeNull();
    expect(resolveRunnableShellCommand("echo hello\\\n", "bash")).toBeNull();
    expect(resolveRunnableShellCommand("echo safe ‮#\n", "bash")).toBeNull();
    expect(resolveRunnableShellCommand("echo zero​width\n", "bash")).toBeNull();
    expect(resolveRunnableShellCommand("echo\ttab\n", "bash")).toBeNull();
    // No trailing newline means the block did not come from a fence.
    expect(resolveRunnableShellCommand("echo hello", "bash")).toBeNull();
  });
});

describe("isClosedCodeFence", () => {
  const closed = (source: string) => isClosedCodeFence(source, 0, source.length);

  it("accepts closed backtick, tilde, longer, and blockquoted fences", () => {
    expect(closed("```bash\necho hello\n```")).toBe(true);
    expect(closed("~~~bash\necho tilde\n~~~")).toBe(true);
    expect(closed("````bash\necho four\n````")).toBe(true);
    expect(closed("```bash\n> echo quote\n> ```")).toBe(true);
  });

  it("rejects unclosed, mismatched, and non-fence sources", () => {
    expect(closed("```bash\necho incomplete")).toBe(false);
    expect(closed("~~~bash\necho incomplete")).toBe(false);
    expect(closed("````bash\necho incomplete\n```")).toBe(false);
    expect(closed("```bash\necho mixed\n~~~")).toBe(false);
    expect(closed('<pre><code class="language-bash">echo html</code></pre>')).toBe(false);
    expect(isClosedCodeFence("```bash\necho hello\n```", undefined, 10)).toBe(false);
  });

  it("slices the block out of a longer message", () => {
    const text = "Run this:\n\n```sh\nls\n```\n\nThen continue.";
    const start = text.indexOf("```");
    const end = text.lastIndexOf("```") + 3;
    expect(isClosedCodeFence(text, start, end)).toBe(true);
  });
});
