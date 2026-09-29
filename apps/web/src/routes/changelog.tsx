import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { ChangelogPanel } from "../components/changelog/ChangelogPanel";
import { useNavigateToMainApp } from "../components/sidebar/mainAppLocation";
import { SidebarInset } from "../components/ui/sidebar";
import { isElectron } from "../env";
import { cn } from "~/lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";

/**
 * Avi Code addition: a top-level route rather than a Settings tab, because the changelog is
 * reading material rather than a setting, and the sidebar links straight to it.
 */
function ChangelogRouteLayout() {
  const navigateToMainApp = useNavigateToMainApp();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      void navigateToMainApp();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [navigateToMainApp]);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {isElectron ? (
          <div
            className={cn(
              "drag-region flex h-[52px] shrink-0 items-center px-5 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none wco:h-[env(titlebar-area-height)] wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]",
              COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
            )}
          >
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              Changelog
            </span>
          </div>
        ) : (
          <header
            className={cn(
              "workspace-topbar px-3 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none sm:px-5",
              COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
            )}
          >
            <span className="text-sm font-medium text-foreground">Changelog</span>
          </header>
        )}

        <div className="flex min-h-0 flex-1 flex-col">
          <ChangelogPanel />
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/changelog")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: ChangelogRouteLayout,
});
