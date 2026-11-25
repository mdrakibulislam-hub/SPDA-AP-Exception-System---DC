import { createFileRoute } from "@tanstack/react-router";
import { CaseScreen } from "@/features/exceptions/case";
import { useWorkspace } from "@/features/exceptions/workspace";

export const Route = createFileRoute("/_workspace/exceptions/$invoiceId")({
  validateSearch: (search: Record<string, unknown>): { reassign?: boolean } =>
    search.reassign === true ? { reassign: true } : {},
  component: CaseRoute,
  head: () => ({ meta: [{ title: "Invoice details · SPDA Supply" }] }),
});

function CaseRoute() {
  const { invoiceId } = Route.useParams();
  const { reassign } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { role } = useWorkspace();
  return <CaseScreen key={`${role}-${invoiceId}`} invoiceId={invoiceId} reassign={reassign}
    closeReassignment={() => { void navigate({ search: {}, replace: true }); }} />;
}
