import { createFileRoute } from "@tanstack/react-router";

import { AviCodeSettings } from "../components/settings/AviCodeSettings";

export const Route = createFileRoute("/settings/avicode")({
  component: AviCodeSettings,
});
