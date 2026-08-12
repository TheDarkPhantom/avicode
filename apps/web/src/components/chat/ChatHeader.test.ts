import { EnvironmentId } from "@t3tools/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ChatHeaderActions, shouldShowOpenInPicker } from "./ChatHeader";

describe("ChatHeaderActions", () => {
  it("keeps project actions before a grouped trailing layout-control slot", () => {
    const html = renderToStaticMarkup(
      createElement(
        ChatHeaderActions,
        {
          layoutControls: createElement(
            "div",
            null,
            createElement("button", null, "Terminal"),
            createElement("button", null, "Right panel"),
          ),
        },
        createElement("button", null, "Open"),
        createElement("button", null, "Auto merge"),
      ),
    );

    expect(html.indexOf("Open")).toBeLessThan(html.indexOf("Auto merge"));
    expect(html.indexOf("Auto merge")).toBeLessThan(html.indexOf("Terminal"));
    expect(html).toContain("data-chat-header-layout-controls");
    expect(html).not.toContain("pr-16");
  });

  it("does not render an empty layout-control slot", () => {
    const html = renderToStaticMarkup(
      createElement(ChatHeaderActions, null, createElement("button", null, "Open")),
    );

    expect(html).not.toContain("data-chat-header-layout-controls");
  });
});

describe("shouldShowOpenInPicker", () => {
  const primaryEnvironmentId = EnvironmentId.make("environment-primary");

  it("shows the picker for projects in the primary environment", () => {
    expect(
      shouldShowOpenInPicker({
        activeProjectName: "codething-mvp",
        activeThreadEnvironmentId: primaryEnvironmentId,
        primaryEnvironmentId,
      }),
    ).toBe(true);
  });

  it("hides the picker when hosted static mode has no primary environment", () => {
    expect(
      shouldShowOpenInPicker({
        activeProjectName: "codething-mvp",
        activeThreadEnvironmentId: EnvironmentId.make("environment-remote"),
        primaryEnvironmentId: null,
      }),
    ).toBe(false);
  });

  it("hides the picker for remote environments", () => {
    expect(
      shouldShowOpenInPicker({
        activeProjectName: "codething-mvp",
        activeThreadEnvironmentId: EnvironmentId.make("environment-remote"),
        primaryEnvironmentId,
      }),
    ).toBe(false);
  });

  it("hides the picker when there is no active project", () => {
    expect(
      shouldShowOpenInPicker({
        activeProjectName: undefined,
        activeThreadEnvironmentId: primaryEnvironmentId,
        primaryEnvironmentId,
      }),
    ).toBe(false);
  });
});
