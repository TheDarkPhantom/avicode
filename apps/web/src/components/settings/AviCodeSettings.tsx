import type { DesktopLegacyT3ImportResult, DesktopLegacyT3ImportStatus } from "@t3tools/contracts";
import {
  MAX_SIDEBAR_FLAT_THREAD_COUNT,
  MIN_SIDEBAR_FLAT_THREAD_COUNT,
  type SidebarFlatThreadCount,
  type SidebarThreadGrouping,
} from "@t3tools/contracts/settings";
import {
  DatabaseBackupIcon,
  LoaderIcon,
  PanelLeftIcon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

const SIDEBAR_THREAD_GROUPING_LABELS: Record<SidebarThreadGrouping, string> = {
  project: "Group by project",
  flat: "Flat, by activity",
};

function SidebarLayoutSettings() {
  const threadGrouping = useClientSettings<SidebarThreadGrouping>(
    (settings) => settings.sidebarThreadGrouping,
  );
  const flatThreadCount = useClientSettings<SidebarFlatThreadCount>(
    (settings) => settings.sidebarFlatThreadCount,
  );
  const updateSettings = useUpdateClientSettings();
  const isFlat = threadGrouping === "flat";

  const handleFlatThreadCountChange = useCallback(
    (nextValue: number | null) => {
      if (nextValue === null) return;
      const clamped = Math.min(
        MAX_SIDEBAR_FLAT_THREAD_COUNT,
        Math.max(MIN_SIDEBAR_FLAT_THREAD_COUNT, nextValue),
      ) as SidebarFlatThreadCount;
      if (clamped !== flatThreadCount) {
        updateSettings({ sidebarFlatThreadCount: clamped });
      }
    },
    [flatThreadCount, updateSettings],
  );

  return (
    <SettingsSection title="Sidebar layout" icon={<PanelLeftIcon className="size-5" />}>
      <SettingsRow
        title="Thread list"
        description="Group by project keeps the two-level tree, where a chat only moves within its project's block. Flat drops the grouping and orders every chat against every other by recent activity, so the ctrl+1…ctrl+9 jump shortcuts land on your most recently used chats regardless of project."
        control={
          <Select
            value={threadGrouping}
            onValueChange={(value) => {
              updateSettings({ sidebarThreadGrouping: value as SidebarThreadGrouping });
            }}
          >
            <SelectTrigger className="w-full sm:w-48" aria-label="Sidebar thread list layout">
              <SelectValue>{SIDEBAR_THREAD_GROUPING_LABELS[threadGrouping]}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem hideIndicator value="project">
                {SIDEBAR_THREAD_GROUPING_LABELS.project}
              </SelectItem>
              <SelectItem hideIndicator value="flat">
                {SIDEBAR_THREAD_GROUPING_LABELS.flat}
              </SelectItem>
            </SelectPopup>
          </Select>
        }
      />
      {isFlat ? (
        <SettingsRow
          title="Visible threads"
          description="How many chats the flat list shows before the “Show more” row. The chat you're currently in always stays visible, even when it falls past this cutoff."
          control={
            <NumberField
              aria-label="Visible thread count"
              className="w-28 gap-0"
              max={MAX_SIDEBAR_FLAT_THREAD_COUNT}
              min={MIN_SIDEBAR_FLAT_THREAD_COUNT}
              onValueChange={handleFlatThreadCountChange}
              size="sm"
              step={1}
              value={flatThreadCount}
            >
              <NumberFieldGroup className="h-8 rounded-md">
                <NumberFieldDecrement
                  aria-label="Decrease visible thread count"
                  className="px-2 [&_svg]:size-3.5"
                />
                <NumberFieldInput
                  aria-label="Visible thread count"
                  className="h-8 w-10 grow-0 px-0 text-xs leading-8"
                  inputMode="numeric"
                />
                <NumberFieldIncrement
                  aria-label="Increase visible thread count"
                  className="px-2 [&_svg]:size-3.5"
                />
              </NumberFieldGroup>
            </NumberField>
          }
        />
      ) : null}
    </SettingsSection>
  );
}

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
  const canImport =
    typeof bridge?.getLegacyT3ImportStatus === "function" &&
    typeof bridge.importLegacyT3Data === "function";

  const refreshStatus = useCallback(async () => {
    if (!canImport) {
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
  }, [bridge, canImport]);

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
      <SidebarLayoutSettings />

      <SettingsSection title="Avi Code" icon={<SparklesIcon className="size-5" />}>
        <SettingsRow
          title="Import from T3 Code"
          description="Refresh Avi Code with the latest projects, threads, messages, and attachments from your local T3 Code workspace."
          status={
            canImport
              ? legacyT3ImportStatusDescription(status)
              : "Available in the Avi Code desktop app."
          }
          control={
            <Button
              size="sm"
              disabled={!canImport || isLoading || isImporting || status?.available !== true}
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
