import { Link } from "@tanstack/react-router";
import { T, useGT } from "gt-react";

import { SettingsRow } from "../settings/settingsLayout";
import { Button } from "../ui/button";

export function ChangelogSettingsRow() {
  const gt = useGT();
  return (
    <SettingsRow
      title={gt("Changelog")}
      description={gt("See what changed in each version.")}
      control={
        <Button size="sm" variant="outline" render={<Link to="/changelog" />}>
          <T context="verb, opens a page">Open</T>
        </Button>
      }
    />
  );
}
