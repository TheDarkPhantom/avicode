import type { DesktopLegacyT3ImportResult, DesktopLegacyT3ImportStatus } from "@t3tools/contracts";
import {
  type AviCodeChatContentWidth,
  MAX_SIDEBAR_FLAT_THREAD_COUNT,
  MIN_SIDEBAR_FLAT_THREAD_COUNT,
  type SidebarFlatThreadCount,
  type AviCodeNotificationSound,
  type SidebarThreadGrouping,
} from "@t3tools/contracts/settings";
import {
  AlignCenterIcon,
  BellRingIcon,
  DatabaseBackupIcon,
  EyeOffIcon,
  LoaderIcon,
  MapIcon,
  MicIcon,
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
import {
  useClientSettings,
  usePrimarySettings,
  useUpdateClientSettings,
  useUpdatePrimarySettings,
} from "../../hooks/useSettings";
import { useTheme } from "../../hooks/useTheme";
import {
  COLOR_THEMES,
  type ColorThemeDefinition,
  DEFAULT_COLOR_THEME,
  findColorTheme,
  isColorThemeId,
} from "../../lib/colorTheme";
import { DraftInput } from "../ui/draft-input";
import { NOTIFICATION_SOUND_PRESETS, previewNotificationChime } from "../../lib/notificationChime";
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
import { useAudioInputDevices } from "~/voice/useAudioInputDevices";
import { resolveSelectedDeviceId, SYSTEM_DEFAULT_DEVICE_ID } from "~/voice/micDevices";
import { Switch } from "../ui/switch";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { ToggleGroup, Toggle as ToggleGroupItem } from "../ui/toggle-group";
import { AviCodeShortcutsPanel } from "./AviCodeShortcuts";
import { CommunicationStyleSettings } from "./CommunicationStyleSettings";
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

const CHAT_CONTENT_WIDTH_LABELS: Record<AviCodeChatContentWidth, string> = {
  comfortable: "Comfortable",
  wide: "Wide",
  full: "Full width",
};

function ChatLayoutSettings() {
  const contentWidth = useClientSettings<AviCodeChatContentWidth>(
    (settings) => settings.aviCodeChatContentWidth,
  );
  const openAtLastResponse = useClientSettings(
    (settings) => settings.aviCodeOpenChatsAtLastResponse,
  );
  const updateSettings = useUpdateClientSettings();

  return (
    <SettingsSection title="Chat layout" icon={<AlignCenterIcon className="size-5" />}>
      <SettingsRow
        title="Conversation width"
        description="How wide the message column and composer are allowed to grow. Comfortable keeps the reading measure short, which is easier on long prose; Full uses the whole pane."
        status="Tables, code blocks, and diffs always widen past this into whatever space is free, so a wide table stays readable on Comfortable."
        control={
          <Select
            value={contentWidth}
            onValueChange={(value) => {
              updateSettings({ aviCodeChatContentWidth: value as AviCodeChatContentWidth });
            }}
          >
            <SelectTrigger className="w-full sm:w-48" aria-label="Conversation width">
              <SelectValue>{CHAT_CONTENT_WIDTH_LABELS[contentWidth]}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem hideIndicator value="comfortable">
                {CHAT_CONTENT_WIDTH_LABELS.comfortable}
              </SelectItem>
              <SelectItem hideIndicator value="wide">
                {CHAT_CONTENT_WIDTH_LABELS.wide}
              </SelectItem>
              <SelectItem hideIndicator value="full">
                {CHAT_CONTENT_WIDTH_LABELS.full}
              </SelectItem>
            </SelectPopup>
          </Select>
        }
      />
      <SettingsRow
        title="Open chats at the last response"
        description="Opening a chat that is not working starts at the top of its last response, so a finished answer reads from its first line instead of its last. Chats that are still working keep following the newest text."
        status="The jump-to-latest button stays one click away, and sending a message returns to the live edge as usual."
        control={
          <Switch
            checked={openAtLastResponse}
            onCheckedChange={(checked) =>
              updateSettings({ aviCodeOpenChatsAtLastResponse: Boolean(checked) })
            }
            aria-label="Open chats at the last response"
          />
        }
      />
    </SettingsSection>
  );
}

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

const NOTIFICATION_SOUND_OPTIONS = Object.entries(NOTIFICATION_SOUND_PRESETS) as ReadonlyArray<
  [AviCodeNotificationSound, (typeof NOTIFICATION_SOUND_PRESETS)[AviCodeNotificationSound]]
>;

function NotificationSettings() {
  const notificationSoundEnabled = useClientSettings(
    (settings) => settings.notificationSoundEnabled,
  );
  const notificationSound = useClientSettings<AviCodeNotificationSound>(
    (settings) => settings.aviCodeNotificationSound,
  );
  const updateSettings = useUpdateClientSettings();

  return (
    <SettingsSection title="Notifications" icon={<BellRingIcon className="size-5" />}>
      <SettingsRow
        title="Sound when a chat needs you"
        description="Plays a short sound the moment a chat starts waiting on you — it finished work you haven't read, it asked a question, or it's blocked on an approval. These are the same states the sidebar labels Completed, Waiting, and Pending Approval, so the sound and the label always agree."
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
                previewNotificationChime(notificationSound);
              }
            }}
            aria-label="Play a sound when a chat needs you"
          />
        }
      />
      <SettingsRow
        title="Sound"
        description="Picking one plays it. They differ in rhythm and timbre, not just pitch, so you can tell Avi Code apart from whatever else on your machine chimes at you."
        control={
          <Select
            value={notificationSound}
            disabled={!notificationSoundEnabled}
            onValueChange={(value) => {
              const next = value as AviCodeNotificationSound;
              updateSettings({ aviCodeNotificationSound: next });
              // Same user-gesture reasoning as the toggle above: this is the
              // one moment we are allowed to make noise, so use it to let the
              // choice be heard rather than guessed from a name.
              previewNotificationChime(next);
            }}
          >
            <SelectTrigger className="w-full sm:w-48" aria-label="Notification sound">
              <SelectValue>{NOTIFICATION_SOUND_PRESETS[notificationSound].label}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {NOTIFICATION_SOUND_OPTIONS.map(([id, preset]) => (
                <SelectItem hideIndicator key={id} value={id}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
    </SettingsSection>
  );
}

function TimeLoggingSettings() {
  const [windowTitlePrivate, setWindowTitlePrivate] = useState(isWindowTitlePrivacyEnabled);

  return (
    <SettingsSection title="Window title" icon={<EyeOffIcon className="size-5" />}>
      <SettingsRow
        title="Private window titles"
        description="Hide repository and thread names from Avi Code's native title, so anything reading window titles — time trackers, screen recordings, screen shares — sees only the app name. Leave this off if you want those tools to name the project and chat you are on."
        status={
          windowTitlePrivate
            ? "The native title is just Avi Code. Anything tracking window titles can tell the app is in front, but not which project or chat."
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

function NewChatSettings() {
  const startInPlanMode = useClientSettings(
    (settings) => settings.aviCodeNewThreadsStartInPlanMode,
  );
  const updateSettings = useUpdateClientSettings();

  return (
    <SettingsSection title="New chats" icon={<MapIcon className="size-5" />}>
      <SettingsRow
        title="Start new chats in plan mode"
        description="Every brand-new chat opens with the composer in Plan mode, so the agent researches and proposes a plan before touching files. You still flip any individual chat back with the mode toggle, and existing chats keep whatever mode they already use."
        status="Only seeds the initial mode of a new chat. Implementing a plan still switches that chat to Build as usual."
        control={
          <Switch
            checked={startInPlanMode}
            onCheckedChange={(checked) =>
              updateSettings({ aviCodeNewThreadsStartInPlanMode: Boolean(checked) })
            }
            aria-label="Start new chats in plan mode"
          />
        }
      />
    </SettingsSection>
  );
}

function ChatListSettings() {
  const showStatusLabels = useClientSettings((settings) => settings.aviCodeSidebarShowStatusLabels);
  const showWorktreeIcon = useClientSettings((settings) => settings.aviCodeSidebarShowWorktreeIcon);
  const showPrIndicator = useClientSettings((settings) => settings.aviCodeSidebarShowPrIndicator);
  const badgeLabels = useClientSettings((settings) => settings.aviCodeProviderBadgeLabels);
  const providers = deriveProviderInstanceEntries(useAtomValue(primaryServerProvidersAtom));
  const updateSettings = useUpdateClientSettings();

  return (
    <SettingsSection title="Chat list" icon={<TagsIcon className="size-5" />}>
      <SettingsRow
        title="Show status labels"
        description="Show concise labels such as Working and Waiting beside each chat. Turn this off for a denser list — chats waiting on you still tint their whole row in the status color, so you can read state from color alone."
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
      <SettingsRow
        title="Show worktree icon"
        description="Show the small git-folder icon on chats that run in their own worktree. Turning this off hides the icon; hovering a chat still names its worktree and branch in the tooltip."
        control={
          <Switch
            checked={showWorktreeIcon}
            onCheckedChange={(checked) =>
              updateSettings({ aviCodeSidebarShowWorktreeIcon: Boolean(checked) })
            }
            aria-label="Show worktree icon in the chat list"
          />
        }
      />
      <SettingsRow
        title="Show pull request indicator"
        description="Show the pull request marker on chats whose branch has a PR — a git-fork icon before the title, or the PR number in the Beta sidebar. Its color tracks the PR state (open, merged, closed) and clicking it opens the PR. Turning this off hides it; the branch toolbar above the chat still shows the PR."
        control={
          <Switch
            checked={showPrIndicator}
            onCheckedChange={(checked) =>
              updateSettings({ aviCodeSidebarShowPrIndicator: Boolean(checked) })
            }
            aria-label="Show pull request indicator in the chat list"
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

function VoiceSettingsSection() {
  // Unlike the rest of this page, the Deepgram key is a *server* setting: the
  // plaintext has to stay on the server so it is never shipped to the browser.
  const voice = usePrimarySettings((settings) => settings.voice);
  const updateSettings = useUpdatePrimarySettings();
  const hasStoredKey = voice.deepgramApiKeyRedacted === true;

  return (
    <SettingsSection title="Voice" icon={<MicIcon className="size-5" />}>
      <SettingsRow
        title="Deepgram API key"
        description="Enables the microphone button in the chat composer, so you can dictate a prompt instead of typing it. Get a key at console.deepgram.com."
        status={
          hasStoredKey
            ? "A key is stored. It stays on this machine, but a browser you hand a --share pairing URL to can read it while dictating."
            : "Dictation is off until a key is set."
        }
        control={
          <DraftInput
            className="w-full sm:w-80"
            value={hasStoredKey ? "" : voice.deepgramApiKey}
            // `deepgramApiKeyRedacted: false` marks this as a fresh plaintext,
            // which is what tells the server to replace the stored secret.
            // Committing an empty value clears it.
            onCommit={(deepgramApiKey) => {
              updateSettings({ voice: { deepgramApiKey, deepgramApiKeyRedacted: false } });
            }}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={hasStoredKey ? "Stored key - enter a new value to replace" : "Paste key"}
            aria-label="Deepgram API key"
          />
        }
      />
      <DictationMicrophoneRow disabled={!hasStoredKey} />
    </SettingsSection>
  );
}

/**
 * Avi Code addition. Dictation used to record from whatever the system called
 * default. With a webcam, a headset, a board array and a virtual mixer all
 * present, that is often not the microphone being spoken into, and the failure
 * is silent: the session connects, transcription answers, and nothing appears.
 */
function DictationMicrophoneRow({ disabled }: { readonly disabled: boolean }) {
  const savedDeviceId = useClientSettings((settings) => settings.aviCodeDictationDeviceId);
  const updateSettings = useUpdateClientSettings();
  const { devices, labelsHidden, refresh } = useAudioInputDevices();
  const selectedDeviceId = resolveSelectedDeviceId({ savedDeviceId, devices });
  const selectedLabel =
    devices.find((device) => device.deviceId === selectedDeviceId)?.label ?? "System default";

  // Device names are withheld until microphone permission is granted, so offer
  // to ask for it rather than showing a list of anonymous entries.
  const revealDeviceNames = () => {
    void navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => {
        for (const track of stream.getTracks()) track.stop();
        refresh();
      })
      .catch(() => {
        // Declining the prompt leaves the list anonymous, which is still usable.
      });
  };

  return (
    <SettingsRow
      title="Microphone"
      description="Which microphone dictation records from. System default follows Windows, which on a machine with a webcam, a headset or a virtual mixer is often not the one you speak into."
      status={
        savedDeviceId.length > 0 && selectedDeviceId === ""
          ? "The microphone you chose is not connected right now, so dictation will use the system default."
          : "The level meter beside the composer's microphone button shows whether the chosen input is actually being heard."
      }
      control={
        labelsHidden ? (
          <Button variant="outline" size="sm" onClick={revealDeviceNames} disabled={disabled}>
            Allow microphone access to list devices
          </Button>
        ) : (
          <Select
            value={selectedDeviceId}
            disabled={disabled}
            onValueChange={(value) => {
              updateSettings({ aviCodeDictationDeviceId: value as string });
            }}
          >
            <SelectTrigger className="w-full sm:w-72" aria-label="Dictation microphone">
              <SelectValue>{selectedLabel}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem hideIndicator value={SYSTEM_DEFAULT_DEVICE_ID}>
                System default
              </SelectItem>
              {devices.map((device) => (
                <SelectItem hideIndicator key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        )
      }
    />
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

type AviCodeSettingsTab = "settings" | "shortcuts";

export function AviCodeSettings() {
  const [tab, setTab] = useState<AviCodeSettingsTab>("settings");
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
      {/*
       * Avi Code addition. Two views on one page: the fork's settings, and a
       * read-only shortcut reference. The reference is deliberately not a
       * sidebar entry — upstream owns that nav list, and the Keybindings page
       * already sits there as the editor.
       */}
      <ToggleGroup
        className="self-start"
        variant="outline"
        size="xs"
        value={[tab]}
        onValueChange={(value) => {
          const next = value[0];
          if (next === "settings" || next === "shortcuts") setTab(next);
        }}
      >
        <ToggleGroupItem value="settings">Settings</ToggleGroupItem>
        <ToggleGroupItem value="shortcuts">Shortcuts</ToggleGroupItem>
      </ToggleGroup>

      {tab === "shortcuts" ? <AviCodeShortcutsPanel /> : null}

      {tab !== "settings" ? null : (
        <>
          <ColorThemeSettings />
          <NewChatSettings />
          <CommunicationStyleSettings />
          <ChatLayoutSettings />
          <SidebarLayoutSettings />
          <NotificationSettings />
          <TimeLoggingSettings />
          <ChatListSettings />
          <ProjectIsolationSettings />

          <VoiceSettingsSection />

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
        </>
      )}
    </SettingsPageContainer>
  );
}
