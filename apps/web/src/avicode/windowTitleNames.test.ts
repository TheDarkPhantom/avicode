import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { describe, expect, it } from "vite-plus/test";

import { resolveWindowTitle } from "../branding.logic";
import { avicodeWindowTitleNames } from "./windowTitleNames";

const NAMES = { projectTitle: "avicode", threadTitle: "Port the settings page" };

function title(showNames: boolean, options: { desktop: boolean; screenReader?: boolean }) {
  return resolveWindowTitle({
    appDisplayName: "Avi Code 2",
    ...avicodeWindowTitleNames(NAMES, { aviCodeWindowTitleShowNames: showNames }),
    ...(options.screenReader && { screenReader: { threadStatus: "Working" } }),
    desktop: options.desktop,
  });
}

describe("avicodeWindowTitleNames", () => {
  it("shows the project and thread by default, which time trackers match on", () => {
    expect(DEFAULT_CLIENT_SETTINGS.aviCodeWindowTitleShowNames).toBe(true);
    const desktopTitle = title(true, { desktop: true });
    expect(desktopTitle).toContain(NAMES.projectTitle);
    expect(desktopTitle).toContain(NAMES.threadTitle);
    expect(title(true, { desktop: false })).toBe("avicode / Port the settings page - Avi Code 2");
  });

  it("titles the window with only the app name when names are hidden", () => {
    expect(title(false, { desktop: true })).toBe("Avi Code 2");
    expect(title(false, { desktop: false })).toBe("Avi Code 2");
  });

  it("keeps the screen reader status but no names when names are hidden", () => {
    expect(title(false, { desktop: true, screenReader: true })).toBe("Working: Avi Code 2");
  });
});
