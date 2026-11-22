import { LoaderCircleIcon, SquareIcon } from "lucide-react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { BrowserMockup } from "./BrowserMockup";
import type { PreviewableServer } from "./useDiscoveredLocalServers";

interface Props {
  server: PreviewableServer;
  onOpen: () => void;
  /** Avi Code addition: present when this server can be stopped from here. */
  onStop?: (() => void) | undefined;
  stopping?: boolean;
  stopDisabled?: boolean;
}

export function PreviewLocalServerCard({ server, onOpen, onStop, stopping, stopDisabled }: Props) {
  const subtitle = describeServer(server);
  const owner = describeOwner(server);
  return (
    <div className="group relative flex items-center">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <BrowserMockup className="size-7 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{subtitle}</span>
          <span className="truncate text-xs text-muted-foreground">
            {server.host}:{server.port}
            {/* Avi Code addition: says who started it, now that agents can too. */}
            {owner ? ` · ${owner}` : ""}
          </span>
        </div>
        {/* The stop button covers this while it shows. */}
        <span className={onStop ? "group-hover:opacity-0 group-focus-within:opacity-0" : undefined}>
          {server.listening ? <PulsingDot /> : <DimDot />}
        </span>
      </button>
      {onStop ? (
        <div
          className={`absolute right-2 top-1/2 -translate-y-1/2 ${
            stopping
              ? ""
              : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
          }`}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`Stop ${server.host}:${server.port}`}
                  disabled={stopDisabled}
                  onClick={onStop}
                  className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60"
                />
              }
            >
              {stopping ? (
                <LoaderCircleIcon aria-hidden className="size-3 animate-spin" />
              ) : (
                <SquareIcon aria-hidden className="size-3 fill-current" />
              )}
            </TooltipTrigger>
            <TooltipPopup side="left">Stop server</TooltipPopup>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
}

export function describeServer(server: PreviewableServer): string {
  // Avi Code addition: the script name comes first. A URL configured on this
  // project's scripts used to render as a bare "node" once the scanner enriched
  // it, which is exactly the case where the label had something useful to say.
  if (server.scriptName) return server.scriptName;
  if (server.processName) return server.processName;
  if (server.listening) return "Listening";
  if (server.source === "configured") return "Configured";
  return "Recently seen";
}

function describeOwner(server: PreviewableServer): string | null {
  if (server.terminal) return "Terminal";
  if (server.agent) return "Agent";
  return null;
}

function PulsingDot() {
  return (
    <span aria-label="Listening" className="relative inline-flex size-2 shrink-0">
      <span className="absolute inset-0 animate-status-ping rounded-full bg-success opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-success" />
    </span>
  );
}

function DimDot() {
  return (
    <span
      aria-label="Not currently listening"
      className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
    />
  );
}
