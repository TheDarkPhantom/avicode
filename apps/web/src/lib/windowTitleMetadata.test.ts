import { describe, expect, it } from "vite-plus/test";
import { formatThreadWindowTitle } from "./windowTitleMetadata";

describe("windowTitleMetadata", () => {
  it("exposes repository and thread for ALFRED attribution", () => {
    expect(
      formatThreadWindowTitle({
        repository: "advisor-os",
        threadTitle: "Integrate Tasks with Omnidash Kanban Board",
        private: false,
      }),
    ).toBe("advisor-os — Integrate Tasks with Omnidash Kanban Board — AviCode");
  });

  it("hides metadata in privacy mode", () => {
    expect(
      formatThreadWindowTitle({ repository: "private-repo", threadTitle: "Secret", private: true }),
    ).toBe("AviCode");
  });
});
