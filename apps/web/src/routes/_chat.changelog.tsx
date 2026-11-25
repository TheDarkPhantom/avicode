import { createFileRoute } from "@tanstack/react-router";

import { ChangelogPage } from "../components/changelog/ChangelogPage";

export const Route = createFileRoute("/_chat/changelog")({
  component: ChangelogPage,
});
