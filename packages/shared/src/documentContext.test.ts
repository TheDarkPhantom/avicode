import { describe, expect, it } from "vite-plus/test";

import { PROVIDER_SEND_TURN_MAX_INPUT_CHARS } from "@t3tools/contracts";

import {
  appendDocumentContexts,
  extractTrailingDocumentContexts,
  formatDocumentContext,
  turnInputTooLargeReason,
} from "./documentContext.ts";

const block = (name: string, text: string) =>
  formatDocumentContext({ name, mimeType: "text/markdown", text });

describe("extractTrailingDocumentContexts", () => {
  it("leaves a prompt with no attachments untouched", () => {
    expect(extractTrailingDocumentContexts("review the standups")).toEqual({
      promptText: "review the standups",
      documentCount: 0,
    });
  });

  it("removes the appended document so only the typed prompt is shown", () => {
    const prompt = `review the standups\n\n${block("notes.md", "# Notes\nJul 29")}`;
    expect(extractTrailingDocumentContexts(prompt)).toEqual({
      promptText: "review the standups",
      documentCount: 1,
    });
  });

  it("removes every document when several are attached", () => {
    const prompt = [
      "compare these",
      block("mon.md", "monday"),
      block("tue.md", "tuesday"),
      block("wed.md", "wednesday"),
    ].join("\n\n");
    expect(extractTrailingDocumentContexts(prompt)).toEqual({
      promptText: "compare these",
      documentCount: 3,
    });
  });

  it("handles an attachment sent with no prompt text", () => {
    expect(extractTrailingDocumentContexts(block("notes.md", "body"))).toEqual({
      promptText: "",
      documentCount: 1,
    });
  });

  it("keeps document text that merely resembles the delimiter", () => {
    // The body carries the closing tag itself. Anchoring the pattern at the end
    // of the string is what stops the match from ending early and leaving the
    // remainder of the file on screen.
    const prompt = `look\n\n${block("meta.md", "explaining </avicode_document> inline\nand more")}`;
    expect(extractTrailingDocumentContexts(prompt)).toEqual({
      promptText: "look",
      documentCount: 1,
    });
  });

  it("does not strip a block the user typed mid-prompt", () => {
    // Only the trailing run is the server's doing; anything earlier is the
    // user's own text and must survive.
    const prompt = `${block("a.md", "one")}\n\nand then my actual question`;
    expect(extractTrailingDocumentContexts(prompt).documentCount).toBe(0);
    expect(extractTrailingDocumentContexts(prompt).promptText).toBe(prompt);
  });
});

describe("formatDocumentContext", () => {
  it("escapes the quote so a crafted filename cannot close the attribute", () => {
    const formatted = formatDocumentContext({
      name: '"><script>',
      mimeType: "text/markdown",
      text: "body",
    });
    expect(formatted).toContain('name="&quot;>&lt;script>"');
    // A bare `>` survives escaping, which is harmless inside a quoted attribute
    // but does mean the opening tag cannot be matched by "everything up to the
    // first >". The block still has to strip cleanly.
    expect(extractTrailingDocumentContexts(`look\n\n${formatted}`)).toEqual({
      promptText: "look",
      documentCount: 1,
    });
  });
});

describe("appendDocumentContexts", () => {
  it("leaves text alone when nothing is attached", () => {
    expect(appendDocumentContexts("hello", [])).toBe("hello");
  });

  it("appends each block, and round-trips through the renderer's strip", () => {
    const message = appendDocumentContexts("compare", [block("a.md", "one"), block("b.md", "two")]);
    expect(message).toBe(`compare

${block("a.md", "one")}

${block("b.md", "two")}`);
    expect(extractTrailingDocumentContexts(message)).toEqual({
      promptText: "compare",
      documentCount: 2,
    });
  });

  it("drops the empty prompt instead of leading with a blank line", () => {
    expect(appendDocumentContexts("", [block("a.md", "one")])).toBe(block("a.md", "one"));
  });
});

describe("turnInputTooLargeReason", () => {
  it("allows a message exactly at the limit", () => {
    expect(turnInputTooLargeReason(PROVIDER_SEND_TURN_MAX_INPUT_CHARS)).toBeNull();
  });

  it("explains a message over the limit in plain terms", () => {
    expect(turnInputTooLargeReason(712_000)).toBe(
      "This message and its attachments come to 712,000 characters; the limit is 600,000. Remove an attachment or shorten the message.",
    );
  });
});
