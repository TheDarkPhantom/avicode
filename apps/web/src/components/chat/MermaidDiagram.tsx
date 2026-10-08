import type DOMPurify from "dompurify";
import type { Mermaid } from "mermaid";
import { use, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "../ui/button";
import { ExpandedImageDialog } from "./ExpandedImageDialog";

type MermaidRenderResult =
  | { readonly status: "rendered"; readonly svg: string }
  | { readonly status: "error"; readonly message: string; readonly retryable: boolean };

interface MermaidRuntime {
  readonly mermaid: Mermaid;
  readonly sanitize: (svg: string) => string;
}

let runtimePromise: Promise<MermaidRuntime> | null = null;
let renderQueue: Promise<unknown> = Promise.resolve();
let nextDiagramId = 0;
const MAX_CACHED_RENDERS = 64;
// Keyed by theme plus full source so distinct diagrams never share an entry.
// Pending renders are never evicted, because use() must get the same promise
// on retry.
const renderCache = new Map<string, Promise<MermaidRenderResult>>();
const settledRenders = new WeakSet<Promise<MermaidRenderResult>>();

const REMOTE_CSS_URL = /url\(\s*(?!['"]?#)[^)]*\)/gi;

// Diagrams can come from untrusted content, so strip anything that can
// navigate, run script, or fetch remote content on top of Mermaid's own strict
// sanitization. CSS keeps only local url(#id) references; label text is untouched.
function createSvgSanitizer(factory: typeof DOMPurify): (svg: string) => string {
  const purifier = factory(window);
  purifier.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName === "style" && node.textContent) {
      node.textContent = node.textContent.replace(REMOTE_CSS_URL, "none");
    }
  });
  purifier.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName === "style") data.attrValue = data.attrValue.replace(REMOTE_CSS_URL, "none");
  });
  return (svg) =>
    purifier.sanitize(svg, {
      ADD_TAGS: ["foreignObject"],
      HTML_INTEGRATION_POINTS: { foreignobject: true },
      FORBID_ATTR: ["href", "xlink:href", "src", "srcset"],
      FORBID_TAGS: ["a", "img", "image", "script"],
      USE_PROFILES: { svg: true, svgFilters: true, html: true },
    });
}

// Mermaid and DOMPurify are ~1MB together, so they load only once a diagram
// is actually shown and never weigh on the main chat bundle.
function loadMermaidRuntime(): Promise<MermaidRuntime> {
  runtimePromise ??= Promise.all([import("mermaid"), import("dompurify")])
    .then(([mermaidModule, purifyModule]) => ({
      mermaid: mermaidModule.default,
      sanitize: createSvgSanitizer(purifyModule.default),
    }))
    .catch((error: unknown) => {
      runtimePromise = null;
      throw error;
    });
  return runtimePromise;
}

// Mermaid also lazy-loads diagram chunks inside render(); losing the network
// there is worth a retry, unlike a syntax error.
const CHUNK_LOAD_ERROR = /dynamically imported module|importing a module script|failed to fetch/i;

async function renderMermaid(
  source: string,
  theme: "light" | "dark",
): Promise<MermaidRenderResult> {
  const id = `mermaid-diagram-${nextDiagramId++}`;
  let runtime: MermaidRuntime;
  try {
    runtime = await loadMermaidRuntime();
  } catch {
    return { status: "error", message: "Mermaid failed to load.", retryable: true };
  }
  try {
    // initialize() mutates global config, so renders run one at a time.
    runtime.mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      // HTML labels and theme CSS are mounted while Mermaid lays the diagram
      // out, before sanitizing, so diagram directives must not set them.
      secure: [
        "secure",
        "securityLevel",
        "startOnLoad",
        "maxTextSize",
        "suppressErrorRendering",
        "maxEdges",
        "htmlLabels",
        "themeCSS",
      ],
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      theme: theme === "dark" ? "dark" : "default",
      fontFamily: getComputedStyle(document.body).fontFamily,
    });
    const { svg } = await runtime.mermaid.render(id, source);
    return { status: "rendered", svg: runtime.sanitize(svg) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The diagram could not be rendered.";
    return { status: "error", message, retryable: CHUNK_LOAD_ERROR.test(message) };
  } finally {
    // Mermaid leaves its measuring container behind when render() throws.
    document.getElementById(`d${id}`)?.remove();
  }
}

function evictSettledRenders() {
  for (const [key, result] of renderCache) {
    if (renderCache.size <= MAX_CACHED_RENDERS) return;
    if (settledRenders.has(result)) renderCache.delete(key);
  }
}

function mermaidRenderKey(source: string, theme: "light" | "dark") {
  return `${theme}\n${source}`;
}

function mermaidRenderPromise(source: string, theme: "light" | "dark") {
  const key = mermaidRenderKey(source, theme);
  const cached = renderCache.get(key);
  if (cached) {
    renderCache.delete(key);
    renderCache.set(key, cached);
    return cached;
  }
  const result = renderQueue.then(() => renderMermaid(source, theme));
  renderQueue = result.catch(() => undefined);
  void result.then(() => {
    settledRenders.add(result);
    evictSettledRenders();
  });
  renderCache.set(key, result);
  evictSettledRenders();
  return result;
}

/**
 * Converts a rendered diagram into a standalone image with a fixed size and the
 * page background, so it reads the same in the zoomable image dialog.
 */
function mermaidImageUrl(svg: string): string {
  const svgDocument = new DOMParser().parseFromString(svg, "image/svg+xml");
  const element = svgDocument.documentElement;
  const viewBox = element.getAttribute("viewBox")?.trim().split(/\s+/).map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
    element.setAttribute("width", String(viewBox[2]));
    element.setAttribute("height", String(viewBox[3]));
  }
  element.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  element.style.maxWidth = "none";
  element.style.backgroundColor = getComputedStyle(document.body).backgroundColor;
  return URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(element)], { type: "image/svg+xml" }),
  );
}

/**
 * Suspends until the diagram renders. Invalid diagrams show the parser message
 * above `fallback` (the highlighted source), so the code is never lost.
 */
export function MermaidDiagram({
  source,
  theme,
  fallback,
}: {
  source: string;
  theme: "light" | "dark";
  fallback: ReactNode;
}) {
  const [, setAttempt] = useState(0);
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const trimmedSource = source.trim();
  const result = use(mermaidRenderPromise(trimmedSource, theme));

  // Releases the expanded image's blob URL when the dialog closes or unmounts.
  useEffect(
    () => () => {
      if (expandedUrl) URL.revokeObjectURL(expandedUrl);
    },
    [expandedUrl],
  );

  if (result.status === "error") {
    const summary = result.message.split("\n", 1)[0] ?? result.message;
    return (
      <>
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
          <p className="m-0 min-w-0 truncate text-xs text-destructive" title={result.message}>
            Unable to render diagram: {summary}
          </p>
          {result.retryable ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                renderCache.delete(mermaidRenderKey(trimmedSource, theme));
                setAttempt((attempt) => attempt + 1);
              }}
            >
              Retry
            </Button>
          ) : null}
        </div>
        {fallback}
      </>
    );
  }

  return (
    <div className="overflow-x-auto p-3">
      <button
        type="button"
        aria-label="Expand diagram"
        // Edge animations are opt-in diagram syntax; they would repaint forever.
        className="flex w-full cursor-zoom-in justify-center rounded-md focus-visible:outline-2 focus-visible:outline-ring [&_svg]:h-auto [&_svg]:max-w-full [&_svg_*]:animate-none!"
        onClick={() => setExpandedUrl(mermaidImageUrl(result.svg))}
        dangerouslySetInnerHTML={{ __html: result.svg }}
      />
      {expandedUrl
        ? createPortal(
            <ExpandedImageDialog
              preview={{ images: [{ src: expandedUrl, name: "Mermaid diagram" }], index: 0 }}
              onClose={() => setExpandedUrl(null)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
