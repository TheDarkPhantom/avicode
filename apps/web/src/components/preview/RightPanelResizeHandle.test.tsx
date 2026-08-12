import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { RightPanelResizeHandle } from "./RightPanelResizeHandle";

describe("RightPanelResizeHandle", () => {
  it("exposes the divider value and keyboard focus semantics", () => {
    const noop = vi.fn();
    const markup = renderToStaticMarkup(
      <RightPanelResizeHandle
        handlers={{
          onPointerDown: noop,
          onPointerMove: noop,
          onPointerUp: noop,
          onPointerCancel: noop,
          onKeyDown: noop,
          onKeyUp: noop,
          onBlur: noop,
        }}
        value={720}
        minimum={360}
        maximum={1_040}
        active
      />,
    );

    expect(markup).toContain('role="separator"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('aria-valuemin="360"');
    expect(markup).toContain('aria-valuemax="1040"');
    expect(markup).toContain('aria-valuenow="720"');
    expect(markup).toContain('data-active="true"');
  });
});
