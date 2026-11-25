import { Link, createFileRoute } from "@tanstack/react-router";
import { guideContent } from "@/features/exceptions/guide-content";

type View = keyof typeof guideContent;
const sections: Record<View, string> = { detailed: "Detailed guide", simple: "Simple version", roles: "Roles & permissions" };

export const Route = createFileRoute("/_workspace/guide")({
  validateSearch: (search: Record<string, unknown>): { view?: View } =>
    typeof search.view === "string" && Object.hasOwn(sections, search.view) ? { view: search.view as View } : {},
  component: GuideRoute,
  head: () => ({ meta: [{ title: "Assessment guide · SPDA Supply" }] }),
});

function GuideRoute() {
  const view = Route.useSearch().view ?? "detailed";
  return <>
    <nav className="spda-status-nav" aria-label="Guide pages">
      {Object.entries(sections).map(([value, label]) => <Link to="/guide" search={{ view: value as View }} key={value}
        aria-current={view === value ? "page" : undefined}>{label}</Link>)}
    </nav>
    <article className="spda-guide" dangerouslySetInnerHTML={{ __html: guideContent[view] }} />
    <details className="spda-panel">
      <summary>Prototype design choices and what to measure</summary>
      <p>AP can route work, request evidence, and add notes in batches. Approval decisions and bank verification stay on each case.</p>
      <p>Compare time to assign, repeated evidence requests, and how often AP changes a suggested assignee. Track these alongside resolution time and duplicate payments.</p>
    </details>
    <p className="spda-muted spda-guide-footer">The demo uses the brief’s seven example invoices. Dates, workloads, and non-USD approval bands are illustrative. AI suggestions and document checks use local rules. The assessment requires you to build the submitted Figma prototype screen by hand without AI.</p>
  </>;
}
