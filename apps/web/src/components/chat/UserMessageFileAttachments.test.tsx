import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { UserMessageFileAttachments } from "./UserMessageFileAttachments";

const base = { type: "file" as const, mimeType: "application/zip", sizeBytes: 3 * 1024 * 1024 };

describe("UserMessageFileAttachments", () => {
  it("offers a download only for files the server has claimed", () => {
    const markup = renderToStaticMarkup(
      <UserMessageFileAttachments
        files={[
          { ...base, id: "a", name: "ready.zip", previewUrl: "http://env.test/api/assets/a" },
          { ...base, id: "b", name: "sending.zip", downloadable: false },
        ]}
        unknownAttachments={[
          {
            type: "somethingnew",
            id: "c",
            name: "scene.glb",
            mimeType: "model/gltf-binary",
            sizeBytes: 1,
          },
        ]}
      />,
    );

    expect(markup).toContain('aria-label="Download ready.zip"');
    expect(markup).not.toContain('aria-label="Download sending.zip"');
    expect(markup).toContain("sending.zip");
    expect(markup).toContain("3.0 MB");
    expect(markup).toContain("scene.glb");
  });

  it("renders nothing without files", () => {
    expect(
      renderToStaticMarkup(<UserMessageFileAttachments files={[]} unknownAttachments={[]} />),
    ).toBe("");
  });
});
