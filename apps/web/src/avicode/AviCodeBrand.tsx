import type { SVGProps } from "react";

import { APP_BASE_NAME } from "~/branding";
import { T3AppIcon } from "~/components/T3AppIcon";
import { cn } from "~/lib/utils";

/** The app icon (`assets/prod/logo.svg`) drawn in one colour, for spots upstream draws its T3 glyph. */
export function AviCodeGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      viewBox="100 270 824 484"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M294 315L142 512L294 709M730 315L882 512L730 709" strokeWidth="80" />
      <path d="M348 704L486 314H538L676 704M409 567H615" strokeWidth="76" />
    </svg>
  );
}

/** Icon plus product name, in place of upstream's "T3" wordmark followed by "Code". */
export function AviCodeBrandName({
  className,
  nameClassName,
}: {
  readonly className?: string;
  readonly nameClassName?: string;
}) {
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1.5 tracking-tight", className)}
      role="img"
      aria-label={APP_BASE_NAME}
    >
      <T3AppIcon className="size-4 shrink-0 rounded-sm" />
      <span className={cn("truncate", nameClassName)} aria-hidden>
        {APP_BASE_NAME}
      </span>
    </span>
  );
}
