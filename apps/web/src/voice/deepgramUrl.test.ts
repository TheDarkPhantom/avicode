import { describe, expect, it } from "vite-plus/test";
import { buildDeepgramSocketUrl } from "./deepgramUrl";

const paramsOf = (url: string) => new URL(url).searchParams;

describe("buildDeepgramSocketUrl", () => {
  it("carries the token in the query string, not a subprotocol", () => {
    // Deepgram's temp tokens are JWTs and overflow the Sec-WebSocket-Protocol
    // header, so they must ride in the URL. See discussions#1470.
    const url = buildDeepgramSocketUrl({ accessToken: "jwt-value" });
    expect(paramsOf(url).get("access_token")).toBe("jwt-value");
  });

  it("percent-encodes the token", () => {
    const url = buildDeepgramSocketUrl({ accessToken: "a b+c/d=" });
    expect(url).not.toContain("a b+c/d=");
    expect(paramsOf(url).get("access_token")).toBe("a b+c/d=");
  });

  it("maps 'auto' to multilingual, since streaming has no language detection", () => {
    expect(paramsOf(buildDeepgramSocketUrl({ accessToken: "t" })).get("language")).toBe("multi");
    expect(
      paramsOf(buildDeepgramSocketUrl({ accessToken: "t", language: "auto" })).get("language"),
    ).toBe("multi");
  });

  it("passes an explicit language through", () => {
    expect(
      paramsOf(buildDeepgramSocketUrl({ accessToken: "t", language: "en" })).get("language"),
    ).toBe("en");
  });

  it("omits punctuate when smart format is on, because it is implied", () => {
    const params = paramsOf(buildDeepgramSocketUrl({ accessToken: "t", smartFormat: true }));
    expect(params.get("smart_format")).toBe("true");
    expect(params.has("punctuate")).toBe(false);
  });

  it("sends punctuate only when smart format is off", () => {
    const params = paramsOf(
      buildDeepgramSocketUrl({ accessToken: "t", smartFormat: false, punctuate: true }),
    );
    expect(params.get("smart_format")).toBe("false");
    expect(params.get("punctuate")).toBe("true");
  });

  it("always requests interim results so text can stream into the composer", () => {
    expect(paramsOf(buildDeepgramSocketUrl({ accessToken: "t" })).get("interim_results")).toBe(
      "true",
    );
  });

  it("defaults filler words off and honours the override", () => {
    expect(paramsOf(buildDeepgramSocketUrl({ accessToken: "t" })).get("filler_words")).toBe(
      "false",
    );
    expect(
      paramsOf(buildDeepgramSocketUrl({ accessToken: "t", fillerWords: true })).get("filler_words"),
    ).toBe("true");
  });

  it("targets the streaming listen endpoint over wss", () => {
    expect(buildDeepgramSocketUrl({ accessToken: "t" })).toMatch(
      /^wss:\/\/api\.deepgram\.com\/v1\/listen\?/,
    );
  });
});
