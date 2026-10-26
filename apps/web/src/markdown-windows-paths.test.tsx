import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vite-plus/test";

import { remarkKeepWindowsPaths } from "./markdown-windows-paths";

/** Rendered `href`/`src` values, unescaped and URI-decoded (hast encodes `\` as `%5C`). */
function renderDestinations(markdown: string): string[] {
  const html = renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkKeepWindowsPaths]} urlTransform={(url) => url}>
      {markdown}
    </ReactMarkdown>,
  );
  return [...html.matchAll(/<(?:a|img) [^>]*?(?:href|src)="([^"]*)"/g)].map((match) =>
    decodeURIComponent(match[1]!.replaceAll("&amp;", "&")),
  );
}

describe("remarkKeepWindowsPaths", () => {
  it("keeps Windows path backslashes that CommonMark would read as escapes", () => {
    const destinations = renderDestinations(
      [
        String.raw`![inline](C:\Users\shawn\.t3\_build\workspace-image.svg)`,
        "![reference][shot]",
        String.raw`[shot]: C:\Users\shawn\.t3\workspace-image.svg`,
        String.raw`[settings](C:\Users\shawn\.claude\settings.json)`,
        String.raw`![unc](\\wsl.localhost\Ubuntu\.t3\workspace-image.svg)`,
      ].join("\n\n"),
    );

    expect(destinations).toEqual([
      String.raw`C:\Users\shawn\.t3\_build\workspace-image.svg`,
      String.raw`C:\Users\shawn\.t3\workspace-image.svg`,
      String.raw`C:\Users\shawn\.claude\settings.json`,
      String.raw`\\wsl.localhost\Ubuntu\.t3\workspace-image.svg`,
    ]);
  });

  it("still decodes character references in Windows paths", () => {
    expect(renderDestinations("![amp](C:/Users/shawn/a&amp;b.svg)")).toEqual([
      "C:/Users/shawn/a&b.svg",
    ]);
  });

  it("leaves escapes in non-Windows destinations alone", () => {
    expect(renderDestinations(String.raw`[docs](https://example.com/a\_b)`)).toEqual([
      "https://example.com/a_b",
    ]);
  });
});

/** Rendered prose with `<code>` kept and every other tag dropped. */
function renderProse(markdown: string): string {
  const html = renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkKeepWindowsPaths]}>{markdown}</ReactMarkdown>,
  );
  return html.replace(/<(?!\/?code>)[^>]+>/g, "");
}

describe("remarkKeepWindowsPaths in prose", () => {
  it("keeps backslashes that CommonMark would read as escapes in prose Windows paths", () => {
    expect(
      renderProse(
        String.raw`Saved to C:\Users\me\.t3\_build and (C:\.scratch) and C:/work\.config.`,
      ),
    ).toBe(String.raw`Saved to C:\Users\me\.t3\_build and (C:\.scratch) and C:/work\.config.`);
    // Paths render as written, so one an agent already escaped keeps its doubled backslashes.
    expect(renderProse(String.raw`Escaped C:\\Users\\me`)).toBe(String.raw`Escaped C:\\Users\\me`);
    expect(renderProse(String.raw`See C:\x and \*this\* and Note:\*that\*.`)).toBe(
      String.raw`See C:\x and *this* and Note:*that*.`,
    );
    expect(renderProse(String.raw`${"`"}C:\me\.t3${"`"} and C:\me\.t3`)).toBe(
      String.raw`<code>C:\me\.t3</code> and C:\me\.t3`,
    );
  });
});
