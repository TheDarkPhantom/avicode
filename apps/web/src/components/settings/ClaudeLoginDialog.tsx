"use client";

/**
 * Avi Code addition: sign a Claude provider instance in without leaving the app.
 *
 * Upstream's guidance for an unauthenticated instance is to go run
 * `claude auth login` in a terminal — which silently signs in the *wrong*
 * account unless the user also knows to set `CLAUDE_CONFIG_DIR` to that
 * instance's config directory. The server runs the CLI with the instance's own
 * environment, so this dialog only has to relay the URL and collect the code.
 *
 * @module components/settings/ClaudeLoginDialog
 */
import {
  CheckCircle2Icon,
  CopyIcon,
  ExternalLinkIcon,
  LoaderIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { defaultInstanceIdForDriver } from "@t3tools/contracts";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { toastManager } from "../ui/toast";
import {
  claudeLoginSubmitCommand,
  closeClaudeLoginSession,
  markClaudeLoginCodeSubmitting,
  readClaudeLoginSession,
  reportClaudeLoginSubmitFailure,
  subscribeClaudeLoginSession,
} from "./claudeLoginSession";
import { useAtomCommand } from "../../state/use-atom-command";
import { usePrimaryEnvironment } from "../../state/environments";
import { usePrimarySettings } from "../../hooks/useSettings";
import {
  DEFAULT_CLAUDE_CONFIG_DIR,
  findClaudeConfigDirSiblings,
  resolveClaudeConfigDir,
} from "./claudeConfigDir";
import { CLAUDE_DRIVER_KIND } from "./claudeDriverKind";

/** "Avi", "Avi and Will", "Avi, Will and Lawrence". */
function formatSiblingList(labels: ReadonlyArray<string>): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export function ClaudeLoginDialog() {
  const session = useSyncExternalStore(subscribeClaudeLoginSession, readClaudeLoginSession);
  const primaryEnvironment = usePrimaryEnvironment();
  const settings = usePrimarySettings();
  const submitCode = useAtomCommand(claudeLoginSubmitCommand, { reportFailure: false });
  const [code, setCode] = useState("");
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const { phase, instanceId } = session;
  const open = phase.status !== "idle";

  // Avi Code addition: which other instances this sign-in would also change.
  const siblings = useMemo(
    () =>
      instanceId
        ? findClaudeConfigDirSiblings({
            instances: settings.providerInstances,
            legacyClaudeHomePath: settings.providers?.claudeAgent?.homePath,
            instanceId,
            defaultInstanceId: defaultInstanceIdForDriver(CLAUDE_DRIVER_KIND),
          })
        : [],
    [instanceId, settings.providerInstances, settings.providers?.claudeAgent?.homePath],
  );
  const configDirLabel = instanceId
    ? resolveClaudeConfigDir(
        (
          settings.providerInstances?.[instanceId]?.config as
            | { readonly homePath?: string }
            | undefined
        )?.homePath ?? settings.providers?.claudeAgent?.homePath,
      )
    : DEFAULT_CLAUDE_CONFIG_DIR;

  // A fresh session must not inherit the previous attempt's code.
  useEffect(() => {
    if (!open) setCode("");
  }, [open]);

  const awaitingCode = phase.status === "authorizing" && phase.awaitingCode;
  useEffect(() => {
    if (awaitingCode) codeInputRef.current?.focus();
  }, [awaitingCode]);

  const handleSubmit = () => {
    const trimmed = code.trim();
    if (!trimmed || !instanceId || !primaryEnvironment) return;
    markClaudeLoginCodeSubmitting();
    void (async () => {
      const result = await submitCode({
        environmentId: primaryEnvironment.environmentId,
        instanceId,
        code: trimmed,
      });
      if (result._tag === "Failure") {
        reportClaudeLoginSubmitFailure("Could not send the code to the Claude CLI.");
        return;
      }
      // The CLI decides the outcome; the stream reports it. Clearing here keeps
      // a rejected code from being resubmitted by a stray Enter.
      setCode("");
    })();
  };

  const copyUrl = (url: string) => {
    void navigator.clipboard
      .writeText(url)
      .then(() => toastManager.add({ type: "success", title: "Sign-in link copied" }))
      .catch(() => toastManager.add({ type: "error", title: "Could not copy the sign-in link" }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeClaudeLoginSession();
      }}
    >
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sign in to {session.displayName}</DialogTitle>
          <DialogDescription>
            {siblings.length > 0
              ? // Claiming isolation here while the warning below says the
                // opposite is worse than saying nothing.
                `Signs in to ${configDirLabel}, which this instance does not have to itself.`
              : "Signs in to this instance's own Claude config directory, so your other Claude instances keep their accounts."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5 text-sm">
          {/* Avi Code addition: signing in writes into a config directory, so a
              shared one quietly re-authenticates every instance pointing at it.
              Warn rather than block — sharing is occasionally deliberate, for
              two named presets on one account. */}
          {siblings.length > 0 ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-warning/32 bg-warning/4 px-3 py-2.5"
            >
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <div className="min-w-0">
                <div className="font-medium text-foreground">
                  This will also change {formatSiblingList(siblings.map((s) => s.label))}
                </div>
                <p className="text-muted-foreground">
                  {siblings.length === 1 ? "That instance shares" : "Those instances share"} this
                  one's Claude config directory ({configDirLabel}), so they are one account under
                  two names. Give this instance its own directory first if you meant them to differ.
                </p>
              </div>
            </div>
          ) : null}

          {phase.status === "starting" ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <LoaderIcon className="size-4 shrink-0 animate-spin" aria-hidden />
              <span>Starting the Claude CLI…</span>
            </div>
          ) : null}

          {phase.status === "authorizing" ? (
            <>
              <div className="grid gap-2">
                <div className="font-medium text-foreground">1. Approve the sign-in</div>
                <p className="text-muted-foreground">
                  A browser should have opened already. If it did not, use this link.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    render={
                      <a href={phase.url} target="_blank" rel="noreferrer noopener">
                        <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden />
                        Open sign-in page
                      </a>
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyUrl(phase.url)}
                    aria-label="Copy the sign-in link"
                  >
                    <CopyIcon className="size-3.5 shrink-0" aria-hidden />
                    Copy link
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <label className="font-medium text-foreground" htmlFor="claude-login-code">
                  2. Paste the code the page gives you
                </label>
                <Input
                  id="claude-login-code"
                  ref={codeInputRef}
                  value={code}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={phase.awaitingCode ? "Paste the code" : "Waiting for the CLI…"}
                  disabled={!phase.awaitingCode || phase.submitting}
                  onChange={(event) => setCode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
                {phase.rejection ? (
                  <p className="text-destructive" role="alert">
                    {phase.rejection}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          {phase.status === "succeeded" ? (
            <div className="flex items-start gap-2">
              <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              <div>
                <div className="font-medium text-foreground">Signed in</div>
                <p className="text-muted-foreground">
                  {phase.email
                    ? `${session.displayName} now uses ${phase.email}.`
                    : `${session.displayName} is authenticated.`}
                </p>
              </div>
            </div>
          ) : null}

          {phase.status === "failed" ? (
            <p className="text-destructive" role="alert">
              {phase.message}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={closeClaudeLoginSession}>
            {phase.status === "succeeded" || phase.status === "failed" ? "Close" : "Cancel"}
          </Button>
          {phase.status === "authorizing" ? (
            <Button
              onClick={handleSubmit}
              disabled={!phase.awaitingCode || phase.submitting || code.trim().length === 0}
            >
              {phase.submitting ? (
                <LoaderIcon className="size-3.5 shrink-0 animate-spin" aria-hidden />
              ) : null}
              Submit code
            </Button>
          ) : null}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
