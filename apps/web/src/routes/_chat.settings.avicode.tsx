import { createFileRoute } from "@tanstack/react-router";
import { AviCodeSettingsPanel } from "../components/settings/AviCodeSettingsPanel";

export const Route = createFileRoute("/_chat/settings/avicode")({
  component: AviCodeSettingsPanel,
});
