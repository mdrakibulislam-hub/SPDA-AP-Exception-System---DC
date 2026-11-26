import { createFileRoute } from "@tanstack/react-router";
import { PreferencesScreen } from "@/features/exceptions/preferences";

export const Route = createFileRoute("/_workspace/preferences")({
  component: PreferencesScreen,
  head: () => ({ meta: [{ title: "Preference · SPDA Supply" }] }),
});
