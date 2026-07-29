import type { DesktopLegacyT3ImportResult, DesktopLegacyT3ImportStatus } from "@t3tools/contracts";
import {
  MAX_SIDEBAR_FLAT_THREAD_COUNT,
  MIN_SIDEBAR_FLAT_THREAD_COUNT,
  type SidebarFlatThreadCount,
  type SidebarThreadGrouping,
} from "@t3tools/contracts/settings";
import {
  BellRingIcon,
  DatabaseBackupIcon,
  EyeOffIcon,
  LoaderIcon,
  PaletteIcon,
  PanelLeftIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TagsIcon,
} from "lucide-react";
import { useAtomValue } from "@effect/atom-react";
import { useCallback, useEffect, useState } from "react";

import { useColorTheme } from "../../hooks/useColorTheme";
import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { useTheme } from "../../hooks/useTheme";
import {
  COLOR_THEMES,
  type ColorThemeDefinition,
  DEFAULT_COLOR_THEME,
  findColorTheme,
  isColorThemeId,
} from "../../lib/colorTheme";
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
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { stackedThreadToast, toastManager } from "../ui/toast";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";

/**
 * Avi Code addition. The colour theme is a fork feature, so its UI lives here
 * rather than on the upstream Appearance panel — that panel keeps owning the
 * light/dark/system switch, which this is orthogonal to.
 */
function ColorThemeSwatch({
  colorTheme,
  mode,
}: {
  colorTheme: ColorThemeDefinition;
  mode: "light" | "dark";
}) {
  return (
    <span
      aria-hidden="true"
      className="size-3 shrink-0 rounded-full border border-black/15 dark:border-white/20"
      style={{ backgroundColor: colorTheme.swatch[mode] }}
    />
  );
}

function ColorThemeSettings() {
  const { colorTheme, setColorTheme } = useColorTheme();
  const { resolvedTheme } = useTheme();
  const selected = findColorTheme(colorTheme);

  return (
    <SettingsSection title="Appearance" icon={<PaletteIcon className="size-5" />}>
      <SettingsRow
        title="Colour theme"
        description="Repaints the whole app — surfaces, borders, and accents. This is independent of the Light/Dark/System switch on the Appearance page: every theme ships both a light and a dark palette, so the mode you picked there still decides which one you see."
        status={selected.description}
        resetAction={
          colorTheme === DEFAULT_COLOR_THEME ? null : (
            <SettingResetButton
              label="colour theme"
              onClick={() => setColorTheme(DEFAULT_COLOR_THEME)}
            />
          )
        }
        control={
          <Select
            value={colorTheme}
            onValueChange={(value) => {
              if (isColorThemeId(value)) setColorTheme(value);
            }}
          >
            <SelectTrigger className="w-full sm:w-48" aria-label="Colour theme">
              <SelectValue>
                <span className="flex items-center gap-2">
                  <ColorThemeSwatch colorTheme={selected} mode={resolvedTheme} />
                  {selected.label}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {COLOR_THEMES.map((option) => (
                <SelectItem hideIndicator key={option.id} value={option.id}>
                  <span className="flex items-center gap-2">
                    <ColorThemeSwatch colorTheme={option} mode={resolvedTheme} />
                    {option.label}
                  </span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
    </SettingsSection>
  );
}

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

function ProjectIsolationSettings() {
  const projectScopedProviderSelectionEnabled = useClientSettings(
    (settings) => settings.projectScopedProviderSelectionEnabled,
  );
  const updateSettings = useUpdateClientSettings();

  return (
    <SettingsSection title="Project isolation" icon={<ShieldCheckIcon className="size-5" />}>
      <SettingsRow
        title="Remember provider credentials per project"
        description="Keeps each project’s last selected provider instance and model separate. Use this when provider instances represent different clients or accounts, so starting a chat in one project cannot inherit another project’s Claude or Codex credentials."
        status="Off by default. Existing global model-picker behavior stays unchanged until you enable this."
        control={
          <Switch
            checked={projectScopedProviderSelectionEnabled}
            onCheckedChange={(checked) => {
              updateSettings({
                projectScopedProviderSelectionEnabled: Boolean(checked),
              });
            }}
            aria-label="Remember provider credentials per project"
          />
        }
      />
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
      <ColorThemeSettings />
      <SidebarLayoutSettings />
      <NotificationSettings />
      <TimeLoggingSettings />
      <ChatListSettings />
      <ProjectIsolationSettings />

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
