import { createFileRoute } from "@tanstack/react-router";
import { EvidenceScreen } from "@/features/exceptions/evidence";

export const Route = createFileRoute("/evidence/$requestId")({
  component: EvidenceRoute,
  head: () => ({ meta: [{ title: "Upload evidence · SPDA Supply" }] }),
});

function EvidenceRoute() {
  const { requestId } = Route.useParams();
  return <EvidenceScreen key={requestId} requestId={requestId} />;
}
