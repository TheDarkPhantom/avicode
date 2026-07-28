import type { DesktopLegacyT3ImportResult, DesktopLegacyT3ImportStatus } from "@t3tools/contracts";
import { DatabaseBackupIcon, LoaderIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

export function legacyT3ImportStatusDescription(
  status: DesktopLegacyT3ImportStatus | null,
): string {
  if (!status) return "Checking for a local T3 Code workspace…";
  if (!status.available) return "No local T3 Code workspace was found.";
  if (!status.lastImportedAt) return `Ready to import from ${status.sourcePath}.`;
  return `Last imported ${new Date(status.lastImportedAt).toLocaleString()}.`;
}

function resultToast(result: DesktopLegacyT3ImportResult) {
  if (result.status === "cancelled") return;
  toastManager.add(
    stackedThreadToast({
      type: result.status === "imported" ? "success" : "error",
      title:
        result.status === "imported"
          ? "T3 Code workspace imported"
          : "T3 Code import did not complete",
      description:
        result.status === "imported" && result.backupPath
          ? `${result.message} Previous Avi Code data was backed up to ${result.backupPath}.`
          : result.message,
    }),
  );
}

export function AviCodeSettings() {
  const [status, setStatus] = useState<DesktopLegacyT3ImportStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;

  const refreshStatus = useCallback(async () => {
    if (!bridge?.getLegacyT3ImportStatus) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      setStatus(await bridge.getLegacyT3ImportStatus());
    } catch (error) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not inspect T3 Code data",
          description: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setIsLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const importLatest = useCallback(async () => {
    if (!bridge?.importLegacyT3Data) return;
    setIsImporting(true);
    try {
      const result = await bridge.importLegacyT3Data();
      resultToast(result);
      if (result.status === "imported") {
        await refreshStatus();
      }
    } catch (error) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not import T3 Code data",
          description: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setIsImporting(false);
    }
  }, [bridge, refreshStatus]);

  return (
    <SettingsPageContainer>
      <SettingsSection title="Avi Code" icon={<SparklesIcon className="size-5" />}>
        <SettingsRow
          title="Import from T3 Code"
          description="Refresh Avi Code with the latest projects, threads, messages, and attachments from your local T3 Code workspace."
          status={legacyT3ImportStatusDescription(status)}
          control={
            <Button
              size="sm"
              disabled={!bridge || isLoading || isImporting || status?.available !== true}
              onClick={() => void importLatest()}
            >
              {isImporting ? (
                <LoaderIcon className="size-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-4" />
              )}
              {isImporting ? "Importing…" : "Import latest"}
            </Button>
          }
        />
      </SettingsSection>

      <SettingsSection title="Import safety" icon={<DatabaseBackupIcon className="size-5" />}>
        <SettingsRow
          title="Avi Code data is backed up first"
          description="The import replaces Avi Code’s conversation database with a consistent T3 Code snapshot. Provider instances and other Avi Code settings stay unchanged. A timestamped backup is created before replacement."
        />
        <SettingsRow
          title="Active turns"
          description="Finish active Claude or Codex turns before importing. The local Avi Code backend restarts automatically after the snapshot is installed."
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
