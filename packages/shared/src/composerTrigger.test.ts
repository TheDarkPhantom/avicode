import { describe, expect, it } from "vite-plus/test";

import {
  parseComposerSideQuestionCommand,
  parseStandaloneComposerSlashCommand,
  serializeComposerFileLink,
  serializeComposerMentionPath,
} from "./composerTrigger.ts";

describe("serializeComposerMentionPath", () => {
  it("keeps simple mention paths unquoted", () => {
    expect(serializeComposerMentionPath("src/index.ts")).toBe("src/index.ts");
  });

  it("quotes mention paths containing whitespace", () => {
    expect(serializeComposerMentionPath("docs/My File.md")).toBe('"docs/My File.md"');
  });

  it("escapes quoted mention path content", () => {
    expect(serializeComposerMentionPath('docs/My "File".md')).toBe('"docs/My \\"File\\".md"');
  });
});

describe("serializeComposerFileLink", () => {
  it("uses the basename as the markdown label", () => {
    expect(serializeComposerFileLink("path/to/package.json")).toBe(
      "[package.json](path/to/package.json)",
    );
  });

  it("encodes markdown-sensitive destination characters", () => {
    expect(serializeComposerFileLink("docs/My File (draft).md")).toBe(
      "[My File (draft).md](docs/My%20File%20%28draft%29.md)",
    );
  });

  it("supports windows paths", () => {
    expect(serializeComposerFileLink("C:\\repo\\src\\index.ts")).toBe(
      "[index.ts](C:%5Crepo%5Csrc%5Cindex.ts)",
    );
  });

  it("preserves paths that legitimately start with an at sign", () => {
    expect(serializeComposerFileLink("@scope/package.json")).toBe(
      "[package.json](@scope/package.json)",
    );
  });
});

// Avi Code addition: `/btw` is the only slash command that carries an argument,
// so it needs a parser the bare-command matcher cannot provide.
describe("parseComposerSideQuestionCommand", () => {
  it("captures the question after the command", () => {
    expect(parseComposerSideQuestionCommand("/btw what does that flag do?")).toEqual({
      question: "what does that flag do?",
    });
  });

  it("keeps newlines inside a multi-line question", () => {
    expect(parseComposerSideQuestionCommand("/btw first line\nsecond line")).toEqual({
      question: "first line\nsecond line",
    });
  });

  // A bare `/btw` opens the panel and lets the user type there, matching the
  // keyboard shortcut. It is not a parse failure.
  it("returns an empty question for a bare command", () => {
    expect(parseComposerSideQuestionCommand("/btw")).toEqual({ question: "" });
    expect(parseComposerSideQuestionCommand("  /btw   ")).toEqual({ question: "" });
  });

  it("ignores text that merely starts with the letters", () => {
    expect(parseComposerSideQuestionCommand("/btwice something")).toBeNull();
    expect(parseComposerSideQuestionCommand("tell me btw")).toBeNull();
  });

  // The bare-command parser must not claim `/btw`, or the composer would treat
  // it as a mode switch and swallow the question.
  it("stays out of the bare slash-command parser", () => {
    expect(parseStandaloneComposerSlashCommand("/btw")).toBeNull();
    expect(parseStandaloneComposerSlashCommand("/plan")).toBe("plan");
  });
});
