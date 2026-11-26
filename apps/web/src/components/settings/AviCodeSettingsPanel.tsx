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
