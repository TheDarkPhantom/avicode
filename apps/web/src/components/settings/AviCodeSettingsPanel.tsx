import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { Link } from "@tanstack/react-router";
import { T, useGT, useMessages } from "gt-react";
import { PlayIcon } from "lucide-react";

import {
  AVICODE_NOTIFICATION_SOUND_LABELS,
  type NotificationSoundKind,
} from "../../avicode/notificationSounds";
import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import { playNotificationSound, unlockNotificationAudio } from "../../threadNotifications";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";

const DEFAULT_SHOW_NAMES = DEFAULT_CLIENT_SETTINGS.aviCodeWindowTitleShowNames;

function WindowTitleNamesRow() {
  const setting = useSearchableSetting();
  const gt = useGT();
  const showNames = useClientSettings((settings) => settings.aviCodeWindowTitleShowNames);
  return (
    <SettingsRow
      {...setting("avicode-window-title-names")}
      devicePreference
      description={gt(
        "Time trackers like ALFRED and ActivityWatch read the window title to log what you work on. Off, the title shows only the app name.",
      )}
      resetAction={
        showNames !== DEFAULT_SHOW_NAMES ? (
          <SettingResetButton
            ariaLabel={gt("Reset window title names to default")}
            onClick={() =>
              void updateClientSettings({ aviCodeWindowTitleShowNames: DEFAULT_SHOW_NAMES })
            }
          />
        ) : null
      }
      control={
        <Switch
          checked={showNames}
          onCheckedChange={(checked) =>
            void updateClientSettings({ aviCodeWindowTitleShowNames: Boolean(checked) })
          }
          aria-label={gt("Show repository and thread in the window title")}
        />
      }
    />
  );
}

const SOUND_ROWS = {
  input: { key: "aviCodeNotificationSoundInput", searchId: "avicode-notification-sound-input" },
  completion: {
    key: "aviCodeNotificationSoundCompletion",
    searchId: "avicode-notification-sound-completion",
  },
} as const satisfies Record<NotificationSoundKind, unknown>;

function isNotificationSound(
  value: unknown,
): value is keyof typeof AVICODE_NOTIFICATION_SOUND_LABELS {
  return typeof value === "string" && Object.hasOwn(AVICODE_NOTIFICATION_SOUND_LABELS, value);
}

function NotificationSoundRow({ kind }: { kind: NotificationSoundKind }) {
  const setting = useSearchableSetting();
  const gt = useGT();
  const m = useMessages();
  const { key, searchId } = SOUND_ROWS[kind];
  const sound = useClientSettings((settings) => settings[key]);
  const defaultSound = DEFAULT_CLIENT_SETTINGS[key];
  return (
    <SettingsRow
      {...setting(searchId)}
      devicePreference
      description={
        kind === "input"
          ? gt("Plays when a thread needs input or approval, if notification sound is on.")
          : gt("Plays when a thread finishes, if notification sound is on.")
      }
      resetAction={
        sound !== defaultSound ? (
          <SettingResetButton
            ariaLabel={
              kind === "input"
                ? gt("Reset the needs-you sound to default")
                : gt("Reset the finished sound to default")
            }
            onClick={() => void updateClientSettings({ [key]: defaultSound })}
          />
        ) : null
      }
      control={
        <>
          <Select
            value={sound}
            onValueChange={(value) => {
              if (isNotificationSound(value)) void updateClientSettings({ [key]: value });
            }}
          >
            <SelectTrigger
              size="sm"
              className="w-full sm:w-40"
              aria-label={
                kind === "input"
                  ? gt("Sound when an agent needs you")
                  : gt("Sound when an agent finishes")
              }
            >
              <SelectValue>{m(AVICODE_NOTIFICATION_SOUND_LABELS[sound])}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {Object.entries(AVICODE_NOTIFICATION_SOUND_LABELS).map(([value, label]) => (
                <SelectItem key={value} hideIndicator value={value}>
                  {m(label)}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label={gt("Play sound")}
            // Unlocking on pointerdown gives the audio context time to resume before the click.
            onPointerDown={unlockNotificationAudio}
            onClick={() => {
              unlockNotificationAudio();
              void playNotificationSound(kind, () => true);
            }}
          >
            <PlayIcon className="size-4" />
          </Button>
        </>
      }
    />
  );
}

export function AviCodeSettingsPanel() {
  const gt = useGT();
  return (
    <SettingsPageContainer>
      <SettingsSection id="avicode-privacy" title={gt("Privacy")}>
        <WindowTitleNamesRow />
      </SettingsSection>
      <SettingsSection id="avicode-notification-sounds" title={gt("Notification sounds")}>
        <NotificationSoundRow kind="input" />
        <NotificationSoundRow kind="completion" />
      </SettingsSection>
      <p className="px-3 text-sm text-muted-foreground sm:px-4">
        <T>
          See what changed in each version in the{" "}
          <Link to="/changelog" className="underline underline-offset-2">
            changelog
          </Link>
          .
        </T>
      </p>
    </SettingsPageContainer>
  );
}
