import { createFileRoute } from "@tanstack/react-router";
import { OverviewScreen } from "@/features/exceptions/overview";

export const Route = createFileRoute("/_workspace/overview")({
  component: OverviewScreen,
  head: () => ({ meta: [{ title: "AI overview · SPDA Supply" }] }),
});
