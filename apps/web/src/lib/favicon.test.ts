import { describe, expect, it } from "vite-plus/test";

import { faviconUrlForOrigin } from "./favicon";

describe("faviconUrlForOrigin", () => {
  it.each([
    "http://192.168.1.10:8080",
    "http://localhost:3000",
    "http://home.arpa",
    "https://printer.local.",
    "https://api.internal",
    "https://box.tailnet.ts.net",
    "http://127.1",
    "http://0x7f000001",
    "http://[::]",
    "http://[::1]",
    "http://[::ffff:192.168.1.10]",
    "http://[fd00::1]",
    "http://[fe80::1]",
    "http://100.64.0.1",
    "http://198.51.100.1",
    "http://[2001:db8::1]",
    "http://service.test",
    "http://private.onion",
    "http://127.1..",
    "https://grafana.corp",
    "https://build.lan",
    "https://wiki.intranet",
    "https://grafana.internal.acme-corp.com",
    "https://jira.corp.acme-corp.com:8443",
    "http://devbox",
  ])("does not disclose %s to the favicon provider", (origin) => {
    expect(faviconUrlForOrigin(origin)).toBeNull();
  });

  it("sends only the public hostname and requested size, never the port", () => {
    expect(faviconUrlForOrigin("https://github.com:8443/pingdotgg/t3code?private=query", 64)).toBe(
      "https://www.google.com/s2/favicons?domain=github.com&sz=64",
    );
  });

  it("keeps public IP addresses", () => {
    expect(faviconUrlForOrigin("http://8.8.8.8")).toBe(
      "https://www.google.com/s2/favicons?domain=8.8.8.8&sz=32",
    );
  });

  it.each([null, undefined, "", "invalid URL", "file:///tmp/private", "data:text/plain,private"])(
    "rejects an invalid or unsupported origin %s",
    (origin) => {
      expect(faviconUrlForOrigin(origin)).toBeNull();
    },
  );
});
