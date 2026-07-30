import { describe, expect, it } from "vite-plus/test";
import { TIMELINE_CONTENT_MAX_WIDTH } from "../components/chat/MessagesTimeline.logic";
import {
  CHAT_CONTENT_WIDTHS,
  chatContentMaxWidthCss,
  chatContentMaxWidthPx,
} from "./chatContentWidth";

const ROOT_FONT_SIZE_PX = 16;

describe("chat content width", () => {
  // The whole point of this module: the CSS custom property and the minimap's
  // pixel maths used to be two independent copies of 768. If they drift, the
  // minimap rail floats off the column edge and nothing else catches it.
  it("keeps the rem value and the pixel value in agreement", () => {
    for (const [name, { css, px }] of Object.entries(CHAT_CONTENT_WIDTHS)) {
      if (!css.endsWith("rem")) continue;
      expect(Number.parseFloat(css) * ROOT_FONT_SIZE_PX, `${name} css/px mismatch`).toBe(px);
    }
  });

  it("leaves the default width on the upstream measure", () => {
    expect(chatContentMaxWidthPx("comfortable")).toBe(TIMELINE_CONTENT_MAX_WIDTH);
    expect(chatContentMaxWidthCss("comfortable")).toBe("48rem");
  });

  // Infinity rather than a big number, so the minimap's gutter maths collapses
  // to exactly zero instead of at some arbitrary viewport size.
  it("treats full width as uncapped", () => {
    expect(chatContentMaxWidthPx("full")).toBe(Number.POSITIVE_INFINITY);
    expect(chatContentMaxWidthCss("full")).toBe("100%");
  });

  it("orders the widths so wide sits between comfortable and full", () => {
    expect(chatContentMaxWidthPx("comfortable")).toBeLessThan(chatContentMaxWidthPx("wide"));
    expect(chatContentMaxWidthPx("wide")).toBeLessThan(chatContentMaxWidthPx("full"));
  });
});
