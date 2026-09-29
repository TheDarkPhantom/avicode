import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";

// Ported from upstream #13516. Settings, Usage, and the changelog are utility
// pages whose Back (and Escape) leave for the main app. Everything else is the
// main app.
export function isUtilityPage(pathname: string): boolean {
  return (
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/usage" ||
    pathname === "/changelog"
  );
}

let mainAppHref: string | null = null;

// Mount once in the app shell. Records the latest main app URL so Back can
// return there no matter how many utility pages were visited since.
export function MainAppLocationTracker() {
  const href = useLocation({
    select: (location) => (isUtilityPage(location.pathname) ? null : location.href),
  });
  useEffect(() => {
    if (href !== null) mainAppHref = href;
  }, [href]);
  return null;
}

// Leaves a utility page for the last main app URL, or the thread list when
// the app was opened directly on a utility page.
export function useNavigateToMainApp() {
  const navigate = useNavigate();
  return useCallback(() => navigate({ href: mainAppHref ?? "/" }), [navigate]);
}
