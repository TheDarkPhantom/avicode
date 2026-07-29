import { describe, expect, it } from "vite-plus/test";
import { buildDeepgramSocketProtocols, buildDeepgramSocketUrl } from "./deepgramUrl";

const paramsOf = (url: string) => new URL(url).searchParams;

describe("buildDeepgramSocketUrl", () => {
  it("authenticates temporary JWTs with Deepgram's Bearer websocket subprotocol", () => {
    expect(buildDeepgramSocketProtocols("jwt-value")).toEqual(["bearer", "jwt-value"]);
  });

  it("does not expose authentication credentials in the URL", () => {
    expect(paramsOf(buildDeepgramSocketUrl({})).has("access_token")).toBe(false);
  });

  it("maps 'auto' to multilingual, since streaming has no language detection", () => {
    expect(paramsOf(buildDeepgramSocketUrl({})).get("language")).toBe("multi");
    expect(paramsOf(buildDeepgramSocketUrl({ language: "auto" })).get("language")).toBe("multi");
  });

  it("passes an explicit language through", () => {
    expect(paramsOf(buildDeepgramSocketUrl({ language: "en" })).get("language")).toBe("en");
  });

  it("omits punctuate when smart format is on, because it is implied", () => {
    const params = paramsOf(buildDeepgramSocketUrl({ smartFormat: true }));
    expect(params.get("smart_format")).toBe("true");
    expect(params.has("punctuate")).toBe(false);
  });

  it("sends punctuate only when smart format is off", () => {
    const params = paramsOf(buildDeepgramSocketUrl({ smartFormat: false, punctuate: true }));
    expect(params.get("smart_format")).toBe("false");
    expect(params.get("punctuate")).toBe("true");
  });

  it("always requests interim results so text can stream into the composer", () => {
    expect(paramsOf(buildDeepgramSocketUrl({})).get("interim_results")).toBe("true");
  });

  it("defaults filler words off and honours the override", () => {
    expect(paramsOf(buildDeepgramSocketUrl({})).get("filler_words")).toBe("false");
    expect(paramsOf(buildDeepgramSocketUrl({ fillerWords: true })).get("filler_words")).toBe(
      "true",
    );
  });

  it("targets the streaming listen endpoint over wss", () => {
    expect(buildDeepgramSocketUrl({})).toMatch(/^wss:\/\/api\.deepgram\.com\/v1\/listen\?/);
  });
});
