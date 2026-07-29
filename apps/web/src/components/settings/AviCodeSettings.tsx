import type { DesktopLegacyT3ImportResult, DesktopLegacyT3ImportStatus } from "@t3tools/contracts";
import {
  BellRingIcon,
  DatabaseBackupIcon,
  EyeOffIcon,
  LoaderIcon,
  RefreshCwIcon,
  SparklesIcon,
  TagsIcon,
} from "lucide-react";
import { useAtomValue } from "@effect/atom-react";
import { useCallback, useEffect, useState } from "react";

import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { previewNotificationChime } from "../../lib/notificationChime";
import {
  isWindowTitlePrivacyEnabled,
  setWindowTitlePrivacyEnabled,
} from "../../lib/windowTitleMetadata";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { primaryServerProvidersAtom } from "../../state/server";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

function NotificationSettings() {
  const notificationSoundEnabled = useClientSettings(
    (settings) => settings.notificationSoundEnabled,
  );
  const updateSettings = useUpdateClientSettings();

  return (
    <SettingsSection title="Notifications" icon={<BellRingIcon className="size-5" />}>
      <SettingsRow
        title="Sound when a chat needs you"
        description="Plays a short chime the moment a chat starts waiting on you — it finished work you haven't read, it asked a question, or it's blocked on an approval. These are the same states the sidebar labels Completed, Waiting, and Pending Approval, so the sound and the label always agree."
        status="Stays quiet for the chat you already have open in a focused window, and for everything that is already waiting when the app starts."
        control={
          <Switch
            checked={notificationSoundEnabled}
            // Play on enable, from inside the click: browsers only let audio
            // start from a user gesture, so this both previews the sound and
            // unblocks the audio context for later chimes that have no gesture
            // behind them.
            onCheckedChange={(checked) => {
              const enabled = Boolean(checked);
              updateSettings({ notificationSoundEnabled: enabled });
              if (enabled) {
                previewNotificationChime();
              }
            }}
            aria-label="Play a sound when a chat needs you"
          />
        }
      />
    </SettingsSection>
  );
}

function TimeLoggingSettings() {
  const [windowTitlePrivate, setWindowTitlePrivate] = useState(isWindowTitlePrivacyEnabled);

  return (
    <SettingsSection title="Time logging" icon={<EyeOffIcon className="size-5" />}>
      <SettingsRow
        title="Private window titles"
        description="Hide repository and thread names from Avi Code's native title. Leave this off for exact ALFRED project and thread attribution."
        status={
          windowTitlePrivate
            ? "ALFRED can still record generic Avi Code foreground time, but cannot name the active project or thread."
            : "The native title contains repository and thread names only; conversation and attachment contents are never exposed."
        }
        control={
          <Switch
            checked={windowTitlePrivate}
            aria-label="Private window titles"
            onCheckedChange={(checked) => {
              setWindowTitlePrivacyEnabled(checked);
              setWindowTitlePrivate(checked);
            }}
          />
        }
      />
    </SettingsSection>
  );
}

function ChatListSettings() {
  const showStatusLabels = useClientSettings((settings) => settings.aviCodeSidebarShowStatusLabels);
  const badgeLabels = useClientSettings((settings) => settings.aviCodeProviderBadgeLabels);
  const providers = deriveProviderInstanceEntries(useAtomValue(primaryServerProvidersAtom));
  const updateSettings = useUpdateClientSettings();

  return (
    <SettingsSection title="Chat list" icon={<TagsIcon className="size-5" />}>
      <SettingsRow
        title="Show status labels"
        description="Show concise labels such as Working and Waiting beside each chat. Turn this off to keep only the colored status dot."
        control={
          <Switch
            checked={showStatusLabels}
            onCheckedChange={(checked) =>
              updateSettings({ aviCodeSidebarShowStatusLabels: Boolean(checked) })
            }
            aria-label="Show chat status labels"
          />
        }
      />
      {providers.map((provider) => {
        const value = badgeLabels[provider.instanceId] ?? "";
        return (
          <SettingsRow
            key={provider.instanceId}
            title={`${provider.displayName} badge`}
            description="Use one or two characters to identify this client in every chat row. Leave blank to use automatic initials."
            control={
              <div className="flex items-center gap-2">
                <ProviderInstanceIcon
                  driverKind={provider.driverKind}
                  displayName={value || provider.displayName}
                  accentColor={provider.accentColor}
                  showBadge
                />
                <Input
                  value={value}
                  maxLength={2}
                  className="w-16 text-center uppercase"
                  aria-label={`${provider.displayName} chat badge`}
                  placeholder="Auto"
                  onChange={(event) => {
                    const nextValue = event.target.value
                      .replace(/[^a-z0-9]/giu, "")
                      .slice(0, 2)
                      .toUpperCase();
                    const nextLabels = { ...badgeLabels };
                    if (nextValue) nextLabels[provider.instanceId] = nextValue;
                    else delete nextLabels[provider.instanceId];
                    updateSettings({ aviCodeProviderBadgeLabels: nextLabels });
                  }}
                />
              </div>
            }
          />
        );
      })}
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
      <NotificationSettings />
      <TimeLoggingSettings />
      <ChatListSettings />

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
