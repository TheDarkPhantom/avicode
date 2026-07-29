import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { AviCodeSettings, legacyT3ImportStatusDescription } from "./AviCodeSettings";

describe("AviCodeSettings", () => {
  it("describes a repeat import without exposing conversation contents", () => {
    expect(
      legacyT3ImportStatusDescription({
        available: true,
        sourcePath: "C:\\Users\\Avi\\.t3\\userdata",
        lastImportedAt: null,
      }),
    ).toContain("Ready to import");

    const markup = renderToStaticMarkup(<AviCodeSettings />);
    expect(markup).toContain("Remember provider credentials per project");
    expect(markup).toContain("Off by default");
    expect(markup).toContain("Import from T3 Code");
    expect(markup).toContain("Avi Code data is backed up first");
    expect(markup).toContain("Import latest");
    expect(markup).toContain("Available in the Avi Code desktop app.");
  });
});
