import { createFileRoute } from "@tanstack/react-router";
import { CaseScreen } from "@/features/exceptions/case";
import { useWorkspace } from "@/features/exceptions/workspace";

export const Route = createFileRoute("/_workspace/exceptions/$invoiceId")({
  component: CaseRoute,
  head: () => ({ meta: [{ title: "Invoice details · SPDA Supply" }] }),
});

function CaseRoute() {
  const { invoiceId } = Route.useParams();
  const { role } = useWorkspace();
  return <CaseScreen key={`${role}-${invoiceId}`} invoiceId={invoiceId} />;
}
