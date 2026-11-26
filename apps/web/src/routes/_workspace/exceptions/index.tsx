import { createFileRoute } from "@tanstack/react-router";
import { statuses, type Status } from "@/features/exceptions/model";
import { QueueScreen } from "@/features/exceptions/queue";
import { useWorkspace } from "@/features/exceptions/workspace";

export const Route = createFileRoute("/_workspace/exceptions/")({
  validateSearch: (search: Record<string, unknown>): { status?: Status; q?: string } => ({
    ...(typeof search.status === "string" && Object.hasOwn(statuses, search.status) ? { status: search.status as Status } : {}),
    ...(typeof search.q === "string" && search.q.trim() ? { q: search.q.trim() } : {}),
  }),
  component: QueueRoute,
  head: () => ({ meta: [{ title: "Exceptions · SPDA Supply" }] }),
});

function QueueRoute() {
  const { status } = Route.useSearch();
  const { role } = useWorkspace();
  const active = status ?? (role === "ap" || role === "supplier" ? "needs" : "assigned");
  return <QueueScreen key={`${role}-${active}`} status={active} />;
}
