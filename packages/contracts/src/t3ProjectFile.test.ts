import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { T3ProjectFile } from "./t3ProjectFile.ts";

const decode = Schema.decodeUnknownSync(T3ProjectFile);

describe("T3ProjectFile", () => {
  it("decodes a full project file", () => {
    const decoded = decode({
      $schema: "https://t3.codes/schema/t3.json",
      iconPath: "assets/logo.svg",
      scripts: [
        {
          name: "Dev",
          command: "pnpm dev",
          icon: "play",
          runOnWorktreeCreate: false,
          previewUrl: "http://localhost:3000",
          autoOpenPreview: true,
        },
        { name: "Test", command: "pnpm test" },
      ],
      autoMerge: {
        mode: "collaborative",
        promotionRefs: ["avi-dev", "staging", "main"],
        requireMainApproval: true,
      },
    });

    expect(decoded.iconPath).toBe("assets/logo.svg");
    expect(decoded.scripts).toHaveLength(2);
    expect(decoded.scripts?.[1]).toEqual({ name: "Test", command: "pnpm test" });
    expect(decoded.autoMerge?.promotionRefs).toEqual(["avi-dev", "staging", "main"]);
  });

  it("decodes an empty object and ignores unknown fields", () => {
    expect(decode({})).toEqual({});
    expect(decode({ futureField: true })).toEqual({});
  });

  it("trims icon paths and script fields", () => {
    const decoded = decode({
      iconPath: " assets/logo.svg ",
      scripts: [{ name: " Dev ", command: " pnpm dev " }],
    });

    expect(decoded.iconPath).toBe("assets/logo.svg");
    expect(decoded.scripts?.[0]).toEqual({ name: "Dev", command: "pnpm dev" });
  });

  it("rejects scripts without a command", () => {
    expect(() => decode({ scripts: [{ name: "Dev" }] })).toThrow();
  });

  it("rejects unknown script icons", () => {
    expect(() =>
      decode({ scripts: [{ name: "Dev", command: "pnpm dev", icon: "rocket" }] }),
    ).toThrow();
  });

  it("rejects empty or excessively long promotion chains", () => {
    expect(() => decode({ autoMerge: { mode: "solo", promotionRefs: [] } })).toThrow();
    expect(() =>
      decode({
        autoMerge: {
          mode: "collaborative",
          promotionRefs: ["avi-dev", "review", "staging", "main"],
        },
      }),
    ).toThrow();
  });

  it("allows a concise solo policy that defaults to main in the client", () => {
    expect(decode({ autoMerge: { mode: "solo" } }).autoMerge).toEqual({ mode: "solo" });
  });
});
