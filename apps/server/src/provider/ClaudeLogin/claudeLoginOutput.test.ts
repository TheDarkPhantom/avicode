import { describe, expect, it } from "vite-plus/test";

import { makeClaudeLoginOutputScanner } from "./claudeLoginOutput.ts";

/** The exact opening bytes `claude auth login --claudeai` writes to stdout. */
const AUTHORIZATION_URL =
  "https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&scope=user%3Aprofile+user%3Ainference&code_challenge=SJ8MdZ0c4kxeRl0s6GN&code_challenge_method=S256&state=7VwHkd";
const REAL_STDOUT = `Opening browser to sign in…\nIf the browser didn't open, visit: ${AUTHORIZATION_URL}\nPaste code here if prompted > `;
const REAL_REJECTION = "Invalid code. Please make sure the full code was copied.\n";

describe("makeClaudeLoginOutputScanner", () => {
  it("reads the URL and the prompt out of the CLI's real opening output", () => {
    const scanner = makeClaudeLoginOutputScanner();

    expect(scanner.push(REAL_STDOUT)).toEqual([
      { type: "authorizationUrl", url: AUTHORIZATION_URL },
      { type: "awaitingCode" },
    ]);
  });

  it("finds the prompt even though it never gets a trailing newline", () => {
    const scanner = makeClaudeLoginOutputScanner();

    const events = scanner.push("Paste code here if prompted > ");

    expect(events).toEqual([{ type: "awaitingCode" }]);
  });

  it("reassembles a URL split across chunk boundaries", () => {
    const scanner = makeClaudeLoginOutputScanner();
    const split = Math.floor(AUTHORIZATION_URL.length / 2);

    const first = scanner.push(
      `If the browser didn't open, visit: ${AUTHORIZATION_URL.slice(0, split)}`,
    );
    const second = scanner.push(`${AUTHORIZATION_URL.slice(split)}\n`);

    expect(first).toEqual([]);
    expect(second).toEqual([{ type: "authorizationUrl", url: AUTHORIZATION_URL }]);
  });

  it("reports the URL and the prompt once each, however many chunks follow", () => {
    const scanner = makeClaudeLoginOutputScanner();

    scanner.push(REAL_STDOUT);

    // The prompt sits in the unterminated tail forever, so every later chunk
    // re-scans it. Re-reporting would make the client re-open its input.
    expect(scanner.push("")).toEqual([]);
    expect(scanner.push("\n")).toEqual([]);
  });

  it("reports a rejected code without ending the session", () => {
    const scanner = makeClaudeLoginOutputScanner();
    scanner.push(REAL_STDOUT);

    expect(scanner.push(REAL_REJECTION)).toEqual([
      { type: "codeRejected", message: "Invalid code. Please make sure the full code was copied." },
    ]);
  });

  it("reports an identically worded rejection every time it recurs", () => {
    const scanner = makeClaudeLoginOutputScanner();
    scanner.push(REAL_STDOUT);

    const first = scanner.push(REAL_REJECTION);
    const second = scanner.push(REAL_REJECTION);

    // Two bad pastes in a row produce byte-identical output. Deduplicating on
    // message text would leave the dialog stuck after the second attempt.
    expect(second).toEqual(first);
    expect(second).toHaveLength(1);
  });

  it("does not report a rejection until its line is terminated", () => {
    const scanner = makeClaudeLoginOutputScanner();

    expect(scanner.push("Invalid code. Please make sure")).toEqual([]);
    expect(scanner.push(" the full code was copied.\n")).toEqual([
      { type: "codeRejected", message: "Invalid code. Please make sure the full code was copied." },
    ]);
  });

  it("sees through ANSI styling", () => {
    const scanner = makeClaudeLoginOutputScanner();

    const events = scanner.push(
      `[2mIf the browser didn't open, visit:[0m ${AUTHORIZATION_URL}\n`,
    );

    expect(events).toEqual([{ type: "authorizationUrl", url: AUTHORIZATION_URL }]);
  });

  it("leaves ordinary bracketed text alone", () => {
    const scanner = makeClaudeLoginOutputScanner();

    // A CSI pattern missing its escape prefix also matches `[d`, which would
    // corrupt this message into "Invalid code. See ocs] for help."
    expect(scanner.push("Invalid code. See [docs] for help.\n")).toEqual([
      { type: "codeRejected", message: "Invalid code. See [docs] for help." },
    ]);
  });

  it("strips punctuation that trails a scraped URL", () => {
    const scanner = makeClaudeLoginOutputScanner();

    const events = scanner.push(`Please visit: ${AUTHORIZATION_URL}.\n`);

    expect(events).toEqual([{ type: "authorizationUrl", url: AUTHORIZATION_URL }]);
  });

  it("falls back to a visit line when the URL is not an /oauth/authorize path", () => {
    const scanner = makeClaudeLoginOutputScanner();

    const events = scanner.push(
      "If the browser didn't open, visit: https://claude.com/cai/signin\n",
    );

    expect(events).toEqual([{ type: "authorizationUrl", url: "https://claude.com/cai/signin" }]);
  });

  it("ignores chatter it does not recognize", () => {
    const scanner = makeClaudeLoginOutputScanner();

    expect(scanner.push("Opening browser to sign in…\n")).toEqual([]);
    expect(scanner.push("Checking for updates\n")).toEqual([]);
  });

  it("keeps the tail bounded when the CLI never emits a newline", () => {
    const scanner = makeClaudeLoginOutputScanner();

    // 64 KiB of newline-free noise must not accumulate for the session.
    for (let index = 0; index < 64; index += 1) scanner.push("x".repeat(1_024));

    // The prompt still resolves once it arrives, proving the tail stayed usable.
    expect(scanner.push("Paste code here if prompted > ")).toEqual([{ type: "awaitingCode" }]);
  });
});
