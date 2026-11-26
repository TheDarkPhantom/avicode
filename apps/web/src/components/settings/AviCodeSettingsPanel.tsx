import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { Link } from "@tanstack/react-router";
import { T, useGT } from "gt-react";

import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import { Switch } from "../ui/switch";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";

const DEFAULT_SHOW_NAMES = DEFAULT_CLIENT_SETTINGS.aviCodeWindowTitleShowNames;
const DEFAULT_START_IN_PLAN_MODE = DEFAULT_CLIENT_SETTINGS.aviCodeNewThreadsStartInPlanMode;

function StartInPlanModeRow() {
  const setting = useSearchableSetting();
  const gt = useGT();
  const startInPlanMode = useClientSettings(
    (settings) => settings.aviCodeNewThreadsStartInPlanMode,
  );
  return (
    <SettingsRow
      {...setting("avicode-start-in-plan-mode")}
      devicePreference
      description={gt(
        "New chats open in plan mode instead of copying the mode of the chat you are in. You can still switch any chat to Build.",
      )}
      resetAction={
        startInPlanMode !== DEFAULT_START_IN_PLAN_MODE ? (
          <SettingResetButton
            ariaLabel={gt("Reset start new chats in plan mode to default")}
            onClick={() =>
              void updateClientSettings({
                aviCodeNewThreadsStartInPlanMode: DEFAULT_START_IN_PLAN_MODE,
              })
            }
          />
        ) : null
      }
      control={
        <Switch
          checked={startInPlanMode}
          onCheckedChange={(checked) =>
            void updateClientSettings({ aviCodeNewThreadsStartInPlanMode: Boolean(checked) })
          }
          aria-label={gt("Start new chats in plan mode")}
        />
      }
    />
  );
}

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

export function AviCodeSettingsPanel() {
  const gt = useGT();
  return (
    <SettingsPageContainer>
      <SettingsSection id="avicode-chats" title={gt("Chats")}>
        <StartInPlanModeRow />
      </SettingsSection>
      <SettingsSection id="avicode-privacy" title={gt("Privacy")}>
        <WindowTitleNamesRow />
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
