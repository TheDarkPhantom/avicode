import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { getLegendListScrollNode } from "./legendListScrollNode";

// The helper validates results with `instanceof HTMLElement`, but the web unit
// suite runs under the node environment where HTMLElement is undefined. Provide
// a minimal stand-in so the instanceof branch is exercised faithfully.
class FakeHtmlElement {
  readonly nodeType = 1;
}
const globalScope = globalThis as { HTMLElement?: unknown };
const originalHtmlElement = globalScope.HTMLElement;

beforeAll(() => {
  globalScope.HTMLElement = FakeHtmlElement;
});

afterAll(() => {
  globalScope.HTMLElement = originalHtmlElement;
});

type LegendListRefArg = Parameters<typeof getLegendListScrollNode>[0];

function refReturning(getScrollableNode: () => unknown): LegendListRefArg {
  return { getScrollableNode } as unknown as LegendListRefArg;
}

describe("getLegendListScrollNode", () => {
  it("returns null when the list ref is null", () => {
    expect(getLegendListScrollNode(null)).toBeNull();
    expect(getLegendListScrollNode(undefined)).toBeNull();
  });

  it("returns null when getScrollableNode is missing", () => {
    expect(getLegendListScrollNode({} as unknown as LegendListRefArg)).toBeNull();
  });

  it("returns null when getScrollableNode throws internally", () => {
    // This is the crash: legend-list 3.2.0 reads the inner scroll-view ref
    // without a null guard and throws while unmounting or re-virtualizing.
    expect(
      getLegendListScrollNode(
        refReturning(() => {
          throw new TypeError("Cannot read properties of null (reading 'getScrollableNode')");
        }),
      ),
    ).toBeNull();
  });

  it("returns null when getScrollableNode yields no element", () => {
    expect(getLegendListScrollNode(refReturning(() => null))).toBeNull();
    expect(getLegendListScrollNode(refReturning(() => undefined))).toBeNull();
    expect(getLegendListScrollNode(refReturning(() => ({})))).toBeNull();
  });

  it("returns the scroll node when it is an element", () => {
    const element = new FakeHtmlElement();
    expect(getLegendListScrollNode(refReturning(() => element))).toBe(element);
  });
});
