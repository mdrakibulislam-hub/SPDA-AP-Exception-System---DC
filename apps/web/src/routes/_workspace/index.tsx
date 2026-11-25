import { createFileRoute } from "@tanstack/react-router";
import { DashboardScreen } from "@/features/exceptions/dashboard";

export const Route = createFileRoute("/_workspace/")({
  component: DashboardScreen,
  head: () => ({ meta: [{ title: "Dashboard · SPDA Supply" }] }),
});
