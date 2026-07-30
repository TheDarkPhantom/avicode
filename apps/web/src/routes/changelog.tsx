import { createFileRoute, redirect, useCanGoBack, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";

import { ChangelogPanel } from "../components/changelog/ChangelogPanel";
import { SidebarInset } from "../components/ui/sidebar";
import { isElectron } from "../env";
import { cn } from "~/lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";

/**
 * Avi Code addition: a top-level route rather than a Settings tab, because the changelog is
 * reading material rather than a setting, and the sidebar links straight to it.
 */
function ChangelogRouteLayout() {
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const navigateBackWithinApp = useCallback(() => {
    if (canGoBack) {
      window.history.back();
      return;
    }
    void navigate({ to: "/" });
  }, [canGoBack, navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      navigateBackWithinApp();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [navigateBackWithinApp]);

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
