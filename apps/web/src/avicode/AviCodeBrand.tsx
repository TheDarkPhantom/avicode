import type { SVGProps } from "react";

import { APP_BASE_NAME } from "~/branding";
import { T3AppIcon } from "~/components/T3AppIcon";
import { cn } from "~/lib/utils";

/** The small app icon (`assets/prod/logo-24.svg`) in one colour, for spots upstream draws its T3 glyph. */
export function AviCodeGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      viewBox="22 66 212 128"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M68 90L36 130L68 170M188 90L220 130L188 170" strokeWidth="26" />
      <path d="M90 180L121 80H135L166 180M106 148H150" strokeWidth="26" />
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
