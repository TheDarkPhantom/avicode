import { describe, expect, it } from "vite-plus/test";

import { githubHeadingSlug, rehypeHeadingIds } from "./markdown-heading-ids";

type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

const heading = (tagName: string, text: string, id?: string): Node => ({
  type: "element",
  tagName,
  properties: id === undefined ? {} : { id },
  children: [{ type: "text", value: text }],
});

function idsOf(children: Node[]): unknown[] {
  const tree: Node = { type: "root", children };
  rehypeHeadingIds()(tree);
  return children.map((child) => child.properties?.id);
}

describe("githubHeadingSlug", () => {
  it("matches GitHub's anchors for table-of-contents links", () => {
    expect(githubHeadingSlug("1. Operating model")).toBe("1-operating-model");
    expect(githubHeadingSlug("  What's new?  ")).toBe("whats-new");
    expect(githubHeadingSlug("snake_case & Ünïcode")).toBe("snake_case--ünïcode");
  });
});

describe("rehypeHeadingIds", () => {
  it("never gives two headings the same id, even when a suffix matches another heading", () => {
    expect(
      idsOf([
        heading("h2", "Setup"),
        heading("h2", "Setup"),
        heading("h2", "Setup-1"),
        heading("h2", "Pinned", "user-content-install-1"),
        heading("h2", "Install"),
        heading("h2", "Install"),
      ]),
    ).toEqual([
      "user-content-setup",
      "user-content-setup-1",
      "user-content-setup-1-1",
      "user-content-install-1",
      "user-content-install",
      "user-content-install-2",
    ]);
  });

  it("reads nested heading text and leaves other elements alone", () => {
    const nested: Node = {
      type: "element",
      tagName: "h3",
      properties: {},
      children: [
        { type: "text", value: "Use " },
        { type: "element", tagName: "code", children: [{ type: "text", value: "vp" }] },
      ],
    };
    const paragraph: Node = { type: "element", tagName: "p", properties: {}, children: [] };
    expect(idsOf([nested, paragraph])).toEqual(["user-content-use-vp", undefined]);
  });
});
