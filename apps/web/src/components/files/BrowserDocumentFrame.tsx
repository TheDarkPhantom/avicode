export const isPdfPreviewFile = (path: string): boolean =>
  /\.pdf$/i.test(path.split(/[?#]/, 1)[0] ?? "");

/**
 * An HTML page or PDF rendered in place. HTML runs in a sandboxed frame with
 * an opaque origin, so a page cannot reach the app's session or storage.
 * Downloads stay allowed so download links and buttons in the page work.
 */
export function BrowserDocumentFrame(props: {
  readonly src: string;
  readonly title: string;
  readonly pdf: boolean;
}) {
  const className = "min-h-0 flex-1 border-0 bg-white";
  // The built-in PDF viewer needs an unsandboxed frame; a PDF runs no scripts.
  return props.pdf ? (
    // oxlint-disable-next-line react/iframe-missing-sandbox
    <iframe key={props.src} src={props.src} title={props.title} className={className} />
  ) : (
    <iframe
      key={props.src}
      src={props.src}
      title={props.title}
      className={className}
      sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
    />
  );
}
