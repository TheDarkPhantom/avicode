import { DEFAULT_AVICODE_ARCHIVE_SETTLED_AFTER_DAYS } from "@t3tools/contracts";
import { useGT } from "gt-react";

import { SettingResetButton, SettingsRow } from "../components/settings/settingsLayout";
import { useSearchableSetting } from "../components/settings/settingsSearch";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { usePrimarySettings, useUpdatePrimarySettings } from "../hooks/useSettings";

const PRESET_DAYS = [7, 14, 30, 60, 90];
const OFF = "off";

export function ArchiveSettledThreadsRow() {
  const setting = useSearchableSetting();
  const gt = useGT();
  const days = usePrimarySettings((settings) => settings.aviCodeArchiveSettledAfterDays);
  const updateSettings = useUpdatePrimarySettings();
  const choices =
    days === null || PRESET_DAYS.includes(days) ? PRESET_DAYS : [...PRESET_DAYS, days];
  const label = (value: number | null) =>
    value === null ? gt("Never") : gt("After {days} days", { days: value });
  return (
    <SettingsRow
      {...setting("avicode-archive-settled-threads")}
      serverScoped
      settingKeys={["aviCodeArchiveSettledAfterDays"]}
      description={gt(
        "Settled threads are archived once they stay settled this long. Threads a scheduled task posts into are kept.",
      )}
      resetAction={
        days !== DEFAULT_AVICODE_ARCHIVE_SETTLED_AFTER_DAYS ? (
          <SettingResetButton
            ariaLabel={gt("Reset archive settled threads to default")}
            onClick={() =>
              updateSettings({
                aviCodeArchiveSettledAfterDays: DEFAULT_AVICODE_ARCHIVE_SETTLED_AFTER_DAYS,
              })
            }
          />
        ) : null
      }
      control={
        <Select
          value={days === null ? OFF : String(days)}
          onValueChange={(value) => {
            if (typeof value !== "string") return;
            updateSettings({
              aviCodeArchiveSettledAfterDays: value === OFF ? null : Number(value),
            });
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full sm:w-40"
            aria-label={gt("Archive settled threads")}
          >
            <SelectValue>{label(days)}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {choices.map((value) => (
              <SelectItem key={value} hideIndicator value={String(value)}>
                {label(value)}
              </SelectItem>
            ))}
            <SelectItem hideIndicator value={OFF}>
              {label(null)}
            </SelectItem>
          </SelectPopup>
        </Select>
      }
    />
  );
}
